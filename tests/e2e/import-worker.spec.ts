import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  buildDocx,
  buildDocxWithParts,
  buildQuestionnaire,
  buildZipBomb,
  codeParagraph,
  heading,
  imageParagraph,
  paragraph,
  tinyPng,
} from "../helpers/docx";

/**
 * Production-build gate for the import worker. Runs against `pnpm build` + `pnpm start`
 * (see playwright.config.ts) in Chromium, Firefox, WebKit and two mobile profiles.
 */

type Upload = string | { name: string; mimeType: string; buffer: Buffer };

const WORD_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", "imports", name);

const wordFile = (name: string, bytes: Uint8Array): Upload => ({ name, mimeType: WORD_TYPE, buffer: Buffer.from(bytes) });

const textFile = (name: string, content: string | Uint8Array, mimeType = "text/plain"): Upload => ({
  name,
  mimeType,
  buffer: typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content),
});

const algorithmsDocx = () =>
  wordFile(
    "algorithms-questions.docx",
    buildDocx({
      body: [
        heading(1, "Algorithms interview questions"),
        heading(2, "What is the complexity of binary search?"),
        paragraph("It halves the search space on every step, so it runs in O(log n) time."),
        imageParagraph("rIdDiagram"),
        heading(2, "When would you choose a hash map over a sorted array?"),
        paragraph("When lookups by key dominate and ordering is not needed."),
        codeParagraph("const index = new Map<string, number>();"),
        heading(2, "How does quicksort pick its pivot?"),
        paragraph("Common choices are the median of three or a random element."),
      ].join(""),
      images: { rIdDiagram: tinyPng },
    }),
  );

/** About three seconds of parsing: long enough to cancel, and to prove the page is not blocked. */
const largeQuestionnaire = () => wordFile("questionnaire.docx", buildQuestionnaire({ questions: 300, answerParagraphs: 60 }));

const fileInput = (page: Page) => page.getByLabel("Import file", { exact: true });
const structureSelect = (page: Page) => page.getByLabel("Question structure", { exact: true });
const questions = (page: Page) => page.getByRole("list", { name: "Detected questions" });
const questionTitles = (page: Page) => questions(page).getByRole("heading", { level: 3 });
const status = (page: Page) => page.locator("main").getByRole("status");
const failure = (page: Page) => page.locator("main").getByRole("alert");

async function openImport(page: Page) {
  await page.goto("/imports");
  await expect(page.getByRole("heading", { level: 1, name: "Import questions" })).toBeVisible();
  // A file chosen before React has hydrated the page would be ignored. React tags hydrated nodes with `__reactProps$…`.
  await page.waitForFunction(() => {
    const input = document.querySelector("input[type=file]");
    return input !== null && Object.keys(input).some((key) => key.startsWith("__reactProps$"));
  });
}

function recordRequests(page: Page) {
  const requests: Array<{ method: string; url: string; body: string | null }> = [];
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url(), body: request.postData() }));
  return requests;
}

function workerClosed(page: Page) {
  return new Promise<void>((resolve) => {
    page.once("worker", (worker) => worker.once("close", () => resolve()));
  });
}

const readable = [
  {
    format: "HTML",
    upload: () => fixture("javascript-questions.html"),
    titles: ["What is a closure?", "What does Promise.all do?", "How is work ordered by the event loop?"],
    structure: "level 2 headings",
  },
  {
    format: "Markdown",
    upload: () => fixture("database-questions.md"),
    titles: ["What is an index?", "What is the difference between WHERE and HAVING?", "What does ACID stand for?"],
    structure: "level 2 headings",
  },
  {
    format: "plain text",
    upload: () => fixture("networking-questions.txt"),
    titles: ["What does TCP guarantee?", "Why is the TLS handshake needed?", "Qu’est-ce que le DNS ?"],
    structure: "Q: and A: labels",
  },
  {
    format: "Word",
    upload: algorithmsDocx,
    titles: [
      "What is the complexity of binary search?",
      "When would you choose a hash map over a sorted array?",
      "How does quicksort pick its pivot?",
    ],
    structure: "level 2 headings",
  },
] as const;

