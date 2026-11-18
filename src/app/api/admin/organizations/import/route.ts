import { NextResponse } from "next/server";
import { adminLog, requirePlatformAdmin } from "@/lib/admin";
import { importOrganization, inspectBundle, TransferError } from "@/lib/org-transfer";

const MAX_BYTES = 500 * 1024 * 1024;

/**
 * Import af en koncern fra en eksportfil. `dryRun=1` viser kun indholdet.
 * Koncernen oprettes altid som en ny koncern; intet eksisterende overskrives.
 */
export async function POST(req: Request) {
  const admin = await requirePlatformAdmin();
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Vælg en eksportfil" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Filen er for stor (højst 500 MB)" }, { status: 413 });
  const data = Buffer.from(await file.arrayBuffer());
  try {
    if (fd.get("dryRun") === "1") return NextResponse.json({ ok: true, summary: await inspectBundle(data) });
    const { organizationId, summary } = await importOrganization(data, { name: String(fd.get("name") ?? "") });
    await adminLog({ actorId: admin.id, action: "organization.import", targetType: "Organization", targetId: organizationId, data: summary });
    return NextResponse.json({ ok: true, organizationId, summary });
  } catch (e) {
    if (e instanceof TransferError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[import] Koncernen kunne ikke importeres", e);
    return NextResponse.json({ error: "Importen fejlede. Intet er oprettet." }, { status: 500 });
  }
}
