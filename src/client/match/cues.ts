// Which sounds and vibrations a server message triggers. Pure, so it can be
// tested; the controller plays the cues it returns.

import type { ServerMessage } from "@shared/protocol";
import { FX } from "./fx";
import type { MatchUiState } from "./state";

export type SoundName = "thunder" | "shield" | "crack" | "whoosh" | "tick" | "tickLast" | "thud" | "fanfare" | "sting";

export interface Cue {
  sound?: SoundName;
  /** 0..1, scales the sound. */
  intensity?: number;
  /** navigator.vibrate pattern. */
  vibrate?: number[];
  delayMs: number;
}

/** Cues for one message, given the state before it. Snapshots never make noise. */
export function cuesFor(prev: MatchUiState, msg: ServerMessage): Cue[] {
  switch (msg.type) {
    case "banner": {
      const cues: Cue[] = [];
      const active = (p: string) => msg.items.some((i) => i.powerup === p && i.outcome === "active");
      if (msg.items.some((i) => i.outcome === "nemesis_hit" || i.outcome === "cancelled")) {
        cues.push({ sound: "crack", delayMs: 450 });
      }
      if (active("zeus")) cues.push({ sound: "thunder", delayMs: 0, vibrate: [60, 40, 120] });
      if (active("aegis")) cues.push({ sound: "shield", delayMs: active("zeus") ? 350 : 0 });
      if (cues.length === 0) cues.push({ sound: "whoosh", delayMs: 0 });
      return cues;
    }
    case "powerup_result":
      return [{ sound: "whoosh", delayMs: 0 }];
    case "opponent_answered":
      return [{ sound: "tick", delayMs: 0 }];
    case "reveal": {
      if (stalePast(prev, msg.round)) return [];
      const cues: Cue[] = [];
      const toYou = msg.damageToYou;
      const toThem = msg.damageToOpponent;
      const dmg = Math.max(toYou, toThem);
      if (dmg > 0) {
        const intensity = Math.min(1, 0.35 + dmg / (FX.bigHit * 2));
        cues.push({
          sound: "thud",
          intensity,
          delayMs: FX.revealImpactMs,
          vibrate: toYou > 0 ? (toYou > FX.bigHit ? [90, 50, 160] : [70]) : undefined,
        });
      }
      if (msg.aegis && ((msg.aegis === "you" && toYou > 0) || (msg.aegis === "opponent" && toThem > 0))) {
        cues.push({ sound: "shield", delayMs: FX.revealImpactMs + 60 });
      }
      if (msg.phoenix) cues.push({ sound: "whoosh", delayMs: FX.revealImpactMs + FX.phoenixDelayMs });
      return cues;
    }
    case "match_end":
      if (prev.result) return [];
      if (msg.result === "win") return [{ sound: "fanfare", delayMs: 250 }];
      if (msg.result === "loss") return [{ sound: "sting", delayMs: 250 }];
      return [];
    default:
      return [];
  }
}

function stalePast(prev: MatchUiState, round: number): boolean {
  return round < prev.round;
}
