// Hand-written UI primitives. Phone first: every control is at least 48 px tall.
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ApiRequestError, errorMessage } from "../lib/api";
import { BackIcon, ChevronDownIcon, XIcon } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "ranked" | "bot" | "secondary" | "ghost" | "danger" | "gold" | "google";

// Broadcast buttons. The primary action is a yellow plate, Barlow Condensed 24,
// 56 px, with a 1 px frame 3 px outside it (one per screen); it keeps a 3 px
// margin so the frame never touches its neighbours. Secondary is a plate with
// a 3 px darker bottom edge that drops when pressed; text buttons are bare.
// Ranked, gold and primary are all the primary action now; bot and google are
// secondary.
const PRIMARY = "btn-primary m-[3px] min-h-14 text-2xl leading-7";
const SECONDARY = "plate press min-h-12 text-base leading-tight text-text font-semibold disabled:opacity-50";
const TEXT = "min-h-tap text-base leading-tight font-semibold disabled:opacity-50";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: PRIMARY,
  ranked: PRIMARY,
  gold: PRIMARY,
  bot: SECONDARY,
  secondary: SECONDARY,
  google: SECONDARY,
  ghost: `${TEXT} bg-transparent text-text`,
  danger: `${TEXT} bg-transparent text-wrong shadow-[inset_0_0_0_1px_var(--color-wrong)]`,
};
const FRAMED = new Set<ButtonVariant>(["primary", "ranked", "gold"]);
// Written out whole so Tailwind generates it: a framed button's full width minus its 3 px margins.
const FRAMED_FULL = "w-[calc(100%-6px)]";

export const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-sm px-5 text-center select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-you disabled:cursor-not-allowed";

/** Which utility family a class sets, for the ones callers override (size, height, padding, line height). */
function family(cls: string): string | null {
  if (/^min-h-/.test(cls)) return "min-h";
  if (/^m-/.test(cls)) return "m";
  if (/^px-/.test(cls)) return "px";
  if (/^leading-/.test(cls)) return "leading";
  if (/^text-(xs|sm|base|lg|[0-9]?xl|\[[0-9.]+(px|rem)\])$/.test(cls)) return "text-size";
  return null;
}

export function buttonClass(variant: ButtonVariant = "primary", extra?: string): string {
  // The primary's 3 px margin would push a full-width button over the edge.
  const fixed = FRAMED.has(variant) && extra && !/(^|\s)m-0(?=\s|$)/.test(extra) ? extra.replace(/(^|\s)w-full(?=\s|$)/, `$1${FRAMED_FULL}`) : extra;
  // A caller's size, padding or line height replaces the default instead of fighting it in the cascade.
  const overridden = new Set((fixed ?? "").split(/\s+/).map(family).filter(Boolean));
  const keep = (classes: string) =>
    classes
      .split(/\s+/)
      .filter((c) => !overridden.has(family(c) ?? ""))
      .join(" ");
  return cx(keep(buttonBase), keep(VARIANTS[variant]), fixed);
}

