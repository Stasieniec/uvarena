// Settings: picture (upload with square crop, or remove), username and names
// with Save, the sound switch, the email and its verification, Log out, and
// the Credits link.
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AVATAR_CONTENT_TYPES, PersonNameSchema, UsernameSchema, type MeResponse } from "@shared/api-schemas";
import { LIMITS } from "@shared/game/config";
import { ApiRequestError, apiRequest, errorMessage, uploadAvatar } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { readSoundPref, writeSoundPref } from "../lib/local-prefs";
import { qk, useConfig, useMeData, useUpdatePrefs } from "../lib/queries";
import { Body, Icon, Screen } from "../components/after/ui";
import { Avatar } from "../components/Avatar";
import { AvatarCropper } from "../components/AvatarCropper";
import { FormError, PageHeader, Primary, Sheet, Switch, TextField, buttonClass, cx } from "../components/ui";

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
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-3.5">
        <Avatar user={me.user} size={64} you />
        <button type="button" className={buttonClass("secondary", "min-h-11 px-3.5 text-[15px]")} onClick={() => input.current?.click()}>
          <Icon name="camera" size={18} />
          {me.user.image ? "Change picture" : "Add a picture"}
        </button>
        {me.user.image ? (
          <button type="button" className={buttonClass("ghost", "min-h-11 px-2 text-[15px]")} onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remove
          </button>
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
    <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
      <TextField label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => (setUsername(e.target.value), setSaved(false))} error={errors.username} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="First name" autoComplete="given-name" value={firstName} onChange={(e) => (setFirstName(e.target.value), setSaved(false))} error={errors.firstName} />
        <TextField label="Surname" autoComplete="family-name" value={lastName} onChange={(e) => (setLastName(e.target.value), setSaved(false))} error={errors.lastName} />
      </div>
      <FormError message={other} />
      <Primary type="submit" height={52} disabled={!dirty} busy={save.isPending}>
        {saved && !dirty ? "Saved" : "Save"}
      </Primary>
    </form>
  );
}

/** Your email, whether it is verified, and Resend email while it is not. */
function EmailRow({ email, verified, canSend }: { email: string; verified: boolean; canSend: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const resend = async () => {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/" });
    setState(error ? "failed" : "sent");
  };
  const line = verified ? "Verified" : state === "sent" ? "Sent. Check your inbox." : state === "failed" ? "Could not send it. Try again later." : "Not verified";
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-line">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base leading-[22px] font-semibold">{email}</span>
        <span className="text-sm leading-5 text-muted">{line}</span>
      </span>
      {!verified && canSend && state !== "sent" ? (
        <button type="button" className={buttonClass("ghost", "min-h-11 px-1 text-[15px]")} onClick={resend} disabled={state === "sending"}>
          Resend email
        </button>
      ) : null}
    </div>
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
    <Screen>
      <PageHeader title="Settings" back="/profile" />
      <Body className="gap-3.5 pb-4">
        <PictureSection />
        <ProfileForm />
        <div className="flex flex-col">
          <div className="border-b border-line">
            <Switch
              label="Sound"
              description="Effects during matches, on this device"
              checked={sound}
              onChange={(v) => {
                setSound(v);
                writeSoundPref(v);
                update.mutate({ sound: v });
              }}
            />
          </div>
          <EmailRow email={me.user.email} verified={me.user.emailVerified} canSend={config.data?.emailEnabled === true} />
        </div>
        <FormError message={logoutError} />
        <span className="flex-1" />
        <div className="flex items-center justify-between">
          <button type="button" className={buttonClass("ghost", "px-0")} onClick={logout} disabled={loggingOut}>
            <Icon name="logout" size={18} />
            {loggingOut ? "Logging out" : "Log out"}
          </button>
          <Link to="/credits" className="flex h-11 items-center text-[15px] text-muted hover:text-text">
            Credits
          </Link>
        </div>
      </Body>
    </Screen>
  );
}
