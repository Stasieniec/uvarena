// Duel a friend: create a lobby (settings, then a big code and a share link)
// or join one by code. /join/:code links land in JoinLink below.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { JoinCodeSchema } from "@shared/api-schemas";
import { APP_NAME } from "@shared/brand";
import { LIMITS, MATCH, PAIR_CAP } from "@shared/game/config";
import { ApiRequestError, apiRequest, errorMessage, isUnauthorised } from "../lib/api";
import { useCurrentCourse } from "../lib/course";
import { normaliseJoinCode } from "../lib/format";
import { qk, useMe } from "../lib/queries";
import { Page } from "../components/AppShell";
import { CopyIcon, ShareIcon } from "../components/icons";
import { LectureMultiChip } from "../components/LectureFilter";
import { Button, ErrorState, FormError, FullScreenLoader, PageHeader, Pills, Switch, buttonClass, cx } from "../components/ui";
import { withNext } from "./guards";
import { effectiveRated, joinUrl } from "../lib/lobby";

function AlreadyInMatch({ error }: { error: unknown }) {
  const navigate = useNavigate();
  const id = error instanceof ApiRequestError && error.code === "already_in_match" ? error.body?.error.matchId : null;
  if (!error) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-wrong/40 bg-wrong/10 px-4 py-2 text-sm" role="alert">
      <span className="flex-1">{errorMessage(error)}</span>
      {id ? (
        <Button variant="secondary" onClick={() => navigate(`/match/${id}`)}>
          Back to it
        </Button>
      ) : null}
    </div>
  );
}

