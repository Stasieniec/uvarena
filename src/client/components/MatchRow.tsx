// One line in a match list: opponent, mode, result, rating change, when.
import { Link } from "react-router";
import type { MatchSummary } from "@shared/api-schemas";
import { formatAgo, formatDelta } from "../lib/format";
import { Avatar, BotAvatar } from "./Avatar";
import { ChevronRightIcon } from "./icons";
import { cx } from "./ui";

const RESULT_LABEL: Record<MatchSummary["result"], string> = { win: "Win", loss: "Loss", draw: "Draw", void: "Void" };
const RESULT_CLASS: Record<MatchSummary["result"], string> = {
  win: "bg-correct/15 text-correct",
  loss: "bg-wrong/15 text-wrong",
  draw: "bg-surface-2 text-muted",
  void: "bg-surface-2 text-muted",
};

export function modeLabel(m: Pick<MatchSummary, "mode" | "rated">): string {
  if (m.mode === "bot") return "Bot match";
  if (m.mode === "ranked") return "Ranked";
  return m.rated ? "Friend, rated" : "Friend";
}

const REASON_NOTE: Partial<Record<MatchSummary["endReason"], string>> = {
  surrender: "surrendered",
  abandon: "left",
  void: "void",
  rounds: "on HP",
};

export function MatchRow({ match, courseLabel }: { match: MatchSummary; courseLabel?: string }) {
  const name = match.opponent ? match.opponent.displayUsername : (match.bot?.name ?? "Bot");
  const note = REASON_NOTE[match.endReason];
  return (
    <Link
      to={`/matches/${match.id}`}
      className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2 transition hover:border-muted/50"
    >
      {match.opponent ? <Avatar user={match.opponent} size={40} /> : <BotAvatar name={name} size={40} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name}</span>
        <span className="block truncate text-xs text-muted">
          {modeLabel(match)}
          {courseLabel ? ` · ${courseLabel}` : ""}
          {note ? ` · ${note}` : ""} · {formatAgo(match.endedAt)}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className={cx("rounded-xs px-2 py-0.5 text-sm font-semibold", RESULT_CLASS[match.result])}>{RESULT_LABEL[match.result]}</span>
        {match.ratingChange !== null ? (
          <span className={cx("text-sm font-semibold tabular-nums", match.ratingChange > 0 ? "text-correct" : match.ratingChange < 0 ? "text-wrong" : "text-muted")}>
            {formatDelta(match.ratingChange)}
          </span>
        ) : null}
      </span>
      <ChevronRightIcon size={18} className="text-muted" />
    </Link>
  );
}
