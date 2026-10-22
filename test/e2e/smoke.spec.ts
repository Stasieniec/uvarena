// Scaffold smoke test (Playwright): the built app serves the page and the API.
import { expect, test } from "@playwright/test";

test("serves the page and /api/health", async ({ page, request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("health")).toContainText("ok");
});
