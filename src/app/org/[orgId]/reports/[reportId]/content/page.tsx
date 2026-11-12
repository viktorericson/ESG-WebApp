import Link from "next/link";
import { ReportContentEditor } from "@/components/report-content-editor";
import { PageHeader } from "@/components/ui";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPreviews, loadSummary } from "@/lib/export/load";
import { readContent, showSummary } from "@/lib/report-content";
import { previousReportFor } from "@/lib/reports";

export const metadata = { title: "Rapportindhold" };

export default async function ReportContentPage({ params }: PageProps<"/org/[orgId]/reports/[reportId]/content">) {
  const { orgId, reportId } = await params;
  const { access } = await requireOrgAccess(orgId);
  const report = await db.report.findFirst({
    where: { id: reportId, period: { organizationId: orgId } },
    include: { period: true, images: { orderBy: [{ sort: "asc" }, { createdAt: "asc" }], select: { id: true, slot: true, caption: true, width: true, height: true } } },
  });
  if (!report || !access.canViewAll) deny();

  const content = readContent(report.content);
  const [previous, summary, previews] = await Promise.all([
    previousReportFor(report),
    showSummary(content)
      ? loadSummary(report.id).catch((e) => {
          console.error("[rapportindhold] Nøgletal kunne ikke beregnes", e);
          return null;
        })
      : null,
    loadPreviews(report.id).catch((e) => {
      console.error("[rapportindhold] Data pr. afsnit kunne ikke hentes", e);
      return {};
    }),
  ]);
  const locked = report.status === "APPROVED";
  const canEdit = access.canManageOrg && !locked;

  return (
    <>
      <Link href={`/org/${orgId}/reports/${reportId}`} className="text-sm text-neutral-600 hover:text-neutral-900">
        ← {report.name}
      </Link>
      <PageHeader
        title="Rapportindhold"
        description="Tekster og billeder til den eksporterede rapport. Alt er valgfrit – sider uden indhold udelades. Gemmes automatisk."
      />
      {locked && <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Rapporten er godkendt, så indholdet er låst.</p>}
      {!access.canManageOrg && <p className="mb-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">Du kan se indholdet, men kun koncernadmin kan ændre det.</p>}
      <ReportContentEditor
        orgId={orgId}
        reportId={report.id}
        initial={content}
        images={report.images}
        canEdit={canEdit}
        comprehensive={report.module === "BASIC_AND_COMPREHENSIVE"}
        previousYear={previous ? report.period.year - 1 : null}
        summary={summary}
        previews={previews}
      />
    </>
  );
}
