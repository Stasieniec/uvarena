// Leaderboard per course by ranked rating. Established players first, then
// "Still provisional" with "?" ratings; your row is outlined in your colour.
import { Link } from "react-router";
import type { LeaderboardResponse } from "@shared/api-schemas";
import { useCurrentCourse } from "../lib/course";
import { useLeaderboard, useMeData } from "../lib/queries";
import { Body, Disc, Header, LoadingPlates, Quiet, Rating, Screen, SectionHeading } from "../components/after/ui";
import { CourseSwitch } from "../components/CourseSwitch";
import { ErrorState, cx } from "../components/ui";

type Row = LeaderboardResponse["established"][number];

/** Ranks shown in the text colour; the rest are muted. */
const TOP_RANKS = 3;

function gamesLine(r: Row): string {
  const name = `${r.user.firstName} ${r.user.lastName}`.trim();
  const games = `${r.played} ${r.played === 1 ? "game" : "games"}`;
  return name ? `${name} · ${games}` : games;
}

function Rows({ rows, meId, provisional = false }: { rows: Row[]; meId: string; provisional?: boolean }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {rows.map((r) => {
        const self = r.user.id === meId;
        return (
          <li key={r.user.id}>
            <Link
              to={`/u/${encodeURIComponent(r.user.username)}`}
              aria-current={self ? "true" : undefined}
              className={cx(
                "grid h-[52px] grid-cols-[28px_32px_minmax(0,1fr)_auto] items-center gap-x-3 px-3",
                self ? "bg-plate shadow-[inset_0_0_0_2px_var(--color-you)]" : "border-b border-line",
              )}
            >
              <span className={cx("font-display text-xl font-bold", !provisional && r.rank <= TOP_RANKS ? "text-text" : "text-muted")}>{provisional ? "" : r.rank}</span>
              <Disc user={r.user} size={32} you={self} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base leading-5 font-semibold">{r.user.displayUsername}</span>
                <span className="truncate text-[13px] leading-[18px] text-muted">{gamesLine(r)}</span>
              </span>
              <span className="font-display text-2xl font-bold">
                <Rating value={r.rating} provisional={provisional} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function Leaderboard() {
  const me = useMeData();
  const { courseId, course } = useCurrentCourse();
  const board = useLeaderboard(courseId);
  return (
    <Screen>
      <Header title="Leaderboard" big right={course ? <span className="max-w-[45%] truncate pr-3 text-sm leading-5 text-muted">{course.shortTitle}</span> : undefined} />
      <Body className="pb-3">
        <CourseSwitch tone="ranked" />
        {board.isPending ? (
          <LoadingPlates count={6} height={52} />
        ) : board.error ? (
          <ErrorState error={board.error} onRetry={() => void board.refetch()} />
        ) : board.data.established.length === 0 && board.data.provisional.length === 0 ? (
          <Quiet>No ranked games yet. Play a ranked duel in {course?.shortTitle ?? "this course"} to get on the board.</Quiet>
        ) : (
          <>
            {board.data.established.length > 0 ? <Rows rows={board.data.established} meId={me.user.id} /> : null}
            {board.data.provisional.length > 0 ? (
              <>
                <SectionHeading className={board.data.established.length > 0 ? "mt-5 mb-0.5" : "mt-1 mb-0.5"}>
                  Still provisional
                </SectionHeading>
                <Rows rows={board.data.provisional} meId={me.user.id} provisional />
              </>
            ) : null}
          </>
        )}
      </Body>
    </Screen>
  );
}
