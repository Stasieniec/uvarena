// The clock plate in the middle of the HUD. During the question it counts your
// seconds (server time); when the opponent answers it snaps to your
// countdown. Under 5 seconds the plate turns red with dark digits and ticks.
// Once you answered it goes muted and freezes; during arming it counts the
// arming time.

import { useEffect, useRef } from "react";
import type { MatchClock } from "../clock";
import { secondsLeft } from "../format";
import { FX } from "../fx";
import type { MatchUiState } from "../state";
import { useFrame } from "./hooks";

type ClockLook = "live" | "urgent" | "muted";

interface Props {
  state: MatchUiState;
  clock: MatchClock;
  onTick(secondsLeft: number): void;
}

export function ClockPlate({ state, clock, onTick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastSec = useRef<number | null>(null);
  /** The last second you saw before answering; the plate holds it through the reveal. */
  const held = useRef<number | null>(null);
  const round = state.round;

  useEffect(() => {
    held.current = null;
    lastSec.current = null;
  }, [round]);

  const paint = (now: number) => {
    const el = ref.current;
    if (!el) return;
    const q = state.question;
    let text = "";
    let look: ClockLook = "muted";
    let label = "";
    if (state.phase === "question" && q) {
      if (state.yourAnswer === null) {
        const sec = secondsLeft((state.yourDeadline ?? q.deadline) - now);
        text = String(sec);
        look = sec <= FX.tickFromS ? "urgent" : "live";
        label = `${sec} seconds left`;
        held.current = sec;
        if (sec !== lastSec.current) {
          if (lastSec.current !== null && sec > 0 && sec <= FX.tickFromS) onTick(sec);
          lastSec.current = sec;
        }
      } else {
        text = held.current !== null ? String(held.current) : "";
        label = held.current !== null ? `Answered with ${held.current} seconds left` : "Answered";
      }
    } else if (state.phase === "reveal") {
      // After a reconnect nothing was held: work it out from your answer time.
      const ms = state.reveal?.yourMs ?? null;
      if (held.current === null && q && ms !== null) held.current = secondsLeft(q.timerMs - ms);
      text = held.current !== null ? String(held.current) : "";
      label = "Round over";
    } else if (state.phase === "arming" && state.phaseEndsAt !== null) {
      const sec = secondsLeft(state.phaseEndsAt - now);
      text = String(sec);
      look = "live";
      label = `Arming, ${sec} seconds left`;
    }
    if (el.textContent !== text) el.textContent = text;
    if (el.dataset.look !== look) el.dataset.look = look;
    if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label || "Clock");
  };

  const ticking = state.phase === "question" || state.phase === "arming";
  useFrame(clock, ticking, paint);
  // Phases that do not tick still need one paint (a reveal holds the last second).
  useEffect(() => {
    if (!ticking) paint(clock.now());
  });

  return (
    <div
      ref={ref}
      role="timer"
      data-look="muted"
      className="rq-clock rq-display flex h-16 w-16 items-center justify-center text-[48px] leading-[48px] font-bold"
    />
  );
}