for (const { format, upload, titles, structure } of readable) {
  test(`reads a ${format} file in a worker and lists its questions`, async ({ page }) => {
    await openImport(page);

    const worker = page.waitForEvent("worker");
    await fileInput(page).setInputFiles(upload());

    expect((await worker).url()).toContain("/_next/static/");
    await expect(questionTitles(page)).toContainText([...titles]);
    await expect(page.locator("main")).toContainText(`${titles.length} questions found using ${structure}.`);
    await expect(failure(page)).toHaveCount(0);
  });
}

test("does not send the chosen file or anything else off the device", async ({ page, baseURL }) => {
  const marker = `marker-${randomUUID()}`;
  await openImport(page);

  const requests = recordRequests(page);
  await fileInput(page).setInputFiles(textFile("private.md", `## ${marker}?\n\nThe answer mentions ${marker}.\n`));
  await expect(questionTitles(page)).toContainText([marker]);

  expect(requests.length, "the worker bundle is fetched, so the recorder is seeing traffic").toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.method, request.url).toBe("GET");
    expect(request.url.startsWith(`${baseURL}/`), request.url).toBe(true);
    expect(request.url).not.toContain(marker);
    expect(request.body).toBeNull();
  }
});

test("ignores scripts, remote assets and unsafe links in an HTML file", async ({ page, baseURL }) => {
  await openImport(page);

  const requests = recordRequests(page);
  await fileInput(page).setInputFiles(fixture("javascript-questions.html"));
  await expect(questionTitles(page)).toHaveCount(3);

  // Open the questions that contained the image, the frame and the unsafe link.
  await questions(page).getByRole("button").nth(1).click();
  await expect(page.getByText("Promise.all")).toHaveCount(2);
  await questions(page).getByRole("button").nth(2).click();
  await expect(page.getByText("Unsafe link")).toBeVisible();

  expect(requests.filter((request) => !request.url.startsWith(`${baseURL}/`))).toEqual([]);
  expect(await page.evaluate(() => "__importFixtureExecuted" in window)).toBe(false);
  await expect(page.locator("main iframe, main img, main a[href^='javascript:' i]")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("1 image was not imported.");
  await expect(page.locator("main")).toContainText("replaced by plain text");
});

test("re-reads the chosen file when the question structure changes", async ({ page }) => {
  await openImport(page);
  await fileInput(page).setInputFiles(fixture("database-questions.md"));
  await expect(questionTitles(page)).toHaveCount(3);

  await structureSelect(page).selectOption({ label: "Q: and A: labels" });
  await expect(page.locator("main")).toContainText("No questions were recognised");
  await expect(questions(page)).toHaveCount(0);

  await structureSelect(page).selectOption({ label: "Detect automatically" });
  await expect(questionTitles(page)).toHaveCount(3);
});

test("clears the earlier choice when the file picker opens so the same file can be chosen again", async ({ page }) => {
  await openImport(page);
  await fileInput(page).setInputFiles(fixture("database-questions.md"));
  await expect(questionTitles(page)).toHaveCount(3);
  await expect(fileInput(page)).not.toHaveValue("");

  // A browser reports a change only when the chosen path differs from the one already held by the input.
  const picker = page.waitForEvent("filechooser");
  await fileInput(page).click();
  await picker;

  await expect(fileInput(page)).toHaveValue("");
});

test("opens and closes a question with the keyboard", async ({ page }) => {
  await openImport(page);
  await fileInput(page).setInputFiles(fixture("networking-questions.txt"));

  const first = questions(page).getByRole("button").first();
  await expect(first).toHaveAttribute("aria-expanded", "false");

  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Ordered, reliable delivery of a byte stream")).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-expanded", "false");
});

