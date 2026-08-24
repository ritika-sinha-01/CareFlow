import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const envFiles = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "backend/.env"),
  resolve(process.cwd(), "../.env"),
];

for (const file of envFiles) {
  if (existsSync(file)) {
    dotenv.config({ path: file, override: false });
  }
}

const production = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";

if (production) {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required for production migrations (Neon pooled runtime URL).");
    process.exit(1);
  }
  if (!process.env.DIRECT_URL?.trim()) {
    console.error(
      "DIRECT_URL is required in production. Set it to the Neon direct (non-pooled) connection. Do not fall back to DATABASE_URL.",
    );
    process.exit(1);
  }
  if (/pooler|pgbouncer/i.test(process.env.DIRECT_URL)) {
    console.error("DIRECT_URL must be the Neon direct connection, not a pooled/pgbouncer URL.");
    process.exit(1);
  }
} else if (!process.env.DIRECT_URL?.trim() && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
