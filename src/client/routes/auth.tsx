// Sign up, log in and password reset. Email and password, plus Google when
// /api/config says it is enabled.
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LIMITS } from "@shared/game/config";
import { authClient, authErrorMessage } from "../lib/auth-client";
import { qk, useConfig } from "../lib/queries";
import { BackIcon } from "../components/icons";
import { Button, FormError, TextField } from "../components/ui";
import { safeNext, withNext } from "./guards";
import { validateSignUp, type SignUpErrors } from "../lib/validate";

/** "Log in to join the duel" when the visitor arrived from a /join/CODE link. */
function joinHint(next: string, verb: string): string | null {
  const m = /^\/join\/([A-Za-z0-9]+)/.exec(next);
  return m ? `${verb} to join the duel. Code ${m[1]!.toUpperCase()}.` : null;
}

/**
 * The auth screens: a 56 px bar with Back and the title, then the form, which
 * fills the screen so its primary button and the footer line sit at the bottom.
 */
function AuthLayout({ title, children, footer, hint }: { title: string; children: ReactNode; footer: ReactNode; hint?: string | null }) {
  return (
    <main className="flex min-h-dvh flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex h-14 flex-none items-center gap-1 px-1">
        <Link to="/" className="flex size-11 items-center justify-center text-text" aria-label="Back">
          <BackIcon size={22} />
        </Link>
        <h1 className="font-display min-w-0 flex-1 truncate text-[28px] leading-8 font-bold">{title}</h1>
      </header>
      <div className="flex flex-1 flex-col gap-3.5 px-4 pt-1">
        {hint ? <p className="text-[15px] leading-[22px] font-semibold">{hint}</p> : null}
        {children}
        <p className="text-center text-[15px] leading-[22px] text-muted">{footer}</p>
      </div>
    </main>
  );
}

function OrLine() {
  return (
    <div aria-hidden className="flex items-center gap-3 text-sm text-muted">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** The footer link: text colour, semibold, with a full-height tap area. */
const footerLink = "-my-3 inline-block px-1 py-3 font-semibold text-text";

/** "Continue with Google" and the "or" line, above the form (sign up) or below it (log in). */
function GoogleButton({ next, below }: { next: string; below?: boolean }) {
  const config = useConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!config.data?.googleEnabled) return null;
  const go = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
      newUserCallbackURL: withNext("/onboarding", next),
      errorCallbackURL: "/login?error=google",
    });
    if (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };
  const button = (
    <Button variant="google" className="min-h-13 w-full" onClick={go} loading={busy}>
      Continue with Google
    </Button>
  );
  return below ? (
    <>
      <OrLine />
      {button}
      <FormError message={error} />
    </>
  ) : (
    <>
      {button}
      <FormError message={error} />
      <OrLine />
    </>
  );
}

function useFinishAuth(next: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.resetQueries({ queryKey: qk.me });
    await qc.fetchQuery({ queryKey: qk.me }).catch(() => undefined);
    navigate(next, { replace: true });
  };
}

export function SignUp() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const finish = useFinishAuth(next);
  const [form, setForm] = useState({ email: "", password: "", username: "", firstName: "", lastName: "" });
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateSignUp(form);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const { error } = await authClient.signUp.email({
      email: form.email.trim(),
      password: form.password,
      name: `${firstName} ${lastName}`,
      username: form.username.trim(),
      firstName,
      lastName,
    });
    if (error) {
      setBusy(false);
      const msg = authErrorMessage(error);
      if (/username/i.test(error.code ?? "")) setErrors({ username: msg });
      else setFormError(msg);
      return;
    }
    await finish();
  };

  return (
    <AuthLayout
      title="Sign up"
      hint={joinHint(next, "Sign up")}
      footer={
        <>
          Have an account?{" "}
          <Link to={withNext("/login", next)} className={footerLink}>
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-3.5" noValidate>
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} error={errors.email} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          error={errors.password}
          hint={`At least ${LIMITS.passwordMin} characters`}
        />
        <TextField
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={form.username}
          onChange={set("username")}
          error={errors.username}
          hint="Shown in duels and on the leaderboard"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="First name" autoComplete="given-name" value={form.firstName} onChange={set("firstName")} error={errors.firstName} />
          <TextField label="Surname" autoComplete="family-name" value={form.lastName} onChange={set("lastName")} error={errors.lastName} />
        </div>
        <FormError message={formError} />
        <div className="min-h-2 flex-1" />
        <Button type="submit" variant="primary" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

export function LogIn() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const finish = useFinishAuth(next);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(params.get("error") === "google" ? "Google sign-in did not finish. Try again." : null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const login = id.trim();
    if (!login || !password) {
      setFormError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setFormError(null);
    const { error } = login.includes("@")
      ? await authClient.signIn.email({ email: login, password })
      : await authClient.signIn.username({ username: login, password });
    if (error) {
      setBusy(false);
      setFormError(authErrorMessage(error));
      return;
    }
    await finish();
  };

  return (
    <AuthLayout
      title="Log in"
      hint={joinHint(next, "Log in")}
      footer={
        <>
          No account yet?{" "}
          <Link to={withNext("/signup", next)} className={footerLink}>
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <TextField label="Email or username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={id} onChange={(e) => setId(e.target.value)} />
        <div className="flex flex-col">
          <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Link to="/reset-password" className="-mb-2 flex min-h-tap items-center self-end text-sm text-muted hover:text-text">
            Forgot password?
          </Link>
        </div>
        <FormError message={formError} />
        <Button type="submit" loading={busy}>
          Log in
        </Button>
      </form>
      <GoogleButton next={next} below />
      <div className="flex-1" />
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const config = useConfig();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "done">("idle");
  const [error, setError] = useState<string | null>(params.get("error") ? "This link is invalid or has expired." : null);

  const footer = (
    <Link to="/login" className={footerLink}>
      Back to log in
    </Link>
  );

  if (token) {
    const submit = async (e: FormEvent) => {
      e.preventDefault();
      if (password.length < LIMITS.passwordMin) {
        setError(`At least ${LIMITS.passwordMin} characters.`);
        return;
      }
      setState("busy");
      setError(null);
      const { error: err } = await authClient.resetPassword({ newPassword: password, token });
      if (err) {
        setState("idle");
        setError(authErrorMessage(err));
        return;
      }
      setState("done");
      navigate("/login", { replace: true });
    };
    return (
      <AuthLayout title="New password" footer={footer}>
        <form onSubmit={submit} className="flex flex-1 flex-col gap-3.5" noValidate>
          <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <FormError message={error} />
          <Button type="submit" loading={state === "busy"}>
            Save password
          </Button>
        </form>
      </AuthLayout>
    );
  }

  if (config.data && !config.data.emailEnabled) {
    return (
      <AuthLayout title="Forgot password" footer={footer}>
        <p className="flex-1 text-base leading-6 text-muted">Password reset by email is not available yet. Message Stas and he will set a temporary password for you.</p>
      </AuthLayout>
    );
  }

  const request = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter your email address.");
      return;
    }
    setState("busy");
    setError(null);
    const { error: err } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/reset-password` });
    if (err) {
      setState("idle");
      setError(authErrorMessage(err));
      return;
    }
    setState("sent");
  };

  return (
    <AuthLayout title="Forgot password" footer={footer}>
      {state === "sent" ? (
        <p className="flex-1 text-base leading-6 text-muted">If that email has an account, a reset link is on its way.</p>
      ) : (
        <form onSubmit={request} className="flex flex-1 flex-col gap-3.5" noValidate>
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <FormError message={error} />
          <Button type="submit" loading={state === "busy"} disabled={!config.data}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
