// Email through the send_email binding (Cloudflare Email Service).
//
// The binding only delivers to arbitrary addresses once the sending domain is
// onboarded, so sending is opt-in: emailEnabled() is true only when the
// EMAIL_ENABLED var is "1" and the binding exists. Until then /api/config
// reports emailEnabled: false, sign-up sends no verification email and
// password reset is refused with an explanation (see auth.ts and index.ts).
//
// sendEmail never throws: a failure is logged and reported as false, so a
// broken mail setup can never block sign-up.
import { APP_NAME } from "../shared/brand";
import type { Env } from "./env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Sender address; must be listed in wrangler.jsonc send_email.allowed_sender_addresses. */
export const EMAIL_FROM_ADDRESS = "noreply@swasilewski.com";

/**
 * EMAIL_ENABLED is not in the frozen Env contract yet (requested from the
 * orchestrator); read it through a local widening until it is.
 */
type EnvWithEmailFlag = Env & { EMAIL_ENABLED?: string };

/** Whether email sending is set up (reported as emailEnabled by /api/config). */
export function emailEnabled(env: Env): boolean {
  return (env as EnvWithEmailFlag).EMAIL_ENABLED === "1" && typeof env.EMAIL?.send === "function";
}

/** Sends one email. Logs and returns false on a missing binding or any failure; never throws. */
export async function sendEmail(env: Env, msg: OutgoingEmail): Promise<boolean> {
  if (!emailEnabled(env)) {
    console.warn(`email: not sent (email disabled): ${msg.subject}`);
    return false;
  }
  try {
    await env.EMAIL.send({
      from: { name: APP_NAME, email: EMAIL_FROM_ADDRESS },
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
    return true;
  } catch (err) {
    console.error("email: send failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Verification email body. */
export function verificationEmail(to: string, url: string): OutgoingEmail {
  return {
    to,
    subject: `Verify your ${APP_NAME} email`,
    text: `Open this link to verify your email address:\n\n${url}\n\nIf you did not sign up, ignore this email.`,
  };
}

/** Password reset email body. */
export function resetPasswordEmail(to: string, url: string): OutgoingEmail {
  return {
    to,
    subject: `Reset your ${APP_NAME} password`,
    text: `Open this link to choose a new password:\n\n${url}\n\nIf you did not ask for this, ignore this email.`,
  };
}
