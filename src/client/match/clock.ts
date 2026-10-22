// Server clock estimate. Every server message carries serverNow; the offset is
// the mean of (serverNow - local receive time) over the last
// NET.clockOffsetSamples messages. Countdowns render from server deadlines
// through now(), so a phone with a wrong clock still drains the timer right.

import { NET } from "@shared/game/config";

export interface MatchClock {
  /** Current server time estimate, epoch ms. */
  now(): number;
}

export class ClockSync implements MatchClock {
  private samples: number[] = [];
  private readonly local: () => number;
  private readonly size: number;

  constructor(local: () => number = Date.now, size: number = NET.clockOffsetSamples) {
    this.local = local;
    this.size = Math.max(1, size);
  }

  /** Records one server message. receivedAt defaults to the local clock now. */
  sample(serverNow: number, receivedAt: number = this.local()): void {
    if (!Number.isFinite(serverNow)) return;
    this.samples.push(serverNow - receivedAt);
    if (this.samples.length > this.size) this.samples.shift();
  }

  offset(): number {
    if (this.samples.length === 0) return 0;
    let sum = 0;
    for (const s of this.samples) sum += s;
    return sum / this.samples.length;
  }

  now(): number {
    return this.local() + this.offset();
  }

  reset(): void {
    this.samples = [];
  }
}
