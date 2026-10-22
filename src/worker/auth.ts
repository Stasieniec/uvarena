// Better Auth on the Drizzle adapter over D1, built per request by
// createAuth(db, env). No module-level Cloudflare imports, so auth.cli.ts can
// load the same options in Node for `npx auth@1.7.12 generate`.
//
// baseURL and trustedOrigins: production uses APP_URL only. When APP_URL is a
// localhost URL (dev, E2E under `vite preview` on :4173, workerd tests), the
// base URL follows the request's localhost host and any localhost origin is
// trusted, so the same .dev.vars works on :5173 and :4173. See
// middleware/origin.ts.
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins/username";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { LIMITS } from "../shared/game/config";
import { APP_NAME } from "../shared/brand";
import * as authSchema from "./db/auth-schema";
import { emailEnabled, resetPasswordEmail, sendEmail, verificationEmail } from "./email";
import type { Env } from "./env";
import { appOrigin, isAllowedOriginValue, isLocalApp } from "./middleware/origin";

export const AUTH_BASE_PATH = "/api/auth";

// Standard Schema validators for the name fields (zod 4 implements it). Better
// Auth stores the validator's output, so names are saved trimmed.
const firstNameSchema = z.string().trim().min(LIMITS.nameMin).max(LIMITS.nameMax);
/**
 * Google accounts can lack a family name, so the field itself allows empty;
 * email sign-up requires one (the before hook in authOptions).
 */
const lastNameSchema = z.string().trim().max(LIMITS.nameMax);

