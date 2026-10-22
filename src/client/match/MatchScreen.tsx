// /match/:id: lobby, duel and end screen of a live match, over the
// reconnecting WebSocket. The server is authoritative; this screen renders
// what it sends and passes taps back.

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { createSocketTransport, matchSocketUrl } from "./browser";
import { ClockSync } from "./clock";
import { MatchView, type MatchNav } from "./MatchView";
import { useMatchController } from "./useMatch";

export interface MatchScreenProps {
  matchId: string;
}

export function MatchScreen({ matchId }: MatchScreenProps) {
  // A new match id (a rematch) starts a fresh connection and state.
  return <LiveMatch key={matchId} matchId={matchId} />;
}

/** Default export too, so the router can React.lazy() the match screen out of the main bundle. */
export default MatchScreen;

function withCourse(path: string, courseId: string | null): string {
  return courseId ? `${path}?course=${encodeURIComponent(courseId)}` : path;
}

function LiveMatch({ matchId }: MatchScreenProps) {
  const navigate = useNavigate();
  const clock = useMemo(() => new ClockSync(), []);
  const createTransport = useCallback(() => createSocketTransport(matchSocketUrl(matchId)), [matchId]);
  const { state, actions } = useMatchController(createTransport, {
    onServerMessage: (msg, receivedAt) => clock.sample(msg.serverNow, receivedAt),
  });
  const nav = useMemo<MatchNav>(
    () => ({
      home: () => navigate("/"),
      playAgain: (courseId) => navigate(withCourse("/queue", courseId)),
      missed: (courseId) => navigate(withCourse("/missed", courseId)),
      match: (id) => navigate(`/match/${encodeURIComponent(id)}`, { replace: true }),
    }),
    [navigate],
  );
  return <MatchView state={state} actions={actions} clock={clock} nav={nav} />;
}
