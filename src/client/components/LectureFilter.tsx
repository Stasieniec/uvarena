// The Lectures chip and its sheet. Multi-select ("Lectures: 3") for match
// settings, single-select ("Lecture: L05") for the missed list.
import { useState } from "react";
import type { Course } from "../lib/course";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { Button, Chip, Sheet, cx } from "./ui";

type Lecture = Course["lectures"][number];

function sorted(lectures: Lecture[]): Lecture[] {
  return [...lectures].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}

/** Multi-select. `value` null means all lectures. */
export function LectureMultiChip({
  course,
  value,
  onChange,
}: {
  course: Course | null;
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const lectures = sorted(course?.lectures ?? []).filter((l) => l.questionCount > 0);
  const label = value === null ? "All lectures" : value.length === 1 ? (lectures.find((l) => l.id === value[0])?.title ?? "1 lecture") : `${value.length} lectures`;

  const openSheet = () => {
    setDraft(value ?? lectures.map((l) => l.id));
    setOpen(true);
  };
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const apply = () => {
    const all = draft.length === 0 || draft.length === lectures.length;
    // Keep the course order so the request is stable.
    onChange(all ? null : lectures.filter((l) => draft.includes(l.id)).map((l) => l.id));
    setOpen(false);
  };

  return (
    <>
      <Chip onClick={openSheet} active={value !== null} className="self-start">
        <span className="truncate">{label}</span>
        <ChevronDownIcon size={16} />
      </Chip>
      <Sheet open={open} onClose={() => setOpen(false)} title="Lectures">
        <div className="mb-3 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setDraft(lectures.map((l) => l.id))}>
            All
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setDraft([])}>
            None
          </Button>
        </div>
        {lectures.length === 0 ? <p className="py-4 text-sm text-muted">No lectures with questions yet.</p> : null}
        <ul className="flex flex-col gap-1">
          {lectures.map((l) => {
            const on = draft.includes(l.id);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(l.id)}
                  className="flex min-h-tap w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-2"
                >
                  <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-md border", on ? "border-you bg-you text-bg" : "border-border")}>
                    {on ? <CheckIcon size={16} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  <span className="text-xs text-muted tabular-nums">{l.questionCount}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button className="mt-4 w-full" onClick={apply} disabled={draft.length === 0}>
          {draft.length === 0 ? "Pick at least one" : "Done"}
        </Button>
      </Sheet>
    </>
  );
}

/** Single-select. `value` null means all lectures. */
export function LectureSingleChip({
  course,
  value,
  onChange,
}: {
  course: Course | null;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const lectures = sorted(course?.lectures ?? []);
  const label = value === null ? "All lectures" : (lectures.find((l) => l.id === value)?.title ?? "Lecture");
  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <>
      <Chip onClick={() => setOpen(true)} active={value !== null} className="min-w-0">
        <span className="truncate">{label}</span>
        <ChevronDownIcon size={16} className="shrink-0" />
      </Chip>
      <Sheet open={open} onClose={() => setOpen(false)} title="Lecture">
        <ul className="flex flex-col gap-1">
          {[{ id: null as string | null, title: "All lectures" }, ...lectures].map((l) => (
            <li key={l.id ?? "all"}>
              <button
                type="button"
                role="radio"
                aria-checked={l.id === value}
                onClick={() => pick(l.id)}
                className="flex min-h-tap w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                {l.id === value ? <CheckIcon size={18} className="text-you" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
