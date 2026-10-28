// The whole match screen for one state: lobby, intro, the duel (arming,
// banners, question, reveal), and the end screen. Driven only by the state the
// reducer built from server messages; taps go out through `actions`.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BOT_LADDER, POWERUPS, TIMING } from "@shared/game/config";
import type { BlindPowerupId, PowerupId, QuickPowerupId } from "@shared/game/types";
import { apiRequest } from "../lib/api";
import { usePrefersReducedMotion, useSoundPref, useWakeLock } from "./browser";
import type { MatchClock } from "./clock";
import { LINES } from "./copy";
import { fmtClock } from "./format";
import { FX } from "./fx";
import { sfx } from "./sfx";
import { canSurrender, canUseQuick, type MatchUiState } from "./state";
import type { MatchActions } from "./useMatch";
import { AnswerArea, LockInButton, useMultiPick } from "./components/AnswerArea";
import { BlindBanner, QuickStrip } from "./components/Banners";
import { EventLane } from "./components/Callout";
import { ClockPlate } from "./components/Clock";
import { MuteButton, SurrenderButton } from "./components/Controls";
import { EndView, type NextBot } from "./components/EndView";
import { FoundView, type HeadToHead } from "./components/FoundView";
import { useNow, usePulse } from "./components/hooks";
import { Hud, TopBar, type HitView } from "./components/Hud";
import { LobbyView } from "./components/LobbyView";
import { ArmingCallout, IntroView, modeLabel } from "./components/Phases";
import { PowerupRow, type PowerupButtonState } from "./components/PowerupRow";
import { QuestionCard, RevealBand } from "./components/QuestionCard";
import "./match.css";

export interface MatchNav {
  home(): void;
  playAgain(courseId: string | null): void;
  missed(courseId: string | null): void;
  match(matchId: string): void;
  /** Start a match against a ladder bot (the end screen's "Play the next bot"). Absent: no button. */
  fightBot?(level: number, courseId: string | null): void;
}

/** Things the match socket does not carry, which the live screen fetches from the API. */
export interface MatchExtras {
  /** Your record against a human opponent, for "Opponent found". */
  record: HeadToHead | null;
  /** The bot ladder as it stood before this match, to tell "unlocked" from "next up". */
  ladderBefore: { level: number; unlocked: boolean }[] | null;
  /** A "Fight" request is on its way. */
  fightPending?: boolean;
  fightError?: string | null;
  /** The match's course title, for the versus and end screens. */
  courseTitle?: string | null;
}

interface Props {
  state: MatchUiState;
  actions: MatchActions;
  clock: MatchClock;
  nav: MatchNav;
  extras?: MatchExtras;
}

const LIVE_PHASES = new Set(["lobby", "intro", "arming", "banner", "question", "reveal"]);

/** Reveal timeline steps: 1 answers marked, 3 hit landed, 4 explanation. */
type RevealStep = 1 | 3 | 4;

function useRevealStep(state: MatchUiState): RevealStep {
  const fx = state.revealFx;
  const [stage, setStage] = useState<{ seq: number; step: RevealStep }>({ seq: 0, step: 4 });
  useEffect(() => {
    if (!fx) return;
    if (!fx.live) {
      setStage({ seq: fx.seq, step: 4 });
      return;
    }
    const seq = fx.seq;
    setStage({ seq, step: 1 });
    const ids = [
      window.setTimeout(() => setStage({ seq, step: 3 }), FX.revealImpactMs),
      window.setTimeout(() => setStage({ seq, step: 4 }), FX.revealLineMs),
    ];
    return () => ids.forEach((id) => window.clearTimeout(id));
    // Keyed on the reveal sequence only.
  }, [fx?.seq]);
  if (!fx) return 4;
  if (stage.seq !== fx.seq) return fx.live ? 1 : 4;
  return stage.step;
}

/** How long the ranked "Opponent found" card holds before the intro (design.md: 2 seconds). */
const FOUND_HOLD_MS = 2000;