export function Button({
  variant = "primary",
  className,
  loading,
  children,
  type = "button",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button type={type} className={buttonClass(variant, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={18} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-sm bg-plate", className)} aria-hidden />;
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

export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted">
      <Spinner size={32} />
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const navigate = useNavigate();
  // Retrying a "not found" finds nothing again: offer the way back instead.
  const missing = error instanceof ApiRequestError && error.status === 404;
  return (
    <div className={cx("flex flex-col items-center gap-3 p-5 text-center shadow-[inset_0_0_0_1px_var(--color-line)]", className)} role="alert">
      <p className="text-[15px] leading-[22px] text-text">{errorMessage(error)}</p>
      {missing ? (
        <Button variant="secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} className="min-w-32">
          Back
        </Button>
      ) : onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="min-w-32">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function goBack(navigate: ReturnType<typeof useNavigate>) {
  if (window.history.length > 1) navigate(-1);
  else navigate("/");
}

/**
 * Top of a screen, 56 px: a 44 px back button, the title, and an optional
 * right-hand slot. The title is the Condensed 28 screen title, or with
 * `small` an 18 px semibold one (detail screens: "Missed question", a
 * player's name). `back` is a path, true for history back, or a handler.
 */
export function PageHeader({
  title,
  back,
  right,
  small = false,
  className,
}: {
  title: ReactNode;
  back?: string | true | (() => void);
  right?: ReactNode;
  small?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const backClass = "flex size-11 shrink-0 items-center justify-center text-text";
  const icon = <BackIcon size={22} />;
  return (
    <header className={cx("sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 bg-bg pr-1", back ? "pl-1" : "pl-4", className)}>
      {typeof back === "string" ? (
        <Link to={back} className={backClass} aria-label="Back">
          {icon}
        </Link>
      ) : back ? (
        <button type="button" onClick={back === true ? () => goBack(navigate) : back} className={backClass} aria-label="Back">
          {icon}
        </button>
      ) : null}
      <h1 className={cx("m-0 min-w-0 flex-1 truncate", small ? "text-lg leading-6 font-semibold" : "font-display text-[28px] leading-8 font-bold")}>{title}</h1>
      {right}
    </header>
  );
}

/** A 44 px icon link for the header's right side. */
export function HeaderIconLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link to={to} aria-label={label} className="flex size-11 items-center justify-center text-text">
      {children}
    </Link>
  );
}

/** A small outlined tag in a header, such as "Rated". */
export function HeaderTag({ children }: { children: ReactNode }) {
  return <span className="mr-3 shrink-0 px-2 py-px text-sm leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--color-muted)]">{children}</span>;
}

/** Segmented control: a plate-dim track, 3 px inset; the active segment gets the line fill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid h-10 gap-[3px] rounded-xs bg-plate-dim p-[3px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
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

/** The filter chip look: 40 px plate, 1 px line inset (muted when active), Barlow 15 semibold. */
const CHIP = "inline-flex h-10 max-w-full min-w-0 items-center gap-1.5 rounded-xs bg-plate pr-2.5 pl-3 text-[15px] font-semibold text-text [&>svg]:shrink-0 [&>svg]:text-muted";

export function Chip({ children, onClick, active, className }: { children: ReactNode; onClick?: () => void; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(CHIP, active ? "shadow-[inset_0_0_0_1px_var(--color-muted)]" : "shadow-[inset_0_0_0_1px_var(--color-line)]", className)}
    >
      {children}
    </button>
  );
}

/** A filter chip that is a native select underneath. */
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
    <label className={cx(CHIP, "relative shadow-[inset_0_0_0_1px_var(--color-line)]", className)}>
      <span className="truncate">{shown}</span>
      <ChevronDownIcon size={16} />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A settings row with a switch: the label (16 semibold) and an optional muted
 * line, then a 48 x 28 switch. On: text-colour track, dark knob right. Off:
 * line track, muted knob left. `role="switch"` on a button.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cx("flex min-h-14 items-center justify-between gap-3 py-2", disabled && "opacity-60")}>
      <span className="flex min-w-0 flex-col">
        <span id={`${id}-label`} className="text-base leading-[22px] font-semibold">
          {label}
        </span>
        {description ? <span className="text-sm leading-5 text-muted">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "flex h-7 w-12 shrink-0 rounded-xs p-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-you disabled:cursor-not-allowed",
          checked ? "justify-end bg-text" : "justify-start bg-line",
        )}
      >
        <span className={cx("size-[22px] rounded-[1px]", checked ? "bg-bg" : "bg-muted")} />
      </button>
    </div>
  );
}

/** Bottom sheet dialog. Closes on backdrop tap and Escape. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sheet-backdrop absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="sheet-panel relative flex max-h-[88dvh] w-full max-w-column flex-col rounded-t-sm bg-plate pb-[env(safe-area-inset-bottom)] outline-none"
      >
        <div className="flex items-center gap-2 pt-2 pr-1 pb-1 pl-4">
          <h2 className="font-display flex-1 text-2xl leading-7 font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="flex size-11 items-center justify-center text-muted hover:text-text" aria-label="Close">
            <XIcon />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * A transient bar with an optional action. Fixed at the bottom of the screen
 * (above the tab bar when the screen has one), or `inline` in the flow, where
 * a fixed bar would cover the screen's own bottom buttons.
 */
