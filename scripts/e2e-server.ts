import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

import { getPrisma } from "@/lib/prisma";
import { signInAs } from "../tests/helpers/auth";
import { E2E_AUTH_ENV, E2E_PORT, E2E_SESSIONS_PORT, E2E_SIGNED_IN_STATE } from "../tests/setup/e2e-env";
import { applyMigrations } from "./apply-migrations";
import { startEmbeddedPostgres } from "./embedded-db";

/**
 * The application under test for Playwright: a throwaway PostgreSQL 17 server, a production build and a
 * production server, all started here and stopped together. It also hands out signed-in browser state,
 * because no real identity provider can be used.
 *
 * Run it with the "react-server" condition (see the `e2e:server` script) so the application modules that
 * start with `import "server-only"` can be loaded outside Next.js.
 */

const root = process.cwd();

function runNext(args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const nextCli = createRequire(path.join(root, "package.json")).resolve("next/dist/bin/next");
  return spawn(process.execPath, [nextCli, ...args], { cwd: root, env, stdio: "inherit" });
}

function exitCodeOf(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

/** What a browser holds after signing in, in Playwright's storage state format. */
async function storageStateFor(name: string) {
  const { headers } = await signInAs({ name });
  const cookies = (headers.get("cookie") ?? "")
    .split("; ")
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf("=");
      return {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        domain: "127.0.0.1",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      };
    });
  if (cookies.length === 0) throw new Error("The test helpers did not return a session cookie.");
  return { cookies, origins: [] };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 4096) throw new Error("The request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function answerSessionRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST" || request.url !== "/sessions") {
    response.writeHead(404).end();
    return;
  }
  // A page on another site can send a plain POST to this port; requiring JSON makes browsers ask first.
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    response.writeHead(415).end();
    return;
  }

  try {
    const { name } = (await readJson(request)) as { name?: unknown };
    const person = typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "E2E Person";
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(await storageStateFor(person)));
  } catch (error) {
    console.error("Could not create a signed-in person:", error);
    response.writeHead(500).end();
  }
}

async function main(): Promise<void> {
  const dataDir = path.join(root, ".data", "e2e-postgres");
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  const cluster = await startEmbeddedPostgres({ dataDir, database: "interview_bank_e2e", disposable: true });

  const sessions = createServer((request, response) => void answerSessionRequest(request, response));
  let server: ChildProcess | undefined;
  let cleanup: Promise<void> | undefined;

  async function shutDown(): Promise<void> {
    server?.kill();
    sessions.close();
    try {
      await getPrisma().$disconnect();
    } catch {
      // Never connected, or already closed.
    }
    await cluster.stop().catch((error: unknown) => console.error("Could not stop the database:", error));
  }

  /** The first caller's exit code wins; later callers wait for the same cleanup. */
  function stop(code: number): Promise<never> {
    cleanup ??= shutDown();
    return cleanup.then(() => process.exit(code));
  }
  process.once("SIGINT", () => void stop(130));
  process.once("SIGTERM", () => void stop(143));

  try {
    const database = { DATABASE_URL: cluster.url, DIRECT_URL: cluster.url };
    // This process signs people in with the same secret and database the server below will use.
    Object.assign(process.env, E2E_AUTH_ENV, database);
    await applyMigrations(cluster.url);

    await new Promise<void>((resolve, reject) => {
      sessions.once("error", reject);
      sessions.listen(E2E_SESSIONS_PORT, "127.0.0.1", resolve);
    });
    await mkdir(path.dirname(E2E_SIGNED_IN_STATE), { recursive: true });
    await writeFile(E2E_SIGNED_IN_STATE, JSON.stringify(await storageStateFor("E2E Reviewer")));

    const env: NodeJS.ProcessEnv = { ...process.env, ...E2E_AUTH_ENV, ...database, NODE_ENV: "production" };
    if ((await exitCodeOf(runNext(["build"], env))) !== 0) throw new Error("The production build failed.");

    server = runNext(["start", "--hostname", "127.0.0.1", "--port", String(E2E_PORT)], env);
    await stop(await exitCodeOf(server));
  } catch (error) {
    console.error(error);
    await stop(1);
  }
}

void main();
