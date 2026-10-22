// Home: avatar and name, sound, course switch, ranked card, bot match card,
// power-ups, missed questions, recent matches.
import { useState } from "react";
import { Link } from "react-router";
import type { HomeResponse } from "@shared/api-schemas";
import { BOT_LADDER, ELO } from "@shared/game/config";
import { useCurrentCourse } from "../lib/course";
import { formatRating } from "../lib/format";
import { readSoundPref, writeSoundPref } from "../lib/local-prefs";
import { useHome, useMeData, useUpdatePrefs } from "../lib/queries";
import { Page, VerifyBanner } from "../components/AppShell";
import { Avatar } from "../components/Avatar";
import { CourseSwitch } from "../components/CourseSwitch";
import { CoursePicker } from "../components/CoursePicker";
import { BotIcon, ChevronRightIcon, GearIcon, MissedIcon, SoundOffIcon, SoundOnIcon, SwordsIcon } from "../components/icons";
import { LoadoutSheet } from "../components/LoadoutSheet";
import { MatchRow } from "../components/MatchRow";
import { PowerupIcon, powerupInfo } from "../components/powerups";
import { ErrorState, Sheet, SectionTitle, Skeleton, buttonClass, cx } from "../components/ui";

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
      className="flex size-12 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-text"
      aria-label={on ? "Sound on. Tap to mute." : "Sound off. Tap to unmute."}
      aria-pressed={on}
    >
      {on ? <SoundOnIcon /> : <SoundOffIcon />}
    </button>
  );
}

function HomeHeader() {
  const me = useMeData();
  return (
    <header className="flex items-center gap-2 py-2">
      <Link to="/profile" className="flex min-h-tap min-w-0 flex-1 items-center gap-3 rounded-xl pr-2">
        <Avatar user={me.user} size={44} ring="var(--color-you)" />
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold">{me.user.displayUsername ?? me.user.username}</span>
          <span className="block truncate text-xs text-muted">
            {me.user.firstName} {me.user.lastName}
          </span>
        </span>
      </Link>
      <SoundToggle />
      <Link to="/settings" className="flex size-12 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-text" aria-label="Settings">
        <GearIcon />
      </Link>
    </header>
  );
}

function RankedCard({ home }: { home: HomeResponse }) {
  const others = Math.max(0, home.searching);
  return (
    <section className="relative overflow-hidden rounded-3xl border border-ranked-gold/30 bg-gradient-to-br from-[#3a1420] via-surface to-surface p-4 shadow-lg shadow-ranked/10">
      <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-ranked/20 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ranked-gold uppercase">Ranked</p>
          <p className="font-display mt-1 text-5xl font-black tabular-nums text-ranked-gold" aria-label={`Ranked rating ${formatRating(home.ranked.rating, home.ranked.provisional)}`}>
            {formatRating(home.ranked.rating, home.ranked.provisional)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {home.ranked.played} played · {home.ranked.won} won
            {home.ranked.provisional ? " · ? means provisional" : ""}
          </p>
        </div>
        <SwordsIcon size={30} className="mt-1 text-ranked/70" />
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-2">
        <Link to="/queue" className={buttonClass("ranked", "px-3")}>
          Find a duel
        </Link>
        <Link to="/friend" className={buttonClass("secondary", "border-ranked-gold/30 px-3")}>
          Duel a friend
        </Link>
      </div>
      <p className="relative mt-3 flex items-center gap-2 text-sm text-muted">
        <span className={cx("size-2 rounded-full", others > 0 ? "bg-correct shadow-[0_0_8px] shadow-correct" : "bg-muted/50")} />
        {others === 0 ? "Nobody searching right now" : `${others} searching now`}
      </p>
    </section>
  );
}

function BotCard({ home }: { home: HomeResponse }) {
  const provisional = home.bot.provisional;
  const next = home.nextBot;
  return (
    <section className="relative overflow-hidden rounded-3xl border border-bot/30 bg-gradient-to-br from-[#0f2350] via-surface to-surface p-4">
      <div className="pointer-events-none absolute -bottom-16 -left-10 size-44 rounded-full bg-bot/20 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[0.18em] text-[#93c5fd] uppercase">Bot match</p>
          <p className="font-display mt-1 text-3xl font-bold tabular-nums text-[#bfdbfe]">{formatRating(home.bot.rating, provisional, ELO.startBotRating)}</p>
          <p className="mt-1 truncate text-sm text-muted">
            {next ? (
              <>
                Next: <span className="font-semibold text-text">{next.name}</span> · {Math.round(next.rating)}
              </>
            ) : (
              `All ${BOT_LADDER.length} bots beaten`
            )}
          </p>
        </div>
        <Link to="/bots" className={buttonClass("bot", "min-w-24 px-6")}>
          Play
        </Link>
      </div>
    </section>
  );
}

function PowerupsCard() {
  const me = useMeData();
  const [open, setOpen] = useState(false);
  const loadout = me.prefs.loadout;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-tap w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition hover:border-muted/60"
        aria-label={`Power-ups: ${loadout.map((p) => powerupInfo(p).name).join(", ")}. Tap to change.`}
      >
        <span className="text-sm font-semibold">Power-ups</span>
        <span className="flex flex-1 justify-end gap-2">
          {loadout.map((p) => (
            <span key={p} className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface-2">
              <PowerupIcon id={p} size={26} />
            </span>
          ))}
        </span>
        <ChevronRightIcon size={18} className="text-muted" />
      </button>
      <LoadoutSheet open={open} onClose={() => setOpen(false)} current={loadout} />
    </>
  );
}

