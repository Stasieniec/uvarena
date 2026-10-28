// The preview's scripted matches and the real engine, both driven through the
// match screen's store: every frame parses, the screen state follows the
// match to its end, and HP on screen matches the server's.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MATCH } from "@shared/game/config";
import type { Side } from "@shared/game/types";
import { ServerMessageSchema, type ClientMessage, type ServerMessage } from "@shared/protocol";
import { BankFileSchema } from "@shared/question-schema";
import { EngineHarness, questionsFromBank } from "../../../src/client/match/dev/engine-harness";
import { FakeMatchServer, type ServerEvent } from "../../../src/client/match/dev/fake-server";
import { DevHarness } from "../../../src/client/match/dev/harness";
import { MOMENTS, SCENARIOS } from "../../../src/client/match/dev/scenarios";
import { MatchStore } from "../../../src/client/match/state";

function playScenario(id: string, viewer: Side) {
  const scenario = SCENARIOS[id]!;
  const server = new FakeMatchServer(scenario, { scripted: [true, true], autoplay: [false, false] }, 1_000_000);
  const store = new MatchStore();
  const frames: ServerMessage[] = [];
  const take = (evs: ServerEvent[]) => {
    for (const e of evs) {
      if (e.kind !== "msg" || e.to !== viewer) continue;
      expect(ServerMessageSchema.safeParse(e.msg).success, e.msg.type).toBe(true);
      frames.push(e.msg);
      store.dispatch({ type: "server", msg: e.msg });
    }
  };
  take(server.start());
  for (let i = 0; i < 5000; i++) {
    const at = server.nextAt();
    if (at === null) break;
    take(server.advance(at));
  }
  return { store, frames };
}

describe("scripted preview matches", () => {
  it("the ranked duel ends in a win on HP, and the loser sees the mirror", () => {
    const a = playScenario("duel", 0).store.getState();
    expect(a.phase).toBe("finished");
    expect(a.result).toMatchObject({ result: "win", reason: "hp", hp: { you: 3117, opponent: 0 }, rounds: 9 });
    const b = playScenario("duel", 1).store.getState();
    expect(b.result).toMatchObject({ result: "loss", hp: { you: 0, opponent: 3117 } });
  });

  it("the duel touches every banner, a disconnect and a cap", () => {
    const { frames } = playScenario("duel", 0);
    const banners = frames.flatMap((f) => (f.type === "banner" ? f.items : []));
    expect(banners).toContainEqual({ who: "you", powerup: "bibi" });
    expect(banners).toContainEqual({ who: "opponent", powerup: "bibi" });
    expect(banners).toContainEqual({ who: "you", powerup: "shield" });
    const reveals = frames.filter((f) => f.type === "reveal");
    expect(reveals.some((r) => r.type === "reveal" && r.capped)).toBe(true);
    expect(reveals.some((r) => r.type === "reveal" && r.damageToOpponent > 2000)).toBe(true);
    expect(frames.some((f) => f.type === "opponent_connection" && !f.connected)).toBe(true);
    expect(frames.some((f) => f.type === "opponent_powerup" && f.powerup === "fast")).toBe(true);
    expect(frames.some((f) => f.type === "powerup_result" && f.powerup === "fifty" && f.hidden.length === 2)).toBe(true);
  });

  it("the bot match ends in a surrender, the private match starts in the lobby", () => {
    const bot = playScenario("bot", 0).store.getState();
    expect(bot.result).toMatchObject({ result: "loss", reason: "surrender" });
    expect(bot.result?.bot).not.toBeNull();
    const friend = playScenario("friend", 0);
    expect(friend.frames[0]?.type).toBe("lobby");
    expect(friend.store.getState().result?.result).toBe("win");
  });

  it("every screenshot moment is reachable", () => {
    for (const [name, m] of Object.entries(MOMENTS)) {
      const h = new DevHarness(SCENARIOS[m.scenario]!, { viewer: m.side ?? 0, autoplay: true, seek: m, freeze: true, speed: 1 });
      const store = new MatchStore();
      h.onAuto = (msg: ClientMessage) => {
        // What the screen's actions do: the optimistic local step, then send.
        const s = store.getState();
        if (msg.type === "answer") store.dispatch({ type: "local_answer", round: s.round, answer: msg.answer });
        if (msg.type === "arm") store.dispatch({ type: "local_arm", round: s.round, powerup: msg.powerup });
        h.send(msg);
      };
      h.start({ onMessage: (msg) => store.dispatch({ type: "server", msg }), onStatus: (status) => store.dispatch({ type: "status", status }) });
      const s = store.getState();
      expect(s.phase, name).toBe(m.phase);
      if (m.round > 0) expect(s.round, name).toBe(m.round);
      h.stop();
    }
  });
});

