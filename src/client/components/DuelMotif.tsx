// The Broadcast HUD strip outside a match: your teal plate, the clock plate
// and their red plate (inner ends cut at 12 degrees), with the square HP bars
// under them. The landing page runs it live (a hit lands every 2.4 s, then
// the bar refills over 600 ms); the queue shows it pre-formed with an empty
// "SEARCHING ?" plate. Classes in app.css (.bc-*).
import { useEffect, useState, type ReactNode } from "react";
import { MATCH } from "@shared/game/config";
import { CheckIcon } from "./icons";
import { cx } from "./ui";

const HP_TICK = 1000;

function pct(hp: number): number {
  return Math.max(0, Math.min(100, (hp / MATCH.startHp) * 100));
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** A name plate: name on top, a number (HP or rating) underneath, aligned to the clock. */
export function StripPlate({ side, name, value, empty }: { side: "you" | "them"; name: ReactNode; value: ReactNode; empty?: boolean }) {
  const you = side === "you";
  return (
    <div
      className={cx(
        "font-display flex min-w-0 flex-col justify-center",
        you ? "bc-cut-you pr-5 pl-3" : "bc-cut-them pr-3 pl-5",
        empty ? "bg-plate text-muted" : you ? "bg-you text-bg" : "bg-opponent text-bg",
      )}
    >
      <span className={cx("truncate text-[17px] leading-5 font-bold tracking-[0.04em] uppercase", !you && "self-end")}>{name}</span>
      <span className={cx("text-[22px] leading-6 font-bold", you || empty ? "self-end" : "")}>{value}</span>
    </div>
  );
}

/** The 64 px clock plate between the name plates. */
export function StripClock({ children, done, label }: { children: ReactNode; done?: boolean; label: string }) {
  const text = String(children);
  return (
    <div
      aria-label={label}
      className={cx("font-display flex items-center justify-center bg-plate leading-[48px] font-bold", done ? "text-muted" : "text-text", text.length > 2 ? "text-[32px]" : "text-[48px]")}
    >
      {children}
    </div>
  );
}

/**
 * An 8 px HP bar filling outward from the clock, with a 2 px tick every 1,000.
 * `lost` draws the part a hit took off on the outer side of the fill: red on
 * your bar, text white on theirs (red would vanish into their red bar).
 */
export function StripBar({ side, hp, lost = 0, empty, className }: { side: "you" | "them"; hp: number; lost?: number; empty?: boolean; className?: string }) {
  const you = side === "you";
  const ticks: number[] = [];
  for (let v = HP_TICK; v < MATCH.startHp; v += HP_TICK) ticks.push(pct(v));
  const fill = <span className={cx("bc-bar-fill block h-full", you ? "bg-you" : "bg-opponent")} style={{ width: `${pct(hp)}%` }} />;
  const chunk = <span className={cx("bc-bar-chunk block h-full", you ? "bg-opponent" : "bg-text")} style={{ width: `${pct(lost)}%`, opacity: lost > 0 ? 1 : 0 }} />;
  return (
    <div className={cx("relative flex h-2 bg-line", you ? "justify-end" : "justify-start", className)} aria-hidden>
      {empty ? null : you ? (
        <>
          {chunk}
          {fill}
        </>
      ) : (
        <>
          {fill}
          {chunk}
        </>
      )}
      {empty ? null : ticks.map((t) => <span key={t} className="absolute inset-y-0 w-0.5 bg-bg" style={{ left: `${t}%` }} />)}
    </div>
  );
}

/** Both rows of the strip: plates and clock, then the bars. */
export function Strip({ you, clock, them, youBar, themBar }: { you: ReactNode; clock: ReactNode; them: ReactNode; youBar: ReactNode; themBar: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="bc-strip-grid h-16">
        {you}
        {clock}
        {them}
      </div>
      <div className="bc-strip-grid">
        {youBar}
        <span />
        {themBar}
      </div>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  return reduced;
}

// The landing loop: a hit lands, holds, then the bar refills over 600 ms.
const CYCLE_MS = 2400;
const REFILL_MS = 600;
const BEFORE = 4200;
const DAMAGE = 1800;

/**
 * The landing page's picture: a round in progress, trading a hit. Stas has
 * answered with 7 s left; the damage plate drops under the strip and the right
 * option shows who picked it. With reduced motion it holds the hit frame.
 */
export function DuelMotif({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<"hit" | "refill">("hit");
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const toRefill = window.setTimeout(() => setPhase("refill"), CYCLE_MS - REFILL_MS);
    const toHit = window.setTimeout(() => {
      setPhase("hit");
      setCycle((c) => c + 1);
    }, CYCLE_MS);
    return () => {
      window.clearTimeout(toRefill);
      window.clearTimeout(toHit);
    };
  }, [cycle, reduced]);

  const hit = phase === "hit";
  const theirHp = hit ? BEFORE - DAMAGE : BEFORE;
  return (
    <section aria-label="A round in progress" className={cx("flex flex-col items-center gap-3", className)}>
      <p className="sr-only">
        Stas answers right and hits kvdberg for {fmt(DAMAGE)}.
      </p>
      <div className="self-stretch" aria-hidden>
        <Strip
          you={<StripPlate side="you" name="STAS" value={fmt(5200)} />}
          clock={
            <StripClock done label="Answered with 7 seconds left">
              7
            </StripClock>
          }
          them={<StripPlate side="them" name="KVDBERG" value={fmt(theirHp)} />}
          youBar={<StripBar side="you" hp={5200} />}
          themBar={<StripBar side="them" hp={theirHp} lost={DAMAGE} className={hit ? "bc-hit" : "bc-refill"} />}
        />
      </div>
      <div key={cycle} aria-hidden className={cx("flex flex-col items-center bg-event px-4 pt-1.5 pb-2 text-bg", hit ? "bc-drop" : "bc-fade-out")}>
        <span className="font-display text-[32px] leading-9 font-bold">−{fmt(DAMAGE)}</span>
        <span className="text-sm leading-5 font-semibold">stas 900 · kvdberg 0 · x2</span>
      </div>
      <div
        aria-hidden
        className="mt-1 flex min-h-[52px] items-center gap-3 self-stretch rounded-md bg-text pr-3 pl-4 text-bg shadow-[0_3px_0_var(--color-muted)]"
      >
        <CheckIcon size={18} strokeWidth={2.6} />
        <span className="flex-1 text-[17px] leading-6 font-semibold">Observation</span>
        <span className="font-display bg-you px-2 py-px text-[15px] leading-5 font-bold tracking-[0.04em]">STAS</span>
      </div>
    </section>
  );
}
