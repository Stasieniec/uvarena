// Home: you, the course and sound in a thin bar; the big ranked rating with
// Find a duel (the one primary) and Duel a friend; rows for the bot match,
// power-ups and missed questions; the last matches as plain lines.
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { HomeResponse, MatchSummary } from "@shared/api-schemas";
import { BOT_LADDER, ELO } from "@shared/game/config";
import { useCurrentCourse } from "../lib/course";
import { formatDelta, formatRating } from "../lib/format";
import { readSoundPref, writeSoundPref } from "../lib/local-prefs";
import { useConfig, useHome, useMeData, useUpdatePrefs } from "../lib/queries";
import { Page, VerifyBanner } from "../components/AppShell";
import { Avatar } from "../components/Avatar";
import { CourseSwitch } from "../components/CourseSwitch";
import { CoursePicker } from "../components/CoursePicker";
import { ArrowRightIcon, BotIcon, ChevronRightIcon, SoundOffIcon, SoundOnIcon } from "../components/icons";
import { LoadoutSheet } from "../components/LoadoutSheet";
import { PowerupIcon, powerupInfo } from "../components/powerups";
import { ErrorState, RatingText, Sheet, Skeleton, buttonClass, cx } from "../components/ui";

function SoundToggle() {
  const me = useMeData();
  const update = useUpdatePrefs();
  const [on, setOn] = useState(() => readSoundPref() ?? me.prefs.sound);
  const toggle = () => {
    const next = !on;
    setOn(next);
    writeSoundPref(next);
    update.mutate({ sound: next });
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex size-11 shrink-0 items-center justify-center text-muted hover:text-text"
      aria-label={on ? "Sound on. Tap to mute." : "Sound off. Tap to unmute."}
      aria-pressed={on}
    >
      {on ? <SoundOnIcon size={18} strokeWidth={1.8} /> : <SoundOffIcon size={18} strokeWidth={1.8} />}
    </button>
  );
}

function HomeHeader() {
  const me = useMeData();
  const { course } = useCurrentCourse();
  const name = me.user.displayUsername ?? me.user.username ?? "";
  return (
    <header className="-mx-4 flex h-14 items-center gap-3 pr-1 pl-4">
      <Link to="/profile" className="flex min-h-tap min-w-0 items-center gap-3" aria-label={`${name}, your profile`}>
        <Avatar user={me.user} size={32} you />
        <span className="truncate text-base leading-5 font-semibold">{name}</span>
      </Link>
      <span className="flex-1" />
      {course ? <span className="truncate text-sm leading-5 text-muted">{course.shortTitle}</span> : null}
      <SoundToggle />
    </header>
  );
}

function RankedBlock({ home, compact }: { home: HomeResponse; compact: boolean }) {
  const r = home.ranked;
  const rating = formatRating(r.rating, r.provisional);
  const others = Math.max(0, home.searching);
  return (
    <section aria-label="Ranked" className={cx("flex flex-col", compact ? "pt-3" : "pt-4")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base leading-5 font-semibold">Ranked rating</span>
        <span className="text-sm leading-5 text-muted">
          {r.provisional ? `Provisional, ${r.played} played` : `${r.played} played, ${r.won} won`}
        </span>
      </div>
      <p
        className={cx(
          "font-display font-bold tracking-[-1px]",
          compact ? "mt-0.5 text-[clamp(80px,26vw,104px)] leading-[0.96]" : "mt-1 text-[clamp(84px,28vw,112px)] leading-[0.93]",
        )}
        aria-label={`Ranked rating ${rating}`}
      >
        <RatingText text={rating} />
      </p>
      <Link to="/queue" className={buttonClass("primary", cx("min-h-[60px]", compact ? "mt-[19px]" : "mt-[23px]"))}>
        Find a duel
        <ArrowRightIcon size={20} strokeWidth={2.4} />
      </Link>
      <div className="mt-3.5 flex items-center gap-3">
        <Link to="/friend" className={buttonClass("secondary", "flex-1 px-3")}>
          Duel a friend
        </Link>
        <span className="flex w-[132px] items-center gap-2 text-sm leading-5 text-muted">
          <span aria-hidden className={cx("size-1.5 shrink-0", others > 0 ? "bg-you" : "bg-line")} />
          {others === 0 ? "Nobody searching" : `${others} searching now`}
        </span>
      </div>
    </section>
  );
}

/** A 64 px plate row: title and a muted line on the left, a value and a chevron on the right. */
function HomeRow({ title, sub, right, to, onClick, label }: { title: string; sub: string; right: ReactNode; to?: string; onClick?: () => void; label?: string }) {
  const className = "plate press flex h-16 items-center gap-3 rounded-sm pr-3 pl-4 text-left";
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base leading-5 font-semibold">{title}</span>
        <span className="truncate text-sm leading-5 text-muted">{sub}</span>
      </span>
      {right}
      <ChevronRightIcon size={16} className="shrink-0 text-muted" />
    </>
  );
  return to ? (
    <Link to={to} className={className} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cx(className, "w-full")} aria-label={label}>
      {inner}
    </button>
  );
}

function BigNum({ children }: { children: ReactNode }) {
  return <span className="font-display shrink-0 text-[28px] leading-8 font-bold">{children}</span>;
}

