// /match/:id: lobby, duel and end screen of a live match, over the
// reconnecting WebSocket. The server is authoritative; this screen renders
// what it sends and passes taps back.

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BotsResponse } from "@shared/api-schemas";
import { apiRequest, errorMessage } from "../lib/api";
import { formatRating } from "../lib/format";
import { lobbyCreatedAt } from "../lib/lobby";
import { qk, useCourses, useMe } from "../lib/queries";
import { createSocketTransport, matchSocketUrl } from "./browser";
import { ClockSync } from "./clock";
import { MatchView, type MatchExtras, type MatchNav } from "./MatchView";
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
  const qc = useQueryClient();
  const clock = useMemo(() => new ClockSync(), []);
  const createTransport = useCallback(() => createSocketTransport(matchSocketUrl(matchId)), [matchId]);
  const { state, actions } = useMatchController(createTransport, {
    onServerMessage: (msg, receivedAt) => clock.sample(msg.serverNow, receivedAt),
  });

  // The ladder as it stood before this match (cached by the bot ladder screen), read once.
  const [ladderBefore, setLadderBefore] = useState<MatchExtras["ladderBefore"] | undefined>(undefined);
  if (ladderBefore === undefined && state.courseId) {
    const cached = qc.getQueryData<BotsResponse>(qk.bots(state.courseId));
    setLadderBefore(cached ? cached.ladder.map((b) => ({ level: b.level, unlocked: b.unlocked })) : null);
  }

  // Your record against a human opponent, for the ranked "Opponent found" card.
  const opponentName = state.opponent?.kind === "human" && state.mode === "ranked" ? state.opponent.name : null;
  const profile = useQuery({
    queryKey: qk.user(opponentName ?? ""),
    queryFn: ({ signal }) => apiRequest("user", { params: { username: opponentName! }, signal }),
    enabled: opponentName !== null,
    retry: false,
  });

  // Private lobby: your friend's full name and ranked rating (the lobby frame carries names only).
  const inLobby = state.mode === "private" && state.phase === "lobby";
  const friendName = inLobby ? (state.lobby?.players.find((p) => p.name !== state.you?.name)?.name ?? null) : null;
  const friend = useQuery({
    queryKey: qk.user(friendName ?? ""),
    queryFn: ({ signal }) => apiRequest("user", { params: { username: friendName! }, signal }),
    enabled: friendName !== null,
    retry: false,
  });
  const me = useMe();
  const lobbyPeople = useMemo(() => {
    const people: NonNullable<MatchExtras["lobbyPeople"]> = {};
    const u = me.data?.user;
    if (u && state.you) people[state.you.name] = { fullName: `${u.firstName} ${u.lastName}`.trim() || null, rating: null };
    const f = friend.data;
    if (friendName && f) {
      const ranked = f.courses.find((c) => c.courseId === state.courseId)?.ranked;
      people[friendName] = {
        fullName: `${f.user.firstName} ${f.user.lastName}`.trim() || null,
        rating: ranked ? formatRating(ranked.rating, ranked.provisional) : null,
      };
    }
    return people;
  }, [me.data, friend.data, friendName, state.you, state.courseId]);

  const fight = useMutation({
    mutationFn: (v: { level: number; courseId: string }) => apiRequest("createBotMatch", { body: { courseId: v.courseId, bot: v.level, lectures: null } }),
    onSuccess: ({ matchId: next }) => {
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: ["bots"] });
      navigate(`/match/${encodeURIComponent(next)}`, { replace: true });
    },
  });

  const nav = useMemo<MatchNav>(
    () => ({
      home: () => navigate("/"),
      playAgain: (courseId) => navigate(withCourse("/queue", courseId)),
      missed: (courseId) => navigate(withCourse("/missed", courseId)),
      match: (id) => navigate(`/match/${encodeURIComponent(id)}`, { replace: true }),
      fightBot: (level, courseId) => {
        if (courseId) fight.mutate({ level, courseId });
      },
    }),
    // fight.mutate is stable.
    [navigate, fight.mutate],
  );

  const courses = useCourses();
  const courseTitle = courses.data?.courses.find((c) => c.id === state.courseId)?.shortTitle ?? null;

  const extras: MatchExtras = {
    record: profile.data?.headToHead ?? null,
    ladderBefore: ladderBefore ?? null,
    fightPending: fight.isPending,
    fightError: fight.error ? errorMessage(fight.error) : null,
    courseTitle,
    lobbyPeople,
    lobbyCreatedAt: inLobby ? lobbyCreatedAt(matchId) : null,
  };
  return <MatchView state={state} actions={actions} clock={clock} nav={nav} extras={extras} />;
}
