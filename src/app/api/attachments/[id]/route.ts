import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadModuleScope } from "@/lib/module-data";
import { storage } from "@/lib/storage";

async function load(id: string) {
  const att = await db.attachment.findUnique({ where: { id }, include: { moduleData: { include: { company: true } } } });
  if (!att) return null;
  const md = att.moduleData;
  const { access } = await requireOrgAccess(md.company.organizationId);
  const scope = await loadModuleScope(md.company.organizationId, access, md.periodId, md.moduleKey, { companyId: md.companyId, locationId: md.locationId });
  return scope ? { att, scope } : null;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  const found = await load((await ctx.params).id);
  if (!found) return new NextResponse("Ikke fundet", { status: 404 });
  const data = await storage.get(found.att.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": found.att.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(found.att.filename)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  const found = await load((await ctx.params).id);
  if (!found) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  if (!found.scope.canEdit) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });
  await db.attachment.delete({ where: { id: found.att.id } });
  await storage.delete(found.att.storageKey);
  return NextResponse.json({ ok: true });
}
