import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadModuleScope } from "@/lib/module-data";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, storage } from "@/lib/storage";
import { generateToken } from "@/lib/tokens";

/** Upload af dokumentation til en sektion i et modul */
export async function POST(req: Request) {
  const fd = await req.formData();
  const get = (k: string) => String(fd.get(k) ?? "");
  const file = fd.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Ingen fil" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Filen er større end 20 MB" }, { status: 413 });
  if (!ALLOWED_TYPES[file.type]) return NextResponse.json({ error: "Filtypen understøttes ikke (PDF, billeder, Excel, Word, CSV)" }, { status: 415 });

  const orgId = get("orgId");
  const { user, access } = await requireOrgAccess(orgId);
  const scope = await loadModuleScope(orgId, access, get("periodId"), get("moduleKey"), {
    companyId: get("companyId"),
    locationId: get("locationId") || null,
  });
  if (!scope || !scope.canEdit) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });
  const sectionKey = get("sectionKey");
  if (!scope.def.sections.some((s) => s.key === sectionKey && s.evidence)) {
    return NextResponse.json({ error: "Ukendt sektion" }, { status: 400 });
  }

  const row = await db.moduleData.upsert({
    where: { periodId_moduleKey_targetKey: { periodId: scope.period.id, moduleKey: scope.def.key, targetKey: scope.targetKey } },
    create: {
      periodId: scope.period.id,
      moduleKey: scope.def.key,
      targetKey: scope.targetKey,
      companyId: scope.company.id,
      locationId: scope.location?.id ?? null,
      updatedById: user.id,
    },
    update: {},
  });

  const storageKey = `${orgId}/${generateToken(18).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  await storage.put(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  const attachment = await db.attachment.create({
    data: {
      moduleDataId: row.id,
      sectionKey,
      filename: file.name.slice(0, 255),
      contentType: file.type,
      size: file.size,
      storageKey,
      uploadedById: user.id,
    },
  });
  return NextResponse.json({ id: attachment.id, filename: attachment.filename, size: attachment.size, sectionKey });
}
