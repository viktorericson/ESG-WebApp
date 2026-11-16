import "server-only";
import { db } from "./db";
import { isDoneStatus, requiredModules } from "./forms/registry";
import { formContext, readyToComplete } from "./module-data";

export type ModuleReadiness = {
  moduleKey: string;
  title: string;
  target: string;
  locationId: string | null;
  status: string;
  done: boolean;
  /** Alle krævede felter er udfyldt – mangler kun at blive markeret som færdigt */
  fillable: boolean;
};

/**
 * Hvilke moduler skal være færdige, før selskabet kan indsende for året:
 * alle byggede selskabs- og lokationsmoduler (rene C-moduler kun ved B+C).
 */
export async function readiness(periodId: string, companyId: string) {
  const [ctx, locations, rows] = await Promise.all([
    formContext(periodId, companyId),
    db.location.findMany({ where: { companyId, archivedAt: null }, orderBy: { name: "asc" } }),
    db.moduleData.findMany({ where: { periodId, companyId }, select: { moduleKey: true, locationId: true, status: true, answers: true } }),
  ]);
  const rowOf = (moduleKey: string, locationId: string | null) => rows.find((r) => r.moduleKey === moduleKey && r.locationId === locationId);
  const state = (moduleKey: string, locationId: string | null) => {
    const row = rowOf(moduleKey, locationId);
    const status = row?.status ?? "NOT_STARTED";
    return { status, fillable: !!row && readyToComplete(moduleKey, status, row.answers, ctx) };
  };

  const items: ModuleReadiness[] = [
    ...requiredModules("company", ctx.comprehensive).map((m) => ({ moduleKey: m.key, title: m.title, target: "Selskab", locationId: null, ...state(m.key, null) })),
    ...locations.flatMap((l) =>
      requiredModules("location", ctx.comprehensive).map((m) => ({ moduleKey: m.key, title: m.title, target: l.name, locationId: l.id, ...state(m.key, l.id) })),
    ),
  ].map((i) => ({ ...i, done: isDoneStatus(i.status) }));

  return { items, done: items.filter((i) => i.done).length, fillable: items.filter((i) => i.fillable).length, total: items.length, ready: items.every((i) => i.done) };
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
