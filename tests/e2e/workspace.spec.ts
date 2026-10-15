import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { newSignedInPerson } from "./support/people";

const member = test.extend({
  storageState: async ({}, provide) => {
    await provide(await newSignedInPerson(`Workspace Member ${Date.now()}`));
  },
});

const admin = test.extend({
  storageState: async ({}, provide) => {
    await provide(await newSignedInPerson(`Workspace Admin ${Date.now()}`, { role: "ADMIN" }));
  },
});

async function publishQuestion(page: Page, title: string) {
  await page.goto("/my-questions/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Question", { exact: true }).fill("Explain why TCP and HTTP solve different problems.");
  await page.getByLabel("Answer", { exact: true }).fill("TCP transports bytes reliably; HTTP defines application semantics on top.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published.", { exact: true })).toBeVisible();
}

member("shows the workspace navigation, empty progress, and editable settings without admin discovery", async ({ page }) => {
  await page.goto("/");
  const mainNav = page.getByRole("navigation", { name: "Main" });

  for (const label of ["Library", "My Questions", "Collections", "Import", "Practice", "Progress"]) {
    await expect(mainNav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  await page.goto("/progress");
  await expect(page.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();
  await expect(page.getByText("0 completed sessions", { exact: false })).toBeVisible();
  await expect(page.getByText("0 completed reviews", { exact: false })).toBeVisible();
  await expect(
    page.getByText("Coverage counts current published questions. Historical study stays with the topic revision you actually practiced.", { exact: true }),
  ).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.getByLabel("Public alias", { exact: true }).fill("Study Partner");
  await page.getByLabel("Time zone", { exact: true }).selectOption("America/New_York");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();

  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Public alias", { exact: true })).toHaveValue("Study Partner");
  await expect(page.getByLabel("Time zone", { exact: true })).toHaveValue("America/New_York");
});

admin("lets an administrator remove and restore a public question", async ({ page }) => {
  const title = `Moderated question ${Date.now()}`;

  await publishQuestion(page, title);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Question visibility updated.", { exact: true })).toBeVisible();

  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);

  await page.goto("/admin");
  const removedRow = page.getByRole("row").filter({ hasText: title });
  await removedRow.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Question visibility updated.", { exact: true })).toBeVisible();

  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
});