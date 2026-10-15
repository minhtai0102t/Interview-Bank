# Interview Bank Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved public question library and private interview-preparation workspace with real persistence and tested ownership boundaries.

**Architecture:** Extend the existing Next.js App Router application, Prisma/PostgreSQL schema, and Better Auth identity layer. Server-only services receive an Actor, validate inputs, enforce ownership, and mutate atomically; server actions authenticate each invocation and return small typed results. Public question reads use immutable published revisions, and practice sessions retain those exact revision references.

**Tech Stack:** Next.js 16.3.8, React 19.3, TypeScript 6, Tailwind 4, Prisma 7, Better Auth, TS-FSRS, React Markdown, Lucide, Vitest, Playwright.

**Spec:** [Approved platform design](../specs/2026-10-14-interview-bank-platform-design.md).

## Global Constraints

- Keep Next.js App Router, React, TypeScript, Tailwind, Prisma/PostgreSQL, Better Auth, Vitest, and Playwright.
- Read the installed Next.js documentation before implementing affected framework APIs.
- Parsing never uploads the original file. Saving sends only selected, reviewed question content after an explicit user action.
- Public reads use the question's current published revision, never its editable draft.
- Prevent access to another user's sessions, review cards, responses, collections, or statistics.
- Answers render safe Markdown without raw HTML execution or unsafe links.
- No billing, hiring-team tenancy, live video interviews, external AI scoring, or paid-service integration in this build.
- No git commits, branch changes, destructive database resets, or changes to unrelated files.
- Preserve existing auth/import behavior and production worker aliases. Do not read or expose OAuth secrets.
- Each code task starts with a failing focused test and immediately validates its first implementation edit.

## Task 1: Shared Schema and Question Domain

**Files:** Modify `prisma/schema.prisma` and `package.json`; add an additive migration, `src/features/questions/input.ts`, `src/features/questions/service.ts`, `src/features/questions/input.test.ts`, `tests/integration/questions.test.ts`, `src/lib/action-result.ts`, and `src/components/markdown.tsx`.

**Interfaces:**

```ts
type QuestionInput = {
  title: string; promptMarkdown: string; answerMarkdown: string;
  topicId: string; difficulty: "EASY" | "MEDIUM" | "HARD"; tags: string[];
};
type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };
// service.ts receives Actor | null; it never trusts a user ID from the client.
saveQuestion(actor, input, id?, expectedVersion?)
publishQuestion(actor, id, expectedVersion)
unpublishQuestion(actor, id)
archiveQuestion(actor, id)
getOwnQuestion(actor, id)
listOwnQuestions(actor)
listTopics()
listLibrary(filters, actor?)
getPublicQuestion(id, actor?)
setBookmark(actor, questionId, saved)
saveImportedQuestions(actor, requestId, inputs)
```

Data contracts: Collection(id, userId, name, description, createdAt, updatedAt); CollectionItem(collectionId, questionId, createdAt); ImportReceipt(userId, requestId, questionIds, createdAt); ReviewCard(userId, questionId, dueAt, card Json, updatedAt); PracticeSession(id, userId, mode REVIEW/MOCK, timeLimitMinutes nullable, startedAt, completedAt nullable); PracticeItem(id, sessionId, revisionId, position, responseMarkdown, revealedAt nullable, rating nullable, reviewedAt nullable). Add user/question/revision relations, composite unique keys, indexes, and sensible SQL checks. Question revisions retain their existing immutability rules.

- [x] Add the publication regression test and run `pnpm exec vitest run --project integration tests/integration/questions.test.ts`; confirm it fails before the service exists.

```ts
const draft = await saveQuestion(owner, originalInput);
await publishQuestion(owner, draft.id, draft.draftVersion);
await saveQuestion(owner, { ...originalInput, answerMarkdown: "Private edit" }, draft.id, draft.draftVersion);
expect((await getPublicQuestion(draft.id))?.answerMarkdown).toBe(originalInput.answerMarkdown);
await expect(saveQuestion(other, originalInput, draft.id, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
```

