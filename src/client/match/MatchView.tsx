// The whole match screen for one state: lobby, intro, the duel (arming,
// banners, question, reveal), and the end screen. Driven only by the state the
// reducer built from server messages; taps go out through `actions`.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { POWERUPS, TIMING } from "@shared/game/config";
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
import { AnswerArea } from "./components/AnswerArea";
import { BannerOverlay, OpponentToast, PhoenixOverlay, QuickBanner } from "./components/Banners";
import { MuteButton, SurrenderButton } from "./components/Controls";
import { EndView } from "./components/EndView";
import { useNow, usePulse } from "./components/hooks";
import { LobbyView } from "./components/LobbyView";
import { ArmingCard, IntroView, RoundLine } from "./components/Phases";
import { QuestionCard } from "./components/QuestionCard";
import { OpponentStrip, YourStrip, type HitView, type PowerupButtonState } from "./components/Strips";
import "./match.css";

export interface MatchNav {
  home(): void;
  playAgain(courseId: string | null): void;
  missed(courseId: string | null): void;
  match(matchId: string): void;
}

interface Props {
  state: MatchUiState;
  actions: MatchActions;
  clock: MatchClock;
  nav: MatchNav;
}

const LIVE_PHASES = new Set(["lobby", "intro", "arming", "banner", "question", "reveal"]);

/** Reveal timeline steps: 1 answers flipped, 2 hit travelling, 3 hit landed, 4 explanation (and Phoenix). */
type RevealStep = 1 | 2 | 3 | 4;

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
      window.setTimeout(() => setStage({ seq, step: 2 }), FX.revealStreakMs),
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

