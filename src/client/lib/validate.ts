// Sign-up form validation. Pure, unit tested.
import { PersonNameSchema, UsernameSchema } from "@shared/api-schemas";
import { LIMITS } from "@shared/game/config";

export interface SignUpErrors {
  email?: string;
  password?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export function validateSignUp(v: { email: string; password: string; username: string; firstName: string; lastName: string }): SignUpErrors {
  const e: SignUpErrors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = "Enter an email address.";
  if (v.password.length < LIMITS.passwordMin) e.password = `At least ${LIMITS.passwordMin} characters.`;
  const u = UsernameSchema.safeParse(v.username);
  if (!u.success) e.username = `${LIMITS.usernameMin} to ${LIMITS.usernameMax} characters: letters, digits, underscore and dot.`;
  if (!PersonNameSchema.safeParse(v.firstName).success) e.firstName = "Enter your first name.";
  if (!PersonNameSchema.safeParse(v.lastName).success) e.lastName = "Enter your surname.";
  return e;
}
