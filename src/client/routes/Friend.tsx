// Duel a friend: create a lobby (settings, then straight into the lobby, which
// shows the code and Share) or join one by code. /join/:code links land in JoinLink below.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { JoinCodeSchema } from "@shared/api-schemas";
import { LIMITS, MATCH } from "@shared/game/config";
import { ApiRequestError, apiRequest, errorMessage, isUnauthorised } from "../lib/api";
import { useCurrentCourse } from "../lib/course";
import { normaliseJoinCode } from "../lib/format";
import { qk, useMe } from "../lib/queries";
import { CodePlates } from "../components/CodePlates";
import { ArrowRightIcon, ClockIcon } from "../components/icons";
import { LectureMultiChip } from "../components/LectureFilter";
import { Button, ErrorState, FormError, FullScreenLoader, HeaderTag, PageHeader, Pills, Switch, buttonClass } from "../components/ui";
import { withNext } from "./guards";
import { effectiveRated } from "../lib/lobby";

function AlreadyInMatch({ error }: { error: unknown }) {
  const navigate = useNavigate();
  const id = error instanceof ApiRequestError && error.code === "already_in_match" ? error.body?.error.matchId : null;
  if (!error) return null;
  return (
    <div className="flex items-center gap-3 rounded-sm px-4 py-2 text-[15px] shadow-[inset_0_0_0_1px_var(--color-wrong)]" role="alert">
      <span className="flex-1">{errorMessage(error)}</span>
      {id ? (
        <Button variant="secondary" onClick={() => navigate(`/match/${id}`)}>
          Back to it
        </Button>
      ) : null}
    </div>
  );
}

/** The page frame for the friend screens: no bottom bar, Back in the header. */
function FriendPage({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <PageHeader title={title} back="/" right={right} />
      <div className="flex flex-1 flex-col gap-3.5">{children}</div>
    </main>
  );
}

interface CreateSettings {
  lectures: string[] | null;
  setLectures: (v: string[] | null) => void;
  powerups: boolean;
  setPowerups: (v: boolean) => void;
  rated: boolean;
  setRated: (v: boolean) => void;
}

function CreateTab({ settings }: { settings: CreateSettings }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { course, courseId } = useCurrentCourse();
  const { lectures, setLectures, powerups, setPowerups, rated, setRated } = settings;
  const custom = lectures !== null || !powerups;
  const willBeRated = effectiveRated(rated, lectures, powerups);

  const create = useMutation({
    mutationFn: () => apiRequest("createLobby", { body: { courseId: courseId!, lectures, powerups, rated: willBeRated } }),
    // Straight into the lobby: it shows the code, Share, and who has joined.
    onSuccess: ({ matchId }) => {
      void qc.invalidateQueries({ queryKey: qk.me });
      navigate(`/match/${encodeURIComponent(matchId)}`);
    },
  });

  return (
    <>
      <p className="mt-2.5 text-[15px] leading-[22px] text-muted">
        Create a code, then send it or the link to your friend. You both land in the lobby.
      </p>
      <div className="flex flex-col">
        <LectureMultiChip course={course} value={lectures} onChange={setLectures} variant="row" />
        <div className="border-b border-line">
          <Switch checked={powerups} onChange={setPowerups} label="Power-ups" />
        </div>
        <div className="border-b border-line">
          <Switch
            checked={willBeRated}
            onChange={setRated}
            disabled={custom}
            label="Rated"
            description={custom ? "Custom settings make it unrated." : "Counts for both ranked ratings"}
          />
        </div>
      </div>
      <AlreadyInMatch error={create.error && create.error instanceof ApiRequestError && create.error.code === "already_in_match" ? create.error : null} />
      <FormError message={create.error && !(create.error instanceof ApiRequestError && create.error.code === "already_in_match") ? errorMessage(create.error) : null} />
      <div className="flex-1" />
      <Button variant="primary" onClick={() => create.mutate()} loading={create.isPending} disabled={!courseId}>
        Create
      </Button>
      <p className="flex items-center justify-center gap-2 text-sm leading-5 text-muted">
        <ClockIcon size={16} strokeWidth={1.8} />
        The code expires after {Math.round(MATCH.lobbyTtlMs / 60000)} minutes if nobody joins.
      </p>
    </>
  );
}