describe("the real engine through the match screen store", () => {
  it("plays a bot match to the end screen", () => {
    const bank = BankFileSchema.parse(JSON.parse(readFileSync(new URL("../../fixtures/questions.json", import.meta.url), "utf8")));
    const questions = questionsFromBank(bank, "agai").slice(0, MATCH.questionsPerMatch);
    let now = 1_800_000_000_000;
    const timers: { at: number; fn: () => void }[] = [];
    const harness = new EngineHarness({
      questions,
      botLevel: 4,
      loadout: ["bibi", "shield", "fifty"],
      seed: 7,
      now: () => now,
      schedule: (fn, ms) => {
        const t = { at: now + ms, fn };
        timers.push(t);
        return t;
      },
      cancel: (h) => {
        const i = timers.indexOf(h as (typeof timers)[number]);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    const store = new MatchStore();
    const types = new Set<string>();
    let reveals = 0;
    let armedBibi = false;
    harness.start({
      onStatus: (status) => store.dispatch({ type: "status", status }),
      onMessage: (msg) => {
        expect(ServerMessageSchema.safeParse(msg).success, msg.type).toBe(true);
        store.dispatch({ type: "server", msg });
        const s = store.getState();
        if (msg.type === "question") {
          types.add(s.question!.type);
          expect(s.question!.type).toBe(harness.state!.q!.question.type);
        }
        if (msg.type === "reveal") {
          reveals++;
          expect(s.you!.hp).toBe(harness.state!.players[0].hp);
          expect(s.opponent!.hp).toBe(harness.state!.players[1]!.hp);
        }
      },
    });
    // The player: arms Bibi once from round 5, answers the first option 1.5 s into each question.
    for (let guard = 0; guard < 2000 && timers.length; guard++) {
      timers.sort((a, b) => a.at - b.at);
      const s = store.getState();
      if (s.phase === "arming" && s.round >= 5 && !armedBibi) {
        armedBibi = true;
        store.dispatch({ type: "local_arm", round: s.round, powerup: "bibi" });
        harness.send({ type: "arm", round: s.round, powerup: "bibi" });
      }
      if (s.phase === "question" && s.question && !s.yourAnswer && now >= s.question.shownAt + 1500) {
        const q = s.question;
        const answer = q.type === "truefalse" ? { kind: "bool" as const, value: true } : { kind: "options" as const, ids: [q.options[0]!.id] };
        store.dispatch({ type: "local_answer", round: s.round, answer });
        harness.send({ type: "answer", round: s.round, answer });
        continue;
      }
      const next = timers[0]!;
      const answerAt = s.phase === "question" && s.question && !s.yourAnswer ? s.question.shownAt + 1500 : Infinity;
      if (answerAt < next.at) {
        now = answerAt;
        continue;
      }
      timers.shift();
      now = Math.max(now, next.at);
      next.fn();
    }
    const end = store.getState();
    expect(end.phase).toBe("finished");
    expect(end.result).not.toBeNull();
    expect(end.result!.rounds).toBe(reveals);
    expect(end.you!.used).toContain("bibi");
    expect(types.size).toBeGreaterThan(1);
  });
});
