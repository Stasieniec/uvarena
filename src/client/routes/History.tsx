// Match history (yours, or another player's with ?user=) and one match round by round.
import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import type { MatchDetailResponse } from "@shared/api-schemas";
import type { PowerupId } from "@shared/game/types";
import { answerIds } from "../lib/answers";
import { useCurrentCourse } from "../lib/course";
import { formatDate, formatDelta, formatNumber, formatRating, formatSeconds } from "../lib/format";
import { useMatchDetail, useMeData, useUserMatches } from "../lib/queries";
import { Page } from "../components/AppShell";
import { Avatar, BotAvatar } from "../components/Avatar";
import { CheckIcon, ChevronDownIcon, XIcon } from "../components/icons";
import { MatchRow, modeLabel } from "../components/MatchRow";
import { PowerupIcon, powerupInfo } from "../components/powerups";
import { OptionList, QuestionText, markOptions, optionRows } from "../components/QuestionView";
import { Button, EmptyState, ErrorState, LoadingBlocks, PageHeader, Pills, cx } from "../components/ui";

export function History() {
  const me = useMeData();
  const [params] = useSearchParams();
  const username = params.get("user") ?? me.user.username;
  const isSelf = !params.get("user") || params.get("user")?.toLowerCase() === me.user.username?.toLowerCase();
  const { courses } = useCurrentCourse();
  const [course, setCourse] = useState<string>("all");
  const list = useUserMatches(username, course === "all" ? null : course);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const titleOf = (id: string) => courses.find((c) => c.id === id)?.shortTitle;

  return (
    <Page>
      <PageHeader title={isSelf ? "Match history" : `${username}'s matches`} back />
      {courses.length > 1 ? (
        <div className="mb-4">
          <Pills label="Course" options={[{ value: "all", label: "All" }, ...courses.map((c) => ({ value: c.id, label: c.shortTitle }))]} value={course} onChange={setCourse} />
        </div>
      ) : null}
      {list.isPending ? (
        <LoadingBlocks count={5} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No matches yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((m) => (
            <MatchRow key={m.id} match={m} courseLabel={course === "all" ? titleOf(m.courseId) : undefined} />
          ))}
          {list.hasNextPage ? (
            <Button variant="secondary" className="mt-2" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Load more
            </Button>
          ) : null}
        </div>
      )}
    </Page>
  );
}

type Player = MatchDetailResponse["players"][number];
type Round = MatchDetailResponse["rounds"][number];
type RoundSide = Round["a"];

function playerName(p: Player): string {
  return p.user?.displayUsername ?? p.bot?.name ?? "Player";
}

function PlayerAvatar({ p, size, you }: { p: Player; size: number; you: boolean }) {
  if (p.user) return <Avatar user={p.user} size={size} ring={you ? "var(--color-you)" : "var(--color-opponent)"} />;
  return <BotAvatar name={p.bot?.name ?? "Bot"} size={size} />;
}

const REASON: Record<MatchDetailResponse["endReason"], string> = {
  hp: "Knockout",
  rounds: "Decided on HP after the last round",
  surrender: "Surrendered",
  abandon: "Left the match",
  void: "Void: both disconnected",
  no_show: "Cancelled: nobody showed up",
  expired: "Lobby expired",
  cancelled: "Cancelled",
};

function SideLine({ side, color, name }: { side: RoundSide; color: string; name: string }) {
  const used: PowerupId[] = [];
  if (side.armed) used.push(side.armed);
  if (side.quick) used.push(side.quick);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="sr-only">{name}:</span>
      {side.answer === null ? (
        <span className="text-xs text-muted">no answer</span>
      ) : side.correct ? (
        <CheckIcon size={16} className="shrink-0 text-correct" />
      ) : (
        <XIcon size={16} className="shrink-0 text-wrong" />
      )}
      {side.ms !== null ? <span className="text-xs text-muted tabular-nums">{formatSeconds(side.ms)}</span> : null}
      {used.map((p) => (
        <span key={p} title={powerupInfo(p).name}>
          <PowerupIcon id={p} size={16} />
        </span>
      ))}
    </div>
  );
}

function powerupNotes(side: RoundSide, name: string): string[] {
  const out: string[] = [];
  if (side.armed) out.push(`${name} armed ${powerupInfo(side.armed).name}.`);
  if (side.quick) out.push(`${name} used ${powerupInfo(side.quick).name}.`);
  return out;
}

