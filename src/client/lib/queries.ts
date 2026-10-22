// TanStack Query hooks over the typed API. Query keys live here so
// invalidation stays consistent across screens.
import { QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse, MissedStatus, Prefs } from "@shared/api-schemas";
import { ApiRequestError, apiRequest } from "./api";

export const qk = {
  config: ["config"] as const,
  me: ["me"] as const,
  courses: ["courses"] as const,
  home: (course: string) => ["home", course] as const,
  bots: (course: string) => ["bots", course] as const,
  leaderboard: (course: string) => ["leaderboard", course] as const,
  missedAll: ["missed"] as const,
  missedList: (course: string, lecture: string | null, status: MissedStatus) => ["missed", "list", course, lecture, status] as const,
  missedQuestion: (id: string) => ["missed", "question", id] as const,
  user: (username: string) => ["user", username.toLowerCase()] as const,
  userMatches: (username: string, course: string | null) => ["userMatches", username.toLowerCase(), course] as const,
  match: (id: string) => ["match", id] as const,
};

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}

export function useConfig() {
  return useQuery({ queryKey: qk.config, queryFn: ({ signal }) => apiRequest("config", { signal }), staleTime: Infinity });
}

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: ({ signal }) => apiRequest("me", { signal }) });
}

/** The signed-in user's data. Only for components under RequireAuth. */
export function useMeData(): MeResponse {
  const { data } = useMe();
  if (!data) throw new Error("useMeData outside RequireAuth");
  return data;
}

export function useCourses() {
  return useQuery({ queryKey: qk.courses, queryFn: ({ signal }) => apiRequest("courses", { signal }), staleTime: 5 * 60_000 });
}

export function useHome(course: string | null) {
  return useQuery({
    queryKey: qk.home(course ?? ""),
    queryFn: ({ signal }) => apiRequest("home", { query: { course: course! }, signal }),
    enabled: course !== null,
    refetchInterval: 15_000,
  });
}

export function useBots(course: string | null) {
  return useQuery({
    queryKey: qk.bots(course ?? ""),
    queryFn: ({ signal }) => apiRequest("bots", { query: { course: course! }, signal }),
    enabled: course !== null,
  });
}

export function useLeaderboard(course: string | null) {
  return useQuery({
    queryKey: qk.leaderboard(course ?? ""),
    queryFn: ({ signal }) => apiRequest("leaderboard", { params: { course: course! }, signal }),
    enabled: course !== null,
  });
}

export function useMissedList(course: string | null, lecture: string | null, status: MissedStatus) {
  return useInfiniteQuery({
    queryKey: qk.missedList(course ?? "", lecture, status),
    queryFn: ({ signal, pageParam }) =>
      apiRequest("missedList", {
        query: { course: course!, lecture: lecture ?? undefined, status, before: pageParam ?? undefined },
        signal,
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore,
    enabled: course !== null,
  });
}

export function useMissedQuestion(id: string) {
  return useQuery({ queryKey: qk.missedQuestion(id), queryFn: ({ signal }) => apiRequest("missedQuestion", { params: { questionId: id }, signal }) });
}

export function useUserProfile(username: string) {
  return useQuery({ queryKey: qk.user(username), queryFn: ({ signal }) => apiRequest("user", { params: { username }, signal }) });
}

export function useUserMatches(username: string | null, course: string | null) {
  return useInfiniteQuery({
    queryKey: qk.userMatches(username ?? "", course),
    queryFn: ({ signal, pageParam }) =>
      apiRequest("userMatches", {
        params: { username: username! },
        query: { course: course ?? undefined, before: pageParam ?? undefined },
        signal,
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore,
    enabled: username !== null,
  });
}

export function useMatchDetail(id: string) {
  return useQuery({ queryKey: qk.match(id), queryFn: ({ signal }) => apiRequest("match", { params: { id }, signal }), staleTime: Infinity });
}

/** PUT /api/me/prefs with an optimistic update of the cached /me. */
export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Prefs>) => apiRequest("putPrefs", { body: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.me });
      const prev = qc.getQueryData<MeResponse>(qk.me);
      if (prev) qc.setQueryData<MeResponse>(qk.me, { ...prev, prefs: { ...prev.prefs, ...patch } });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.me, ctx.prev);
    },
    onSuccess: (res) => {
      const cur = qc.getQueryData<MeResponse>(qk.me);
      if (cur) qc.setQueryData<MeResponse>(qk.me, { ...cur, prefs: res.prefs });
    },
  });
}
