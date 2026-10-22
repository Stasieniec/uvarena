// STUB (Match screen package). Lobby, duel and end screen for /match/:id.
export interface MatchScreenProps {
  matchId: string;
}

export function MatchScreen({ matchId }: MatchScreenProps) {
  return <p className="p-6 text-muted">Match {matchId}: the match screen is not built yet.</p>;
}
