import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export interface EmbeddedCluster {
  /** Connection string for the database created on the cluster. */
  url: string;
  stop: () => Promise<void>;
}

export interface EmbeddedClusterOptions {
  dataDir: string;
  database: string;
  /** A free port is picked when omitted. */
  port?: number;
  /** Throwaway cluster: relaxed durability and the data directory is removed on stop. */
  disposable?: boolean;
}

const user = "postgres";
const password = "postgres";

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not determine a free port"));
      });
    });
  });
}

/**
 * Starts a real PostgreSQL 17 server from the `embedded-postgres` binaries, so local
 * development and integration tests do not need Docker or a system installation.
 */
export async function startEmbeddedPostgres(options: EmbeddedClusterOptions): Promise<EmbeddedCluster> {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = options.port ?? (await getFreePort());

  const server = new EmbeddedPostgres({
    databaseDir: options.dataDir,
    port,
    user,
    password,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: options.disposable
      ? ["-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off"]
      : [],
    onLog: () => undefined,
    onError: (error) => console.error(error),
  });

  if (!existsSync(path.join(options.dataDir, "PG_VERSION"))) {
    await server.initialise();
  }
  await server.start();

  const admin = server.getPgClient();
  await admin.connect();
  try {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [options.database]);
    if (found.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(options.database)}`);
    }
  } finally {
    await admin.end();
  }

  return {
    url: `postgresql://${user}:${password}@localhost:${port}/${options.database}`,
    stop: async () => {
      await server.stop();
      if (options.disposable) {
        await rm(options.dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    },
  };
}
