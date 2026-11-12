import "server-only";
import { db } from "./db";
import { isBuilt, modulesFor } from "./forms/registry";
import { formContext } from "./module-data";

export type ModuleReadiness = { moduleKey: string; title: string; target: string; locationId: string | null; status: string; done: boolean };

/**
 * Hvilke moduler skal være færdige, før selskabet kan indsende for året:
 * alle byggede selskabs- og lokationsmoduler (rene C-moduler kun ved B+C).
 */
export async function readiness(periodId: string, companyId: string) {
  const [ctx, locations, rows] = await Promise.all([
    formContext(periodId, companyId),
    db.location.findMany({ where: { companyId, archivedAt: null }, orderBy: { name: "asc" } }),
    db.moduleData.findMany({ where: { periodId, companyId }, select: { moduleKey: true, locationId: true, status: true } }),
  ]);
  const relevant = (m: ReturnType<typeof modulesFor>[number]) => isBuilt(m) && !m.stamdata && (ctx.comprehensive || !m.vs.every((v) => v.startsWith("C")));
  const statusOf = (moduleKey: string, locationId: string | null) => rows.find((r) => r.moduleKey === moduleKey && r.locationId === locationId)?.status ?? "NOT_STARTED";

  const items: ModuleReadiness[] = [
    ...modulesFor("company")
      .filter(relevant)
      .map((m) => ({ moduleKey: m.key, title: m.title, target: "Selskab", locationId: null, status: statusOf(m.key, null) })),
    ...locations.flatMap((l) =>
      modulesFor("location")
        .filter(relevant)
        .map((m) => ({ moduleKey: m.key, title: m.title, target: l.name, locationId: l.id, status: statusOf(m.key, l.id) })),
    ),
  ].map((i) => ({ ...i, done: i.status === "COMPLETED" || i.status === "NOT_RELEVANT" }));

  return { items, done: items.filter((i) => i.done).length, total: items.length, ready: items.every((i) => i.done) };
}

export async function getSubmission(periodId: string, companyId: string) {
  return db.companySubmission.findUnique({
    where: { periodId_companyId: { periodId, companyId } },
    include: { submittedBy: true, reviewedBy: true },
  });
}

export const SUBMISSION_LABELS: Record<string, string> = {
  DRAFT: "Ikke indsendt",
  SUBMITTED: "Indsendt – afventer gennemgang",
  RETURNED: "Sendt tilbage",
  APPROVED: "Godkendt",
};
export const SUBMISSION_TONE = { DRAFT: "neutral", SUBMITTED: "amber", RETURNED: "red", APPROVED: "green" } as const;
export const SUBMISSION_ICON: Record<string, string> = { DRAFT: "○", SUBMITTED: "◷", RETURNED: "↩", APPROVED: "✓" };
