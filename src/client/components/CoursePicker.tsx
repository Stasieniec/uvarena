// Big course cards, used by onboarding and the first-visit sheet on Home.
import type { Course } from "../lib/course";
import { CheckIcon } from "./icons";
import { cx } from "./ui";

export function CoursePicker({ courses, value, onPick, busy }: { courses: Course[]; value: string | null; onPick: (id: string) => void; busy?: boolean }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {courses.map((c) => {
        const on = c.id === value;
        return (
          <li key={c.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(c.id)}
              className={cx(
                "plate press flex min-h-20 w-full items-center gap-4 rounded-sm px-4 py-3 text-left disabled:opacity-60",
                on && "shadow-[inset_0_0_0_2px_var(--color-text),0_3px_0_var(--color-edge)]",
              )}
            >
              <span className="font-display flex size-12 shrink-0 items-center justify-center rounded-sm bg-line text-lg font-bold">
                {c.code.slice(0, 4)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base leading-5 font-semibold">{c.title}</span>
                <span className="block text-sm leading-5 text-muted">
                  {c.questionCount} questions · {c.lectures.length} {c.lectures.length === 1 ? "lecture" : "lectures"}
                </span>
              </span>
              {on ? <CheckIcon size={20} strokeWidth={2.4} /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
