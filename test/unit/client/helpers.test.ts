// Pure client helpers: formatting, crop math, loadouts, answers, redirects,
// lobbies, queue timing, sign-up validation.
import { describe, expect, it } from "vitest";
import { LIMITS, POWERUPS } from "@shared/game/config";
import { answerIds, buildAnswer, isRenderable, sameAnswer, togglePick } from "../../../src/client/lib/answers";
import { clampView, initialView, sourceRect, zoomAroundCentre } from "../../../src/client/lib/crop";
import { botName, formatAgo, formatClock, formatDelta, formatNumber, formatRating, initials, normaliseJoinCode, percent } from "../../../src/client/lib/format";
import { effectiveRated, joinUrl } from "../../../src/client/lib/lobby";
import { isCompleteLoadout, toggleLoadout } from "../../../src/client/lib/loadout";
import { safeNext, withNext } from "../../../src/client/lib/next";
import { elapsedMs } from "../../../src/client/lib/queue-state";
import { validateSignUp } from "../../../src/client/lib/validate";

describe("format", () => {
  it("shows provisional ratings with a question mark and missing ones as the start value", () => {
    expect(formatRating(1540.4, true)).toBe("1540?");
    expect(formatRating(1540.6, false)).toBe("1541");
    expect(formatRating(null, false)).toBe("1500?");
  });

  it("formats deltas, numbers and clocks", () => {
    expect(formatDelta(162)).toBe("+162");
    expect(formatDelta(-14)).toBe("−14");
    expect(formatDelta(0)).toBe("0");
    expect(formatNumber(1800)).toBe("1,800");
    expect(formatNumber(6000000)).toBe("6,000,000");
    expect(formatClock(7_900)).toBe("0:07");
    expect(formatClock(92_000)).toBe("1:32");
    expect(formatClock(-5)).toBe("0:00");
  });

  it("formats relative times", () => {
    const now = Date.UTC(2026, 9, 22, 12);
    expect(formatAgo(now - 10_000, now)).toBe("just now");
    expect(formatAgo(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatAgo(now - 3 * 3600_000, now)).toBe("3 h ago");
    expect(formatAgo(now - 30 * 3600_000, now)).toBe("yesterday");
    expect(formatAgo(now - 3 * 86400_000, now)).toBe("3 days ago");
  });

  it("makes initials and bot names", () => {
    expect(initials("Filip", "Pieniak")).toBe("FP");
    expect(initials("", "", "bibi_main")).toBe("BI");
    expect(botName(3)).toBe("Has the notes open");
    expect(botName(-1)).toBe("Echo");
    expect(botName(0)).toBeNull();
    expect(percent(9, 19)).toBe(47);
    expect(percent(1, 0)).toBe(0);
  });

  it("normalises join codes to the code alphabet", () => {
    expect(normaliseJoinCode(" k7q-4mx ")).toBe("K7Q4MX");
    // 0, O, 1 and I are not in the alphabet.
    expect(normaliseJoinCode("O0I1AB")).toBe("AB");
    expect(normaliseJoinCode("ABCDEFGHJK")).toHaveLength(LIMITS.joinCodeLength);
  });
});

describe("crop math", () => {
  const V = 280;
  it("centres a landscape image covering the viewport", () => {
    const v = initialView(1000, 500, V);
    expect(v.zoom).toBe(1);
    expect(v.y).toBe(0);
    expect(v.x).toBeCloseTo((V - 560) / 2);
    const r = sourceRect(v, 1000, 500, V);
    expect(r.sx).toBeCloseTo(250);
    expect(r.sy).toBe(0);
    expect(r.size).toBeCloseTo(500);
  });

  it("never lets the image leave a gap", () => {
    const c = clampView({ x: 50, y: -999, zoom: 1 }, 1000, 500, V);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    const z = clampView({ x: 0, y: 0, zoom: 99 }, 1000, 500, V);
    expect(z.zoom).toBeLessThanOrEqual(4);
  });

  it("zooms around the centre", () => {
    const v = initialView(800, 800, V);
    const z = zoomAroundCentre(v, 2, 800, 800, V);
    const r = sourceRect(z, 800, 800, V);
    expect(r.size).toBeCloseTo(400);
    expect(r.sx).toBeCloseTo(200);
    expect(r.sy).toBeCloseTo(200);
  });
});

describe("loadout", () => {
  it("toggles without exceeding the loadout size", () => {
    expect(toggleLoadout(["bibi", "shield"], "fifty")).toEqual(["bibi", "shield", "fifty"]);
    expect(toggleLoadout(["bibi", "shield", "fifty"], "fast")).toEqual(["bibi", "shield", "fifty"]);
    expect(toggleLoadout(["bibi", "shield", "fifty"], "shield")).toEqual(["bibi", "fifty"]);
  });

  it("accepts only complete, distinct loadouts", () => {
    expect(isCompleteLoadout(POWERUPS.defaultLoadout)).toBe(true);
    expect(isCompleteLoadout(["bibi", "bibi", "shield"])).toBe(false);
    expect(isCompleteLoadout(["bibi", "shield"])).toBe(false);
    expect(isCompleteLoadout(["bibi", "shield", "kraken"])).toBe(false);
  });
});

describe("answers", () => {
  it("builds answers per type", () => {
    expect(buildAnswer("single", ["a"])).toEqual({ kind: "options", ids: ["a"] });
    expect(buildAnswer("cloze", ["a", "b"])).toEqual({ kind: "options", ids: ["a"] });
    expect(buildAnswer("multi", ["a", "b"])).toEqual({ kind: "options", ids: ["a", "b"] });
    expect(buildAnswer("truefalse", ["false"])).toEqual({ kind: "bool", value: false });
    expect(buildAnswer("single", [])).toBeNull();
    expect(buildAnswer("order", ["a"])).toBeNull();
  });

  it("compares answers as sets, all or nothing", () => {
    expect(sameAnswer({ kind: "options", ids: ["b", "a"] }, { kind: "options", ids: ["a", "b"] })).toBe(true);
    expect(sameAnswer({ kind: "options", ids: ["a"] }, { kind: "options", ids: ["a", "b"] })).toBe(false);
    expect(sameAnswer({ kind: "bool", value: true }, { kind: "bool", value: true })).toBe(true);
    expect(sameAnswer(null, { kind: "bool", value: true })).toBe(false);
    expect(answerIds({ kind: "bool", value: true })).toEqual(["true"]);
  });

  it("toggles picks for multi and replaces for the rest", () => {
    expect(togglePick("multi", ["a"], "b")).toEqual(["a", "b"]);
    expect(togglePick("multi", ["a", "b"], "a")).toEqual(["b"]);
    expect(togglePick("single", ["a"], "b")).toEqual(["b"]);
    expect(isRenderable("match")).toBe(false);
  });
});

describe("redirects after sign-in", () => {
  it("only follows same-site paths", () => {
    expect(safeNext("/join/K7Q4MX")).toBe("/join/K7Q4MX");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(withNext("/login", "/join/K7Q4MX")).toBe("/login?next=%2Fjoin%2FK7Q4MX");
    expect(withNext("/login", "/")).toBe("/login");
  });
});

describe("lobby", () => {
  it("is rated only with standard settings", () => {
    expect(effectiveRated(true, null, true)).toBe(true);
    expect(effectiveRated(true, ["AGAI-L01"], true)).toBe(false);
    expect(effectiveRated(true, null, false)).toBe(false);
    expect(effectiveRated(false, null, true)).toBe(false);
    expect(joinUrl("K7Q4MX", "https://game.example.com")).toBe("https://game.example.com/join/K7Q4MX");
  });
});

describe("queue timing", () => {
  it("counts from the server's wait once known", () => {
    expect(elapsedMs({ kind: "connecting" }, 1000, 4000)).toBe(3000);
    expect(elapsedMs({ kind: "searching", searching: 1, waitedMs: 20_000, at: 5000, window: null }, 0, 6500)).toBe(21_500);
  });
});

describe("sign-up validation", () => {
  const good = { email: "a@b.nl", password: "longenough", username: "bibi_main.99", firstName: "Anna", lastName: "K" };
  it("accepts a valid form", () => {
    expect(validateSignUp(good)).toEqual({});
  });
  it("flags each bad field", () => {
    const e = validateSignUp({ email: "nope", password: "short", username: "a b", firstName: " ", lastName: "" });
    expect(Object.keys(e).sort()).toEqual(["email", "firstName", "lastName", "password", "username"]);
  });
});
