// SPA entry: TanStack Query plus the router.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { APP_NAME } from "@shared/brand";
import { createQueryClient } from "./lib/queries";
import { createAppRouter } from "./router";
import "./styles.css";
import "./components/app.css";

document.title = APP_NAME;

const queryClient = createQueryClient();
const router = createAppRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
