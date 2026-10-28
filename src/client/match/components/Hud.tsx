// The Broadcast HUD: a thin top bar (mode and round, sound, surrender) and the
// 64 px strip with both players. Your teal plate on the left, the clock in the
// middle, the opponent's red plate on the right; under each plate a square
// HP bar that fills outward from the clock with a tick every 1,000, and a
// yellow multiplier plate under the clock when it is above x1. The strip stays
// put through arming, banners, the question and the reveal.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { MATCH } from "@shared/game/config";
import type { PlayerView } from "@shared/protocol";
import { fmtInt, fmtMultiplier } from "../format";
import { FX, HIT_DRAIN_AT_MS } from "../fx";
import { useCountTo } from "./hooks";
import { CheckIcon } from "./icons";

/** A landed hit, shown on the bar of whoever took it. */
export interface HitView {
  seq: number;
  amount: number;
  /** HP before the hit, for the part that breaks off. */
  before: number;
  speed: boolean;
  bibi: boolean;
  shield: boolean;
  capped: boolean;
  big: boolean;
}

export type Side = "you" | "opponent";

const FILL: Record<Side, string> = { you: "var(--color-you)", opponent: "var(--color-opponent)" };
/** The part a hit takes off: red on your teal bar, dark red on the opponent's red one. */
const LOST: Record<Side, string> = { you: "var(--color-wrong)", opponent: "color-mix(in srgb, var(--color-opponent) 40%, var(--color-bg))" };
const HP_TICK = 1000;

function pct(v: number): number {
  return Math.max(0, Math.min(100, (v / MATCH.startHp) * 100));
}

/** "Ranked · Round 6" on the left, the sound and surrender controls on the right. */
export function TopBar({ label, controls }: { label: ReactNode; controls: ReactNode }) {
  return (
    <div className="flex h-11 flex-none items-center pr-1 pl-4 text-sm leading-5 text-muted">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {controls}
    </div>
  );
}

/** The HP shown on a plate: it holds through the freeze and the red, then counts down with the drain. */
function usePlateHp(hp: number, hit: HitView | null): number {
  const [drained, setDrained] = useState<number | null>(null);
  useEffect(() => {
    if (!hit) return;
    const id = window.setTimeout(() => setDrained(hit.seq), HIT_DRAIN_AT_MS);
    return () => window.clearTimeout(id);
  }, [hit?.seq]);
  const holding = hit !== null && drained !== hit.seq && hit.before > hp;
  return useCountTo(holding ? hit.before : hp, FX.hitDrainMs);
}

function HpBar({ side, hp, hit }: { side: Side; hp: number; hit: HitView | null }) {
  // Your bar fills from its right end (the clock side), the opponent's from its left.
  const anchor = side === "you" ? "right" : "left";
  const ticks: number[] = [];
  for (let v = HP_TICK; v < MATCH.startHp; v += HP_TICK) ticks.push(pct(v));
  const chunk = hit && hit.before > hp ? hit : null;
  return (
    <div className="relative h-2 overflow-hidden bg-border" aria-hidden>
      <div className="absolute inset-y-0" style={{ [anchor]: 0, width: `${pct(hp)}%`, background: FILL[side] }} />
      {chunk && (
        <div
          key={chunk.seq}
          className="rq-chunk absolute inset-y-0"
          style={
            {
              [anchor]: `${pct(hp)}%`,
              width: `${pct(chunk.before) - pct(hp)}%`,
              transformOrigin: anchor,
              "--rq-fill": FILL[side],
              "--rq-lost": LOST[side],
            } as CSSProperties
          }
        />
      )}
      {ticks.map((t) => (
        <span key={t} className="absolute inset-y-0 w-0.5 bg-bg" style={{ [anchor]: `calc(${t}% - 1px)` }} />
      ))}
    </div>
  );
}

interface PlateProps {
  side: Side;
  player: PlayerView;
  hp: number;
  hit: HitView | null;
  /** A check beside the name: this player has answered the current question. */
  answered: boolean;
  /** The hit plate shakes (a hit of 2,000 or more, or the knockout). */
  shake: boolean;
}

function PlayerColumn({ side, player, hp, hit, answered, shake }: PlateProps) {
  const shown = usePlateHp(hp, hit);
  const you = side === "you";
  const away = !you && !player.connected;
  const name = (
    <span className={`rq-plate-name flex w-full min-w-0 items-center gap-1 text-[17px] leading-5 ${you ? "" : "justify-end"}`}>
      {answered && !you && <CheckIcon size={14} className="shrink-0" />}
      <span className="truncate">{player.name}</span>
      {answered && you && <CheckIcon size={14} className="shrink-0" />}
    </span>
  );
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${shake ? "rq-hit-shake" : ""}`}>
      <div
        className={`flex h-16 min-w-0 flex-col justify-center text-bg ${you ? "rq-cut-left bg-you pr-5 pl-3" : "rq-cut-right bg-opponent pr-3 pl-5"} ${away ? "opacity-45" : ""}`}
        aria-label={`${you ? "You" : player.name}: ${fmtInt(hp)} HP${answered ? ", answered" : ""}${away ? ", disconnected" : ""}`}
        role="group"
      >
        {name}
        <span className={`rq-display text-[22px] leading-6 font-bold ${you ? "self-end" : "self-start"}`} aria-hidden>
          {fmtInt(shown)}
        </span>
      </div>
      <HpBar side={side} hp={hp} hit={hit} />
    </div>
  );
}

interface HudProps {
  you: PlayerView;
  opponent: PlayerView;
  hp: { you: number; opponent: number };
  hit: { victim: Side; view: HitView } | null;
  shake: boolean;
  answered: { you: boolean; opponent: boolean };
  multiplier: number;
  clock: ReactNode;
}

export function Hud({ you, opponent, hp, hit, shake, answered, multiplier, clock }: HudProps) {
  return (
    <header className="rq-hud-grid flex-none px-4">
      <PlayerColumn
        side="you"
        player={you}
        hp={hp.you}
        hit={hit?.victim === "you" ? hit.view : null}
        answered={answered.you}
        shake={shake && hit?.victim === "you"}
      />
      <div className="flex flex-col items-center gap-1">
        {clock}
        <span className="flex h-[22px] items-center">
          {multiplier > 1 && (
            <span className="rq-display flex h-[22px] items-center bg-gold px-2 text-[18px] font-bold text-bg" aria-label={`Damage ${fmtMultiplier(multiplier)}`}>
              {fmtMultiplier(multiplier)}
            </span>
          )}
        </span>
      </div>
      <PlayerColumn
        side="opponent"
        player={opponent}
        hp={hp.opponent}
        hit={hit?.victim === "opponent" ? hit.view : null}
        answered={answered.opponent}
        shake={shake && hit?.victim === "opponent"}
      />
    </header>
  );
}
