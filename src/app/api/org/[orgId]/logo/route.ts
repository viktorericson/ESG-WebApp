import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { imageSize } from "@/lib/export/image-size";
import { storage } from "@/lib/storage";
import { generateToken } from "@/lib/tokens";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Koncernens logo (vises i indstillinger og bruges i rapporterne) */
export async function GET(_req: Request, ctx: RouteContext<"/api/org/[orgId]/logo">) {
  const { orgId } = await ctx.params;
  const { organization } = await requireOrgAccess(orgId);
  if (!organization.logoKey) return new NextResponse("Ikke fundet", { status: 404 });
  const data = await storage.get(organization.logoKey);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": organization.logoContentType ?? "image/png", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/org/[orgId]/logo">) {
  const { orgId } = await ctx.params;
  const { user, access, organization } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Vælg en fil" }, { status: 400 });
  if (file.size > MAX_LOGO_BYTES) return NextResponse.json({ error: "Logoet må højst fylde 2 MB" }, { status: 413 });
  const data = new Uint8Array(await file.arrayBuffer());
  // Filtypen afgøres af indholdet, ikke af filnavnet eller browserens angivelse
  const size = imageSize(data);
  if (!size) return NextResponse.json({ error: "Logoet skal være en PNG- eller JPEG-fil" }, { status: 415 });
  if (size.width < 50 || size.height < 20) return NextResponse.json({ error: "Logoet er for lille – brug mindst 200 pixels i bredden" }, { status: 400 });

  const key = `${orgId}/logo-${generateToken(12).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  await storage.put(key, Buffer.from(data), `image/${size.type}`);
  await db.organization.update({ where: { id: orgId }, data: { logoKey: key, logoContentType: `image/${size.type}`, logoUpdatedAt: new Date() } });
  if (organization.logoKey) await storage.delete(organization.logoKey);
  await audit({ organizationId: orgId, userId: user.id, action: "organization.logo", entityType: "Organization", entityId: orgId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/org/[orgId]/logo">) {
  const { orgId } = await ctx.params;
  const { user, access, organization } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });
  if (organization.logoKey) {
    await db.organization.update({ where: { id: orgId }, data: { logoKey: null, logoContentType: null, logoUpdatedAt: new Date() } });
    await storage.delete(organization.logoKey);
    await audit({ organizationId: orgId, userId: user.id, action: "organization.logo", entityType: "Organization", entityId: orgId, data: { removed: true } });
  }
  return NextResponse.json({ ok: true });
}
