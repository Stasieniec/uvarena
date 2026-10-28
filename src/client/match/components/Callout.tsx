// The event lane: the flexible space between the HUD and the question card.
// It takes the spare height and is where events land, so nothing floats over
// text. At rest it shows the round number; when the opponent answers,
// "10 SECONDS" (5 under Gotta Go Fast); on a hit, the yellow damage plate that
// drops from the clock; the K.O.; and the opponent's disconnect countdown.
// Your quick power-up strips and the blind banners take the lane over.

import { useEffect, useState, type ReactNode } from "react";
import { SCORING, TIMING } from "@shared/game/config";
import type { RevealPayload } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { LINES } from "../copy";
import { damageLine, fmtInt, fmtMultiplier, hitLine, hitNote } from "../format";
import { FX } from "../fx";
import type { MatchUiState, QuickFx } from "../state";
import type { HitView } from "./Hud";
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

function DamagePlate({ reveal, hit, opponentName }: { reveal: RevealPayload; hit: HitView; opponentName: string }) {
  const line = hitLine(reveal, opponentName, SCORING);
  const note = hitNote(reveal, SCORING);
  // A hit where both were right (speed only) is a quiet plate; a Bibi hit is twice the size.
  const quiet = hit.speed && !hit.bibi;
  return (
    <div key={hit.seq} className="rq-drop">
      <div
        className={`flex flex-col items-center text-center ${hit.big ? "rq-hit-shake" : ""} ${quiet ? "bg-surface text-text" : "bg-gold text-bg"} ${hit.bibi ? "px-6 pt-2.5 pb-3" : "px-4 pt-1.5 pb-2"}`}
        role="status"
      >
        {hit.bibi && <span className="rq-plate-name bg-bg px-2 text-[15px] leading-5 text-gold">
            Bibi <span className="normal-case">x{SCORING.bibiFactor}</span>
          </span>}
        <span className={`rq-display font-bold ${hit.bibi ? "text-[64px] leading-[64px]" : "text-[32px] leading-9"}`}>{`−${fmtInt(hit.amount)}`}</span>
        {line && <span className={`font-semibold ${hit.bibi ? "text-base leading-[22px]" : "text-sm leading-5"}`}>{line}</span>}
        {note && <span className={`text-[13px] leading-[18px] ${quiet ? "text-muted" : ""}`}>{note}</span>}
      </div>
    </div>
  );
}

function Knockout({ state, hit }: { state: MatchUiState; hit: HitView }) {
  const r = state.reveal!;
  const line = `−${fmtInt(hit.amount)} · ${state.you?.name ?? "You"} ${fmtInt(r.yourScore)} · ${state.opponent?.name ?? "Them"} ${fmtInt(r.opponentScore)} · ${fmtMultiplier(r.multiplier)}`;
  const youWon = r.hp.opponent === 0 && r.hp.you > 0;
  return (
    <div className="flex flex-col items-center" role="status" aria-live="assertive">
      <span className="rq-ko rq-display text-[min(144px,17dvh)] leading-[0.89] font-bold tracking-[-0.01em] text-gold italic">K.O.</span>
      <span className="sr-only">{youWon ? `${state.opponent?.name ?? "Your opponent"} is out of HP.` : "You are out of HP."}</span>
      <span className="text-[15px] leading-[21px] text-muted">{line}</span>
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

function WifiOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

interface Props {
  state: MatchUiState;
  clock: MatchClock;
  /** A hit that has landed this reveal. */
  hit: HitView | null;
  /** The last hit emptied a bar. */
  knockout: boolean;
  /** The reveal's answers are marked. */
  marked: boolean;
  /** The opponent's quick power-up line, while it shows. */
  opponentQuick: QuickFx | null;
  /** Null while the opponent is connected; "" when away without a forfeit clock; "0:38" otherwise. */
  forfeitIn: string | null;
  /** What takes the whole lane over: the arming callout, a blind banner, or your quick power-up strip. */
  takeover: ReactNode | null;
}

export function EventLane({ state, clock, hit, knockout, marked, opponentQuick, forfeitIn, takeover }: Props) {
  const snap = useSnapCallout(state, clock);
  const name = state.opponent?.name ?? "Opponent";

  if (takeover) return <div className="flex min-h-[112px] flex-1 flex-col">{takeover}</div>;

  const reveal = state.phase === "reveal" ? state.reveal : null;
  // At rest the lane holds only the round number and may shrink away on a short phone; events keep 56 px.
  let eventful = hit !== null || forfeitIn !== null;
  let body: ReactNode;
  if (reveal && hit && knockout) {
    body = <Knockout state={state} hit={hit} />;
  } else if (reveal && hit) {
    body = <DamagePlate reveal={reveal} hit={hit} opponentName={name} />;
  } else if (forfeitIn !== null) {
    body = (
      <>
        <span className="flex items-center gap-2 text-[17px] leading-6 font-semibold">
          <WifiOff />
          {`${name} disconnected`}
        </span>
        {forfeitIn && (
          <span className="rq-display text-[56px] leading-[56px] font-bold" aria-label={`${forfeitIn} to come back`}>
            {forfeitIn}
          </span>
        )}
        <span className="text-sm leading-5 text-muted">Rounds keep going. If they are not back, you win.</span>
      </>
    );
  } else {
    const quiet = reveal && marked && reveal.damageToYou === 0 && reveal.damageToOpponent === 0 ? damageLine(reveal, SCORING) : null;
    let status: string | null = null;
    if (state.phase === "question") {
      if (state.answerRejected) status = LINES.tooLate;
      else if (state.yourAnswer !== null && !state.opponentAnswered) status = `Waiting for ${name}`;
      else if (state.opponentAnswered && state.yourAnswer === null) status = `${name} answered`;
    }
    const round = state.suddenDeath > 0 ? "Sudden death" : state.round > 0 ? `Round ${state.round}` : null;
    eventful = snap !== null || quiet !== null || status !== null || opponentQuick !== null;
    body = (
      <>
        {snap !== null ? (
          <span key={`snap-${state.round}`} className="rq-callout rq-display rq-outline text-[40px] leading-[44px] font-bold tracking-[0.02em] uppercase italic">
            {`${snap} seconds`}
          </span>
        ) : (
          round &&
          !quiet && (
            <span key={`round-${state.round}`} className="rq-round rq-round-rest rq-display text-[32px] leading-9 font-bold tracking-[0.02em] text-muted uppercase italic">
              {round}
            </span>
          )
        )}
        {quiet && <span className="rq-fade text-sm leading-5 text-muted">{quiet}</span>}
        {status && <span className="text-sm leading-5 text-muted">{status}</span>}
        {opponentQuick && <QuickLine key={opponentQuick.seq} fx={opponentQuick} />}
      </>
    );
  }

  return (
    <div
      // A damage plate or K.O. keeps its full height (the answers scroll instead); otherwise the lane may shrink to 56 px.
      className={`flex flex-1 flex-col items-center gap-1 px-4 text-center ${hit ? "" : eventful ? "min-h-14" : "rq-lane-rest min-h-0 overflow-hidden"} ${reveal && hit && !knockout ? "justify-start pt-1.5 pb-3.5" : "justify-center py-2"}`}
      aria-live="polite"
    >
      {body}
    </div>
  );
}
