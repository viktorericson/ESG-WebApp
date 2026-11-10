import "server-only";
import { db } from "./db";

export async function getPeriods(orgId: string) {
  return db.reportingPeriod.findMany({ where: { organizationId: orgId }, orderBy: { year: "desc" } });
}

/** Valgt periode fra ?period=, ellers seneste år */
export function pickPeriod<T extends { id: string }>(periods: T[], param: unknown): T | undefined {
  return periods.find((p) => p.id === param) ?? periods[0];
}
