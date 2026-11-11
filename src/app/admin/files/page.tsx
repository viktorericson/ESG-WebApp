import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardHeader, EmptyState, PageHeader, Select, buttonStyles } from "@/components/ui";
import { deleteAttachment } from "@/lib/actions/admin";
import { formatBytes, formatDate, requirePlatformAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { getModule } from "@/lib/forms/registry";

export const metadata = { title: "Filer" };

export default async function AdminFiles({ searchParams }: PageProps<"/admin/files">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const orgId = typeof sp.org === "string" && sp.org ? sp.org : null;

  const [orgs, files, logos] = await Promise.all([
    db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.attachment.findMany({
      where: orgId ? { moduleData: { company: { organizationId: orgId } } } : {},
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        uploadedBy: { select: { id: true, email: true } },
        moduleData: {
          include: {
            company: { select: { name: true, organization: { select: { id: true, name: true } } } },
            location: { select: { name: true } },
            period: { select: { year: true } },
          },
        },
      },
    }),
    db.organization.findMany({ where: { logoKey: { not: null }, ...(orgId ? { id: orgId } : {}) }, select: { id: true, name: true, logoUpdatedAt: true } }),
  ]);
  const total = files.reduce((s, f) => s + f.size, 0);

  return (
    <>
      <PageHeader title="Filer" description={`${files.length} ${files.length === 1 ? "dokumentationsfil" : "dokumentationsfiler"} ·${formatBytes(total)}${orgId ? "" : " på hele platformen"}.`} />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="org" defaultValue={orgId ?? ""} className="w-auto" aria-label="Koncern">
          <option value="">Alle koncerner</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonStyles.secondary}>
          Vis
        </button>
      </form>

      <Card>
        <CardHeader title="Dokumentation" description="Filer uploadet som dokumentation i modulerne." />
        {files.length === 0 ? (
          <EmptyState>Ingen filer.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Fil</th>
                  <th className="px-3 py-2 font-medium">Koncern / selskab</th>
                  <th className="px-3 py-2 font-medium">Modul</th>
                  <th className="px-3 py-2 font-medium">Uploadet af</th>
                  <th className="px-3 py-2 text-right font-medium">Størrelse</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const md = f.moduleData;
                  const mod = getModule(md.moduleKey);
                  const section = mod?.sections.find((s) => s.key === f.sectionKey)?.title;
                  return (
                    <tr key={f.id} className="border-b border-neutral-100 align-top">
                      <td className="max-w-64 px-5 py-2.5">
                        <a href={`/api/admin/attachments/${f.id}`} className="block truncate font-medium text-brand-700 hover:underline">
                          {f.filename}
                        </a>
                        <span className="text-xs text-neutral-500">{formatDate(f.createdAt)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/organizations/${md.company.organization.id}`} className="hover:underline">
                          {md.company.organization.name}
                        </Link>
                        <div className="text-xs text-neutral-500">
                          {md.company.name}
                          {md.location ? ` · ${md.location.name}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {mod?.title ?? md.moduleKey}
                        <div className="text-xs text-neutral-500">
                          {section ?? f.sectionKey} · {md.period.year}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600">
                        {f.uploadedBy ? (
                          <Link href={`/admin/users/${f.uploadedBy.id}`} className="hover:underline">
                            {f.uploadedBy.email}
                          </Link>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatBytes(f.size)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <ActionForm action={deleteAttachment} confirm={`Slet "${f.filename}" permanent? Filen kan ikke gendannes.`}>
                          <input type="hidden" name="attachmentId" value={f.id} />
                          <SubmitButton variant="ghost" pendingText="…">
                            Slet
                          </SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {files.length === 300 && <p className="px-5 py-3 text-xs text-neutral-500">Viser de 300 nyeste. Vælg en koncern for at se dens filer.</p>}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Rapportlogoer" />
        {logos.length === 0 ? (
          <EmptyState>Ingen koncerner har uploadet et logo.</EmptyState>
        ) : (
          <ul className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {logos.map((o) => (
              <li key={o.id} className="rounded-md border border-neutral-200 p-3">
                <div className="flex h-16 items-center justify-center bg-neutral-50">
                  {/* eslint-disable-next-line @next/next/no-img-element -- privat billede bag login */}
                  <img src={`/api/admin/logo/${o.id}`} alt={`Logo for ${o.name}`} className="max-h-full max-w-full object-contain" />
                </div>
                <p className="mt-2 text-sm font-medium">{o.name}</p>
                <p className="text-xs text-neutral-500">Opdateret {formatDate(o.logoUpdatedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
