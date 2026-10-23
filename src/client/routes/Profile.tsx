// Profiles (own and public): ratings and stats per course, accuracy per
// lecture, head-to-head on someone else's profile, recent matches.
import { Link, useParams } from "react-router";
import type { UserProfileResponse } from "@shared/api-schemas";
import { ELO } from "@shared/game/config";
import { useCurrentCourse } from "../lib/course";
import { botName, formatRating, percent } from "../lib/format";
import { useMeData, useUserMatches, useUserProfile } from "../lib/queries";
import { Page } from "../components/AppShell";
import { Avatar } from "../components/Avatar";
import { GearIcon } from "../components/icons";
import { MatchRow } from "../components/MatchRow";
import { CourseSwitch } from "../components/CourseSwitch";
import { EmptyState, ErrorState, LoadingBlocks, PageHeader, SectionTitle, Skeleton, buttonClass, cx } from "../components/ui";

type CourseStats = UserProfileResponse["courses"][number];

/** Profile matches shown before "All matches". */
const PROFILE_RECENT = 5;

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl bg-bg/50 px-3 py-2">
      <p className={cx("truncate text-xl font-bold tabular-nums", tone)}>{value}</p>
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
    </div>
  );
}

function accuracyTone(p: number): string {
  if (p < 50) return "bg-wrong";
  if (p < 75) return "bg-zeus";
  return "bg-correct";
}

function CourseBlock({ stats }: { stats: CourseStats }) {
  const r = stats.ranked;
  const b = stats.bot;
  const strongest = b.highestBotLevel > 0 ? botName(b.highestBotLevel) : null;
  const casualPlayed = stats.casual.played;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-ranked-gold/30 bg-gradient-to-br from-[#3a1420] to-surface p-3">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-ranked-gold uppercase">Ranked</p>
          <p className="font-display text-3xl font-black tabular-nums text-ranked-gold">{formatRating(r.rating, r.provisional)}</p>
        </div>
        <div className="rounded-2xl border border-bot/30 bg-gradient-to-br from-[#0f2350] to-surface p-3">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#93c5fd] uppercase">Bot</p>
          <p className="font-display text-3xl font-black tabular-nums text-[#bfdbfe]">{formatRating(b.rating, b.provisional, ELO.startBotRating)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="mb-2 text-xs font-semibold text-muted">Ranked matches</p>
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Played" value={r.played} />
          <Stat label="Won" value={r.won} tone="text-correct" />
          <Stat label="Lost" value={r.lost} tone="text-wrong" />
          <Stat label="Drawn" value={r.drawn} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="Surrendered" value={r.surrendered} />
          <Stat label="Left early" value={r.abandoned} />
          <Stat label="Best streak" value={r.bestStreak} tone="text-zeus" />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="mb-2 text-xs font-semibold text-muted">Bot matches</p>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Played" value={b.played} />
          <Stat label="Won" value={b.won} tone="text-correct" />
          <Stat label="Strongest beaten" value={strongest ?? "None"} tone={strongest ? "text-[#bfdbfe] text-base" : "text-muted text-base"} />
        </div>
        {casualPlayed > 0 ? (
          <p className="mt-2 text-xs text-muted">
            Unrated friend games: {casualPlayed} played, {stats.casual.won} won, {stats.casual.lost} lost
            {stats.casual.drawn > 0 ? `, ${stats.casual.drawn} drawn` : ""}
          </p>
        ) : null}
      </div>

      <SectionTitle>Accuracy per lecture</SectionTitle>
      {stats.accuracy.length === 0 ? (
        <p className="text-sm text-muted">No answers in this course yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3">
          {stats.accuracy.map((a) => {
            const p = percent(a.correct, a.answers);
            return (
              <li key={a.lectureId}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{a.title}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {a.correct}/{a.answers} · <span className="font-semibold text-text">{p}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`${a.title} accuracy`}>
                  <div className={cx("h-full rounded-full", accuracyTone(p))} style={{ width: `${p}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecentMatches({ username, isSelf, courseId }: { username: string; isSelf: boolean; courseId: string | null }) {
  const matches = useUserMatches(username, courseId);
  const items = matches.data?.pages[0]?.items.slice(0, PROFILE_RECENT) ?? [];
  const all = isSelf ? "/history" : `/history?user=${encodeURIComponent(username)}`;
  return (
    <>
      <SectionTitle
        right={
          items.length > 0 ? (
            <Link to={all} className="flex min-h-tap items-center px-1 text-sm font-medium text-you">
              All matches
            </Link>
          ) : null
        }
      >
        Recent matches
      </SectionTitle>
      {matches.isPending ? (
        <LoadingBlocks count={2} />
      ) : matches.error ? (
        <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No matches yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </div>
      )}
    </>
  );
}

function ProfileView({ username }: { username: string }) {
  const profile = useUserProfile(username);
  // One course selection app-wide: the switch here is the same one Home and the leaderboard use.
  const { courseId, course } = useCurrentCourse();

  if (profile.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <LoadingBlocks count={3} />
      </div>
    );
  }
  if (profile.error) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;

  const data = profile.data;
  const user = data.user;
  const statsCourses = data.courses;
  const shown = statsCourses.find((c) => c.courseId === courseId) ?? null;
  const h2h = data.headToHead;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar user={user} size={80} ring={data.isSelf ? "var(--color-you)" : "var(--color-opponent)"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xl font-bold">{user.displayUsername}</p>
          <p className="truncate text-muted">
            {user.firstName} {user.lastName}
          </p>
        </div>
        {data.isSelf ? (
          <Link to="/settings" className={buttonClass("secondary", "px-3")} aria-label="Edit profile">
            <GearIcon size={20} />
            Edit
          </Link>
        ) : null}
      </div>

      {h2h && h2h.wins + h2h.losses + h2h.draws === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-center text-sm text-muted">No duels between you two yet.</p>
      ) : h2h ? (
        <div className="flex items-center justify-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3">
          <span className="text-sm text-muted">You</span>
          <span className="font-display text-2xl font-bold tabular-nums">
            <span className="text-you">{h2h.wins}</span>
            <span className="mx-2 text-muted">·</span>
            <span className="text-opponent">{h2h.losses}</span>
          </span>
          <span className="max-w-32 truncate text-sm text-muted">{user.displayUsername}</span>
          {h2h.draws > 0 ? <span className="text-xs text-muted">({h2h.draws} drawn)</span> : null}
        </div>
      ) : null}

      <CourseSwitch />
      {shown ? <CourseBlock stats={shown} /> : <EmptyState title={`No games in ${course?.shortTitle ?? "this course"} yet`} />}

      <RecentMatches username={user.username} isSelf={data.isSelf} courseId={courseId} />
    </div>
  );
}

export function MyProfile() {
  const me = useMeData();
  return (
    <Page>
      <PageHeader title="Profile" />
      {me.user.username ? <ProfileView username={me.user.username} /> : <EmptyState title="Pick a username first" />}
    </Page>
  );
}

export function PublicProfile() {
  const { username = "" } = useParams();
  return (
    <Page>
      <PageHeader title="Player" back />
      <ProfileView key={username} username={username} />
    </Page>
  );
}
