// The band between the HUD and the question. It carries the question's time
// drain along its top edge, and the event words when something happens: "10 SECONDS" when
// the opponent answers (5 under Gotta Go Fast), the yellow damage plate that
// drops from the clock on a hit, and the short status lines.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SCORING, TIMING } from "@shared/game/config";
import type { RevealPayload } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { LINES } from "../copy";
import { damageLine, fmtInt, hitLine, hitNote } from "../format";
import { FX } from "../fx";
import type { MatchUiState, QuickFx } from "../state";
import type { HitView } from "./Hud";
import { useFrame } from "./hooks";
import { PowerupIcon } from "./icons";

/** "10 SECONDS" for 700 ms when the opponent answers first and your clock snaps down. */
function useSnapCallout(state: MatchUiState, clock: MatchClock): number | null {
  const [shown, setShown] = useState<{ round: number; seconds: number } | null>(null);
  const answeredFirst = state.phase === "question" && state.opponentAnswered && state.yourAnswer === null;
  const round = state.round;
  useEffect(() => {
    if (!answeredFirst || state.countdownEnd === null) return;
    const seconds = Math.round((state.countdownEnd - clock.now()) / 1000);
    // Only a real snap: the full countdown (or Gotta Go Fast's), not a clock that was already lower.
    if (seconds !== TIMING.countdownMs / 1000 && seconds !== TIMING.fastCountdownMs / 1000) return;
    setShown({ round, seconds });
    const id = window.setTimeout(() => setShown(null), FX.calloutMs);
    return () => window.clearTimeout(id);
    // Once per round, when the opponent's answer arrives.
  }, [answeredFirst, round]);
  return shown && shown.round === round ? shown.seconds : null;
}

/** The question's time as a thin drain: text colour, red under 5 seconds, muted once you answered. */
function QuestionDrain({ state, clock }: { state: MatchUiState; clock: MatchClock }) {
  const ref = useRef<HTMLDivElement>(null);
  const q = state.question;
  useFrame(clock, state.phase === "question" && q !== null, (now) => {
    const el = ref.current;
    if (!el || !q) return;
    const answered = state.yourAnswer !== null;
    const end = answered ? (state.countdownEnd ?? now) : (state.yourDeadline ?? q.deadline);
    const left = Math.max(0, end - now);
    el.style.transform = `scaleX(${Math.min(1, left / q.timerMs)})`;
    el.style.background = answered ? "var(--color-muted)" : left <= FX.tickFromS * 1000 ? "var(--color-wrong)" : "var(--color-text)";
  });
  return (
    <div className="h-1 w-full overflow-hidden bg-border" aria-hidden>
      <div ref={ref} className="h-full origin-left bg-text" style={{ transform: "scaleX(1)" }} />
    </div>
  );
}

function DamagePlate({ reveal, hit, opponentName }: { reveal: RevealPayload; hit: HitView; opponentName: string }) {
  const line = hitLine(reveal, opponentName, SCORING);
  const note = hitNote(reveal, SCORING);
  // Twice the size on a Bibi hit. A hit where both were right (speed only) is a quiet plate.
  const quiet = hit.speed && !hit.bibi;
  return (
    <div
      key={hit.seq}
      className={`rq-drop flex flex-col items-center px-4 pt-1.5 pb-2 text-center ${quiet ? "bg-surface text-text" : "bg-gold text-bg"}`}
      role="status"
    >
      <span className={`rq-display font-bold ${hit.bibi ? "text-[64px] leading-[68px]" : "text-[32px] leading-9"}`}>{`−${fmtInt(hit.amount)}`}</span>
      {line && <span className={`font-semibold ${hit.bibi ? "text-lg leading-6" : "text-sm leading-5"}`}>{line}</span>}
      {note && <span className={`text-[13px] leading-[18px] ${quiet ? "text-muted" : ""}`}>{note}</span>}
    </div>
  );
}

function QuickLine({ fx }: { fx: QuickFx }) {
  return (
    <span className="rq-fade flex items-center gap-1.5 text-sm leading-5 text-muted">
      <PowerupIcon id={fx.powerup} size={14} />
      {fx.powerup === "fifty" ? LINES.fiftyOpponent : LINES.fastOpponent}
    </span>
  );
}

interface Props {
  state: MatchUiState;
  clock: MatchClock;
  /** A hit that has landed this reveal (after the answers were marked). */
  hit: HitView | null;
  /** The reveal's answers are marked. */
  marked: boolean;
  /** The opponent's quick power-up line, while it shows. */
  opponentQuick: QuickFx | null;
  /** "Opponent disconnected · 0:38", or null. */
  forfeitLine: string | null;
  /** The arming callout, during arming and the banner. */
  arming: ReactNode;
}

export function CalloutBand({ state, clock, hit, marked, opponentQuick, forfeitLine, arming }: Props) {
  const snap = useSnapCallout(state, clock);
  const name = state.opponent?.name ?? "Opponent";
  const status = (() => {
    if (state.phase !== "question") return null;
    if (state.answerRejected) return LINES.tooLate;
    if (state.yourAnswer !== null) return state.opponentAnswered ? null : `Waiting for ${name}`;
    if (state.opponentAnswered) return `${name} answered`;
    return null;
  })();

  if (state.phase === "arming" || state.phase === "banner") {
    return <div className="flex min-h-0 flex-1 flex-col">{arming}</div>;
  }

  const reveal = state.phase === "reveal" ? state.reveal : null;
  const quietLine = reveal && marked && reveal.damageToYou === 0 && reveal.damageToOpponent === 0 ? damageLine(reveal, SCORING) : null;

  return (
    <div className="flex min-h-16 flex-1 flex-col items-center px-4" aria-live="polite">
      {reveal && hit ? (
        <div className="flex flex-1 flex-col items-center pt-2.5">
          <DamagePlate reveal={reveal} hit={hit} opponentName={name} />
        </div>
      ) : (
        <>
          {state.phase === "question" && (
            <div className="w-full pt-2">
              <QuestionDrain state={state} clock={clock} />
            </div>
          )}
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 py-2">
            {snap !== null && (
              <span key={`snap-${state.round}`} className="rq-callout rq-display rq-outline text-[40px] leading-[44px] font-bold tracking-[0.02em] uppercase italic">
                {`${snap} seconds`}
              </span>
            )}
            {quietLine && <span className="rq-fade text-sm leading-5 text-muted">{quietLine}</span>}
            {status && <span className="text-sm leading-5 text-muted">{status}</span>}
            {opponentQuick && <QuickLine key={opponentQuick.seq} fx={opponentQuick} />}
            {forfeitLine && <span className="rq-pulse text-sm leading-5 text-text">{forfeitLine}</span>}
          </div>
          {state.phase === "question" && state.question?.type === "multi" && (
            <span className="self-start pb-2 text-sm leading-5 text-muted">{LINES.selectAll}</span>
          )}
        </>
      )}
    </div>
  );
}
