// Layout for the tab screens: the "Back to your match" bar, the verification
// banner, the page, and the bottom bar (Home, Leaderboard, Missed, Profile).
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { authClient } from "../lib/auth-client";
import { useConfig, useMe } from "../lib/queries";
import { HomeIcon, MissedIcon, SwordsIcon, TrophyIcon, UserIcon } from "./icons";
import { cx } from "./ui";

const TABS = [
  { to: "/", label: "Home", icon: HomeIcon, end: true },
  { to: "/leaderboard", label: "Leaderboard", icon: TrophyIcon, end: false },
  { to: "/missed", label: "Missed", icon: MissedIcon, end: false },
  { to: "/profile", label: "Profile", icon: UserIcon, end: false },
] as const;

export function BottomBar() {
  const { pathname } = useLocation();
  // Profile also covers settings and history, which are reached from it.
  const profileActive = ["/profile", "/settings", "/history"].some((p) => pathname.startsWith(p));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-column">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition",
                  isActive || (to === "/profile" && profileActive) ? "text-you" : "text-muted hover:text-text",
                )
              }
            >
              <Icon size={22} />
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
      className="sticky top-0 z-30 -mx-4 mb-2 flex min-h-tap items-center justify-center gap-2 bg-ranked px-4 text-sm font-semibold text-bg"
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
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 py-1 pr-1 pl-3 text-sm">
      <p className="flex-1 text-muted">
        {state === "sent" ? "Sent. Check your inbox." : state === "failed" ? "Could not send it. Try again later." : "Verify your email when you get a moment."}
      </p>
      {state === "idle" || state === "failed" ? (
        <button type="button" onClick={resend} className="min-h-tap rounded-lg px-3 font-semibold text-gold hover:bg-gold/10">
          Resend
        </button>
      ) : null}
    </div>
  );
}

/** Page wrapper for tab screens: padding that clears the bottom bar. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("px-4 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))]", className)}>{children}</main>;
}

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="px-4">
        <BackToMatchBar />
      </div>
      {children ?? <Outlet />}
      <BottomBar />
    </div>
  );
}
