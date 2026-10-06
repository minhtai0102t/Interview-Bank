import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyMigrations } from "../../scripts/apply-migrations";
import { startEmbeddedPostgres } from "../../scripts/embedded-db";

const root = fileURLToPath(new URL("../..", import.meta.url));

/** Integration tests truncate data, so an external database must be named as a test database. */
function assertTestDatabase(url: string): void {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/test/i.test(name)) {
    throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'.");
  }
}

/**
 * Provides a migrated PostgreSQL database to the integration project through DATABASE_URL.
 * By default a disposable embedded cluster is used; set TEST_DATABASE_URL to use another server.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const externalUrl = process.env.TEST_DATABASE_URL;
  let url: string;
  let stop = async () => {};

  if (externalUrl) {
    assertTestDatabase(externalUrl);
    url = externalUrl;
  } else {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "interview-bank-pg-"));
    const cluster = await startEmbeddedPostgres({ dataDir, database: "interview_bank_test", disposable: true });
    url = cluster.url;
    stop = cluster.stop;
  }

  try {
    await applyMigrations(url, root);
  } catch (error) {
    await stop();
    throw error;
  }

  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  return stop;
}
