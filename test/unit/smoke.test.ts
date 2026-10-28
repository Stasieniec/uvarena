// Scaffold smoke test (Node): the alias resolves, the contracts load, the
// fixture bank matches its schema, and protocol round-trips work.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { APP_NAME } from "@shared/brand";
import { BOT_LADDER, MATCH, QUESTIONS, SCORING } from "@shared/game/config";
import { BankFileSchema } from "@shared/question-schema";
import { CLOSE_CODES, parseClientMessage, parseServerMessage } from "@shared/protocol";

describe("scaffold", () => {
  it("loads the shared config", () => {
    expect(APP_NAME.length).toBeGreaterThan(0);
    expect(MATCH.startHp).toBe(6000);
    expect(SCORING.bibiRoundCap).toBe(4500);
    expect(BOT_LADDER.map((b) => b.rating)).toEqual([1050, 1200, 1350, 1500, 1650, 1800, 1950, 2100]);
    expect(CLOSE_CODES.replaced).toBe(4001);
  });

  it("has a valid fixture bank with every question type", () => {
    const raw = JSON.parse(readFileSync(new URL("../fixtures/questions.json", import.meta.url), "utf8"));
    const bank = BankFileSchema.parse(raw);
    expect(new Set(bank.questions.map((q) => q.type))).toEqual(
      new Set(["single", "multi", "truefalse", "cloze", "order", "match"]),
    );
    const playableAgai = bank.questions.filter((q) => q.courseId === "agai" && QUESTIONS.uiTypes.includes(q.type));
    expect(playableAgai.length).toBeGreaterThanOrEqual(MATCH.questionsPerMatch);
    const lectureIds = new Set(bank.lectures.map((l) => l.id));
    for (const q of bank.questions) expect(lectureIds.has(q.lectureId)).toBe(true);
  });

  it("parses protocol messages", () => {
    expect(parseClientMessage(JSON.stringify({ type: "answer", round: 3, answer: { kind: "options", ids: ["x7Kq2a"] } }))).toEqual({
      type: "answer",
      round: 3,
      answer: { kind: "options", ids: ["x7Kq2a"] },
    });
    expect(parseClientMessage("ping")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "arm", round: 1, powerup: "fifty" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "opponent_powerup", serverNow: 1, round: 2, powerup: "fast" }))?.type).toBe(
      "opponent_powerup",
    );
  });
});
