import { describe, expect, it } from "vitest";
import {
  botArmChoice,
  botInit,
  botSpeed,
  botStrength,
  pKnow,
  planBot,
  planBotQuestion,
  randomAnswer,
} from "@shared/game/bot";
import { BOT_LADDER, BOT_MODEL } from "@shared/game/config";
import { createRng } from "@shared/game/rng";
import { isCorrect } from "@shared/game/scoring";
import type { BlindPowerupId, BotPlan, PlayerState } from "@shared/game/types";
import { makeQuestion, multiQ, trueFalse } from "./helpers";

describe("bot strength and ladder", () => {
  it("ladder level L is 1050 + 150 (L - 1) and matches the config ladder", () => {
    for (const b of BOT_LADDER) expect(botStrength(b.level, null)).toBe(b.rating);
    expect(botInit(4, null)).toEqual({ level: 4, name: "Did the reading", strength: 1500 });
  });

  it("Echo plays at the player's bot rating minus 75", () => {
    expect(botStrength(-1, 1620)).toBe(1545);
    expect(botStrength(-1, null)).toBe(1425);
    expect(botInit(-1, 1600).name).toBe("Echo");
  });

  it("test bots exist, unknown levels throw", () => {
    expect(botInit(0, null).name).toBe("Dummy");
    expect(botInit(9, null).name).toBe("Perfect Bot");
    expect(() => botInit(12 as never, null)).toThrow();
  });

  it("speed level is clamped to 1..8", () => {
    expect(botSpeed(1050)).toBe(1);
    expect(botSpeed(2100)).toBe(8);
    expect(botSpeed(500)).toBe(1);
    expect(botSpeed(3000)).toBe(8);
    expect(botSpeed(1575)).toBe(4.5);
  });
});

describe("planBot", () => {
  it("draws 3 distinct power-ups, none when power-ups are off", () => {
    for (let s = 0; s < 50; s++) {
      const { loadout } = planBot(botInit(5, null), true, createRng(s));
      expect(loadout).toHaveLength(3);
      expect(new Set(loadout).size).toBe(3);
    }
    expect(planBot(botInit(5, null), false, createRng(1)).loadout).toEqual([]);
  });

  it("smart bots: Bibi in 5..9, Shield by HP", () => {
    for (let s = 0; s < 200; s++) {
      const { plan, loadout } = planBot(botInit(6, null), true, createRng(s));
      if (loadout.includes("bibi")) expect(plan.bibiRound).toBeGreaterThanOrEqual(5);
      if (loadout.includes("bibi")) expect(plan.bibiRound).toBeLessThanOrEqual(9);
      else expect(plan.bibiRound).toBeNull();
      expect(plan.shieldRound).toBeNull();
    }
  });

  it("weak bots (levels 1 to 3) pick every blind round from 1..12", () => {
    const rounds = new Set<number>();
    for (let s = 0; s < 300; s++) {
      const { plan, loadout } = planBot(botInit(2, null), true, createRng(s));
      if (loadout.includes("shield")) expect(plan.shieldRound).not.toBeNull();
      for (const r of [plan.bibiRound, plan.shieldRound]) if (r !== null) rounds.add(r);
    }
    expect(Math.min(...rounds)).toBe(1);
    expect(Math.max(...rounds)).toBe(12);
  });
});

function botState(plan: BotPlan, loadout: PlayerState["loadout"], hp = 6000, used: PlayerState["used"] = []): PlayerState {
  return {
    kind: "bot",
    userId: null,
    name: "b",
    avatarUrl: null,
    hp,
    loadout,
    used,
    connected: true,
    everConnected: true,
    disconnectedSince: null,
    ready: true,
    botRating: plan.strength,
    botRatingN: 0,
    rankedBefore: null,
    bot: plan,
    r: { armed: null, quick: null, answer: null, answeredAt: null, hidden: [] },
  };
}

describe("botArmChoice", () => {
  const plan: BotPlan = { level: 6, strength: 1800, speed: 6, bibiRound: 6, shieldRound: null, q: null };
  const can = (p: PlayerState) => (id: BlindPowerupId) => p.loadout.includes(id) && !p.used.includes(id);

  it("arms nothing before the planned rounds", () => {
    const b = botState(plan, ["bibi", "fifty", "shield"]);
    expect(botArmChoice(b, 5, can(b))).toBeNull();
  });

  it("Bibi wins a tie with Shield, which moves to the next round", () => {
    const weakPlan: BotPlan = { ...plan, level: 2, shieldRound: 6 };
    const b = botState(weakPlan, ["bibi", "fifty", "shield"]);
    expect(botArmChoice(b, 6, can(b))).toBe("bibi");
    const after = botState(weakPlan, ["bibi", "fifty", "shield"], 6000, ["bibi"]);
    expect(botArmChoice(after, 7, can(after))).toBe("shield");
  });

  it("smart Shield arms in the first window below half HP", () => {
    const b = botState({ ...plan, bibiRound: null }, ["shield", "fifty", "fast"], 3500);
    expect(botArmChoice(b, 3, can(b))).toBeNull();
    const low = botState({ ...plan, bibiRound: null }, ["shield", "fifty", "fast"], 2999);
    expect(botArmChoice(low, 3, can(low))).toBe("shield");
  });
});

