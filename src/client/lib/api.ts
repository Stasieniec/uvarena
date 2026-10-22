// Typed fetch helpers built from `endpoints` in src/shared/api-schemas.ts.
// Every response is validated with its schema; non-2xx responses carry
// ApiErrorSchema and become an ApiRequestError.
import {
  ApiErrorSchema,
  AvatarResponseSchema,
  endpoints,
  type ApiError,
  type ApiErrorCode,
  type EndpointBody,
  type EndpointName,
  type EndpointQuery,
  type EndpointResponse,
} from "@shared/api-schemas";
import type { z } from "zod";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError | null;

  constructor(status: number, body: ApiError | null, message?: string) {
    super(message ?? body?.error.message ?? `HTTP ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }

  get code(): ApiErrorCode | null {
    return this.body?.error.code ?? null;
  }
}

export interface RequestArgs<N extends EndpointName> {
  /** Values for :params in the path. */
  params?: Record<string, string>;
  query?: EndpointQuery<N>;
  body?: EndpointBody<N>;
  signal?: AbortSignal;
}

/** Fills :params in a Hono-style path. Throws when one is missing. */
export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z_]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter: ${name}`);
    return encodeURIComponent(value);
  });
}

/** Query string from a flat object; undefined and null values are left out. */
export function buildQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

async function readError(res: Response): Promise<ApiError | null> {
  try {
    const parsed = ApiErrorSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: "same-origin", ...init });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError(0, null, "Could not reach the server. Check your connection.");
  }
}

async function parseResponse<T>(res: Response, schema: z.ZodType<T> | null): Promise<T> {
  if (!res.ok) throw new ApiRequestError(res.status, await readError(res));
  if (schema === null) return undefined as T;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError(res.status, null, "The server sent something unreadable.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error("Response did not match its schema", url(res), parsed.error.issues);
    throw new ApiRequestError(res.status, null, "The server sent something unexpected.");
  }
  return parsed.data;
}

function url(res: Response): string {
  return res.url || "(unknown url)";
}

/** Calls an endpoint by name, validates the response with its schema, throws ApiRequestError on failure. */
export async function apiRequest<N extends EndpointName>(name: N, args?: RequestArgs<N>): Promise<EndpointResponse<N>> {
  const def = endpoints[name];
  const target = buildPath(def.path, args?.params) + buildQuery(args?.query as Record<string, unknown> | undefined);
  const init: RequestInit = { method: def.method, signal: args?.signal };
  if (args?.body !== undefined) {
    init.body = JSON.stringify(args.body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await send(target, init);
  return parseResponse(res, def.response as z.ZodType<EndpointResponse<N>> | null);
}

/** PUT /api/me/avatar with raw image bytes. */
export async function uploadAvatar(image: Blob): Promise<z.infer<typeof AvatarResponseSchema>> {
  const res = await send(endpoints.putAvatar.path, {
    method: "PUT",
    body: image,
    headers: { "content-type": image.type },
  });
  return parseResponse(res, AvatarResponseSchema);
}

/** A short, readable message for any error a query or mutation can throw. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case "unauthorised":
        return "You are signed out. Log in again.";
      case "rate_limited":
        return "Slow down. Try again in a minute.";
      case "already_in_match":
        return "You are already in a match.";
      case "username_taken":
        return "That username is taken.";
      case "bot_locked":
        return "Beat the bot before this one first.";
      case "no_questions":
        return "Not enough questions for that selection yet.";
      case "lobby_full":
        return "That lobby already has two players.";
      case "lobby_expired":
        return "That code has expired. Ask for a new one.";
      case "not_a_lobby":
        return "That match is not open to join.";
      case "not_found":
        return err.message && err.message !== "Not found" ? err.message : "Not found.";
      case "payload_too_large":
        return "That file is too large.";
      case "unsupported_media_type":
        return "Use a JPEG, PNG or WebP image.";
      default:
        return err.message || "Something went wrong.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}

export function isUnauthorised(err: unknown): boolean {
  return err instanceof ApiRequestError && err.status === 401;
}
