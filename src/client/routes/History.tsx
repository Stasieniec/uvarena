// Match history (yours, or another player's with ?user=), grouped by day, and
// one match round by round: multiplier, power-ups, damage coloured by whose
// HP it hit, both answers with their times. Tap a round for the options and
// the explanation.
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { MatchDetailResponse, MatchSummary } from "@shared/api-schemas";
import type { PowerupId } from "@shared/game/types";
import { FALSE_ID, TRUE_ID, answerIds } from "../lib/answers";
import { useCurrentCourse } from "../lib/course";
import { formatNumber, formatSeconds } from "../lib/format";
import { useMatchDetail, useMeData, useUserMatches } from "../lib/queries";
import { Body, Icon, Screen, damage, dayLabel, signed, whenLabel } from "../components/after/ui";
import { powerupInfo } from "../components/powerups";
import { OptionList, QuestionText, markOptions, optionRows, plainPreview } from "../components/QuestionView";
import { ErrorState, LoadingPlates, PageHeader, Quiet, SelectChip, cx, secondaryClass } from "../components/ui";

type ModeFilter = "all" | "ranked" | "bot" | "private";

const MODE_OPTIONS: { value: ModeFilter; label: string }[] = [
  { value: "all", label: "All modes" },
  { value: "ranked", label: "Ranked" },
  { value: "bot", label: "Bot" },
  { value: "private", label: "Friend" },
];

const RESULT_WORD: Record<MatchSummary["result"], string> = { win: "Won", loss: "Lost", draw: "Drawn", void: "Void" };

const REASON_NOTE: Partial<Record<MatchSummary["endReason"], string>> = {
  surrender: "surrendered",
  abandon: "left early",
};

function modeLine(m: Pick<MatchSummary, "mode" | "rated" | "roundsPlayed" | "endReason">, course?: string): string {
  const parts: string[] = [];
  if (m.mode === "ranked") parts.push("Ranked");
  else if (m.mode === "bot") parts.push("Bot");
  else parts.push("Private", m.rated ? "rated" : "unrated");
  if (m.mode !== "private") parts.push(m.roundsPlayed === 1 ? "1 round" : `${m.roundsPlayed} rounds`);
  const note = REASON_NOTE[m.endReason];
  if (note) parts.push(note);
  if (course) parts.push(course);
  return parts.join(" · ");
}

function HistoryRow({ match, last, course }: { match: MatchSummary; last: boolean; course?: string }) {
  const name = match.opponent ? match.opponent.displayUsername : (match.bot?.name ?? "Bot");
  const won = match.result === "win";
  return (
    <li>
      <Link
        to={`/matches/${match.id}`}
        className={cx("grid h-14 grid-cols-[minmax(0,1fr)_48px_56px_16px] items-center gap-x-2", !last && "border-b border-line")}
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-base leading-5 font-semibold">{name}</span>
          <span className="truncate text-sm leading-5 text-muted">{modeLine(match, course)}</span>
        </span>
        <span className={cx("text-sm", won ? "text-text" : "text-muted")}>{RESULT_WORD[match.result]}</span>
        <span className={cx("text-right font-display text-[22px] font-bold", (match.ratingChange ?? 0) < 0 && "text-muted")}>
          {match.ratingChange !== null ? signed(match.ratingChange) : <span className="text-muted">·</span>}
        </span>
        <Icon name="right" size={16} stroke={2} className="text-muted" />
      </Link>
    </li>
  );
}

export function History() {
  const me = useMeData();
  const [params] = useSearchParams();
  const username = params.get("user") ?? me.user.username;
  const isSelf = !params.get("user") || params.get("user")?.toLowerCase() === me.user.username?.toLowerCase();
  const { courses } = useCurrentCourse();
  const [course, setCourse] = useState<string>("all");
  const [mode, setMode] = useState<ModeFilter>("all");
  const list = useUserMatches(username, course === "all" ? null : course);
  const all = list.data?.pages.flatMap((p) => p.items) ?? [];
  const items = mode === "all" ? all : all.filter((m) => m.mode === mode);
  const titleOf = (id: string) => (course === "all" && courses.length > 1 ? courses.find((c) => c.id === id)?.shortTitle : undefined);

  // Group by day, newest first (the API already sorts by end time).
  const groups: { day: string; items: MatchSummary[] }[] = [];
  for (const m of items) {
    const day = dayLabel(m.endedAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(m);
    else groups.push({ day, items: [m] });
  }

  return (
    <Screen>
      <PageHeader
        title={isSelf ? "Match history" : `${username}'s matches`}
        back
        right={<SelectChip label="Mode" value={mode} options={MODE_OPTIONS} onChange={setMode} className="max-w-[9.5rem] shrink-0" />}
      />
      <Body className="pb-4">
        {courses.length > 1 ? (
          <SelectChip
            label="Course"
            value={course}
            options={[{ value: "all", label: "All courses" }, ...courses.map((c) => ({ value: c.id, label: c.shortTitle }))]}
            onChange={setCourse}
            className="self-start"
          />
        ) : null}
        {list.isPending ? (
          <LoadingPlates className="mt-3" count={6} height={56} />
        ) : list.error ? (
          <ErrorState className="mt-3" error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <>
            {items.length === 0 && !list.hasNextPage ? <Quiet>{all.length === 0 ? "No matches yet." : "No matches in this mode yet."}</Quiet> : null}
            {groups.map((g) => (
              <section key={g.day}>
                <h2 className="m-0 mt-3 mb-0.5 text-sm leading-5 font-medium text-muted">{g.day}</h2>
                <ul className="m-0 list-none p-0">
                  {g.items.map((m, i) => (
                    <HistoryRow key={m.id} match={m} last={i === g.items.length - 1} course={titleOf(m.courseId)} />
                  ))}
                </ul>
              </section>
            ))}
            {list.hasNextPage ? (
              <button type="button" className={cx(secondaryClass, "mt-4 h-12 w-full")} onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? "Loading" : "Load more"}
              </button>
            ) : null}
          </>
        )}
      </Body>
    </Screen>
  );
}

