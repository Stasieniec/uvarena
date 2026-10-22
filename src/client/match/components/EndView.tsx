// End screen: WIN, LOSS or DRAW, the rating change counting up, a short
// summary, and Rematch / Play again / Review missed / Home.

import type { CSSProperties, ReactNode } from "react";
import type { MatchMode, RatingChange } from "@shared/game/types";
import type { MatchEndPayload, PlayerView, RematchState } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { POWERUP_NAMES, endReasonLine, resultWord } from "../copy";
import { fmtClock, fmtInt, fmtRating, fmtSeconds, fmtSigned } from "../format";
import { FX } from "../fx";
import { Avatar } from "./Avatar";
import { useCountTo, useNow } from "./hooks";
import { PowerupIcon } from "./icons";
import { modeAccent } from "./Phases";

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

const WORD_STYLE: Record<string, { color: string; glow: string }> = {
  WIN: { color: "var(--color-zeus)", glow: "0 0 40px rgba(245,197,66,0.65), 0 4px 0 #6b4500" },
  LOSS: { color: "#c7cbe0", glow: "0 0 30px rgba(239,68,68,0.45), 0 4px 0 #000" },
  DRAW: { color: "var(--color-text)", glow: "0 0 30px rgba(255,255,255,0.3), 0 4px 0 #000" },
  VOID: { color: "var(--color-muted)", glow: "0 4px 0 #000" },
  CANCELLED: { color: "var(--color-muted)", glow: "0 4px 0 #000" },
};

function RatingLine({ label, change, note }: { label: string; change: RatingChange; note?: string }) {
  const shown = useCountTo(change.after, FX.ratingCountMs, change.before);
  const delta = shown - change.before;
  const q = change.provisional;
  const color = delta > 0 ? "text-correct" : delta < 0 ? "text-wrong" : "text-muted";
  return (
    <div className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-white/10">
      <div className="text-[11px] font-semibold tracking-[0.15em] text-muted uppercase">{label}</div>
      <div className="mt-1 flex items-baseline gap-2 text-2xl font-bold tabular-nums">
        <span className="text-text/70">{fmtRating(change.before, q)}</span>
        <span className="text-muted">{"→"}</span>
        <span>{fmtRating(shown, q)}</span>
        <span className={`text-lg ${color}`}>({fmtSigned(delta)})</span>
      </div>
      {note && <p className="mt-1.5 text-[13px] leading-snug text-muted">{note}</p>}
    </div>
  );
}

