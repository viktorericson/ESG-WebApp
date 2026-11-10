import Link from "next/link";
import { ReportForm } from "@/components/report-form";
import { Card, PageHeader } from "@/components/ui";
import { createReport } from "@/lib/actions/reports";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { defaultIncluded } from "@/lib/report-scope";

export const metadata = { title: "Ny rapport" };

export default async function NewReportPage({ params, searchParams }: PageProps<"/org/[orgId]/reports/new">) {
  const { orgId } = await params;
  const { period: periodId } = await searchParams;
  const { access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) deny();
  const period = typeof periodId === "string" ? await db.reportingPeriod.findFirst({ where: { id: periodId, organizationId: orgId } }) : null;
  if (!period) deny();

  const companies = await db.company.findMany({
    where: { organizationId: orgId, archivedAt: null },
    select: { id: true, name: true, cvr: true, parentId: true, consolidate: true },
    orderBy: { createdAt: "asc" },
  });
  const root = companies.find((c) => !c.parentId) ?? companies[0];
  if (!root) deny();

  return (
    <>
      <Link href={`/org/${orgId}/reports`} className="text-sm text-neutral-500 hover:text-neutral-800">← Rapporter</Link>
      <PageHeader title={`Ny rapport for ${period.year}`} description="Fx en individuel rapport for et datterselskab, der skal bruge sin egen opgørelse." />
      <Card className="max-w-3xl">
        <ReportForm
          action={createReport}
          orgId={orgId}
          periodId={period.id}
          companies={companies}
          submitLabel="Opret rapport"
          report={{
            id: "",
            name: `ESG-opgørelse ${period.year}`,
            module: "BASIC",
            basis: "CONSOLIDATED",
            reportingCompanyId: root.id,
            omissions: null,
            companyIds: defaultIncluded(companies, root.id, "CONSOLIDATED"),
          }}
        />
      </Card>
    </>
  );
}