type Player = MatchDetailResponse["players"][number];
type Round = MatchDetailResponse["rounds"][number];
type RoundSide = Round["a"];

function playerName(p: Player): string {
  return p.user?.displayUsername ?? p.bot?.name ?? "Player";
}

const REASON: Partial<Record<MatchDetailResponse["endReason"], string>> = {
  rounds: "Decided on HP after the last round.",
  surrender: "Ended by a surrender.",
  abandon: "Ended when a player left.",
  void: "Void: both disconnected.",
};

const POWERUP_ICON: Record<PowerupId, "bibi" | "shield" | "fifty" | "fast"> = { bibi: "bibi", shield: "shield", fifty: "fifty", fast: "fast" };

/** The text of an answer: option texts joined, True or False, or nothing. */
function answerText(round: Round, side: RoundSide): string | null {
  const ids = answerIds(side.answer);
  if (ids.length === 0) return null;
  if (round.question.type === "truefalse") return ids[0] === TRUE_ID ? "True" : ids[0] === FALSE_ID ? "False" : null;
  const texts = ids.map((id) => round.question.options.find((o) => o.id === id)?.text).filter((t): t is string => !!t);
  return texts.length > 0 ? texts.join(", ") : null;
}

function AnswerLine({ round, side, name, who }: { round: Round; side: RoundSide; name: string; who: "you" | "opponent" }) {
  const text = answerText(round, side);
  return (
    <span className="grid grid-cols-[64px_18px_minmax(0,1fr)_auto] items-center gap-x-1.5 text-sm leading-5">
      <span className={cx("truncate font-display text-sm font-bold tracking-[0.04em] uppercase", who === "you" ? "text-you" : "text-opponent")}>{name}</span>
      {side.correct ? <Icon name="check" size={14} stroke={2.6} label="right" /> : <Icon name="x" size={14} stroke={2.6} label="wrong" className="text-wrong" />}
      <span className={cx("truncate", !side.correct && "text-muted")}>{text ?? "No answer"}</span>
      <span className="text-muted">{side.ms !== null ? formatSeconds(side.ms) : ""}</span>
    </span>
  );
}

function powerupNotes(mine: RoundSide, theirs: RoundSide, myName: string, theirName: string): { id: PowerupId; text: string }[] {
  const out: { id: PowerupId; text: string }[] = [];
  const add = (id: PowerupId | null, who: string) => {
    if (id) out.push({ id, text: `${powerupInfo(id).name}, ${who}` });
  };
  add(mine.armed, myName);
  add(theirs.armed, theirName);
  add(mine.quick, myName);
  add(theirs.quick, theirName);
  return out;
}