function JoinTab({ initial }: { initial: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState(normaliseJoinCode(initial));
  const [dropped, setDropped] = useState(false);
  const join = useMutation({
    mutationFn: (c: string) => apiRequest("joinLobby", { body: { code: c } }),
    onSuccess: ({ matchId }) => {
      void qc.invalidateQueries({ queryKey: qk.me });
      navigate(`/match/${matchId}`);
    },
  });
  const valid = JoinCodeSchema.safeParse(code).success;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) join.mutate(code);
  };
  return (
    <form onSubmit={submit} className="contents">
      <div className="mt-2.5 flex flex-col gap-2">
      <label htmlFor="join-code" className="text-sm leading-5 text-muted">
        Code from your friend
      </label>
      <input
        id="join-code"
        value={code}
        onChange={(e) => {
          const raw = e.target.value.replace(/[\s-]/g, "");
          const next = normaliseJoinCode(raw);
          // Codes skip 0, O, 1 and I so nobody misreads them; say so instead of eating the character silently.
          setDropped(next.length < Math.min(raw.length, LIMITS.joinCodeLength));
          setCode(next);
        }}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        maxLength={LIMITS.joinCodeLength + 4}
        placeholder="K7Q4MX"
        aria-describedby="join-code-hint"
        className="font-display h-20 w-full rounded-sm bg-plate pl-[0.42em] text-center text-[clamp(40px,13vw,52px)] font-bold tracking-[0.42em] text-text uppercase shadow-[inset_0_0_0_1px_var(--color-line)] placeholder:text-faint focus:shadow-[inset_0_0_0_2px_var(--color-text)] focus:outline-none"
        autoFocus
      />
      <p id="join-code-hint" className={dropped ? "text-sm leading-5 font-semibold text-text" : "text-sm leading-5 text-muted"} role={dropped ? "status" : undefined}>
        {LIMITS.joinCodeLength} characters. Codes never use 0, O, 1 or I.
      </p>
      </div>
      <AlreadyInMatch error={join.error instanceof ApiRequestError && join.error.code === "already_in_match" ? join.error : null} />
      <FormError message={join.error && !(join.error instanceof ApiRequestError && join.error.code === "already_in_match") ? errorMessage(join.error) : null} />
      <Button type="submit" variant="primary" disabled={!valid} loading={join.isPending}>
        Join
        <ArrowRightIcon size={20} strokeWidth={2.4} />
      </Button>
      <p className="mt-1 text-[15px] leading-[22px] text-muted">Got a link instead? Opening it brings you straight to the lobby.</p>
    </form>
  );
}

export function Friend() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "join" ? "join" : "create";
  // Held here so switching to Join and back keeps the settings.
  const [lectures, setLectures] = useState<string[] | null>(null);
  const [powerups, setPowerups] = useState(true);
  const [rated, setRated] = useState(true);
  const willBeRated = effectiveRated(rated, lectures, powerups);
  return (
    <FriendPage title="Duel a friend" right={tab === "create" ? <HeaderTag>{willBeRated ? "Rated" : "Unrated"}</HeaderTag> : null}>
      <Pills
        label="Create or join"
        options={[
          { value: "create", label: "Create" },
          { value: "join", label: "Join" },
        ]}
        value={tab}
        onChange={(v) => setParams(v === "join" ? { tab: "join" } : {}, { replace: true })}
      />
      {tab === "create" ? (
        <CreateTab settings={{ lectures, setLectures, powerups, setPowerups, rated, setRated }} />
      ) : (
        <JoinTab initial={params.get("code") ?? ""} />
      )}
    </FriendPage>
  );
}

/**
 * /join/:code. Signed out: log in (or sign up) and come back here. Signed in:
 * join and go to the lobby.
 */
export function JoinLink() {
  const { code: raw = "" } = useParams();
  const loc = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const code = normaliseJoinCode(raw);
  const valid = JoinCodeSchema.safeParse(code).success;
  const started = useRef<string | null>(null);
  const join = useMutation({
    mutationFn: (c: string) => apiRequest("joinLobby", { body: { code: c } }),
    onSuccess: ({ matchId }) => {
      void qc.invalidateQueries({ queryKey: qk.me });
      navigate(`/match/${matchId}`, { replace: true });
    },
  });

  const ready = !!me.data && !me.data.needsOnboarding && valid;
  useEffect(() => {
    // One join per code, even under StrictMode's double effects.
    if (!ready || started.current === code) return;
    started.current = code;
    join.mutate(code);
  }, [ready, code, join]);

  if (me.isPending) return <FullScreenLoader />;
  if (me.error && isUnauthorised(me.error)) return <Navigate to={withNext("/login", loc.pathname)} replace />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => void me.refetch()} className="m-6" />;
  if (me.data?.needsOnboarding) return <Navigate to={withNext("/onboarding", loc.pathname)} replace />;

  if (!valid) {
    return (
      <FriendPage title="Join a duel">
        <FormError message="That link does not contain a valid code." />
        <Link to="/friend?tab=join" className={buttonClass("secondary", "w-full")}>
          Type a code
        </Link>
      </FriendPage>
    );
  }

  if (join.error) {
    const matchId = join.error instanceof ApiRequestError && join.error.code === "already_in_match" ? join.error.body?.error.matchId : null;
    return (
      <FriendPage title="Join a duel">
        <CodePlates code={code} className="mt-2.5" />
        <div className="mt-3 flex flex-col gap-3">
          <FormError message={errorMessage(join.error)} />
          {matchId ? (
            <Link to={`/match/${matchId}`} className={buttonClass("ranked")}>
              Back to your match
            </Link>
          ) : join.error instanceof ApiRequestError && join.error.status >= 400 && join.error.status < 500 ? (
            <Link to="/friend?tab=join" className={buttonClass("secondary")}>
              Enter another code
            </Link>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                join.reset();
                join.mutate(code);
              }}
            >
              Try again
            </Button>
          )}
          <Link to="/" className={buttonClass("ghost")}>
            Home
          </Link>
        </div>
      </FriendPage>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-4 px-4 text-center">
      <CodePlates code={code} />
      <p className="text-base text-muted">Joining the lobby</p>
    </main>
  );
}
