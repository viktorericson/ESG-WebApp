import Link from "next/link";
import { PeriodSwitcher } from "@/components/module-list";
import { CompanyResults, viewOfCompany } from "@/components/results";
import { EmptyState, Card, PageHeader } from "@/components/ui";
import { deny, requireOrgAccess } from "@/lib/auth";
import { calculateCompany, calculateCompanyPrevious } from "@/lib/calc/server";
import { db } from "@/lib/db";
import { getPeriods, pickPeriod } from "@/lib/periods";

export const metadata = { title: "Nøgletal" };

export default async function CompanyResultsPage({ params, searchParams }: PageProps<"/org/[orgId]/companies/[companyId]/results">) {
  const { orgId, companyId } = await params;
  const { period: periodParam } = await searchParams;
  const { access } = await requireOrgAccess(orgId);
  const company = await db.company.findFirst({ where: { id: companyId, organizationId: orgId, archivedAt: null } });
  if (!company || !(access.canViewAll || access.managesCompany(companyId))) deny();

  const periods = await getPeriods(orgId);
  const period = pickPeriod(periods, periodParam);
  const base = `/org/${orgId}/companies/${companyId}`;
  const [calc, previous] = period ? await Promise.all([calculateCompany(period.id, companyId), calculateCompanyPrevious(period.id, companyId)]) : [null, null];

  return (
    <>
      <Link href={`${base}${period ? `?period=${period.id}` : ""}`} className="text-sm text-neutral-500 hover:text-neutral-800">
        ← {company.name}
      </Link>
      <PageHeader
        title={`Nøgletal ${period?.year ?? ""}`}
        description="Beregnet automatisk ud fra de indrapporterede data. Opdateres, når modulerne ændres."
        action={period && <PeriodSwitcher periods={periods} current={period.id} hrefFor={(id) => `${base}/results?period=${id}`} />}
      />
      {calc ? (
        <CompanyResults
          r={viewOfCompany(calc.result)}
          year={period?.year}
          previous={previous ? { year: previous.year, r: viewOfCompany(previous.calc.result) } : null}
          factorLabel={
            calc.factorSet
              ? `Emissionsfaktorer: ${calc.factorSet.name} ${calc.factorSet.version}, faktorår ${calc.factorYear}. GWP: IPCC AR6.`
              : "Intet faktorsæt."
          }
        />
      ) : (
        <Card>
          <EmptyState>Der er ikke oprettet et rapporteringsår endnu.</EmptyState>
        </Card>
      )}
    </>
  );
}
