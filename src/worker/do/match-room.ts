// STUB (Durable Objects package). One per match: the shell around the engine.
//
// What already works, so the scaffold's DO smoke test can open a socket:
// fetch() accepts a WebSocket upgrade carrying HEADERS.userId, tags the socket
// with the user id, and the runtime answers "ping" with "pong". Everything
// else throws until the Durable Objects package implements it.
import { DurableObject } from "cloudflare:workers";
import type { CancelReason, MatchInit, PlayerInit, QuestionFull } from "../../shared/game/types";
import { notImplemented } from "../../shared/not-implemented";
import { CLOSE_CODES, PING, PONG } from "../../shared/protocol";
import type { Env } from "../env";
import { HEADERS, type JoinResult, type MatchRoomRpc, type MatchRoomSummary, type MatchSocketAttachment } from "./contracts";

export class MatchRoom extends DurableObject<Env> implements MatchRoomRpc {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  async init(init: MatchInit): Promise<void> {
    void init;
    notImplemented("MatchRoom.init");
  }

  async join(player: PlayerInit, questions: QuestionFull[]): Promise<JoinResult> {
    void player; void questions;
    return notImplemented("MatchRoom.join");
  }

  async cancel(reason: CancelReason): Promise<void> {
    void reason;
    notImplemented("MatchRoom.cancel");
  }

  async summary(): Promise<MatchRoomSummary> {
    return notImplemented("MatchRoom.summary");
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const userId = request.headers.get(HEADERS.userId);
    const { 0: client, 1: server } = new WebSocketPair();
    if (!userId) {
      server.accept();
      server.close(CLOSE_CODES.notAuthorised, "not a player");
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server, [userId]);
    const attachment: MatchSocketAttachment = { userId };
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    void ws; void message;
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void ws; void code; void reason; void wasClean;
  }

  override async alarm(): Promise<void> {
    notImplemented("MatchRoom.alarm");
  }
}
