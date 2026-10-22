// The preview's transport: runs a FakeMatchServer on a virtual clock and
// delivers the viewer's messages as if they came over the socket. It can jump
// to a named moment (all earlier messages are delivered at once, so the
// screen state is exactly what a live player would have) and freeze there,
// which is what the screenshot script uses.

import type { Side } from "@shared/game/types";
import type { ClientMessage } from "@shared/protocol";
import type { MatchClock } from "../clock";
import type { MatchTransport, TransportListener } from "../transport";
import { FakeMatchServer, type Scenario, type ServerEvent } from "./fake-server";
import type { Moment } from "./scenarios";

/** A fixed start time, so frozen screenshots are identical run to run. */
export const PREVIEW_EPOCH = Date.UTC(2026, 9, 22, 18, 0, 0);

export interface HarnessOptions {
  viewer: Side;
  /** Play the viewer's own script by tapping for them. */
  autoplay: boolean;
  seek: Moment | null;
  freeze: boolean;
  speed: number;
}

export class DevHarness implements MatchTransport, MatchClock {
  private server: FakeMatchServer | null = null;
  private listener: TransportListener | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private vbase = PREVIEW_EPOCH;
  private wbase = 0;
  private frozen = true;
  private connected = false;
  /** Set by the preview: performs an autoplay tap through the screen's own actions. */
  onAuto: ((msg: ClientMessage) => void) | null = null;

  constructor(
    private readonly scenario: Scenario,
    private readonly opts: HarnessOptions,
  ) {}

  now(): number {
    if (this.frozen) return this.vbase;
    return this.vbase + (Date.now() - this.wbase) * this.opts.speed;
  }

  start(listener: TransportListener): void {
    this.listener = listener;
    const { viewer, autoplay } = this.opts;
    const scripted: [boolean, boolean] = [viewer !== 0, viewer !== 1];
    const auto: [boolean, boolean] = [viewer === 0 && autoplay, viewer === 1 && autoplay];
    this.server = new FakeMatchServer(this.scenario, { scripted, autoplay: auto }, PREVIEW_EPOCH);
    this.vbase = PREVIEW_EPOCH;
    this.frozen = true;
    listener.onStatus("open");
    this.connected = true;
    this.deliver(this.server.start());
    if (this.opts.seek) this.seek(this.opts.seek);
    if (!this.opts.freeze) this.resume();
  }

  send(msg: ClientMessage): boolean {
    if (!this.server || !this.connected) return false;
    this.deliver(this.server.handle(this.opts.viewer, msg, this.now()));
    this.schedule();
    return true;
  }

  /** Simulates a dropped connection for `ms`, then a reconnect with a snapshot. */
  drop(ms: number): void {
    if (!this.listener || !this.server) return;
    this.connected = false;
    this.listener.onStatus("reconnecting");
    setTimeout(() => this.reconnectNow(), ms);
  }

  reconnectNow(): void {
    if (!this.listener || !this.server) return;
    this.connected = true;
    this.listener.onStatus("open");
    this.deliver(this.server.connect(this.opts.viewer, this.now()));
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listener = null;
    this.server = null;
  }

  private resume(): void {
    this.wbase = Date.now();
    this.frozen = false;
    this.schedule();
  }

  private schedule(): void {
    if (this.frozen || !this.server) return;
    if (this.timer) clearTimeout(this.timer);
    const next = this.server.nextAt();
    if (next === null) return;
    const delay = Math.max(0, (next - this.now()) / this.opts.speed);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.server) return;
      this.deliver(this.server.advance(this.now()));
      this.schedule();
    }, delay);
  }

  private seek(m: Moment): void {
    const server = this.server!;
    let reachedAt: number | null = null;
    for (let guard = 0; guard < 10000; guard++) {
      if (reachedAt === null && server.round === m.round && server.phase === m.phase) reachedAt = server.phaseStartedAt;
      const next = server.nextAt();
      if (reachedAt !== null && (next === null || next > reachedAt + m.offsetMs)) {
        this.vbase = reachedAt + m.offsetMs;
        this.deliver(server.advance(this.vbase));
        return;
      }
      if (next === null) return;
      this.vbase = next;
      this.deliver(server.advance(next));
    }
  }

  private deliver(events: ServerEvent[]): void {
    for (const ev of events) {
      if (ev.kind === "msg") {
        if (ev.to === this.opts.viewer && this.connected) this.listener?.onMessage(ev.msg, this.now());
      } else if (ev.side === this.opts.viewer) {
        if (this.onAuto) this.onAuto(ev.msg);
        else this.send(ev.msg);
      }
    }
  }
}
