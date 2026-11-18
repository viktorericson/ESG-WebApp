import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "./auth";
import { db } from "./db";

/**
 * Koncernens aktivitetslog. Under "log ind som" står handlingen på brugeren, men adminens
 * e-mail gemmes i data.impersonatedBy, så kunden kan se, at det var en admin.
 */
export async function audit(entry: {
  organizationId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  data?: Prisma.InputJsonValue;
}) {
  const current = await getCurrentUser().catch(() => null);
  const by = current?.impersonator && current.id === entry.userId ? current.impersonator.email : null;
  const data =
    by === null
      ? entry.data
      : ({ ...(entry.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? (entry.data as Prisma.InputJsonObject) : entry.data !== undefined ? { value: entry.data } : {}), impersonatedBy: by } as Prisma.InputJsonValue);
  await db.auditLog.create({ data: { ...entry, data } });
}