export function Toast({
  message,
  action,
  onAction,
  placement = "bar",
}: {
  message: string;
  action?: string;
  onAction?: () => void;
  placement?: "bar" | "inline";
}) {
  const bar = (
    <div className="toast-in pointer-events-auto flex w-full max-w-[28rem] items-center gap-3 rounded-sm bg-line py-1 pr-1 pl-4 shadow-[0_3px_0_var(--color-edge)]">
      <span className="flex-1 text-[15px] leading-[22px]">{message}</span>
      {action ? (
        <button type="button" onClick={onAction} className="min-h-tap px-4 text-[15px] font-semibold text-text underline-offset-2 hover:underline">
          {action}
        </button>
      ) : null}
    </div>
  );
  if (placement === "inline") {
    return (
      <div role="status" aria-live="polite">
        {bar}
      </div>
    );
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4" role="status" aria-live="polite">
      {bar}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string }) {
  const id = useId();
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm leading-5 text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={cx(
          "h-12 w-full rounded-sm bg-plate px-3 text-base text-text placeholder:text-muted/60 focus:outline-none",
          error
            ? "shadow-[inset_0_0_0_2px_var(--color-wrong)]"
            : "shadow-[inset_0_0_0_1px_var(--color-line)] focus:shadow-[inset_0_0_0_2px_var(--color-text)]",
        )}
        {...rest}
      />
      {error ? (
        <p id={`${id}-msg`} className="text-sm leading-5 text-wrong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-sm leading-5 text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-sm px-4 py-3 text-[15px] leading-[22px] text-text shadow-[inset_0_0_0_1px_var(--color-wrong)]">
      {message}
    </p>
  );
}

/** A section heading inside a screen: 16 semibold, with an optional muted note on the right. */
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

/** One label-value row with a hairline under it (none on the last). */
export function StatRow({ label, children, last = false }: { label: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <div className={cx("flex h-10 items-center justify-between gap-3", !last && "border-b border-line")}>
      <dt className="min-w-0 truncate text-[15px] text-muted">{label}</dt>
      <dd className="m-0 shrink-0 text-[15px] font-semibold">{children}</dd>
    </div>
  );
}

/** A big Condensed number for stat rows and stat grids. */
export function Num({ children, size = 24, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <span className={cx("font-display font-bold", className)} style={{ fontSize: size, lineHeight: `${size + 4}px` }}>
      {children}
    </span>
  );
}

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

/** The one yellow plate per screen, Condensed 24, in a 3 px wrapper that keeps its frame clear. */
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
      <Button type={type} onClick={onClick} disabled={disabled} loading={busy} className="m-0 w-full min-h-0 px-4" style={{ height }}>
        {children}
      </Button>
    </div>
  );
}

/** The same yellow plate as a link. `small` is the 22 px version that sits beside a count. */
export function PrimaryLink({ to, children, height = 56, small = false, className }: { to: string; children: ReactNode; height?: number; small?: boolean; className?: string }) {
  return (
    <div className={cx("p-[3px]", className)}>
      <Link to={to} className={buttonClass("primary", cx("m-0 w-full min-h-0 px-3", small && "text-[22px] leading-[26px]"))} style={{ height }}>
        {children}
      </Link>
    </div>
  );
}

/** Secondary: a plate with the 3 px edge, Barlow 16 semibold, 48 px. */
export const secondaryClass = buttonClass("secondary");

/** Text button: transparent, text colour, 16 semibold, 48 px. */
export const textButtonClass = buttonClass("ghost");

/** A rating with its provisional "?" in the faint colour ("1540?"). */
export function RatingText({ text }: { text: string }) {
  return text.endsWith("?") ? (
    <>
      {text.slice(0, -1)}
      <span className="text-faint">?</span>
    </>
  ) : (
    <>{text}</>
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
