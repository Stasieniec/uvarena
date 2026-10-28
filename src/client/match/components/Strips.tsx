// The opponent strip (top) and your strip (bottom): avatar, name, HP bar,
// damage numbers, and the power-up buttons.

import type { CSSProperties, ReactNode } from "react";
import { MATCH } from "@shared/game/config";
import type { PowerupId } from "@shared/game/types";
import type { PlayerView } from "@shared/protocol";
import { LINES, POWERUP_HINTS, POWERUP_KIND_LABEL, POWERUP_NAMES } from "../copy";
import { fmtInt, fmtShownRating } from "../format";
import { Avatar } from "./Avatar";
import { useCountTo } from "./hooks";
import { POWERUP_COLOR, PowerupIcon } from "./icons";

/** A landed hit, shown on the strip of whoever took it. */
export interface HitView {
  seq: number;
  amount: number;
  /** HP before the hit, for the chunk that breaks off. */
  before: number;
  speed: boolean;
  bibi: boolean;
  shield: boolean;
  capped: boolean;
  big: boolean;
}

function HpBar({ hp, color, hit, low }: { hp: number; color: string; hit: HitView | null; low: boolean }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / MATCH.startHp) * 100))}%`;
  return (
    <div className="relative h-3.5">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-black/45 ring-1 ring-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${low ? "rq-hp-low" : ""}`}
          style={{ width: pct(hp), background: `linear-gradient(180deg, color-mix(in srgb, ${color} 75%, white), ${color} 55%, color-mix(in srgb, ${color} 70%, black))` }}
        />
        {[0.25, 0.5, 0.75].map((f) => (
          <div key={f} className="absolute top-0 bottom-0 w-px bg-black/35" style={{ left: `${f * 100}%` }} />
        ))}
      </div>
      {hit && hit.amount > 0 && hit.before > hp && (
        <div
          key={hit.seq}
          className="rq-chunk absolute top-0 bottom-0 rounded-sm"
          style={{ left: pct(hp), width: `calc(${pct(hit.before)} - ${pct(hp)})`, background: color }}
        />
      )}
    </div>
  );
}

