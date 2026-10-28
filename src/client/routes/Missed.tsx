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
import { Body, Header, Icon, LoadingPlates, Primary, PrimaryLink, Quiet, Screen, Segmented, secondaryClass } from "../components/after/ui";
import { CourseSwitch } from "../components/CourseSwitch";
import { LectureSingleChip } from "../components/LectureFilter";
import { MissedFlow } from "../components/MissedFlow";
import { ErrorState, cx } from "../components/ui";

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
    <Screen>
      <Header title="Missed questions" big />
      <Body className="gap-3">
        <CourseSwitch />
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
          <div className="min-w-0 max-w-[11rem] [&>button]:min-h-10 [&>button]:max-w-full">
            <LectureSingleChip course={course} value={lecture} onChange={(v) => setParam("lecture", v)} />
          </div>
          <Segmented
            label="Show"
            options={[
              { value: "open", label: "To review" },
              { value: "learned", label: "Learned" },
            ]}
            value={status}
            onChange={(v) => setParam("status", v === "open" ? null : v)}
          />
        </div>

        {list.isPending ? (
          <LoadingPlates className="mt-2" count={4} height={96} />
        ) : list.error ? (
          <ErrorState className="mt-2" error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <>
            <div className="flex items-center gap-3 py-1">
              <span className="flex flex-1 items-baseline gap-2">
                <span className="font-display text-[40px] leading-[44px] font-bold">{count}</span>
                <span className="text-base leading-[22px] text-muted">{status === "open" ? "to review" : "learned"}</span>
              </span>
              {status === "open" && count > 0 && courseId ? (
                <PrimaryLink to={runUrl(courseId, lecture)} className="w-[170px]">
                  <Icon name="retry" size={20} stroke={2.4} />
                  Retry these
                </PrimaryLink>
              ) : null}
            </div>
            {items.length === 0 ? (
              <Quiet>
                {status === "open" ? "Nothing to review. Questions you get wrong in a match land here." : "Nothing learned yet. Questions you mark as learned land here."}
              </Quiet>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {items.map((it) => (
                  <li key={it.questionId}>
                    <Link to={`/missed/${it.questionId}`} className="plate press flex flex-col gap-1.5 rounded-xs px-4 pt-3 pb-3.5">
                      <span className="flex justify-between gap-3 text-sm leading-5 text-muted">
                        <span className="min-w-0 truncate">{it.lectureTitle}</span>
                        <span className="shrink-0">
                          missed {it.timesMissed}x · {formatAgo(it.lastMissedAt)}
                        </span>
                      </span>
                      <span className="line-clamp-3 text-base leading-[22px]">{it.preview}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {list.hasNextPage ? (
              <button type="button" className={cx(secondaryClass, "h-12 w-full")} onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? "Loading" : "Load more"}
              </button>
            ) : null}
          </>
        )}
      </Body>
    </Screen>
  );
}

export function MissedQuestion() {
  const { questionId = "" } = useParams();
  const q = useMissedQuestion(questionId);
  return (
    <Screen>
      <Header title="Missed question" back />
      <Body className="pb-6">
        {q.isPending ? (
          <LoadingPlates count={4} height={56} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <MissedFlow key={questionId} data={q.data} />
        )}
      </Body>
    </Screen>
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
  const running = ids.length > 0 && !done;

  return (
    <Screen>
      <Header
        title="Retry"
        back={back}
        right={running ? <span className="pr-3 text-sm leading-5 text-muted">{`${Math.min(index + 1, ids.length)} of ${ids.length}`}</span> : undefined}
      />
      {running ? (
        <div className="mx-4 h-1 bg-line" aria-hidden>
          <span className="block h-1 bg-text transition-[width] duration-300" style={{ width: `${((index + 1) / ids.length) * 100}%` }} />
        </div>
      ) : null}
      <Body className="pt-4 pb-6">
        {course === "" ? (
          <ErrorState error={new Error("No course picked for this run.")} />
        ) : list.isPending ? (
          <LoadingPlates count={4} height={60} />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : ids.length === 0 ? (
          <Quiet>Nothing to review. Questions you get wrong in a match land here.</Quiet>
        ) : done ? (
          <div className="pop-in flex flex-1 flex-col">
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="m-0 font-display text-[64px] leading-[64px] font-bold italic">DONE</p>
              <p className="m-0 text-[15px] leading-[22px] text-muted">
                {right} of {ids.length} right on the retry.
              </p>
            </div>
            <span className="flex-1" />
            <Primary onClick={() => navigate(back)}>Back to the list</Primary>
          </div>
        ) : q.isPending ? (
          <LoadingPlates count={4} height={60} />
        ) : q.error ? (
          <div className="flex flex-col gap-3">
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            <button type="button" className={cx(secondaryClass, "h-12")} onClick={() => setIndex((i) => i + 1)}>
              Skip
            </button>
          </div>
        ) : (
          <MissedFlow
            key={currentId}
            data={q.data}
            startInRetry
            onAnswered={(correct) => setResults((r) => (currentId && !(currentId in r) ? { ...r, [currentId]: correct } : r))}
            footer={
              <Primary onClick={() => setIndex((i) => i + 1)}>
                {index + 1 < ids.length ? "Next" : "Finish"}
                <Icon name="arrow" size={20} stroke={2.4} />
              </Primary>
            }
          />
        )}
      </Body>
    </Screen>
  );
}
