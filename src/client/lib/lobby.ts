// Private lobby helpers. Pure, unit tested.

export function joinUrl(code: string, origin: string): string {
  return `${origin}/join/${code}`;
}

/** Rated only with standard settings (design.md, private matches). */
export function effectiveRated(wantRated: boolean, lectures: string[] | null, powerups: boolean): boolean {
  return wantRated && lectures === null && powerups;
}

const CREATED_KEY = "lobby-created:";

/** Remembers when this device created a lobby, for the "expires in" line. */
export function rememberLobbyCreated(matchId: string, at: number = Date.now()): void {
  try {
    sessionStorage.setItem(CREATED_KEY + matchId, String(at));
  } catch {
    // Storage blocked: the lobby says how long a code lasts instead.
  }
}

/** When this device created the lobby, or null when it did not (or cannot tell). */
export function lobbyCreatedAt(matchId: string): number | null {
  try {
    const v = Number(sessionStorage.getItem(CREATED_KEY + matchId));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
