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
      className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-white/10"
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

  const r = 19;
  const circ = 2 * Math.PI * r;
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
        className="relative flex h-11 w-11 touch-none items-center justify-center rounded-full text-white/85 select-none active:bg-white/10 disabled:opacity-30"
        aria-label={LINES.holdToSurrender}
        title={LINES.holdToSurrender}
      >
        <FlagIcon />
        <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 44 44" aria-hidden>
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeDasharray={circ}
            strokeDashoffset={holding ? 0 : circ}
            className={holding ? "rq-hold" : undefined}
            style={{ transition: holding ? `stroke-dashoffset ${FX.surrenderHoldMs}ms linear` : "none" }}
          />
        </svg>
      </button>
      {holding && (
        <div className="absolute top-full right-0 z-50 mt-1 rounded-md bg-black/85 px-2 py-1 text-xs font-semibold whitespace-nowrap text-white">
          {LINES.holdToSurrender}
        </div>
      )}
    </div>
  );
}
