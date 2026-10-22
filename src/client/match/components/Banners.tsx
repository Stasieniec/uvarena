// Power-up theatre: the full-screen banners of the banner phase (Zeus, Aegis,
// Nemesis), your own Oracle and Hermes lines (a strip over the opponent bar,
// never over the question), the small toast when the opponent uses one, and
// Phoenix rising during the reveal.

import type { CSSProperties } from "react";
import { TIMING } from "@shared/game/config";
import type { PowerupId } from "@shared/game/types";
import type { BannerItem, PlayerView } from "@shared/protocol";
import { LINES, bannerLine, bannerSub } from "../copy";
import { FX } from "../fx";
import type { BannerState, QuickFx } from "../state";
import { LightningBolt, POWERUP_COLOR, PowerupIcon } from "./icons";

const LINE_COLOR: Record<PowerupId, string> = {
  zeus: "var(--color-zeus)",
  aegis: "var(--color-aegis)",
  nemesis: "#c084fc",
  oracle: "var(--color-oracle)",
  hermes: "var(--color-hermes)",
  phoenix: "var(--color-phoenix)",
};

function lineSize(text: string): string {
  if (text.length <= 12) return "min(15vw, 72px)";
  if (text.length <= 20) return "min(11vw, 52px)";
  return "min(9.4vw, 44px)";
}

function Caption({ who, opponentName }: { who: BannerItem["who"]; opponentName: string }) {
  return (
    <div className={`mb-2 text-xs font-semibold tracking-[0.2em] uppercase ${who === "you" ? "text-you" : "text-opponent"}`}>
      {who === "you" ? "You" : opponentName}
    </div>
  );
}

function ZeusLine({ small }: { small: boolean }) {
  const k = small ? 0.72 : 1;
  return (
    <div className="rq-slam rq-display rq-zeus-text text-center leading-[0.95] font-black">
      <div style={{ fontSize: `min(${21 * k}vw, ${96 * k}px)` }}>ZEUS,</div>
      <div style={{ fontSize: `min(${11.5 * k}vw, ${54 * k}px)` }}>STRIKE THEM</div>
      <div style={{ fontSize: `min(${17 * k}vw, ${78 * k}px)` }}>DOWN!</div>
    </div>
  );
}

function Line({ item, small, className = "rq-slam" }: { item: BannerItem; small: boolean; className?: string }) {
  if (item.powerup === "zeus" && item.outcome === "active") return <ZeusLine small={small} />;
  const text = bannerLine(item.powerup, item.outcome);
  const sub = bannerSub(item.powerup, item.outcome);
  const color = LINE_COLOR[item.powerup];
  const wasted = item.outcome === "nemesis_wasted";
  return (
    <div className={`${className} text-center`}>
      <div
        className="rq-display font-black text-balance"
        style={{
          fontSize: small ? `calc(${lineSize(text)} * 0.72)` : lineSize(text),
          lineHeight: 1.02,
          color,
          opacity: wasted ? 0.7 : 1,
          textShadow: `0 0 20px color-mix(in srgb, ${color} 60%, transparent), 0 3px 0 #000`,
        }}
      >
        {item.powerup === "zeus" && item.outcome !== "active" ? LINES.zeus : text}
      </div>
      {sub && <div className="mt-2 text-sm text-text/80 italic">{sub}</div>}
    </div>
  );
}