- [x] Add validation tests: blank title, UTF-8 byte limits, invalid difficulty/topic ID, duplicate/too-many tags, and optimistic version conflicts.
- [x] Implement the typed validation and question service. Filter topic, difficulty, tags, and search against revisions. Use atomic version checks, an explicit answer requirement at publication, owner checks, and stable import receipt uniqueness.
- [x] Extend schema and create the additive migration. Run Prisma validation/generation immediately, then apply migrations through the disposable integration database.
- [x] Install `ts-fsrs`, `react-markdown`, and `lucide-react` with pnpm; retain `remark-gfm`. Implement shared safe Markdown and typed action-result handling.
- [x] Run the focused question integration and validation tests plus `pnpm typecheck`. Repair this slice before other tasks start.

## Task 2: Library, Contributions, and Import Saving

**Files:** Modify `src/app/page.tsx` and `src/features/imports/import-review.tsx`; add `src/features/questions/actions.ts`, question form/list/detail controls, `src/app/questions/[id]/page.tsx`, `src/app/my-questions/page.tsx`, `src/app/my-questions/new/page.tsx`, `src/app/my-questions/[id]/edit/page.tsx`, and selected-import saving controls.

**Consumes:** Task 1 question services, `QuestionInput`, `ActionResult`, `requirePageActor`, shared Markdown, and the existing import candidate types. **Produces:** usable public browsing and signed-in question-authoring/import workflows.

- [x] Write production browser coverage in `tests/e2e/platform.spec.ts` and run only the library/authoring slice to observe its failure.

```ts
await page.goto("/my-questions/new");
await page.getByLabel("Title", { exact: true }).fill("Publication smoke question");
await page.getByLabel("Question", { exact: true }).fill("Explain optimistic concurrency.");
await page.getByLabel("Answer", { exact: true }).fill("Accept changes only at the expected version.");
await page.getByRole("button", { name: "Save draft", exact: true }).click();
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.goto("/?q=Publication%20smoke%20question");
await expect(page.getByRole("link", { name: "Publication smoke question", exact: true })).toBeVisible();
```

- [x] Implement URL-backed library search/filters/pagination, topic counts, safe question details, bookmarks, owned draft lists, and authoring/publishing controls with pending/error states.
- [x] Extend import review with selectable candidates, defaults, bounded save batches, stable retry keys, and links to saved drafts. Do not change parser/worker mechanics.
- [x] Authenticate every server action, validate IDs and form inputs, revalidate affected paths, and keep redirects outside error-catching blocks.
- [x] Run the new focused browser checks and existing import privacy checks; run typecheck and lint for touched files.

## Task 3: Collections and Practice

**Files:** Add `src/features/collections/service.ts`, collection actions/components and `/collections` routes; add `src/features/practice/scheduler.ts`, `scheduler.test.ts`, practice services/actions/components and `/practice` routes; add `tests/integration/study.test.ts`.

**Consumes:** Task 1 schema, published-question visibility rules, Actor/DomainError, shared Markdown/ActionResult. **Produces:** private collection CRUD, resumable review/mock sessions, atomic grading, and persisted FSRS cards.

```ts
scheduleReview(cardJson: unknown | null, rating: 1 | 2 | 3 | 4, now: Date)
createPracticeSession(actor, { mode, topicId?, collectionId?, count, timeLimitMinutes? })
getPracticeSession(actor, id)
savePracticeResponse(actor, itemId, responseMarkdown)
revealPracticeAnswer(actor, itemId)
gradePracticeItem(actor, itemId, rating)
completePracticeSession(actor, id)
getPracticeOverview(actor)
listCollections(actor)
getCollection(actor, id)
saveCollection(actor, { name, description }, id?)
deleteCollection(actor, id)
setCollectionQuestion(actor, collectionId, questionId, included)
```