function RoundCard({ round, mine, theirs, myName, theirName }: { round: Round; mine: RoundSide; theirs: RoundSide; myName: string; theirName: string }) {
  const [open, setOpen] = useState(false);
  const q = round.question;
  const dmgToMe = mine.damageTaken;
  const dmgToThem = theirs.damageTaken;
  const keyIds = answerIds(q.key);
  const myIds = answerIds(mine.answer);
  const rows = optionRows(q);
  const notes = [...powerupNotes(mine, myName), ...powerupNotes(theirs, theirName)];
  return (
    <li className="rounded-2xl border border-border bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-tap w-full items-start gap-3 px-3 py-3 text-left">
        <span className="flex w-10 shrink-0 flex-col items-center">
          <span className="font-display text-lg font-bold">{round.round}</span>
          <span className="text-[11px] text-muted">x{round.multiplier}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{q.prompt ?? q.statement}</span>
          <span className="mt-1 grid grid-cols-2 gap-2">
            <SideLine side={mine} color="var(--color-you)" name={myName} />
            <SideLine side={theirs} color="var(--color-opponent)" name={theirName} />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {dmgToThem > 0 ? (
            <span className="rounded-md bg-you/15 px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-you tabular-nums">Hit {formatNumber(dmgToThem)}</span>
          ) : dmgToMe > 0 ? (
            <span className="rounded-md bg-opponent/15 px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-opponent tabular-nums">Took {formatNumber(dmgToMe)}</span>
          ) : (
            <span className="text-xs text-muted">no damage</span>
          )}
          <ChevronDownIcon size={16} className={cx("text-muted transition", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-border px-3 pt-3 pb-4">
          <QuestionText question={q} fill={q.type === "cloze" ? (rows.find((r) => keyIds.includes(r.id))?.text ?? null) : null} />
          <OptionList
            question={q}
            marks={markOptions(rows, keyIds, myIds, q.type === "multi")}
            pickedLabel={myIds}
            otherPicks={answerIds(theirs.answer)}
            otherLabel={`${theirName}'s answer`}
          />
          <p className="text-sm leading-relaxed text-muted">{q.why}</p>
          <p className="text-xs text-muted">
            HP after: <span className="text-you">{formatNumber(mine.hpAfter)}</span> · <span className="text-opponent">{formatNumber(theirs.hpAfter)}</span>
          </p>
          {notes.length > 0 ? <p className="text-xs text-muted">{notes.join(" ")}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export function MatchDetail() {
  const { id = "" } = useParams();
  const me = useMeData();
  const match = useMatchDetail(id);

  return (
    <Page>
      <PageHeader title="Match" back />
      {match.isPending ? (
        <LoadingBlocks count={5} />
      ) : match.error ? (
        <ErrorState error={match.error} onRetry={() => void match.refetch()} />
      ) : (
        <MatchDetailBody data={match.data} meId={me.user.id} />
      )}
    </Page>
  );
}

function MatchDetailBody({ data, meId }: { data: MatchDetailResponse; meId: string }) {
  const myIndex = data.players[1].user?.id === meId ? 1 : 0;
  const mine = data.players[myIndex];
  const theirs = data.players[1 - myIndex]!;
  const iPlayed = mine.user?.id === meId;
  const mySide = mine.side;
  const result =
    data.status === "void" || data.winner === null ? "Void" : data.winner === "draw" ? "Draw" : data.winner === mySide ? (iPlayed ? "Win" : `${playerName(mine)} won`) : iPlayed ? "Loss" : `${playerName(theirs)} won`;
  const resultTone = result === "Win" ? "text-correct" : result === "Loss" ? "text-wrong" : "text-muted";
  const delta = mine.ratingBefore !== null && mine.ratingAfter !== null ? mine.ratingAfter - mine.ratingBefore : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
            <PlayerAvatar p={mine} size={56} you />
            <span className="w-full truncate text-sm font-semibold">{playerName(mine)}</span>
            <span className="text-xs text-you tabular-nums">{formatNumber(mine.hpEnd)} HP</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={cx("font-display text-3xl font-black", resultTone)}>{result.length <= 4 ? result.toUpperCase() : result}</span>
            {delta !== null ? (
              <span className="text-sm text-muted tabular-nums">
                {formatRating(mine.ratingBefore, false)} to {formatRating(mine.ratingAfter, false)} ({formatDelta(delta)})
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
            <PlayerAvatar p={theirs} size={56} you={false} />
            <span className="w-full truncate text-sm font-semibold">{playerName(theirs)}</span>
            <span className="text-xs text-opponent tabular-nums">{formatNumber(theirs.hpEnd)} HP</span>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          {modeLabel(data)} · {REASON[data.endReason]} · {data.roundsPlayed} rounds · {formatDate(data.endedAt)}
          {data.pairCapped ? " · daily rated limit reached, no rating change" : ""}
        </p>
      </section>

      {data.rounds.length === 0 ? (
        <EmptyState title={data.roundsHidden ? "Round detail is only visible to the two players." : "No rounds played"} />
      ) : (
        <ol className="flex flex-col gap-2">
          {data.rounds.map((r) => (
            <RoundCard
              key={r.round}
              round={r}
              mine={mySide === "a" ? r.a : r.b}
              theirs={mySide === "a" ? r.b : r.a}
              myName={iPlayed ? "You" : playerName(mine)}
              theirName={playerName(theirs)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
