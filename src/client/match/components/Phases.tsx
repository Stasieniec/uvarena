// The round callout of the arming phase and the versus intro.

import { useRef, type CSSProperties } from "react";
import type { BlindPowerupId, MatchMode } from "@shared/game/types";
import type { PlayerView } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { LINES, POWERUP_HINTS, POWERUP_NAMES } from "../copy";
import { fmtMultiplier, fmtShownRating } from "../format";
import { useFrame } from "./hooks";
import { PowerupIcon } from "./icons";

export function modeLabel(mode: MatchMode | null): string {
  if (mode === "bot") return "Bot match";
  if (mode === "private") return "Private";
  return "Ranked";
}

/** A 4 px line that drains from the time left until `end`, out of `total`. */
export function DrainBar({ clock, end, total, className = "" }: { clock: MatchClock; end: number; total: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(clock, true, (now) => {
    const frac = Math.max(0, Math.min(1, (end - now) / Math.max(1, total)));
    if (ref.current) ref.current.style.transform = `scaleX(${frac})`;
  });
  return (
    <div className={`h-1 overflow-hidden bg-line ${className}`} aria-hidden>
      <div ref={ref} className="h-full origin-left bg-text" style={{ transform: "scaleX(1)" }} />
    </div>
  );
}

/** Arming: the round lands in the event lane with the multiplier beside it, then what to do with your power-ups. */
export function ArmingCallout({
  round,
  multiplier,
  suddenDeath,
  armable,
  armed,
  opponentName,
  clock,
  endsAt,
  totalMs,
}: {
  round: number;
  multiplier: number;
  suddenDeath: boolean;
  armable: BlindPowerupId[];
  armed: BlindPowerupId | null;
  opponentName: string;
  clock: MatchClock;
  endsAt: number | null;
  totalMs: number;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-4 text-center" aria-live="polite">
      <div key={round} className="rq-round flex items-center gap-3.5">
        <span className={`rq-display font-bold tracking-[0.01em] whitespace-nowrap uppercase italic ${suddenDeath ? "text-[min(56px,13vw)] leading-none" : "text-[min(80px,18vw)] leading-none"}`}>
          {suddenDeath ? "Sudden death" : `Round ${round}`}
        </span>
        {multiplier > 1 && (
          <span className="rq-display bg-gold px-3 pt-0.5 text-[min(48px,11vw)] leading-[1.25] font-bold text-bg italic" aria-label={`Damage ${fmtMultiplier(multiplier)}`}>
            {fmtMultiplier(multiplier)}
          </span>
        )}
      </div>
      {endsAt !== null && <DrainBar clock={clock} end={endsAt} total={totalMs} className="mt-4 w-[200px]" />}
      <div className="mt-3 flex min-h-11 flex-col">
        {armed ? (
          <>
            <span className="text-base leading-[22px] font-semibold">{POWERUP_NAMES[armed]} armed.</span>
            <span className="text-[15px] leading-[21px] text-muted">{POWERUP_HINTS[armed]}</span>
          </>
        ) : armable.length > 0 ? (
          <>
            <span className="text-base leading-[22px] font-semibold">{LINES.armHint}</span>
            <span className="text-[15px] leading-[21px] text-muted">{`${opponentName} ${LINES.armHintSub}`}</span>
          </>
        ) : (
          <span className="text-[15px] leading-[21px] text-muted">{LINES.armNothing}</span>
        )}
      </div>
    </section>
  );
}

/** The bar on the versus screen: full, with a tick every 1,000. */
function FullBar({ color }: { color: string }) {
  return (
    <div className="relative h-2 w-60 max-w-full" style={{ background: color }} aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="absolute inset-y-0 w-0.5 bg-bg" style={{ left: `calc(${(i / 6) * 100}% - 1px)` }} />
      ))}
    </div>
  );
}

function nameSize(name: string): string {
  if (name.length <= 10) return "text-[44px] leading-[48px]";
  if (name.length <= 16) return "text-[34px] leading-[38px]";
  return "text-[26px] leading-[30px]";
}

