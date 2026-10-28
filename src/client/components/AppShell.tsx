// Layout for the tab screens: the "Back to your match" bar, the verification
// banner, the page, and the bottom bar (Home, Leaderboard, Missed, Profile).
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { authClient } from "../lib/auth-client";
import { useConfig, useMe } from "../lib/queries";
import { HomeIcon, LeaderboardIcon, MailIcon, MissedIcon, SwordsIcon, UserIcon } from "./icons";
import { cx } from "./ui";

const TABS = [
  { to: "/", label: "Home", icon: HomeIcon, end: true },
  { to: "/leaderboard", label: "Leaderboard", icon: LeaderboardIcon, end: false },
  { to: "/missed", label: "Missed", icon: MissedIcon, end: false },
  { to: "/profile", label: "Profile", icon: UserIcon, end: false },
] as const;

export function BottomBar() {
  const { pathname } = useLocation();
  // Profile also covers settings and history, which are reached from it.
  const profileActive = ["/profile", "/settings", "/history"].some((p) => pathname.startsWith(p));
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-16 max-w-column grid-cols-4 bg-plate-dim pb-1">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-xs leading-4",
                  // The active tab: text colour and a 3 px bar in your colour along its top edge.
                  isActive || (to === "/profile" && profileActive)
                    ? "font-semibold text-text shadow-[inset_0_3px_0_var(--color-you)]"
                    : "font-medium text-muted hover:text-text",
                )
              }
            >
              <Icon size={20} strokeWidth={1.8} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function BackToMatchBar() {
  const me = useMe();
  const { pathname } = useLocation();
  const id = me.data?.activeMatchId;
  if (!id || pathname.startsWith("/match/")) return null;
  return (
    <Link
      to={`/match/${id}`}
      className="sticky top-0 z-30 -mx-4 mb-2 flex min-h-tap items-center justify-center gap-2 bg-event px-4 text-[15px] font-semibold text-bg"
    >
      <SwordsIcon size={18} />
      Back to your match
    </Link>
  );
}

export function VerifyBanner() {
  const me = useMe();
  const config = useConfig();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const user = me.data?.user;
  if (!user || user.emailVerified || !config.data?.emailEnabled) return null;
  const resend = async () => {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email: user.email, callbackURL: "/" });
    setState(error ? "failed" : "sent");
  };
  return (
    <div className="flex min-h-11 items-center gap-2.5 rounded-sm pr-1 pl-3 text-sm leading-5 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <MailIcon size={16} strokeWidth={1.8} className="shrink-0 text-muted" />
      <p className="flex-1 text-muted">
        {state === "sent" ? "Sent. Check your inbox." : state === "failed" ? "Could not send it. Try again later." : "Verify your email address."}
      </p>
      {state === "idle" || state === "failed" ? (
        <button type="button" onClick={resend} className="h-10 px-2 font-semibold text-text">
          Resend
        </button>
      ) : null}
    </div>
  );
}

/** Page wrapper for tab screens: padding that clears the bottom bar. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]", className)}>{children}</main>;
}

/**
 * The app frame. `nav={false}` drops the bottom bar for sub-screens that have
 * their own Back (bot ladder, duel a friend).
 */
export function AppShell({ children, nav = true }: { children?: ReactNode; nav?: boolean }) {
  return (
    <div className="min-h-dvh">
      <div className="px-4">
        <BackToMatchBar />
      </div>
      {children ?? <Outlet />}
      {nav ? <BottomBar /> : null}
    </div>
  );
}
