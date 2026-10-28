// Ranked queue: the HUD strip pre-forms with your plate and an empty
// "SEARCHING ?" plate while the clock counts up; under it the rating window and
// how many others are searching. After MATCHMAKER.nobodySearchingHintSec alone,
// it says so and offers a friend link or a bot.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { GLICKO, MATCH, MATCHMAKER } from "@shared/game/config";
import { CLOSE_CODES } from "@shared/protocol";
import type { QueueServerMessage } from "@shared/protocol";
import { useCurrentCourse } from "../lib/course";
import { formatClock, formatRating } from "../lib/format";
import { elapsedMs, type QueueState } from "../lib/queue-state";
import { openQueueSocket, type QueueSocket } from "../lib/queue-socket";
import { qk, useHome, useMeData } from "../lib/queries";
import { Strip, StripBar, StripClock, StripPlate } from "../components/DuelMotif";
import { ShareIcon } from "../components/icons";
import { Button, ErrorState, buttonClass, cx } from "../components/ui";

/** The rating window bar spans your rating plus and minus this much. */
const WINDOW_SCALE = 600;

/** The allowed rating gap as a bar: the window in muted, your rating as a teal mark. */
function WindowBar({ rating, window }: { rating: number; window: number | null }) {
  const half = window === null ? WINDOW_SCALE : Math.min(window, WINDOW_SCALE);
  const width = (half / WINDOW_SCALE) * 50;
  return (
    <div className="mt-5 w-full">
      <div aria-hidden className="relative h-2 bg-line">
        <span className="absolute inset-y-0 bg-muted transition-[left,width] duration-300" style={{ left: `${50 - width}%`, width: `${width * 2}%` }} />
        <span className="absolute -inset-y-1.5 left-1/2 w-[3px] -translate-x-1/2 bg-you" />
      </div>
      <div className="mt-2 flex justify-between text-sm leading-5 text-muted">
        {window === null ? (
          <>
            <span>Any rating</span>
            <span />
          </>
        ) : (
          <>
            <span>{Math.round(rating - window)}</span>
            <span>widens every {MATCHMAKER.widenEverySec} s</span>
            <span>{Math.round(rating + window)}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** How long "Opponent found" stays up here; the match screen then shows who you drew. */
const FOUND_PAUSE_MS = 500;

export function Queue() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { course, courseId } = useCurrentCourse();
  const me = useMeData();
  const home = useHome(courseId);
  const [keepWaiting, setKeepWaiting] = useState(false);
  const [state, setState] = useState<QueueState>({ kind: "connecting" });
  const [connected, setConnected] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const mountedAt = useRef(Date.now());
  const socket = useRef<QueueSocket | null>(null);

  useEffect(() => {
    if (!courseId) return;
    mountedAt.current = Date.now();
    setState({ kind: "connecting" });
    const s = openQueueSocket(courseId, {
      onMessage(msg: QueueServerMessage) {
        if (msg.type === "queue_status") {
          setState({ kind: "searching", searching: msg.searching, waitedMs: msg.waitedMs, at: Date.now(), window: msg.window });
        } else if (msg.type === "matched") {
          setState({ kind: "found", matchId: msg.matchId });
        } else if (msg.code === "already_in_match") {
          setState({ kind: "in_match", matchId: msg.matchId });
        } else {
          setState({
            kind: "failed",
            message:
              msg.code === "bad_course"
                ? "That course has no ranked queue."
                : msg.code === "rate_limited"
                  ? "Slow down. Try again in a minute."
                  : "The queue hit a problem.",
          });
        }
      },
      onClose(code) {
        setState((prev) => {
          if (prev.kind === "found" || prev.kind === "in_match" || prev.kind === "failed") return prev;
          if (code === CLOSE_CODES.normal) return prev;
          if (code === CLOSE_CODES.notAuthorised) return { kind: "failed", message: "You are signed out. Log in again." };
          return { kind: "failed", message: "Lost the queue connection." };
        });
      },
      onConnectionChange: setConnected,
    });
    socket.current = s;
    return () => {
      s.close();
      socket.current = null;
    };
  }, [courseId, attempt]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (state.kind !== "found") return;
    void qc.invalidateQueries({ queryKey: qk.me });
    const t = setTimeout(() => navigate(`/match/${state.matchId}`, { replace: true }), FOUND_PAUSE_MS);
    return () => clearTimeout(t);
  }, [state, navigate, qc]);

  const leave = () => {
    socket.current?.close();
    navigate("/", { replace: true });
  };

  const elapsed = elapsedMs(state, mountedAt.current, now);
  const others = state.kind === "searching" ? Math.max(0, state.searching - 1) : null;
  const lonely = !keepWaiting && state.kind === "searching" && others === 0 && elapsed >= MATCHMAKER.nobodySearchingHintSec * 1000;
  const name = me.user.displayUsername ?? me.user.username ?? "You";
  const ranked = home.data?.ranked;
  const ratingText = ranked ? formatRating(ranked.rating, ranked.provisional) : null;
  const leaveTo = () => socket.current?.close();

  return (
    <main className="flex min-h-dvh flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex h-11 flex-none items-center justify-between gap-3 px-4 text-sm leading-5 text-muted">
        <span className="truncate">Ranked{course ? ` · ${course.shortTitle}` : ""}</span>
        <span>Rated</span>
      </div>
      <div className="px-4 pt-1">
        <Strip
          you={<StripPlate side="you" name={name} value={ratingText ?? "\u00a0"} />}
          clock={<StripClock label={`Searching for ${formatClock(elapsed)}`}>{formatClock(elapsed)}</StripClock>}
          them={<StripPlate side="them" name={state.kind === "found" ? "FOUND" : "SEARCHING"} value="?" empty />}
          youBar={<StripBar side="you" hp={MATCH.startHp} />}
          themBar={<StripBar side="them" hp={0} empty />}
        />
      </div>

      {state.kind === "failed" ? (
        <div className="flex flex-1 flex-col px-4">
          <div className="flex-1" />
          <ErrorState error={new Error(state.message)} onRetry={() => setAttempt((a) => a + 1)} className="w-full" />
          <div className="flex-1" />
          <Button variant="secondary" onClick={leave} className="min-h-13">
            Home
          </Button>
        </div>
      ) : state.kind === "in_match" ? (
        <div className="flex flex-1 flex-col px-4">
          <div className="flex-1" />
          <p className="font-display text-5xl leading-[50px] font-bold">You are already in a match.</p>
          <div className="flex-1" />
          <div className="flex flex-col gap-3">
            {state.matchId ? (
              <Link to={`/match/${state.matchId}`} replace className={buttonClass("primary")}>
                Back to your match
              </Link>
            ) : null}
            <Button variant="secondary" onClick={leave} className="min-h-13">
              Home
            </Button>
          </div>
        </div>
      ) : state.kind === "found" ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="font-display pop-in text-[40px] leading-[44px] font-bold tracking-[0.02em] text-transparent italic [-webkit-text-stroke:1.5px_var(--color-text)]">
            OPPONENT FOUND
          </p>
        </div>
      ) : lonely ? (
        <div className="flex flex-1 flex-col px-4" role="status">
          <div className="flex-1" />
          <h1 className="font-display text-5xl leading-[50px] font-bold">Nobody else is searching.</h1>
          <p className="mt-3 text-base leading-6 text-muted">You can keep waiting. The queue takes anyone after {MATCHMAKER.unlimitedAfterSec} s.</p>
          <div className="flex-1" />
          <div className="flex flex-col gap-3">
            <Link to="/friend" className={buttonClass("primary")} onClick={leaveTo}>
              Send a friend a link
              <ShareIcon size={20} strokeWidth={2.4} />
            </Link>
            <Link to="/bots" className={buttonClass("secondary", "min-h-13")} onClick={leaveTo}>
              Play a bot instead
            </Link>
            <Button variant="ghost" onClick={() => setKeepWaiting(true)}>
              Keep waiting
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center px-4">
          <div className="flex-1" />
          <p className="font-display text-[clamp(52px,16vw,64px)] leading-none font-bold italic">SEARCHING</p>
          <p className="mt-3 text-[17px] leading-6" aria-live="polite">
            {state.kind === "connecting" ? "Joining the queue" : !connected ? "Reconnecting" : ratingText ? `Players near ${ratingText}` : "Finding a player"}
          </p>
          {ratingText && ranked && state.kind === "searching" ? <WindowBar rating={ranked.rating ?? GLICKO.startRating} window={state.window} /> : null}
          <p className="mt-6 flex items-center gap-2 text-[15px] leading-5 text-muted">
            <span aria-hidden className={cx("size-1.5", others ? "bg-you" : "bg-line")} />
            {others === null ? "Counting players" : others === 0 ? "Nobody else searching yet" : `${others} other${others === 1 ? "" : "s"} searching`}
          </p>
          <div className="flex-[1.4]" />
          <Button variant="secondary" onClick={leave} className="min-h-13 self-stretch">
            Cancel
          </Button>
        </div>
      )}
    </main>
  );
}
