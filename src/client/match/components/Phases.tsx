// The round line, the arming card, and the match intro.

import { useRef, type CSSProperties } from "react";
import type { BlindPowerupId, MatchMode } from "@shared/game/types";
import type { PlayerView } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { LINES, POWERUP_HINTS, POWERUP_NAMES } from "../copy";
import { SCORING } from "@shared/game/config";
import { fmtInt, fmtMultiplier, fmtShownRating, worstHit } from "../format";
import { Avatar } from "./Avatar";
import { useFrame } from "./hooks";
import { PowerupIcon } from "./icons";

export function modeAccent(mode: MatchMode | null): { color: string; label: string } {
  if (mode === "bot") return { color: "var(--color-bot)", label: "Bot match" };
  if (mode === "private") return { color: "var(--color-ranked-gold)", label: "Private" };
  return { color: "var(--color-ranked)", label: "Ranked" };
}

export interface ModeTheme {
  /** Mode label colour. */
  accent: string;
  /** Question card border. */
  frame: string;
  cardShadow: string;
  /** Timer bar before it turns urgent. */
  timer: string;
  /** Round line text. */
  round: string;
  /** Screen background glow. */
  glow: string;
  /** Thin frame around the whole screen. */
  edge: string;
}

/** design.md: ranked screens carry red and gold, bot screens blue. Private matches stay neutral. */
export function modeTheme(mode: MatchMode | null): ModeTheme {
  if (mode === "bot") {
    return {
      accent: "#60a5fa",
      frame: "rgba(75,131,230,0.5)",
      cardShadow: "0 0 18px -8px rgba(75,131,230,0.45), 0 8px 30px -12px rgba(0,0,0,0.7)",
      timer: "#60a5fa",
      round: "var(--color-text)",
      glow: "rgba(75,131,230,0.18)",
      edge: "rgba(75,131,230,0.3)",
    };
  }
  if (mode === "private") {
    return {
      accent: "var(--color-ranked-gold)",
      frame: "var(--color-border)",
      cardShadow: "0 8px 30px -12px rgba(0,0,0,0.7)",
      timer: "var(--color-you)",
      round: "var(--color-text)",
      glow: "rgba(245,197,66,0.12)",
      edge: "transparent",
    };
  }
  return {
    accent: "var(--color-ranked)",
    frame: "rgba(217,87,91,0.5)",
    cardShadow: "0 0 18px -8px rgba(217,87,91,0.45), 0 8px 30px -12px rgba(0,0,0,0.7)",
    timer: "var(--color-ranked-gold)",
    round: "var(--color-text)",
    glow: "rgba(217,87,91,0.16)",
    edge: "rgba(217,87,91,0.3)",
  };
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

/** The multiplier badge: plain at x1, gold from x1.5, and from x2 it grows and glows with every step. */
export function MultiplierBadge({ multiplier }: { multiplier: number }) {
  const text = fmtMultiplier(multiplier);
  if (multiplier <= 1) return <span className="text-text/80 tabular-nums">{text}</span>;
  if (multiplier < 2) return <span className="font-bold text-gold tabular-nums">{text}</span>;
  const steps = Math.min(4, (multiplier - 2) / 0.5);
  const hot = multiplier >= 3;
  const style: CSSProperties = {
    fontSize: `${15 + steps * 1.5}px`,
    color: hot ? "#fff3c4" : "var(--color-gold)",
    background: hot
      ? "linear-gradient(180deg, rgba(229,72,77,0.55), rgba(245,197,66,0.3))"
      : "color-mix(in srgb, var(--color-gold) 18%, transparent)",
    ["--rq-glow" as string]: hot ? "var(--color-ranked)" : "var(--color-gold)",
  };
  return (
    <span className="rq-heat rounded-full px-2 py-px leading-tight font-black tabular-nums ring-1 ring-gold/70" style={style}>
      {text}
    </span>
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
  const theme = modeTheme(mode);
  return (
    <div className="grid min-h-10 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3">
      <span
        className="justify-self-start rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] uppercase"
        style={{
          color: theme.accent,
          background: `color-mix(in srgb, ${theme.accent} 16%, transparent)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${theme.accent} 45%, transparent)`,
        }}
      >
        {accent.label}
      </span>
      {round > 0 ? (
        <span className="flex items-center gap-1.5 text-[15px] font-semibold whitespace-nowrap" style={{ color: theme.round }}>
          {suddenDeath ? "Sudden death" : `Round ${round}`} <span className="text-muted">{"·"}</span>
          <MultiplierBadge multiplier={multiplier} />
        </span>
      ) : (
        <span />
      )}
      <span className="justify-self-end">
        {opponentAnswered && (
          <span className="rq-pulse block rounded-xl bg-opponent/20 px-2 py-0.5 text-right text-[11px] leading-tight font-bold text-opponent ring-1 ring-opponent/50">
            {LINES.opponentAnswered}
          </span>
        )}
      </span>
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
  /** A power-up banner is on top: the round title would show through it, so it fades out. */
  covered?: boolean;
}) {
  return (
    <section
      className={`relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface/70 px-5 py-6 text-center transition-opacity duration-150 ${covered ? "opacity-0" : ""}`}
      aria-hidden={covered || undefined}
    >
      <div key={round} className="rq-slam rq-display text-[min(15vw,64px)] leading-none font-black tracking-wider text-text">
        {suddenDeath ? "SUDDEN DEATH" : `ROUND ${round}`}
      </div>
      {multiplier >= 2 ? (
        <>
          <div
            key={`d${round}`}
            className="rq-slam rq-display rq-gold-text mt-3 text-[min(11vw,50px)] leading-none font-black whitespace-nowrap"
            style={{ animationDelay: "260ms" }}
          >
            DAMAGE {fmtMultiplier(multiplier)}
          </div>
          <div className="rq-rise mt-2 text-sm font-semibold text-gold/90" style={{ animationDelay: "420ms" }}>
            {`A wrong answer can cost ${fmtInt(worstHit(multiplier, SCORING.maxScore, SCORING.roundCap))}.`}
          </div>
        </>
      ) : (
        <div
          className="rq-rise rq-display mt-2 text-[min(13vw,56px)] leading-none font-black"
          style={{ color: multiplier > 1 ? "var(--color-gold)" : "var(--color-muted)", textShadow: multiplier > 1 ? "0 0 18px rgba(245,197,66,0.5)" : "none", animationDelay: "120ms" } as CSSProperties}
        >
          {fmtMultiplier(multiplier)}
        </div>
      )}
      {endsAt !== null && <DrainBar clock={clock} end={endsAt} total={totalMs} color="var(--color-gold)" className="mt-6 w-40" />}
      <div className="mt-5 min-h-[44px] text-sm text-text/80">
        {armed ? (
          <span className="inline-flex items-center gap-2 font-semibold text-gold">
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
      <Avatar name={p.name} url={p.avatarUrl} userId={p.userId} size={84} ring={color} bot={p.kind === "bot"} />
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
          {accent.label} {"·"} {mode === "bot" ? "Bot rating" : rated ? "Rated" : "Unrated"}
        </div>
        {(mode === "bot" || !rated) && <div className="mt-1 text-xs text-muted">Your ranked rating stays where it is.</div>}
      </div>
      <IntroPlayer p={opponent} side="opponent" />
      <div className="rq-slam rq-display text-6xl font-black text-gold" style={{ textShadow: "0 0 30px rgba(245,197,66,0.5)", animationDelay: "500ms" }}>
        VS
      </div>
      <IntroPlayer p={you} side="you" />
      {endsAt !== null ? <DrainBar clock={clock} end={endsAt} total={totalMs} color={accent.color} className="w-48" /> : <div />}
    </div>
  );
}
