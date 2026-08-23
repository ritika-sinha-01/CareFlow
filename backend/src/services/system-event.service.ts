import type { Prisma, SystemEventType } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type RecordSystemEventInput = {
  type: SystemEventType;
  message: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function recordSystemEvent(input: RecordSystemEventInput): Promise<void> {
  await prisma.systemEvent.create({
    data: {
      type: input.type,
      message: input.message,
      actorUserId: input.actorUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}