function MoreRows({ home }: { home: HomeResponse }) {
  const me = useMeData();
  const [open, setOpen] = useState(false);
  const loadout = me.prefs.loadout;
  const next = home.nextBot;
  const names = loadout.map((p) => powerupInfo(p).name).join(", ");
  return (
    <nav aria-label="More" className="flex flex-col gap-2.5">
      <HomeRow
        to="/bots"
        title="Bot match"
        sub={next ? `Next: ${next.name}, ${Math.round(next.rating)}` : `All ${BOT_LADDER.length} bots beaten`}
        right={
          <BigNum>
            <RatingText text={formatRating(home.bot.rating, home.bot.provisional, ELO.startBotRating)} />
          </BigNum>
        }
      />
      <HomeRow
        onClick={() => setOpen(true)}
        title="Power-ups"
        sub={names}
        label={`Power-ups: ${names}. Tap to change.`}
        right={
          <span aria-hidden className="flex shrink-0 gap-1.5 text-muted">
            {loadout.map((p) => (
              <PowerupIcon key={p} id={p} size={18} />
            ))}
          </span>
        }
      />
      <HomeRow
        to="/missed"
        title="Missed questions"
        sub={home.missedOpen === 0 ? "None to review" : "To review"}
        right={<BigNum>{home.missedOpen}</BigNum>}
      />
      <LoadoutSheet open={open} onClose={() => setOpen(false)} current={loadout} />
    </nav>
  );
}

const RESULT: Record<MatchSummary["result"], string> = { win: "Won", loss: "Lost", draw: "Drawn", void: "Void" };

function RecentMatches({ matches }: { matches: MatchSummary[] }) {
  return (
    <section className="flex flex-col">
      <div className="mb-0.5 flex items-baseline justify-between">
        <h2 className="text-base leading-5 font-semibold">Recent matches</h2>
        {matches.length > 0 ? (
          <Link to="/history" className="-my-3 flex min-h-tap items-center pl-3 text-sm text-muted hover:text-text">
            All matches
          </Link>
        ) : null}
      </div>
      {matches.length === 0 ? (
        <div className="mt-2 flex flex-col items-start gap-3">
          <p className="text-[15px] leading-[22px] text-muted">No matches yet. A bot is a good place to start.</p>
          <Link to="/bots" className={buttonClass("secondary", "px-5")}>
            <BotIcon size={18} />
            Play a bot
          </Link>
        </div>
      ) : (
        matches.map((m, i) => {
          const name = m.opponent ? m.opponent.displayUsername : (m.bot?.name ?? "Bot");
          const delta = m.ratingChange;
          return (
            <Link
              key={m.id}
              to={`/matches/${m.id}`}
              className={cx("grid h-[38px] grid-cols-[minmax(0,1fr)_64px_56px] items-center text-[15px]", i < matches.length - 1 && "border-b border-line")}
            >
              <span className="truncate pr-2">{name}</span>
              <span className="text-sm text-muted">{RESULT[m.result]}</span>
              <span className={cx("font-display text-right text-xl font-bold", (delta ?? 0) <= 0 && "text-muted")}>
                {delta === null ? "" : formatDelta(delta)}
              </span>
            </Link>
          );
        })
      )}
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-4" role="status" aria-label="Loading">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-56" />
      <Skeleton className="h-[60px]" />
      <Skeleton className="h-12" />
      <Skeleton className="mt-4 h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

function FirstCourseSheet() {
  const { courses, hasPicked, setCourse, isLoading } = useCurrentCourse();
  const [dismissed, setDismissed] = useState(false);
  // With one course there is nothing to pick: Home already shows it.
  const open = !hasPicked && !dismissed && !isLoading && courses.length > 1;
  return (
    <Sheet open={open} onClose={() => setDismissed(true)} title="Pick a course">
      <p className="mb-3 text-sm text-muted">Everything on Home follows this. Switch any time at the top of Home.</p>
      <CoursePicker
        courses={courses}
        value={null}
        onPick={(id) => {
          setCourse(id);
          setDismissed(true);
        }}
      />
    </Sheet>
  );
}

export function Home() {
  const { courseId, error: coursesError, refetch: refetchCourses } = useCurrentCourse();
  const home = useHome(courseId);
  const me = useMeData();
  const config = useConfig();
  // The verification banner takes some height: the rating block tightens to fit.
  const banner = !me.user.emailVerified && !!config.data?.emailEnabled;
  return (
    <Page>
      <HomeHeader />
      <VerifyBanner />
      <CourseSwitch />
      {coursesError ? (
        <ErrorState error={coursesError} onRetry={() => void refetchCourses()} className="mt-4" />
      ) : home.isPending ? (
        <HomeSkeleton />
      ) : home.error ? (
        <ErrorState error={home.error} onRetry={() => void home.refetch()} className="mt-4" />
      ) : (
        <>
          <RankedBlock home={home.data} compact={banner} />
          <div className={banner ? "mt-6" : "mt-7"}>
            <MoreRows home={home.data} />
          </div>
          <div className={banner ? "mt-5" : "mt-6"}>
            <RecentMatches matches={home.data.recentMatches} />
          </div>
        </>
      )}
      <FirstCourseSheet />
    </Page>
  );
}