export interface AuthRuntime {
  /** ctx.waitUntil, so verification emails are sent after the response. */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Whether Google sign-in is configured (both secrets set). */
export function googleEnabled(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

const clampName = (s: string | undefined | null) => (s ?? "").trim().slice(0, LIMITS.nameMax);

/** The Google profile fields the app keeps. Exported for the unit test. */
export function mapGoogleProfile(profile: {
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}): { firstName: string; lastName: string; image?: string } {
  const given = clampName(profile.given_name);
  const family = clampName(profile.family_name);
  // Some Google accounts have only a display name.
  const firstName = given || clampName(profile.name?.split(/\s+/)[0]) || "Player";
  return { firstName, lastName: family, ...(profile.picture ? { image: profile.picture } : {}) };
}

/** First name + surname, as stored in user.name. */
export function fullName(firstName: unknown, lastName: unknown): string {
  return [firstName, lastName]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim())
    .join(" ");
}

function validUsername(value: string): boolean {
  return LIMITS.usernamePattern.test(value);
}

/**
 * Secrets that must never sign production sessions: Better Auth's public
 * fallback (used when `secret` is empty) and the example dev secret.
 */
const KNOWN_SECRETS = new Set(["better-auth-secret-12345678901234567890", "dev-only-secret-change-me-0123456789abcdef"]);

/**
 * Why BETTER_AUTH_SECRET cannot be used, or null when it can. A local app
 * (dev, tests) accepts anything; a deployed one needs a real secret of at
 * least LIMITS.authSecretMin characters. Without this check Better Auth falls
 * back to its public default secret on Workers, which lets anyone forge
 * sessions.
 */
export function authSecretProblem(env: Env): string | null {
  if (isLocalApp(env)) return null;
  const secret = typeof env.BETTER_AUTH_SECRET === "string" ? env.BETTER_AUTH_SECRET.trim() : "";
  if (secret.length === 0) return "BETTER_AUTH_SECRET is not set";
  if (secret.length < LIMITS.authSecretMin) return `BETTER_AUTH_SECRET is shorter than ${LIMITS.authSecretMin} characters`;
  if (KNOWN_SECRETS.has(secret)) return "BETTER_AUTH_SECRET is a published example value";
  return null;
}

/** Better Auth's user fields that only the app's own endpoints (PATCH /me, PUT /me/avatar) may write. */
const APP_OWNED_USER_FIELDS = ["image", "name", "displayUsername", "username"] as const;

function badRequest(code: string, message: string): never {
  throw APIError.from("BAD_REQUEST", { code, message });
}

/**
 * Sign-up takes username, names, email and password. image and
 * displayUsername are refused (the display name is the username as typed),
 * and username must be a string so the plugin's validator always runs.
 */
function checkSignUpBody(body: Record<string, unknown>): void {
  const last = typeof body.lastName === "string" ? body.lastName.trim() : "";
  if (last.length < LIMITS.nameMin) badRequest("SURNAME_REQUIRED", "Surname is required");
  if (typeof body.username !== "string") badRequest("USERNAME_REQUIRED", "Username is required");
  if (body.image !== undefined && body.image !== null) badRequest("FIELD_NOT_ALLOWED", "Upload a picture from your profile instead");
  if (body.displayUsername !== undefined && body.displayUsername !== body.username) {
    badRequest("FIELD_NOT_ALLOWED", "displayUsername cannot be set");
  }
}

/** The Better Auth options; shared by createAuth and auth.cli.ts. */
export function authOptions(db: D1Database, env: Env, runtime: AuthRuntime = {}) {
  const local = isLocalApp(env);
  const email = emailEnabled(env);
  const google = googleEnabled(env);

  const background = (p: Promise<unknown>) => {
    if (runtime.waitUntil) runtime.waitUntil(p);
    else void p;
  };

  return {
    appName: APP_NAME,
    secret: env.BETTER_AUTH_SECRET,
    basePath: AUTH_BASE_PATH,
    baseURL: local
      ? {
          allowedHosts: ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*"],
          protocol: "http" as const,
          fallback: env.APP_URL,
        }
      : env.APP_URL,
    trustedOrigins: (request?: Request) => {
      const origins: string[] = [appOrigin(env)];
      const origin = request?.headers.get("Origin");
      if (local && origin && isAllowedOriginValue(origin, env)) origins.push(origin);
      return origins;
    },
    database: drizzleAdapter(drizzle(db, { schema: authSchema }), {
      provider: "sqlite",
      schema: authSchema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: LIMITS.passwordMin,
      requireEmailVerification: false,
      autoSignIn: true,
      ...(email
        ? {
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
              background(sendEmail(env, resetPasswordEmail(user.email, url)));
            },
          }
        : {}),
    },
    emailVerification: {
      sendOnSignUp: email,
      // Verification links sign the user in only once email is really on.
      autoSignInAfterVerification: email,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        // Non-blocking: sign-up never waits for, or fails on, the email.
        background(sendEmail(env, verificationEmail(user.email, url)));
      },
    },
    user: {
      additionalFields: {
        firstName: {
          type: "string",
          required: true,
          input: true,
          validator: { input: firstNameSchema },
        },
        lastName: {
          type: "string",
          required: true,
          input: true,
          validator: { input: lastNameSchema },
        },
        role: { type: "string", required: false, input: false, defaultValue: "user" },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // user.name is always "first surname", whatever the client sent.
          before: async (user: Record<string, unknown>) => {
            const name = fullName(user.firstName, user.lastName);
            return { data: { ...user, name: name || String(user.name ?? "") } };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        if (ctx.path === "/sign-up/email") checkSignUpBody(body);
        // Better Auth's own profile update would skip the app's rules (name
        // recomputed from the names, avatar URLs owned by the uploader,
        // display name matching the username). The app never calls it.
        if (ctx.path === "/update-user") {
          const fields = APP_OWNED_USER_FIELDS.filter((f) => body[f] !== undefined);
          throw APIError.from("FORBIDDEN", {
            code: "USE_APP_PROFILE",
            message: fields.length > 0 ? `Change ${fields.join(", ")} from your profile` : "Change your profile from the profile page",
          });
        }
      }),
    },
    socialProviders: google
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID as string,
            clientSecret: env.GOOGLE_CLIENT_SECRET as string,
            prompt: "select_account" as const,
            mapProfileToUser: (profile: { given_name?: string; family_name?: string; name?: string; picture?: string }) =>
              mapGoogleProfile(profile),
          },
        }
      : {},
    session: {
      expiresIn: LIMITS.sessionDays * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    // AUTH_LIMITER (middleware/rate-limit.ts) does this per IP across isolates.
    rateLimit: { enabled: false },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      ...(runtime.waitUntil ? { backgroundTasks: { handler: runtime.waitUntil } } : {}),
    },
    plugins: [
      username({
        minUsernameLength: LIMITS.usernameMin,
        maxUsernameLength: LIMITS.usernameMax,
        usernameValidator: validUsername,
        displayUsernameValidator: validUsername,
      }),
    ],
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

/** Better Auth for one request. Throws when the secret is unusable (authSecretProblem). */
export function createAuth(db: D1Database, env: Env, runtime: AuthRuntime = {}) {
  const problem = authSecretProblem(env);
  if (problem) throw new Error(`auth misconfigured: ${problem}`);
  return betterAuth(authOptions(db, env, runtime));
}

export type Auth = ReturnType<typeof createAuth>;