function NamePlate({ name, side }: { name: string; side: "you" | "opponent" }) {
  return (
    <span
      className={`rq-display max-w-full px-4 pt-1 pb-0.5 font-bold tracking-[0.01em] break-words text-bg uppercase italic ${nameSize(name)} ${side === "you" ? "bg-you" : "bg-opponent text-right"}`}
    >
      {name}
    </span>
  );
}

function Loadout({ p, delay }: { p: PlayerView; delay: number }) {
  if (p.loadout.length === 0) return null;
  return (
    <ul className="rq-rise m-0 flex list-none flex-wrap gap-2 p-0 text-[15px] leading-5 font-semibold" style={{ animationDelay: `${delay}ms` }} aria-label="Power-ups">
      {p.loadout.map((id) => (
        <li key={id} className="plate flex h-9 items-center gap-1.5 px-2.5" title={POWERUP_HINTS[id]}>
          <PowerupIcon id={id} size={15} strokeWidth={2} />
          {POWERUP_NAMES[id]}
        </li>
      ))}
    </ul>
  );
}

/** Versus intro: the screen split on a diagonal, them on the red half at the top, you on the teal half below, VS on the seam. */
export function IntroView({
  you,
  opponent,
  mode,
  rated,
  course,
}: {
  you: PlayerView;
  opponent: PlayerView;
  mode: MatchMode | null;
  rated: boolean;
  /** The course title, when known. */
  course: string | null;
}) {
  const theirRating = fmtShownRating(opponent.rating);
  const yourRating = fmtShownRating(you.rating);
  // The halves slide in (300 ms), VS lands (180 ms), a 90 ms freeze, then the loadouts.
  const loadoutDelay = 300 + 180 + 90;
  return (
    <div className="relative flex-1 overflow-hidden" role="group" aria-label={`${you.name} against ${opponent.name}`}>
      <svg className="rq-half-top absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M0 0H100V44.1L0 56.4Z" fill="var(--color-opponent)" fillOpacity="0.2" />
      </svg>
      <svg className="rq-half-bottom absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M0 56.4 100 44.1V100H0Z" fill="var(--color-you)" fillOpacity="0.2" />
      </svg>

      <div className="absolute inset-x-4 top-[max(env(safe-area-inset-top),20px)] flex justify-between gap-4 text-sm leading-5">
        <span className="truncate">
          {modeLabel(mode)}
          {course ? ` · ${course}` : ""}
        </span>
        <span className="shrink-0">{mode === "bot" ? "Bot rating" : rated ? "Rated" : "Unrated"}</span>
      </div>
      {(mode === "bot" || !rated) && (
        <p className="absolute inset-x-4 top-[calc(max(env(safe-area-inset-top),20px)+24px)] text-sm leading-5 text-muted">Your ranked rating stays where it is.</p>
      )}

      <section aria-label="Opponent" className="rq-from-right absolute top-[11%] right-4 flex w-[min(300px,calc(100%-32px))] flex-col items-end">
        <NamePlate name={opponent.name} side="opponent" />
        <div className="mt-2">
          <FullBar color="var(--color-opponent)" />
        </div>
        {theirRating && <span className="rq-display mt-2.5 text-4xl leading-10 font-bold">{theirRating}</span>}
        <div className="mt-3.5">
          <Loadout p={opponent} delay={loadoutDelay} />
        </div>
      </section>

      <span
        className="rq-land rq-display pointer-events-none absolute inset-x-0 top-1/2 -mt-12 text-center text-[96px] leading-[96px] font-bold tracking-[-0.02em] italic"
        style={{ animationDelay: "300ms" } as CSSProperties}
        aria-hidden
      >
        VS
      </span>

      <section
        aria-label="You"
        className="rq-from-left absolute bottom-[max(env(safe-area-inset-bottom),56px)] left-4 flex w-[min(300px,calc(100%-32px))] flex-col items-start"
      >
        <div className="mb-4">
          <Loadout p={you} delay={loadoutDelay} />
        </div>
        {yourRating && <span className="rq-display text-4xl leading-10 font-bold">{yourRating}</span>}
        <div className="mt-2.5">
          <FullBar color="var(--color-you)" />
        </div>
        <span className="mt-2">
          <NamePlate name={you.name} side="you" />
        </span>
      </section>
    </div>
  );
}
