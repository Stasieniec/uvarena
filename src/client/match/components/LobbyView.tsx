// Private match lobby, as on the Broadcast boards. Alone ("Duel a friend",
// create): the code as six plates, the link with a copy button, Share as the
// primary, the settings, and the expiry line. Once your friend is in
// ("Private match"): both players as plates with their Ready state and
// power-ups, "VS" between them, the settings with the code, and Ready.

import { useEffect, useRef, useState } from "react";
import { MATCH } from "@shared/game/config";
import type { PowerupId } from "@shared/game/types";
import { CodePlates } from "../../components/CodePlates";
import { CheckIcon, ClockIcon, CopyIcon, ShareIcon } from "../../components/icons";
import { HeaderTag, PageHeader, Primary, RatingText, StatRow, buttonClass, cx } from "../../components/ui";
import type { MatchClock } from "../clock";
import { POWERUP_NAMES } from "../copy";
import { fmtClock, fmtShownRating } from "../format";
import type { MatchUiState } from "../state";
import { useNow } from "./hooks";
import { PowerupIcon } from "./icons";

/** What the lobby frame does not carry about a player, fetched by the live screen. */
export interface LobbyPerson {
  fullName: string | null;
  /** "1540?" */
  rating: string | null;
}

interface Props {
  state: MatchUiState;
  /** Keyed by username. */
  people?: Record<string, LobbyPerson>;
  /** When this device created the lobby (clock time), for the expiry countdown. */
  createdAt?: number | null;
  clock: MatchClock;
  onReady(): void;
  onHome(): void;
}

const COPIED_MS = 2000;

export function LobbyView({ state, people, createdAt, clock, onReady, onHome }: Props) {
  const lobby = state.lobby;
  const code = lobby?.code ?? state.joinCode;
  const link = code ? `${location.origin}/join/${code}` : null;
  const [copied, setCopied] = useState<"share" | "copy" | null>(null);
  const copiedTimer = useRef<number | null>(null);
  useEffect(() => () => void (copiedTimer.current !== null && window.clearTimeout(copiedTimer.current)), []);

  const alone = !lobby || lobby.players.length < 2;
  const expiresAt = alone && createdAt ? createdAt + MATCH.lobbyTtlMs : null;
  const now = useNow(clock, 1000, expiresAt !== null);
  if (!lobby) return null;

  // The lobby frame has no "you" flag; match on the snapshot's name, host first otherwise.
  const meIdx = Math.max(0, state.you ? lobby.players.findIndex((p) => p.name === state.you!.name) : 0);
  const me = lobby.players[meIdx];
  const them = lobby.players.find((_, i) => i !== meIdx) ?? null;
  const youReady = me?.ready ?? false;
  const settings = lobby.settings;
  const lectures =
    settings.lectures === null ? "All lectures" : `${settings.lectures.length} ${settings.lectures.length === 1 ? "lecture" : "lectures"}`;

  const flash = (what: "share" | "copy") => {
    setCopied(what);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  };
  const copy = async (what: "share" | "copy") => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      flash(what);
    } catch {
      // Clipboard blocked: the code and the link are on screen anyway.
    }
  };
  const share = async () => {
    if (!link) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url: link, text: `Duel me on the course quiz. Code ${code}` });
        return;
      } catch (e) {
        // Closing the share sheet is a choice, not a failure.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy("share");
  };

  const ratedTag = <HeaderTag>{lobby.rated ? "Rated" : "Unrated"}</HeaderTag>;

  if (alone) {
    const left = expiresAt !== null ? Math.max(0, expiresAt - now) : null;
    return (
      <div className="flex flex-1 flex-col pb-[max(env(safe-area-inset-bottom),24px)]">
        <PageHeader title="Duel a friend" back={onHome} right={ratedTag} />
        <main className="flex flex-1 flex-col gap-3.5 px-4">
          {code && (
            <section aria-label="Your code" className="mt-2.5 flex flex-col gap-2.5">
              <CodePlates code={code} />
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm leading-5 text-muted">{link?.replace(/^https?:\/\//, "")}</span>
                <button
                  type="button"
                  onClick={() => void copy("copy")}
                  aria-label={copied === "copy" ? "Link copied" : "Copy link"}
                  className="flex size-11 shrink-0 items-center justify-center text-text"
                >
                  {copied === "copy" ? <CheckIcon size={18} /> : <CopyIcon size={18} strokeWidth={1.8} />}
                </button>
              </div>
            </section>
          )}
          {link && (
            <Primary onClick={() => void share()}>
              {copied === "share" ? "Link copied" : "Share"}
              {copied === "share" ? null : <ShareIcon size={20} strokeWidth={2.4} />}
            </Primary>
          )}
          <dl className="m-0 mt-1.5 flex flex-col">
            <SettingRow label="Lectures" value={lectures} />
            <SettingRow label="Power-ups" value={settings.powerups ? "On" : "Off"} />
            <SettingRow label="Rated" value={lobby.rated ? "Yes" : "No"} note={lobby.rated ? "Counts for both ranked ratings" : null} />
          </dl>
          <span className="flex-1" />
          <p className="m-0 flex items-center justify-center gap-2 text-center text-sm leading-5 text-muted">
            <ClockIcon size={16} strokeWidth={1.8} className="shrink-0" />
            <span>
              Waiting for your friend
              {left !== null ? ` · expires in ${fmtClock(left)}` : ` · the code lasts ${Math.round(MATCH.lobbyTtlMs / 60000)} minutes`}
            </span>
          </p>
        </main>
      </div>
    );
  }

  const meView = state.you && me && state.you.name === me.name ? state.you : null;
  const themView = state.opponent && them && state.opponent.name === them.name ? state.opponent : null;
  const readyLabel = !youReady ? "Ready" : them?.ready ? "Starting" : `Waiting for ${them?.name ?? "your friend"}`;

  return (
    <div className="flex flex-1 flex-col pb-[max(env(safe-area-inset-bottom),16px)]">
      <PageHeader title="Private match" back={onHome} right={ratedTag} />
      <main className="flex flex-1 flex-col gap-3 px-4">
        {them && (
          <PlayerPlate
            who="opponent"
            name={them.name}
            ready={them.ready}
            person={people?.[them.name]}
            rating={fmtShownRating(themView?.rating ?? null)}
            loadout={themView && settings.powerups ? themView.loadout : null}
          />
        )}
        <span className="rq-display self-center text-[40px] leading-10 font-bold text-muted italic" aria-hidden>
          VS
        </span>
        {me && (
          <PlayerPlate
            who="you"
            name={me.name}
            ready={me.ready}
            person={people?.[me.name]}
            rating={fmtShownRating(meView?.rating ?? null)}
            loadout={meView && settings.powerups ? meView.loadout : null}
          />
        )}
        <dl className="m-0 mt-2 flex flex-col">
          {code && <StatRow label="Code">{code}</StatRow>}
          <StatRow label="Lectures">{lectures}</StatRow>
          <StatRow label="Power-ups">{settings.powerups ? "On" : "Off"}</StatRow>
          <StatRow label="Rated" last>
            {lobby.rated ? "Counts for both ranked ratings" : "No"}
          </StatRow>
        </dl>
        <span className="flex-1" />
        <Primary onClick={onReady} disabled={youReady}>
          {readyLabel}
        </Primary>
        <button type="button" onClick={onHome} className={buttonClass("ghost", "w-full")}>
          Home
        </button>
      </main>
    </div>
  );
}

