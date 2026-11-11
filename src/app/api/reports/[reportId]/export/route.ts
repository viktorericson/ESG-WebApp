import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildReportPptx } from "@/lib/export/load";
import { PdfUnavailableError, pptxToPdf } from "@/lib/export/pdf";

const TYPES = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
} as const;

/** Filnavn uden tegn, der driller i Content-Disposition og filsystemer */
const fileName = (name: string, year: number, ext: string) =>
  `${`${name} ${year}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim()}.${ext}`;

/** Eksport af en rapport som PowerPoint (Erhvervsstyrelsens skabelon) eller PDF */
export async function GET(req: Request, ctx: RouteContext<"/api/reports/[reportId]/export">) {
  const { reportId } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "pptx";

  const found = await db.report.findUnique({ where: { id: reportId }, select: { id: true, period: { select: { organizationId: true } } } });
  if (!found) return new NextResponse("Ikke fundet", { status: 404 });
  const orgId = found.period.organizationId;
  const { user, access } = await requireOrgAccess(orgId);
  // Samme adgang som rapportsiden: koncernadmin og læsere/revisorer
  if (!access.canViewAll) return new NextResponse("Ikke fundet", { status: 404 });

  const { buffer, report } = await buildReportPptx(reportId);
  let body: Buffer = buffer;
  if (format === "pdf") {
    try {
      body = await pptxToPdf(buffer);
    } catch (e) {
      const message = e instanceof PdfUnavailableError ? e.message : "PDF-konverteringen fejlede. Prøv igen, eller hent PowerPoint-filen.";
      if (!(e instanceof PdfUnavailableError)) console.error("[eksport] PDF-fejl", e);
      return new NextResponse(message, { status: 503 });
    }
  }

  await audit({ organizationId: orgId, userId: user.id, action: "report.export", entityType: "Report", entityId: reportId, data: { name: report.name, format } });

  const name = fileName(report.name, report.period.year, format);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
