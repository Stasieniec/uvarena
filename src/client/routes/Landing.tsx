// First visit: the name, one line, the duel picture, Sign up and Log in.
import { Link } from "react-router";
import { APP_NAME } from "@shared/brand";
import { DuelMotif } from "../components/DuelMotif";
import { buttonClass } from "../components/ui";

export function Landing() {
  return (
    <main className="flex min-h-dvh flex-col px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <DuelMotif className="mb-6" />
        <h1 className="font-display text-5xl font-black tracking-tight text-text sm:text-6xl">{APP_NAME}</h1>
        <p className="text-lg text-muted">Ranked duels on your course material</p>
      </div>
      <div className="flex flex-col gap-3">
        <Link to="/signup" className={buttonClass("primary", "text-lg")}>
          Sign up
        </Link>
        <Link to="/login" className={buttonClass("secondary", "text-lg")}>
          Log in
        </Link>
        <Link to="/credits" className="mt-1 self-center py-2 text-xs text-muted underline-offset-2 hover:underline">
          Credits
        </Link>
      </div>
    </main>
  );
}
