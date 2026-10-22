// What the match screen talks to: the real WebSocket (live matches) or the
// scripted local server (the /dev/match preview). Both deliver protocol
// ServerMessages and take ClientMessages.

import type { ClientMessage, ServerMessage } from "@shared/protocol";
import type { ConnectionStatus } from "./state";

export interface TransportListener {
  onMessage(msg: ServerMessage, receivedAt: number): void;
  onStatus(status: ConnectionStatus): void;
}

export interface MatchTransport {
  start(listener: TransportListener): void;
  /** Returns false when the message could not go out (socket down). */
  send(msg: ClientMessage): boolean;
  /** Reconnect now, also after "Playing on another device". */
  reconnectNow(): void;
  stop(): void;
}
