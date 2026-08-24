import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV === "production") {
  const result = spawnSync("npx", ["tsx", "scripts/migrate-deploy.ts"], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  process.exit(result.status ?? 1);
}
