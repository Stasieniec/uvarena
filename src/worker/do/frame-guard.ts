// Per-socket bounds on what a client may send to a Durable Object: frame size
// and frame rate. Counters live in memory, so a hibernated DO starts them
// again; that is fine for a cheap flood guard. Every frame a MatchRoom
// handles is a storage write, so a flood would otherwise be billed as writes.
import { NET } from "../../shared/game/config";
import { CLOSE_CODES } from "../../shared/protocol";

export interface FrameRefusal {
  code: number;
  reason: string;
}

function frameBytes(message: string | ArrayBuffer): number {
  if (typeof message !== "string") return message.byteLength;
  // UTF-8 is at most 3 bytes per UTF-16 unit; only encode when it could matter.
  if (message.length * 3 <= NET.maxClientFrameBytes) return message.length;
  return new TextEncoder().encode(message).byteLength;
}

export class FrameGuard {
  private readonly windows = new WeakMap<WebSocket, { start: number; count: number }>();

  /** Null when the frame may be handled; otherwise close the socket with this. */
  check(ws: WebSocket, message: string | ArrayBuffer, now: number): FrameRefusal | null {
    if (frameBytes(message) > NET.maxClientFrameBytes) return { code: CLOSE_CODES.tooBig, reason: "message too big" };
    const w = this.windows.get(ws);
    if (!w || now - w.start >= NET.clientFrameWindowMs) {
      this.windows.set(ws, { start: now, count: 1 });
      return null;
    }
    w.count += 1;
    if (w.count > NET.clientFrameBurst) return { code: CLOSE_CODES.tooMany, reason: "too many messages" };
    return null;
  }
}
