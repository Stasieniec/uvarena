// Power-up picker: a full screen with Hades-style rows, 3 of 4. Picks save on
// tap whenever three are picked; Done closes. The API is the old bottom
// sheet's (open, onClose, current), so every caller keeps working.
import { useEffect, useRef, useState } from "react";
import { POWERUPS } from "@shared/game/config";
import type { PowerupId } from "@shared/game/types";
import { errorMessage } from "../lib/api";
import { isCompleteLoadout, toggleLoadout } from "../lib/loadout";
import { useUpdatePrefs } from "../lib/queries";
import { BackIcon, CheckIcon } from "./icons";
import { POWERUP_ORDER, PowerupEffect, PowerupIcon, powerupInfo } from "./powerups";
import { Button, FormError, Spinner, cx } from "./ui";

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five"];

function sameSet(a: readonly PowerupId[], b: readonly PowerupId[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function LoadoutSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: readonly PowerupId[] }) {
  const [draft, setDraft] = useState<PowerupId[]>([...current]);
  const [nudge, setNudge] = useState(false);
  const saved = useRef<readonly PowerupId[]>(current);
  const panel = useRef<HTMLDivElement>(null);
  const update = useUpdatePrefs();

  useEffect(() => {
    if (!open) return;
    setDraft([...current]);
    setNudge(false);
    saved.current = current;
    update.reset();
    // Reset the draft only when the picker opens.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const size = POWERUPS.loadoutSize;
  const full = draft.length >= size;
  const tap = (id: PowerupId) => {
    if (!draft.includes(id) && full) {
      setNudge(true);
      return;
    }
    setNudge(false);
    const next = toggleLoadout(draft, id);
    setDraft(next);
    // Picks save on tap, as soon as the loadout is complete again.
    if (isCompleteLoadout(next) && !sameSet(next, saved.current)) {
      update.mutate({ loadout: next }, { onSuccess: () => (saved.current = next) });
    }
  };
  const missing = size - draft.length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Power-ups">
      <div ref={panel} tabIndex={-1} className="mx-auto flex min-h-full max-w-column flex-col outline-none">
        <header className="flex h-14 flex-none items-center gap-1 px-1">
          <button type="button" onClick={onClose} className="flex size-11 items-center justify-center text-text" aria-label="Back">
            <BackIcon size={22} />
          </button>
          <h1 className="font-display min-w-0 flex-1 truncate text-[28px] leading-8 font-bold">Power-ups</h1>
          <span className="flex items-center gap-2 pr-3 text-sm leading-5 text-muted" aria-live="polite">
            {update.isPending ? <Spinner size={14} /> : null}
            {draft.length} of {POWERUP_ORDER.length}
          </span>
        </header>
        <div className="flex flex-1 flex-col gap-2.5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p className="mb-1.5 text-[15px] leading-[22px] text-muted">
            Pick {WORDS[size]?.toLowerCase() ?? size}. Each works once per match. Your opponent sees your {WORDS[size]?.toLowerCase() ?? size} before round 1.
          </p>
          {POWERUP_ORDER.map((id) => {
            const info = powerupInfo(id);
            const on = draft.includes(id);
            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => tap(id)}
                className={cx(
                  "flex min-h-[88px] w-full items-center gap-3.5 rounded-sm py-3 pr-3.5 pl-3 text-left",
                  on ? "plate press" : "bg-transparent shadow-[inset_0_0_0_1px_var(--color-line)]",
                )}
              >
                {/* The diamond: a rotated square, yellow when picked, a faint outline when not. */}
                <span aria-hidden className="relative flex size-12 shrink-0 items-center justify-center">
                  <span className={cx("absolute size-[34px] rotate-45", on ? "bg-event" : "shadow-[inset_0_0_0_2px_var(--color-faint)]")} />
                  <PowerupIcon id={id} size={20} className={cx("relative", on ? "text-bg" : "text-muted")} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className={cx("text-[17px] leading-[22px] font-semibold", !on && "text-muted")}>{info.name}</span>
                    <span className="text-sm leading-5 text-muted">{info.kind}</span>
                  </span>
                  <span className="text-sm leading-5 text-muted">
                    <PowerupEffect id={id} />
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cx(
                    "flex size-6 shrink-0 items-center justify-center rounded-sm",
                    on ? "bg-text text-bg" : "shadow-[inset_0_0_0_2px_var(--color-faint)]",
                  )}
                >
                  {on ? <CheckIcon size={16} strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
          <p className="mt-1.5 text-sm leading-5 text-muted">Blind: arm before you see the question. Quick: use after you see it.</p>
          {nudge ? (
            <p className="text-sm leading-5 font-semibold" role="status">
              {WORDS[size] ?? size} is the most. Drop one first.
            </p>
          ) : null}
          <FormError message={update.error ? errorMessage(update.error) : null} />
          <div className="min-h-4 flex-1" />
          <Button variant="secondary" className="min-h-13" onClick={onClose} disabled={!isCompleteLoadout(draft) || update.isPending}>
            {missing > 0 ? `Pick ${missing} more` : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
