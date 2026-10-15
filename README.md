# Interview Bank

Interview Bank is a compact interview-study workspace: a shared public question bank, private drafting and collections, browser-only import review, spaced-repetition practice, progress tracking, profile settings, and administrator moderation.

## Current features

- Shared library search with topic, difficulty, tag, and saved filters.
- Private question drafting, preview, publishing, and owned detail routes.
- Private collections and practice entry points from the library and question detail pages.
- Review and mock practice sessions with persisted progress and exact resume behavior.
- Progress dashboards with due reviews, upcoming reviews, topic coverage, recent sessions, and time-zone-aware activity history.
- Profile settings for a public alias and validated IANA time zone.
- Administrator-only moderation to remove or restore published questions without rewriting author content.
- Browser-only import review at `/imports` for HTML, Markdown, plain text, and Word documents.
- An idempotent starter question bank seeded with stable IDs across technical and behavioral topics.

## Requirements

- Node.js 24.x
- pnpm 10.x
- PostgreSQL 17

## Local setup

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm db:dev
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000` after `pnpm dev` starts.

`pnpm db:dev` starts a local PostgreSQL 17 instance on port `54329` and stores its data in `.data/postgres`. Keep that terminal running while you use the app. To use another PostgreSQL server, update `DATABASE_URL` and `DIRECT_URL` in `.env.local`.

## OAuth and environment

The app validates its environment at startup.

- `DATABASE_URL` is required.
- `DIRECT_URL` is optional, but recommended for Prisma migrations.
- `BETTER_AUTH_SECRET` must be at least 32 characters.
- `BETTER_AUTH_URL` must be an origin such as `http://localhost:3000` or `https://example.com`.
- At least one complete OAuth provider pair must be configured: Google or GitHub.

For local development, placeholder OAuth credentials are acceptable for booting the app and running environment validation, but sign-in will not succeed until a real provider pair is configured.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the Next.js development server with Turbopack. |
| `pnpm build` | Creates a production build. |
| `pnpm start` | Starts the production server. |
| `pnpm typecheck` | Generates route types and runs `tsc --noEmit`. |
| `pnpm lint` | Runs ESLint across the workspace source. |
| `pnpm test` | Runs unit tests. |
| `pnpm test:integration` | Runs integration tests against a disposable PostgreSQL 17 instance, unless `TEST_DATABASE_URL` points at a database whose name contains `test`. |
| `pnpm test:e2e` | Runs Playwright against a fresh production build and throwaway database. |
| `pnpm db:dev` | Starts the local PostgreSQL 17 development database in `.data/postgres`. |
| `pnpm db:migrate` | Applies local Prisma migrations in development mode. |
| `pnpm db:deploy` | Applies Prisma migrations in deploy mode. |
| `pnpm db:seed` | Seeds the starter bank with stable IDs without overwriting existing user-authored content. |
| `pnpm admin:grant --email <address>` | Marks an existing signed-in person as an administrator. |
| `pnpm e2e:server` | Starts the disposable production server used by Playwright. |

Run `pnpm exec playwright install` once before the first browser test run.

## Import review

Open `/imports`, choose a file, and review the extracted questions before saving anything. Supported formats:

| Format | Notes |
| --- | --- |
| HTML (`.html`, `.htm`) | Scripts, frames, forms, media, and unsafe links are dropped. |
| Markdown (`.md`, `.markdown`) | GitHub-flavored tables are supported. |
| Plain text (`.txt`) | UTF-8 only. |
| Word (`.docx`) | Legacy `.doc` and PDF files are not supported. |

The file stays in the browser. Parsing runs in a Web Worker, never uploads the content, and stops after 15 seconds. Current limits include 10 MiB per file, 1,000 extracted questions, about 2 million characters for Markdown or text, 100,000 HTML tags, and Word document XML and archive limits. See [src/features/imports/limits.ts](src/features/imports/limits.ts) for the exact caps.

## Starter bank

`pnpm db:seed` loads a starter bank of 48 questions across 8 topics:

- JavaScript & TypeScript
- Frontend Engineering
- C# & .NET
- Algorithms & Data Structures
- Databases & SQL
- Networking
- System Design
- Behavioral

The seed uses stable topic, question, and revision IDs so repeated runs are idempotent. Existing user-authored questions are left untouched.

If a starter topic slug or stable ID collides with a different existing topic row, `pnpm db:seed` fails before writing anything. Resolve the conflicting topic manually, then rerun the seed.

## Project layout

```text
src/app/                 Routes for the library, owned workspaces, imports, practice, progress, settings, admin, and auth
src/components/          Shared shell, navigation, feedback, and safe markdown rendering
src/features/            Feature services, actions, and UI for auth, questions, collections, imports, practice, profile, progress, and admin
src/lib/                 Environment validation, session helpers, redirects, and Prisma access
prisma/                  Schema and migrations
scripts/                 Local database, migrations, seeding, and e2e server helpers
tests/                   Integration tests, e2e specs, fixtures, and helpers
```

## Production verification

The browser suite runs against a real production build, not the dev server. That matters for import-worker bundling, auth/session behavior, and responsive workspace navigation.
