import { NextResponse } from "next/server";
import { adminLog, requirePlatformAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { exportOrganization } from "@/lib/org-transfer";

/** Hele koncernen som én fil, der kan importeres på en anden installation */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/organizations/[orgId]/export">) {
  const admin = await requirePlatformAdmin();
  const { orgId } = await ctx.params;
  if (!(await db.organization.findUnique({ where: { id: orgId }, select: { id: true } }))) return new NextResponse("Ikke fundet", { status: 404 });
  const { buffer, name, summary } = await exportOrganization(orgId);
  await adminLog({ actorId: admin.id, action: "organization.export", targetType: "Organization", targetId: orgId, data: summary });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
