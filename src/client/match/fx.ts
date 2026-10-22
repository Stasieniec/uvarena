// Visual timings and thresholds of the match screen. These are presentation
// only; every game rule and duration comes from @shared/game/config.

export const FX = {
  /** Reveal: answers flip, then the hit travels, then it lands. */
  revealFlipMs: 350,
  revealStreakMs: 650,
  revealImpactMs: 1000,
  /** Phoenix line shows this long after the impact. */
  phoenixDelayMs: 250,
  /** Explanation line slides in after the impact. */
  revealLineMs: 1300,
  /** Hits above this shake the screen and flash a red edge (design.md). */
  bigHit: 2000,
  shakeMs: 550,
  /** Floating damage number. */
  floatMs: 1400,
  /** Quick power-up strip and opponent toast. */
  quickBannerMs: 1500,
  toastMs: 2200,
  /** Seconds left from which the tick plays and the timer turns red. */
  tickFromS: 5,
  /** End screen rating count. */
  ratingCountMs: 1400,
  /** Hold the surrender flag this long (design.md: 1 second). */
  surrenderHoldMs: 1000,
} as const;
