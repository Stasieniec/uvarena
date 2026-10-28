// End screen: VICTORY or DEFEAT in condensed italic capitals, both final HP in
// the player colours, the rating change as one big number, a condensed stats
// table, then one yellow primary action and plain text buttons for the rest.

import type { ReactNode } from "react";
import type { MatchMode, RatingChange } from "@shared/game/types";
import type { MatchEndPayload, PlayerView, RematchState } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { POWERUP_NAMES, endReasonLine, resultWord, type ResultWord } from "../copy";
import { fmtClock, fmtInt, fmtRating, fmtSeconds, fmtSigned } from "../format";
import { FX } from "../fx";
import { Avatar } from "./Avatar";
import { useCountTo, useNow } from "./hooks";
import { modeLabel } from "./Phases";

/** The ladder step after a win against a ladder bot. */
export interface NextBot {
  /** Null at the top of the ladder. */
  level: number | null;
  name: string | null;
  line: string | null;
  /** This win unlocked it (it was locked before the match). */
  unlocked: boolean;
  beatenName: string;
}

interface Props {
  result: MatchEndPayload;
  mode: MatchMode | null;
  rated: boolean;
  /** The course title, when known. */
  course?: string | null;
  you: PlayerView | null;
  opponent: PlayerView | null;
  rematch: RematchState | null;
  clock: MatchClock;
  connected: boolean;
  onRematch(): void;
  onPlayAgain(): void;
  onReviewMissed(): void;
  onHome(): void;
  nextBot?: NextBot | null;
  onFightBot?(level: number): void;
  fightPending?: boolean;
  fightError?: string | null;
}

const SHOWN_WORD: Record<ResultWord, string> = {
  WIN: "VICTORY",
  LOSS: "DEFEAT",
  DRAW: "DRAW",
  VOID: "VOID",
  CANCELLED: "CANCELLED",
};

function RatingCard({ label, change, note }: { label: string; change: RatingChange; note?: string }) {
  const shown = useCountTo(change.after, FX.ratingCountMs, change.before);
  const q = change.provisional;
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div className="plate flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm leading-5 text-muted">{label}</span>
          <span className="rq-display flex items-center gap-1.5 text-2xl leading-7 font-semibold whitespace-nowrap">
            {fmtRating(change.before, q)}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="to">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
            {fmtRating(change.after, q)}
          </span>
        </div>
        <span className="rq-display text-[64px] leading-[64px] font-bold" aria-label={`Change ${fmtSigned(change.after - change.before)}`}>
          {fmtSigned(shown - change.before)}
        </span>
      </div>
      {note && <p className="text-sm leading-5 text-muted">{note}</p>}
    </section>
  );
}

function NextBotCard({ next, onFight, pending, error }: { next: NextBot; onFight?(level: number): void; pending: boolean; error: string | null }) {
  if (next.level === null || next.name === null) {
    return (
      <p className="text-[15px] leading-[22px]">
        <span className="font-semibold">Beaten: {next.beatenName}.</span> That was the top of the ladder.
      </p>
    );
  }
  return (
    <div className="plate flex items-center gap-3 px-4 py-3">
      <Avatar name={next.name} url={null} size={40} ring="var(--color-border)" bot />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-5 text-muted">{next.unlocked ? "Unlocked" : "Next on the ladder"}</div>
        <div className="text-[17px] leading-6 font-semibold">{next.name}</div>
        {next.line && <div className="text-sm leading-5 text-muted">{next.line}</div>}
      </div>
      {error && onFight && <p className="text-sm text-wrong">{error}</p>}
      {pending && <span className="text-sm text-muted">Starting</span>}
    </div>
  );
}

function StatRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex h-11 items-center justify-between gap-3 ${last ? "" : "border-b border-border"}`}>
      <dt className="text-[15px] text-muted">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function Big({ children }: { children: ReactNode }) {
  return <span className="rq-display text-2xl font-bold">{children}</span>;
}

function TextButton({ onClick, disabled, children }: { onClick(): void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="h-12 min-w-0 px-2 text-base font-semibold text-text disabled:text-muted">
      {children}
    </button>
  );
}

export function EndView(props: Props) {
  const { result, mode, rated, rematch, clock, connected } = props;
  const word = SHOWN_WORD[resultWord(result.result)];
  const reason = endReasonLine(result.reason, result.result, props.opponent?.name ?? null);
  const now = useNow(clock, 250, rematch?.until != null);
  const course = props.course ?? null;
  const s = result.summary;
  const counted = result.result !== "void" && result.result !== "cancelled";
  const opponentName = props.opponent?.name ?? "Opponent";
  const youName = props.you?.name ?? "You";

  const rematchOpen = rematch?.until != null && now < rematch.until && !rematch.matchId;
  const rematchLeft = rematch?.until != null ? fmtClock(rematch.until - now) : "";
  let rematchLabel = "Rematch";
  if (rematch?.you && !rematch.opponent) rematchLabel = `Waiting for them · ${rematchLeft}`;
  else if (rematch?.opponent && !rematch.you) rematchLabel = `Accept rematch · ${rematchLeft}`;
  else if (rematchOpen) rematchLabel = `Rematch · ${rematchLeft}`;
  if (rematch?.matchId) rematchLabel = "Starting rematch";
  if (!rematchOpen && !rematch?.matchId) rematchLabel = "Rematch expired";
  const showRematch = result.rematchUntil !== null && mode !== "ranked";
  const rematchDisabled = !rematchOpen || rematch?.you === true || !connected;

  const next = props.nextBot ?? null;
  const fightLevel = next && next.level !== null && props.onFightBot ? next.level : null;

  // One primary action: the queue after ranked, the next bot after a ladder win, otherwise the rematch.
  type Action = { label: string; onClick(): void; disabled?: boolean };
  let primary: Action | null = null;
  const secondary: Action[] = [];
  const rematchAction: Action | null = showRematch ? { label: rematchLabel, onClick: props.onRematch, disabled: rematchDisabled } : null;
  if (mode === "ranked") {
    primary = { label: result.result === "cancelled" ? "Back to the queue" : "Play again", onClick: props.onPlayAgain };
  } else if (fightLevel !== null) {
    primary = { label: props.fightPending ? "Starting" : "Play the next bot", onClick: () => props.onFightBot!(fightLevel), disabled: props.fightPending };
    if (rematchAction) secondary.push(rematchAction);
  } else if (rematchAction) {
    primary = rematchAction;
  }
  if (result.missedCount > 0) secondary.push({ label: `Review missed (${result.missedCount})`, onClick: props.onReviewMissed });
  secondary.push({ label: "Home", onClick: props.onHome });

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="flex justify-between gap-4 text-sm leading-5 text-muted">
        <span className="truncate">
          {modeLabel(mode)}
          {course ? ` · ${course}` : ""}
          {mode === "private" ? ` · ${rated ? "Rated" : "Unrated"}` : ""}
        </span>
        {counted && <span className="shrink-0">{result.rounds === 1 ? "1 round" : `${result.rounds} rounds`}</span>}
      </div>

      <section aria-label="Result" className="mt-8 flex flex-col items-center">
        <span
          className={`rq-land rq-display font-bold tracking-[0.01em] italic ${word.length > 7 ? "text-[64px] leading-[64px]" : "text-[88px] leading-[88px]"}`}
        >
          {word}
        </span>
        {reason && <p className="mt-2 text-center text-[15px] leading-[22px] text-muted">{reason}</p>}
        {counted && (
          <div className="mt-5 grid grid-cols-2 gap-x-4 self-stretch">
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              <span className="rq-plate-name max-w-full truncate bg-you px-2 py-px text-[17px] leading-[22px] text-bg">{youName}</span>
              <span className="rq-display text-5xl leading-[52px] font-bold text-you">{fmtInt(result.hp.you)}</span>
            </div>
            <div className="flex min-w-0 flex-col items-end gap-1.5">
              <span className="rq-plate-name max-w-full truncate bg-opponent px-2 py-px text-[17px] leading-[22px] text-bg">{opponentName}</span>
              <span className="rq-display text-5xl leading-[52px] font-bold text-opponent">{fmtInt(result.hp.opponent)}</span>
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 flex flex-col gap-4">
        {result.ranked && <RatingCard label="Ranked rating" change={result.ranked} />}
        {result.bot && (
          <RatingCard label="Bot rating" change={result.bot} note={`Bot rating follows your answers, not the result. ${s.correct} of ${result.rounds} right.`} />
        )}
        {next && <NextBotCard next={next} onFight={props.onFightBot} pending={props.fightPending ?? false} error={props.fightError ?? null} />}
        {counted && !result.ranked && !result.bot && mode !== "bot" && <p className="text-sm leading-5 text-muted">Unrated. Your ranked rating did not move.</p>}
        {result.pairCapped && <p className="text-sm leading-5 text-muted">You two have played your rated games for today. This one did not move ratings.</p>}
      </div>

      {counted && (
        <dl className="mt-4 mb-0 flex flex-col">
          <StatRow label="Questions right">
            <Big>
              {s.correct}
              <span className="font-semibold text-muted"> / </span>
              {result.rounds}
            </Big>
          </StatRow>
          <StatRow label="Fastest right answer">
            <Big>{s.fastestMs !== null ? fmtSeconds(s.fastestMs) : "None"}</Big>
          </StatRow>
          <StatRow label="Biggest hit">
            <Big>{s.biggestHit > 0 ? fmtInt(s.biggestHit) : "None"}</Big>
          </StatRow>
          <StatRow label="Power-ups used" last>
            <span className="text-[15px] font-semibold">{s.powerupsUsed.length ? s.powerupsUsed.map((p) => POWERUP_NAMES[p]).join(", ") : "None"}</span>
          </StatRow>
        </dl>
      )}

      <div className="mt-auto flex flex-col gap-1.5 pt-6">
        {primary && (
          <div className="p-1">
            <button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled}
              className={`h-14 w-full rounded-xs text-2xl leading-7 ${primary.disabled ? "rq-display bg-surface font-bold text-muted" : "btn-primary"}`}
            >
              {primary.label}
            </button>
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${secondary.length}, minmax(0, 1fr))` }}>
          {secondary.map((a) => (
            <TextButton key={a.label} onClick={a.onClick} disabled={a.disabled}>
              {a.label}
            </TextButton>
          ))}
        </div>
      </div>
    </div>
  );
}
