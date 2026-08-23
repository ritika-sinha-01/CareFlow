import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

for (const file of [resolve(__dirname, "../.env"), resolve(__dirname, "../../.env")]) {
  if (existsSync(file)) dotenv.config({ path: file, override: false });
}

export type LocalDbHandle = {
  connectionString: string;
  stop?: () => Promise<void>;
};

function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username || "careflow"),
    password: decodeURIComponent(parsed.password || "careflow"),
    host: parsed.hostname || "127.0.0.1",
    port: Number(parsed.port || "5432"),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "").split("?")[0] || "careflow"),
  };
}

async function canConnect(connectionString: string): Promise<boolean> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function ensureLocalDatabase(
  connectionString = process.env.DATABASE_URL ??
    "postgresql://careflow:careflow@127.0.0.1:54329/careflow?schema=public",
): Promise<LocalDbHandle> {
  if (await canConnect(connectionString)) {
    return { connectionString };
  }

  const parsed = parseDatabaseUrl(connectionString);
  const localHosts = new Set(["127.0.0.1", "localhost"]);
  if (!localHosts.has(parsed.host)) {
    throw new Error("DATABASE_URL is unreachable and is not a local database.");
  }

  const databaseDir = resolve(__dirname, "../.pgdata");
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: parsed.user,
    password: parsed.password,
    port: parsed.port,
    persistent: true,
  });

  try {
    await postgres.initialise();
  } catch {
    // Data directory already initialized.
  }

  await postgres.start();

  try {
    await postgres.createDatabase(parsed.database);
  } catch {
    // Database already exists.
  }

  if (!(await canConnect(connectionString))) {
    throw new Error("Embedded PostgreSQL started but CareFlow could not connect.");
  }

  return {
    connectionString,
    stop: async () => {
      await postgres.stop();
    },
  };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  ensureLocalDatabase()
    .then((handle) => {
      console.log(`PostgreSQL ready at ${handle.connectionString}`);
      if (handle.stop) {
        console.log("Keeping embedded PostgreSQL running. Press Ctrl+C to stop.");
        const stop = () => {
          void handle.stop?.().finally(() => process.exit(0));
        };
        process.on("SIGINT", stop);
        process.on("SIGTERM", stop);
      } else {
        process.exit(0);
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Failed to start local database");
      process.exit(1);
    });
}
