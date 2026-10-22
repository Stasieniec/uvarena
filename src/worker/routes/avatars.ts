// STUB (Worker API and auth package). Mounted under /api by src/worker/index.ts.
// Request and response shapes: src/shared/api-schemas.ts (endpoints table).
import { Hono } from "hono";
import type { HonoEnv } from "../env";

export const avatarsRoutes = new Hono<HonoEnv>();
