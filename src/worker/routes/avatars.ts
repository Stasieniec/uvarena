// Avatars: PUT /me/avatar (raw JPEG, PNG or WebP, at most
// LIMITS.avatarMaxBytes, checked by magic bytes), DELETE /me/avatar, and
// GET /avatars/:key (public, immutable cache).
//
// R2 key: avatars/<userId>/<random>.<ext>. Public key in the URL:
// <userId>.<random>.<ext>, so a new upload is a new URL and caches never go
// stale.
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { AVATAR_CONTENT_TYPES } from "../../shared/api-schemas";
import { LIMITS } from "../../shared/game/config";
import { user } from "../db/schema";
import { getDb, getUserById } from "../db/queries";
import type { HonoEnv } from "../env";
import { ApiFailure, apiError, currentUser } from "../middleware/http";
import { requireUser } from "../middleware/session";

export const avatarsRoutes = new Hono<HonoEnv>();

type AvatarType = (typeof AVATAR_CONTENT_TYPES)[number];

const EXT: Record<AvatarType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPE_BY_EXT: Record<string, AvatarType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const AVATAR_URL_PREFIX = "/api/avatars/";
const PUBLIC_KEY = /^([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{8,64})\.(jpg|png|webp)$/;

/** Detects the image type from its first bytes; null when it is none of the three. */
export function sniffImageType(bytes: Uint8Array): AvatarType | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

function r2KeyFromPublic(publicKey: string): string | null {
  const m = PUBLIC_KEY.exec(publicKey);
  if (!m) return null;
  return `avatars/${m[1]}/${m[2]}.${m[3]}`;
}

/** The R2 key behind one of our avatar URLs; null for external images (Google) or anything else. */
export function r2KeyFromImageUrl(image: string | null | undefined): string | null {
  if (!image || !image.startsWith(AVATAR_URL_PREFIX)) return null;
  return r2KeyFromPublic(image.slice(AVATAR_URL_PREFIX.length));
}

/** Reads at most `max` bytes of the body; null when it is longer. */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function randomToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function deleteOld(env: HonoEnv["Bindings"], image: string | null): Promise<void> {
  const key = r2KeyFromImageUrl(image);
  if (!key) return;
  try {
    await env.AVATARS.delete(key);
  } catch (err) {
    console.error("avatar: delete failed", key, err);
  }
}

avatarsRoutes.put("/me/avatar", requireUser, async (c) => {
  const me = currentUser(c);
  const declared = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(declared)) {
    return apiError(c, 415, "unsupported_media_type", "Use a JPEG, PNG or WebP image");
  }
  const tooBig = () => apiError(c, 413, "payload_too_large", `The image must be at most ${LIMITS.avatarMaxBytes / 1024} KB`);
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > LIMITS.avatarMaxBytes) return tooBig();

  const bytes = await readCapped(c.req.raw, LIMITS.avatarMaxBytes);
  if (bytes === null) return tooBig();
  if (bytes.byteLength === 0) return apiError(c, 400, "bad_request", "The image is empty");
  const sniffed = sniffImageType(bytes);
  if (sniffed === null || sniffed !== declared) {
    return apiError(c, 415, "unsupported_media_type", "That file is not a JPEG, PNG or WebP image");
  }

  const db = getDb(c.env);
  const row = await getUserById(db, me.id);
  if (!row) throw new ApiFailure(401, "unauthorised", "Sign in first");

  const token = randomToken();
  const ext = EXT[sniffed];
  await c.env.AVATARS.put(`avatars/${me.id}/${token}.${ext}`, bytes, {
    httpMetadata: { contentType: sniffed, cacheControl: "public, max-age=31536000, immutable" },
  });
  const image = `${AVATAR_URL_PREFIX}${me.id}.${token}.${ext}`;
  await db.update(user).set({ image, updatedAt: new Date() }).where(eq(user.id, me.id));
  await deleteOld(c.env, row.image ?? null);
  return c.json({ image });
});

avatarsRoutes.delete("/me/avatar", requireUser, async (c) => {
  const me = currentUser(c);
  const db = getDb(c.env);
  const row = await getUserById(db, me.id);
  if (!row) throw new ApiFailure(401, "unauthorised", "Sign in first");
  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, me.id));
  await deleteOld(c.env, row.image ?? null);
  return c.json({ image: null });
});

avatarsRoutes.get("/avatars/:key", async (c) => {
  const publicKey = c.req.param("key");
  const r2Key = r2KeyFromPublic(publicKey);
  if (!r2Key) return apiError(c, 404, "not_found", "Not found");
  const object = await c.env.AVATARS.get(r2Key);
  if (!object) return apiError(c, 404, "not_found", "Not found");
  const ext = publicKey.slice(publicKey.lastIndexOf(".") + 1);
  const headers = new Headers();
  headers.set("Content-Type", TYPE_BY_EXT[ext] ?? "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'");
  return new Response(object.body, { headers });
});
