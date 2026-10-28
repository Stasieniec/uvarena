// Corner controls: the mute toggle and the surrender flag (hold to confirm).

import { useEffect, useRef, useState } from "react";
import { LINES } from "../copy";
import { FX } from "../fx";
import { FlagIcon, SoundIcon } from "./icons";

export function MuteButton({ on, onToggle }: { on: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-11 w-11 items-center justify-center text-muted active:text-text"
      aria-label={on ? "Mute sounds" : "Turn sounds on"}
      aria-pressed={!on}
    >
      <SoundIcon on={on} />
    </button>
  );
}

/** White flag. Hold for FX.surrenderHoldMs to give up; letting go early cancels. */
export function SurrenderButton({ enabled, onSurrender }: { enabled: boolean; onSurrender(): void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const done = useRef(false);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  useEffect(() => cancel, []);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled]);

  const start = () => {
    if (!enabled || done.current) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      done.current = true;
      setHolding(false);
      onSurrender();
    }, FX.surrenderHoldMs);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!enabled}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          start();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.repeat) start();
        }}
        onKeyUp={cancel}
        className={`relative flex h-11 w-11 touch-none items-center justify-center select-none disabled:opacity-30 ${holding ? "text-text" : "text-muted"}`}
        aria-label={LINES.holdToSurrender}
        title={LINES.holdToSurrender}
      >
        <FlagIcon />
        {/* While held, a bar along the bottom edge fills over the hold time. At rest the icon stands alone, as on the boards. */}
        <span className={`pointer-events-none absolute inset-x-2 bottom-1.5 h-0.5 bg-border ${holding ? "" : "opacity-0"}`} aria-hidden>
          <span
            className={`block h-full origin-left bg-text ${holding ? "rq-hold" : ""}`}
            style={{ transform: holding ? "scaleX(1)" : "scaleX(0)", transition: holding ? `transform ${FX.surrenderHoldMs}ms linear` : "none" }}
          />
        </span>
      </button>
      {holding && (
        <div className="absolute top-full right-0 z-50 mt-1 bg-surface px-2 py-1 text-sm whitespace-nowrap text-text">{LINES.holdToSurrender}</div>
      )}
    </div>
  );
}
