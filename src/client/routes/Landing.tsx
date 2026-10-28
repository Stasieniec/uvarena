// First visit: the wordmark, one line, a live HUD strip trading a hit, Sign up
// and Log in. No drawing of the app.
import { Link } from "react-router";
import { APP_NAME } from "@shared/brand";
import { DuelMotif } from "../components/DuelMotif";
import { buttonClass } from "../components/ui";

export function Landing() {
  return (
    <main className="flex min-h-dvh flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <p className="font-display text-[32px] leading-9 font-bold tracking-[0.01em] italic">{APP_NAME}</p>
      <h1 className="font-display mt-[clamp(1.5rem,6.7dvh,3.5rem)] text-[clamp(44px,14vw,56px)] leading-[1] font-bold text-balance">
        Ranked duels on your course material
      </h1>
      <DuelMotif className="mt-[clamp(1.5rem,5.3dvh,2.75rem)]" />
      <div className="min-h-6 flex-1" />
      <div className="flex flex-col gap-3">
        <Link to="/signup" className={buttonClass("primary")}>
          Sign up
        </Link>
        <Link to="/login" className={buttonClass("secondary", "min-h-13")}>
          Log in
        </Link>
        <Link to="/credits" className="flex h-11 items-center self-center px-2 text-sm text-muted hover:text-text">
          Credits
        </Link>
      </div>
    </main>
  );
}
