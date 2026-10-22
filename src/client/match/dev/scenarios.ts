// Scripted matches for the /dev/match preview and the match screen tests.
// "duel" is a ranked match that touches every screen: a speed chip, Oracle,
// Hermes, a Zeus strike over 2,000, Nemesis breaking an Aegis, an opponent
// disconnect, Phoenix on a capped hit, and a win on HP. "bot" is a bot match
// with a fizzled Zeus, an Aegis, your Hermes, a wasted Nemesis and a surrender.
// "friend" is the duel as a private match, starting in the lobby.

import type { Scenario, ScenarioRound } from "./fake-server";

const opts = (...texts: string[]) => texts.map((text, i) => ({ id: "abcdefgh"[i]!, text }));

const DUEL_ROUNDS: ScenarioRound[] = [
  {
    question: {
      type: "truefalse",
      prompt: null,
      statement: "Chess is a deterministic environment.",
      codeLang: null,
      options: [],
      key: { kind: "bool", value: true },
      whyShort: "Each move leads to exactly one next position, with no chance involved.",
    },
    sides: [
      { answer: { kind: "bool", value: true }, answerAtMs: 3000 },
      { answer: { kind: "bool", value: true }, answerAtMs: 6000 },
    ],
  },
  {
    question: {
      type: "single",
      prompt: "In a Nash equilibrium, what is true of each player's strategy?",
      statement: null,
      codeLang: null,
      options: opts(
        "It is a best response to the other players' strategies.",
        "It maximises the sum of all players' payoffs.",
        "It is a dominant strategy.",
        "It guarantees the player's highest possible payoff.",
      ),
      key: { kind: "options", ids: ["a"] },
      whyShort: "In a Nash equilibrium no player gains by changing strategy alone.",
    },
    sides: [
      { answer: { kind: "options", ids: ["a"] }, answerAtMs: 4000 },
      { answer: { kind: "options", ids: ["c"] }, answerAtMs: 8000 },
    ],
  },
  {
    question: {
      type: "multi",
      prompt: "Which step types appear in a ReAct trace?",
      statement: null,
      codeLang: null,
      options: opts("Thought", "Action", "Observation", "Reward"),
      key: { kind: "options", ids: ["a", "b", "c"] },
      whyShort: "A ReAct trace interleaves thoughts, actions and the observations those actions return.",
    },
    sides: [
      { answer: { kind: "options", ids: ["a", "b", "d"] }, answerAtMs: 11500 },
      { quick: "hermes", quickAtMs: 500, answer: { kind: "options", ids: ["a", "b", "c"] }, answerAtMs: 10000 },
    ],
  },
  {
    question: {
      type: "cloze",
      prompt: "In tool calling, the model replies with a tool name and ___ instead of an answer.",
      statement: null,
      codeLang: null,
      options: opts("its arguments", "a reward", "a gradient", "a confidence score"),
      key: { kind: "options", ids: ["a"] },
      whyShort: "The model proposes a call as a name plus arguments; the application runs it.",
    },
    sides: [
      { quick: "oracle", quickAtMs: 2500, answer: { kind: "options", ids: ["a"] }, answerAtMs: 6000 },
      { answer: { kind: "options", ids: ["a"] }, answerAtMs: 5000 },
    ],
  },
  {
    question: {
      type: "single",
      prompt: "A Flask view looks up `item_id`. Which branch answers correctly when the item does not exist?",
      statement: null,
      codeLang: "python",
      options: opts(
        "if item is None:\n    return Response(status=404)",
        "if item is None:\n    return Response(status=500)",
        "if item is None:\n    raise KeyError(item_id)",
        "if not item:\n    return Response(status=200)",
      ),
      key: { kind: "options", ids: ["a"] },
      whyShort: "404 Not Found says the server has no resource at that address.",
    },
    sides: [
      { arm: "zeus", armAtMs: 1500, answer: { kind: "options", ids: ["a"] }, answerAtMs: 5000 },
      { answer: { kind: "options", ids: ["b"] }, answerAtMs: 8500 },
    ],
  },
  {
    question: {
      type: "single",
      prompt: "Which is NOT part of a normal-form game?",
      statement: null,
      codeLang: null,
      options: opts(
        "A set of players",
        "A set of actions for each player",
        "A payoff for each player at each action profile",
        "A fixed order in which the players move",
      ),
      key: { kind: "options", ids: ["d"] },
      whyShort: "A normal-form game lists players, actions and payoffs; move order belongs to the extensive form.",
    },
    sides: [
      { arm: "aegis", armAtMs: 1000, answer: { kind: "options", ids: ["b"] }, answerAtMs: 7000 },
      { arm: "nemesis", armAtMs: 2000, answer: { kind: "options", ids: ["d"] }, answerAtMs: 4000 },
    ],
  },
  {
    question: {
      type: "truefalse",
      prompt: null,
      statement: "A pure strategy is a special case of a mixed strategy.",
      codeLang: null,
      options: [],
      key: { kind: "bool", value: true },
      whyShort: "A pure strategy is a mixed strategy that puts probability 1 on one action.",
    },
    sides: [{ answer: { kind: "bool", value: true }, answerAtMs: 3000 }, {}],
  },
  {
    question: {
      type: "single",
      prompt: "What does a rational agent choose?",
      statement: null,
      codeLang: null,
      options: opts(
        "The action that maximises its expected performance measure",
        "The action that always turns out best",
        "The action a human expert would take",
      ),
      key: { kind: "options", ids: ["a"] },
      whyShort: "A rational agent picks the action with the best expected performance, given what it knows.",
    },
    sides: [
      { answer: { kind: "options", ids: ["a"] }, answerAtMs: 6000 },
      { answer: { kind: "options", ids: ["a"] }, answerAtMs: 3000 },
    ],
  },
  {
    question: {
      type: "multi",
      prompt: "Which problems come from several agents learning at the same time?",
      statement: null,
      codeLang: null,
      options: opts(
        "The environment looks non-stationary to each agent.",
        "Credit for a shared reward is hard to assign.",
        "Every agent must have a different reward function.",
        "Agents can no longer observe anything.",
      ),
      key: { kind: "options", ids: ["a", "b"] },
      whyShort: "Other learners keep changing their behaviour, and a shared reward does not say who earned it.",
    },
    sides: [
      { answer: { kind: "options", ids: ["a", "b"] }, answerAtMs: 8000 },
      { answer: { kind: "options", ids: ["a", "b", "c"] }, answerAtMs: 12000 },
    ],
  },
  {
    question: {
      type: "truefalse",
      prompt: null,
      statement: "Self-play trains an agent against copies of itself.",
      codeLang: null,
      options: [],
      key: { kind: "bool", value: true },
      whyShort: "In self-play the agent's opponents are current or past versions of itself.",
    },
    sides: [
      { answer: { kind: "bool", value: true }, answerAtMs: 2000 },
      { answer: { kind: "bool", value: false }, answerAtMs: 4000 },
    ],
  },
];

