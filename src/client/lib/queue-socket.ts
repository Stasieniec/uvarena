// STUB (Client app package). The ranked queue WebSocket (/api/queue/ws?course=).
import type { QueueServerMessage } from "@shared/protocol";
import { notImplemented } from "@shared/not-implemented";

export interface QueueSocketHandlers {
  onMessage(msg: QueueServerMessage): void;
  /** The socket closed and will not reconnect (matched, error, or left). */
  onClose(code: number): void;
}

export interface QueueSocket {
  /** Leaves the queue. */
  close(): void;
}

export function openQueueSocket(courseId: string, handlers: QueueSocketHandlers): QueueSocket {
  void courseId; void handlers;
  return notImplemented("client.openQueueSocket");
}
