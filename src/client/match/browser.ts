// Browser-only glue: the real WebSocket transport, wake lock, vibration,
// reduced motion and the remembered sound setting.

import { useEffect, useState, useSyncExternalStore } from "react";
import { endpoints } from "@shared/api-schemas";
import { APP_SLUG } from "@shared/brand";
import type { ClientMessage } from "@shared/protocol";
import { MatchSocket, type SocketDeps, type SocketLike } from "./socket";
import type { MatchTransport, TransportListener } from "./transport";

export function matchSocketUrl(matchId: string): string {
  const path = endpoints.matchSocket.path.replace(":id", encodeURIComponent(matchId));
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

const browserDeps: SocketDeps = {
  create: (url) => new WebSocket(url) as unknown as SocketLike,
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
  random: Math.random,
  now: Date.now,
  onWake(fn) {
    const onVisible = () => {
      if (document.visibilityState === "visible") fn();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", fn);
    window.addEventListener("pageshow", fn);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", fn);
      window.removeEventListener("pageshow", fn);
    };
  },
};

export function createSocketTransport(url: string): MatchTransport {
  let socket: MatchSocket | null = null;
  return {
    start(listener: TransportListener) {
      socket = new MatchSocket(url, listener, browserDeps);
      socket.start();
    },
    send(msg: ClientMessage) {
      return socket?.send(msg) ?? false;
    },
    reconnectNow() {
      socket?.reconnectNow();
    },
    stop() {
      socket?.stop();
      socket = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Device features
// ---------------------------------------------------------------------------

/** Keeps the screen awake while `active`. Re-acquires after the page is shown again. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } };
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      nav.wakeLock!
        .request("screen")
        .then((s) => {
          if (cancelled) void s.release().catch(() => undefined);
          else sentinel = s;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}

interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
}

export function vibrate(pattern: number[]): void {
  try {
    // Browsers refuse (and log) vibration before the first tap on the page.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // Not supported or blocked until a user gesture.
  }
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(fn: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/** Same key and values as SOUND_KEY in src/client/lib/local-prefs.ts (client app): "1" on, "0" off. */
const SOUND_KEY = `${APP_SLUG}.sound`;

export function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

/** The mute toggle. Remembered on this device; onChange lets the caller sync user_prefs. */
export function useSoundPref(onChange?: (on: boolean) => void): [boolean, () => void] {
  const [on, setOn] = useState(readSoundPref);
  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the setting lasts for this page only.
    }
    onChange?.(next);
  };
  return [on, toggle];
}
