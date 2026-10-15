import path from "node:path";

import { expect, test } from "@playwright/test";

import { E2E_ORIGIN } from "../setup/e2e-env";
import { newSignedInPerson } from "./support/people";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", "imports", name);

const isolatedAuthor = test.extend({
  storageState: async ({}, provide) => {
    await provide(await newSignedInPerson("Question Author"));
  },
});

isolatedAuthor("an author can publish a draft and find it in the public library", async ({ page }) => {
  const title = `Publication smoke question ${Date.now()}`;

  await page.goto("/my-questions/new");

  await expect(page).toHaveURL(`${E2E_ORIGIN}/my-questions/new`);
  await expect(page.getByRole("heading", { level: 1, name: "New question" })).toBeVisible();

  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Question", { exact: true }).fill("Explain optimistic concurrency.");
  await page.getByLabel("Answer", { exact: true }).fill("Accept changes only at the expected version.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();

  await expect(page.getByText("Draft saved", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published", { exact: false })).toBeVisible();

  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();

  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/questions\//);
  const questionPath = new URL(page.url()).pathname;
  const questionId = questionPath.split("/").at(-1);

  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Accept changes only at the expected version.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save bookmark", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Practice this question", exact: true })).toHaveAttribute(
    "href",
    `/practice?questionId=${questionId}`,
  );
  await expect(page.getByRole("link", { name: "Add to collection", exact: true })).toHaveAttribute(
    "href",
    `/collections?questionId=${questionId}`,
  );

  await page.getByRole("link", { name: "Practice this question", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/practice\\?questionId=${questionId}$`));
  await expect(page.getByRole("heading", { level: 2, name: "Question-specific practice" })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.goto(`${questionPath}`);
  await page.getByRole("link", { name: "Add to collection", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/collections\\?questionId=${questionId}$`));
  await expect(page.getByRole("heading", { level: 2, name: "Question from details page" })).toBeVisible();
  await expect(
    page
      .locator("section")
      .filter({ has: page.getByRole("heading", { level: 2, name: "Question from details page" }) })
      .getByText(title, { exact: true }),
  ).toBeVisible();
});

isolatedAuthor("can save selected imported questions as drafts without uploading the original file", async ({ page }) => {
  await page.goto("/imports");

  await page.getByLabel("Import file", { exact: true }).setInputFiles(fixture("database-questions.md"));
  await expect(page.getByRole("heading", { level: 2, name: "Questions found" })).toBeVisible();

  await page.getByLabel("Select question 2", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save selected drafts", exact: true }).click();

  await expect(page.getByText("Saved 2 drafts.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open saved draft 1", exact: true })).toBeVisible();

  await page.goto("/my-questions");
  await expect(page.getByText("What is an index?")).toBeVisible();
  await expect(page.getByText("What does ACID stand for?")).toBeVisible();
  await expect(page.getByText("What is the difference between WHERE and HAVING?")).toHaveCount(0);
});

isolatedAuthor("shows a reauthentication link when a draft save happens after the session expires", async ({ page }) => {
  await page.goto("/my-questions/new");

  await page.getByLabel("Title", { exact: true }).fill(`Expired draft ${Date.now()}`);
  await page.getByLabel("Question", { exact: true }).fill("Explain optimistic concurrency.");
  await page.getByLabel("Answer", { exact: true }).fill("Use the expected version.");

  await page.context().clearCookies();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();

  const alert = page.getByRole("alert").filter({ hasText: "Sign in" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Sign in again", exact: true })).toHaveAttribute(
    "href",
    "/sign-in?next=%2Fmy-questions%2Fnew",
  );
});

isolatedAuthor("keeps the question destination in bookmark reauthentication links", async ({ page }) => {
  const title = `Bookmark recovery ${Date.now()}`;

  await page.goto("/my-questions/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Question", { exact: true }).fill("Question prompt");
  await page.getByLabel("Answer", { exact: true }).fill("Question answer");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published", { exact: false })).toBeVisible();

  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/questions\//);

  const questionPath = new URL(page.url()).pathname;
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Save bookmark", exact: true }).click();

  const alert = page.getByRole("alert").filter({ hasText: "Sign in" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Sign in again", exact: true })).toHaveAttribute(
    "href",
    `/sign-in?next=${encodeURIComponent(questionPath)}`,
  );

  await page.reload();
  await expect(page.getByRole("link", { name: "Sign in to save", exact: true })).toHaveAttribute(
    "href",
    `/sign-in?next=${encodeURIComponent(questionPath)}`,
  );
});