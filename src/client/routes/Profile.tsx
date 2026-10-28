// Profiles. Your own: ranked and bot ratings as two plates, played, won, lost
// and drawn as four numbers, a few stat rows, accuracy per lecture as 6 px
// bars. Someone else's: the head-to-head (you in teal, them in red, a split
// bar), your last meetings, their stats, and Duel them as the primary.
import { Link, useParams } from "react-router";
import type { MatchSummary, UserProfileResponse } from "@shared/api-schemas";
import { ELO, GLICKO } from "@shared/game/config";
import { useCurrentCourse } from "../lib/course";
import { botName, percent } from "../lib/format";
import { useMeData, useUserMatches, useUserProfile } from "../lib/queries";
import { Body, Disc, Header, HeaderIconLink, Icon, LoadingPlates, NameTag, Num, PrimaryLink, Quiet, Rating, Screen, SectionHeading, StatRow, dayLabel, signed } from "../components/after/ui";
import { CourseSwitch } from "../components/CourseSwitch";
import { ErrorState, cx } from "../components/ui";

type Profile = UserProfileResponse;
type CourseStats = Profile["courses"][number];

/** Accuracy under this many percent draws its bar in muted. */
const WEAK_ACCURACY = 60;
/** Meetings listed on someone else's profile. */
const LAST_MEETINGS = 3;

function Identity({ user, you }: { user: Profile["user"]; you: boolean }) {
  return (
    <div className="flex items-center gap-3.5">
      <Disc user={user} size={56} you={you} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-display text-[28px] leading-[30px] font-bold">{user.displayUsername}</span>
        <span className="truncate text-[15px] leading-5 text-muted">
          {user.firstName} {user.lastName}
        </span>
      </span>
    </div>
  );
}

function RatingPlate({ label, value, provisional, start }: { label: string; value: number | null; provisional: boolean; start: number }) {
  return (
    <div className="plate flex min-w-0 flex-col px-3.5 py-2.5">
      <span className="text-sm leading-5 text-muted">{label}</span>
      <span className="font-display text-[40px] leading-[44px] font-bold">
        <Rating value={value ?? start} provisional={provisional || value === null} />
      </span>
    </div>
  );
}

