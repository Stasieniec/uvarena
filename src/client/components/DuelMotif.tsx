// The landing page's picture: two players, two HP bars, one question between
// them. A slow loop takes a chunk off one bar, then the other, and refills.
// CSS keyframes in app.css; with reduced motion the bars stand still.
import { cx } from "./ui";

function Bar({ side }: { side: "you" | "them" }) {
  const you = side === "you";
  return (
    <div className="flex items-center gap-3">
      <span className={cx("size-3 shrink-0 rounded-xs", you ? "bg-you" : "bg-opponent")} />
      <div className="relative h-3 flex-1 overflow-hidden rounded-xs bg-border">
        <div className={cx("duel-hp absolute inset-y-0 left-0", you ? "duel-hp-you bg-you" : "duel-hp-them bg-opponent")} />
      </div>
    </div>
  );
}

export function DuelMotif({ className }: { className?: string }) {
  return (
    <div className={cx("mx-auto w-full max-w-[18rem] rounded-2xl border border-border bg-surface/70 p-4", className)} aria-hidden>
      <Bar side="them" />
      <div className="my-4 rounded-xl border border-border bg-bg/60 px-3 py-2.5 text-left">
        <div className="mb-2 h-2 w-4/5 rounded-xs bg-text/25" />
        <div className="h-2 w-3/5 rounded-xs bg-text/15" />
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <div className="duel-pick h-5 rounded-md bg-surface-2 ring-1 ring-white/10" />
          <div className="h-5 rounded-md bg-surface-2 ring-1 ring-white/10" />
          <div className="h-5 rounded-md bg-surface-2 ring-1 ring-white/10" />
          <div className="h-5 rounded-md bg-surface-2 ring-1 ring-white/10" />
        </div>
      </div>
      <Bar side="you" />
    </div>
  );
}