const BOT_ROUNDS: ScenarioRound[] = [
  {
    question: {
      type: "single",
      prompt: "Which Prometheus metric type fits the memory a service is using right now?",
      statement: null,
      codeLang: null,
      options: opts("Gauge", "Counter", "Histogram"),
      key: { kind: "options", ids: ["a"] },
      whyShort: "A gauge is a value that can go up and down, such as current memory use.",
    },
    sides: [
      { answer: { kind: "options", ids: ["a"] }, answerAtMs: 3000 },
      { arm: "zeus", armAtMs: 900, answer: { kind: "options", ids: ["a"] }, answerAtMs: 6000 },
    ],
  },
  {
    question: {
      type: "truefalse",
      prompt: null,
      statement: "Spark runs a transformation as soon as it is defined.",
      codeLang: null,
      options: [],
      key: { kind: "bool", value: false },
      whyShort: "Spark evaluates lazily and runs transformations only when an action needs a result.",
    },
    sides: [
      { quick: "hermes", quickAtMs: 800, answer: { kind: "bool", value: false }, answerAtMs: 2500 },
      { arm: "aegis", armAtMs: 1000, answer: { kind: "bool", value: false }, answerAtMs: 4400 },
    ],
  },
  {
    question: {
      type: "cloze",
      prompt: "Spark records transformations without running them, and starts computing only when ___ asks for a result.",
      statement: null,
      codeLang: null,
      options: opts("an action", "a transformation", "a repartition"),
      key: { kind: "options", ids: ["a"] },
      whyShort: "Waiting for an action lets Spark see the whole job and optimise it before running it.",
    },
    sides: [
      { arm: "nemesis", armAtMs: 1500, answer: { kind: "options", ids: ["b"] }, answerAtMs: 7000 },
      { quick: "oracle", quickAtMs: 1500, answer: { kind: "options", ids: ["a"] }, answerAtMs: 5000 },
    ],
  },
  {
    question: {
      type: "multi",
      prompt: "Which of these are among the FIRST properties of good unit tests?",
      statement: null,
      codeLang: null,
      options: opts("Fast", "Isolated", "Repeatable", "Exhaustive"),
      key: { kind: "options", ids: ["a", "b", "c"] },
      whyShort: "Good unit tests are fast, isolated, repeatable, self-validating and timely.",
    },
    sides: [{}, { answer: { kind: "options", ids: ["a", "b", "c"] }, answerAtMs: 9000 }],
  },
];