function Accuracy({ stats }: { stats: CourseStats }) {
  return (
    <>
      <SectionHeading className="mt-3.5 mb-1.5">Accuracy per lecture</SectionHeading>
      {stats.accuracy.length === 0 ? (
        <p className="m-0 text-sm leading-5 text-muted">No answers in this course yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {stats.accuracy.map((a) => {
            const p = percent(a.correct, a.answers);
            return (
              <li key={a.lectureId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px]">
                <span className="truncate text-sm leading-[18px]">{a.title}</span>
                <span className="row-span-2 min-w-9 text-right font-display text-xl font-bold" aria-label={`${p}% of ${a.answers} answers right`}>
                  {p}%
                </span>
                <span
                  className="h-1.5 bg-line"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p}
                  aria-label={`${a.title} accuracy`}
                >
                  <span className={cx("block h-1.5", p < WEAK_ACCURACY ? "bg-muted" : "bg-text")} style={{ width: `${p}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function OwnStats({ stats }: { stats: CourseStats }) {
  const r = stats.ranked;
  const b = stats.bot;
  const strongest = b.highestBotLevel > 0 ? botName(b.highestBotLevel) : null;
  const c = stats.casual;
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <RatingPlate label="Ranked" value={r.rating} provisional={r.provisional} start={GLICKO.startRating} />
        <RatingPlate label="Bot" value={b.rating} provisional={b.provisional} start={ELO.startBotRating} />
      </div>
      <dl className="m-0 mt-3.5 grid grid-cols-4 gap-2">
        {(
          [
            ["Played", r.played],
            ["Won", r.won],
            ["Lost", r.lost],
            ["Drawn", r.drawn],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-sm leading-5 text-muted">{label}</dt>
            <dd className="m-0 font-display text-[32px] leading-9 font-bold">{n}</dd>
          </div>
        ))}
      </dl>
      <dl className="m-0 mt-2 flex flex-col">
        <StatRow label="Surrendered · left early">
          <Num>
            {r.surrendered} · {r.abandoned}
          </Num>
        </StatRow>
        <StatRow label="Best win streak">
          <Num>{r.bestStreak}</Num>
        </StatRow>
        <StatRow label="Strongest bot beaten" last={c.played === 0}>
          <span className={cx("text-[15px] font-semibold", !strongest && "text-muted")}>{strongest ?? "None yet"}</span>
        </StatRow>
        {c.played > 0 ? (
          <StatRow label="Unrated friend games · won" last>
            <Num>
              {c.played} · {c.won}
            </Num>
          </StatRow>
        ) : null}
      </dl>
      <Accuracy stats={stats} />
    </>
  );
}

/** Your record against them: big numbers in the player colours over a split bar. */
function HeadToHead({ h2h, you, them }: { h2h: NonNullable<Profile["headToHead"]>; you: string; them: string }) {
  const total = h2h.wins + h2h.losses;
  return (
    <section aria-label="Head to head" className="plate mt-5 p-4">
      <span className="text-sm leading-5 text-muted">You against {them}</span>
      {h2h.wins + h2h.losses + h2h.draws === 0 ? (
        <p className="m-0 mt-2 text-[15px] leading-[22px]">No duels between you two yet.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end">
            <div className="flex min-w-0 flex-col items-start gap-1">
              <NameTag name={you} who="you" />
              <span className="font-display text-[72px] leading-[72px] font-bold text-you">{h2h.wins}</span>
            </div>
            <span className="flex flex-col items-center pb-3.5 font-display text-[28px] font-bold text-muted">
              ·{h2h.draws > 0 ? <span className="text-sm leading-5 font-semibold">{h2h.draws} drawn</span> : null}
            </span>
            <div className="flex min-w-0 flex-col items-end gap-1">
              <NameTag name={them} who="opponent" />
              <span className="font-display text-[72px] leading-[72px] font-bold text-opponent">{h2h.losses}</span>
            </div>
          </div>
          {total > 0 ? (
            <div aria-hidden className="mt-3 flex h-2 gap-0.5">
              {h2h.wins > 0 ? <span className="bg-you" style={{ flex: h2h.wins }} /> : null}
              {h2h.losses > 0 ? <span className="bg-opponent" style={{ flex: h2h.losses }} /> : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

const RESULT_WORD: Record<MatchSummary["result"], string> = { win: "Won", loss: "Lost", draw: "Drawn", void: "Void" };

/** Your matches against this player, newest first, from your own history. */
function LastMeetings({ meUsername, themId, courseId }: { meUsername: string; themId: string; courseId: string | null }) {
  const mine = useUserMatches(meUsername, courseId);
  const meetings = (mine.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.opponent?.id === themId).slice(0, LAST_MEETINGS);
  if (mine.isPending || mine.error || meetings.length === 0) return null;
  return (
    <>
      <SectionHeading className="mt-5 mb-0.5">Last meetings</SectionHeading>
      {meetings.map((m, i) => (
        <Link
          key={m.id}
          to={`/matches/${m.id}`}
          className={cx("grid h-10 grid-cols-[minmax(0,1fr)_64px_56px] items-center text-[15px]", i < meetings.length - 1 && "border-b border-line")}
        >
          <span className="truncate">{dayLabel(m.endedAt)}</span>
          <span className="text-sm text-muted">{RESULT_WORD[m.result]}</span>
          <span className={cx("text-right font-display text-xl font-bold", m.result !== "win" && "text-muted")}>
            {m.ratingChange !== null ? signed(m.ratingChange) : "·"}
          </span>
        </Link>
      ))}
    </>
  );
}

function TheirStats({ stats }: { stats: CourseStats }) {
  const r = stats.ranked;
  const strongest = stats.bot.highestBotLevel > 0 ? botName(stats.bot.highestBotLevel) : null;
  return (
    <dl className="m-0 mt-[18px] flex flex-col">
      <StatRow label="Ranked rating">
        <Num>
          <Rating value={r.rating ?? GLICKO.startRating} provisional={r.provisional || r.rating === null} />
        </Num>
      </StatRow>
      <StatRow label="Played · won · lost">
        <Num>
          {r.played} · {r.won} · {r.lost}
        </Num>
      </StatRow>
      <StatRow label="Left early">
        <Num>{r.abandoned}</Num>
      </StatRow>
      <StatRow label="Strongest bot beaten" last>
        <span className={cx("text-[15px] font-semibold", !strongest && "text-muted")}>{strongest ?? "None yet"}</span>
      </StatRow>
    </dl>
  );
}

/** Duel them: the friend lobby (settings, then a code and a link to send them). */
function DuelButton({ name }: { name: string }) {
  return (
    <div className="pt-6">
      <PrimaryLink to="/friend" height={56} large>
        <Icon name="swords" size={20} stroke={2.4} />
        <span className="truncate">Duel {name}</span>
      </PrimaryLink>
    </div>
  );
}

function useProfileData(username: string) {
  const profile = useUserProfile(username);
  const { courseId, course } = useCurrentCourse();
  const shown = profile.data?.courses.find((c) => c.courseId === courseId) ?? null;
  return { profile, courseId, course, shown };
}

export function MyProfile() {
  const me = useMeData();
  const username = me.user.username ?? "";
  const { profile, course, shown } = useProfileData(username);
  return (
    <Screen>
      <Header
        title="Profile"
        big
        right={
          <>
            <HeaderIconLink to="/history" label="Match history" icon="history" />
            <HeaderIconLink to="/settings" label="Settings" icon="gear" />
          </>
        }
      />
      <Body className="pb-3">
        {!username ? (
          <Quiet>Pick a username first.</Quiet>
        ) : profile.isPending ? (
          <LoadingPlates count={4} height={64} />
        ) : profile.error ? (
          <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        ) : (
          <>
            <Identity user={profile.data.user} you />
            <div className="mt-4 empty:hidden">
              <CourseSwitch />
            </div>
            {shown ? <OwnStats stats={shown} /> : <Quiet>No games in {course?.shortTitle ?? "this course"} yet.</Quiet>}
          </>
        )}
      </Body>
    </Screen>
  );
}

export function PublicProfile() {
  const { username = "" } = useParams();
  return <PublicProfileView key={username} username={username} />;
}

function PublicProfileView({ username }: { username: string }) {
  const me = useMeData();
  const { profile, courseId, course, shown } = useProfileData(username);
  const data = profile.data;
  const them = data?.user.displayUsername ?? username;
  return (
    <Screen>
      <Header title={them} back />
      <Body className="pb-6">
        {profile.isPending ? (
          <LoadingPlates count={4} height={64} />
        ) : profile.error || !data ? (
          <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        ) : (
          <>
            <Identity user={data.user} you={data.isSelf} />
            {data.headToHead ? <HeadToHead h2h={data.headToHead} you={me.user.displayUsername ?? me.user.username ?? "You"} them={them} /> : null}
            <div className="mt-4 empty:hidden">
              <CourseSwitch />
            </div>
            {!data.isSelf && me.user.username ? <LastMeetings meUsername={me.user.username} themId={data.user.id} courseId={courseId} /> : null}
            {shown ? (
              data.isSelf ? (
                <OwnStats stats={shown} />
              ) : (
                <>
                  <TheirStats stats={shown} />
                  <SectionHeading className="mt-5">
                    <Link to={`/history?user=${encodeURIComponent(data.user.username)}`} className="flex h-11 w-full items-center justify-between text-[15px] font-semibold">
                      All their matches
                      <Icon name="right" size={16} stroke={2} className="text-muted" />
                    </Link>
                  </SectionHeading>
                </>
              )
            ) : (
              <Quiet>No games in {course?.shortTitle ?? "this course"} yet.</Quiet>
            )}
            <span className="flex-1" />
            {!data.isSelf ? <DuelButton name={them} /> : null}
          </>
        )}
      </Body>
    </Screen>
  );
}