- [x] Write scheduler tests and database tests before implementation.

```ts
expect(scheduleReview(null, 3, now).dueAt.getTime()).toBeGreaterThan(now.getTime());
await expect(getPracticeSession(other, session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
await gradePracticeItem(owner, item.id, 3);
await gradePracticeItem(owner, item.id, 3);
expect(await prisma.reviewCard.count({ where: { userId: owner.userId } })).toBe(1);
expect((await prisma.reviewCard.findFirstOrThrow()).card).toMatchObject({ reps: 1 });
```

- [x] Implement FSRS using `createEmptyCard`, `fsrs`, and `Rating`; explicitly deserialize dates and persist JSON-safe card state plus indexed `dueAt`.
- [x] Implement owner-scoped collections and session creation from visible published questions, preserving exact revision IDs and deterministic positions.
- [x] Implement private response saving, answer reveal, atomic/idempotent grading, server-authoritative expiry, completion summaries, and resumable sessions. Serialize concurrent card/session changes safely.
- [x] Build responsive collection/practice pages with clear rating controls, timers, stable layouts, and error/empty/expired states.
- [x] Run scheduler and study integration tests immediately after each first implementation edit, then practice browser checks.

## Task 4: Workspace, Progress, Settings, Moderation, and Starter Bank

**Files:** Modify app shell/navigation/styles; add `/progress`, `/settings`, `/admin` routes, focused feature services/actions/components and tests, `src/features/questions/starter-bank.ts`, and `scripts/seed.ts`. Update `scripts/e2e-server.ts` to seed the disposable database and update `README.md`.

**Consumes:** shared schema/services, owned session records, current-actor helpers. **Produces:** responsive complete navigation, real progress, profile settings, administrator moderation, explicit idempotent seed command, and setup documentation.

- [x] Write time-zone and administrator permission tests first.

```ts
expect(activityDate(new Date("2026-10-14T00:30:00Z"), "America/New_York")).toBe("2026-10-13");
await expect(moderateQuestion(userActor, question.id, "REMOVED")).rejects.toMatchObject({ code: "FORBIDDEN" });
await seedStarterBank();
const firstCount = await prisma.question.count();
await seedStarterBank();
expect(await prisma.question.count()).toBe(firstCount);
```

- [x] Implement real progress totals, due reviews, recent sessions, topic coverage and an accessible activity calendar using profile time zones.
- [x] Implement validated alias/time-zone settings and admin remove/restore actions with server-side role checks.
- [x] Build the compact workspace shell and mobile navigation, retaining existing light color tokens and IBM Plex fonts. Use Lucide icons and visible focus states; no decorative hero or fake statistics.
- [x] Add an original starter bank across at least six useful technical/behavioral topics, with meaningful prompts/answers and stable IDs. Keep seed updates from overwriting user content.
- [x] Add the explicit `db:seed` command, seed the disposable browser database, and document migrations, seeding, OAuth setup, study features, and production verification.
- [x] Run focused progress/settings/moderation/seed tests and navigation browser checks.

## Task 5: Integration and Release Verification

**Files:** Extend existing platform browser tests and project documentation only where verification identifies a missing contract.

- [x] Run `pnpm exec prisma validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:integration`.
- [x] Run production browser tests covering publishing/search, imports without file uploads, collection membership, review reveal/rating/resume, mock timing/completion, progress privacy, and signed-out redirects.
- [x] Inspect desktop and mobile screenshots, overflow, browser-console errors, and safe Markdown links. Keep all existing auth/import tests passing.
- [x] Review actual changes against the approved spec for correctness, security, and missing workflows. Repair confirmed defects and rerun the discriminating check.
- [x] Apply additive local migrations, run the explicit starter seed, start the local dev server on a free port, and verify the library loads. Do not stop the user's unrelated processes.
- [x] Record actual verification results, any browser flakes, and the real-OAuth prerequisite. Provide the running application URL. Do not commit.