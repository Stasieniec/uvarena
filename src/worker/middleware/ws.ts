// WebSocket upgrade helpers for the match and queue sockets.
import type { Context } from "hono";
import { NET } from "../../shared/game/config";
import { HEADERS } from "../do/contracts";
import type { HonoEnv } from "../env";
import { apiError } from "./http";
import { isAllowedOrigin } from "./origin";

export function isUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

/** Keeps a close reason under NET.closeReasonMaxBytes (ASCII reasons only). */
function shortReason(reason: string): string {
  return reason.slice(0, NET.closeReasonMaxBytes);
}

/**
 * Accepts the upgrade only to send one optional frame and close it with a
 * code. A refused socket gets a final close code (4003, 4004, 1000) instead
 * of a failed handshake, which the client would retry forever.
 */
export function refuseSocket(code: number, reason: string, frame?: unknown): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  if (frame !== undefined) server.send(JSON.stringify(frame));
  server.close(code, shortReason(reason));
  return new Response(null, { status: 101, webSocket: client });
}

/**
 * Checks shared by both socket routes: an upgrade request (426 otherwise) and
 * an allowed Origin (403 otherwise). Returns a response to send, or null.
 */
export function socketPrecheck(c: Context<HonoEnv>): Response | null {
  if (!isUpgrade(c.req.raw)) return apiError(c, 426, "bad_request", "Expected a WebSocket upgrade");
  if (!isAllowedOrigin(c.req.raw, c.env)) return apiError(c, 403, "forbidden", "Origin not allowed");
  return null;
}

/**
 * The upgrade request to forward to a Durable Object: the client's headers
 * minus anything that looks like ours (a client must never set x-user-id),
 * plus the values the Worker vouches for.
 */
export function forwardedRequest(request: Request, set: Record<string, string>): Request {
  const headers = new Headers(request.headers);
  for (const name of Object.values(HEADERS)) headers.delete(name);
  for (const [name, value] of Object.entries(set)) headers.set(name, value);
  return new Request(request.url, { method: "GET", headers });
}
