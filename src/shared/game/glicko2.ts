// Ranked rating: Glicko-2 (Glickman, "Example of the Glicko-2 system", 2013),
// one game per rating period. Pure; every parameter comes from GLICKO in
// config.ts. Ratings are stored and shown on the Glicko scale (1500 / 350).

import { GLICKO } from "./config";
import type { GlickoRating } from "./types";

export interface GlickoGame {
  opponent: GlickoRating;
  /** 1 win, 0.5 draw, 0 loss (surrender and abandon are losses). */
  score: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The starting rating of a player with no ranked games. */
export function defaultGlicko(): GlickoRating {
  return { r: GLICKO.startRating, rd: GLICKO.startRd, vol: GLICKO.startVol };
}

/**
 * Replaces non-finite or non-positive values with the start values and caps RD
 * at GLICKO.rdMax. The RD minimum is applied to results only, so inputs such as
 * the paper's 30-RD opponent pass through unchanged.
 */
export function sanitizeGlicko(rating: GlickoRating): GlickoRating {
  const r = Number.isFinite(rating.r) ? rating.r : GLICKO.startRating;
  const rd = Number.isFinite(rating.rd) && rating.rd > 0 ? Math.min(rating.rd, GLICKO.rdMax) : GLICKO.startRd;
  const vol = Number.isFinite(rating.vol) && rating.vol > 0 ? rating.vol : GLICKO.startVol;
  return { r, rd, vol };
}

/** Full days between two instants (0 when `since` is null or in the future). */
export function fullIdleDays(since: number | null, now: number): number {
  if (since === null || !Number.isFinite(since) || now <= since) return 0;
  return Math.floor((now - since) / MS_PER_DAY);
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Step 5 of Glickman's paper: the new volatility, by the Illinois variant of
 * regula falsi on f(x) = 0 with x = ln(sigma'^2).
 */
function newVolatility(phi: number, sigma: number, v: number, delta: number): number {
  const tau = GLICKO.tau;
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const denom = phi2 + v + ex;
    return (ex * (delta2 - phi2 - v - ex)) / (2 * denom * denom) - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  // The iteration converges in a handful of steps; the bound only guards
  // against a pathological input looping forever.
  for (let i = 0; i < 1000 && Math.abs(B - A) > GLICKO.epsilon; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * Glickman's algorithm without any clamps: steps 2 to 8 of the paper. With no
 * games, only the RD grows (step 6). Exported for the paper example test.
 */
export function glicko2Raw(player: GlickoRating, games: readonly GlickoGame[]): GlickoRating {
  const scale = GLICKO.scale;
  const mu = (player.r - GLICKO.startRating) / scale;
  const phi = player.rd / scale;
  const sigma = player.vol;

  if (games.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { r: player.r, rd: phiStar * scale, vol: sigma };
  }

  let vInv = 0;
  let sum = 0;
  for (const game of games) {
    const muJ = (game.opponent.r - GLICKO.startRating) / scale;
    const phiJ = game.opponent.rd / scale;
    const gJ = g(phiJ);
    const e = expected(mu, muJ, phiJ);
    vInv += gJ * gJ * e * (1 - e);
    sum += gJ * (game.score - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;

  const sigmaNew = newVolatility(phi, sigma, v, delta);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;

  return { r: muNew * scale + GLICKO.startRating, rd: phiNew * scale, vol: sigmaNew };
}

/**
 * Glickman's algorithm with tau, Illinois volatility iteration, RD clamp,
 * rating floor and max change from config. Inputs are sanitized first, so a
 * corrupt row cannot produce NaN.
 */
export function glicko2Update(player: GlickoRating, games: readonly GlickoGame[]): GlickoRating {
  const before = sanitizeGlicko(player);
  const raw = glicko2Raw(
    before,
    games.map((game) => ({ opponent: sanitizeGlicko(game.opponent), score: clamp(game.score, GLICKO.scoreLoss, GLICKO.scoreWin) })),
  );
  const change = clamp(raw.r - before.r, -GLICKO.maxChangePerGame, GLICKO.maxChangePerGame);
  const r = Math.max(GLICKO.ratingFloor, before.r + change);
  const rd = clamp(raw.rd, GLICKO.rdMin, GLICKO.rdMax);
  const vol = Number.isFinite(raw.vol) && raw.vol > 0 ? raw.vol : before.vol;
  return { r, rd, vol };
}

/** RD inflation for full idle days: phi = sqrt(phi^2 + vol^2) per day, capped at GLICKO.rdMax. */
export function inflateForIdleDays(rating: GlickoRating, idleDays: number): GlickoRating {
  const days = Number.isFinite(idleDays) ? Math.max(0, Math.floor(idleDays)) : 0;
  if (days === 0) return { ...rating };
  const phi = rating.rd / GLICKO.scale;
  // Applying the per-day step `days` times adds vol^2 each time.
  const phiNew = Math.sqrt(phi * phi + days * rating.vol * rating.vol);
  return { r: rating.r, rd: Math.min(GLICKO.rdMax, phiNew * GLICKO.scale), vol: rating.vol };
}

/** Provisional while RD >= GLICKO.provisionalRd. */
export function isProvisional(rd: number): boolean {
  return rd >= GLICKO.provisionalRd;
}
