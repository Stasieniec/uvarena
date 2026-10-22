// Clock offset, prompt parsing, formatting and sound cues.
import { describe, expect, it } from "vitest";
import { NET } from "@shared/game/config";
import { ClockSync } from "../../../src/client/match/clock";
import { cuesFor } from "../../../src/client/match/cues";
import { fmtClock, fmtInt, fmtMultiplier, fmtRating, fmtSigned, initials } from "../../../src/client/match/format";
import { hasBlank, parseBlocks, parseInline } from "../../../src/client/match/prompt";
import { initialMatchState } from "../../../src/client/match/state";

describe("ClockSync", () => {
  it("averages the last samples of serverNow minus receive time", () => {
    let local = 1000;
    const c = new ClockSync(() => local);
    expect(c.now()).toBe(1000);
    c.sample(1500, 1000);
    c.sample(1700, 1000);
    expect(c.offset()).toBe(600);
    expect(c.now()).toBe(1600);
    for (let i = 0; i < NET.clockOffsetSamples; i++) c.sample(1100, 1000);
    expect(c.offset()).toBe(100);
    local = 2000;
    expect(c.now()).toBe(2100);
  });
});

describe("prompt parser", () => {
  it("finds the cloze blank and the capital NOT", () => {
    const t = parseInline("Which is NOT a ___ here, `x` and **bold**?");
    expect(t.map((x) => x.kind)).toEqual(["text", "not", "text", "blank", "text", "code", "text", "bold", "text"]);
    expect(hasBlank(t)).toBe(true);
    expect(parseInline("This is not shouted.").some((x) => x.kind === "not")).toBe(false);
    expect(parseInline("**NOT**")).toEqual([{ kind: "not", text: "NOT" }]);
  });

  it("splits paragraphs and fenced code", () => {
    const b = parseBlocks("Look:\n\n```python\nif x:\n    y()\n```\nThen?");
    expect(b.map((x) => x.kind)).toEqual(["para", "code", "para"]);
    expect(b[1]).toEqual({ kind: "code", lang: "python", text: "if x:\n    y()" });
  });
});

describe("format", () => {
  it("formats numbers, ratings and clocks", () => {
    expect(fmtInt(1800)).toBe("1,800");
    expect(fmtSigned(162)).toBe("+162");
    expect(fmtSigned(-40)).toBe("\u221240");
    expect(fmtRating(1540, true)).toBe("1540?");
    expect(fmtClock(38_200)).toBe("0:39");
    expect(fmtMultiplier(1.5)).toBe("x1.5");
    expect(fmtMultiplier(2)).toBe("x2");
    expect(initials("zeus_main_99")).toBe("ZM");
  });
});

describe("cues", () => {
  const s = initialMatchState();
  it("thunders for an active Zeus and cracks for Nemesis", () => {
    const zeus = cuesFor(s, { type: "banner", serverNow: 1, round: 1, phaseEndsAt: 2, items: [{ who: "you", powerup: "zeus", outcome: "active" }] });
    expect(zeus.map((c) => c.sound)).toContain("thunder");
    const nem = cuesFor(s, {
      type: "banner",
      serverNow: 1,
      round: 1,
      phaseEndsAt: 2,
      items: [
        { who: "you", powerup: "aegis", outcome: "cancelled" },
        { who: "opponent", powerup: "nemesis", outcome: "nemesis_hit" },
      ],
    });
    expect(nem.map((c) => c.sound)).toEqual(["crack"]);
  });

  it("thuds and vibrates when you take a hit, fanfare on a win", () => {
    const hit = cuesFor(s, {
      type: "reveal",
      serverNow: 1,
      round: 1,
      questionId: "agai-abcdef",
      key: { kind: "bool", value: true },
      yourAnswer: null,
      opponentAnswer: { kind: "bool", value: true },
      yourCorrect: false,
      opponentCorrect: true,
      yourMs: null,
      opponentMs: 2000,
      yourScore: 0,
      opponentScore: 933,
      multiplier: 3,
      damageToYou: 2799,
      damageToOpponent: 0,
      capped: false,
      zeus: null,
      aegis: null,
      phoenix: null,
      hp: { you: 3201, opponent: 6000 },
      whyShort: "x",
      savedToMissed: true,
      phaseEndsAt: 5,
    });
    expect(hit[0]).toMatchObject({ sound: "thud" });
    expect(hit[0]!.vibrate?.length).toBeGreaterThan(1);
    const end = cuesFor(s, {
      type: "match_end",
      serverNow: 1,
      result: "win",
      reason: "hp",
      hp: { you: 1, opponent: 0 },
      rounds: 9,
      ranked: null,
      bot: null,
      pairCapped: false,
      summary: { correct: 1, answered: 1, fastestMs: null, biggestHit: 0, powerupsUsed: [] },
      missedCount: 0,
      rematchUntil: null,
    });
    expect(end.map((c) => c.sound)).toEqual(["fanfare"]);
  });
});
