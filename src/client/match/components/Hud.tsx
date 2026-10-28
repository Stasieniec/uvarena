// The Broadcast HUD: a thin top bar (mode and round, sound, surrender) and the
// 64 px strip with both players. Your teal plate on the left, the clock in the
// middle, the opponent's red plate on the right; under each plate a square
// HP bar that fills outward from the clock with a tick every 1,000, a yellow
// multiplier plate under the clock when it is above x1, and the opponent's
// kit under their bar. The strip stays put through arming, banners, the
// question and the reveal.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { MATCH } from "@shared/game/config";
import type { PlayerView } from "@shared/protocol";
import { fmtInt, fmtMultiplier } from "../format";
import { FX, HIT_DRAIN_AT_MS } from "../fx";
import { useCountTo } from "./hooks";
import { POWERUP_NAMES } from "../copy";
import { CheckIcon, PowerupIcon } from "./icons";

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
/** The part a hit takes off: red on your teal bar, white at 60% on the opponent's red one (red would vanish there). */
const LOST: Record<Side, string> = { you: "var(--color-opponent)", opponent: "rgb(242 244 247 / 0.6)" };
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

function HpBar({ side, hp, hit, dimmed }: { side: Side; hp: number; hit: HitView | null; dimmed: boolean }) {
  // Your bar fills from its right end (the clock side), the opponent's from its left.
  const anchor = side === "you" ? "right" : "left";
  const ticks: number[] = [];
  for (let v = HP_TICK; v < MATCH.startHp; v += HP_TICK) ticks.push(pct(v));
  const chunk = hit && hit.before > hp ? hit : null;
  return (
    <div className="relative h-2 overflow-hidden bg-border" aria-hidden>
      <div className="absolute inset-y-0" style={{ [anchor]: 0, width: `${pct(hp)}%`, background: FILL[side], opacity: dimmed ? 0.35 : 1 }} />
      {chunk && (
        <div
          key={chunk.seq}
          className="rq-chunk absolute inset-y-0"
          style={
            {
              [anchor]: `${pct(hp)}%`,
              width: `${pct(chunk.before) - pct(hp)}%`,
              // It drains toward the outer end of the bar.
              transformOrigin: anchor === "right" ? "left" : "right",
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
}

function WifiOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 12.5a10 10 0 0 1 4.5-2.4" />
      <path d="M19 12.5a10 10 0 0 0-2.6-1.8" />
      <path d="M2 8.8a15 15 0 0 1 4.4-2.6" />
      <path d="M22 8.8a15 15 0 0 0-9.6-3.8" />
      <path d="M12 20h.01" />
    </svg>
  );
}

/** A name plate: name at the outer edge, HP toward the clock. The inner end is cut at 12 degrees. */
function NamePlate({ side, player, hp, hit, answered }: PlateProps) {
  const shown = usePlateHp(hp, hit);
  const you = side === "you";
  const away = !you && !player.connected;
  const mark = answered ? <CheckIcon size={14} className="shrink-0" /> : away ? <WifiOffIcon /> : null;
  const colours = away ? "bg-surface text-muted" : you ? "bg-you text-bg" : "bg-opponent text-bg";
  return (
    <div
      className={`flex h-16 min-w-0 flex-col justify-center ${colours} ${you ? "rq-cut-left pr-5 pl-3" : "rq-cut-right pr-3 pl-5"}`}
      aria-label={`${you ? "You" : player.name}: ${fmtInt(hp)} HP${answered ? ", answered" : ""}${away ? ", disconnected" : ""}`}
      role="group"
    >
      <span className={`rq-plate-name flex w-full min-w-0 items-center gap-1 text-[17px] leading-5 ${you ? "" : "justify-end"}`}>
        {!you && mark}
        <span className="truncate">{player.name}</span>
        {you && mark}
      </span>
      <span className={`rq-display text-[22px] leading-6 font-bold ${you ? "self-end" : "self-start"}`} aria-hidden>
        {fmtInt(shown)}
      </span>
    </div>
  );
}

/** The opponent's kit under their bar: 14 px icons, spent ones faint. */
function OpponentKit({ player }: { player: PlayerView }) {
  if (player.loadout.length === 0) return null;
  const left = player.loadout.filter((p) => !player.used.includes(p)).map((p) => POWERUP_NAMES[p]);
  return (
    <div className="mt-1.5 flex justify-end gap-2" role="img" aria-label={left.length ? `${player.name} still has ${left.join(", ")}` : `${player.name} has used every power-up`}>
      {player.loadout.map((p) => (
        <PowerupIcon key={p} id={p} size={14} strokeWidth={2} className={player.used.includes(p) ? "text-faint" : "text-muted"} />
      ))}
    </div>
  );
}

interface HudProps {
  you: PlayerView;
  opponent: PlayerView;
  hp: { you: number; opponent: number };
  hit: { victim: Side; view: HitView } | null;
  answered: { you: boolean; opponent: boolean };
  multiplier: number;
  clock: ReactNode;
}

export function Hud({ you, opponent, hp, hit, answered, multiplier, clock }: HudProps) {
  return (
    <header className="flex flex-none flex-col gap-1.5 px-4">
      <div className="rq-hud-grid h-16">
        <NamePlate side="you" player={you} hp={hp.you} hit={hit?.victim === "you" ? hit.view : null} answered={answered.you} />
        {clock}
        <NamePlate side="opponent" player={opponent} hp={hp.opponent} hit={hit?.victim === "opponent" ? hit.view : null} answered={answered.opponent} />
      </div>
      <div className="rq-hud-grid h-7 items-start">
        <HpBar side="you" hp={hp.you} hit={hit?.victim === "you" ? hit.view : null} dimmed={false} />
        <span className="flex justify-center pt-1">
          {multiplier > 1 && (
            <span className="rq-display flex h-[22px] items-center bg-gold px-2 text-[18px] font-bold text-bg" aria-label={`Damage ${fmtMultiplier(multiplier)}`}>
              {fmtMultiplier(multiplier)}
            </span>
          )}
        </span>
        <div>
          <HpBar side="opponent" hp={hp.opponent} hit={hit?.victim === "opponent" ? hit.view : null} dimmed={!opponent.connected} />
          <OpponentKit player={opponent} />
        </div>
      </div>
    </header>
  );
}
