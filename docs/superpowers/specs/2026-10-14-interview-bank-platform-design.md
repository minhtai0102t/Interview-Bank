# Interview Bank Platform

Date: 2026-10-14
Status: Product scope and written specification approved.

## Goal

Deliver a working shared interview-question bank and a private preparation workspace, extending the existing Next.js application rather than replacing its authentication or browser-only import parser.

The first screen is the usable question library, not a marketing page. Signed-out visitors can browse published questions and read answers. Signed-in users can contribute questions, save collections, practice, and view their progress. Administrators can moderate public content.

## Architecture

- Keep Next.js App Router, React, TypeScript, Tailwind, Prisma/PostgreSQL, Better Auth, Vitest, and Playwright.
- Read the installed Next.js documentation before implementing affected framework APIs.
- Use server-rendered pages for database reads and small client components for interactive controls. Use authenticated server actions for mutations.
- Centralize question visibility and ownership rules in server-only feature services. Validate mutation inputs on the server and return actionable errors without exposing database details.
- Retain Google/GitHub authentication. Do not add a production authentication bypass. Local OAuth use requires valid provider credentials; tests use the existing authentication fixtures.
- Reuse the current content limits, environment validation, current-actor abstraction, database helpers, and import worker.
- Use a maintained spaced-repetition library instead of implementing the scheduling algorithm from scratch.

## Library and Questions

- `/`: searchable public library with topic, difficulty, and tag filters, pagination, published-question counts, and meaningful empty states.
- `/questions/[id]`: question prompt, safely rendered Markdown answer, metadata, bookmark control, collection assignment, and practice entry point.
- `/my-questions`: owned drafts and published questions with edit, publish, unpublish, and archive controls.
- `/my-questions/new` and `/my-questions/[id]/edit`: title, prompt, answer, topic, difficulty, and tags, with explicit validation and save feedback.
- Public reads use the question's current published revision, never its editable draft. Removed, archived, and unpublished questions do not appear publicly.
- Updating a draft uses its expected draft version to prevent lost edits. Publishing atomically creates or reuses the immutable revision for that version and changes the publication pointer.
- Only the author can change their content. Administrators may moderate visibility, not silently rewrite another author's question.
- Seed an original, useful starter bank covering programming, databases, networking, system design, and behavioral interviews. Seeding is explicit and idempotent and does not overwrite user content.

## Imports and Collections

- Preserve local HTML, Markdown, text, and DOCX parsing and the existing production worker compatibility fixes.
- Extend the review screen with candidate selection, topic/difficulty defaults, and saving reviewed candidates as owned drafts.
- Parsing never uploads the original file. Saving sends only selected, reviewed question content after an explicit user action.
- Bound save requests by candidate count and payload size. Use stable request identifiers and a database uniqueness constraint so retries cannot duplicate drafts.
- `/collections` and `/collections/[id]`: create, rename, delete, and populate private study collections from bookmarks or published questions. Collection contents are private to their owner.
- Archived or moderated questions cannot enter new sessions; existing practice history remains available through immutable revisions.

## Practice

- `/practice`: select review or mock-interview mode, topic or collection, and question count. Show due-review and new-question counts.
- `/practice/[id]`: resume an owned session, work through one question at a time, optionally write a private answer, reveal the reference answer, and self-assess.
- Review mode offers Again, Hard, Good, and Easy. Persist the scheduling library's card state and the indexed next-due timestamp per user/question.
- Mock mode uses a configurable time limit, private written responses, and a completion summary. It does not present self-assessment as objective or AI-generated scoring.
- Session items reference the exact immutable revision shown when the session was created. Editing or unpublishing a question cannot change an in-progress session's content.
- Record a rating and update its review card in the same transaction. Repeating a submission cannot count the same session item twice.
- Persist session state and responses so refreshes and navigation do not discard work. Use server timestamps for elapsed time and completion.
- Prevent access to another user's sessions, review cards, responses, collections, or statistics.

## Progress, Settings, and Moderation

- `/progress`: completed sessions, reviewed questions, upcoming reviews, topic coverage, recent activity, and a review-activity calendar using the user's configured time zone.
- Show real database-derived statistics; empty accounts start at zero rather than receiving fabricated progress.
- `/settings`: public alias and validated IANA time zone. Public contributions use the alias or a neutral anonymous label, not provider email or identity details.
- `/admin`: administrator-only published-question moderation with remove and restore actions and visibility feedback. Enforce the role in the service as well as in the page.
- Reuse existing sign-in, account-menu, and sign-out behavior.

## Data Changes

Extend the existing schema with private collections and membership, import-save receipts, review cards, practice sessions, and ordered session items. Keep existing question/revision constraints intact.

Use relational foreign keys, owner indexes, unique membership and per-user card keys, and a unique import request key. Store exact published revision references in practice items. Add constraints for ratings, positions, and sensible session bounds where Prisma cannot express them.

Add an additive migration and regenerate the Prisma client. Apply local migrations without resetting or erasing an existing database. Provide an explicit starter-data command.

## Interface

- A quiet, polished workspace with clear navigation for Library, My Questions, Collections, Import, Practice, and Progress.
- Preserve the application's established light visual language while improving spacing, typography, controls, and responsive layouts.
- Use recognizable library icons, labeled tooltips for icon-only actions, stable control dimensions, visible focus states, and accessible forms.
- Prefer dense, scannable lists and unframed sections to decorative dashboards or large hero panels.
- Provide loading, error, empty, success, disabled, and expired-session states where relevant. Ensure desktop and mobile layouts have no overlapping or clipped content.
- Answers render safe Markdown without raw HTML execution or unsafe links.

## Verification

- Unit tests for input validation, filtering, safe Markdown behavior, review scheduling, grading idempotency, and time-zone statistics.
- Database integration tests for ownership, publication snapshots, import retry behavior, collection isolation, session creation, and atomic grading.
- Production-browser tests for library search, question details, authoring/publishing, selected import saving, collection management, practice/resume/completion, and private progress.
- Retain the existing auth/import tests, including original-file privacy checks.
- Run Prisma validation, TypeScript checking, lint, relevant unit/integration tests, and production-browser checks. Inspect desktop and mobile screenshots.
- Start the local application and provide its URL. Report any external OAuth credential prerequisite separately from verified functionality.

## Exclusions

No billing, hiring-team tenancy, live video interviews, external AI scoring, or paid-service integration in this build. No git commits, branch changes, destructive database resets, or changes to unrelated files.