import { hostname } from "node:os";
import { prisma } from "../db/prisma.js";

const HEARTBEAT_ID = "primary";

export async function writeWorkerHeartbeat(): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { id: HEARTBEAT_ID },
    create: {
      id: HEARTBEAT_ID,
      lastSeenAt: new Date(),
      hostname: hostname(),
      pid: process.pid,
    },
    update: {
      lastSeenAt: new Date(),
      hostname: hostname(),
      pid: process.pid,
    },
  });
}

export async function getWorkerHeartbeat() {
  return prisma.workerHeartbeat.findUnique({ where: { id: HEARTBEAT_ID } });
}
