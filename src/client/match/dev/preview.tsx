// Standalone entry for the match preview (dev server only), so the match
// screen can be worked on and screenshot before the app router exists:
// http://localhost:<port>/src/client/match/dev/screen.html?moment=zeus
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles.css";
import DevPreview from "./DevPreview";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DevPreview />
  </StrictMode>,
);
