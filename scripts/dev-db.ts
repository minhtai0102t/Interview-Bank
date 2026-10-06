import path from "node:path";

import { startEmbeddedPostgres } from "./embedded-db";

const port = 54329;

async function main() {
  const cluster = await startEmbeddedPostgres({
    dataDir: path.resolve(process.cwd(), ".data", "postgres"),
    database: "interview_bank",
    port,
  });

  console.log(`PostgreSQL 17 is running. Press Ctrl+C to stop.\nDATABASE_URL=${cluster.url}`);

  // Keep the process alive; embedded-postgres stops the server on exit.
  setInterval(() => undefined, 1 << 30);
}

main().catch((error: unknown) => {
  console.error("Could not start the local database:", error);
  process.exit(1);
});
