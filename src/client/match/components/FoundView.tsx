// "Opponent found": the ranked matchup card. It shows who you drew (avatar,
// name, rating and your record against them) for a moment before the intro,
// and stays up while the match waits for the opponent to connect, with the
// no-show countdown. No join code, no Ready button: ranked needs neither.

import type { PlayerView } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { fmtClock, fmtShownRating } from "../format";
import { Avatar } from "./Avatar";
import { useNow } from "./hooks";

export interface HeadToHead {
  wins: number;
  losses: number;
  draws: number;
}

interface Props {
  you: PlayerView;
  opponent: PlayerView;
  /** True while the match is still in the lobby (someone has not connected yet). */
  waiting: boolean;
  noShowAt: number | null;
  record: HeadToHead | null;
  clock: MatchClock;
  onHome(): void;
}

export function FoundView({ you, opponent, waiting, noShowAt, record, clock, onHome }: Props) {
  const now = useNow(clock, 250, waiting && noShowAt !== null);
  const rating = fmtShownRating(opponent.rating);
  const yours = fmtShownRating(you.rating);
  const played = record ? record.wins + record.losses + record.draws : 0;
  const theyAreHere = opponent.connected;

  return (
    <div className="flex flex-1 flex-col items-center px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),16px)] text-center">
      <div className="self-stretch text-left text-sm leading-5 text-muted">Ranked</div>
      <h1 className="rq-land rq-display mt-8 text-[56px] leading-[56px] font-bold uppercase italic">Opponent found</h1>

      <div className="rq-rise mt-10 flex flex-col items-center gap-3" style={{ animationDelay: "180ms" }}>
        <div className="relative">
          <Avatar name={opponent.name} url={opponent.avatarUrl} userId={opponent.userId} size={112} ring="var(--color-opponent)" bot={opponent.kind === "bot"} />
        </div>
        <div>
          <div className="rq-plate-name inline-block max-w-[18rem] truncate bg-opponent px-3 pt-1 pb-0.5 text-[32px] leading-9 text-bg italic">{opponent.name}</div>
          {rating && <div className="rq-display mt-2 text-4xl leading-10 font-bold">{rating}</div>}
        </div>
        {played > 0 && record ? (
          <div className="plate mt-1 flex items-center gap-3 px-4 py-1.5 text-sm">
            <span className="text-muted">You</span>
            <span className="rq-display text-2xl font-bold">
              <span className="text-you">{record.wins}</span>
              <span className="mx-1.5 text-muted">{"·"}</span>
              <span className="text-opponent">{record.losses}</span>
            </span>
            <span className="max-w-28 truncate text-muted">{opponent.name}</span>
          </div>
        ) : record ? (
          <div className="mt-1 text-sm text-muted">First duel between you two.</div>
        ) : null}
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-2 pt-6">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Avatar name={you.name} url={you.avatarUrl} userId={you.userId} size={28} ring="var(--color-you)" />
          <span className="font-semibold text-you">{you.name}</span>
          {yours && <span className="tabular-nums">{yours}</span>}
        </div>
        {waiting && !theyAreHere ? (
          <p className="rq-pulse mt-2 text-sm">
            Waiting for {opponent.name} to connect
            {noShowAt !== null ? ` · ${fmtClock(noShowAt - now)}` : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">{waiting ? "Connecting" : "Starting"}</p>
        )}
        {waiting && (
          <button type="button" onClick={onHome} className="plate press mt-2 h-12 rounded-xs px-8 text-base font-semibold">
            Home
          </button>
        )}
      </div>
    </div>
  );
}
