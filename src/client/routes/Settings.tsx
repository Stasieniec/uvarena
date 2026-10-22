// Settings: picture (upload with square crop, or remove), username and names,
// sound, account, log out.
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AVATAR_CONTENT_TYPES, PersonNameSchema, UsernameSchema, type MeResponse } from "@shared/api-schemas";
import { LIMITS } from "@shared/game/config";
import { ApiRequestError, apiRequest, errorMessage, uploadAvatar } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { readSoundPref, writeSoundPref } from "../lib/local-prefs";
import { qk, useConfig, useMeData, useUpdatePrefs } from "../lib/queries";
import { Page } from "../components/AppShell";
import { Avatar } from "../components/Avatar";
import { AvatarCropper } from "../components/AvatarCropper";
import { CameraIcon } from "../components/icons";
import { Button, FormError, PageHeader, SectionTitle, Sheet, Switch, TextField } from "../components/ui";

function PictureSection() {
  const me = useMeData();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const setImage = (image: string | null) => {
    const cur = qc.getQueryData<MeResponse>(qk.me);
    if (cur) qc.setQueryData<MeResponse>(qk.me, { ...cur, user: { ...cur.user, image } });
    void qc.invalidateQueries({ queryKey: ["user"] });
  };

  const upload = useMutation({
    mutationFn: (blob: Blob) => uploadAvatar(blob),
    onSuccess: (res) => {
      setImage(res.image);
      setFile(null);
    },
  });
  const remove = useMutation({
    mutationFn: () => apiRequest("deleteAvatar"),
    onSuccess: (res) => setImage(res.image),
  });

  return (
    <section className="flex flex-col items-center gap-3">
      <Avatar user={me.user} size={96} ring="var(--color-you)" />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => input.current?.click()}>
          <CameraIcon size={18} />
          {me.user.image ? "Change picture" : "Add a picture"}
        </Button>
        {me.user.image ? (
          <Button variant="ghost" onClick={() => remove.mutate()} loading={remove.isPending}>
            Remove
          </Button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept={["image/*", ...AVATAR_CONTENT_TYPES].join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            upload.reset();
            setFile(f);
          }
        }}
      />
      <FormError message={remove.error ? errorMessage(remove.error) : null} />
      <Sheet open={file !== null} onClose={() => !upload.isPending && setFile(null)} title="Crop your picture">
        {file ? (
          <>
            <AvatarCropper file={file} onCancel={() => setFile(null)} onDone={(blob) => upload.mutate(blob)} busy={upload.isPending} />
            <div className="mt-3">
              <FormError message={upload.error ? errorMessage(upload.error) : null} />
            </div>
          </>
        ) : null}
      </Sheet>
    </section>
  );
}

function ProfileForm() {
  const me = useMeData();
  const qc = useQueryClient();
  const [username, setUsername] = useState(me.user.displayUsername ?? me.user.username ?? "");
  const [firstName, setFirstName] = useState(me.user.firstName);
  const [lastName, setLastName] = useState(me.user.lastName);
  const [errors, setErrors] = useState<{ username?: string; firstName?: string; lastName?: string }>({});
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (body: { username?: string; firstName?: string; lastName?: string }) => apiRequest("patchMe", { body }),
    onSuccess: (res) => {
      const cur = qc.getQueryData<MeResponse>(qk.me);
      if (cur) qc.setQueryData<MeResponse>(qk.me, { ...cur, user: res.user });
      void qc.invalidateQueries({ queryKey: ["user"] });
      setSaved(true);
    },
    onError: (err) => {
      if (err instanceof ApiRequestError && err.code === "username_taken") setErrors({ username: "That username is taken." });
    },
  });

  const body: { username?: string; firstName?: string; lastName?: string } = {};
  if (username.trim() !== (me.user.displayUsername ?? me.user.username ?? "")) body.username = username.trim();
  if (firstName.trim() !== me.user.firstName) body.firstName = firstName.trim();
  if (lastName.trim() !== me.user.lastName) body.lastName = lastName.trim();
  const dirty = Object.keys(body).length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (body.username !== undefined && !UsernameSchema.safeParse(body.username).success)
      errs.username = `${LIMITS.usernameMin} to ${LIMITS.usernameMax} characters: letters, digits, underscore and dot.`;
    if (body.firstName !== undefined && !PersonNameSchema.safeParse(body.firstName).success) errs.firstName = "Enter your first name.";
    if (body.lastName !== undefined && !PersonNameSchema.safeParse(body.lastName).success) errs.lastName = "Enter your surname.";
    setErrors(errs);
    setSaved(false);
    if (Object.keys(errs).length === 0 && dirty) save.mutate(body);
  };

  const other = save.error && !(save.error instanceof ApiRequestError && save.error.code === "username_taken") ? errorMessage(save.error) : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextField label="Username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => (setUsername(e.target.value), setSaved(false))} error={errors.username} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="First name" value={firstName} onChange={(e) => (setFirstName(e.target.value), setSaved(false))} error={errors.firstName} />
        <TextField label="Surname" value={lastName} onChange={(e) => (setLastName(e.target.value), setSaved(false))} error={errors.lastName} />
      </div>
      <FormError message={other} />
      <Button type="submit" disabled={!dirty} loading={save.isPending}>
        {saved && !dirty ? "Saved" : "Save"}
      </Button>
    </form>
  );
}

export function Settings() {
  const me = useMeData();
  const config = useConfig();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const update = useUpdatePrefs();
  const [sound, setSound] = useState(() => readSoundPref() ?? me.prefs.sound);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const logout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    const { error } = await authClient.signOut();
    if (error) {
      setLoggingOut(false);
      setLogoutError("Could not log out. Try again.");
      return;
    }
    qc.clear();
    navigate("/", { replace: true });
  };

  return (
    <Page>
      <PageHeader title="Settings" back="/profile" />
      <PictureSection />
      <SectionTitle>Profile</SectionTitle>
      <ProfileForm />
      <SectionTitle>Game</SectionTitle>
      <div className="rounded-2xl border border-border bg-surface px-4">
        <Switch
          checked={sound}
          onChange={(v) => {
            setSound(v);
            writeSoundPref(v);
            update.mutate({ sound: v });
          }}
          label="Sound"
          description="Effects during matches, on this device"
        />
      </div>
      <SectionTitle>Account</SectionTitle>
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
        <p className="truncate">{me.user.email}</p>
        <p className="text-muted">
          {me.user.emailVerified ? "Verified" : config.data?.emailEnabled ? "Not verified yet. Check your inbox." : "Not verified"}
        </p>
      </div>
      <FormError message={logoutError} />
      <Button variant="danger" className="mt-6 w-full" onClick={logout} loading={loggingOut}>
        Log out
      </Button>
    </Page>
  );
}