function HitNumber({ hit, placement }: { hit: HitView; placement: "below" | "above" }) {
  const pos: CSSProperties = placement === "below" ? { top: "100%" } : { bottom: "100%" };
  if (hit.speed && !hit.big) {
    return (
      <div key={hit.seq} className={`${placement === "below" ? "rq-float-down" : "rq-float"} pointer-events-none absolute left-1/2 z-30 mt-1 mb-1 whitespace-nowrap`} style={pos}>
        <span className="rounded-full bg-black/80 px-2 py-0.5 text-xs font-semibold text-speed-chip tabular-nums ring-1 ring-speed-chip/50">
          {`−${fmtInt(hit.amount)} speed`}
        </span>
      </div>
    );
  }
  const color = hit.bibi ? "var(--color-bibi)" : "#fff";
  const size = hit.big ? "text-5xl" : hit.amount >= 1000 ? "text-4xl" : "text-3xl";
  const victimColor = placement === "above" ? "var(--color-wrong)" : "var(--color-you)";
  return (
    <div
      key={hit.seq}
      className={`${placement === "below" ? "rq-float-down" : "rq-float"} pointer-events-none absolute left-1/2 z-30 rounded-2xl bg-black/75 px-3 py-1 text-center whitespace-nowrap ring-1 ring-white/10`}
      style={pos}
    >
      <div
        className={`rq-display leading-tight font-black tabular-nums ${size}`}
        style={{ color, textShadow: `0 2px 0 #000, 0 0 18px ${hit.bibi ? "var(--color-bibi)" : victimColor}` }}
      >
        {`−${fmtInt(hit.amount)}`}
      </div>
      {(hit.capped || hit.shield) && (
        <div className="mt-0.5 text-[11px] font-semibold tracking-wide text-white/80 uppercase">
          {[hit.capped ? "Capped" : null, hit.shield ? "Halved by Shield" : null].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}

function MiniLoadout({ player }: { player: PlayerView }) {
  return (
    <div className="flex items-center gap-1" aria-label="Opponent power-ups">
      {player.loadout.map((p) => {
        const used = player.used.includes(p);
        return (
          <span
            key={p}
            title={`${POWERUP_NAMES[p]}${used ? " (used)" : ""}`}
            className={`flex h-6 w-6 items-center justify-center rounded-md bg-black/30 ring-1 ring-white/10 ${used ? "opacity-25 grayscale" : ""}`}
          >
            <PowerupIcon id={p} size={15} />
          </span>
        );
      })}
    </div>
  );
}

interface OpponentStripProps {
  player: PlayerView;
  hp: number;
  hit: HitView | null;
  hitFlash: boolean;
  controls: ReactNode;
  /** Null while connected; "" when away without a forfeit clock; "0:38" otherwise. */
  forfeitIn: string | null;
}

export function OpponentStrip({ player, hp, hit, hitFlash, controls, forfeitIn }: OpponentStripProps) {
  const shownHp = useCountTo(hp, 450);
  const rating = fmtShownRating(player.rating);
  return (
    <div className="relative z-30 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2">
      {hitFlash && <div key={hit?.seq} className="rq-edge" style={{ position: "absolute" }} />}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar name={player.name} url={player.avatarUrl} userId={player.userId} size={42} ring="var(--color-opponent)" bot={player.kind === "bot"} />
          {!player.connected && (
            <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-muted ring-2 ring-bg" aria-label="Disconnected" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={`truncate text-[15px] font-semibold ${player.connected ? "" : "text-muted"}`}>{player.name}</span>
            {rating && <span className="text-xs text-muted">{rating}</span>}
            <span className="ml-auto text-sm font-bold text-opponent tabular-nums">{fmtInt(shownHp)}</span>
          </div>
          <div className="relative">
            <HpBar hp={hp} color="var(--color-opponent)" hit={hit} low={hp > 0 && hp <= MATCH.startHp * 0.2} />
            {hit && hit.amount > 0 && <HitNumber hit={hit} placement="below" />}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">{controls}</div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-[54px]">
        <MiniLoadout player={player} />
        {forfeitIn !== null && (
          <span className="rq-pulse ml-auto rounded-full bg-black/50 px-2.5 py-0.5 text-xs font-semibold text-text/80 tabular-nums ring-1 ring-white/15">
            {LINES.opponentDisconnected}
            {forfeitIn ? ` · ${forfeitIn}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export type PowerupButtonState = "idle" | "armable" | "armed" | "usable" | "pending" | "used";

interface YourStripProps {
  player: PlayerView;
  hp: number;
  hit: HitView | null;
  buttons: { id: PowerupId; state: PowerupButtonState }[];
  onTap(id: PowerupId): void;
}

export function YourStrip({ player, hp, hit, buttons, onTap }: YourStripProps) {
  const shownHp = useCountTo(hp, 450);
  return (
    <div className="relative z-30 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),10px)]">
      <div className="relative mb-1 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-you">You</span>
        <span className="font-bold text-you tabular-nums">{fmtInt(shownHp)}</span>
      </div>
      <div className="relative">
        <HpBar hp={hp} color="var(--color-you)" hit={hit} low={hp > 0 && hp <= MATCH.startHp * 0.2} />
        {hit && hit.amount > 0 && <HitNumber hit={hit} placement="above" />}
      </div>
      {buttons.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {buttons.map((b) => (
            <PowerupButton key={b.id} id={b.id} state={b.state} onTap={() => onTap(b.id)} />
          ))}
        </div>
      )}
      {player.loadout.length === 0 && <div className="mt-2 text-center text-xs text-muted">Power-ups are off</div>}
    </div>
  );
}

function PowerupButton({ id, state, onTap }: { id: PowerupId; state: PowerupButtonState; onTap(): void }) {
  const tappable = state === "armable" || state === "armed" || state === "usable";
  const dim = state === "used";
  const label =
    state === "armed" ? "Armed" : state === "used" ? "Used" : state === "pending" ? "..." : POWERUP_KIND_LABEL[id];
  const cls = [
    "relative flex h-14 min-w-0 items-center gap-1.5 rounded-xl px-2 text-left ring-1 transition-[transform,opacity] duration-150",
    tappable ? "active:scale-95 bg-surface-2 ring-white/15" : "bg-surface ring-white/5",
    state === "armable" || state === "usable" ? "rq-glow" : "",
    state === "armed" ? "rq-armed bg-[color-mix(in_srgb,var(--color-gold)_16%,var(--color-surface-2))]" : "",
    dim ? "opacity-35 grayscale" : "",
    state === "idle" ? "opacity-70" : "",
  ].join(" ");
  return (
    <button
      type="button"
      className={cls}
      style={{ "--rq-glow": POWERUP_COLOR[id] } as CSSProperties}
      disabled={!tappable}
      onClick={onTap}
      title={POWERUP_HINTS[id]}
      aria-pressed={state === "armed"}
      aria-label={`${POWERUP_NAMES[id]}: ${POWERUP_HINTS[id]}${dim ? " Used." : ""}`}
    >
      <PowerupIcon id={id} size={24} />
      <span className="min-w-0 leading-tight">
        <span className={`block text-[13px] leading-[1.1] font-semibold ${dim ? "line-through" : ""}`}>{POWERUP_NAMES[id]}</span>
        <span className={`block text-[11px] ${state === "armed" ? "font-semibold text-gold" : "text-muted"}`}>{label}</span>
      </span>
    </button>
  );
}