function CodeDisplay({ code }: { code: string }) {
  return (
    <div className="flex justify-center gap-1.5" aria-label={`Code ${code.split("").join(" ")}`}>
      {code.split("").map((ch, i) => (
        <span
          key={i}
          className="font-display flex h-16 w-12 items-center justify-center overflow-hidden rounded-xl border border-ranked-gold/40 bg-surface-2 text-[2rem] leading-none font-black text-ranked-gold shadow-inner"
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

function CreatedLobby({ matchId, code, rated }: { matchId: string; code: string; rated: boolean }) {
  const link = joinUrl(code, window.location.origin);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: APP_NAME, text: `Duel me on ${APP_NAME}. Code ${code}`, url: link });
    } catch {
      // Cancelled by the user, or not allowed: the copy button still works.
    }
  };

  return (
    <div className="pop-in flex flex-col gap-5 text-center">
      <p className={cx("mx-auto rounded-full px-3 py-1 text-xs font-bold tracking-[0.18em] uppercase", rated ? "bg-ranked/15 text-ranked-gold" : "bg-surface-2 text-muted")}>
        {rated ? "Rated" : "Unrated"}
      </p>
      <div>
        <p className="mb-3 text-sm text-muted">Your code</p>
        <CodeDisplay code={code} />
      </div>
      <p className="truncate rounded-xl border border-border bg-bg px-3 py-3 font-mono text-sm text-muted">{link.replace(/^https?:\/\//, "")}</p>
      <div className="grid grid-cols-2 gap-2">
        {canShare ? (
          <Button variant="gold" onClick={share}>
            <ShareIcon size={18} />
            Share
          </Button>
        ) : null}
        <Button variant="secondary" onClick={copy} className={cx(!canShare && "col-span-2")}>
          <CopyIcon size={18} />
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <Link to={`/match/${matchId}`} className={buttonClass("ranked", "text-lg")}>
        Wait in the lobby
      </Link>
      <p className="text-sm text-muted">The lobby expires after {Math.round(MATCH.lobbyTtlMs / 60000)} minutes if nobody joins.</p>
    </div>
  );
}

function CreateTab() {
  const qc = useQueryClient();
  const { course, courseId } = useCurrentCourse();
  const [lectures, setLectures] = useState<string[] | null>(null);
  const [powerups, setPowerups] = useState(true);
  const [rated, setRated] = useState(true);
  const custom = lectures !== null || !powerups;
  const willBeRated = effectiveRated(rated, lectures, powerups);

  const create = useMutation({
    mutationFn: () => apiRequest("createLobby", { body: { courseId: courseId!, lectures, powerups, rated: willBeRated } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.me }),
  });

  if (create.data) return <CreatedLobby matchId={create.data.matchId} code={create.data.code} rated={create.data.rated} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="flex min-h-tap items-center justify-between gap-3 py-1">
          <span className="font-medium">Lectures</span>
          <LectureMultiChip course={course} value={lectures} onChange={setLectures} />
        </div>
        <div className="my-1 h-px bg-border" />
        <Switch checked={powerups} onChange={setPowerups} label="Power-ups" />
        <div className="my-1 h-px bg-border" />
        <Switch
          checked={willBeRated}
          onChange={setRated}
          disabled={custom}
          label="Rated"
          description={custom ? "Custom settings make it unrated." : `Counts for both ranked ratings. At most ${PAIR_CAP.perDay} rated games per pair per day.`}
        />
      </div>
      <AlreadyInMatch error={create.error && create.error instanceof ApiRequestError && create.error.code === "already_in_match" ? create.error : null} />
      <FormError message={create.error && !(create.error instanceof ApiRequestError && create.error.code === "already_in_match") ? errorMessage(create.error) : null} />
      <Button variant="ranked" className="text-lg" onClick={() => create.mutate()} loading={create.isPending} disabled={!courseId}>
        Create
      </Button>
    </div>
  );
}

function JoinTab({ initial }: { initial: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState(normaliseJoinCode(initial));
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label htmlFor="join-code" className="text-sm text-muted">
        Type the {LIMITS.joinCodeLength}-character code from your friend.
      </label>
      <input
        id="join-code"
        value={code}
        onChange={(e) => setCode(normaliseJoinCode(e.target.value))}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        maxLength={LIMITS.joinCodeLength + 4}
        placeholder="K7Q4MX"
        className="font-display min-h-20 w-full rounded-2xl border border-border bg-bg px-4 text-center text-4xl font-black tracking-[0.3em] text-ranked-gold uppercase placeholder:text-muted/25 focus:border-ranked-gold/60 focus:outline-none"
        autoFocus
      />
      <AlreadyInMatch error={join.error instanceof ApiRequestError && join.error.code === "already_in_match" ? join.error : null} />
      <FormError message={join.error && !(join.error instanceof ApiRequestError && join.error.code === "already_in_match") ? errorMessage(join.error) : null} />
      <Button type="submit" variant="ranked" className="text-lg" disabled={!valid} loading={join.isPending}>
        Join
      </Button>
    </form>
  );
}

export function Friend() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "join" ? "join" : "create";
  return (
    <Page>
      <PageHeader title="Duel a friend" back="/" />
      <div className="mb-5">
        <Pills
          label="Create or join"
          tone="ranked"
          options={[
            { value: "create", label: "Create" },
            { value: "join", label: "Join" },
          ]}
          value={tab}
          onChange={(v) => setParams(v === "join" ? { tab: "join" } : {}, { replace: true })}
        />
      </div>
      {tab === "create" ? <CreateTab /> : <JoinTab initial={params.get("code") ?? ""} />}
    </Page>
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
      <Page>
        <PageHeader title="Join a duel" back="/" />
        <FormError message="That link does not contain a valid code." />
        <Link to="/friend?tab=join" className={buttonClass("secondary", "mt-4 w-full")}>
          Type a code
        </Link>
      </Page>
    );
  }

  if (join.error) {
    const matchId = join.error instanceof ApiRequestError && join.error.code === "already_in_match" ? join.error.body?.error.matchId : null;
    return (
      <Page>
        <PageHeader title="Join a duel" back="/" />
        <CodeDisplay code={code} />
        <div className="mt-6 flex flex-col gap-3">
          <FormError message={errorMessage(join.error)} />
          {matchId ? (
            <Link to={`/match/${matchId}`} className={buttonClass("ranked")}>
              Back to your match
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
      </Page>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <CodeDisplay code={code} />
      <p className="text-muted">Joining the lobby</p>
    </main>
  );
}
