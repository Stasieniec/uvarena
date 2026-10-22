// Private match lobby: the join code in large letters, Share, both players
// with their Ready state, and the Ready button.

import { useState } from "react";
import type { MatchUiState } from "../state";
import { Avatar } from "./Avatar";
import { CheckIcon } from "./icons";

export function LobbyView({ state, onReady, onHome }: { state: MatchUiState; onReady(): void; onHome(): void }) {
  const lobby = state.lobby;
  const [copied, setCopied] = useState(false);
  if (!lobby) return null;
  const code = lobby.code ?? state.joinCode;
  // The lobby frame has no "you" flag; match on the snapshot's name, host first otherwise.
  const meIdx = Math.max(0, state.you ? lobby.players.findIndex((p) => p.name === state.you!.name) : 0);
  const me = lobby.players[meIdx];
  const youReady = me?.ready ?? false;
  const settings = lobby.settings;
  const link = code ? `${location.origin}/join/${code}` : null;

  const share = async () => {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ url: link, text: `Duel me: ${code}` });
        return;
      }
    } catch {
      // Cancelled share sheet: fall through to copying.
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the code is on screen anyway.
    }
  };

  return (
    <div className="flex flex-1 flex-col px-4 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)]">
      <div className="text-center text-xs font-bold tracking-[0.25em] text-ranked-gold uppercase">
        {lobby.rated ? "Rated" : "Unrated"}
      </div>
      <div className="mt-8 text-center">
        <div className="text-sm text-muted">Join code</div>
        <div className="mt-2 font-mono text-[min(13vw,56px)] font-bold tracking-[0.18em] text-text select-all">{code ?? "------"}</div>
        {link && (
          <button type="button" onClick={share} className="mt-4 h-12 rounded-xl bg-surface-2 px-6 font-semibold ring-1 ring-white/15 active:scale-[0.98]">
            {copied ? "Link copied" : "Share"}
          </button>
        )}
      </div>
      <div className="mt-8 text-center text-xs text-muted">
        {settings.lectures === null ? "All lectures" : `${settings.lectures.length} ${settings.lectures.length === 1 ? "lecture" : "lectures"}`} {"·"}{" "}
        {settings.powerups ? "Power-ups on" : "Power-ups off"}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {lobby.players.map((p, i) => (
          <div key={`${p.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-white/10">
            <Avatar name={p.name} url={p.avatarUrl} size={36} ring={i === meIdx ? "var(--color-you)" : "var(--color-opponent)"} />
            <span className="flex-1 font-semibold">{i === meIdx ? `${p.name} (you)` : p.name}</span>
            {p.ready ? (
              <span className="flex items-center gap-1 text-sm font-semibold text-correct">
                <CheckIcon size={16} /> Ready
              </span>
            ) : (
              <span className="text-sm text-muted">Not ready</span>
            )}
          </div>
        ))}
        {lobby.players.length < 2 && (
          <div className="rq-pulse rounded-xl border border-dashed border-border px-3 py-3 text-center text-sm text-muted">Waiting for your friend</div>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-2.5 pt-6">
        <button
          type="button"
          disabled={youReady}
          onClick={onReady}
          className="h-14 rounded-xl bg-you text-lg font-bold text-bg active:scale-[0.98] disabled:opacity-50"
        >
          {youReady ? "Ready" : "I'm ready"}
        </button>
        <button type="button" onClick={onHome} className="h-12 rounded-xl font-semibold text-muted ring-1 ring-white/10">
          Leave
        </button>
      </div>
    </div>
  );
}
