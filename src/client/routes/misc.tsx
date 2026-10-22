// Small route components: the index switch, the match route, the dev preview
// gate, not found and the router's error boundary.
import { lazy, Suspense, useEffect } from "react";
import { Link, useParams, useRouteError } from "react-router";
import { MatchIdSchema } from "@shared/api-schemas";
import { APP_NAME } from "@shared/brand";
import { isUnauthorised } from "../lib/api";
import { useMe } from "../lib/queries";
import { AppShell } from "../components/AppShell";
import { ErrorState, FullScreenLoader, buttonClass } from "../components/ui";
import { Home } from "./Home";
import { Landing } from "./Landing";
import { RequireOnboarded } from "./guards";

// The match screen is its own chunk, loaded when a match opens.
const MatchScreen = lazy(() => import("../match/MatchScreen"));
// The /dev/match preview exists in dev builds only; production bundles do not contain it.
const DevMatchScreen = import.meta.env.DEV ? lazy(() => import("../match/DevMatchScreen")) : null;

/** "/": the landing page signed out, Home signed in. */
export function IndexRoute() {
  const me = useMe();
  if (me.isPending) return <FullScreenLoader />;
  if (me.error && isUnauthorised(me.error)) return <Landing />;
  if (me.error && !me.data)
    return (
      <div className="flex min-h-dvh items-center px-6">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} className="w-full" />
      </div>
    );
  return <RequireOnboardedHome />;
}

function RequireOnboardedHome() {
  const me = useMe();
  if (me.data?.needsOnboarding) return <RequireOnboarded />;
  return (
    <AppShell>
      <Home />
    </AppShell>
  );
}

export function MatchRoute() {
  const { id = "" } = useParams();
  if (!MatchIdSchema.safeParse(id).success) return <NotFound />;
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <MatchScreen key={id} matchId={id} />
    </Suspense>
  );
}

/** /dev/match: dev builds only (npm run dev); a 404 in production builds. */
export function DevMatchRoute() {
  if (!DevMatchScreen) return <NotFound />;
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <DevMatchScreen />
    </Suspense>
  );
}

export function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-6xl font-black text-zeus">404</p>
      <p className="text-muted">Nothing here. Zeus checked.</p>
      <Link to="/" className={buttonClass("secondary", "min-w-40")}>
        Home
      </Link>
    </main>
  );
}

export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-3xl font-bold">Something broke</p>
      <p className="text-muted">The page hit an error. Reloading usually fixes it.</p>
      <button type="button" className={buttonClass("primary", "min-w-40")} onClick={() => window.location.reload()}>
        Reload
      </button>
      <Link to="/" className={buttonClass("ghost", "min-w-40")}>
        {APP_NAME} home
      </Link>
    </main>
  );
}
