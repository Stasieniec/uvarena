// Pieces the after-a-match screens share (missed questions, leaderboard,
// profiles, history, settings, credits), drawn to the Broadcast boards:
// a 56 px header, plates with a 3 px edge, hairline stat rows, 6 px bars,
// name tags in the player colours, and the yellow primary plate.
import { useId, type InputHTMLAttributes, type ReactNode, type SVGProps } from "react";
import { Link, useNavigate } from "react-router";
import { formatDate } from "../../lib/format";
import { cx } from "../ui";

// ---------------------------------------------------------------------------
// Icons (24 x 24 grid, round caps, as on the boards)
// ---------------------------------------------------------------------------

const PATHS = {
  left: <path d="m15 6-6 6 6 6" />,
  right: <path d="m9 6 6 6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  retry: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 4v4h4" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 4v4h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5z" />
      <path d="M4 19a2 2 0 0 1 2-2h14" />
    </>
  ),
  ext: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 14v6H4V6h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  swords: (
    <>
      <path d="M4 4l9 9" />
      <path d="M20 4l-9 9" />
      <path d="M6 15l3 3" />
      <path d="M18 15l-3 3" />
      <path d="M4 20l3-3" />
      <path d="M20 20l-3-3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H4v16h6" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </>
  ),
  bibi: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  shield: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z" />,
  fifty: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16" />
    </>
  ),
  fast: (
    <>
      <path d="M4 6l6 6-6 6" />
      <path d="M12 6l6 6-6 6" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  stroke = 1.8,
  label,
  ...rest
}: { name: IconName; size?: number; stroke?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, "name" | "stroke">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
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

function goBack(navigate: ReturnType<typeof useNavigate>, fallback: string) {
  if (window.history.length > 1) navigate(-1);
  else navigate(fallback);
}

/**
 * 56 px header. `big` is the Condensed 28 screen title; otherwise an 18 px
 * semibold title next to the back arrow. `back` is a path, or true for history back.
 */
export function Header({ title, big = false, back, right }: { title: ReactNode; big?: boolean; back?: string | true; right?: ReactNode }) {
  const navigate = useNavigate();
  const backCls = "flex size-11 shrink-0 items-center justify-center text-text";
  return (
    <header className={cx("flex h-14 shrink-0 items-center gap-1 pr-1", back ? "pl-1" : "pl-4")}>
      {back ? (
        typeof back === "string" ? (
          <Link to={back} aria-label="Back" className={backCls}>
            <Icon name="left" size={22} stroke={2} />
          </Link>
        ) : (
          <button type="button" aria-label="Back" className={backCls} onClick={() => goBack(navigate, "/")}>
            <Icon name="left" size={22} stroke={2} />
          </button>
        )
      ) : null}
      <h1 className={cx("m-0 min-w-0 flex-1 truncate", big ? "font-display text-[28px] leading-8 font-bold" : "text-lg leading-6 font-semibold")}>{title}</h1>
      {right}
    </header>
  );
}

/** A 44 px icon link for the header's right side. */
export function HeaderIconLink({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <Link to={to} aria-label={label} className="flex size-11 items-center justify-center text-text">
      <Icon name={icon} size={20} />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Buttons and controls
// ---------------------------------------------------------------------------

/** The one yellow plate per screen: Condensed 24, 1 px frame 3 px outside it. */
export function Primary({
  children,
  onClick,
  disabled,
  busy,
  height = 56,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  height?: number;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <div className={cx("p-[3px]", className)}>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className="btn-primary flex w-full items-center justify-center gap-2.5 rounded-xs px-4 text-2xl leading-7"
        style={{ height }}
      >
        {children}
      </button>
    </div>
  );
}

/** The same yellow plate as a link. */
export function PrimaryLink({
  to,
  children,
  height = 48,
  large = false,
  className,
}: {
  to: string;
  children: ReactNode;
  height?: number;
  /** Condensed 24 instead of 22. */
  large?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("p-[3px]", className)}>
      <Link
        to={to}
        className={cx("btn-primary flex w-full items-center justify-center gap-2.5 rounded-xs px-3", large ? "text-2xl leading-7" : "text-[22px] leading-[26px]")}
        style={{ height }}
      >
        {children}
      </Link>
    </div>
  );
}

/** Secondary: a plate with the 3 px edge, Barlow 15 to 16 semibold. */
export const secondaryClass =
  "plate press inline-flex items-center justify-center gap-2 rounded-xs px-3.5 text-[15px] font-semibold text-text disabled:text-muted disabled:cursor-not-allowed";

/** Text button: transparent, text colour, 16 semibold, 48 px. */
export const textButtonClass =
  "inline-flex h-12 items-center justify-center gap-2 bg-transparent px-3 text-base font-semibold text-text disabled:text-muted disabled:cursor-not-allowed";

/** Segmented control on a plate-dim track; the active segment gets the line fill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid h-10 gap-[3px] rounded-xs bg-plate-dim p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx("min-w-0 truncate rounded-xs px-2 text-[15px] font-semibold", on ? "bg-line text-text" : "bg-transparent text-muted hover:text-text")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A filter chip that is a native select underneath: 40 px plate, 1 px line inset, chevron. */
export function SelectChip<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const shown = options.find((o) => o.value === value)?.label ?? "";
  return (
    <label className={cx("relative inline-flex h-10 min-w-0 items-center gap-1.5 rounded-xs bg-plate pr-2.5 pl-3 text-[15px] font-semibold text-text shadow-[inset_0_0_0_1px_var(--color-line)]", className)}>
      <span className="truncate">{shown}</span>
      <Icon name="down" size={16} stroke={2} className="shrink-0 text-muted" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Data pieces
// ---------------------------------------------------------------------------

/** Name tag in a player colour (ground text on it), Condensed 15 uppercase. */
export function NameTag({ name, who, className }: { name: string; who: "you" | "opponent"; className?: string }) {
  return (
    <span
      className={cx(
        "inline-block max-w-full truncate px-2 py-px font-display text-[15px] leading-5 font-bold tracking-[0.04em] text-bg uppercase",
        who === "you" ? "bg-you" : "bg-opponent",
        className,
      )}
    >
      {name}
    </span>
  );
}

/** A rating in Condensed with a faint "?" while provisional. */
export function Rating({ value, provisional }: { value: number; provisional: boolean }) {
  return (
    <>
      {Math.round(value)}
      {provisional ? <span className="text-faint">?</span> : null}
    </>
  );
}

export interface DiscUser {
  displayUsername?: string | null;
  username?: string | null;
  image?: string | null;
}

/** Round avatar: the picture, or the first letter on a line disc (teal for you). */
export function Disc({ user, size, you = false }: { user: DiscUser; size: number; you?: boolean }) {
  const name = user.displayUsername ?? user.username ?? "?";
  if (user.image) {
    return <img src={user.image} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full bg-line object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold", you ? "bg-you text-bg" : "bg-line text-text")}
      style={{ width: size, height: size, fontSize: Math.round(size / 2) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** One label-value row with a hairline under it (none on the last). */
export function StatRow({ label, children, last = false }: { label: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <div className={cx("flex h-10 items-center justify-between gap-3", !last && "border-b border-line")}>
      <dt className="min-w-0 truncate text-[15px] text-muted">{label}</dt>
      <dd className="m-0 shrink-0">{children}</dd>
    </div>
  );
}

/** A big Condensed number for stat rows. */
export function Num({ children, size = 24, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <span className={cx("font-display font-bold", className)} style={{ fontSize: size, lineHeight: `${size + 4}px` }}>
      {children}
    </span>
  );
}

/** "Section" heading: 16 semibold. */
export function SectionHeading({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <h2 className={cx("m-0 flex items-baseline justify-between gap-3 text-base leading-[22px] font-semibold", className)}>
      {children}
      {right ? <span className="text-sm font-normal text-muted">{right}</span> : null}
    </h2>
  );
}

/** Quiet message where a list would be. */
export function Quiet({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("m-0 py-6 text-[15px] leading-[22px] text-muted", className)}>{children}</p>;
}

/** Placeholder plates while a screen loads. */
export function LoadingPlates({ count = 3, height = 72, className }: { count?: number; height?: number; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-2.5", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse rounded-xs bg-plate-dim" style={{ height }} />
      ))}
    </div>
  );
}

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

/** Labelled input: 48 px plate with a 1 px line inset (2 px text on focus), hint or error under it. */
export function Field({ label, error, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string }) {
  const id = useId();
  const msg = error ?? hint ?? null;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm leading-5 text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={msg ? `${id}-msg` : undefined}
        className={cx(
          "h-12 w-full min-w-0 rounded-xs bg-plate px-3 text-base text-text outline-none placeholder:text-muted",
          error ? "shadow-[inset_0_0_0_2px_var(--color-wrong)]" : "shadow-[inset_0_0_0_1px_var(--color-line)] focus:shadow-[inset_0_0_0_2px_var(--color-text)]",
        )}
        {...rest}
      />
      {msg ? (
        <p id={`${id}-msg`} className={cx("m-0 text-sm leading-5", error ? "text-wrong" : "text-muted")}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
