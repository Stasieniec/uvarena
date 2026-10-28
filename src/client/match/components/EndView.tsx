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
import { useCountTo, useNow } from "./hooks";
import { modeLabel } from "./Phases";

/** The ladder step after a win against a ladder bot. */
export interface NextBot {
  /** Null at the top of the ladder. */
  level: number | null;
  name: string | null;
  line: string | null;
  /** Its bot rating, for the ladder row. */
  rating: number | null;
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

const RANK_LO = 1000;
const RANK_HI = 2200;

/** Where the rating sits on a 1,000 to 2,200 scale: the part it moved, and a marker at the new value. */
function RankBar({ from, to }: { from: number; to: number }) {
  const p = (v: number) => Math.max(0, Math.min(100, ((v - RANK_LO) / (RANK_HI - RANK_LO)) * 100));
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  return (
    <div aria-hidden>
      <div className="relative mt-3.5 h-2 bg-line">
        <span className="absolute inset-y-0 left-0 bg-muted" style={{ width: `${p(a)}%` }} />
        <span className="absolute inset-y-0" style={{ left: `${p(a)}%`, width: `${p(b) - p(a)}%`, background: to < from ? "var(--color-faint)" : "var(--color-text)" }} />
        <span className="absolute -inset-y-1 w-[3px] bg-text" style={{ left: `calc(${p(to)}% - 1px)` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[13px] leading-[18px] text-muted">
        <span>{RANK_LO}</span>
        <span>{RANK_HI}</span>
      </div>
    </div>
  );
}

function RatingCard({ label, change, note, big = 64 }: { label: string; change: RatingChange; note?: string; big?: number }) {
  const shown = useCountTo(change.after, FX.ratingCountMs, change.before);
  const q = change.provisional;
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div className="plate p-4">
        <div className="flex items-center justify-between gap-3">
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
          <span className="rq-display font-bold" style={{ fontSize: big, lineHeight: `${big}px` }} aria-label={`Change ${fmtSigned(change.after - change.before)}`}>
            {fmtSigned(shown - change.before)}
          </span>
        </div>
        <RankBar from={change.before} to={change.after} />
      </div>
      {note && <p className="text-sm leading-5 text-muted">{note}</p>}
    </section>
  );
}

/** Height of the per-answer bars: the line sits where the biggest gain and the biggest loss both fit. */
const STEP_AREA_PX = 44;
/** With no loss, the gains get this much and the line keeps a 16 px foot under it. */
const STEP_UP_ONLY_PX = 28;

/** One bar per answer: up in text colour above the line, down in faint below it, the change under each. */
function StepBars({ steps }: { steps: number[] }) {
  const up = Math.max(0, ...steps);
  const down = Math.max(0, ...steps.map((v) => -v));
  // One scale for both directions, so a bar's height always means the same rating change.
  const scale = down === 0 ? STEP_UP_ONLY_PX / Math.max(1, up) : STEP_AREA_PX / (up + down);
  const upPx = down === 0 ? STEP_UP_ONLY_PX : Math.round(up * scale);
  const downPx = STEP_AREA_PX - upPx;
  const px = (v: number) => Math.max(v === 0 ? 0 : 2, Math.round(Math.abs(v) * scale));
  const labels = steps.length <= 14;
  return (
    <div
      role="img"
      aria-label={`Rating change per answer: ${steps.map(fmtSigned).join(", ")}`}
      className="mt-2.5 grid"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, columnGap: steps.length > 14 ? 3 : 6 }}
    >
      {steps.map((v, i) => (
        <div key={i} className="flex min-w-0 flex-col items-center gap-1">
          <div className="flex w-full flex-col gap-1">
            <div className="flex w-full items-end" style={{ height: upPx }}>
              <span className="w-full bg-text" style={{ height: v > 0 ? px(v) : 0 }} />
            </div>
            <div className="flex w-full items-start border-t border-faint" style={{ height: downPx }}>
              <span className="w-full bg-faint" style={{ height: v < 0 ? px(v) : 0 }} />
            </div>
          </div>
          {labels && <span className={`rq-display text-sm leading-4 font-semibold ${v < 0 ? "text-muted" : "text-text"}`}>{fmtSigned(v)}</span>}
        </div>
      ))}
    </div>
  );
}

/** The bot rating with a bar per answer (bot matches finalized with steps). */
function BotStepsCard({ change, steps }: { change: RatingChange; steps: number[] }) {
  const shown = useCountTo(change.after, FX.ratingCountMs, change.before);
  const q = change.provisional;
  return (
    <section aria-label="Bot rating" className="plate px-4 pt-3.5 pb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm leading-5 text-muted">Bot rating, per answer</span>
          <span className="rq-display flex items-center gap-1.5 text-2xl leading-7 font-semibold whitespace-nowrap">
            {fmtRating(change.before, q)}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="to">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
            {fmtRating(change.after, q)}
          </span>
        </div>
        <span className="rq-display text-[56px] leading-[56px] font-bold" aria-label={`Change ${fmtSigned(Math.round(change.after) - Math.round(change.before))}`}>
          {fmtSigned(Math.round(shown) - Math.round(change.before))}
        </span>
      </div>
      <StepBars steps={steps} />
    </section>
  );
}

function UnlockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </svg>
  );
}

function NextBotCard({ next, pending, error }: { next: NextBot; pending: boolean; error: string | null }) {
  if (next.level === null || next.name === null) {
    return (
      <p className="text-[15px] leading-[22px]">
        <span className="font-semibold">Beaten: {next.beatenName}.</span> That was the top of the ladder.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 py-3 pr-3 pl-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <UnlockIcon />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-5 text-muted">{next.unlocked ? "Next bot unlocked" : "Next on the ladder"}</span>
        <span className="text-[17px] leading-[22px] font-semibold">{next.name}</span>
        {next.line && <span className="text-sm leading-5 text-muted">{next.line}</span>}
        {error && <span className="text-sm text-wrong">{error}</span>}
        {pending && <span className="text-sm text-muted">Starting</span>}
      </div>
      {next.rating !== null && <span className="rq-display text-[28px] leading-8 font-bold">{next.rating}</span>}
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
  const bot = mode === "bot";

  // One primary action: the queue after ranked, the next bot after a ladder win, otherwise the rematch.
  type Action = { label: string; onClick(): void; disabled?: boolean; arrow?: boolean };
  let primary: Action | null = null;
  const secondary: Action[] = [];
  const rematchAction: Action | null = showRematch ? { label: rematchLabel, onClick: props.onRematch, disabled: rematchDisabled } : null;
  if (mode === "ranked") {
    primary = { label: result.result === "cancelled" ? "Back to the queue" : "Play again", onClick: props.onPlayAgain };
  } else if (fightLevel !== null) {
    primary = { label: props.fightPending ? "Starting" : `Play ${next!.name}`, onClick: () => props.onFightBot!(fightLevel), disabled: props.fightPending, arrow: true };
    if (rematchAction) secondary.push({ ...rematchAction, label: rematchAction.disabled ? rematchAction.label : "Rematch" });
  } else if (rematchAction) {
    primary = rematchAction;
  }
  if (result.missedCount > 0) {
    secondary.push({ label: secondary.length > 0 ? `Missed (${result.missedCount})` : `Review missed (${result.missedCount})`, onClick: props.onReviewMissed });
  }
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

      <section aria-label="Result" className={`${bot ? "mt-6" : "mt-12"} flex flex-col items-center`}>
        <span
          className={`rq-land rq-display font-bold tracking-[0.01em] italic ${word.length > 7 ? "text-[64px] leading-[64px]" : bot ? "text-[80px] leading-[80px]" : "text-[88px] leading-[88px]"}`}
        >
          {word}
        </span>
        {reason && <p className="mt-2 text-center text-[15px] leading-[22px] text-muted">{reason}</p>}
        {counted && (
          <div className={`${bot ? "mt-3.5" : "mt-5"} grid grid-cols-2 gap-x-4 self-stretch`}>
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              <span className="rq-plate-name max-w-full truncate bg-you px-2 py-px text-[17px] leading-[22px] text-bg">{youName}</span>
              <span className={`rq-display font-bold text-you ${bot ? "text-[44px] leading-[48px]" : "text-5xl leading-[52px]"}`}>{fmtInt(result.hp.you)}</span>
            </div>
            <div className="flex min-w-0 flex-col items-end gap-1.5">
              <span className="rq-plate-name max-w-full truncate bg-opponent px-2 py-px text-[17px] leading-[22px] text-bg">{opponentName}</span>
              <span className={`rq-display font-bold text-opponent ${bot ? "text-[44px] leading-[48px]" : "text-5xl leading-[52px]"}`}>{fmtInt(result.hp.opponent)}</span>
            </div>
          </div>
        )}
      </section>

      <div className={`${bot ? "mt-6" : "mt-8"} flex flex-col gap-4`}>
        {result.ranked && <RatingCard label="Ranked rating" change={result.ranked} />}
        {result.bot && result.botRatingSteps && result.botRatingSteps.length > 0 && <BotStepsCard change={result.bot} steps={result.botRatingSteps} />}
        {result.bot && !result.botRatingSteps?.length && (
          <RatingCard label="Bot rating" big={56} change={result.bot} note={`Bot rating follows your answers, not the result. ${s.correct} of ${result.rounds} right.`} />
        )}
        {next && <NextBotCard next={next} pending={props.fightPending ?? false} error={props.fightError ?? null} />}
        {counted && !result.ranked && !result.bot && mode !== "bot" && <p className="text-sm leading-5 text-muted">Unrated. Your ranked rating did not move.</p>}
        {result.pairCapped && <p className="text-sm leading-5 text-muted">You two have played your rated games for today. This one did not move ratings.</p>}
      </div>

      {counted && !next && (
        <dl className="mt-5 mb-0 flex flex-col">
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
          <div className="p-[3px]">
            <button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled}
              className="btn-primary flex h-14 w-full items-center justify-center gap-2.5 rounded-xs text-2xl leading-7"
            >
              <span className="truncate">{primary.label}</span>
              {primary.arrow && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              )}
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
