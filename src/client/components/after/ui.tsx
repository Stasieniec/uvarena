// Pieces only the after-a-match screens use (missed questions, leaderboard,
// profiles, history, settings, credits): icons by name, the page frame, and
// number and date labels. Everything shared with the other screens (header,
// buttons, rows, tags, chips) lives in ../ui.
import type { ReactNode, SVGProps } from "react";
import type { PowerupId } from "@shared/game/types";
import { formatDate } from "../../lib/format";
import { PowerupIcon } from "../../match/components/icons";
import {
  ArrowRightIcon,
  BackIcon,
  BookIcon,
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalIcon,
  FlagIcon,
  GearIcon,
  HistoryIcon,
  LogoutIcon,
  RetryIcon,
  SwordsIcon,
  XIcon,
} from "../icons";
import { cx } from "../ui";

// ---------------------------------------------------------------------------
// Icons by name, drawn by ../icons (one set of drawings for the whole app)
// ---------------------------------------------------------------------------

const ICONS = {
  left: BackIcon,
  right: ChevronRightIcon,
  down: ChevronDownIcon,
  arrow: ArrowRightIcon,
  check: CheckIcon,
  x: XIcon,
  retry: RetryIcon,
  history: HistoryIcon,
  gear: GearIcon,
  book: BookIcon,
  ext: ExternalIcon,
  clock: ClockIcon,
  swords: SwordsIcon,
  camera: CameraIcon,
  logout: LogoutIcon,
  flag: FlagIcon,
} as const;

const POWERUP_ICONS = { bibi: "bibi", shield: "shield", fifty: "fifty", fast: "fast" } as const;

export type IconName = keyof typeof ICONS | keyof typeof POWERUP_ICONS;

export function Icon({
  name,
  size = 18,
  stroke = 1.8,
  label,
  ...rest
}: { name: IconName; size?: number; stroke?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, "name" | "stroke">) {
  if (name in POWERUP_ICONS) {
    return (
      <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cx("inline-flex shrink-0", rest.className)}>
        <PowerupIcon id={name as PowerupId} size={size} strokeWidth={stroke} />
      </span>
    );
  }
  const Draw = ICONS[name as keyof typeof ICONS];
  return <Draw size={size} strokeWidth={stroke} title={label} {...rest} />;
}

// ---------------------------------------------------------------------------
// Page frame
// ---------------------------------------------------------------------------

/** The column under a header: 16 px sides, room for the bottom bar when there is one. */
export function Screen({ children, className, bottomBar = true }: { children: ReactNode; className?: string; bottomBar?: boolean }) {
  return (
    <main
      className={cx(
        "flex min-h-dvh flex-col",
        bottomBar ? "pb-[calc(5rem+env(safe-area-inset-bottom))]" : "pb-[max(env(safe-area-inset-bottom),16px)]",
        className,
      )}
    >
      {children}
    </main>
  );
}

/** Body of a screen: the 16 px column. Grows, so a bottom-anchored action can sit under a spacer. */
export function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-1 flex-col px-4", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Numbers and dates
// ---------------------------------------------------------------------------

const MINUS = "−";

/** "+71", "−118", "0". */
export function signed(n: number): string {
  const r = Math.round(n);
  if (r > 0) return `+${r}`;
  if (r < 0) return `${MINUS}${-r}`;
  return "0";
}

/** "−1,800" for damage. */
export function damage(n: number): string {
  return `${MINUS}${Math.round(n).toLocaleString("en-US")}`;
}

const DAY_MS = 86_400_000;

function startOfToday(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", then "26 Oct" (with the year when it is not this one). */
export function dayLabel(at: number, now: number = Date.now()): string {
  const start = startOfToday(now);
  if (at >= start) return "Today";
  if (at >= start - DAY_MS) return "Yesterday";
  return formatDate(at, now);
}

/** "today 14:20", "yesterday 09:05", "26 Oct 14:20". */
export function whenLabel(at: number, now: number = Date.now()): string {
  const time = new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = dayLabel(at, now);
  return `${day === "Today" || day === "Yesterday" ? day.toLowerCase() : day} ${time}`;
}
