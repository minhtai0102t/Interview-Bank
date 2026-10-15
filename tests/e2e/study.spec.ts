import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { newSignedInPerson } from "./support/people";

const isolatedAuthor = test.extend({
  storageState: async ({}, provide) => {
    await provide(await newSignedInPerson(`Study Tester ${Date.now()}`));
  },
});

async function publishQuestion(page: Page, title: string, prompt: string, answer: string) {
  await page.goto("/my-questions/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Question", { exact: true }).fill(prompt);
  await page.getByLabel("Answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible();
}

isolatedAuthor("does not accept editor input before hydration and preserves input once ready", async ({ page }) => {
  let releaseScripts!: () => void;
  const scriptsReleased = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });

  await page.route("**/_next/static/**/*.js", async (route) => {
    await scriptsReleased;
    await route.continue();
  });

  await page.goto("/my-questions/new", { waitUntil: "commit" });

  const title = page.getByLabel("Title", { exact: true });
  const topic = page.getByLabel("Topic", { exact: true });
  const difficulty = page.getByLabel("Difficulty", { exact: true });
  const tags = page.getByLabel("Tags", { exact: true });
  const prompt = page.getByLabel("Question", { exact: true });
  const answer = page.getByLabel("Answer", { exact: true });
  const saveDraft = page.getByRole("button", { name: "Save draft", exact: true });
  const publish = page.getByRole("button", { name: "Publish", exact: true });

  const hydratedTitle = `Hydration guard ${Date.now()}`;
  const hydratedTags = "hydration, readiness";
  const hydratedPrompt = "Prompt survives hydration.";
  const hydratedAnswer = "Answer survives hydration.";

  await expect(page.getByRole("heading", { level: 1, name: "New question" })).toBeVisible();
  await expect(title).toBeDisabled();
  await expect(topic).toBeDisabled();
  await expect(difficulty).toBeDisabled();
  await expect(tags).toBeDisabled();
  await expect(prompt).toBeDisabled();
  await expect(answer).toBeDisabled();
  await expect(saveDraft).toBeDisabled();
  await expect(publish).toBeDisabled();

  releaseScripts();

  await expect(title).toBeEnabled();
  await expect(topic).toBeEnabled();
  await expect(difficulty).toBeEnabled();
  await expect(tags).toBeEnabled();
  await expect(prompt).toBeEnabled();
  await expect(answer).toBeEnabled();
  await expect(saveDraft).toBeEnabled();

  await title.fill(hydratedTitle);
  await tags.fill(hydratedTags);
  await prompt.fill(hydratedPrompt);
  await answer.fill(hydratedAnswer);

  await expect(title).toHaveValue(hydratedTitle);
  await expect(tags).toHaveValue(hydratedTags);
  await expect(prompt).toHaveValue(hydratedPrompt);
  await expect(answer).toHaveValue(hydratedAnswer);

  await saveDraft.click();

  await expect(page.getByText("Draft saved", { exact: false })).toBeVisible();
  await expect(title).toHaveValue(hydratedTitle);
  await expect(tags).toHaveValue(hydratedTags);
  await expect(prompt).toHaveValue(hydratedPrompt);
  await expect(answer).toHaveValue(hydratedAnswer);

  await publish.click();
  await expect(page.getByText("Published.", { exact: true })).toBeVisible();
  await expect(title).toHaveValue(hydratedTitle);
  await expect(tags).toHaveValue(hydratedTags);
  await expect(prompt).toHaveValue(hydratedPrompt);
  await expect(answer).toHaveValue(hydratedAnswer);
});

isolatedAuthor("supports question-specific review with saved responses and FSRS completion", async ({ page }) => {
  const title = `Review target ${Date.now()}`;
  const prompt = "Explain optimistic concurrency control.";
  const answer = "Update only when the expected version still matches the stored row.";

  await publishQuestion(page, title, prompt, answer);

  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("link", { name: "Practice this question", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Practice this question", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/[^/]+$/);

  const response = page.getByLabel("Optional response", { exact: true });
  await response.fill("Check the version before writing.");
  await page.getByRole("button", { name: "Save response", exact: true }).click();
  await expect(page.getByText("Response saved.", { exact: true })).toBeVisible();

  await page.goto("/practice");
  const resumeLink = page.getByRole("link", { name: "Resume", exact: true });
  await expect(resumeLink).toHaveAttribute("href", /\/practice\/[^/]+$/);
  await page.goto((await resumeLink.getAttribute("href"))!);

  await page.reload();
  await expect(page.getByLabel("Optional response", { exact: true })).toHaveValue("Check the version before writing.");

  await page.getByRole("button", { name: "Reveal answer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Answer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Session summary", exact: true })).toBeVisible();
  await expect(page.getByText("Check the version before writing.")).toBeVisible();
  await expect(page.getByText(answer)).toBeVisible();
});

isolatedAuthor("supports collection population and timed mock completion", async ({ page }) => {
  const firstTitle = `Collection first ${Date.now()}`;
  const secondTitle = `Collection second ${Date.now()}`;

  await publishQuestion(page, firstTitle, "Question one prompt", "Question one answer");
  await publishQuestion(page, secondTitle, "Question two prompt", "Question two answer");

  await page.goto(`/?q=${encodeURIComponent(firstTitle)}`);
  await page.getByRole("link", { name: firstTitle, exact: true }).click();
  await page.getByRole("link", { name: "Add to collection", exact: true }).click();

  await page.getByLabel("Name", { exact: true }).first().fill("Concurrency set");
  await page.getByLabel("Description", { exact: true }).first().fill("Focused practice");
  await page.getByRole("button", { name: "Create collection", exact: true }).click();
  await expect(page.getByText("Collection created.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/collections\/[^/]+$/);

  await page.getByRole("button", { name: "Add to selected collection", exact: true }).click();
  await expect(page.getByText("Question added to the collection.", { exact: true })).toBeVisible();

  await page.getByLabel("Search", { exact: true }).last().fill(secondTitle);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Question added to the collection.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Practice this collection", exact: true }).click();
  await page.getByLabel("Question count", { exact: true }).last().fill("2");
  await page.getByLabel("Time limit (minutes)", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Start mock", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Question 1 of 2", exact: true })).toBeVisible();
  await expect(page.getByText("Time limit", { exact: true })).toBeVisible();
  await page.getByLabel("Your response", { exact: true }).fill("Mock answer one");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Question 2 of 2", exact: true })).toBeVisible();
  await page.getByLabel("Your response", { exact: true }).fill("Mock answer two");
  await page.getByRole("button", { name: "Complete mock", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Session summary", exact: true })).toBeVisible();
  await expect(page.getByText("Mock answer one")).toBeVisible();
  await expect(page.getByText("Mock answer two")).toBeVisible();
  await expect(page.getByText("Question one answer")).toBeVisible();
  await expect(page.getByText("Question two answer")).toBeVisible();
});