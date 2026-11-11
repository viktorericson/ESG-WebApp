import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";

/** En koncerns rapportlogo for platformens ejer */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/logo/[orgId]">) {
  await requirePlatformAdmin();
  const org = await db.organization.findUnique({ where: { id: (await ctx.params).orgId }, select: { logoKey: true, logoContentType: true } });
  if (!org?.logoKey) return new NextResponse("Ikke fundet", { status: 404 });
  const data = await storage.get(org.logoKey);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": org.logoContentType ?? "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" },
  });
}
