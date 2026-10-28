// Power-up theatre: the banners of the banner phase (Bibi, Shield) and your
// own 50:50 and Gotta Go Fast strips. They cover the duel under the HUD, so
// both players' plates and the clock stay in view. The power-ups are the one
// loud thing in the app; everything else is plain.

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

/** Whose power-up this is, as a name plate. The opponent's is marked as incoming, so a threat never reads like your own. */
function Caption({ who, opponentName }: { who: BannerItem["who"]; opponentName: string }) {
  if (who === "you") return <div className="rq-plate-name mb-3 bg-you px-2 py-px text-[17px] leading-[22px] text-bg">You</div>;
  return <div className="rq-plate-name mb-3 max-w-full truncate bg-opponent px-2 py-px text-[17px] leading-[22px] text-bg">Incoming from {opponentName}</div>;
}

function BibiFace({ small }: { small: boolean }) {
  const size = small ? "min(30vw, 130px)" : "min(52vw, 230px)";
  return (
    <div className="rq-face relative mb-3 flex items-center justify-center" style={{ width: size, height: size }}>
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
  );
}

function BibiLine({ small }: { small: boolean }) {
  const k = small ? 0.62 : 1;
  const [first, second, third] = LINES.bibiParts;
  return (
    <div className="rq-slam rq-display rq-bibi-text text-center leading-[0.92] font-bold" style={{ animationDelay: "120ms" }}>
      <div style={{ fontSize: `min(${10 * k}vw, ${44 * k}px)` }}>{first}</div>
      <div style={{ fontSize: `min(${14 * k}vw, ${62 * k}px)` }}>{second}</div>
      <div style={{ fontSize: `min(${16 * k}vw, ${70 * k}px)` }}>{third}</div>
    </div>
  );
}

function ShieldLine({ small }: { small: boolean }) {
  return (
    <div className="rq-slam flex flex-col items-center text-center">
      <PowerupIcon id="shield" size={small ? 44 : 64} strokeWidth={1.6} />
      <div className={`rq-display mt-3 font-bold uppercase italic ${small ? "text-[32px] leading-9" : "text-[48px] leading-[52px]"}`}>{LINES.shieldTitle}</div>
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

/** Bibi and Shield, over the duel under the HUD for the banner phase. */
export function BannerOverlay({ banner, opponent }: { banner: BannerState; opponent: PlayerView | null }) {
  const items = banner.items;
  const bibi = items.some((i) => i.powerup === "bibi");
  const small = items.length > 1;
  const name = opponent?.name ?? "Opponent";
  const incoming = items.every((i) => i.who === "opponent");
  const style = { "--rq-banner-ms": `${TIMING.bannerMs}ms` } as CSSProperties;
  const background = bibi ? "radial-gradient(ellipse at 50% 40%, #2e2408 0%, #0e1013 70%)" : "var(--color-bg)";

  return (
    <div
      key={banner.seq}
      className="rq-banner absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-hidden px-4"
      style={{ ...style, background, boxShadow: incoming ? "inset 0 3px 0 var(--color-opponent)" : "inset 0 3px 0 var(--color-you)" }}
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
          <span className="rq-display text-[min(10vw,44px)] leading-none font-bold whitespace-nowrap text-white italic">{LINES.fifty}</span>
        </div>
        <OptionalImage
          src={POWERUP_IMAGES.fiftyHost}
          alt="The host"
          className="h-16 w-16 shrink-0 rounded-full bg-[#1b1a6a] object-cover object-top ring-2 ring-[#8b7bff]"
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
          className="rq-blur absolute right-0 h-[3px]"
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
        <PowerupIcon id="fast" size={30} color="#fff" strokeWidth={2.4} />
        <span
          className="rq-display text-[min(10vw,44px)] leading-none font-bold whitespace-nowrap text-white italic"
          style={{ textShadow: "-6px 0 0 rgba(47,123,255,0.65), -12px 0 0 rgba(47,123,255,0.35)" }}
        >
          {LINES.fast}
        </span>
      </div>
    </>
  );
}

/** Your 50:50 or Gotta Go Fast: a strip at the top of the duel, under the HUD, so the question stays readable. */
export function QuickBanner({ fx }: { fx: QuickFx }) {
  return (
    <div
      key={fx.seq}
      className="rq-banner pointer-events-none absolute inset-x-0 top-0 z-40 flex h-24 items-center justify-center overflow-hidden"
      style={{ "--rq-banner-ms": `${FX.quickBannerMs}ms` } as CSSProperties}
      role="status"
    >
      {fx.powerup === "fifty" ? <FiftyStrip /> : <FastStrip />}
    </div>
  );
}
