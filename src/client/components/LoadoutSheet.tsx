// Power-up loadout picker: 3 of 6, saved to prefs.
import { useEffect, useState } from "react";
import { POWERUPS } from "@shared/game/config";
import type { PowerupId } from "@shared/game/types";
import { errorMessage } from "../lib/api";
import { isCompleteLoadout, toggleLoadout } from "../lib/loadout";
import { useUpdatePrefs } from "../lib/queries";
import { CheckIcon } from "./icons";
import { POWERUP_ORDER, PowerupIcon, powerupInfo } from "./powerups";
import { Button, FormError, Sheet, cx } from "./ui";

export function LoadoutSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: readonly PowerupId[] }) {
  const [draft, setDraft] = useState<PowerupId[]>([...current]);
  const update = useUpdatePrefs();
  useEffect(() => {
    if (open) {
      setDraft([...current]);
      update.reset();
    }
    // Reset the draft only when the sheet opens.
  }, [open]);

  const full = draft.length >= POWERUPS.loadoutSize;
  const [nudge, setNudge] = useState(false);
  const tap = (id: PowerupId) => {
    if (!draft.includes(id) && full) {
      setNudge(true);
      return;
    }
    setNudge(false);
    setDraft((d) => toggleLoadout(d, id));
  };
  const save = () => {
    if (!isCompleteLoadout(draft)) return;
    update.mutate({ loadout: draft }, { onSuccess: onClose });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Power-ups">
      <p className="mb-1 text-sm text-muted">
        Pick {POWERUPS.loadoutSize}. Each works once per match. Your opponent sees your picks at the start.
      </p>
      <p className="mb-3 text-xs leading-snug text-muted">
        <span className="font-semibold text-text/80">Blind:</span> arm before you see the question.{" "}
        <span className="font-semibold text-text/80">Quick:</span> use after.{" "}
        <span className="font-semibold text-text/80">Passive:</span> works on its own.
      </p>
      <ul className="flex flex-col gap-2">
        {POWERUP_ORDER.map((id) => {
          const info = powerupInfo(id);
          const on = draft.includes(id);
          const blocked = !on && full;
          return (
            <li key={id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => tap(id)}
                className={cx(
                  "flex min-h-tap w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                  on ? "border-you bg-you/10" : "border-border bg-bg/40 hover:border-muted/60",
                  blocked && "opacity-50",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                  <PowerupIcon id={id} size={26} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-display font-bold">{info.name}</span>
                    <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">{info.kind}</span>
                  </span>
                  <span className="block text-sm leading-snug text-muted">{info.effect}</span>
                </span>
                <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full border", on ? "border-you bg-you text-bg" : "border-border")}>
                  {on ? <CheckIcon size={14} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <FormError message={update.error ? errorMessage(update.error) : null} />
      <div className="sticky bottom-0 -mx-4 mt-3 bg-surface px-4 pt-2 pb-1 shadow-[0_-12px_16px_-8px_var(--color-surface)]">
        {nudge ? (
          <p className="mb-2 text-center text-sm text-zeus" role="status">
            Pick {POWERUPS.loadoutSize}. Drop one first.
          </p>
        ) : null}
        <Button className="w-full" onClick={save} disabled={!isCompleteLoadout(draft)} loading={update.isPending}>
          {draft.length < POWERUPS.loadoutSize ? `Pick ${POWERUPS.loadoutSize - draft.length} more` : "Save"}
        </Button>
      </div>
    </Sheet>
  );
}