/** The ladder bot after the one just beaten, or null (not a ladder win, or the top of the ladder). */
function nextBotAfterWin(state: MatchUiState, extras: MatchExtras | undefined): NextBot | null {
  if (state.mode !== "bot" || state.result?.result !== "win") return null;
  const level = state.opponent?.botLevel ?? null;
  if (level === null || level < 1) return null;
  const next = BOT_LADDER.find((b) => b.level === level + 1);
  if (!next) return { level: null, name: null, line: null, rating: null, unlocked: false, beatenName: state.opponent?.name ?? "" };
  const before = extras?.ladderBefore?.find((b) => b.level === next.level);
  return { level: next.level, name: next.name, line: next.line, rating: next.rating, unlocked: before ? !before.unlocked : false, beatenName: state.opponent?.name ?? "" };
}

export function MatchView({ state, actions, clock, nav, extras }: Props) {
  const reduced = usePrefersReducedMotion();
  const [soundOn, toggleSound] = useSoundPref((sound) => {
    apiRequest("putPrefs", { body: { sound } }).catch(() => undefined);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sfx.enabled = soundOn;
  }, [soundOn]);

  // Browsers only allow audio after a gesture: unlock on the first tap anywhere.
  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  useWakeLock(state.phase !== null && LIVE_PHASES.has(state.phase) && state.status !== "replaced");

  const rematchId = state.rematch?.matchId ?? null;
  useEffect(() => {
    if (rematchId && rematchId !== state.matchId) nav.match(rematchId);
  }, [rematchId, state.matchId, nav]);

  // Ranked: hold "Opponent found" for a moment when the match opens in its lobby or intro.
  const firstPhase = useRef<string | null>(null);
  if (firstPhase.current === null && state.loaded && state.phase !== null) firstPhase.current = state.phase;
  const foundKey =
    state.mode === "ranked" && (firstPhase.current === "lobby" || firstPhase.current === "intro") ? (state.matchId ?? "found") : null;
  const foundHold = usePulse(foundKey, FOUND_HOLD_MS);

  const step = useRevealStep(state);
  const reveal = state.phase === "reveal" ? state.reveal : null;
  const fx = state.revealFx;
  const live = !!fx?.live;

  // HP shown on the bars: the old value until the hit lands.
  const displayHp = {
    you: fx && live && reveal && step < 3 ? fx.before.you : (state.you?.hp ?? 0),
    opponent: fx && live && reveal && step < 3 ? fx.before.opponent : (state.opponent?.hp ?? 0),
  };

  const hit = useMemo((): { victim: "you" | "opponent"; view: HitView } | null => {
    if (!reveal || !fx || !live || step < 3) return null;
    const victim = reveal.damageToYou > 0 ? "you" : reveal.damageToOpponent > 0 ? "opponent" : null;
    if (!victim) return null;
    const amount = victim === "you" ? reveal.damageToYou : reveal.damageToOpponent;
    const attacker = victim === "you" ? "opponent" : "you";
    return {
      victim,
      view: {
        seq: fx.seq,
        amount,
        before: fx.before[victim],
        speed: reveal.yourCorrect && reveal.opponentCorrect,
        bibi: reveal.bibi === attacker,
        shield: reveal.shield === victim,
        capped: reveal.capped,
        big: amount >= FX.bigHit,
      },
    };
  }, [reveal, fx, live, step]);

  // The knockout: the last hit empties a bar and K.O. takes the event lane.
  const knockout = hit !== null && reveal !== null && (reveal.hp.you === 0 || reveal.hp.opponent === 0);

  const forfeitNow = useNow(clock, 500, state.opponentForfeitAt !== null);
  const forfeitIn =
    state.opponent && !state.opponent.connected
      ? state.opponentForfeitAt !== null
        ? fmtClock(state.opponentForfeitAt - forfeitNow)
        : ""
      : null;

  const onTick = (sec: number) => sfx.play(sec <= 1 ? "tickLast" : "tick");

  let content: ReactNode;
  const status = state.status;
  if (status === "replaced") {
    content = (
      <Notice title={LINES.anotherDevice} sub={LINES.anotherDeviceSub}>
        <div className="p-1">
          <button type="button" onClick={actions.reconnectNow} className="btn-primary h-14 w-full rounded-xs text-2xl leading-7">
            {LINES.playHere}
          </button>
        </div>
        <HomeButton onHome={nav.home} />
      </Notice>
    );
  } else if (status === "not_found" || status === "not_authorised") {
    content = (
      <Notice title={status === "not_found" ? LINES.notFound : LINES.notYours}>
        <HomeButton onHome={nav.home} />
      </Notice>
    );
  } else if (!state.loaded) {
    content = <Notice title={status === "reconnecting" ? LINES.reconnecting : LINES.connecting} pulse />;
  } else if (state.mode !== "private" && state.you && state.opponent && (state.phase === "lobby" || (state.phase === "intro" && foundHold))) {
    content = (
      <FoundView
        you={state.you}
        opponent={state.opponent}
        waiting={state.phase === "lobby"}
        noShowAt={state.noShowAt}
        record={extras?.record ?? null}
        clock={clock}
        onHome={nav.home}
      />
    );
  } else if (state.phase === "lobby") {
    content = <LobbyView state={state} courseTitle={extras?.courseTitle ?? null} onReady={actions.ready} onHome={nav.home} />;
  } else if ((state.phase === "finished" || state.phase === "cancelled") && state.result) {
    content = (
      <EndView
        result={state.result}
        mode={state.mode}
        rated={state.rated}
        course={extras?.courseTitle ?? null}
        you={state.you}
        opponent={state.opponent}
        rematch={state.rematch}
        clock={clock}
        connected={status === "open"}
        onRematch={actions.rematch}
        onPlayAgain={() => nav.playAgain(state.courseId)}
        onReviewMissed={() => nav.missed(state.courseId)}
        onHome={nav.home}
        nextBot={nextBotAfterWin(state, extras)}
        onFightBot={nav.fightBot ? (level) => nav.fightBot!(level, state.courseId) : undefined}
        fightPending={extras?.fightPending ?? false}
        fightError={extras?.fightError ?? null}
      />
    );
  } else if (state.phase === "finished" || state.phase === "cancelled") {
    content = <Notice title={LINES.finishing} pulse />;
  } else if (state.phase === "intro" && state.you && state.opponent) {
    content = (
      <IntroView you={state.you} opponent={state.opponent} mode={state.mode} rated={state.rated} course={extras?.courseTitle ?? null} />
    );
  } else if (state.you && state.opponent) {
    content = (
      <Duel
        state={state}
        actions={actions}
        clock={clock}
        displayHp={displayHp}
        hit={hit}
        knockout={knockout}
        step={step}
        forfeitIn={forfeitIn}
        onTick={onTick}
        controls={
          <>
            <MuteButton on={soundOn} onToggle={toggleSound} />
            <SurrenderButton enabled={canSurrender(state)} onSurrender={actions.surrender} />
          </>
        }
      />
    );
  } else {
    content = <Notice title={LINES.connecting} pulse />;
  }

  const inDuel = state.phase === "arming" || state.phase === "banner" || state.phase === "question" || state.phase === "reveal";

  return (
    <div
      ref={rootRef}
      className={`rq-match relative mx-auto flex h-dvh w-full max-w-column flex-col overflow-hidden bg-bg text-text select-none ${reduced ? "rq-rm" : ""}`}
      onContextMenu={(e) => {
        if (inDuel) e.preventDefault();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">{content}</div>
      {status === "reconnecting" && state.loaded && (
        <div className="pointer-events-none absolute top-[calc(max(env(safe-area-inset-top),0px)+152px)] left-1/2 z-[60] -translate-x-1/2 bg-surface px-3 py-1 text-sm font-semibold text-text">
          <span className="rq-pulse">{LINES.reconnecting}</span>
        </div>
      )}
    </div>
  );
}

/** The quick power-up line of this question, unless it is already old (a reconnect or a late mount). */
function freshQuick(state: MatchUiState, clock: MatchClock) {
  const q = state.quickFx;
  if (!q || q.round !== state.round || state.phase !== "question") return null;
  const life = q.who === "you" ? FX.quickBannerMs : FX.toastMs;
  return clock.now() - q.at < life ? q : null;
}

/** Length of the current phase: from the message that started it, else the configured length. */
function phaseTotal(state: MatchUiState, fallback: number): number {
  if (state.phaseStartedAt !== null && state.phaseEndsAt !== null && state.phaseEndsAt > state.phaseStartedAt) {
    return state.phaseEndsAt - state.phaseStartedAt;
  }
  return fallback;
}

function HomeButton({ onHome }: { onHome(): void }) {
  return (
    <button type="button" onClick={onHome} className="plate press h-12 w-full rounded-xs font-semibold">
      Home
    </button>
  );
}

function Notice({ title, sub, pulse, children }: { title: string; sub?: string; pulse?: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className={`text-[17px] leading-6 font-semibold ${pulse ? "rq-pulse text-muted" : ""}`}>{title}</p>
      {sub && <p className="text-sm text-muted">{sub}</p>}
      {children && <div className="mt-4 flex w-full max-w-xs flex-col gap-3">{children}</div>}
    </div>
  );
}

/**
 * The answer list's own scroll region, between the question card and the
 * reveal band. The prompt above and the band below never move or clip; when
 * the answers do not fit, this part scrolls and says so with a fade and an
 * arrow at its bottom edge. Answers sit at the bottom, in the thumb zone.
 */
function AnswerScroll({ scrollKey, children }: { scrollKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [scrollKey]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 12);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    for (const child of Array.from(el.children)) ro?.observe(child);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(check) : null;
    mo?.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", check);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, []);
  return (
    <div className="relative flex min-h-[7.5rem] shrink flex-col">
      <div ref={ref} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="mt-auto pb-[3px]">{children}</div>
      </div>
      {more && (
        <div className="pointer-events-none absolute right-1 bottom-1 z-20 flex h-7 w-7 items-center justify-center rounded-xs bg-gold text-bg" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

interface DuelProps {
  state: MatchUiState;
  actions: MatchActions;
  clock: MatchClock;
  displayHp: { you: number; opponent: number };
  hit: { victim: "you" | "opponent"; view: HitView } | null;
  knockout: boolean;
  step: RevealStep;
  forfeitIn: string | null;
  onTick(sec: number): void;
  controls: ReactNode;
}

function Duel({ state, actions, clock, displayHp, hit, knockout, step, forfeitIn, onTick, controls }: DuelProps) {
  const you = state.you!;
  const opponent = state.opponent!;
  const now = useNow(clock, 250, state.phase === "question");
  const question = state.question;
  const showQuestion = (state.phase === "question" || state.phase === "reveal") && question !== null;
  const quick = freshQuick(state, clock);
  const quickVisible = usePulse(quick ? quick.seq : null, quick?.who === "you" ? FX.quickBannerMs : FX.toastMs);
  const [picked, togglePick] = useMultiPick(question?.round ?? null);
  // The reveal's report flag: one tap files the report without leaving the duel.
  const [reported, setReported] = useState<ReadonlySet<string>>(() => new Set());
  const report = (questionId: string) => {
    setReported((prev) => new Set(prev).add(questionId));
    apiRequest("report", { params: { id: questionId }, body: { reason: "other", matchId: state.matchId ?? undefined } }).catch(() => {
      setReported((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    });
  };

  const buttons = you.loadout.map((id): { id: PowerupId; state: PowerupButtonState } => {
    // Firing: your blind power-up during its banner, your quick one on the question it was used on.
    if (state.phase === "banner" && state.banner?.items.some((i) => i.who === "you" && i.powerup === id)) return { id, state: "armed" };
    if (state.phase === "question" && state.quickUsed === id) return { id, state: "armed" };
    if (you.used.includes(id) && !(state.phase === "arming" && state.armed === id)) return { id, state: "used" };
    if (POWERUPS.blind.includes(id)) {
      if (state.phase !== "arming") return { id, state: "idle" };
      if (state.armed === id) return { id, state: "armed" };
      return { id, state: state.armable.includes(id as BlindPowerupId) ? "armable" : "idle" };
    }
    if (state.quickPending === id) return { id, state: "pending" };
    return {
      id,
      state: canUseQuick(state, id as QuickPowerupId, POWERUPS.fifty.eligibleTypes, now) ? "usable" : "idle",
    };
  });

  const onTap = (id: PowerupId) => {
    if (POWERUPS.blind.includes(id)) actions.arm(id as BlindPowerupId);
    else if (POWERUPS.quick.includes(id)) actions.use(id as QuickPowerupId);
  };

  const round = state.suddenDeath > 0 ? "Sudden death" : state.round > 0 ? `Round ${state.round}` : null;
  const multiplier = question?.multiplier ?? state.multiplier;
  const marked = step >= 1;

  // What takes the event lane over: a blind banner, the arming callout, or your quick power-up strip.
  let takeover: ReactNode = null;
  if (state.phase === "banner" && state.banner) {
    takeover = <BlindBanner banner={state.banner} you={you} opponent={opponent} />;
  } else if (state.phase === "arming" || state.phase === "banner") {
    takeover = (
      <ArmingCallout
        round={state.round}
        multiplier={state.multiplier}
        suddenDeath={state.suddenDeath > 0}
        armable={state.phase === "arming" ? state.armable : []}
        armed={state.armed ?? state.armedAcked}
        opponentName={opponent.name}
        clock={clock}
        endsAt={state.phase === "arming" ? state.phaseEndsAt : null}
        totalMs={phaseTotal(state, state.settings?.powerups === false ? TIMING.armingMsNoPowerups : TIMING.armingMs)}
      />
    );
  } else if (quick && quickVisible && quick.who === "you") {
    takeover = <QuickStrip fx={quick} />;
  }

  return (
    <>
      <div className="pt-[env(safe-area-inset-top)]">
        <TopBar label={`${modeLabel(state.mode)}${round ? ` · ${round}` : ""}`} controls={controls} />
      </div>
      <Hud
        you={you}
        opponent={opponent}
        hp={displayHp}
        hit={hit}
        answered={{
          you: state.phase === "question" && state.yourAnswer !== null,
          opponent: state.phase === "question" && state.opponentAnswered,
        }}
        multiplier={multiplier}
        clock={<ClockPlate state={state} clock={clock} onTick={onTick} />}
      />
      <EventLane
        state={state}
        clock={clock}
        hit={hit?.view ?? null}
        knockout={knockout}
        marked={marked}
        opponentQuick={quick && quickVisible && quick.who === "opponent" ? quick : null}
        forfeitIn={forfeitIn}
        takeover={takeover}
      />
      <main className={`flex min-h-0 shrink flex-col gap-4 px-4 pb-[max(env(safe-area-inset-bottom),24px)] ${showQuestion ? "" : "pt-4"}`}>
        {showQuestion && (
          <>
            <QuestionCard state={state} question={question!} clock={clock} />
            <AnswerScroll scrollKey={`${state.round}`}>
              <AnswerArea state={state} question={question!} marked={marked} onAnswer={actions.answer} picked={picked} onToggle={togglePick} />
            </AnswerScroll>
            {question!.type === "multi" && state.phase === "question" && <LockInButton state={state} picked={picked} onAnswer={actions.answer} />}
            {state.phase === "reveal" && state.reveal && step >= 4 && (
              <RevealBand reveal={state.reveal} reported={reported.has(state.reveal.questionId)} onReport={report} />
            )}
          </>
        )}
        <PowerupRow buttons={buttons} onTap={onTap} off={you.loadout.length === 0} />
      </main>
    </>
  );
}
