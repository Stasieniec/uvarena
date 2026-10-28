// Onboarding: a username for Google sign-ups (names prefilled from Google),
// then the course picker.
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@shared/api-schemas";
import { PersonNameSchema, UsernameSchema } from "@shared/api-schemas";
import { LIMITS } from "@shared/game/config";
import { ApiRequestError, apiRequest, errorMessage } from "../lib/api";
import { useCurrentCourse } from "../lib/course";
import { formatRating } from "../lib/format";
import { qk, useMeData, useUpdatePrefs } from "../lib/queries";
import { CoursePicker } from "../components/CoursePicker";
import { ArrowRightIcon } from "../components/icons";
import { Button, ErrorState, FormError, LoadingPlates, TextField } from "../components/ui";
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

  const shown = username.trim() || me.user.firstName || "?";
  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4" noValidate>
      <h1 className="font-display text-5xl leading-[48px] font-bold">Pick a username</h1>
      <p className="text-base leading-6 text-muted">Your opponents see it in every duel. Names come from your Google account.</p>
      {/* How opponents will see you: updates as you type. */}
      <div className="plate mt-2 flex items-center gap-3.5 p-4" aria-hidden>
        <span className="font-display flex size-14 shrink-0 items-center justify-center rounded-full bg-you text-[28px] font-bold text-bg">
          {shown.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-display truncate text-2xl leading-7 font-bold tracking-[0.02em] uppercase">{shown}</span>
          <span className="truncate text-sm leading-5 text-muted">
            {[firstName.trim(), lastName.trim()].filter(Boolean).join(" ")}
            {firstName.trim() || lastName.trim() ? " · " : ""}
            {formatRating(null, true)} ranked
          </span>
        </span>
      </div>
      <TextField
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={fieldError.username}
        hint={`${LIMITS.usernameMin} to ${LIMITS.usernameMax} characters: letters, digits, dots and underscores.`}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} error={fieldError.firstName} />
        <TextField label="Surname" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} error={fieldError.lastName} />
      </div>
      <FormError message={generalError} />
      <div className="flex-1" />
      <Button type="submit" loading={save.isPending}>
        Start playing
        <ArrowRightIcon size={20} strokeWidth={2.4} />
      </Button>
    </form>
  );
}

function CourseStep({ next }: { next: string }) {
  const navigate = useNavigate();
  const { courses, courseId, hasPicked, isLoading, error, refetch } = useCurrentCourse();
  const update = useUpdatePrefs();
  const pick = (id: string) =>
    update.mutate({ courseId: id }, { onSuccess: () => navigate(next, { replace: true }) });
  // One course on offer: nothing to choose, so it is picked for you.
  const only = courses.length === 1 ? courses[0]!.id : null;
  useEffect(() => {
    if (only && !hasPicked && update.isIdle) pick(only);
    // pick is recreated every render; the course id and the mutation state decide.
  }, [only, hasPicked, update.isIdle]);
  if (isLoading) return <LoadingPlates count={2} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (only && !update.isError) return <LoadingPlates count={2} />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-5xl leading-[48px] font-bold">Pick a course</h1>
      <p className="text-base leading-6 text-muted">Which course first? You can switch any time.</p>
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
    <main className="flex min-h-dvh flex-col px-4 pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {me.needsOnboarding ? <UsernameStep me={me} /> : <CourseStep next={next} />}
    </main>
  );
}
