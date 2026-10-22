// Timing hooks shared by the match components. Everything that counts down
// reads the match clock (server time), never Date.now() directly.

import { useEffect, useRef, useState } from "react";
import type { MatchClock } from "../clock";

/** Re-renders every `intervalMs` while active and returns the clock's now. */
export function useNow(clock: MatchClock, intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    if (!active) return;
    setNow(clock.now());
    const id = window.setInterval(() => setNow(clock.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [clock, intervalMs, active]);
  return now;
}

/** Calls `frame(now)` on every animation frame while active. */
export function useFrame(clock: MatchClock, active: boolean, frame: (now: number) => void): void {
  const ref = useRef(frame);
  ref.current = frame;
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => {
      ref.current(clock.now());
      id = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(id);
  }, [clock, active]);
}

/** Animates a number towards `target` over `ms` (count up or down). */
export function useCountTo(target: number, ms: number, from?: number): number {
  const [value, setValue] = useState(from ?? target);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const start = valueRef.current;
    if (start === target) return;
    const t0 = performance.now();
    let id = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      const eased = 1 - (1 - p) ** 3;
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, ms]);
  return value;
}

/** True for `ms` after `key` changes to a truthy value (for one-shot effects). */
export function usePulse(key: number | string | null, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (key === null || key === 0 || key === "") return;
    setOn(true);
    const id = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(id);
  }, [key, ms]);
  return on;
}
