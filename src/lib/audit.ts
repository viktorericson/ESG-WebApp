import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

export async function audit(entry: {
  organizationId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  data?: Prisma.InputJsonValue;
}) {
  await db.auditLog.create({ data: entry });
}
