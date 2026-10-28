// Power-up theatre, the one loud place in the app. Blind banners (Bibi,
// Shield) fill everything between the HUD and the power-up row for the banner
// phase; your quick power-ups (50:50, Gotta Go Fast) take over the event lane
// as a full-bleed strip so the question stays readable. Gradients, glow and
// photos appear only here.

import { useState, type CSSProperties } from "react";
import { TIMING } from "@shared/game/config";
import type { BannerItem, PlayerView } from "@shared/protocol";
import { LINES, POWERUP_IMAGES, POWERUP_NAMES } from "../copy";
import { FX } from "../fx";
import type { BannerState, QuickFx } from "../state";
import { PowerupIcon } from "./icons";

/** An image that removes itself if the file is missing, so a banner never shows a broken picture. */
function OptionalImage({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt={alt} className={className} style={style} draggable={false} onError={() => setFailed(true)} />;
}

/** Who armed it, as a name tag in their colour: "STAS ARMED BIBI", or just the name over the shield. */
function Tag({ item, you, opponent, withPowerup }: { item: BannerItem; you: string; opponent: string; withPowerup: boolean }) {
  const name = item.who === "you" ? you : opponent;
  return (
    <span className={`rq-plate-name relative max-w-full truncate px-2 py-px text-[15px] leading-5 text-bg ${item.who === "you" ? "bg-you" : "bg-opponent"}`}>
      {withPowerup ? `${name} armed ${POWERUP_NAMES[item.powerup]}` : name}
    </span>
  );
}

function BibiBlock({ item, you, opponent, small }: { item: BannerItem; you: string; opponent: string; small: boolean }) {
  const face = small ? "min(150px, 18dvh)" : "min(300px, 36dvh)";
  return (
    <div className="relative flex flex-col items-center">
      <Tag item={item} you={you} opponent={opponent} withPowerup />
      <OptionalImage
        src={POWERUP_IMAGES.bibi}
        alt="Benjamin Netanyahu"
        className="rq-face relative mt-1 object-contain"
        style={{
          width: face,
          height: face,
          maskImage: "linear-gradient(180deg, #000 72%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(180deg, #000 72%, transparent 100%)",
        }}
      />
      <p
        className="rq-slam rq-display relative px-4 text-center font-bold text-white uppercase italic"
        style={{
          marginTop: small ? -32 : -64,
          fontSize: small ? "min(36px, 9vw)" : "min(60px, 15vw)",
          lineHeight: 0.9,
          textShadow: "0 0 18px rgba(255,210,63,0.9), 0 0 42px rgba(255,170,30,0.6), 0 3px 0 #000000",
          animationDelay: "120ms",
        }}
      >
        {LINES.bibi}
      </p>
    </div>
  );
}

function ShieldBlock({ item, you, opponent, small }: { item: BannerItem; you: string; opponent: string; small: boolean }) {
  return (
    <div className="rq-slam flex flex-col items-center gap-3 text-center">
      <Tag item={item} you={you} opponent={opponent} withPowerup={false} />
      <PowerupIcon id="shield" size={small ? 48 : 88} strokeWidth={1.6} />
      <p className={`rq-display m-0 font-bold ${small ? "text-[40px] leading-10" : "mt-1 text-[64px] leading-[64px]"}`}>{LINES.shieldTitle}</p>
      <p className="m-0 text-[17px] leading-6 text-muted">{LINES.shieldSub}</p>
    </div>
  );
}

/** Bibi and Shield for the banner phase, between the HUD and the power-up row. */
export function BlindBanner({ banner, you, opponent }: { banner: BannerState; you: PlayerView; opponent: PlayerView | null }) {
  const items = banner.items;
  const bibi = items.some((i) => i.powerup === "bibi");
  const small = items.length > 1;
  const youName = you.name;
  const oppName = opponent?.name ?? "Opponent";
  const style = { "--rq-banner-ms": `${TIMING.bannerMs}ms` } as CSSProperties;
  return (
    <section
      key={banner.seq}
      className={`rq-banner relative mt-2 flex flex-1 flex-col items-center overflow-hidden ${bibi ? "justify-start gap-4 pt-4" : "mx-4 justify-center gap-6 bg-sunken"}`}
      style={{
        ...style,
        background: bibi
          ? "radial-gradient(ellipse 70% 55% at 50% 38%, rgba(255,210,63,0.42), rgba(255,170,30,0.12) 55%, rgba(14,16,19,0) 80%), #0B0C0F"
          : undefined,
      }}
      role="status"
      aria-live="assertive"
    >
      {bibi && (
        <>
          <svg className="rq-bolt pointer-events-none absolute top-[-20px] left-1/2 h-[560px] w-[120px] -translate-x-1/2" viewBox="0 0 120 560" aria-hidden>
            <path d="M74 0 38 210h34L30 380h30L12 560l94-240H72l40-150H80L104 0z" fill="#FFF6D1" fillOpacity="0.9" />
          </svg>
          <div className="rq-flash" />
        </>
      )}
      {items.map((item) =>
        item.powerup === "bibi" ? (
          <BibiBlock key={`${item.who}-bibi`} item={item} you={youName} opponent={oppName} small={small} />
        ) : (
          <ShieldBlock key={`${item.who}-shield`} item={item} you={youName} opponent={oppName} small={small} />
        ),
      )}
    </section>
  );
}

function FiftyStrip() {
  return (
    <div
      className="relative flex h-full min-h-[112px] items-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 60% 90% at 50% 115%, rgba(150,90,255,0.75), rgba(90,50,200,0.25) 55%, rgba(0,0,0,0) 80%), linear-gradient(180deg, #050A2C, #10195A)",
        boxShadow: "inset 0 2px 0 #7F8CFF, inset 0 -2px 0 #7F8CFF",
      }}
    >
      <div className="rq-stage absolute inset-0 opacity-40" aria-hidden />
      <OptionalImage src={POWERUP_IMAGES.fiftyLogo} alt="Milionerzy logo" className="relative ml-1 h-[min(104px,26vw)] w-[min(104px,26vw)] shrink-0 object-contain" />
      <p
        className="rq-slam rq-display relative m-0 min-w-0 flex-1 text-center text-[min(44px,11vw)] leading-none font-bold tracking-[0.01em] text-white"
        style={{ textShadow: "0 0 16px rgba(170,140,255,0.95), 0 2px 0 #000000" }}
      >
        FIFTY
        <br />
        FIFTY.
      </p>
      <OptionalImage
        src={POWERUP_IMAGES.fiftyHost}
        alt="The host"
        className="relative h-[min(128px,32vw)] w-[min(128px,32vw)] shrink-0 self-end object-cover object-top"
      />
    </div>
  );
}

