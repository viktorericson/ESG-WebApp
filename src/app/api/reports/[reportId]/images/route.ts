import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { imageSize } from "@/lib/export/image-size";
import { imageLimit, isImageSlot, slotLabel } from "@/lib/report-content";
import { reportImageAccess } from "@/lib/report-images";
import { storage } from "@/lib/storage";
import { generateToken } from "@/lib/tokens";

const MAX_BYTES = 10 * 1024 * 1024;

/** Upload af et billede til rapporten (forord, kernefortælling, et afsnit eller bilag) */
export async function POST(req: Request, ctx: RouteContext<"/api/reports/[reportId]/images">) {
  const { reportId } = await ctx.params;
  const found = await reportImageAccess(reportId);
  if (!found) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  if (!found.canEdit) return NextResponse.json({ error: found.lockedReason ?? "Ingen adgang" }, { status: 403 });

  const fd = await req.formData();
  const file = fd.get("file");
  const slot = String(fd.get("slot") ?? "");
  const caption = String(fd.get("caption") ?? "").trim().slice(0, 300) || null;
  if (!isImageSlot(slot)) return NextResponse.json({ error: "Ukendt placering" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Vælg en fil" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Billedet må højst fylde 10 MB" }, { status: 413 });

  const count = await db.reportImage.count({ where: { reportId, slot } });
  if (count >= imageLimit(slot)) return NextResponse.json({ error: `Der kan højst være ${imageLimit(slot)} billede(r) under “${slotLabel(slot)}”.` }, { status: 400 });

  const data = new Uint8Array(await file.arrayBuffer());
  // Filtypen afgøres af indholdet, ikke af filnavnet eller browserens angivelse
  const size = imageSize(data);
  if (!size) return NextResponse.json({ error: "Billedet skal være en PNG- eller JPEG-fil" }, { status: 415 });
  if (size.width < 300 || size.height < 150) return NextResponse.json({ error: "Billedet er for lille – brug mindst 300 pixels i bredden (helst 1.200 eller mere)" }, { status: 400 });

  const key = `${found.orgId}/report-${reportId}/${generateToken(12).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  await storage.put(key, Buffer.from(data), `image/${size.type}`);
  const image = await db.reportImage.create({
    data: { reportId, slot, caption, sort: count, storageKey: key, contentType: `image/${size.type}`, width: size.width, height: size.height },
  });
  await audit({ organizationId: found.orgId, userId: found.userId, action: "report.image.add", entityType: "Report", entityId: reportId, data: { slot: slotLabel(slot) } });
  return NextResponse.json({ ok: true, image: { id: image.id, slot: image.slot, caption: image.caption, width: image.width, height: image.height } });
}
