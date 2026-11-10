import "server-only";
import { db } from "./db";

type Row = Record<string, unknown>;

export type LinkedSource = { kind: string; label: string; amount: string };

/** Scope 1-kilder fra selskabets modul, der er knyttet til en bestemt lokation */
export async function scope1SourcesForLocation(periodId: string, companyId: string, locationId: string): Promise<LinkedSource[]> {
  const md = await db.moduleData.findUnique({
    where: { periodId_moduleKey_targetKey: { periodId, moduleKey: "company.scope1", targetKey: `company:${companyId}` } },
  });
  const a = (md?.answers ?? {}) as Record<string, unknown>;
  const rows = (key: string) => (Array.isArray(a[key]) ? (a[key] as Row[]) : []).filter((r) => r.location === locationId);
  const fmt = (v: unknown, unit: unknown) => (typeof v === "number" ? `${v.toLocaleString("da-DK")} ${unit ?? ""}`.trim() : "–");

  return [
    ...(a.hasVehicles === "yes" ? rows("vehicles").map((r) => ({ kind: "Køretøj/maskine", label: String(r.vehicleType ?? "–"), amount: fmt(r.amount, r.unit) })) : []),
    ...(a.hasStationary === "yes"
      ? rows("stationarySources").map((r) => ({ kind: "Stationært anlæg", label: [r.description, r.fuel].filter(Boolean).join(" · ") || "–", amount: fmt(r.amount, r.unit) }))
      : []),
    ...(a.hasRefrigerantLeaks === "yes" ? rows("refrigerantLeaks").map((r) => ({ kind: "Kølemiddel", label: String(r.refrigerant ?? "–"), amount: fmt(r.kg, "kg") })) : []),
    ...(a.hasProcessEmissions === "yes" ? rows("processEmissions").map((r) => ({ kind: "Procesudledning", label: String(r.gas ?? "–"), amount: fmt(r.amount, r.unit) })) : []),
  ];
}
