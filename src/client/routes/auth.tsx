// Sign up, log in and password reset. Email and password, plus Google when
// /api/config says it is enabled.
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { APP_NAME } from "@shared/brand";
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

function AuthLayout({ title, children, footer, hint }: { title: string; children: ReactNode; footer: ReactNode; hint?: string | null }) {
  return (
    <main className="flex min-h-dvh flex-col px-4 pt-2 pb-8">
      <div className="flex min-h-14 items-center">
        <Link to="/" className="flex size-12 items-center justify-center rounded-xl text-muted hover:text-text" aria-label="Back">
          <BackIcon />
        </Link>
        <span className="font-display text-lg font-bold text-gold">{APP_NAME}</span>
      </div>
      <div className="mx-auto flex w-full flex-1 flex-col px-2 pt-4">
        <h1 className={`font-display text-3xl font-bold ${hint ? "mb-2" : "mb-6"}`}>{title}</h1>
        {hint ? <p className="mb-6 text-sm font-medium text-ranked-gold">{hint}</p> : null}
        {children}
        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </div>
    </main>
  );
}

function GoogleButton({ next }: { next: string }) {
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
  return (
    <>
      <Button variant="google" className="w-full" onClick={go} loading={busy}>
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continue with Google
      </Button>
      <FormError message={error} />
      <div className="my-5 flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
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
          <Link to={withNext("/login", next)} className="inline-flex min-h-tap items-center px-1 font-semibold text-you">
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
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
          hint="Shown to other players"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="First name" autoComplete="given-name" value={form.firstName} onChange={set("firstName")} error={errors.firstName} />
          <TextField label="Surname" autoComplete="family-name" value={form.lastName} onChange={set("lastName")} error={errors.lastName} />
        </div>
        <FormError message={formError} />
        <Button type="submit" variant="primary" loading={busy} className="mt-2 text-lg">
          Sign up
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
          New here?{" "}
          <Link to={withNext("/signup", next)} className="inline-flex min-h-tap items-center px-1 font-semibold text-you">
            Sign up
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Email or username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={id} onChange={(e) => setId(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={formError} />
        <Button type="submit" loading={busy} className="mt-2 text-lg">
          Log in
        </Button>
        <Link to="/reset-password" className="flex min-h-tap items-center justify-center text-sm text-muted hover:text-text">
          Forgot password?
        </Link>
      </form>
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
    <Link to="/login" className="inline-flex min-h-tap items-center px-1 font-semibold text-you">
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
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
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
        <p className="text-muted">Password reset by email is not available yet. Message Stas and he will set a temporary password for you.</p>
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
        <p className="text-muted">If that email has an account, a reset link is on its way.</p>
      ) : (
        <form onSubmit={request} className="flex flex-col gap-4" noValidate>
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
