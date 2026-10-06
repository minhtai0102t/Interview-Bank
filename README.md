# Interview Bank

A study app for interview preparation: a shared public bank of questions and answers, private practice with spaced repetition, and import of existing notes. Work in progress.

## Status

Built so far:

- Next.js 16 app shell (App Router, TypeScript, Tailwind CSS 4).
- PostgreSQL 17 through Prisma 7, a validated environment and a `/api/health` endpoint that checks the database connection.
- A local import reader at `/imports`. It reads HTML, Markdown, plain text and Word (.docx) files in the browser, finds the questions and lists them for review. Nothing is saved yet.

Planned, in order: Google and GitHub sign-in, question management and publishing, search, saving imported questions, practice with spaced repetition, progress, and moderation.

## Requirements

- Node.js 24
- pnpm 10
- PostgreSQL 17 (`pnpm db:dev` starts a local one, no Docker needed)

## Getting started

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm db:dev    # keep this running in its own terminal
pnpm dev       # http://localhost:3000
```

`pnpm db:dev` keeps its data in `.data/postgres` and listens on port 54329, which is what `.env.example` expects. To use another server, set `DATABASE_URL` (and `DIRECT_URL`, the non-pooled URL used by migrations) in `.env.local`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server with Turbopack. |
| `pnpm build`, `pnpm start` | Production build and server. |
| `pnpm typecheck` | Generates route types and runs `tsc --noEmit`. |
| `pnpm lint` | ESLint. |
| `pnpm test` | Unit tests (Vitest). |
| `pnpm test:integration` | Tests that need a database. They start a disposable PostgreSQL 17 automatically. |
| `pnpm test:e2e` | Browser tests against a fresh production build. Run `pnpm exec playwright install` once first. |

Integration tests can use an existing server instead: set `TEST_DATABASE_URL` to a database whose name contains `test`. Those tests empty tables, so any other name is refused.

The browser tests build the app, serve it on port 3100 and run in Chromium, Firefox, WebKit and two mobile profiles. They check that the import worker loads in the production bundle, that cancelling stops it, that the page stays responsive while a large file is read, and that the chosen file is never sent anywhere.

## Importing questions

Open `/imports`, choose a file and review the questions found. Supported files:

| Format | Notes |
| --- | --- |
| HTML (`.html`, `.htm`) | Scripts, frames, forms and media are dropped. |
| Markdown (`.md`, `.markdown`) | GitHub-flavoured tables are supported. |
| Plain text (`.txt`) | UTF-8 only. |
| Word (`.docx`) | Legacy `.doc` and PDF files are not supported; save as `.docx` first. |

In every format, images, raw HTML and links that are not http, https or mailto are removed, and the review screen says how many. Imported text is shown as plain text, never as HTML.

Questions are detected from level 1, 2 or 3 headings (the heading is the question, what follows is the answer), from `Q:` and `A:` labels, or from a two-column table headed Question and Answer. The structure is detected automatically and can be chosen by hand.

The file is read in a Web Worker in your browser and is never uploaded, so large files do not freeze the page and closing the tab cancels the work. Limits: 10 MiB per file and 1,000 questions per file; about 2 million characters of Markdown or plain text; 100,000 tags of HTML; for Word files, 3 MiB of document text (XML), 20 MiB once unpacked and 2,048 internal parts. Processing stops after 15 seconds, so a very large or densely formatted file may need to be split. Limits on titles, questions and answers (160 characters, 20 KiB, 60 KiB) are listed in [src/features/imports/limits.ts](src/features/imports/limits.ts).

## Layout

```text
src/app/                 Routes: pages, /imports, /api/health
src/components/          App shell and navigation
src/features/imports/    File parsing: worker, format readers, question detection, review screen
src/lib/                 Environment validation and the Prisma client
prisma/                  Schema (no models yet)
scripts/                 Local database
tests/                   e2e specs, fixtures for imports, test helpers
```
