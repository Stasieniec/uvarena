// Scaffold placeholder. The Client app package owns this file and replaces the
// placeholder with the router (src/client/router.tsx).
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { APP_NAME } from "@shared/brand";
import "./styles.css";

function Placeholder() {
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    document.title = APP_NAME;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-5xl font-bold tracking-wide text-zeus">{APP_NAME}</h1>
      <p className="text-muted">Ranked duels on your course material</p>
      <p className="text-sm" data-testid="health">
        API: <span className={health === "ok" ? "text-you" : "text-opponent"}>{health}</span>
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
