// Visual timings and thresholds of the match screen. These are presentation
// only; every game rule and duration comes from @shared/game/config.

export const FX = {
  /** Reveal: the answers are marked at once, the hit lands, then the explanation. */
  revealImpactMs: 1000,
  revealLineMs: 1300,
  /** Hits of this size or more shake the hit plate (design.md, research report). */
  bigHit: 2000,
  /** The hit on the bar: freeze, white, red, drain (match.css rq-chunk keeps the same steps). */
  hitFreezeMs: 100,
  hitWhiteMs: 60,
  hitRedMs: 400,
  hitDrainMs: 350,
  /** "10 SECONDS" when the opponent answers. */
  calloutMs: 700,
  /** Quick power-up strip and the opponent's power-up line. */
  quickBannerMs: 1500,
  toastMs: 2200,
  /** Seconds left from which the tick plays and the clock turns red. */
  tickFromS: 5,
  /** End screen rating count. */
  ratingCountMs: 600,
  /** Hold the surrender flag this long (design.md: 1 second). */
  surrenderHoldMs: 1000,
} as const;

/** When the drain starts after a hit lands. */
export const HIT_DRAIN_AT_MS = FX.hitFreezeMs + FX.hitWhiteMs + FX.hitRedMs;
/** The whole hit on the bar, freeze to empty. */
export const HIT_TOTAL_MS = HIT_DRAIN_AT_MS + FX.hitDrainMs;
