// Missed questions: the list (course, lecture, To review or Learned), one
// question, and the "Retry these" run through the filtered list.
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { MissedStatus } from "@shared/api-schemas";
import { apiRequest } from "../lib/api";
import { useCurrentCourse } from "../lib/course";
import { formatAgo } from "../lib/format";
import { useMissedList, useMissedQuestion } from "../lib/queries";
import { Page } from "../components/AppShell";
import { CourseSwitch } from "../components/CourseSwitch";
import { ChevronRightIcon, RefreshIcon } from "../components/icons";
import { LectureSingleChip } from "../components/LectureFilter";
import { MissedFlow } from "../components/MissedFlow";
import { Button, EmptyState, ErrorState, LoadingBlocks, PageHeader, Pills, buttonClass, cx } from "../components/ui";

const TYPE_LABEL = { single: "Single choice", multi: "Multiple select", truefalse: "True or false", cloze: "Fill the blank", order: "Ordering", match: "Matching" } as const;

export function runUrl(course: string, lecture: string | null): string {
  const p = new URLSearchParams({ course });
  if (lecture) p.set("lecture", lecture);
  return `/missed/run?${p.toString()}`;
}

export function MissedList() {
  const { course, courseId } = useCurrentCourse();
  const [params, setParams] = useSearchParams();
  const status: MissedStatus = params.get("status") === "learned" ? "learned" : "open";
  const lecture = params.get("lecture");
  const list = useMissedList(courseId, lecture, status);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const count = list.data?.pages[0]?.count ?? 0;

  return (
    <Page>
      <PageHeader title="Missed questions" />
      <div className="flex flex-col gap-3">
        <CourseSwitch />
        <div className="flex items-center gap-2">
          <LectureSingleChip
            course={course}
            value={lecture}
            onChange={(v) => setParam("lecture", v)}
          />
        </div>
        <Pills
          label="Status"
          options={[
            { value: "open", label: "To review" },
            { value: "learned", label: "Learned" },
          ]}
          value={status}
          onChange={(v) => setParam("status", v === "open" ? null : v)}
        />
      </div>

      {list.isPending ? (
        <LoadingBlocks className="mt-4" count={4} />
      ) : list.error ? (
        <ErrorState className="mt-4" error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <div className="mt-4 mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              <span className="text-2xl font-bold text-text tabular-nums">{count}</span> {status === "open" ? "to review" : "learned"}
            </p>
            {status === "open" && count > 0 && courseId ? (
              <Link to={runUrl(courseId, lecture)} className={buttonClass("primary", "px-4")}>
                <RefreshIcon size={18} />
                Retry these
              </Link>
            ) : null}
          </div>
          {items.length === 0 ? (
            <EmptyState title={status === "open" ? "Nothing to review" : "Nothing learned yet"}>
              {status === "open" ? "Questions you get wrong in a match land here." : "Questions you mark as learned land here."}
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((it) => (
                <li key={it.questionId}>
                  <Link
                    to={`/missed/${it.questionId}`}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-muted/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-xs text-muted">
                        <span className="truncate font-medium text-text/80">{it.lectureTitle}</span>
                        <span className="shrink-0">
                          · missed {it.timesMissed}x · {formatAgo(it.lastMissedAt)}
                        </span>
                      </span>
                      <span className="line-clamp-3 mt-1 block leading-snug">{it.preview}</span>
                      <span className="mt-1 block text-[11px] tracking-wide text-muted uppercase">{TYPE_LABEL[it.type]}</span>
                    </span>
                    <ChevronRightIcon size={18} className="mt-1 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {list.hasNextPage ? (
            <Button variant="secondary" className="mt-3 w-full" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Load more
            </Button>
          ) : null}
        </>
      )}
    </Page>
  );
}

export function MissedQuestion() {
  const { questionId = "" } = useParams();
  const q = useMissedQuestion(questionId);
  return (
    <Page>
      <PageHeader title="Missed question" back />
      {q.isPending ? (
        <LoadingBlocks count={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <MissedFlow key={questionId} data={q.data} />
      )}
    </Page>
  );
}

/** "Retry these": one question at a time from the filtered To review list. */
export function MissedRun() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const course = params.get("course") ?? "";
  const lecture = params.get("lecture");
  // The run is fixed when it starts: retries that mark questions learned must not reshuffle it.
  const list = useQuery({
    queryKey: ["missedRun", course, lecture],
    queryFn: ({ signal }) => apiRequest("missedList", { query: { course, lecture: lecture ?? undefined, status: "open" }, signal }),
    enabled: course !== "",
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const ids = useMemo(() => list.data?.items.map((i) => i.questionId) ?? [], [list.data]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, boolean | null>>({});
  const currentId = ids[index];
  const q = useQuery({
    queryKey: ["missed", "question", currentId ?? ""],
    queryFn: ({ signal }) => apiRequest("missedQuestion", { params: { questionId: currentId! }, signal }),
    enabled: !!currentId,
  });

  const back = lecture ? `/missed?lecture=${encodeURIComponent(lecture)}` : "/missed";
  const done = list.data && index >= ids.length;
  const right = Object.values(results).filter((r) => r === true).length;

  return (
    <Page>
      <PageHeader
        title={ids.length > 0 && !done ? `Retry ${Math.min(index + 1, ids.length)} of ${ids.length}` : "Retry these"}
        back={back}
      />
      {ids.length > 0 && !done ? (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-you transition-all" style={{ width: `${(index / ids.length) * 100}%` }} />
        </div>
      ) : null}
      {course === "" ? (
        <ErrorState error={new Error("No course picked for this run.")} />
      ) : list.isPending ? (
        <LoadingBlocks count={4} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : ids.length === 0 ? (
        <EmptyState title="Nothing to review">Questions you get wrong in a match land here.</EmptyState>
      ) : done ? (
        <div className="pop-in flex flex-col items-center gap-4 py-10 text-center">
          <p className="font-display text-4xl font-bold text-gold">Done</p>
          <p className="text-muted">
            {right} of {ids.length} right on the retry.
          </p>
          <Button className="w-full" onClick={() => navigate(back)}>
            Back to the list
          </Button>
        </div>
      ) : q.isPending ? (
        <LoadingBlocks count={4} />
      ) : q.error ? (
        <div className="flex flex-col gap-3">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          <Button variant="secondary" onClick={() => setIndex((i) => i + 1)}>
            Skip
          </Button>
        </div>
      ) : (
        <MissedFlow
          key={currentId}
          data={q.data}
          onAnswered={(correct) => setResults((r) => (currentId && !(currentId in r) ? { ...r, [currentId]: correct } : r))}
          footer={
            <Button className={cx("w-full")} onClick={() => setIndex((i) => i + 1)}>
              {index + 1 < ids.length ? "Next" : "Finish"}
            </Button>
          }
        />
      )}
    </Page>
  );
}