function NextBotCard({ next, onFight, pending, error }: { next: NextBot; onFight?(level: number): void; pending: boolean; error: string | null }) {
  if (next.level === null || next.name === null) {
    return (
      <div className="rq-rise rounded-2xl border border-bot/50 bg-gradient-to-br from-[#14306e] to-surface px-4 py-3 text-sm">
        <span className="font-semibold text-[#bfdbfe]">{next.beatenName} beaten.</span> That was the top of the ladder.
      </div>
    );
  }
  const level = next.level;
  return (
    <div className="rq-rise rounded-2xl border border-bot/60 bg-gradient-to-br from-[#14306e] to-surface px-4 py-3" style={{ animationDelay: "700ms" }}>
      <div className="flex items-center gap-3">
        <Avatar name={next.name} url={null} size={44} ring="var(--color-bot)" bot />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-[0.15em] text-[#93c5fd] uppercase">{next.unlocked ? "Unlocked" : "Next on the ladder"}</div>
          <div className="rq-display text-lg leading-tight font-bold">{next.unlocked ? `${next.name} unlocked` : next.name}</div>
          {next.line && <div className="text-[13px] leading-snug text-muted">{next.line}</div>}
        </div>
      </div>
      {onFight && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onFight(level)}
          className="mt-3 h-12 w-full rounded-xl bg-bot font-bold text-white active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Starting" : `Fight ${next.name}`}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-wrong">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface/80 px-3 py-2.5 ring-1 ring-white/5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function EndView(props: Props) {
  const { result, mode, rated, rematch, clock, connected } = props;
  const word = resultWord(result.result);
  const style = WORD_STYLE[word]!;
  const reason = endReasonLine(result.reason, result.result, props.opponent?.name ?? null);
  const accent = modeAccent(mode);
  const now = useNow(clock, 250, rematch?.until != null);
  const s = result.summary;
  const counted = result.result !== "void" && result.result !== "cancelled";

  const rematchOpen = rematch?.until != null && now < rematch.until && !rematch.matchId;
  const rematchLeft = rematch?.until != null ? fmtClock(rematch.until - now) : "";
  let rematchLabel = "Rematch";
  if (mode === "bot") rematchLabel = "Rematch";
  else if (rematch?.you && !rematch.opponent) rematchLabel = `Waiting for them · ${rematchLeft}`;
  else if (rematch?.opponent && !rematch.you) rematchLabel = `Accept rematch · ${rematchLeft}`;
  else if (rematchOpen) rematchLabel = `Rematch · ${rematchLeft}`;
  if (rematch?.matchId) rematchLabel = "Starting rematch";
  const showRematch = result.rematchUntil !== null && mode !== "ranked";

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)]">
      <div className="text-center text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: accent.color }}>
        {accent.label}
        {mode !== "bot" ? ` · ${rated ? "Rated" : "Unrated"}` : ""}
      </div>
      <div className="mt-4 mb-1 text-center">
        <div className="rq-result rq-display leading-none font-black" style={{ fontSize: word.length > 4 ? "min(14vw, 64px)" : "min(26vw, 120px)", color: style.color, textShadow: style.glow }}>
          {word}
        </div>
        {reason && <p className="mt-3 text-sm text-text/80">{reason}</p>}
        {counted && (
          <p className="mt-2 text-sm text-muted tabular-nums">
            <span className="text-you">You {fmtInt(result.hp.you)}</span> {"·"}{" "}
            <span className="text-opponent">
              {fmtInt(result.hp.opponent)} {props.opponent?.name ?? "Opponent"}
            </span>{" "}
            {"·"} {result.rounds} {result.rounds === 1 ? "round" : "rounds"}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {result.ranked && <RatingLine label="Ranked rating" change={result.ranked} />}
        {result.bot && (
          <RatingLine
            label="Bot rating"
            change={result.bot}
            note={`Bot rating follows your answers, not the result. ${s.correct} of ${result.rounds} right.`}
          />
        )}
        {props.nextBot && <NextBotCard next={props.nextBot} onFight={props.onFightBot} pending={props.fightPending ?? false} error={props.fightError ?? null} />}
        {counted && !result.ranked && !result.bot && mode !== "bot" && (
          <div className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted ring-1 ring-white/10">Unrated. Your ranked rating did not move.</div>
        )}
        {result.pairCapped && (
          <p className="text-xs text-muted">You two have played your rated games for today. This one did not move ratings.</p>
        )}
      </div>

      {counted && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Right" value={`${s.correct} of ${result.rounds}`} />
          <Stat label="Fastest right" value={s.fastestMs !== null ? fmtSeconds(s.fastestMs) : "None"} />
          <Stat label="Biggest hit" value={s.biggestHit > 0 ? fmtInt(s.biggestHit) : "None"} />
          <Stat
            label="Power-ups used"
            value={
              s.powerupsUsed.length ? (
                <span className="flex gap-1.5" aria-label={s.powerupsUsed.map((p) => POWERUP_NAMES[p]).join(", ")}>
                  {s.powerupsUsed.map((p) => (
                    <PowerupIcon key={p} id={p} size={22} />
                  ))}
                </span>
              ) : (
                "None"
              )
            }
          />
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-6">
        {showRematch && (
          <button
            type="button"
            disabled={!rematchOpen || rematch?.you === true || !connected}
            onClick={props.onRematch}
            className={`h-14 rounded-xl text-lg font-bold transition active:scale-[0.98] disabled:opacity-60 ${
              rematch?.opponent && !rematch.you ? "rq-glow bg-zeus text-bg" : "bg-you text-bg"
            }`}
            style={{ "--rq-glow": "var(--color-zeus)" } as CSSProperties}
          >
            {rematchOpen || rematch?.matchId ? rematchLabel : "Rematch expired"}
          </button>
        )}
        {mode === "ranked" && (
          <button type="button" onClick={props.onPlayAgain} className="h-14 rounded-xl bg-ranked text-lg font-bold text-white active:scale-[0.98]">
            {result.result === "cancelled" ? "Back to the queue" : "Play again"}
          </button>
        )}
        {result.missedCount > 0 && (
          <button type="button" onClick={props.onReviewMissed} className="h-12 rounded-xl bg-surface-2 font-semibold ring-1 ring-white/10 active:scale-[0.98]">
            Review missed ({result.missedCount})
          </button>
        )}
        <button type="button" onClick={props.onHome} className="h-12 rounded-xl font-semibold text-muted ring-1 ring-white/10 active:scale-[0.98]">
          Home
        </button>
      </div>
    </div>
  );
}
