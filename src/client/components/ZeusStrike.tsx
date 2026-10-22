// The landing page's looping Zeus strike: a cloud glow, a bolt that cracks
// down the middle, a white flash, then embers. CSS keyframes in app.css; with
// reduced motion it is a still bolt with a soft glow.
import { cx } from "./ui";

export function ZeusStrike({ className }: { className?: string }) {
  return (
    <div className={cx("zeus-strike relative mx-auto aspect-square w-full max-w-[18rem]", className)} aria-hidden>
      <div className="zeus-glow absolute inset-[8%] rounded-full" />
      <div className="zeus-flash absolute inset-0 rounded-full" />
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id="zeus-bolt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff7d6" />
            <stop offset="45%" stopColor="#f5c542" />
            <stop offset="100%" stopColor="#e59a12" />
          </linearGradient>
          <filter id="zeus-bolt-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Clouds */}
        <g className="zeus-cloud" fill="#1b2650" stroke="#2a3766" strokeWidth="2">
          <path d="M40 52c0-12 10-20 22-20 4-12 16-20 30-20 15 0 27 9 31 22 3-1 6-2 9-2 14 0 25 10 25 22 0 2 0 4-1 5H41c-1-2-1-4-1-7Z" />
        </g>
        {/* Branch bolts */}
        <path className="zeus-branch zeus-branch-a" d="M96 92 70 112 78 118 58 146" fill="none" stroke="#f5c542" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path className="zeus-branch zeus-branch-b" d="M112 120 136 134 128 140 146 162" fill="none" stroke="#f5c542" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* Main bolt */}
        <path
          className="zeus-bolt"
          d="M108 58 82 112h22l-18 70 46-80h-24l18-44Z"
          fill="url(#zeus-bolt-fill)"
          stroke="#fff3c4"
          strokeWidth="2"
          strokeLinejoin="round"
          filter="url(#zeus-bolt-glow)"
        />
        {/* Impact sparks */}
        <g className="zeus-sparks" stroke="#f5c542" strokeWidth="3" strokeLinecap="round">
          <path d="M86 186l-12 6M126 186l12 6M106 190v8M70 178l-10-2M142 178l10-2" />
        </g>
      </svg>
    </div>
  );
}
