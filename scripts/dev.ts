import { existsSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import dotenv from "dotenv";
import { ensureLocalDatabase } from "../backend/scripts/start-local-db.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const envExample = resolve(root, ".env.example");
const backendEnv = resolve(root, "backend/.env");
const frontendEnv = resolve(root, "frontend/.env");
const rootEnv = resolve(root, ".env");

if (existsSync(envExample) && !existsSync(backendEnv)) {
  copyFileSync(envExample, backendEnv);
}
if (existsSync(envExample) && !existsSync(rootEnv)) {
  copyFileSync(envExample, rootEnv);
}

async function main() {
  if (!existsSync(frontendEnv)) {
    writeFileSync(
      frontendEnv,
      "VITE_API_URL=http://localhost:4000\nVITE_APP_NAME=CareFlow\nVITE_DEMO_MODE=true\n",
    );
  } else {
    const current = readFileSync(frontendEnv, "utf8");
    if (!/^VITE_DEMO_MODE=/m.test(current)) {
      const prefix = current.endsWith("\n") || current.length === 0 ? current : `${current}\n`;
      writeFileSync(frontendEnv, `${prefix}VITE_DEMO_MODE=true\n`);
    }
  }

  dotenv.config({ path: backendEnv });

  const db = await ensureLocalDatabase(process.env.DATABASE_URL);

  const children: ChildProcess[] = [];

  function run(name: string, args: string[], cwd: string) {
    const child = spawn("npm", args, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(`${name} exited with code ${code}`);
      }
    });
    children.push(child);
  }

  run("api", ["run", "dev"], resolve(root, "backend"));
  run("worker", ["run", "dev:worker"], resolve(root, "backend"));
  run("web", ["run", "dev"], resolve(root, "frontend"));

  async function shutdown() {
    for (const child of children) {
      child.kill();
    }
    await db.stop?.();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