describe("planBotQuestion", () => {
  const strong: BotPlan = { level: 8, strength: 2100, speed: 8, bibiRound: null, shieldRound: null, q: null };
  const weak: BotPlan = { level: 1, strength: 1050, speed: 1, bibiRound: null, shieldRound: null, q: null };

  it("pKnow is the Elo curve", () => {
    expect(pKnow(1500, 1500)).toBeCloseTo(0.5);
    expect(pKnow(1500, 1900)).toBeCloseTo(1 / 1.1);
  });

  it("answer times stay between the floor and 95% of the timer", () => {
    const q = makeQuestion({ words: 30 });
    const floor = BOT_MODEL.floorBaseMs + BOT_MODEL.floorMsPerWord * 30;
    for (let s = 0; s < 500; s++) {
      for (const plan of [strong, weak]) {
        const p = planBotQuestion(plan, q, 4, 0, 20000, createRng(s));
        expect(p.answerAt).not.toBeNull();
        expect(p.answerAt!).toBeGreaterThanOrEqual(floor);
        expect(p.answerAt!).toBeLessThanOrEqual(19000);
        expect(Number.isInteger(p.answerAt)).toBe(true);
      }
    }
  });

  it("stronger bots know more and answer faster", () => {
    const q = makeQuestion({ rating: 1600 });
    let knowStrong = 0;
    let knowWeak = 0;
    let tStrong = 0;
    let tWeak = 0;
    for (let s = 0; s < 2000; s++) {
      const a = planBotQuestion(strong, q, 1, 0, 20000, createRng(s));
      const b = planBotQuestion(weak, q, 1, 0, 20000, createRng(s + 100000));
      if (a.knows) {
        knowStrong += 1;
        tStrong += a.answerAt!;
      }
      if (b.knows) {
        knowWeak += 1;
        tWeak += b.answerAt!;
      }
    }
    expect(knowStrong / 2000).toBeCloseTo(pKnow(1600, 2100), 1);
    expect(knowWeak / 2000).toBeCloseTo(pKnow(1600, 1050), 1);
    expect(tStrong / knowStrong).toBeLessThan(tWeak / knowWeak);
  });

  it("a known answer is the key; 50:50 only when unsure, Gotta Go Fast only when sure from round 3", () => {
    const q = makeQuestion({ rating: 1500 });
    for (let s = 0; s < 300; s++) {
      const p = planBotQuestion(strong, q, 3, 1000, 20000, createRng(s));
      if (p.knows) {
        expect(isCorrect(q.key, p.answer)).toBe(true);
        expect(p.fiftyAt).toBeNull();
        expect(p.fastAt).toBe(1500);
      } else {
        expect(p.fiftyAt).toBe(2500);
        expect(p.fastAt).toBeNull();
      }
      const early = planBotQuestion(strong, q, 2, 1000, 20000, createRng(s));
      expect(early.fastAt).toBeNull();
    }
  });

  it("no 50:50 on true/false", () => {
    for (let s = 0; s < 100; s++) {
      expect(planBotQuestion(weak, trueFalse(), 1, 0, 15000, createRng(s)).fiftyAt).toBeNull();
    }
  });

  it("test bots: Perfect Bot always right, Dummy always wrong, both at 2 s", () => {
    const fifty: BotPlan = { ...strong, level: 9 };
    const dummy: BotPlan = { ...weak, level: 0 };
    for (const q of [makeQuestion(), multiQ(), trueFalse(false)]) {
      for (let s = 0; s < 30; s++) {
        const a = planBotQuestion(fifty, q, 1, 0, 4000, createRng(s));
        expect(isCorrect(q.key, a.answer)).toBe(true);
        expect(a.answerAt).toBe(2000);
        const b = planBotQuestion(dummy, q, 1, 0, 4000, createRng(s));
        expect(isCorrect(q.key, b.answer)).toBe(false);
        expect(b.answerAt).toBe(2000);
        expect(b.fiftyAt).toBeNull();
      }
    }
  });

  it("scales times with the test-mode timer", () => {
    const q = makeQuestion({ words: 10 });
    const fast = planBotQuestion(strong, q, 1, 0, 4000, createRng(3));
    expect(fast.answerAt!).toBeLessThanOrEqual(3800);
  });
});

describe("randomAnswer", () => {
  it("covers the answer space of each type", () => {
    const r = createRng(1);
    const multis = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const a = randomAnswer(multiQ(), r);
      expect(a.kind).toBe("options");
      if (a.kind === "options") {
        expect(a.ids.length).toBeGreaterThan(0);
        multis.add([...a.ids].sort().join(""));
      }
    }
    expect(multis.size).toBe(15);
    expect(randomAnswer(trueFalse(), r).kind).toBe("bool");
  });

  it("respects excluded options", () => {
    const r = createRng(2);
    for (let i = 0; i < 100; i++) {
      const a = randomAnswer(makeQuestion(), r, ["b", "c"]);
      expect(a.kind === "options" && ["a", "d"].includes(a.ids[0]!)).toBe(true);
    }
  });
});

describe("the ladder", () => {
  it("has the eight student bots, weakest first, 1050 to 2100 in steps of 150", () => {
    expect(BOT_LADDER.map((b) => b.name)).toEqual([
      "Skimmed the slides",
      "Attended once",
      "Has the notes open",
      "Did the reading",
      "Went to every tutorial",
      "Made the flashcards",
      "Asks questions after class",
      "Wrote the exam",
    ]);
    expect(BOT_LADDER.map((b) => b.rating)).toEqual([1050, 1200, 1350, 1500, 1650, 1800, 1950, 2100]);
    for (const b of BOT_LADDER) expect(botInit(b.level, null).strength).toBe(b.rating);
  });
});
