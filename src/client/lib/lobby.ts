// Private lobby helpers. Pure, unit tested.

export function joinUrl(code: string, origin: string): string {
  return `${origin}/join/${code}`;
}

/** Rated only with standard settings (design.md, private matches). */
export function effectiveRated(wantRated: boolean, lectures: string[] | null, powerups: boolean): boolean {
  return wantRated && lectures === null && powerups;
}
