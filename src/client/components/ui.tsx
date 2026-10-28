// Hand-written UI primitives. Phone first: every control is at least 48 px tall.
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ApiRequestError, errorMessage } from "../lib/api";
import { BackIcon, XIcon } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "ranked" | "bot" | "secondary" | "ghost" | "danger" | "gold" | "google";

// Broadcast buttons: the primary action is a yellow plate with the offset frame
// (one per screen); everything else is a plate with a darker bottom edge that
// drops when pressed. Ranked, gold and primary are all the primary action now.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "btn-primary text-xl",
  ranked: "btn-primary text-xl",
  gold: "btn-primary text-xl",
  bot: "plate press text-text font-semibold",
  secondary: "plate press text-text font-semibold",
  ghost: "bg-transparent text-text font-semibold hover:bg-surface",
  google: "bg-white text-[#1f1f1f] font-medium shadow-[0_3px_0_#8c939e] press",
  danger: "bg-transparent text-wrong font-semibold shadow-[inset_0_0_0_1px_var(--color-wrong)]",
};

export const buttonBase =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-sm px-5 text-center text-base leading-tight select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-you disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass(variant: ButtonVariant = "primary", extra?: string): string {
  return cx(buttonBase, VARIANTS[variant], extra);
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
  return <div className={cx("animate-pulse rounded-xl bg-surface-2/70", className)} aria-hidden />;
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
    <div className={cx("flex flex-col items-center gap-3 rounded-2xl border border-wrong/30 bg-wrong/5 p-5 text-center", className)} role="alert">
      <p className="text-sm text-text">{errorMessage(error)}</p>
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
    <div className={cx("flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-5 py-8 text-center", className)}>
      <p className="font-semibold text-text">{title}</p>
      {children ? <div className="text-sm text-muted">{children}</div> : null}
    </div>
  );
}

/** Top of a sub-screen: back button, title, optional right-hand slot. */
export function PageHeader({ title, back, right, className }: { title: ReactNode; back?: string | true; right?: ReactNode; className?: string }) {
  const navigate = useNavigate();
  return (
    <header className={cx("sticky top-0 z-20 -mx-4 mb-3 flex min-h-14 items-center gap-1 bg-bg/90 px-2 backdrop-blur", className)}>
      {back ? (
        typeof back === "string" ? (
          <Link to={back} className="flex size-12 items-center justify-center rounded-xl text-muted hover:text-text" aria-label="Back">
            <BackIcon />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            className="flex size-12 items-center justify-center rounded-xl text-muted hover:text-text"
            aria-label="Back"
          >
            <BackIcon />
          </button>
        )
      ) : (
        <span className="w-2" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
      {right}
    </header>
  );
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
  const active = tone === "ranked" ? "bg-ranked-gold text-bg" : tone === "bot" ? "bg-bot text-bg" : "bg-you text-bg";
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl border border-border bg-surface p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "min-h-tap min-w-0 flex-1 truncate rounded-xl px-3 text-sm font-semibold transition",
              on ? active : "text-muted hover:text-text",
            )}
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
        "inline-flex min-h-tap max-w-full items-center gap-1.5 rounded-sm border px-4 text-sm font-medium transition",
        active ? "border-you/60 bg-you/10 text-you" : "border-border bg-surface text-text hover:border-muted/60",
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
    <label htmlFor={id} className={cx("flex min-h-tap cursor-pointer items-center justify-between gap-4 py-2", disabled && "cursor-not-allowed opacity-60")}>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
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
        <span className="h-7 w-12 rounded-xs bg-line transition peer-checked:bg-text peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-you" />
        <span className="absolute left-1 size-5 rounded-xs bg-muted transition peer-checked:translate-x-5 peer-checked:bg-bg" />
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
        className="sheet-panel relative flex max-h-[88dvh] w-full max-w-column flex-col rounded-t-sm border border-b-0 border-border bg-surface pb-[env(safe-area-inset-bottom)] outline-none"
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <h2 className="flex-1 text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="flex size-12 items-center justify-center rounded-xl text-muted hover:text-text" aria-label="Close">
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
      <div className="toast-in pointer-events-auto flex w-full max-w-[28rem] items-center gap-3 rounded-2xl border border-border bg-surface-2 py-1 pr-1 pl-4 ">
        <span className="flex-1 text-sm">{message}</span>
        {action ? (
          <button type="button" onClick={onAction} className="min-h-tap rounded-xl px-4 text-sm font-semibold text-you hover:bg-you/10">
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
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={cx(
          "min-h-tap w-full rounded-xl border bg-bg px-4 text-base text-text placeholder:text-muted/60 focus:outline-none focus-visible:ring-2",
          error ? "border-wrong/70 focus-visible:ring-wrong/50" : "border-border focus-visible:ring-you/60",
        )}
        {...rest}
      />
      {error ? (
        <p id={`${id}-msg`} className="text-sm text-wrong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-wrong/40 bg-wrong/10 px-4 py-3 text-sm text-text">
      {message}
    </p>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-text">{children}</h2>
      {right}
    </div>
  );
}