// Crowded questions for the small-phone layout: five long multiple-select
// options with a long explanation (both wrong, your Zeus fizzles), and a long
// single choice.
const DENSE_ROUNDS: ScenarioRound[] = [
  {
    question: {
      type: "multi",
      prompt: "Which findings does the ReAct paper report for prompting PaLM-540B?",
      statement: null,
      codeLang: null,
      options: opts(
        "A frequent ReAct error was repeating earlier thoughts and actions in a loop.",
        "On HotpotQA, hallucination was a far bigger problem for chain-of-thought than for ReAct.",
        "ReAct alone scored higher than chain-of-thought on HotpotQA.",
        "Combining ReAct with self-consistency chain-of-thought gave the best prompting results.",
        "ReAct needed fine-tuning before it beat acting-only prompting.",
      ),
      key: { kind: "options", ids: ["a", "b", "d"] },
      whyShort:
        "ReAct hallucinated far less than chain-of-thought but got stuck repeating itself, scored below it on HotpotQA alone, and did best combined with self-consistency.",
    },
    sides: [
      { arm: "zeus", armAtMs: 900, answer: { kind: "options", ids: ["c"] }, answerAtMs: 7000 },
      { answer: { kind: "options", ids: ["b", "c", "d"] }, answerAtMs: 9700 },
    ],
  },
  {
    question: {
      type: "single",
      prompt:
        "A model behind an API keeps its median latency flat, but its p99 latency climbs every time traffic spikes. The team has one sprint. Which change most directly targets the cause?",
      statement: null,
      codeLang: null,
      options: opts(
        "Autoscale replicas on queue depth, so requests stop waiting behind a full batch.",
        "Retrain the model on more recent data to improve its accuracy.",
        "Log every request body so the slow ones can be replayed later.",
        "Move the model weights to a faster object store in another region.",
      ),
      key: { kind: "options", ids: ["a"] },
      whyShort: "Tail latency that grows with load is queueing; adding capacity when the queue grows removes the wait.",
    },
    sides: [
      { answer: { kind: "options", ids: ["a"] }, answerAtMs: 6000 },
      { answer: { kind: "options", ids: ["c"] }, answerAtMs: 9000 },
    ],
  },
];

/** A ladder win: you answer fast, the bot never does, and round 6 knocks it out. */
const BOTWIN_ROUNDS: ScenarioRound[] = DUEL_ROUNDS.slice(0, 7).map((r) => ({
  question: r.question,
  sides: [{ answer: r.question.key, answerAtMs: 800 }, {}],
}));

const ECHO_PLAYER = {
  userId: null,
  kind: "bot",
  name: "Echo",
  avatarUrl: null,
  botLevel: -1,
  loadout: ["zeus", "aegis", "oracle"],
  rating: { value: 1500, provisional: true },
  ratingChange: null,
} as const;

