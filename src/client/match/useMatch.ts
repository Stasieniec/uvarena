// The controller: a MatchStore fed by a transport, actions that update the
// screen optimistically and send the client message, and the sound and
// vibration cues for each server message.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { AnswerKey, BlindPowerupId, QuickPowerupId } from "@shared/game/types";
import type { ClientMessage, ServerMessage } from "@shared/protocol";
import { vibrate } from "./browser";
import { cuesFor } from "./cues";
import { sfx } from "./sfx";
import { MatchStore, type MatchUiState } from "./state";
import type { MatchTransport } from "./transport";

export interface MatchActions {
  ready(): void;
  arm(powerup: BlindPowerupId | null): void;
  use(powerup: QuickPowerupId): void;
  answer(answer: AnswerKey): void;
  surrender(): void;
  rematch(): void;
  reconnectNow(): void;
}

export interface MatchController {
  state: MatchUiState;
  actions: MatchActions;
}

export interface ControllerOptions {
  /** Called with every server message after the store has it (the real screen feeds its clock here). */
  onServerMessage?(msg: ServerMessage, receivedAt: number): void;
}

/**
 * `createTransport` runs inside an effect, so React StrictMode's double
 * mount opens and closes one extra connection instead of leaking it.
 */
export function useMatchController(createTransport: () => MatchTransport, opts: ControllerOptions = {}): MatchController {
  const store = useMemo(() => new MatchStore(), []);
  const transportRef = useRef<MatchTransport | null>(null);
  const timers = useRef<Set<number>>(new Set());
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const transport = createTransport();
    transportRef.current = transport;
    const pending = timers.current;
    store.dispatch({ type: "reset" });
    transport.start({
      onMessage(msg, receivedAt) {
        optsRef.current.onServerMessage?.(msg, receivedAt);
        const { prev } = store.dispatch({ type: "server", msg });
        for (const cue of cuesFor(prev, msg)) {
          const fire = () => {
            if (cue.sound) sfx.play(cue.sound, cue.intensity);
            if (cue.vibrate) vibrate(cue.vibrate);
          };
          if (cue.delayMs <= 0) fire();
          else {
            const id = window.setTimeout(() => {
              pending.delete(id);
              fire();
            }, cue.delayMs);
            pending.add(id);
          }
        }
      },
      onStatus(status) {
        store.dispatch({ type: "status", status });
      },
    });
    return () => {
      transport.stop();
      if (transportRef.current === transport) transportRef.current = null;
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
    // The transport is created once per mount; callers key the component on the match id.
  }, [store]);

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  const send = useCallback((msg: ClientMessage) => transportRef.current?.send(msg) ?? false, []);

  const actions = useMemo<MatchActions>(
    () => ({
      ready() {
        send({ type: "ready" });
      },
      arm(powerup) {
        const s = store.getState();
        if (s.phase !== "arming") return;
        // Tapping the armed one again unarms it.
        const next = powerup !== null && s.armed === powerup ? null : powerup;
        store.dispatch({ type: "local_arm", round: s.round, powerup: next });
        send({ type: "arm", round: s.round, powerup: next });
      },
      use(powerup) {
        const s = store.getState();
        if (s.phase !== "question" || s.yourAnswer) return;
        store.dispatch({ type: "local_use", round: s.round, powerup });
        send({ type: "use", round: s.round, powerup });
      },
      answer(answer) {
        const s = store.getState();
        if (s.phase !== "question" || s.yourAnswer) return;
        store.dispatch({ type: "local_answer", round: s.round, answer });
        send({ type: "answer", round: s.round, answer });
      },
      surrender() {
        send({ type: "surrender" });
      },
      rematch() {
        store.dispatch({ type: "local_rematch" });
        send({ type: "rematch" });
      },
      reconnectNow() {
        transportRef.current?.reconnectNow();
      },
    }),
    [send, store],
  );

  return { state, actions };
}
