import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { slotLabel } from "@/lib/report-content";
import { reportImageAccess } from "@/lib/report-images";
import { storage } from "@/lib/storage";

async function load(reportId: string, imageId: string) {
  const found = await reportImageAccess(reportId);
  if (!found) return null;
  const image = await db.reportImage.findFirst({ where: { id: imageId, reportId } });
  return image ? { ...found, image } : null;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/reports/[reportId]/images/[imageId]">) {
  const { reportId, imageId } = await ctx.params;
  const found = await load(reportId, imageId);
  if (!found) return new NextResponse("Ikke fundet", { status: 404 });
  const data = await storage.get(found.image.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": found.image.contentType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}

/** Ret billedtekst */
export async function PATCH(req: Request, ctx: RouteContext<"/api/reports/[reportId]/images/[imageId]">) {
  const { reportId, imageId } = await ctx.params;
  const found = await load(reportId, imageId);
  if (!found) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  if (!found.canEdit) return NextResponse.json({ error: found.lockedReason ?? "Ingen adgang" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { caption?: unknown };
  const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 300) || null : null;
  await db.reportImage.update({ where: { id: imageId }, data: { caption } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/reports/[reportId]/images/[imageId]">) {
  const { reportId, imageId } = await ctx.params;
  const found = await load(reportId, imageId);
  if (!found) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  if (!found.canEdit) return NextResponse.json({ error: found.lockedReason ?? "Ingen adgang" }, { status: 403 });
  await db.reportImage.delete({ where: { id: imageId } });
  await storage.delete(found.image.storageKey);
  await audit({ organizationId: found.orgId, userId: found.userId, action: "report.image.delete", entityType: "Report", entityId: reportId, data: { slot: slotLabel(found.image.slot) } });
  return NextResponse.json({ ok: true });
}
