import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";

/** Download af en dokumentationsfil for platformens ejer (uden medlemskab af koncernen) */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/attachments/[id]">) {
  await requirePlatformAdmin();
  const att = await db.attachment.findUnique({ where: { id: (await ctx.params).id } });
  if (!att) return new NextResponse("Ikke fundet", { status: 404 });
  const data = await storage.get(att.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": att.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
