// Bot ladder: Echo on top, then the eight named bots, weakest first. Each is
// unlocked by beating the one before. Optional lecture filter.
import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ELO } from "@shared/game/config";
import { ApiRequestError, apiRequest, errorMessage } from "../lib/api";
import { useCurrentCourse } from "../lib/course";
import { formatRating } from "../lib/format";
import { qk, useBots, useHome } from "../lib/queries";
import { Page } from "../components/AppShell";
import { BotAvatar } from "../components/Avatar";
import { CheckIcon, LockIcon } from "../components/icons";
import { LectureMultiChip } from "../components/LectureFilter";
import { Button, ErrorState, LoadingBlocks, PageHeader, Spinner, cx } from "../components/ui";

type Choice = "echo" | number;

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

  return (
    <Page>
      <PageHeader title={<span className="text-[#93c5fd]">Bot match</span>} back="/" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{course?.shortTitle}</span>
        <span className="flex-1" />
        <LectureMultiChip course={course} value={lectures} onChange={setLectures} />
      </div>

      {start.error ? (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-wrong/40 bg-wrong/10 px-4 py-2 text-sm" role="alert">
          <span className="flex-1">{errorMessage(start.error)}</span>
          {alreadyIn ? (
            <Button variant="secondary" onClick={() => navigate(`/match/${alreadyIn}`)}>
              Back to it
            </Button>
          ) : null}
        </div>
      ) : null}

      {bots.isPending ? (
        <LoadingBlocks count={5} />
      ) : bots.error ? (
        <ErrorState error={bots.error} onRetry={() => void bots.refetch()} />
      ) : (
        <>
          <button
            type="button"
            onClick={() => start.mutate("echo")}
            disabled={start.isPending}
            className="relative mb-5 flex min-h-24 w-full items-center gap-4 overflow-hidden rounded-3xl border border-bot/50 bg-gradient-to-br from-[#14306e] to-surface px-4 py-4 text-left transition hover:border-bot disabled:opacity-70"
          >
            <span className="relative">
              <BotAvatar name={bots.data.echo.name} size={56} />
              <span className="absolute -inset-1.5 rounded-full border border-bot/40" />
              <span className="absolute -inset-3 rounded-full border border-bot/20" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display block text-xl font-bold">{bots.data.echo.name}</span>
              <span className="block text-sm text-muted">{bots.data.echo.line}</span>
            </span>
            <span className="text-right">
              {/* Echo plays at your bot rating, so show that number (the same one as below). */}
              {home.data ? (
                <span className="block text-lg font-semibold tabular-nums text-[#bfdbfe]">
                  {formatRating(home.data.bot.rating, home.data.bot.provisional, ELO.startBotRating)}
                </span>
              ) : null}
              <span className="block text-[11px] text-muted">your level</span>
            </span>
            {pending === "echo" ? <Spinner size={20} className="text-[#93c5fd]" /> : null}
          </button>

          <ol className="flex flex-col gap-2">
            {bots.data.ladder.map((b) => {
              const locked = !b.unlocked;
              return (
                <li key={b.level}>
                  <button
                    type="button"
                    onClick={() => start.mutate(b.level)}
                    disabled={locked || start.isPending}
                    className={cx(
                      "flex min-h-18 w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                      locked ? "border-border/60 bg-surface/50" : "border-border bg-surface hover:border-bot/60",
                      !locked && start.isPending && "opacity-70",
                    )}
                    aria-label={locked ? `${b.name}, locked. Beat the bot before it first.` : `Play ${b.name}, rated ${Math.round(b.rating)}`}
                  >
                    <span className={cx("w-5 text-center text-xs font-semibold tabular-nums", locked ? "text-muted/50" : "text-muted")}>{b.level}</span>
                    <span className={cx(locked && "opacity-40 grayscale")}>
                      <BotAvatar name={b.name} size={44} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("font-display block text-base font-bold", locked && "text-muted")}>{b.name}</span>
                      <span className={cx("block text-sm leading-snug", locked ? "text-muted/60" : "text-muted")}>{b.line}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className={cx("text-sm font-semibold tabular-nums", locked ? "text-muted/60" : "text-[#bfdbfe]")}>{Math.round(b.rating)}</span>
                      {pending === b.level ? (
                        <Spinner size={16} className="text-[#93c5fd]" />
                      ) : locked ? (
                        <LockIcon size={16} className="text-muted/60" />
                      ) : b.beaten ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-correct">
                          <CheckIcon size={14} />
                          Beaten
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {home.data ? (
            <p className="mt-4 text-center text-sm text-muted">
              Your bot rating: <span className="font-semibold text-text">{formatRating(home.data.bot.rating, home.data.bot.provisional, ELO.startBotRating)}</span>
              {home.data.bot.provisional ? ` (provisional for your first ${ELO.botProvisionalAnswers} answers)` : ""}
            </p>
          ) : null}
        </>
      )}
    </Page>
  );
}