function RoundItem({ round, mine, theirs, myName, theirName, last }: { round: Round; mine: RoundSide; theirs: RoundSide; myName: string; theirName: string; last: boolean }) {
  const [open, setOpen] = useState(false);
  const q = round.question;
  const keyIds = answerIds(q.key);
  const myIds = answerIds(mine.answer);
  const rows = optionRows(q);
  const notes = powerupNotes(mine, theirs, myName, theirName);
  // Damage takes the colour of the player whose HP it hit.
  const hit =
    theirs.damageTaken > 0
      ? { n: theirs.damageTaken, cls: "text-opponent", to: theirName }
      : mine.damageTaken > 0
        ? { n: mine.damageTaken, cls: "text-you", to: myName }
        : null;
  return (
    <li className={cx("flex flex-col gap-1.5 py-3", !last && "border-b border-line")}>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-display text-lg leading-[22px] font-bold">Round {round.round}</span>
        <span className="font-display text-base font-bold text-muted">x{Number.isInteger(round.multiplier) ? round.multiplier : round.multiplier.toFixed(1)}</span>
        {notes.map((n) => (
          <span key={n.text} className="flex items-center gap-1 text-[13px] leading-[18px] text-muted">
            <Icon name={POWERUP_ICON[n.id]} size={13} stroke={2} />
            {n.text}
          </span>
        ))}
        <span className="flex-1" />
        {hit ? (
          <span className={cx("font-display text-xl font-bold", hit.cls)} aria-label={`${damage(hit.n)} to ${hit.to}`}>
            {damage(hit.n)}
          </span>
        ) : (
          <span className="font-display text-xl font-bold text-muted" aria-label="No damage">
            0
          </span>
        )}
      </span>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cx("text-left text-[15px] leading-[21px]", !open && "line-clamp-2")}>
        {plainPreview(q.prompt ?? q.statement ?? "")}
      </button>
      <AnswerLine round={round} side={mine} name={myName} who="you" />
      <AnswerLine round={round} side={theirs} name={theirName} who="opponent" />
      {open ? (
        <div className="mt-2 flex flex-col gap-3">
          {q.type === "truefalse" || (q.prompt ?? "").includes("|") ? <QuestionText question={q} variant="plain" /> : null}
          <OptionList
            question={q}
            marks={markOptions(rows, keyIds, myIds, q.type === "multi")}
            pickedLabel={myIds}
            otherPicks={answerIds(theirs.answer)}
            otherLabel={theirName}
          />
          <p className="m-0 text-[15px] leading-[22px]">{q.why}</p>
          <p className="m-0 text-sm leading-5 text-muted">
            HP after: <span className="text-you">{formatNumber(mine.hpAfter)}</span> · <span className="text-opponent">{formatNumber(theirs.hpAfter)}</span>
          </p>
        </div>
      ) : null}
    </li>
  );
}

export function MatchDetail() {
  const { id = "" } = useParams();
  const me = useMeData();
  const match = useMatchDetail(id);
  const data = match.data;
  let title = "Match";
  if (data) {
    const meFirst = data.players[1].user?.id === me.user.id ? [data.players[1], data.players[0]] : data.players;
    title = `${playerName(meFirst[0]!)} vs ${playerName(meFirst[1]!)}`;
  }

  return (
    <Screen bottomBar={false}>
      <PageHeader title={title} back small />
      <Body className="pb-4">
        {match.isPending ? (
          <LoadingPlates count={5} height={96} />
        ) : match.error ? (
          <ErrorState error={match.error} onRetry={() => void match.refetch()} />
        ) : (
          <MatchDetailBody data={match.data} meId={me.user.id} />
        )}
      </Body>
    </Screen>
  );
}

function modeWord(d: MatchDetailResponse): string {
  if (d.mode === "ranked") return "Ranked";
  if (d.mode === "bot") return "Bot match";
  return d.rated ? "Private · rated" : "Private · unrated";
}

function MatchDetailBody({ data, meId }: { data: MatchDetailResponse; meId: string }) {
  const myIndex = data.players[1].user?.id === meId ? 1 : 0;
  const mine = data.players[myIndex];
  const theirs = data.players[1 - myIndex]!;
  const iPlayed = mine.user?.id === meId;
  const mySide = mine.side;
  const myName = playerName(mine);
  const theirName = playerName(theirs);

  let word: string;
  if (data.status === "void" || data.winner === null) word = "VOID";
  else if (data.winner === "draw") word = "DRAW";
  else if (iPlayed) word = data.winner === mySide ? "VICTORY" : "DEFEAT";
  else word = `${data.winner === mySide ? myName : theirName} won`;
  const delta = mine.ratingBefore !== null && mine.ratingAfter !== null ? mine.ratingAfter - mine.ratingBefore : null;
  const reason = REASON[data.endReason];

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <span className="flex min-w-0 flex-col">
          <span className={cx("truncate font-display font-bold italic", iPlayed || word.length <= 7 ? "text-[32px] leading-[34px]" : "text-2xl leading-[34px] not-italic")}>{word}</span>
          <span className="truncate text-sm leading-5 text-muted">
            {modeWord(data)} · {data.roundsPlayed === 1 ? "1 round" : `${data.roundsPlayed} rounds`} · {whenLabel(data.endedAt)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {delta !== null ? <span className="font-display text-[32px] leading-[34px] font-bold">{signed(delta)}</span> : null}
          <span className="text-sm leading-5 text-muted">
            <span className="text-you">{formatNumber(mine.hpEnd)}</span> · <span className="text-opponent">{formatNumber(theirs.hpEnd)}</span> HP
          </span>
        </span>
      </div>
      {reason || data.pairCapped ? (
        <p className="m-0 border-b border-line py-2.5 text-sm leading-5 text-muted">
          {reason}
          {reason && data.pairCapped ? " " : ""}
          {data.pairCapped ? "Daily rated limit for this pair reached: no rating change." : ""}
        </p>
      ) : null}

      {data.rounds.length === 0 ? (
        <Quiet>{data.roundsHidden ? "Round detail is only visible to the two players." : "No rounds played."}</Quiet>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {data.rounds.map((r, i) => (
            <RoundItem
              key={r.round}
              round={r}
              mine={mySide === "a" ? r.a : r.b}
              theirs={mySide === "a" ? r.b : r.a}
              myName={myName}
              theirName={theirName}
              last={i === data.rounds.length - 1}
            />
          ))}
        </ol>
      )}
    </>
  );
}
