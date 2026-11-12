import "server-only";
import { requireOrgAccess } from "./auth";
import { db } from "./db";

/**
 * Adgang til en rapports billeder: alle, der kan se rapporten (koncernadmin, læsere), kan hente dem;
 * kun koncernadmin kan ændre dem, og ikke når rapporten er godkendt.
 * Returnerer null, hvis rapporten ikke findes eller brugeren ikke må se den.
 */
export async function reportImageAccess(reportId: string) {
  const report = await db.report.findUnique({ where: { id: reportId }, select: { status: true, period: { select: { organizationId: true } } } });
  if (!report) return null;
  const orgId = report.period.organizationId;
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canViewAll) return null;
  const locked = report.status === "APPROVED";
  return {
    orgId,
    userId: user.id,
    canEdit: access.canManageOrg && !locked,
    lockedReason: locked ? "Rapporten er godkendt, så billederne er låst." : null,
  };
}
