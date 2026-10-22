// STUB (Durable Objects package). One per course: the ranked queue.
import { DurableObject } from "cloudflare:workers";
import { notImplemented } from "../../shared/not-implemented";
import { PING, PONG } from "../../shared/protocol";
import type { Env } from "../env";
import type { MatchmakerRpc } from "./contracts";

export class Matchmaker extends DurableObject<Env> implements MatchmakerRpc {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  async searching(): Promise<number> {
    return notImplemented("Matchmaker.searching");
  }

  /** Accepts the queue WebSocket forwarded by the Worker with HEADERS.userId, rating, rd. */
  override async fetch(request: Request): Promise<Response> {
    void request;
    return new Response("not implemented", { status: 501 });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    void ws; void message;
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void ws; void code; void reason; void wasClean;
  }

  override async alarm(): Promise<void> {
    notImplemented("Matchmaker.alarm");
  }
}