test("keeps long titles and unbroken text inside the viewport", async ({ page }) => {
  const unbroken = "x".repeat(300);
  await openImport(page);
  await fileInput(page).setInputFiles(
    textFile("long.md", `## ${unbroken}?\n\n${unbroken}\n\n\`\`\`\n${unbroken}${unbroken}\n\`\`\`\n`),
  );
  await expect(questionTitles(page)).toHaveCount(1);
  await questions(page).getByRole("button").click();
  await expect(page.getByText("Answer", { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("keeps only the first 1,000 questions of a very large file", async ({ page }) => {
  await openImport(page);
  await fileInput(page).setInputFiles(wordFile("huge.docx", buildQuestionnaire({ questions: 1_100, answerParagraphs: 1 })));

  await expect(questions(page).getByRole("listitem")).toHaveCount(1_000, { timeout: 60_000 });
  await expect(page.locator("main")).toContainText("Only the first 1000 questions were kept; 100 more were left out.");
});

const rejected = [
  { name: "a PDF", upload: () => textFile("notes.pdf", "%PDF-1.7", "application/pdf"), message: /not supported/, worker: false },
  { name: "an empty file", upload: () => textFile("empty.md", ""), message: /file is empty/, worker: false },
  {
    name: "a text file that is not UTF-8",
    upload: () => textFile("latin1.txt", Uint8Array.from([0x51, 0x3a, 0x20, 0xe9, 0x3f])),
    message: /not UTF-8 text/,
    worker: true,
  },
  {
    name: "a damaged Word file",
    upload: () => textFile("damaged.docx", "this is not a zip archive", WORD_TYPE),
    message: /does not look like a valid \.docx/,
    worker: true,
  },
  {
    name: "a Word file that expands past the size limit",
    upload: () => wordFile("bomb.docx", buildZipBomb(25 * 1024 * 1024)),
    message: /holds more than the importer accepts/,
    worker: true,
  },
  {
    name: "a Word file whose document text is larger than the limit",
    upload: () => wordFile("heavy.docx", buildDocxWithParts([3 * 1024 * 1024 + 1])),
    message: /holds more than the importer accepts/,
    worker: true,
  },
  {
    name: "a Markdown file with more text than the limit",
    upload: () => textFile("long.md", "a".repeat(2 * 1024 * 1024 + 1)),
    message: /more text than the importer reads/,
    worker: true,
  },
] as const;

for (const { name, upload, message, worker } of rejected) {
  test(`rejects ${name} with a clear message and recovers`, async ({ page }) => {
    await openImport(page);
    const workers: string[] = [];
    page.on("worker", (created) => workers.push(created.url()));

    await fileInput(page).setInputFiles(upload());
    await expect(failure(page)).toContainText(message);
    await expect(questions(page)).toHaveCount(0);
    expect(workers.length > 0).toBe(worker);

    await fileInput(page).setInputFiles(fixture("database-questions.md"));
    await expect(questionTitles(page)).toHaveCount(3);
    await expect(failure(page)).toHaveCount(0);
  });
}

test("cancelling stops the worker and leaves the page usable", async ({ page }) => {
  await openImport(page);

  const closed = workerClosed(page);
  await fileInput(page).setInputFiles(largeQuestionnaire());
  await expect(status(page)).toContainText("Converting to Markdown");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(status(page)).toHaveText("The import was cancelled.");
  await closed;

  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await expect(questions(page)).toHaveCount(0);

  await fileInput(page).setInputFiles(fixture("database-questions.md"));
  await expect(questionTitles(page)).toHaveCount(3);
});

test("leaving the page stops the worker", async ({ page, baseURL }) => {
  await openImport(page);

  const closed = workerClosed(page);
  await fileInput(page).setInputFiles(largeQuestionnaire());
  await expect(status(page)).toContainText("Converting to Markdown");

  await page.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await closed;
});

test("keeps the page responsive while a large file is read", async ({ page }) => {
  await openImport(page);

  await page.evaluate(() => {
    const probe = { longestGap: 0, last: performance.now() };
    Object.assign(window, { probe });
    window.setInterval(() => {
      const now = performance.now();
      probe.longestGap = Math.max(probe.longestGap, now - probe.last);
      probe.last = now;
    }, 20);
  });

  await fileInput(page).setInputFiles(largeQuestionnaire());
  await expect(status(page)).toContainText("Converting to Markdown");
  await expect(questionTitles(page)).toHaveCount(300, { timeout: 60_000 });

  const longestGap = await page.evaluate(() => (window as unknown as { probe: { longestGap: number } }).probe.longestGap);
  // Reading the same file on the main thread blocks it for about three seconds.
  expect(longestGap).toBeLessThan(750);
});
