// Standalone entry for the match preview (dev server only), so the match
// screen can be worked on and screenshot before the app router exists:
// http://localhost:<port>/src/client/match/dev/screen.html?moment=bibi
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import "../../styles.css";
import "../../components/app.css";
import DevPreview from "./DevPreview";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Shared pieces (the lobby header) link with the router; a memory router keeps them on this page. */}
    <MemoryRouter>
      <DevPreview />
    </MemoryRouter>
  </StrictMode>,
);
