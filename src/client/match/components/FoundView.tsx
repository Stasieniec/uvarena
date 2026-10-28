// "Opponent found": the ranked matchup. It shows who you drew (name plate,
// rating, your record against them, their loadout) for a moment before the intro,
// and stays up while the match waits for the opponent to connect, with the
// no-show countdown. No join code, no Ready button: ranked needs neither.

import type { ReactNode } from "react";
import type { PlayerView } from "@shared/protocol";
import { POWERUP_NAMES } from "../copy";
import type { MatchClock } from "../clock";
import { fmtClock, fmtShownRating } from "../format";
import { useNow } from "./hooks";
import { PowerupIcon } from "./icons";

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

function Loadout({ p }: { p: PlayerView }) {
  if (p.loadout.length === 0) return null;
  return (
    <ul className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0 text-[15px] leading-5 font-semibold" aria-label="Their power-ups">
      {p.loadout.map((id) => (
        <li key={id} className="plate flex h-9 items-center gap-1.5 px-2.5">
          <PowerupIcon id={id} size={15} strokeWidth={2} />
          {POWERUP_NAMES[id]}
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-sm leading-5 text-muted">{label}</span>
      <span className="rq-display text-4xl leading-10 font-bold">{children}</span>
    </span>
  );
}

export function FoundView({ opponent, waiting, noShowAt, record, clock, onHome }: Props) {
  const now = useNow(clock, 250, waiting && noShowAt !== null);
  const rating = fmtShownRating(opponent.rating);
  const played = record ? record.wins + record.losses + record.draws : 0;
  const theyAreHere = opponent.connected;

  return (
    <div className="flex flex-1 flex-col pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="flex h-11 flex-none items-center justify-between px-4 text-sm leading-5 text-muted">
        <span>Ranked</span>
        <span>Rated</span>
      </div>
      <main className="flex flex-1 flex-col px-4">
        <span className="flex-1" />
        <span className="rq-land rq-display rq-outline text-[40px] leading-[44px] font-bold tracking-[0.02em] uppercase italic">Opponent found</span>
        <section aria-label="Opponent" className="rq-rise mt-5 flex flex-col items-start" style={{ animationDelay: "180ms" }}>
          <span className="rq-plate-name max-w-full truncate bg-opponent px-4 pt-1 pb-0.5 text-[56px] leading-[60px] tracking-[0.01em] text-bg italic">{opponent.name}</span>
          <div className="mt-5 grid w-full grid-cols-3 gap-3">
            {rating && <Stat label="Rating">{rating}</Stat>}
            {record && played > 0 && (
              <Stat label="You vs them">
                <span className="text-you">{record.wins}</span> <span className="text-muted">{"·"}</span> <span className="text-opponent">{record.losses}</span>
              </Stat>
            )}
            {record && played > 0 && <Stat label="Won">{`${Math.round((record.wins / played) * 100)}%`}</Stat>}
          </div>
          {record && played === 0 && <p className="mt-2 text-[15px] leading-[22px] text-muted">First duel between you two.</p>}
          <Loadout p={opponent} />
        </section>
        <span className="flex-[1.3]" />
        <div className="flex flex-col gap-2">
          {waiting && !theyAreHere ? (
            <>
              <p className="rq-pulse text-sm leading-5">
                Waiting for {opponent.name} to connect
                {noShowAt !== null ? ` · ${fmtClock(noShowAt - now)}` : ""}
              </p>
              <button type="button" onClick={onHome} className="plate press mt-2 h-12 w-full rounded-xs text-base font-semibold">
                Home
              </button>
            </>
          ) : waiting ? (
            <p className="text-sm leading-5 text-muted">Connecting</p>
          ) : (
            <>
              <div className="h-1 overflow-hidden bg-line" aria-hidden>
                <span className="rq-found-drain block h-full origin-left bg-text" />
              </div>
              <p className="text-sm leading-5 text-muted">Match intro in 2 s</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
