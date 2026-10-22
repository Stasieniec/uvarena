// STUB (Worker API and auth package). Email through the send_email binding.
import { notImplemented } from "../shared/not-implemented";
import type { Env } from "./env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Sends one email. Logs and returns false on a missing binding or any failure; never throws. */
export async function sendEmail(env: Env, msg: OutgoingEmail): Promise<boolean> {
  void env; void msg;
  return notImplemented("email.sendEmail");
}

/** Whether email sending is set up (reported as emailEnabled by /api/config). */
export function emailEnabled(env: Env): boolean {
  void env;
  return notImplemented("email.emailEnabled");
}
