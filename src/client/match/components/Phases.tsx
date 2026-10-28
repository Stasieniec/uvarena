// The round callout of the arming phase, the versus intro, and the knockout.

import { useRef, type CSSProperties } from "react";
import { SCORING } from "@shared/game/config";
import type { BlindPowerupId, MatchMode } from "@shared/game/types";
import type { PlayerView } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { LINES, POWERUP_HINTS, POWERUP_NAMES } from "../copy";
import { fmtInt, fmtMultiplier, fmtShownRating, worstHit } from "../format";
import { HIT_TOTAL_MS } from "../fx";
import { useFrame } from "./hooks";
import { PowerupIcon } from "./icons";

export function modeLabel(mode: MatchMode | null): string {
  if (mode === "bot") return "Bot match";
  if (mode === "private") return "Private";
  return "Ranked";
}

/** A thin bar that drains from the time left until `end`, out of `total`. */
export function DrainBar({ clock, end, total, className = "" }: { clock: MatchClock; end: number; total: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(clock, true, (now) => {
    const frac = Math.max(0, Math.min(1, (end - now) / Math.max(1, total)));
    if (ref.current) ref.current.style.transform = `scaleX(${frac})`;
  });
  return (
    <div className={`h-1 overflow-hidden bg-border ${className}`} aria-hidden>
      <div ref={ref} className="h-full origin-left bg-muted" style={{ transform: "scaleX(1)" }} />
    </div>
  );
}

/** Arming: the round lands as a callout, the multiplier under it, then what to do with your power-ups. */
export function ArmingCallout({
  round,
  multiplier,
  suddenDeath,
  armable,
  armed,
  clock,
  endsAt,
  totalMs,
  covered = false,
}: {
  round: number;
  multiplier: number;
  suddenDeath: boolean;
  armable: BlindPowerupId[];
  armed: BlindPowerupId | null;
  clock: MatchClock;
  endsAt: number | null;
  totalMs: number;
  /** A power-up banner is on top: the callout would show through it, so it fades out. */
  covered?: boolean;
}) {
  return (
    <section
      className={`flex flex-1 flex-col items-center justify-center px-4 text-center transition-opacity duration-150 ${covered ? "opacity-0" : ""}`}
      aria-hidden={covered || undefined}
    >
      <div key={round} className="rq-land rq-display text-[64px] leading-[64px] font-bold whitespace-nowrap uppercase italic">
        {suddenDeath ? "Sudden death" : `Round ${round}`}
      </div>
      {multiplier > 1 && (
        <div className="rq-rise mt-3 flex flex-col items-center gap-2" style={{ animationDelay: "180ms" }}>
          <span className="rq-display bg-gold px-3 py-0.5 text-[28px] leading-8 font-bold text-bg">
            <span className="uppercase">Damage</span> {fmtMultiplier(multiplier)}
          </span>
          {multiplier >= 2 && (
            <span className="text-sm leading-5 text-muted">{`A wrong answer can cost ${fmtInt(worstHit(multiplier, SCORING.maxScore, SCORING.roundCap))}.`}</span>
          )}
        </div>
      )}
      {endsAt !== null && <DrainBar clock={clock} end={endsAt} total={totalMs} className="mt-6 w-40" />}
      <div className="mt-5 min-h-11 text-[15px] leading-[22px]">
        {armed ? (
          <span className="font-semibold">
            <PowerupIcon id={armed} size={18} className="mr-1.5 inline-block align-[-3px] text-gold" />
            {POWERUP_NAMES[armed]} armed. {POWERUP_HINTS[armed]}
          </span>
        ) : armable.length > 0 ? (
          <>
            <div className="font-semibold">{LINES.armHint}</div>
            <div className="text-sm text-muted">{LINES.armHintSub}</div>
          </>
        ) : (
          <div className="text-muted">{LINES.armNothing}</div>
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

/** The knockout: once the last hit has drained, K.O. lands over the duel; the HUD stays in view. */
export function KnockoutOverlay({ youWon, loserName }: { youWon: boolean; loserName: string | null }) {
  const delay = `${HIT_TOTAL_MS}ms`;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center" role="status" aria-live="assertive">
      <div className="rq-fade absolute inset-0 bg-bg/85" style={{ animationDelay: delay }} />
      <div className="rq-land rq-display relative text-[120px] leading-[112px] font-bold italic" style={{ animationDelay: delay }}>
        K.O.
      </div>
      <div className="rq-fade relative mt-3 text-[17px] leading-6 font-semibold" style={{ animationDelay: `${HIT_TOTAL_MS + 200}ms` }}>
        {youWon ? `${loserName} is out of HP.` : "You are out of HP."}
      </div>
    </div>
  );
}
