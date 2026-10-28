// Big course cards, used by onboarding and the first-visit sheet on Home.
import type { Course } from "../lib/course";
import { CheckIcon } from "./icons";
import { cx } from "./ui";

export function CoursePicker({ courses, value, onPick, busy }: { courses: Course[]; value: string | null; onPick: (id: string) => void; busy?: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {courses.map((c) => {
        const on = c.id === value;
        return (
          <li key={c.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(c.id)}
              className={cx(
                "flex min-h-20 w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60",
                on ? "border-you bg-you/10" : "border-border bg-surface hover:border-muted/60",
              )}
            >
              <span className="font-display flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-sm font-bold text-gold">
                {c.code.slice(0, 4)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.title}</span>
                <span className="block text-sm text-muted">
                  {c.questionCount} questions · {c.lectures.length} {c.lectures.length === 1 ? "lecture" : "lectures"}
                </span>
              </span>
              {on ? <CheckIcon className="text-you" /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