export const SCENARIOS: Record<string, Scenario> = {
  duel: {
    id: "duel",
    title: "Ranked duel",
    matchId: "dev-duel",
    courseId: "agai",
    mode: "ranked",
    rated: true,
    players: [
      {
        userId: "u-stas",
        kind: "human",
        name: "stas",
        avatarUrl: null,
        botLevel: null,
        loadout: ["zeus", "aegis", "oracle"],
        rating: { value: 1540, provisional: true },
        ratingChange: { before: 1540, after: 1702, provisional: true },
      },
      {
        userId: "u-kvdberg",
        kind: "human",
        name: "kvdberg",
        avatarUrl: null,
        botLevel: null,
        loadout: ["nemesis", "hermes", "phoenix"],
        rating: { value: 1612, provisional: false },
        ratingChange: { before: 1612, after: 1588, provisional: false },
      },
    ],
    rounds: DUEL_ROUNDS,
    disconnects: [{ side: 1, round: 7, afterShownMs: 1000, backAtRound: 8 }],
  },
  bot: {
    id: "bot",
    title: "Bot match",
    matchId: "dev-bot",
    courseId: "eprm",
    mode: "bot",
    rated: true,
    players: [
      {
        userId: "u-stas",
        kind: "human",
        name: "stas",
        avatarUrl: null,
        botLevel: null,
        loadout: ["nemesis", "hermes", "phoenix"],
        rating: { value: 1480, provisional: false },
        ratingChange: { before: 1480, after: 1466, provisional: false },
      },
      {
        userId: null,
        kind: "bot",
        name: "Athena",
        avatarUrl: null,
        botLevel: 7,
        loadout: ["zeus", "aegis", "oracle"],
        rating: { value: 1950, provisional: false },
        ratingChange: null,
      },
    ],
    rounds: BOT_ROUNDS,
    surrender: { side: 0, round: 4, afterShownMs: 4000 },
  },
  friend: {
    id: "friend",
    title: "Private match",
    matchId: "dev-friend",
    courseId: "agai",
    mode: "private",
    rated: true,
    players: [
      {
        userId: "u-stas",
        kind: "human",
        name: "stas",
        avatarUrl: null,
        botLevel: null,
        loadout: ["zeus", "aegis", "oracle"],
        rating: { value: 1540, provisional: true },
        ratingChange: { before: 1540, after: 1702, provisional: true },
      },
      {
        userId: "u-filip",
        kind: "human",
        name: "filip.p",
        avatarUrl: null,
        botLevel: null,
        loadout: ["nemesis", "hermes", "phoenix"],
        rating: { value: 1500, provisional: true },
        ratingChange: { before: 1500, after: 1338, provisional: true },
      },
    ],
    rounds: DUEL_ROUNDS,
    lobby: { code: "K7Q4MX", joinAtMs: 1500, readyAtMs: [3500, 2500] },
  },
  waiting: {
    id: "waiting",
    title: "Ranked, opponent late",
    matchId: "dev-waiting",
    courseId: "agai",
    mode: "ranked",
    rated: true,
    players: [
      {
        userId: "u-stas",
        kind: "human",
        name: "stas",
        avatarUrl: null,
        botLevel: null,
        loadout: ["zeus", "aegis", "oracle"],
        rating: { value: 1540, provisional: true },
        ratingChange: { before: 1540, after: 1702, provisional: true },
      },
      {
        userId: "u-tomek",
        kind: "human",
        name: "tomek",
        avatarUrl: null,
        botLevel: null,
        loadout: ["nemesis", "hermes", "phoenix"],
        rating: { value: 1588, provisional: false },
        ratingChange: { before: 1588, after: 1570, provisional: false },
      },
    ],
    rounds: DUEL_ROUNDS,
    waiting: { connectAtMs: 6000 },
  },
  dense: {
    id: "dense",
    title: "Crowded questions",
    matchId: "dev-dense",
    courseId: "agai",
    mode: "bot",
    rated: true,
    players: [
      {
        userId: "u-zoe",
        kind: "human",
        name: "zoe",
        avatarUrl: null,
        botLevel: null,
        loadout: ["zeus", "oracle", "hermes"],
        rating: { value: 1500, provisional: true },
        ratingChange: { before: 1500, after: 1462, provisional: true },
      },
      { ...ECHO_PLAYER, loadout: [...ECHO_PLAYER.loadout], rating: { ...ECHO_PLAYER.rating } },
    ],
    rounds: DENSE_ROUNDS,
  },
  botwin: {
    id: "botwin",
    title: "Ladder win",
    matchId: "dev-botwin",
    courseId: "agai",
    mode: "bot",
    rated: true,
    players: [
      {
        userId: "u-stas",
        kind: "human",
        name: "stas",
        avatarUrl: null,
        botLevel: null,
        loadout: ["zeus", "aegis", "oracle"],
        rating: { value: 1500, provisional: true },
        ratingChange: { before: 1500, after: 1376, provisional: true },
      },
      {
        userId: null,
        kind: "bot",
        name: "Narcissus",
        avatarUrl: null,
        botLevel: 2,
        loadout: ["zeus", "aegis", "oracle"],
        rating: { value: 1200, provisional: false },
        ratingChange: null,
      },
    ],
    rounds: BOTWIN_ROUNDS,
  },
};

/** Named moments for screenshots: a phase in a round, plus ms into it. */
export interface Moment {
  scenario: keyof typeof SCENARIOS;
  side?: 0 | 1;
  round: number;
  phase: "lobby" | "intro" | "arming" | "banner" | "question" | "reveal" | "finished";
  offsetMs: number;
}

