// The round line, the arming card, and the match intro.

import { useRef, type CSSProperties } from "react";
import type { BlindPowerupId, MatchMode } from "@shared/game/types";
import type { PlayerView } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { LINES, POWERUP_HINTS, POWERUP_NAMES } from "../copy";
import { fmtMultiplier, fmtShownRating } from "../format";
import { Avatar } from "./Avatar";
import { useFrame } from "./hooks";
import { PowerupIcon } from "./icons";

export function modeAccent(mode: MatchMode | null): { color: string; label: string } {
  if (mode === "bot") return { color: "var(--color-bot)", label: "Bot match" };
  if (mode === "private") return { color: "var(--color-ranked-gold)", label: "Private" };
  return { color: "var(--color-ranked)", label: "Ranked" };
}

/** A bar that drains from the time left until `end`, out of `total`. */
export function DrainBar({ clock, end, total, color, className = "" }: { clock: MatchClock; end: number; total: number; color: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(clock, true, (now) => {
    const frac = Math.max(0, Math.min(1, (end - now) / Math.max(1, total)));
    if (ref.current) ref.current.style.transform = `scaleX(${frac})`;
  });
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-black/40 ${className}`}>
      <div ref={ref} className="h-full origin-left rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}`, transform: "scaleX(1)" }} />
    </div>
  );
}

export function RoundLine({
  round,
  multiplier,
  suddenDeath,
  mode,
  opponentAnswered,
}: {
  round: number;
  multiplier: number;
  suddenDeath: boolean;
  mode: MatchMode | null;
  opponentAnswered: boolean;
}) {
  const accent = modeAccent(mode);
  return (
    <div className="relative flex h-9 items-center justify-center px-3">
      <span className="absolute left-3 text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: accent.color }}>
        {accent.label}
      </span>
      {round > 0 && (
        <span className="text-[15px] font-semibold text-text/90">
          {suddenDeath ? "Sudden death" : `Round ${round}`} <span className="text-muted">{"·"}</span>{" "}
          <span className={multiplier > 1 ? "font-bold text-zeus" : "text-text/90"}>{fmtMultiplier(multiplier)}</span>
        </span>
      )}
      {opponentAnswered && (
        <span className="rq-pulse absolute right-3 rounded-full bg-opponent/20 px-2 py-0.5 text-[11px] font-bold text-opponent ring-1 ring-opponent/50">
          {LINES.opponentAnswered}
        </span>
      )}
    </div>
  );
}

export function ArmingCard({
  round,
  multiplier,
  suddenDeath,
  armable,
  armed,
  clock,
  endsAt,
  totalMs,
}: {
  round: number;
  multiplier: number;
  suddenDeath: boolean;
  armable: BlindPowerupId[];
  armed: BlindPowerupId | null;
  clock: MatchClock;
  endsAt: number | null;
  totalMs: number;
}) {
  return (
    <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface/70 px-5 py-6 text-center">
      <div key={round} className="rq-slam rq-display text-[min(15vw,64px)] leading-none font-black tracking-wider text-text">
        {suddenDeath ? "SUDDEN DEATH" : `ROUND ${round}`}
      </div>
      <div
        className="rq-rise rq-display mt-2 text-[min(13vw,56px)] leading-none font-black"
        style={{ color: multiplier > 1 ? "var(--color-zeus)" : "var(--color-muted)", textShadow: multiplier > 1 ? "0 0 18px rgba(245,197,66,0.5)" : "none", animationDelay: "120ms" } as CSSProperties}
      >
        {fmtMultiplier(multiplier)}
      </div>
      {endsAt !== null && <DrainBar clock={clock} end={endsAt} total={totalMs} color="var(--color-zeus)" className="mt-6 w-40" />}
      <div className="mt-5 min-h-[44px] text-sm text-text/80">
        {armed ? (
          <span className="inline-flex items-center gap-2 font-semibold text-zeus">
            <PowerupIcon id={armed} size={20} />
            {POWERUP_NAMES[armed]} armed. {POWERUP_HINTS[armed]}
          </span>
        ) : armable.length > 0 ? (
          <>
            <div className="font-semibold">{LINES.armHint}</div>
            <div className="mt-0.5 text-xs text-muted">{LINES.armHintSub}</div>
          </>
        ) : (
          <div className="text-muted">{LINES.armNothing}</div>
        )}
      </div>
    </section>
  );
}

function IntroPlayer({ p, side }: { p: PlayerView; side: "you" | "opponent" }) {
  const color = side === "you" ? "var(--color-you)" : "var(--color-opponent)";
  const rating = fmtShownRating(p.rating);
  return (
    <div className="rq-rise flex w-full flex-col items-center gap-2" style={{ animationDelay: side === "you" ? "250ms" : "0ms" }}>
      <Avatar name={p.name} url={p.avatarUrl} size={84} ring={color} bot={p.kind === "bot"} />
      <div className="text-center">
        <div className="text-xl font-bold" style={{ color }}>
          {side === "you" ? `${p.name} (you)` : p.name}
        </div>
        {rating && <div className="text-sm text-muted">{rating}</div>}
      </div>
      {p.loadout.length > 0 && (
        <div className="mt-1 flex gap-2">
          {p.loadout.map((id) => (
            <div key={id} className="flex w-[86px] flex-col items-center gap-1 rounded-xl bg-surface px-1.5 py-2 ring-1 ring-white/10" title={POWERUP_HINTS[id]}>
              <PowerupIcon id={id} size={26} />
              <span className="text-[12px] font-semibold">{POWERUP_NAMES[id]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IntroView({
  you,
  opponent,
  mode,
  rated,
  clock,
  endsAt,
  totalMs,
}: {
  you: PlayerView;
  opponent: PlayerView;
  mode: MatchMode | null;
  rated: boolean;
  clock: MatchClock;
  endsAt: number | null;
  totalMs: number;
}) {
  const accent = modeAccent(mode);
  return (
    <div className="flex flex-1 flex-col items-center justify-between px-4 py-6">
      <div className="text-center">
        <div className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: accent.color }}>
          {accent.label} {"·"} {rated ? "Rated" : "Unrated"}
        </div>
      </div>
      <IntroPlayer p={opponent} side="opponent" />
      <div className="rq-slam rq-display text-6xl font-black text-zeus" style={{ textShadow: "0 0 30px rgba(245,197,66,0.5)", animationDelay: "500ms" }}>
        VS
      </div>
      <IntroPlayer p={you} side="you" />
      {endsAt !== null ? <DrainBar clock={clock} end={endsAt} total={totalMs} color={accent.color} className="w-48" /> : <div />}
    </div>
  );
}
