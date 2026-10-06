import { expect, test } from "@playwright/test";

import { E2E_AUTH_ENV, E2E_ORIGIN } from "../setup/e2e-env";
import { newSignedInPerson } from "./support/people";

const providers = [
  { label: "Google", id: "google", host: "accounts.google.com", clientId: E2E_AUTH_ENV.GOOGLE_CLIENT_ID },
  { label: "GitHub", id: "github", host: "github.com", clientId: E2E_AUTH_ENV.GITHUB_CLIENT_ID },
] as const;

test.describe("someone who is not signed in", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is asked to sign in before importing questions", async ({ page }) => {
    await page.goto("/imports");

    await expect(page).toHaveURL(`${E2E_ORIGIN}/sign-in?next=%2Fimports`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Import questions" })).toHaveCount(0);
    for (const { label } of providers) {
      await expect(page.getByRole("button", { name: `Continue with ${label}` })).toBeVisible();
    }
  });

  test("receives none of the import page, only a redirect to sign in", async ({ request }) => {
    const response = await request.get("/imports", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe("/sign-in?next=%2Fimports");
    expect(await response.text()).not.toContain("Import questions");
  });

  test("can reach the sign-in page from the header", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Sign in" }).click();

    await expect(page).toHaveURL(`${E2E_ORIGIN}/sign-in`);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  for (const { label, id, host, clientId } of providers) {
    test(`is sent to ${label} with this application's callback address`, async ({ page }) => {
      await page.route(`https://${host}/**`, (route) =>
        route.fulfill({ contentType: "text/html", body: `<title>${label} (stand-in)</title>` }),
      );
      await page.goto("/sign-in?next=%2Fimports");
      const request = page.waitForRequest((candidate) => new URL(candidate.url()).host === host);

      await page.getByRole("button", { name: `Continue with ${label}` }).click();

      const target = new URL((await request).url());
      expect(target.searchParams.get("client_id")).toBe(clientId);
      expect(target.searchParams.get("redirect_uri")).toBe(`${E2E_ORIGIN}/api/auth/callback/${id}`);
      expect(target.searchParams.get("state")).toBeTruthy();
      await expect(page).toHaveURL((url) => url.host === host);
      const cookies = await page.context().cookies(E2E_ORIGIN);
      expect(cookies.some((cookie) => cookie.name.endsWith("oauth_state"))).toBe(true);
    });
  }

  test("is told why a sign-in did not work, in words that do not come from the address", async ({ page }) => {
    await page.goto("/sign-in?error=access_denied");
    await expect(page.getByRole("alert").filter({ hasText: "cancelled" })).toBeVisible();

    await page.goto("/sign-in?error=Your%20account%20is%20locked%2C%20call%20555-0100");
    await expect(page.getByRole("alert").filter({ hasText: "try again" })).toBeVisible();
    await expect(page.getByText("555-0100")).toHaveCount(0);
  });
});

test.describe("someone who is signed in", () => {
  test("sees their name and a way to sign out", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("E2E Reviewer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });

  test("can use the import tool", async ({ page }) => {
    await page.goto("/imports");

    await expect(page).toHaveURL(`${E2E_ORIGIN}/imports`);
    await expect(page.getByRole("heading", { name: "Import questions" })).toBeVisible();
  });

  test("is taken straight to where they were going when they open the sign-in page", async ({ page }) => {
    await page.goto("/sign-in?next=%2Fimports");

    await expect(page).toHaveURL(`${E2E_ORIGIN}/imports`);
  });

  test("is never taken to another site through the sign-in page", async ({ page }) => {
    for (const next of ["%2F%2Fevil.example", "https%3A%2F%2Fevil.example%2F", "%2F%5Cevil.example"]) {
      await page.goto(`/sign-in?next=${next}`);

      await expect(page).toHaveURL(`${E2E_ORIGIN}/`);
    }
  });
});

// Signing out ends the session for good, so this test must not use the person every other test shares.
const signedInOnTheirOwn = test.extend({
  // "provide" rather than Playwright's usual "use", which the React hooks lint rule mistakes for a hook.
  storageState: async ({}, provide) => {
    await provide(await newSignedInPerson("Sign Out Tester"));
  },
});

signedInOnTheirOwn.describe("signing out", () => {
  signedInOnTheirOwn("ends the session and shows the site as a visitor sees it", async ({ page }) => {
    await page.goto("/imports");
    await expect(page.getByText("Sign Out Tester")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(`${E2E_ORIGIN}/`);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Sign Out Tester")).toHaveCount(0);

    await page.goto("/imports");
    await expect(page).toHaveURL(`${E2E_ORIGIN}/sign-in?next=%2Fimports`);
  });
});