export function MatchView({ state, actions, clock, nav }: Props) {
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
        zeus: reveal.zeus === attacker,
        aegis: reveal.aegis === victim,
        capped: reveal.capped,
        big: amount > FX.bigHit,
      },
    };
  }, [reveal, fx, live, step]);

  const bigHit = hit?.view.big ? hit : null;
  const shaking = usePulse(bigHit && !reduced ? bigHit.view.seq : null, FX.shakeMs);
  const edge = usePulse(bigHit?.victim === "you" ? bigHit.view.seq : null, 900);
  const oppFlash = usePulse(bigHit?.victim === "opponent" ? bigHit.view.seq : null, 900);

  // Quick power-up lines only belong to the question they were used on.
  const quick = freshQuick(state, clock);
  const quickVisible = usePulse(quick ? quick.seq : null, quick?.who === "you" ? FX.quickBannerMs : FX.toastMs);

  const forfeitNow = useNow(clock, 500, state.opponentForfeitAt !== null);
  const forfeitIn =
    state.opponent && !state.opponent.connected
      ? state.opponentForfeitAt !== null
        ? fmtClock(state.opponentForfeitAt - forfeitNow)
        : ""
      : null;

  const onTick = (sec: number) => sfx.play(sec <= 1 ? "tickLast" : "tick");

  const background = useMemo((): CSSProperties => {
    const glow =
      state.mode === "bot"
        ? "rgba(59,130,246,0.22)"
        : state.mode === "private"
          ? "rgba(245,197,66,0.12)"
          : "rgba(229,72,77,0.2)";
    return { background: `radial-gradient(120% 55% at 50% -10%, ${glow}, transparent 70%), var(--color-bg)` };
  }, [state.mode]);

  let content: ReactNode;
  const status = state.status;
  if (status === "replaced") {
    content = (
      <Notice title={LINES.anotherDevice} sub={LINES.anotherDeviceSub}>
        <button type="button" onClick={actions.reconnectNow} className="h-14 w-full rounded-xl bg-you text-lg font-bold text-bg active:scale-[0.98]">
          {LINES.playHere}
        </button>
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
  } else if (state.phase === "lobby") {
    content = <LobbyView state={state} onReady={actions.ready} onHome={nav.home} />;
  } else if ((state.phase === "finished" || state.phase === "cancelled") && state.result) {
    content = (
      <EndView
        result={state.result}
        mode={state.mode}
        rated={state.rated}
        you={state.you}
        opponent={state.opponent}
        rematch={state.rematch}
        clock={clock}
        connected={status === "open"}
        onRematch={actions.rematch}
        onPlayAgain={() => nav.playAgain(state.courseId)}
        onReviewMissed={() => nav.missed(state.courseId)}
        onHome={nav.home}
      />
    );
  } else if (state.phase === "finished" || state.phase === "cancelled") {
    content = <Notice title={LINES.finishing} pulse />;
  } else if (state.phase === "intro" && state.you && state.opponent) {
    content = (
      <IntroView
        you={state.you}
        opponent={state.opponent}
        mode={state.mode}
        rated={state.rated}
        clock={clock}
        endsAt={state.phaseEndsAt}
        totalMs={phaseTotal(state, TIMING.introMs)}
      />
    );
  } else if (state.you && state.opponent) {
    content = (
      <Duel
        state={state}
        actions={actions}
        clock={clock}
        displayHp={displayHp}
        hit={hit}
        oppFlash={oppFlash}
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
      className={`rq-match relative mx-auto flex h-dvh w-full max-w-[30rem] flex-col overflow-hidden text-text select-none ${reduced ? "rq-rm" : ""}`}
      style={background}
      onContextMenu={(e) => {
        if (inDuel) e.preventDefault();
      }}
    >
      <div className={`flex min-h-0 flex-1 flex-col ${shaking ? "rq-shake" : ""}`}>{content}</div>

      {inDuel && reveal && live && step === 2 && !reduced && <Streak state={state} rootRef={rootRef} />}
      {inDuel && state.phase === "banner" && state.banner && <BannerOverlay banner={state.banner} opponent={state.opponent} />}
      {inDuel && quick && quickVisible && quick.who === "you" && <QuickBanner fx={quick} />}
      {inDuel && reveal?.phoenix && live && step >= 4 && <PhoenixOverlay who={reveal.phoenix} seq={fx?.seq ?? 0} />}
      {edge && <div key={bigHit?.view.seq} className="rq-edge" />}
      {status === "reconnecting" && state.loaded && (
        <div className="pointer-events-none absolute top-[calc(max(env(safe-area-inset-top),10px)+84px)] left-1/2 z-[60] -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-xs font-semibold text-text ring-1 ring-white/20">
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
    <button type="button" onClick={onHome} className="h-12 w-full rounded-xl font-semibold text-muted ring-1 ring-white/10">
      Home
    </button>
  );
}

function Notice({ title, sub, pulse, children }: { title: string; sub?: string; pulse?: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className={`text-lg font-semibold ${pulse ? "rq-pulse text-muted" : ""}`}>{title}</p>
      {sub && <p className="text-sm text-muted">{sub}</p>}
      {children && <div className="mt-4 flex w-full max-w-xs flex-col gap-2.5">{children}</div>}
    </div>
  );
}

/** The hit travelling from the attacker's bar to the defender's. */
function Streak({ state, rootRef }: { state: MatchUiState; rootRef: RefObject<HTMLDivElement | null> }) {
  const reveal = state.reveal!;
  const toThem = reveal.damageToOpponent > 0;
  const toYou = reveal.damageToYou > 0;
  if (!toThem && !toYou) return null;
  const h = rootRef.current?.clientHeight ?? 800;
  const travel = Math.max(200, h - 280);
  const zeus = reveal.zeus === (toThem ? "you" : "opponent");
  const color = zeus ? "var(--color-zeus)" : toThem ? "var(--color-you)" : "var(--color-opponent)";
  const style: CSSProperties = {
    ["--rq-travel" as string]: `${toThem ? -travel : travel}px`,
    background: `linear-gradient(${toThem ? "0deg" : "180deg"}, transparent, ${color} 40%, #fff)`,
    boxShadow: `0 0 18px 4px ${color}`,
    ...(toThem ? { bottom: 130 } : { top: 90 }),
  };
  return <div key={state.revealFx?.seq} className="rq-streak pointer-events-none absolute left-1/2 z-40 h-28 w-2 rounded-full" style={style} />;
}

interface DuelProps {
  state: MatchUiState;
  actions: MatchActions;
  clock: MatchClock;
  displayHp: { you: number; opponent: number };
  hit: { victim: "you" | "opponent"; view: HitView } | null;
  oppFlash: boolean;
  step: RevealStep;
  forfeitIn: string | null;
  onTick(sec: number): void;
  controls: ReactNode;
}

function Duel({ state, actions, clock, displayHp, hit, oppFlash, step, forfeitIn, onTick, controls }: DuelProps) {
  const you = state.you!;
  const opponent = state.opponent!;
  const now = useNow(clock, 250, state.phase === "question");
  const question = state.question;
  const showQuestion = (state.phase === "question" || state.phase === "reveal") && question !== null;
  const quick = freshQuick(state, clock);
  const toastVisible = usePulse(quick && quick.who === "opponent" ? quick.seq : null, FX.toastMs);
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
    if (id === "phoenix") return { id, state: you.used.includes(id) ? "spent" : "passive" };
    if (you.used.includes(id) && !(state.phase === "arming" && state.armed === id)) return { id, state: "used" };
    if (POWERUPS.blind.includes(id)) {
      if (state.phase !== "arming") return { id, state: "idle" };
      if (state.armed === id) return { id, state: "armed" };
      return { id, state: state.armable.includes(id as BlindPowerupId) ? "armable" : "idle" };
    }
    if (state.quickPending === id) return { id, state: "pending" };
    return {
      id,
      state: canUseQuick(state, id as QuickPowerupId, POWERUPS.oracle.eligibleTypes, now) ? "usable" : "idle",
    };
  });

  const onTap = (id: PowerupId) => {
    if (POWERUPS.blind.includes(id)) actions.arm(id as BlindPowerupId);
    else if (POWERUPS.quick.includes(id)) actions.use(id as QuickPowerupId);
  };

  return (
    <>
      <OpponentStrip
        player={{ ...opponent }}
        hp={displayHp.opponent}
        hit={hit?.victim === "opponent" ? hit.view : null}
        hitFlash={oppFlash}
        controls={controls}
        forfeitIn={forfeitIn}
      />
      {toastVisible && quick && (
        <div className="pointer-events-none relative z-30 h-0">
          <div className="absolute inset-x-0 top-0.5 flex justify-center">
            <OpponentToast fx={quick} />
          </div>
        </div>
      )}
      <RoundLine
        round={state.round}
        multiplier={question?.multiplier ?? state.multiplier}
        suddenDeath={state.suddenDeath > 0}
        mode={state.mode}
        opponentAnswered={state.phase === "question" && state.opponentAnswered}
      />
      <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pt-1 pb-2">
        {showQuestion ? (
          <>
            <QuestionCard
              state={state}
              question={question!}
              clock={clock}
              showRevealLine={step >= 4}
              onTick={onTick}
              reported={reported}
              onReport={state.matchId ? report : undefined}
            />
            <div className="mt-auto pt-1">
              <AnswerArea state={state} question={question!} flipped={step >= 1} onAnswer={actions.answer} />
            </div>
          </>
        ) : (
          <ArmingCard
            round={state.round}
            multiplier={state.multiplier}
            suddenDeath={state.suddenDeath > 0}
            armable={state.phase === "arming" ? state.armable : []}
            armed={state.phase === "arming" || state.phase === "banner" ? (state.armed ?? state.armedAcked) : null}
            clock={clock}
            endsAt={state.phase === "arming" ? state.phaseEndsAt : null}
            totalMs={phaseTotal(state, state.settings?.powerups === false ? TIMING.armingMsNoPowerups : TIMING.armingMs)}
          />
        )}
      </div>
      <YourStrip player={you} hp={displayHp.you} hit={hit?.victim === "you" ? hit.view : null} buttons={buttons} onTap={onTap} />
    </>
  );
}
