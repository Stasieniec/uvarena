// Onboarding: a username for Google sign-ups (names prefilled from Google),
// then the course picker.
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@shared/api-schemas";
import { PersonNameSchema, UsernameSchema } from "@shared/api-schemas";
import { APP_NAME } from "@shared/brand";
import { LIMITS } from "@shared/game/config";
import { ApiRequestError, apiRequest, errorMessage } from "../lib/api";
import { useCurrentCourse } from "../lib/course";
import { qk, useMeData, useUpdatePrefs } from "../lib/queries";
import { CoursePicker } from "../components/CoursePicker";
import { Button, ErrorState, FormError, LoadingBlocks, TextField } from "../components/ui";
import { safeNext } from "./guards";

function UsernameStep({ me }: { me: MeResponse }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState(me.user.firstName);
  const [lastName, setLastName] = useState(me.user.lastName);
  const [fieldError, setFieldError] = useState<{ username?: string; firstName?: string; lastName?: string }>({});
  const save = useMutation({
    mutationFn: () => apiRequest("patchMe", { body: { username: username.trim(), firstName: firstName.trim(), lastName: lastName.trim() } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.me });
    },
    onError: (err) => {
      if (err instanceof ApiRequestError && err.code === "username_taken") setFieldError({ username: "That username is taken." });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof fieldError = {};
    if (!UsernameSchema.safeParse(username).success) errs.username = `${LIMITS.usernameMin} to ${LIMITS.usernameMax} characters: letters, digits, underscore and dot.`;
    if (!PersonNameSchema.safeParse(firstName).success) errs.firstName = "Enter your first name.";
    if (!PersonNameSchema.safeParse(lastName).success) errs.lastName = "Enter your surname.";
    setFieldError(errs);
    if (Object.keys(errs).length === 0) save.mutate();
  };

  const generalError = save.error && !(save.error instanceof ApiRequestError && save.error.code === "username_taken") ? errorMessage(save.error) : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-muted">Pick the name other players will see.</p>
      <TextField
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={fieldError.username}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} error={fieldError.firstName} />
        <TextField label="Surname" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} error={fieldError.lastName} />
      </div>
      <FormError message={generalError} />
      <Button type="submit" loading={save.isPending} className="mt-2">
        Continue
      </Button>
    </form>
  );
}

function CourseStep({ next }: { next: string }) {
  const navigate = useNavigate();
  const { courses, courseId, hasPicked, isLoading, error, refetch } = useCurrentCourse();
  const update = useUpdatePrefs();
  if (isLoading) return <LoadingBlocks count={2} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const pick = (id: string) =>
    update.mutate({ courseId: id }, { onSuccess: () => navigate(next, { replace: true }) });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">Which course first? You can switch any time.</p>
      <CoursePicker courses={courses} value={hasPicked ? courseId : null} onPick={pick} busy={update.isPending} />
      <FormError message={update.error ? errorMessage(update.error) : null} />
    </div>
  );
}

export function Onboarding() {
  const me = useMeData();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  if (!me.needsOnboarding && me.prefs.courseId !== null) return <Navigate to={next} replace />;
  return (
    <main className="flex min-h-dvh flex-col px-6 pt-10 pb-8">
      <p className="font-display text-lg font-bold text-zeus">{APP_NAME}</p>
      <h1 className="font-display mt-4 mb-6 text-3xl font-bold">{me.needsOnboarding ? "Welcome" : "Pick a course"}</h1>
      {me.needsOnboarding ? <UsernameStep me={me} /> : <CourseStep next={next} />}
    </main>
  );
}