function MissedCard({ count }: { count: number }) {
  return (
    <Link to="/missed" className="flex min-h-tap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-muted/60">
      <MissedIcon className="text-wrong" />
      <span className="flex-1 text-sm font-semibold">Missed questions</span>
      <span className="text-sm text-muted tabular-nums">{count === 0 ? "None to review" : `${count} to review`}</span>
      <ChevronRightIcon size={18} className="text-muted" />
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading">
      <Skeleton className="h-52 rounded-3xl" />
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-16" />
      <Skeleton className="h-14" />
    </div>
  );
}

function FirstCourseSheet() {
  const { courses, hasPicked, setCourse, isLoading } = useCurrentCourse();
  const [dismissed, setDismissed] = useState(false);
  const open = !hasPicked && !dismissed && !isLoading && courses.length > 0;
  return (
    <Sheet open={open} onClose={() => setDismissed(true)} title="Pick a course">
      <p className="mb-3 text-sm text-muted">Everything on Home follows this. Switch any time with the pills.</p>
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
  return (
    <Page>
      <HomeHeader />
      <VerifyBanner />
      <div className="mb-3">
        <CourseSwitch />
      </div>
      {coursesError ? (
        <ErrorState error={coursesError} onRetry={() => void refetchCourses()} />
      ) : home.isPending ? (
        <HomeSkeleton />
      ) : home.error ? (
        <ErrorState error={home.error} onRetry={() => void home.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <RankedCard home={home.data} />
          <BotCard home={home.data} />
          <PowerupsCard />
          <MissedCard count={home.data.missedOpen} />
          <SectionTitle
            right={
              home.data.recentMatches.length > 0 ? (
                <Link to="/history" className="flex min-h-tap items-center px-1 text-sm font-medium text-you">
                  All matches
                </Link>
              ) : null
            }
          >
            Recent matches
          </SectionTitle>
          {home.data.recentMatches.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
              No matches yet. <BotIcon size={16} className="inline align-[-3px]" /> A bot is a good place to start.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {home.data.recentMatches.map((m) => (
                <MatchRow key={m.id} match={m} />
              ))}
            </div>
          )}
        </div>
      )}
      <FirstCourseSheet />
    </Page>
  );
}
