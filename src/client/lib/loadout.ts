// Loadout picking (3 of 6). Pure, unit tested.
import { POWERUPS } from "@shared/game/config";
import { POWERUP_IDS, type PowerupId } from "@shared/game/types";

/** Toggles a power-up in a loadout being picked. A full loadout ignores new picks. */
export function toggleLoadout(current: readonly PowerupId[], id: PowerupId): PowerupId[] {
  if (current.includes(id)) return current.filter((p) => p !== id);
  if (current.length >= POWERUPS.loadoutSize) return [...current];
  return [...current, id];
}

/** A complete loadout: the right size, distinct, known ids. */
export function isCompleteLoadout(ids: readonly string[]): ids is PowerupId[] {
  return (
    ids.length === POWERUPS.loadoutSize &&
    new Set(ids).size === ids.length &&
    ids.every((id) => (POWERUP_IDS as readonly string[]).includes(id))
  );
}
