import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";

const app = createApp();
const SHUTDOWN_MS = 10_000;
let shuttingDown = false;

const server = app.listen(env.PORT, () => {
  console.log(`CareFlow API listening on port ${env.PORT}`);
});

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`CareFlow API shutting down (${signal})`);

  const forceTimer = setTimeout(() => {
    console.error("CareFlow API shutdown timed out");
    process.exit(1);
  }, SHUTDOWN_MS);
  forceTimer.unref();

  server.close((closeError) => {
    void prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => {
        process.exit(closeError ? 1 : 0);
      });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
