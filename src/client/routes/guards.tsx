// Route guards: signed in, onboarded, signed out.
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router";
import { isUnauthorised } from "../lib/api";
import { useMe } from "../lib/queries";
import { ErrorState, FullScreenLoader } from "../components/ui";
import { safeNext, withNext } from "../lib/next";

export { safeNext, withNext };

function FullScreenError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <ErrorState error={error} onRetry={onRetry} className="w-full" />
    </div>
  );
}

export function RequireAuth() {
  const me = useMe();
  const loc = useLocation();
  if (me.isPending) return <FullScreenLoader />;
  if (me.error) {
    if (isUnauthorised(me.error)) return <Navigate to={withNext("/login", loc.pathname + loc.search)} replace />;
    if (!me.data) return <FullScreenError error={me.error} onRetry={() => void me.refetch()} />;
  }
  return <Outlet />;
}

export function RequireOnboarded() {
  const me = useMe();
  const loc = useLocation();
  if (me.data?.needsOnboarding) return <Navigate to={withNext("/onboarding", loc.pathname + loc.search)} replace />;
  return <Outlet />;
}

/** Sign-in and sign-up pages: a signed-in user goes straight on. */
export function GuestOnly() {
  const me = useMe();
  const [params] = useSearchParams();
  if (me.isPending) return <FullScreenLoader />;
  if (me.data) return <Navigate to={safeNext(params.get("next"))} replace />;
  return <Outlet />;
}
