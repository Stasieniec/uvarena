// /dev/match: a full scripted match on the real match screen, without a
// server, for UI work and screenshots. Dev builds only: in a production build
// the preview code is not even bundled.

import { lazy, Suspense } from "react";

const DevPreview = import.meta.env.DEV ? lazy(() => import("./dev/DevPreview")) : null;

export function DevMatchScreen() {
  if (!DevPreview) {
    return <p className="p-6 text-muted">The match preview is only available in development builds.</p>;
  }
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading the preview.</p>}>
      <DevPreview />
    </Suspense>
  );
}

export default DevMatchScreen;
