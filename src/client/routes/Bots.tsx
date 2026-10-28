// Bot ladder: your bot rating, Echo on top, then the eight named bots, weakest
// first. Each is unlocked by beating the one before; the next one to beat is
// outlined with a Play chip. Optional lecture filter in the header.
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BotsResponse } from "@shared/api-schemas";
import { ELO } from "@shared/game/config";
import { ApiRequestError, apiRequest, errorMessage } from "../lib/api";
import { useCurrentCourse } from "../lib/course";
import { formatRating } from "../lib/format";
import { qk, useBots, useHome } from "../lib/queries";
import { CheckIcon, ChevronRightIcon, LockIcon } from "../components/icons";
import { LectureMultiChip } from "../components/LectureFilter";
import { Button, ErrorState, LoadingPlates, PageHeader, RatingText, Spinner, cx } from "../components/ui";

type Choice = "echo" | number;
type Bot = BotsResponse["ladder"][number];

function Num({ children, muted, className }: { children: ReactNode; muted?: boolean; className?: string }) {
  return <span className={cx("font-display text-[22px] leading-7 font-bold", muted && "text-muted", className)}>{children}</span>;
}

function Line({ name, line, muted }: { name: string; line: string; muted?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className={cx("text-base leading-5 font-semibold", muted && "text-muted")}>{name}</span>
      <span className="text-sm leading-5 text-muted">{line}</span>
    </span>
  );
}

function Level({ n }: { n: number }) {
  return <span className="font-display w-5 shrink-0 text-lg font-bold text-muted">{n}</span>;
}

function BotRow({ bot, next, busy, pending, onPlay }: { bot: Bot; next: boolean; busy: boolean; pending: boolean; onPlay: () => void }) {
  const rating = Math.round(bot.rating);
  if (!bot.unlocked) {
    // Locked bots are not buttons: nothing to focus, nothing to tap.
    return (
      <li className="flex min-h-[61px] items-center gap-3 border-b border-line py-1 pr-4 pl-3" aria-label={`${bot.name}, locked. Beat the bot before it first.`}>
        <Level n={bot.level} />
        <Line name={bot.name} line={bot.line} muted />
        <Num muted>{rating}</Num>
        <LockIcon size={16} strokeWidth={1.8} className="shrink-0 text-muted" />
      </li>
    );
  }
  if (next) {
    return (
      <li>
        <button
          type="button"
          onClick={onPlay}
          disabled={busy}
          aria-label={`Play ${bot.name}, rated ${rating}`}
          className="press flex min-h-20 w-full items-center gap-3 rounded-sm bg-plate px-3 py-2 text-left shadow-[inset_0_0_0_2px_var(--color-text),0_3px_0_var(--color-edge)] disabled:opacity-70"
        >
          <Level n={bot.level} />
          <Line name={bot.name} line={bot.line} />
          <Num>{rating}</Num>
          <span className="flex h-8 shrink-0 items-center gap-1 bg-text px-2.5 text-sm font-semibold text-bg">
            {pending ? <Spinner size={14} /> : null}
            Play
            <ChevronRightIcon size={14} strokeWidth={2.4} />
          </span>
        </button>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onPlay}
        disabled={busy}
        aria-label={`Play ${bot.name}, rated ${rating}${bot.beaten ? ", beaten" : ""}`}
        className="flex min-h-[61px] w-full items-center gap-3 border-b border-line py-1 pr-4 pl-3 text-left hover:bg-plate-dim disabled:opacity-70"
      >
        <Level n={bot.level} />
        <Line name={bot.name} line={bot.line} />
        <Num>{rating}</Num>
        {pending ? (
          <Spinner size={16} className="text-muted" />
        ) : bot.beaten ? (
          <CheckIcon size={16} strokeWidth={2.4} className="shrink-0" />
        ) : (
          <span className="w-4" />
        )}
      </button>
    </li>
  );
}

export function Bots() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { course, courseId } = useCurrentCourse();
  const bots = useBots(courseId);
  const home = useHome(courseId);
  const [lectures, setLectures] = useState<string[] | null>(null);
  const [pending, setPending] = useState<Choice | null>(null);

  const start = useMutation({
    mutationFn: (bot: Choice) => apiRequest("createBotMatch", { body: { courseId: courseId!, bot, lectures } }),
    onMutate: (bot) => setPending(bot),
    onSuccess: ({ matchId }) => {
      void qc.invalidateQueries({ queryKey: qk.me });
      navigate(`/match/${matchId}`);
    },
    onSettled: () => setPending(null),
  });

  const alreadyIn = start.error instanceof ApiRequestError && start.error.code === "already_in_match" ? start.error.body?.error.matchId : null;
  // Echo plays at your bot rating, so the big number and Echo's are the same one.
  const rating = home.data
    ? formatRating(home.data.bot.rating, home.data.bot.provisional, ELO.startBotRating)
    : bots.data
      ? String(Math.round(bots.data.echo.rating))
      : null;
  const ladder = bots.data?.ladder ?? [];
  const nextLevel = ladder.find((b) => b.unlocked && !b.beaten)?.level ?? null;
  const strongest = [...ladder].reverse().find((b) => b.beaten) ?? null;

  return (
    <main className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <PageHeader title="Bot match" back="/" className="-mx-4" right={<LectureMultiChip course={course} value={lectures} onChange={setLectures} />} />

      {bots.isPending ? (
        <LoadingPlates count={5} className="pt-2" />
      ) : bots.error ? (
        <ErrorState error={bots.error} onRetry={() => void bots.refetch()} />
      ) : (
        <>
          <div className="flex flex-col pt-1 pb-3.5">
            <span className="text-sm leading-5 text-muted">Bot rating</span>
            <span className="font-display text-[56px] leading-[60px] font-bold">{rating ? <RatingText text={rating} /> : " "}</span>
            <span className="text-sm leading-5 text-muted">{strongest ? `Strongest beaten: ${strongest.name}` : "No bots beaten yet."}</span>
          </div>

          {start.error ? (
            <div className="mb-3 flex items-center gap-3 rounded-sm px-4 py-2 text-[15px] shadow-[inset_0_0_0_1px_var(--color-wrong)]" role="alert">
              <span className="flex-1">{errorMessage(start.error)}</span>
              {alreadyIn ? (
                <Button variant="secondary" onClick={() => navigate(`/match/${alreadyIn}`)}>
                  Back to it
                </Button>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => start.mutate("echo")}
            disabled={start.isPending}
            className="plate press flex min-h-20 w-full items-center gap-3 rounded-sm px-3 py-2 text-left disabled:opacity-70"
            aria-label={`Play ${bots.data.echo.name}. ${bots.data.echo.line}`}
          >
            <span aria-hidden className="font-display flex size-9 shrink-0 items-center justify-center rounded-full bg-line text-lg font-bold">
              {bots.data.echo.name.slice(0, 1)}
            </span>
            <Line name={bots.data.echo.name} line={bots.data.echo.line} />
            {rating ? <Num>{<RatingText text={rating} />}</Num> : null}
            {pending === "echo" ? <Spinner size={16} className="text-muted" /> : <ChevronRightIcon size={16} className="shrink-0 text-muted" />}
          </button>

          <ol className="mt-3 flex flex-col gap-1">
            {ladder.map((b) => (
              <BotRow
                key={b.level}
                bot={b}
                next={b.level === nextLevel}
                busy={start.isPending}
                pending={pending === b.level}
                onPlay={() => start.mutate(b.level)}
              />
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
