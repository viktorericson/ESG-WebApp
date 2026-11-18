import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { OrgImport } from "@/components/org-import";
import { Card, CardHeader, EmptyState, Input, Label, PageHeader } from "@/components/ui";
import { createOrganizationAsAdmin } from "@/lib/actions/admin";
import { env } from "@/lib/env";
import { formatBytes, formatDate, requirePlatformAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const metadata = { title: "Koncerner" };

export default async function AdminOrganizations() {
  await requirePlatformAdmin();
  const [orgs, files] = await Promise.all([
    db.organization.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { memberships: true } },
        companies: { where: { archivedAt: null }, select: { id: true, _count: { select: { locations: { where: { archivedAt: null } } } } } },
        periods: { select: { year: true, _count: { select: { reports: true } } }, orderBy: { year: "desc" } },
      },
    }),
    db.attachment.findMany({ select: { size: true, moduleData: { select: { company: { select: { organizationId: true } } } } } }),
  ]);
  const filesByOrg = new Map<string, { count: number; size: number }>();
  for (const f of files) {
    const id = f.moduleData.company.organizationId;
    const cur = filesByOrg.get(id) ?? { count: 0, size: 0 };
    filesByOrg.set(id, { count: cur.count + 1, size: cur.size + f.size });
  }

  return (
    <>
      <PageHeader title="Koncerner" description={`${orgs.length} ${orgs.length === 1 ? "koncern" : "koncerner"} på platformen.`} />
      <Card>
        {orgs.length === 0 ? (
          <EmptyState>Der er ingen koncerner endnu.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Koncern</th>
                  <th className="px-3 py-2 text-right font-medium">Selskaber</th>
                  <th className="px-3 py-2 text-right font-medium">Lokationer</th>
                  <th className="px-3 py-2 text-right font-medium">Adgange</th>
                  <th className="px-3 py-2 text-right font-medium">Filer</th>
                  <th className="px-3 py-2 font-medium">Rapporteringsår</th>
                  <th className="px-5 py-2 font-medium">Oprettet</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => {
                  const f = filesByOrg.get(o.id);
                  return (
                    <tr key={o.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/admin/organizations/${o.id}`} className="font-medium text-brand-700 hover:underline">
                          {o.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{o.companies.length}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{o.companies.reduce((s, c) => s + c._count.locations, 0)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{o._count.memberships}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{f ? `${f.count} · ${formatBytes(f.size)}` : "0"}</td>
                      <td className="px-3 py-2.5 text-neutral-600">{o.periods.map((p) => `${p.year}${p._count.reports ? "" : " (ingen rapport)"}`).join(", ") || "–"}</td>
                      <td className="px-5 py-2.5 text-neutral-600">{formatDate(o.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Opret koncern" description="Med moderselskab og evt. koncernadmin. Findes adressen ikke som bruger, oprettes den; koncernadmin logger ind med login-link." />
        <ActionForm action={createOrganizationAsAdmin} className="grid gap-3 p-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="orgName">Koncernens navn</Label>
            <Input id="orgName" name="orgName" required className="mt-1" />
            <FieldError name="orgName" />
          </div>
          <div>
            <Label htmlFor="adminEmail">Koncernadmin (e-mail, valgfrit)</Label>
            <Input id="adminEmail" name="adminEmail" type="email" className="mt-1" />
            <FieldError name="adminEmail" />
          </div>
          <div>
            <Label htmlFor="companyName">Moderselskabets navn</Label>
            <Input id="companyName" name="companyName" required className="mt-1" />
            <FieldError name="companyName" />
          </div>
          <div>
            <Label htmlFor="cvr">CVR-nummer</Label>
            <Input id="cvr" name="cvr" required inputMode="numeric" className="mt-1" />
            <FieldError name="cvr" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="licenseKey">Licensnøgle {env.licenseRequired ? "(kan også sættes senere)" : "(bruges ikke på denne installation)"}</Label>
            <Input id="licenseKey" name="licenseKey" className="mt-1" disabled={!env.licenseRequired} />
            <FieldError name="licenseKey" />
            {env.licenseRequired && <p className="mt-1 text-xs text-neutral-500">Uden nøgle er koncernen låst, indtil koncernadmin sætter en.</p>}
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>Opret koncern</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Importér koncern" description="Fra en eksportfil (*.esgkoncern.zip) lavet med “Eksportér koncern” på en anden installation." />
        <OrgImport />
      </Card>
    </>
  );
}
