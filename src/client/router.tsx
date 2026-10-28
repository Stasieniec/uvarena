// The data-mode router (createBrowserRouter) with every route in build-plan.md
// "Client". /match/:id renders MatchScreen from ./match (owned by the match
// screen package).
import { createBrowserRouter, Outlet } from "react-router";
import { AppShell } from "./components/AppShell";
import { GuestOnly, RequireAuth, RequireOnboarded } from "./routes/guards";
import { LogIn, ResetPassword, SignUp } from "./routes/auth";
import { Bots } from "./routes/Bots";
import { Credits } from "./routes/Credits";
import { Friend, JoinLink } from "./routes/Friend";
import { History, MatchDetail } from "./routes/History";
import { Leaderboard } from "./routes/Leaderboard";
import { MissedList, MissedQuestion, MissedRun } from "./routes/Missed";
import { DevMatchRoute, IndexRoute, MatchRoute, NotFound, RouteError } from "./routes/misc";
import { Onboarding } from "./routes/Onboarding";
import { MyProfile, PublicProfile } from "./routes/Profile";
import { Queue } from "./routes/Queue";
import { Settings } from "./routes/Settings";

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter([
    {
      element: <Outlet />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <IndexRoute /> },
        {
          element: <GuestOnly />,
          children: [
            { path: "login", element: <LogIn /> },
            { path: "signup", element: <SignUp /> },
          ],
        },
        { path: "reset-password", element: <ResetPassword /> },
        // Handles signed-out visitors itself: log in, then back here.
        { path: "join/:code", element: <JoinLink /> },
        { path: "dev/match", element: <DevMatchRoute /> },
        { path: "credits", element: <Credits /> },
        {
          element: <RequireAuth />,
          children: [
            { path: "onboarding", element: <Onboarding /> },
            {
              element: <RequireOnboarded />,
              children: [
                { path: "match/:id", element: <MatchRoute /> },
                { path: "queue", element: <Queue /> },
                {
                  // Sub-screens with their own Back: no bottom bar, as on the boards.
                  element: <AppShell nav={false} />,
                  children: [
                    { path: "bots", element: <Bots /> },
                    { path: "friend", element: <Friend /> },
                    { path: "missed/run", element: <MissedRun /> },
                    { path: "missed/:questionId", element: <MissedQuestion /> },
                    { path: "u/:username", element: <PublicProfile /> },
                    { path: "matches/:id", element: <MatchDetail /> },
                    { path: "settings", element: <Settings /> },
                  ],
                },
                {
                  element: <AppShell />,
                  children: [
                    { path: "leaderboard", element: <Leaderboard /> },
                    { path: "missed", element: <MissedList /> },
                    { path: "profile", element: <MyProfile /> },
                    { path: "history", element: <History /> },
                  ],
                },
              ],
            },
          ],
        },
        { path: "*", element: <NotFound /> },
      ],
    },
  ]);
}
