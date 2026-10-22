// First visit: the name, one line, the Zeus strike, Sign up and Log in.
import { Link } from "react-router";
import { APP_NAME } from "@shared/brand";
import { ZeusStrike } from "../components/ZeusStrike";
import { buttonClass } from "../components/ui";

export function Landing() {
  return (
    <main className="flex min-h-dvh flex-col px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <ZeusStrike className="-mb-4" />
        <h1 className="font-display text-gold-carved text-5xl font-black sm:text-6xl">{APP_NAME}</h1>
        <p className="text-lg text-muted">Ranked duels on your course material</p>
      </div>
      <div className="flex flex-col gap-3">
        <Link to="/signup" className={buttonClass("gold", "text-lg")}>
          Sign up
        </Link>
        <Link to="/login" className={buttonClass("secondary", "text-lg")}>
          Log in
        </Link>
      </div>
    </main>
  );
}