export const MOMENTS: Record<string, Moment> = {
  lobby: { scenario: "friend", round: 0, phase: "lobby", offsetMs: 2000 },
  intro: { scenario: "duel", round: 0, phase: "intro", offsetMs: 1500 },
  arming: { scenario: "duel", round: 5, phase: "arming", offsetMs: 700 },
  armed: { scenario: "duel", round: 5, phase: "arming", offsetMs: 2200 },
  zeus: { scenario: "duel", round: 5, phase: "banner", offsetMs: 450 },
  "zeus-them": { scenario: "duel", side: 1, round: 5, phase: "banner", offsetMs: 450 },
  nemesis: { scenario: "duel", round: 6, phase: "banner", offsetMs: 1000 },
  aegis: { scenario: "bot", round: 2, phase: "banner", offsetMs: 600 },
  "nemesis-wasted": { scenario: "bot", round: 3, phase: "banner", offsetMs: 700 },
  "zeus-bot": { scenario: "bot", round: 1, phase: "banner", offsetMs: 450 },
  truefalse: { scenario: "duel", round: 1, phase: "question", offsetMs: 2000 },
  question: { scenario: "duel", round: 2, phase: "question", offsetMs: 2500 },
  multi: { scenario: "duel", round: 3, phase: "question", offsetMs: 6000 },
  "opponent-answered": { scenario: "duel", round: 3, phase: "question", offsetMs: 10600 },
  cloze: { scenario: "duel", round: 4, phase: "question", offsetMs: 1500 },
  oracle: { scenario: "duel", round: 4, phase: "question", offsetMs: 3000 },
  code: { scenario: "duel", round: 5, phase: "question", offsetMs: 2000 },
  not: { scenario: "duel", round: 6, phase: "question", offsetMs: 2000 },
  "last-seconds": { scenario: "duel", round: 6, phase: "question", offsetMs: 5800 },
  hermes: { scenario: "bot", round: 2, phase: "question", offsetMs: 1100 },
  reveal: { scenario: "duel", round: 2, phase: "reveal", offsetMs: 2600 },
  "speed-hit": { scenario: "duel", round: 1, phase: "reveal", offsetMs: 1200 },
  "big-hit": { scenario: "duel", round: 5, phase: "reveal", offsetMs: 1150 },
  "big-hit-taken": { scenario: "duel", side: 1, round: 5, phase: "reveal", offsetMs: 1150 },
  "wrong-reveal": { scenario: "duel", round: 6, phase: "reveal", offsetMs: 2600 },
  fizzle: { scenario: "bot", round: 1, phase: "reveal", offsetMs: 2000 },
  disconnected: { scenario: "duel", round: 7, phase: "question", offsetMs: 2500 },
  phoenix: { scenario: "duel", round: 9, phase: "reveal", offsetMs: 1500 },
  end: { scenario: "duel", round: 10, phase: "finished", offsetMs: 2500 },
  "end-loss": { scenario: "duel", side: 1, round: 10, phase: "finished", offsetMs: 2500 },
  "end-bot": { scenario: "bot", round: 4, phase: "finished", offsetMs: 2500 },
  found: { scenario: "waiting", round: 0, phase: "lobby", offsetMs: 2500 },
  "found-intro": { scenario: "waiting", round: 0, phase: "intro", offsetMs: 300 },
  "dense-question": { scenario: "dense", round: 1, phase: "question", offsetMs: 3000 },
  "dense-reveal": { scenario: "dense", round: 1, phase: "reveal", offsetMs: 2600 },
  "long-single": { scenario: "dense", round: 2, phase: "question", offsetMs: 2000 },
  "long-single-reveal": { scenario: "dense", round: 2, phase: "reveal", offsetMs: 2600 },
  "damage-x2": { scenario: "duel", round: 6, phase: "arming", offsetMs: 900 },
  "damage-x3": { scenario: "duel", round: 8, phase: "arming", offsetMs: 900 },
  "x3-question": { scenario: "duel", round: 8, phase: "question", offsetMs: 2000 },
  knockout: { scenario: "botwin", round: 6, phase: "reveal", offsetMs: 2200 },
  "knockout-loss": { scenario: "duel", side: 1, round: 10, phase: "reveal", offsetMs: 2200 },
  "end-bot-win": { scenario: "botwin", round: 6, phase: "finished", offsetMs: 2500 },
};
