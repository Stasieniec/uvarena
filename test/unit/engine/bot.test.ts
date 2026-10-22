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
    expect(botInit(4, null)).toEqual({ level: 4, name: "Pandora", strength: 1500 });
  });

  it("Echo plays at the player's bot rating minus 75", () => {
    expect(botStrength(-1, 1620)).toBe(1545);
    expect(botStrength(-1, null)).toBe(1425);
    expect(botInit(-1, 1600).name).toBe("Echo");
  });

  it("test bots exist, unknown levels throw", () => {
    expect(botInit(0, null).name).toBe("Dummy");
    expect(botInit(9, null).name).toBe("Oracle Bot");
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

  it("smart bots: Zeus in 5..9, Nemesis in 3..8, Aegis by HP", () => {
    for (let s = 0; s < 200; s++) {
      const { plan, loadout } = planBot(botInit(6, null), true, createRng(s));
      if (loadout.includes("zeus")) expect(plan.zeusRound).toBeGreaterThanOrEqual(5);
      if (loadout.includes("zeus")) expect(plan.zeusRound).toBeLessThanOrEqual(9);
      else expect(plan.zeusRound).toBeNull();
      if (loadout.includes("nemesis")) expect(plan.nemesisRound).toBeGreaterThanOrEqual(3);
      if (loadout.includes("nemesis")) expect(plan.nemesisRound).toBeLessThanOrEqual(8);
      expect(plan.aegisRound).toBeNull();
    }
  });

  it("weak bots (levels 1 to 3) pick every blind round from 1..12", () => {
    const rounds = new Set<number>();
    for (let s = 0; s < 300; s++) {
      const { plan, loadout } = planBot(botInit(2, null), true, createRng(s));
      if (loadout.includes("aegis")) expect(plan.aegisRound).not.toBeNull();
      for (const r of [plan.zeusRound, plan.nemesisRound, plan.aegisRound]) if (r !== null) rounds.add(r);
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
    phoenixUsed: false,
    connected: true,
    everConnected: true,
    disconnectedSince: null,
    ready: true,
    botRating: plan.strength,
    botRatingN: 0,
    rankedBefore: null,
    bot: plan,
    r: { armed: null, effective: null, nemesisAgainst: false, quick: null, answer: null, answeredAt: null, hidden: [] },
  };
}

describe("botArmChoice", () => {
  const plan: BotPlan = { level: 6, strength: 1800, speed: 6, zeusRound: 6, nemesisRound: 6, aegisRound: null, q: null };
  const can = (p: PlayerState) => (id: BlindPowerupId) => p.loadout.includes(id) && !p.used.includes(id);

  it("arms nothing before the planned rounds", () => {
    const b = botState(plan, ["zeus", "nemesis", "aegis"]);
    expect(botArmChoice(b, 5, can(b))).toBeNull();
  });

  it("Zeus wins a tie with Nemesis, which moves to the next round", () => {
    const b = botState(plan, ["zeus", "nemesis", "aegis"]);
    expect(botArmChoice(b, 6, can(b))).toBe("zeus");
    const after = botState(plan, ["zeus", "nemesis", "aegis"], 6000, ["zeus"]);
    expect(botArmChoice(after, 7, can(after))).toBe("nemesis");
  });

  it("smart Aegis arms in the first window below half HP", () => {
    const b = botState({ ...plan, zeusRound: null, nemesisRound: null }, ["aegis", "oracle", "hermes"], 3500);
    expect(botArmChoice(b, 3, can(b))).toBeNull();
    const low = botState({ ...plan, zeusRound: null, nemesisRound: null }, ["aegis", "oracle", "hermes"], 2999);
    expect(botArmChoice(low, 3, can(low))).toBe("aegis");
  });
});

describe("planBotQuestion", () => {
  const strong: BotPlan = { level: 8, strength: 2100, speed: 8, zeusRound: null, nemesisRound: null, aegisRound: null, q: null };
  const weak: BotPlan = { level: 1, strength: 1050, speed: 1, zeusRound: null, nemesisRound: null, aegisRound: null, q: null };

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

  it("a known answer is the key; Oracle only when unsure, Hermes only when sure from round 3", () => {
    const q = makeQuestion({ rating: 1500 });
    for (let s = 0; s < 300; s++) {
      const p = planBotQuestion(strong, q, 3, 1000, 20000, createRng(s));
      if (p.knows) {
        expect(isCorrect(q.key, p.answer)).toBe(true);
        expect(p.oracleAt).toBeNull();
        expect(p.hermesAt).toBe(1500);
      } else {
        expect(p.oracleAt).toBe(2500);
        expect(p.hermesAt).toBeNull();
      }
      const early = planBotQuestion(strong, q, 2, 1000, 20000, createRng(s));
      expect(early.hermesAt).toBeNull();
    }
  });

  it("no Oracle on true/false", () => {
    for (let s = 0; s < 100; s++) {
      expect(planBotQuestion(weak, trueFalse(), 1, 0, 15000, createRng(s)).oracleAt).toBeNull();
    }
  });

  it("test bots: Oracle Bot always right, Dummy always wrong, both at 2 s", () => {
    const oracle: BotPlan = { ...strong, level: 9 };
    const dummy: BotPlan = { ...weak, level: 0 };
    for (const q of [makeQuestion(), multiQ(), trueFalse(false)]) {
      for (let s = 0; s < 30; s++) {
        const a = planBotQuestion(oracle, q, 1, 0, 4000, createRng(s));
        expect(isCorrect(q.key, a.answer)).toBe(true);
        expect(a.answerAt).toBe(2000);
        const b = planBotQuestion(dummy, q, 1, 0, 4000, createRng(s));
        expect(isCorrect(q.key, b.answer)).toBe(false);
        expect(b.answerAt).toBe(2000);
        expect(b.oracleAt).toBeNull();
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
