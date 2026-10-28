// Sockets a Durable Object closed itself. A hibernatable socket stays in
// getWebSockets() until its close handshake completes, and when the client's
// network loses the close frame that never happens: production (2026-10-28)
// listed such a queue socket as OPEN a quarter of an hour after the server had
// closed it with `matched`, and paired it with a new player. The flag lives in
// the socket's attachment, which survives hibernation, so a socket the server
// has closed is never paired, messaged or counted as a live connection again.

const CLOSED_FLAG = "closedByServer";

/** Flags the socket as closed by the server, then closes it. Never throws. */
export function closeSocket(ws: WebSocket, code: number, reason: string): void {
  try {
    const attachment: unknown = ws.deserializeAttachment();
    if (attachment && typeof attachment === "object") ws.serializeAttachment({ ...attachment, [CLOSED_FLAG]: true });
  } catch {
    // Not accepted for hibernation, or already gone: nothing to flag.
  }
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

/** Open, and not closed by the server (whatever readyState says). */
export function isLive(ws: WebSocket): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    const attachment: unknown = ws.deserializeAttachment();
    return !(attachment && typeof attachment === "object" && (attachment as Record<string, unknown>)[CLOSED_FLAG] === true);
  } catch {
    return false;
  }
}
