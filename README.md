# TikTok Music Bot

Automated pipeline: **Suno** (song + lyrics) → **FFmpeg** (vertical MP4 with waveform overlay) → **TikTok Content Posting API** (upload + publish). Runs on demand or on a Windows Task Scheduler cron.

## Prerequisites

- **Node.js 20+** and **pnpm** (`npm i -g pnpm`).
- A **Suno API** provider:
  - `sunoapi-org` (hosted) — set `SUNO_PROVIDER=sunoapi-org`.
  - `gcui-art/suno-api` (self-hosted) — set `SUNO_PROVIDER=gcui-art`.
- A **TikTok Developer app** with the `video.upload` and `video.publish` scopes.
  - `video.publish` requires app audit; develop against **sandbox** first.
- A default **cover image** at `config/default-cover.jpg` (1080×1920 JPG recommended).

## Setup

```powershell
pnpm install
Copy-Item .env.example .env
# then fill in .env
```

Required `.env` values:

| Key                     | Why |
| ----------------------- | --- |
| `SUNO_API_BASE`         | Base URL of your Suno provider |
| `SUNO_API_KEY`          | Bearer token for Suno |
| `SUNO_PROVIDER`         | `sunoapi-org` or `gcui-art` |
| `TIKTOK_CLIENT_KEY`     | From TikTok Developer portal |
| `TIKTOK_CLIENT_SECRET`  | From TikTok Developer portal |
| `TIKTOK_REDIRECT_URI`   | Must match portal exactly, e.g. `http://localhost:53682/callback` |
| `TOKENS_PASSPHRASE`     | Local-only secret used to encrypt stored TikTok tokens |

## One-time TikTok login

```powershell
pnpm auth:tiktok
```

Opens the browser, completes OAuth, and writes `config/tiktok-tokens.json` (AES-256-GCM encrypted).

## Run a post

```powershell
# Free-form prompt
pnpm post --prompt "lofi rainy tokyo, mellow piano"

# From a rotating prompt pool (config/prompts.yaml)
pnpm post --prompt-pool daily

# Dry run (skips the TikTok upload but produces out.mp4)
pnpm post --prompt "synthwave sunset" --dry-run
```

Each run creates `runs/<jobId>/` containing `job.json`, `song.mp3`, `cover.jpg`, `lyrics.txt`, and `out.mp4`.

## Resume a failed job

```powershell
pnpm resume 20260422T090000-abc123
```

Stages with complete artifacts are skipped automatically. If an upload was initiated, the stored `publish_id` is reused for status polling.

## Schedule daily posts

```powershell
# Run as admin for Task Scheduler registration
.\scripts\schedule.ps1 -Time "09:00" -PromptPool daily

# Trigger manually
schtasks /Run /TN TikTokMusicBot

# Remove
schtasks /Delete /TN TikTokMusicBot /F
```

## Tests

```powershell
pnpm test
```

## Repo layout

```
src/
  cli/            commander entry point
  pipeline/       stage runner, retry, rate-limit guard, job types
  storage/        atomic per-job JSON persistence under runs/
  suno/           SunoClient, download, stages
  video/          fluent-ffmpeg renderer, stage
  tiktok/         OAuth, encrypted token store, client, stage
  logging/        pino logger with secret redaction
  config/         zod-validated env loader
scripts/
  render-sample.ts  quick FFmpeg iteration without API calls
  schedule.ps1      Windows Task Scheduler registration
config/
  prompts.yaml      rotating prompt pool
  video.json        render defaults
  default-cover.jpg (you provide)
test/               vitest unit tests
```

## Notes & warnings

- **TikTok spam policy**: repetitive still-image music posts get flagged. Start at 1 post/day with rotating prompts and covers.
- **Suno commercial rights**: the free tier usually forbids monetization. Verify your plan before monetizing.
- **Secrets**: `.env` and `config/tiktok-tokens.json` are gitignored. Never commit either.
"# Interview-Bank" 