const STREAKS: [number, number, number, number][] = [
  [8, 18, 220, 0.55],
  [40, 4, 300, 0.35],
  [70, 90, 160, 0.5],
  [96, 30, 260, 0.3],
  [112, 150, 200, 0.45],
  [20, 230, 140, 0.4],
  [58, 250, 120, 0.6],
  [100, 280, 110, 0.35],
];

function FastStrip() {
  return (
    <div
      className="relative flex h-full min-h-[132px] items-center justify-center gap-2.5 overflow-hidden"
      style={{
        background:
          "repeating-linear-gradient(180deg, rgba(255,255,255,0) 0 13px, rgba(255,255,255,0.07) 13px 15px), linear-gradient(90deg, #06167A 0%, #0D3BE0 45%, #2F7BFF 75%, #0D3BE0 100%)",
      }}
    >
      {STREAKS.map(([top, left, width, alpha], i) => (
        <span
          key={i}
          className="rq-blur absolute h-[3px]"
          style={{ top, left, width, animationDelay: `${(i % 4) * 60}ms`, background: `linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,${alpha}))` }}
          aria-hidden
        />
      ))}
      <div className="rq-dash relative flex items-center gap-2.5">
        <svg width="64" height="48" viewBox="0 0 64 48" className="h-auto w-[min(64px,14vw)] shrink-0" aria-hidden>
          <path d="M4 6l18 18L4 42M24 6l18 18-18 18M44 6l18 18-18 18" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinejoin="round" />
        </svg>
        <p className="rq-display m-0 text-[min(54px,12vw)] leading-none font-bold whitespace-nowrap text-white italic" style={{ textShadow: "4px 4px 0 #04104F" }}>
          {LINES.fast}
        </p>
      </div>
    </div>
  );
}

/** Your 50:50 or Gotta Go Fast: a full-bleed strip in the event lane, so the question stays readable. */
export function QuickStrip({ fx }: { fx: QuickFx }) {
  return (
    <div
      key={fx.seq}
      className="rq-banner pointer-events-none mt-2 flex flex-1 flex-col"
      style={{ "--rq-banner-ms": `${FX.quickBannerMs}ms` } as CSSProperties}
      role="status"
      aria-label={fx.powerup === "fifty" ? "You used 50:50" : "You used Gotta Go Fast"}
    >
      {fx.powerup === "fifty" ? <FiftyStrip /> : <FastStrip />}
    </div>
  );
}
