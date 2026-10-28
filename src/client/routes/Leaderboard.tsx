// Leaderboard per course by ranked rating. Established players first, then
// "Still provisional".
import { Link } from "react-router";
import type { LeaderboardResponse } from "@shared/api-schemas";
import { useCurrentCourse } from "../lib/course";
import { useLeaderboard, useMeData } from "../lib/queries";
import { Page } from "../components/AppShell";
import { Avatar } from "../components/Avatar";
import { CourseSwitch } from "../components/CourseSwitch";
import { EmptyState, ErrorState, LoadingBlocks, PageHeader, SectionTitle, cx } from "../components/ui";

type Row = LeaderboardResponse["established"][number];

const MEDAL = ["text-gold", "text-[#cbd5e1]", "text-[#c08457]"];

function Rows({ rows, meId, provisional }: { rows: Row[]; meId: string; provisional?: boolean }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const self = r.user.id === meId;
        return (
          <li key={r.user.id}>
            <Link
              to={`/u/${encodeURIComponent(r.user.username)}`}
              className={cx(
                "flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2 transition",
                self ? "border-you/60 bg-you/10" : "border-border bg-surface hover:border-muted/50",
              )}
            >
              <span className={cx("font-display w-8 text-center text-lg font-bold tabular-nums", !provisional && r.rank <= 3 ? MEDAL[r.rank - 1] : "text-muted")}>
                {r.rank}
              </span>
              <Avatar user={r.user} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {r.user.displayUsername}
                  {self ? <span className="ml-1.5 text-xs font-medium text-you">you</span> : null}
                </span>
                <span className="block truncate text-xs text-muted">
                  {r.played} played · {r.won} won
                </span>
              </span>
              <span className={cx("text-lg font-bold tabular-nums", provisional ? "text-muted" : "text-ranked-gold")}>
                {Math.round(r.rating)}
                {provisional ? "?" : ""}
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
    <Page>
      <PageHeader title="Leaderboard" />
      <CourseSwitch tone="ranked" />
      {board.isPending ? (
        <LoadingBlocks className="mt-4" count={6} />
      ) : board.error ? (
        <ErrorState className="mt-4" error={board.error} onRetry={() => void board.refetch()} />
      ) : board.data.established.length === 0 && board.data.provisional.length === 0 ? (
        <EmptyState className="mt-4" title="No ranked games yet">
          Play a ranked duel in {course?.shortTitle ?? "this course"} to get on the board.
        </EmptyState>
      ) : (
        <>
          {board.data.established.length > 0 ? (
            <>
              <SectionTitle>Ranked</SectionTitle>
              <Rows rows={board.data.established} meId={me.user.id} />
            </>
          ) : null}
          {board.data.provisional.length > 0 ? (
            <>
              <SectionTitle>Still provisional</SectionTitle>
              <Rows rows={board.data.provisional} meId={me.user.id} provisional />
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}