/** The cancelled power-up's line, cracking and falling apart before Nemesis lands. */
function Cracked({ item, small }: { item: BannerItem; small: boolean }) {
  // Two Nemeses cancel each other: both "read your plans" lines break.
  const shown: BannerItem = { ...item, outcome: item.powerup === "nemesis" ? "nemesis_hit" : "active" };
  const inner = <Line item={shown} small={small} className="" />;
  return (
    <div className="relative">
      <div className="rq-crack-top">{inner}</div>
      <div className="rq-crack-bottom absolute inset-0">{inner}</div>
      <svg className="rq-crack-line pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polyline points="0,55 12,47 32,60 55,44 78,58 100,46" fill="none" stroke="#fff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function AegisShield() {
  return (
    <div className="rq-shield mb-3 flex justify-center">
      <PowerupIcon id="aegis" size={112} />
    </div>
  );
}

export function BannerOverlay({ banner, opponent }: { banner: BannerState; opponent: PlayerView | null }) {
  const items = banner.items;
  const cancelled = items.filter((i) => i.outcome === "cancelled");
  const hits = items.filter((i) => i.outcome === "nemesis_hit");
  const rest = items.filter((i) => i.outcome !== "cancelled" && i.outcome !== "nemesis_hit");
  const zeus = items.some((i) => i.powerup === "zeus" && i.outcome === "active");
  const aegis = items.some((i) => i.powerup === "aegis" && i.outcome === "active");
  const small = items.length > 1;
  const name = opponent?.name ?? "Opponent";
  const style = { "--rq-banner-ms": `${TIMING.bannerMs}ms` } as CSSProperties;

  return (
    <div
      key={banner.seq}
      className="rq-banner absolute inset-0 z-50 flex flex-col items-center justify-center gap-7 overflow-hidden px-4"
      style={{ ...style, background: "radial-gradient(ellipse at center, rgba(10,17,40,0.82) 0%, rgba(4,7,18,0.96) 75%)" }}
      role="status"
      aria-live="assertive"
    >
      {zeus && (
        <>
          <LightningBolt className="rq-bolt pointer-events-none absolute inset-y-0 left-1/2 h-full w-28 -translate-x-1/2" />
          <div className="rq-flash" />
        </>
      )}
      {cancelled.map((c) => (
        <div key={`c-${c.who}`} className="flex w-full flex-col items-center">
          <Caption who={c.who} opponentName={name} />
          <Cracked item={c} small={small} />
        </div>
      ))}
      {hits.map((h) => (
        <div key={`h-${h.who}`} className={`flex w-full flex-col items-center ${cancelled.length ? "rq-after-crack" : ""}`}>
          <Caption who={h.who} opponentName={name} />
          <Line item={h} small={small} className={cancelled.length ? "" : "rq-slam"} />
        </div>
      ))}
      {rest.map((r) => (
        <div key={`r-${r.who}-${r.powerup}`} className="relative flex w-full flex-col items-center">
          {r.powerup === "aegis" && r.outcome === "active" && aegis && <AegisShield />}
          <Caption who={r.who} opponentName={name} />
          <Line item={r} small={small} />
        </div>
      ))}
    </div>
  );
}

/** Your Oracle or Hermes: a strip over the opponent bar, so the question stays readable. */
export function QuickBanner({ fx }: { fx: QuickFx }) {
  const text = fx.powerup === "oracle" ? LINES.oracle : LINES.hermes;
  const color = POWERUP_COLOR[fx.powerup];
  return (
    <div
      key={fx.seq}
      className="rq-banner pointer-events-none absolute inset-x-0 top-0 z-40 flex h-[96px] items-center justify-center overflow-hidden"
      style={{ "--rq-banner-ms": `${FX.quickBannerMs}ms`, background: "linear-gradient(180deg, rgba(4,7,18,0.97), rgba(4,7,18,0.88))" } as CSSProperties}
      role="status"
    >
      {fx.powerup === "hermes" &&
        [18, 34, 52, 70, 84].map((top, i) => (
          <div
            key={top}
            className="rq-wind absolute left-0 h-[2px] w-2/3 rounded-full"
            style={{ top: `${top}%`, animationDelay: `${i * 70}ms`, background: "linear-gradient(90deg, transparent, #fff, transparent)" }}
          />
        ))}
      <div className="rq-slam flex items-center gap-3">
        <PowerupIcon id={fx.powerup} size={30} />
        <span className="rq-display text-[min(6.6vw,30px)] font-black" style={{ color, textShadow: `0 0 16px ${color}` }}>
          {text}
        </span>
      </div>
    </div>
  );
}

export function OpponentToast({ fx }: { fx: QuickFx }) {
  const text = fx.powerup === "oracle" ? LINES.oracleOpponent : LINES.hermesOpponent;
  return (
    <div
      key={fx.seq}
      className="rq-toast pointer-events-none flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[13px] font-semibold text-text shadow-lg ring-1 ring-opponent/50"
      style={{ "--rq-toast-ms": `${FX.toastMs}ms` } as CSSProperties}
      role="status"
    >
      <PowerupIcon id={fx.powerup} size={16} />
      {text}
    </div>
  );
}

const FLAMES = [6, 16, 27, 38, 49, 60, 71, 82, 92];

/** Phoenix: flames rise from the saved player's bar, then the line. */
export function PhoenixOverlay({ who, seq }: { who: "you" | "opponent"; seq: number }) {
  const fromTop = who === "opponent";
  return (
    <div key={seq} className="rq-banner pointer-events-none absolute inset-0 z-50 overflow-hidden" style={{ "--rq-banner-ms": "1800ms" } as CSSProperties}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,12,0,0.75),rgba(4,7,18,0.9))]" />
      <div className={`absolute inset-x-0 h-40 ${fromTop ? "top-20" : "bottom-24"}`}>
        {FLAMES.map((x, i) => (
          <div key={x} className="rq-flame" style={{ left: `${x}%`, animationDelay: `${(i % 4) * 90}ms`, height: 54 + ((i * 17) % 40) }} />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <div className="mb-2 text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: fromTop ? "var(--color-opponent)" : "var(--color-you)" }}>
          Phoenix
        </div>
        <div
          className="rq-slam rq-display font-black"
          style={{ fontSize: "min(13vw, 62px)", lineHeight: 1, color: "#ffb347", textShadow: "0 0 24px var(--color-phoenix), 0 3px 0 #000" }}
        >
          {LINES.phoenix}
        </div>
        <div className="rq-rise mt-3 text-sm text-text/85 italic">{LINES.phoenixSub}</div>
      </div>
    </div>
  );
}
