import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { ModuleBadge, StatusBadge } from "@/components/report-badges";
import { buttonStyles, Card, CardHeader, EmptyState, Input, Label, PageHeader } from "@/components/ui";
import { createPeriod, deletePeriod } from "@/lib/actions/org";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Rapporter" };

const dateFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });

export default async function ReportsPage({ params }: PageProps<"/org/[orgId]/reports">) {
  const { orgId } = await params;
  const { access } = await requireOrgAccess(orgId);
  if (!access.canViewAll) deny();
  const periods = await db.reportingPeriod.findMany({
    where: { organizationId: orgId },
    include: {
      reports: { include: { reportingCompany: true, _count: { select: { companies: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { year: "desc" },
  });
  const nextYear = periods.length ? periods[0].year + 1 : new Date().getFullYear() - 1;

  return (
    <>
      <PageHeader
        title="Rapporter"
        description="Data indsamles pr. selskab og rapporteringsår. En rapport bestemmer modul (B eller B+C) og hvilke selskaber der samles."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {periods.length === 0 && (
            <Card>
              <EmptyState>Ingen rapporteringsår endnu. Opret det første for at komme i gang.</EmptyState>
            </Card>
          )}
          {periods.map((p) => (
            <Card key={p.id}>
              <CardHeader
                title={`Rapporteringsår ${p.year}`}
                description={`${dateFmt.format(p.startDate)} – ${dateFmt.format(p.endDate)}`}
                action={
                  access.canManageOrg && (
                    <div className="flex gap-2">
                      <Link href={`/org/${orgId}/reports/new?period=${p.id}`} className={buttonStyles.secondary}>
                        Ny rapport
                      </Link>
                      <ActionForm action={deletePeriod} confirm={`Slet rapporteringsår ${p.year} og dets rapporter?`}>
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="periodId" value={p.id} />
                        <SubmitButton variant="ghost" pendingText="…">Slet år</SubmitButton>
                      </ActionForm>
                    </div>
                  )
                }
              />
              {p.reports.length === 0 ? (
                <EmptyState>Ingen rapporter for året.</EmptyState>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {p.reports.map((r) => (
                    <li key={r.id}>
                      <Link href={`/org/${orgId}/reports/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm hover:bg-neutral-50">
                        <span className="font-medium">{r.name}</span>
                        <ModuleBadge module={r.module} />
                        <span className="text-neutral-600">
                          {r.basis === "CONSOLIDATED" ? `Konsolideret · ${r.reportingCompany.name} + ${r._count.companies - 1}` : `Individuel · ${r.reportingCompany.name}`}
                        </span>
                        <span className="ml-auto">
                          <StatusBadge status={r.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>

        {access.canManageOrg && (
          <Card className="self-start">
            <CardHeader title="Opret rapporteringsår" description="Følger regnskabsåret. Der oprettes automatisk en rapport for koncernen." />
            <ActionForm action={createPeriod} className="space-y-4 p-5">
              <input type="hidden" name="orgId" value={orgId} />
              <div>
                <Label htmlFor="year">År</Label>
                <Input id="year" name="year" type="number" required defaultValue={nextYear} className="mt-1" />
                <FieldError name="year" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="startDate">Start</Label>
                  <Input id="startDate" name="startDate" type="date" required defaultValue={`${nextYear}-01-01`} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="endDate">Slut</Label>
                  <Input id="endDate" name="endDate" type="date" required defaultValue={`${nextYear}-12-31`} className="mt-1" />
                  <FieldError name="endDate" />
                </div>
              </div>
              <SubmitButton pendingText="Opretter…">Opret</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
