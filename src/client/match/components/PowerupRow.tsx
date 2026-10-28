// Your three power-ups as plates at the bottom of the duel. Armable or usable:
// a yellow 1 px frame 3 px outside the plate. Armed: solid yellow. Spent:
// struck through. The look of every state lives in match.css (data-state).

import type { PowerupId } from "@shared/game/types";
import { POWERUP_HINTS, POWERUP_NAMES } from "../copy";
import { PowerupIcon } from "./icons";

export type PowerupButtonState = "idle" | "armable" | "armed" | "usable" | "pending" | "used";

export function PowerupRow({ buttons, onTap, off }: { buttons: { id: PowerupId; state: PowerupButtonState }[]; onTap(id: PowerupId): void; off: boolean }) {
  if (off) return <p className="py-3 text-center text-sm text-muted">Power-ups are off</p>;
  if (buttons.length === 0) return null;
  return (
    <div className="grid shrink-0 grid-cols-3 gap-3 px-1">
      {buttons.map((b) => (
        <PowerupButton key={b.id} id={b.id} state={b.state} onTap={() => onTap(b.id)} />
      ))}
    </div>
  );
}

function PowerupButton({ id, state, onTap }: { id: PowerupId; state: PowerupButtonState; onTap(): void }) {
  const tappable = state === "armable" || state === "armed" || state === "usable";
  const used = state === "used";
  const name = POWERUP_NAMES[id];
  // "Gotta Go Fast" only fits a third of a 360 px row with a tighter gap and edge.
  const long = name.length > 8;
  return (
    <button
      type="button"
      data-state={state}
      className={`rq-power flex h-12 min-w-0 items-center justify-center overflow-hidden rounded-xs tracking-[-0.01em] whitespace-nowrap ${long ? "gap-1 px-0.5" : "gap-1.5 px-1"}`}
      disabled={!tappable}
      onClick={onTap}
      title={POWERUP_HINTS[id]}
      aria-pressed={state === "armed"}
      aria-label={`${name}: ${POWERUP_HINTS[id]}${state === "armed" ? " Armed." : used ? " Used." : ""}`}
    >
      <PowerupIcon id={id} size={16} className="shrink-0" />
      <span className={`min-w-0 truncate font-semibold ${long ? "text-sm" : "text-[15px]"}`}>{name}</span>
    </button>
  );
}