/** A settings row in the lobby: the label, and the fixed value (or a short note) on the right. */
function SettingRow({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-line">
      <dt className="flex min-w-0 flex-1 flex-col">
        <span className="text-base leading-[22px] font-semibold">{label}</span>
        {note ? <span className="text-sm leading-5 text-muted">{note}</span> : null}
      </dt>
      <dd className="m-0 shrink-0 text-[15px] text-muted">{value}</dd>
    </div>
  );
}

function PlayerPlate({
  who,
  name,
  ready,
  person,
  rating,
  loadout,
}: {
  who: "you" | "opponent";
  name: string;
  ready: boolean;
  person?: LobbyPerson;
  rating: string | null;
  loadout: PowerupId[] | null;
}) {
  const shownRating = rating ?? person?.rating ?? null;
  return (
    <section aria-label={`${name}, ${ready ? "ready" : "not ready"}`} className="plate flex flex-col gap-3 rounded-xs p-4">
      <div className="flex items-center gap-3">
        <span
          className={cx(
            "rq-display max-w-[58%] shrink-0 truncate px-2.5 pt-0.5 text-[28px] leading-[34px] font-bold tracking-[0.01em] text-bg uppercase italic",
            who === "you" ? "bg-you" : "bg-opponent",
          )}
        >
          {name}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {person?.fullName ? <span className="truncate text-sm leading-5 text-muted">{person.fullName}</span> : null}
          {shownRating ? (
            <span className="rq-display text-[22px] leading-[26px] font-bold">
              <RatingText text={shownRating} />
            </span>
          ) : null}
        </span>
        {ready ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[15px] font-semibold">
            <CheckIcon size={18} strokeWidth={2.6} />
            Ready
          </span>
        ) : (
          <span className="shrink-0 text-[15px] text-muted">Not ready</span>
        )}
      </div>
      {loadout && loadout.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-x-2 gap-y-1 p-0 text-sm leading-5 font-semibold text-muted" aria-label={`${name}'s power-ups`}>
          {loadout.map((id) => (
            <li key={id} className="flex items-center gap-1.5">
              <PowerupIcon id={id} size={14} strokeWidth={2} />
              {POWERUP_NAMES[id]}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
