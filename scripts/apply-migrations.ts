import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Applies every migration in `prisma/migrations` to the database at `url`, as `prisma migrate deploy` does. */
export async function applyMigrations(url: string, projectRoot = process.cwd()): Promise<void> {
  const prismaCli = createRequire(path.join(projectRoot, "package.json")).resolve("prisma/build/index.js");
  await run(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
