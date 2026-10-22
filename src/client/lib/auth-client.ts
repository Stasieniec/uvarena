// Better Auth client with the username plugin. Same origin, base path /api/auth.
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    usernameClient(),
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: true },
        lastName: { type: "string", required: true },
      },
    }),
  ],
});

/** Better Auth error codes we show a specific line for. Anything else uses its message. */
const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Wrong email or password.",
  INVALID_USERNAME_OR_PASSWORD: "Wrong username or password.",
  USER_ALREADY_EXISTS: "An account with this email already exists. Log in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Log in instead.",
  USERNAME_IS_ALREADY_TAKEN: "That username is taken.",
  USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER: "That username is taken.",
  PASSWORD_TOO_SHORT: "Password is too short.",
  INVALID_EMAIL: "That email address does not look right.",
  INVALID_TOKEN: "This link is invalid or has expired.",
};

export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Something went wrong.";
  if (error.status === 429) return "Too many tries. Wait a minute and try again.";
  if (error.code && AUTH_MESSAGES[error.code]) return AUTH_MESSAGES[error.code]!;
  return error.message || "Something went wrong.";
}
