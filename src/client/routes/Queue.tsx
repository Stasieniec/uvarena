// Ranked queue: searching screen with the course, a timer and how many others
// are searching. After MATCHMAKER.nobodySearchingHintSec alone, it says so and
// offers a friend link or a bot.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MATCHMAKER } from "@shared/game/config";
import { CLOSE_CODES } from "@shared/protocol";
import type { QueueServerMessage } from "@shared/protocol";
import { useCurrentCourse } from "../lib/course";
import { formatClock } from "../lib/format";
import { elapsedMs, type QueueState } from "../lib/queue-state";
import { openQueueSocket, type QueueSocket } from "../lib/queue-socket";
import { qk } from "../lib/queries";
import { SwordsIcon } from "../components/icons";
import { Button, ErrorState, buttonClass } from "../components/ui";

/** How long "Opponent found" stays up here; the match screen then shows who you drew. */
const FOUND_PAUSE_MS = 500;

export function Queue() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { course, courseId } = useCurrentCourse();
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
  const lonely = state.kind === "searching" && others === 0 && elapsed >= MATCHMAKER.nobodySearchingHintSec * 1000;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-ranked/15 to-transparent" />
      <div className="relative text-center">
        <p className="text-xs font-semibold tracking-[0.2em] text-ranked-gold uppercase">Ranked</p>
        <p className="mt-1 truncate text-sm text-muted">{course?.title ?? ""}</p>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 text-center">
        {state.kind === "failed" ? (
          <ErrorState error={new Error(state.message)} onRetry={() => setAttempt((a) => a + 1)} className="w-full" />
        ) : state.kind === "in_match" ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-lg">You are already in a match.</p>
            {state.matchId ? (
              <Link to={`/match/${state.matchId}`} replace className={buttonClass("ranked")}>
                Back to your match
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <div className="relative flex size-44 items-center justify-center">
              {state.kind !== "found" ? (
                <>
                  <span className="search-ring absolute inset-0 rounded-full border-2 border-ranked/50" />
                  <span className="search-ring search-ring-2 absolute inset-0 rounded-full border-2 border-ranked-gold/40" />
                  <span className="search-ring search-ring-3 absolute inset-0 rounded-full border-2 border-ranked/40" />
                </>
              ) : null}
              <span className="pop-in flex size-28 items-center justify-center rounded-full border border-ranked-gold/40 bg-gradient-to-b from-[#4a1822] to-surface shadow-[0_0_40px] shadow-ranked/30">
                <SwordsIcon size={48} className="text-ranked-gold" />
              </span>
            </div>
            {state.kind === "found" ? (
              <p className="font-display pop-in text-3xl font-bold text-text">Opponent found</p>
            ) : (
              <div>
                <p className="font-display text-5xl font-bold tabular-nums" aria-live="off">
                  {formatClock(elapsed)}
                </p>
                <p className="mt-2 text-muted" aria-live="polite">
                  {state.kind === "connecting"
                    ? "Joining the queue"
                    : !connected
                      ? "Reconnecting"
                      : others === 0
                        ? "Searching"
                        : `${others} other${others === 1 ? "" : "s"} searching`}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {lonely ? (
        <div className="pop-in relative mb-4 rounded-2xl border border-border bg-surface p-4" role="status">
          <p className="font-semibold">Nobody else is searching.</p>
          <p className="mt-1 text-sm text-muted">You can keep waiting, or:</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/friend" className={buttonClass("secondary", "px-3 text-sm")} onClick={() => socket.current?.close()}>
              Send a friend a link
            </Link>
            <Link to="/bots" className={buttonClass("bot", "px-3 text-sm")} onClick={() => socket.current?.close()}>
              Play a bot instead
            </Link>
          </div>
        </div>
      ) : null}

      {state.kind !== "found" ? (
        <Button variant="secondary" onClick={leave} className="relative w-full">
          {state.kind === "failed" || state.kind === "in_match" ? "Home" : "Cancel"}
        </Button>
      ) : null}
    </main>
  );
}
