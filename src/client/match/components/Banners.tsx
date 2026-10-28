// Power-up theatre: the full-screen banners of the banner phase (Bibi,
// Shield), your own 50:50 and Gotta Go Fast lines (a strip over the opponent
// bar, never over the question), and the small toast when the opponent uses
// one. The power-ups are the one loud thing in the app; everything else is plain.

import { useState, type CSSProperties } from "react";
import { TIMING } from "@shared/game/config";
import type { BlindPowerupId } from "@shared/game/types";
import type { BannerItem, PlayerView } from "@shared/protocol";
import { LINES, POWERUP_IMAGES } from "../copy";
import { FX } from "../fx";
import type { BannerState, QuickFx } from "../state";
import { LightningBolt, PowerupIcon } from "./icons";

/** An image that removes itself if the file is missing, so a banner never shows a broken picture. */
function OptionalImage({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt={alt} className={className} style={style} draggable={false} onError={() => setFailed(true)} />;
}

/** Whose power-up this is. The opponent's is marked as incoming, so a threat never reads like your own. */
function Caption({ who, opponentName }: { who: BannerItem["who"]; opponentName: string }) {
  if (who === "you") return <div className="mb-2 text-xs font-semibold tracking-[0.2em] text-you uppercase">You</div>;
  return (
    <div className="mb-2.5 rounded-full bg-opponent/20 px-3 py-1 text-xs font-bold tracking-[0.16em] text-opponent uppercase ring-1 ring-opponent/60">
      Incoming from {opponentName}
    </div>
  );
}

function BibiFace({ small }: { small: boolean }) {
  const size = small ? "min(34vw, 150px)" : "min(56vw, 250px)";
  return (
    <div className="rq-face relative mb-3 flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(245,197,66,0.5),rgba(245,197,66,0)_70%)]" aria-hidden />
      {/* The glow sits on a wrapper: a mask on the same element would clip it to a box. */}
      <div className="relative h-full w-full" style={{ filter: "drop-shadow(0 0 16px rgba(245,197,66,0.7))" }}>
        <OptionalImage
          src={POWERUP_IMAGES.bibi}
          alt="Benjamin Netanyahu"
          className="h-full w-full object-contain"
          style={{
            maskImage: "linear-gradient(180deg, #000 70%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(180deg, #000 70%, transparent 100%)",
          }}
        />
      </div>
    </div>
  );
}

function BibiLine({ small }: { small: boolean }) {
  const k = small ? 0.62 : 1;
  const [first, second, third] = LINES.bibiParts;
  return (
    <div className="rq-slam rq-display rq-bibi-text text-center leading-[0.92] font-black" style={{ animationDelay: "120ms" }}>
      <div style={{ fontSize: `min(${8.6 * k}vw, ${40 * k}px)` }}>{first}</div>
      <div style={{ fontSize: `min(${11.4 * k}vw, ${53 * k}px)` }}>{second}</div>
      <div style={{ fontSize: `min(${12.5 * k}vw, ${58 * k}px)` }}>{third}</div>
    </div>
  );
}

function ShieldLine({ small }: { small: boolean }) {
  return (
    <div className="rq-plain-in flex flex-col items-center text-center">
      <PowerupIcon id="shield" size={small ? 44 : 64} />
      <div className={`mt-3 font-bold text-text ${small ? "text-xl" : "text-3xl"}`}>{LINES.shieldTitle}</div>
      <div className={`mt-1 text-muted ${small ? "text-sm" : "text-base"}`}>{LINES.shieldSub}</div>
    </div>
  );
}

function BlindLine({ powerup, small }: { powerup: BlindPowerupId; small: boolean }) {
  if (powerup === "bibi") {
    return (
      <>
        <BibiFace small={small} />
        <BibiLine small={small} />
      </>
    );
  }
  return <ShieldLine small={small} />;
}

export function BannerOverlay({ banner, opponent }: { banner: BannerState; opponent: PlayerView | null }) {
  const items = banner.items;
  const bibi = items.some((i) => i.powerup === "bibi");
  const small = items.length > 1;
  const name = opponent?.name ?? "Opponent";
  const incoming = items.every((i) => i.who === "opponent");
  const style = { "--rq-banner-ms": `${TIMING.bannerMs}ms` } as CSSProperties;
  const background = bibi
    ? "radial-gradient(ellipse at center, rgba(40,30,8,0.97) 0%, rgba(6,5,2,0.99) 75%)"
    : incoming
      ? "radial-gradient(ellipse at center, rgba(40,20,12,0.96) 0%, rgba(12,6,4,0.99) 75%)"
      : "radial-gradient(ellipse at center, rgba(14,22,48,0.97) 0%, rgba(5,8,20,0.99) 75%)";

  return (
    <div
      key={banner.seq}
      className="rq-banner absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-hidden px-4"
      style={{
        ...style,
        background,
        boxShadow: incoming ? "inset 0 0 0 3px rgba(251,146,60,0.55), inset 0 0 60px 10px rgba(251,146,60,0.2)" : undefined,
      }}
      role="status"
      aria-live="assertive"
    >
      {bibi && (
        <>
          <LightningBolt className="rq-bolt pointer-events-none absolute inset-y-0 left-1/2 h-full w-28 -translate-x-1/2" />
          <div className="rq-flash" />
        </>
      )}
      {items.map((item) => (
        <div key={`${item.who}-${item.powerup}`} className="relative flex w-full flex-col items-center">
          <Caption who={item.who} opponentName={name} />
          <BlindLine powerup={item.powerup} small={small} />
        </div>
      ))}
    </div>
  );
}

function FiftyStrip() {
  return (
    <>
      <div className="absolute inset-0 bg-[#050322]" aria-hidden />
      <div className="rq-stage absolute inset-0" aria-hidden />
      <div className="relative flex w-full items-center justify-between gap-2 px-3">
        <OptionalImage src={POWERUP_IMAGES.fiftyLogo} alt="Milionerzy" className="h-16 w-16 shrink-0 object-contain" />
        <div className="rq-slam flex min-w-0 flex-1 flex-col items-center">
          <span
            className="rq-display text-[min(7.4vw,34px)] font-black whitespace-nowrap text-white"
            style={{ textShadow: "0 0 18px rgba(139,123,255,0.95), 0 2px 0 #000" }}
          >
            {LINES.fifty}
          </span>
        </div>
        <OptionalImage
          src={POWERUP_IMAGES.fiftyHost}
          alt="The host"
          className="h-16 w-16 shrink-0 rounded-full bg-[radial-gradient(circle,#2a2a8a,#0b0a3a)] object-cover object-top ring-2 ring-[#8b7bff]"
        />
      </div>
    </>
  );
}

const BLUR_LINES = [8, 20, 33, 47, 61, 74, 88];

function FastStrip() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#03123d,#0a3bb0_55%,#03123d)]" aria-hidden />
      {BLUR_LINES.map((top, i) => (
        <div
          key={top}
          className="rq-blur absolute right-0 h-[3px] rounded-full"
          style={{
            top: `${top}%`,
            width: `${45 + ((i * 23) % 40)}%`,
            animationDelay: `${(i % 4) * 60}ms`,
            background: "linear-gradient(90deg, transparent, #cfe1ff, #fff)",
          }}
          aria-hidden
        />
      ))}
      <div className="rq-dash relative flex items-center gap-2.5 px-4">
        <PowerupIcon id="fast" size={30} color="#fff" />
        <span
          className="rq-display text-[min(7.6vw,35px)] font-black whitespace-nowrap text-white italic"
          style={{ textShadow: "-6px 0 0 rgba(47,123,255,0.65), -12px 0 0 rgba(47,123,255,0.35), 0 2px 0 #000" }}
        >
          {LINES.fast}
        </span>
      </div>
    </>
  );
}

/** Your 50:50 or Gotta Go Fast: a strip over the opponent bar, so the question stays readable. */
export function QuickBanner({ fx }: { fx: QuickFx }) {
  return (
    <div
      key={fx.seq}
      className="rq-banner pointer-events-none absolute inset-x-0 top-0 z-40 flex h-[96px] items-center justify-center overflow-hidden"
      style={{ "--rq-banner-ms": `${FX.quickBannerMs}ms` } as CSSProperties}
      role="status"
    >
      {fx.powerup === "fifty" ? <FiftyStrip /> : <FastStrip />}
    </div>
  );
}

export function OpponentToast({ fx }: { fx: QuickFx }) {
  const text = fx.powerup === "fifty" ? LINES.fiftyOpponent : LINES.fastOpponent;
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
