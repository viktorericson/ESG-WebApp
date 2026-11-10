import "server-only";
import { db } from "./db";
import { defaultIncluded, type CompanyNode } from "./report-scope";

// Interne hjælpere (ikke server actions – de må ikke kunne kaldes direkte fra klienten).

export async function orgCompanies(orgId: string): Promise<CompanyNode[]> {
  return db.company.findMany({
    where: { organizationId: orgId, archivedAt: null },
    select: { id: true, parentId: true, consolidate: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Standardrapport for et nyt rapporteringsår: øverste moderselskab, konsolideret hvis der er datterselskaber. */
export async function createDefaultReport(orgId: string, periodId: string, year: number) {
  const companies = await orgCompanies(orgId);
  const root = companies.find((c) => !c.parentId);
  if (!root) return null;
  const hasChildren = companies.some((c) => c.parentId === root.id);
  const basis = hasChildren ? "CONSOLIDATED" : "INDIVIDUAL";
  return db.report.create({
    data: {
      periodId,
      name: `ESG-opgørelse ${year}`,
      basis,
      reportingCompanyId: root.id,
      companies: { create: defaultIncluded(companies, root.id, basis).map((companyId) => ({ companyId })) },
    },
  });
}

