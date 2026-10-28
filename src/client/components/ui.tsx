// Hand-written UI primitives. Phone first: every control is at least 48 px tall.
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ApiRequestError, errorMessage } from "../lib/api";
import { BackIcon, XIcon } from "./icons";

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

export const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-sm px-5 text-center select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-you disabled:cursor-not-allowed";

/** Which utility family a class sets, for the ones callers override (size, height, padding, line height). */
function family(cls: string): string | null {
  if (/^min-h-/.test(cls)) return "min-h";
  if (/^px-/.test(cls)) return "px";
  if (/^leading-/.test(cls)) return "leading";
  if (/^text-(xs|sm|base|lg|[0-9]?xl|\[[0-9.]+(px|rem)\])$/.test(cls)) return "text-size";
  return null;
}

export function buttonClass(variant: ButtonVariant = "primary", extra?: string): string {
  // The primary's 3 px margin would push a full-width button over the edge.
  const fixed = FRAMED.has(variant) && extra ? extra.replace(/(^|\s)w-full(?=\s|$)/, "$1w-[calc(100%-6px)]") : extra;
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

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-sm bg-surface p-4", className)}>{children}</section>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-sm bg-plate", className)} aria-hidden />;
}

/** Placeholder blocks while a screen loads. */
export function LoadingBlocks({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-20" />
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

export function EmptyState({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center gap-2 px-5 py-8 text-center shadow-[inset_0_0_0_1px_var(--color-line)]", className)}>
      <p className="text-base font-semibold text-text">{title}</p>
      {children ? <div className="text-sm leading-5 text-muted">{children}</div> : null}
    </div>
  );
}

/**
 * Top of a sub-screen, 56 px: a 44 px back button, the screen title in
 * Barlow Condensed 28, and an optional right-hand slot.
 */
export function PageHeader({ title, back, right, className }: { title: ReactNode; back?: string | true; right?: ReactNode; className?: string }) {
  const navigate = useNavigate();
  const backClass = "flex size-11 shrink-0 items-center justify-center text-text";
  return (
    <header className={cx("sticky top-0 z-20 -mx-4 flex h-14 items-center gap-1 bg-bg px-1", className)}>
      {back ? (
        typeof back === "string" ? (
          <Link to={back} className={backClass} aria-label="Back">
            <BackIcon size={22} />
          </Link>
        ) : (
          <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} className={backClass} aria-label="Back">
            <BackIcon size={22} />
          </button>
        )
      ) : (
        <span className="w-3" />
      )}
      <h1 className="font-display min-w-0 flex-1 truncate text-[28px] leading-8 font-bold">{title}</h1>
      {right}
    </header>
  );
}

/** A small outlined tag in a header, such as "Rated". */
export function HeaderTag({ children }: { children: ReactNode }) {
  return <span className="mr-3 shrink-0 px-2 py-px text-sm leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--color-muted)]">{children}</span>;
}

/** A row of mutually exclusive pills (course switch, filters). */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = "you",
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  tone?: "you" | "ranked" | "bot";
}) {
  // Broadcast segmented control: one look for every tone (colour marks a player only).
  void tone;
  return (
    <div role="radiogroup" aria-label={label} className="grid h-10 auto-cols-fr grid-flow-col gap-[3px] rounded-sm bg-plate-dim p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx("min-w-0 truncate rounded-sm px-3 text-[15px] font-semibold", on ? "bg-line text-text" : "text-muted hover:text-text")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ children, onClick, active, className }: { children: ReactNode; onClick?: () => void; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex h-10 max-w-full items-center gap-1.5 rounded-sm bg-plate pr-2.5 pl-3 text-[15px] font-semibold text-text [&>svg]:text-muted",
        active ? "shadow-[inset_0_0_0_1px_var(--color-muted)]" : "shadow-[inset_0_0_0_1px_var(--color-line)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

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
    <label htmlFor={id} className={cx("flex min-h-14 cursor-pointer items-center justify-between gap-3 py-2", disabled && "cursor-not-allowed opacity-60")}>
      <span className="min-w-0">
        <span className="block text-base leading-[22px] font-semibold">{label}</span>
        {description ? <span className="block text-sm leading-5 text-muted">{description}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-7 w-12 rounded-sm bg-line peer-checked:bg-text peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-you" />
        <span className="absolute left-[3px] size-[22px] rounded-[1px] bg-muted peer-checked:translate-x-5 peer-checked:bg-bg" />
      </span>
    </label>
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

/** A transient bar at the bottom of the screen, above the tab bar, with an optional action. */
export function Toast({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4" role="status" aria-live="polite">
      <div className="toast-in pointer-events-auto flex w-full max-w-[28rem] items-center gap-3 rounded-sm bg-line py-1 pr-1 pl-4 shadow-[0_3px_0_var(--color-edge)]">
        <span className="flex-1 text-[15px] leading-[22px]">{message}</span>
        {action ? (
          <button type="button" onClick={onAction} className="min-h-tap px-4 text-[15px] font-semibold text-text underline-offset-2 hover:underline">
            {action}
          </button>
        ) : null}
      </div>
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

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between gap-2">
      <h2 className="text-base leading-5 font-semibold text-text">{children}</h2>
      {right}
    </div>
  );
}

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
