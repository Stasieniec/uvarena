// The /dev/match preview. Without parameters it lists the scripted matches and
// screenshot moments. Parameters:
//   scenario=duel|bot|friend   which scripted match
//   side=0|1                   play it as either player
//   autoplay=1                 tap your scripted answers for you
//   moment=<name>              jump to a moment (implies autoplay) and freeze there
//   freeze=0                   keep running after the jump
//   speed=2                    run the clock faster
//   controls=1                 a small toolbar (restart, drop the connection)

import { useCallback, useMemo, useState } from "react";
import type { Side } from "@shared/game/types";
import { MatchView, type MatchNav } from "../MatchView";
import { useMatchController, type MatchActions } from "../useMatch";
import { DevHarness } from "./harness";
import { MOMENTS, SCENARIOS, type Moment } from "./scenarios";
import type { ClientMessage } from "@shared/protocol";

interface Config {
  scenario: string;
  side: Side;
  autoplay: boolean;
  moment: Moment | null;
  freeze: boolean;
  speed: number;
  controls: boolean;
}

function readConfig(search: string): Config | null {
  const p = new URLSearchParams(search);
  if (![...p.keys()].length) return null;
  const moment = p.get("moment") ? (MOMENTS[p.get("moment")!] ?? null) : null;
  const scenario = moment?.scenario ?? p.get("scenario") ?? "duel";
  return {
    scenario: SCENARIOS[scenario] ? scenario : "duel",
    side: (moment?.side ?? (p.get("side") === "1" ? 1 : 0)) as Side,
    autoplay: moment !== null || p.get("autoplay") === "1",
    moment,
    freeze: moment !== null && p.get("freeze") !== "0",
    speed: Math.min(10, Math.max(0.1, Number(p.get("speed")) || 1)),
    controls: p.get("controls") === "1",
  };
}

export default function DevPreview() {
  const config = useMemo(() => readConfig(window.location.search), []);
  const [run, setRun] = useState(0);
  if (!config) return <Index />;
  return <Run key={run} config={config} onRestart={() => setRun((r) => r + 1)} />;
}

function autoTap(actions: MatchActions, msg: ClientMessage): void {
  switch (msg.type) {
    case "arm":
      actions.arm(msg.powerup);
      break;
    case "use":
      actions.use(msg.powerup);
      break;
    case "answer":
      actions.answer(msg.answer);
      break;
    case "surrender":
      actions.surrender();
      break;
    case "ready":
      actions.ready();
      break;
    case "rematch":
      actions.rematch();
      break;
  }
}

function Run({ config, onRestart }: { config: Config; onRestart(): void }) {
  const harness = useMemo(
    () =>
      new DevHarness(SCENARIOS[config.scenario]!, {
        viewer: config.side,
        autoplay: config.autoplay,
        seek: config.moment,
        freeze: config.freeze,
        speed: config.speed,
      }),
    [config],
  );
  const createTransport = useCallback(() => harness, [harness]);
  const { state, actions } = useMatchController(createTransport);
  harness.onAuto = (msg) => autoTap(actions, msg);

  const nav = useMemo<MatchNav>(
    () => ({
      home: () => {
        window.location.search = "";
      },
      playAgain: onRestart,
      missed: () => {
        window.location.search = "";
      },
      match: onRestart,
    }),
    [onRestart],
  );

  return (
    <>
      <MatchView state={state} actions={actions} clock={harness} nav={nav} />
      {config.controls && (
        <div className="fixed bottom-2 left-2 z-[100] flex gap-1 text-xs">
          <button type="button" className="rounded bg-black/80 px-2 py-1 ring-1 ring-white/20" onClick={onRestart}>
            Restart
          </button>
          <button type="button" className="rounded bg-black/80 px-2 py-1 ring-1 ring-white/20" onClick={() => harness.drop(2500)}>
            Drop 2.5 s
          </button>
        </div>
      )}
    </>
  );
}

function Index() {
  return (
    <div className="mx-auto max-w-[30rem] px-4 py-6 text-sm">
      <h1 className="rq-display text-2xl font-bold text-zeus">Match preview</h1>
      <p className="mt-1 text-muted">Scripted matches on the real match screen. No server involved.</p>
      <h2 className="mt-6 mb-2 font-semibold">Play</h2>
      <ul className="flex flex-col gap-1.5">
        {Object.values(SCENARIOS).map((s) => (
          <li key={s.id} className="flex flex-wrap gap-x-3">
            <span className="w-32">{s.title}</span>
            <a className="text-you underline" href={`?scenario=${s.id}`}>
              play
            </a>
            <a className="text-you underline" href={`?scenario=${s.id}&autoplay=1`}>
              watch
            </a>
            <a className="text-you underline" href={`?scenario=${s.id}&side=1&autoplay=1`}>
              watch as opponent
            </a>
          </li>
        ))}
      </ul>
      <h2 className="mt-6 mb-2 font-semibold">Moments</h2>
      <ul className="grid grid-cols-2 gap-1.5">
        {Object.keys(MOMENTS).map((m) => (
          <li key={m}>
            <a className="text-you underline" href={`?moment=${m}`}>
              {m}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
