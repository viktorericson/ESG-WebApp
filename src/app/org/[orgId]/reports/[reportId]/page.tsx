import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ModuleBadge, StatusBadge } from "@/components/report-badges";
import { ReportForm } from "@/components/report-form";
import { Card, CardHeader, PageHeader, Select, buttonStyles } from "@/components/ui";
import { sofficePath } from "@/lib/export/pdf";
import { deleteReport, setReportStatus, updateReport } from "@/lib/actions/reports";
import { deny, requireOrgAccess } from "@/lib/auth";
import { GroupKpis, PolicyMatrix, ReportStatus } from "@/components/report-overview";
import { db } from "@/lib/db";
import { REPORT_BASIS_LABELS, REPORT_MODULE_LABELS, REPORT_STATUS_LABELS, reportStatuses } from "@/lib/validation";

const dateFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });

export default async function ReportPage({ params }: PageProps<"/org/[orgId]/reports/[reportId]">) {
  const { orgId, reportId } = await params;
  const { access } = await requireOrgAccess(orgId);
  const report = await db.report.findFirst({
    where: { id: reportId, period: { organizationId: orgId } },
    include: {
      period: true,
      reportingCompany: true,
      companies: { include: { company: { include: { _count: { select: { locations: { where: { archivedAt: null } } } } } } } },
    },
  });
  // Rapporter vises for koncernadmin og læsere; øvrige roller arbejder i deres selskaber
  if (!report || !access.canViewAll) deny();

  const companies = await db.company.findMany({
    where: { organizationId: orgId, archivedAt: null },
    select: { id: true, name: true, cvr: true, parentId: true, consolidate: true },
    orderBy: { createdAt: "asc" },
  });
  const included = report.companies.map((rc) => rc.company).sort((a, b) => (a.id === report.reportingCompanyId ? -1 : b.id === report.reportingCompanyId ? 1 : a.name.localeCompare(b.name, "da")));
  const locked = report.status === "APPROVED";
  const pdfAvailable = sofficePath() !== null;

  return (
    <>
      <Link href={`/org/${orgId}/reports`} className="text-sm text-neutral-500 hover:text-neutral-800">← Rapporter</Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {report.name}
            <ModuleBadge module={report.module} />
            <StatusBadge status={report.status} />
          </span>
        }
        description={`Rapporteringsår ${report.period.year} · ${dateFmt.format(report.period.startDate)} – ${dateFmt.format(report.period.endDate)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Rapportopsætning" description="Rapportgrundlag, afgrænsning og udeladelser (B1)." />
          {access.canManageOrg ? (
            <>
              {locked && <p className="mx-5 mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Rapporten er godkendt og låst. Skift status for at redigere.</p>}
              <ReportForm
                action={updateReport}
                orgId={orgId}
                companies={companies}
                disabled={locked}
                submitLabel="Gem opsætning"
                report={{ ...report, companyIds: report.companies.map((c) => c.companyId) }}
              />
            </>
          ) : (
            <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
              <div><dt className="text-neutral-500">Rapportgrundlag</dt><dd>{REPORT_MODULE_LABELS[report.module]}</dd></div>
              <div><dt className="text-neutral-500">Afgrænsning</dt><dd>{REPORT_BASIS_LABELS[report.basis]}</dd></div>
              <div><dt className="text-neutral-500">Standard</dt><dd>{report.standardVersion}</dd></div>
              <div className="sm:col-span-2"><dt className="text-neutral-500">Undtagelser og udeladelser</dt><dd className="whitespace-pre-line">{report.omissions ?? "–"}</dd></div>
            </dl>
          )}
        </Card>

        <aside className="space-y-6">
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Eksportér rapport</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Erhvervsstyrelsens ESG-skabelon udfyldt med rapportens data{report.status !== "APPROVED" && ". Rapporten er ikke godkendt, så forsiden er mærket “Udkast”"}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/api/reports/${report.id}/export?format=pptx`} download className={buttonStyles.primary}>
                PowerPoint
              </a>
              {pdfAvailable ? (
                <a href={`/api/reports/${report.id}/export?format=pdf`} download className={buttonStyles.secondary}>
                  PDF
                </a>
              ) : (
                <span className={`${buttonStyles.secondary} pointer-events-none opacity-50`} title="LibreOffice er ikke installeret på serveren">
                  PDF
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {pdfAvailable ? "PDF'en kan tage op til et minut at danne." : "PDF kræver LibreOffice på serveren."}
              {access.canManageOrg && (
                <>
                  {" "}
                  <Link href={`/org/${orgId}/settings`} className="text-brand-700 hover:underline">Logo til rapporter →</Link>
                </>
              )}
            </p>
          </Card>
          <Card>
            <CardHeader title="Omfattede selskaber" description={`${included.length} ${included.length === 1 ? "selskab" : "selskaber"} · standard: ${report.standardVersion}`} />
            <ul className="divide-y divide-neutral-100 text-sm">
              {included.map((c) => (
                <li key={c.id}>
                  <Link href={`/org/${orgId}/companies/${c.id}`} className="flex items-center gap-2 px-5 py-2.5 hover:bg-neutral-50">
                    <span className="font-medium">{c.name}</span>
                    {c.id === report.reportingCompanyId && <span className="text-xs text-neutral-500">rapporterende</span>}
                    <span className="ml-auto text-xs text-neutral-500">{c._count.locations} lok.</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {access.canManageOrg && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Kontrol og godkendelse</h3>
              <ActionForm action={setReportStatus} className="mt-3 flex gap-2">
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="reportId" value={report.id} />
                <Select name="status" defaultValue={report.status} aria-label="Status">
                  {reportStatuses.map((s) => (
                    <option key={s} value={s}>{REPORT_STATUS_LABELS[s]}</option>
                  ))}
                </Select>
                <SubmitButton variant="secondary" pendingText="…">Skift</SubmitButton>
              </ActionForm>
              {!locked && (
                <ActionForm action={deleteReport} confirm={`Slet rapporten "${report.name}"? De indrapporterede data slettes ikke.`} className="mt-4 border-t border-neutral-100 pt-4">
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="reportId" value={report.id} />
                  <SubmitButton variant="danger" pendingText="Sletter…">Slet rapport</SubmitButton>
                </ActionForm>
              )}
            </Card>
          )}
        </aside>
      </div>

      <div className="mt-8 space-y-6">
        <ReportStatus orgId={orgId} periodId={report.periodId} companies={included} />
        <GroupKpis reportId={report.id} consolidated={report.basis === "CONSOLIDATED"} />
        <PolicyMatrix periodId={report.periodId} companies={included} />
      </div>
    </>
  );
}
