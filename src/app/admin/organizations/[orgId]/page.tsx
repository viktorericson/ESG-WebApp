import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { grantOrgAccess, impersonateUser, updateUser } from "@/lib/actions/admin";
import { formatBytes, formatDate, formatTime, isPlatformOwner, requirePlatformAdmin } from "@/lib/admin";
import { ACTION_LABELS } from "@/lib/audit-labels";
import { db } from "@/lib/db";
import { LICENSE_MESSAGES, licenseValidity, maskKey } from "@/lib/license";
import { ROLE_LABELS } from "@/lib/permissions";
import { SUBMISSION_ICON, SUBMISSION_LABELS, SUBMISSION_TONE } from "@/lib/review";
import { REPORT_STATUS_LABELS } from "@/lib/validation";

export default async function AdminOrganization({ params }: PageProps<"/admin/organizations/[orgId]">) {
  const { orgId } = await params;
  const admin = await requirePlatformAdmin();
  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      companies: {
        orderBy: { createdAt: "asc" },
        include: {
          parent: { select: { name: true } },
          locations: { where: { archivedAt: null }, select: { id: true } },
          submissions: { include: { period: { select: { year: true } } }, orderBy: { period: { year: "desc" } }, take: 1 },
        },
      },
      memberships: { include: { user: true, company: { select: { name: true } }, location: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      invitations: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } },
      periods: { orderBy: { year: "desc" }, include: { reports: { orderBy: { createdAt: "asc" } } } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 15, include: { user: true } },
    },
  });
  if (!org) notFound();

  const files = await db.attachment.aggregate({ where: { moduleData: { company: { organizationId: orgId } } }, _count: true, _sum: { size: true } });
  const ownAccess = org.memberships.filter((m) => m.userId === admin.id);
  // Koncernadmins (hele koncernen), én gang pr. bruger
  const orgAdmins = org.memberships.filter((m, i, all) => m.role === "ORG_ADMIN" && !m.companyId && !m.locationId && all.findIndex((x) => x.userId === m.userId && x.role === "ORG_ADMIN") === i);
  const license = licenseValidity(org, new Date());
  const sharing = org.licenseKey ? await db.organization.findMany({ where: { licenseKey: org.licenseKey, id: { not: org.id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];

  return (
    <>
      <Link href="/admin/organizations" className="text-sm text-neutral-600 hover:text-neutral-900">
        ← Koncerner
      </Link>
      <PageHeader
        title={org.name}
        description={`Oprettet ${formatDate(org.createdAt)} · ${org.companies.filter((c) => !c.archivedAt).length} selskaber · ${org.memberships.length} adgange · ${files._count} filer (${formatBytes(files._sum.size ?? 0)}) · Licens ${org.licenseKey ? `${maskKey(org.licenseKey)}: ${license.ok ? `gyldig til ${formatDate(license.license.expiresAt)}` : LICENSE_MESSAGES[license.reason].toLowerCase()}` : "mangler"}`}
        action={
          <span className="flex flex-wrap items-center gap-4">
            <a href={`/api/admin/organizations/${org.id}/export`} download className="text-sm font-medium text-brand-700 hover:underline">
              Eksportér koncern
            </a>
            {ownAccess.length > 0 && (
              <Link href={`/org/${org.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                Åbn koncernen →
              </Link>
            )}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Selskaber" />
            {org.companies.length === 0 ? (
              <EmptyState>Ingen selskaber.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">Selskab</th>
                      <th className="px-3 py-2 font-medium">CVR</th>
                      <th className="px-3 py-2 font-medium">Moderselskab</th>
                      <th className="px-3 py-2 text-right font-medium">Lokationer</th>
                      <th className="px-5 py-2 font-medium">Seneste indsendelse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {org.companies.map((c) => {
                      const sub = c.submissions[0];
                      return (
                        <tr key={c.id} className="border-b border-neutral-100">
                          <td className="px-5 py-2.5 font-medium">
                            {c.name} {c.archivedAt && <Badge>Arkiveret</Badge>}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs">{c.cvr}</td>
                          <td className="px-3 py-2.5 text-neutral-600">{c.parent?.name ?? "–"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.locations.length}</td>
                          <td className="px-5 py-2.5">
                            {sub ? (
                              <Badge tone={SUBMISSION_TONE[sub.status]} icon={SUBMISSION_ICON[sub.status]}>
                                {sub.period.year}: {SUBMISSION_LABELS[sub.status]}
                              </Badge>
                            ) : (
                              <span className="text-neutral-500">–</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Koncernadmins" description="Ret e-mail (brugeren logges ud og logger ind med den nye adresse), eller log ind som koncernadmin for at udfylde data." />
            {orgAdmins.length === 0 ? (
              <EmptyState>Koncernen har ingen koncernadmin. Opret en under Brugere, eller giv dig selv adgang.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {orgAdmins.map((m) => {
                  const protectedUser = m.userId === admin.id || m.user.platformAdmin || isPlatformOwner(m.user.email);
                  return (
                    <li key={m.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                      <ActionForm action={updateUser} className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                        <input type="hidden" name="userId" value={m.userId} />
                        <div className="min-w-56 flex-1">
                          <Input name="email" type="email" required defaultValue={m.user.email} aria-label={`E-mail for ${m.user.email}`} disabled={isPlatformOwner(m.user.email)} />
                          <FieldError name="email" />
                        </div>
                        {!isPlatformOwner(m.user.email) && (
                          <SubmitButton variant="secondary" pendingText="…">
                            Gem e-mail
                          </SubmitButton>
                        )}
                      </ActionForm>
                      {!protectedUser && !m.user.disabledAt && (
                        <ActionForm action={impersonateUser}>
                          <input type="hidden" name="userId" value={m.userId} />
                          <input type="hidden" name="organizationId" value={org.id} />
                          <SubmitButton variant="ghost" pendingText="…">
                            Log ind som
                          </SubmitButton>
                        </ActionForm>
                      )}
                      {m.user.disabledAt && <Badge tone="red">Spærret</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Brugere og adgange" />
            {org.memberships.length === 0 ? (
              <EmptyState>Ingen brugere.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {org.memberships.map((m) => (
                  <li key={m.id}>
                    <Link href={`/admin/users/${m.userId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 hover:bg-neutral-50">
                      <span className="font-medium">{m.user.email}</span>
                      {m.user.name && <span className="text-neutral-500">{m.user.name}</span>}
                      {m.user.disabledAt && <Badge tone="red">Spærret</Badge>}
                      <span className="ml-auto text-xs text-neutral-600">
                        {ROLE_LABELS[m.role]}
                        {m.company ? ` · ${m.company.name}` : ""}
                        {m.location ? ` · ${m.location.name}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {org.invitations.length > 0 && (
              <div className="border-t border-neutral-200 px-5 py-3 text-sm">
                <p className="text-xs font-medium text-neutral-500">Ventende invitationer</p>
                <ul className="mt-1 space-y-1">
                  {org.invitations.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span>{i.email}</span>
                      <span className="text-xs text-neutral-500">
                        {ROLE_LABELS[i.role]} · udløber {formatDate(i.expiresAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Seneste aktivitet" />
            {org.auditLogs.length === 0 ? (
              <EmptyState>Ingen aktivitet.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {org.auditLogs.map((a) => (
                  <li key={a.id} className="flex gap-3 px-5 py-2">
                    <span className="w-28 shrink-0 text-xs text-neutral-500 tabular-nums">{formatTime(a.createdAt)}</span>
                    <span>
                      <span className="font-medium">{a.user?.email ?? "System"}</span> {ACTION_LABELS[a.action] ?? a.action}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          {sharing.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Licensen deles med</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {sharing.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/organizations/${o.id}`} className="text-brand-700 hover:underline">
                      {o.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-neutral-500">En brugergrænse i licensen gælder samlet for alle koncernerne.</p>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="text-sm font-semibold">Din adgang</h3>
            {ownAccess.length > 0 ? (
              <p className="mt-1 text-sm text-neutral-600">Du er {ownAccess.map((m) => ROLE_LABELS[m.role].toLowerCase()).join(" og ")} i koncernen.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-neutral-500">Du er ikke medlem. Giv dig selv adgang for at se koncernens sider, fx ved support. Det står i koncernens aktivitetslog.</p>
                <ActionForm action={grantOrgAccess} className="mt-3 flex gap-2">
                  <input type="hidden" name="organizationId" value={org.id} />
                  <Select name="role" defaultValue="VIEWER" aria-label="Rolle">
                    <option value="VIEWER">Læser</option>
                    <option value="ORG_ADMIN">Koncernadmin</option>
                  </Select>
                  <SubmitButton variant="secondary" pendingText="…">
                    Giv adgang
                  </SubmitButton>
                </ActionForm>
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Rapporter" />
            {org.periods.length === 0 ? (
              <EmptyState>Ingen rapporteringsår.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {org.periods.map((p) =>
                  p.reports.length === 0 ? (
                    <li key={p.id} className="px-5 py-2.5 text-neutral-500">
                      {p.year}: ingen rapport
                    </li>
                  ) : (
                    p.reports.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                        <span>
                          {r.name} <span className="text-neutral-500">({p.year})</span>
                        </span>
                        <Badge tone={r.status === "APPROVED" ? "green" : r.status === "IN_REVIEW" ? "amber" : "neutral"}>{REPORT_STATUS_LABELS[r.status]}</Badge>
                      </li>
                    ))
                  ),
                )}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold">Filer</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {files._count} dokumentationsfiler · {formatBytes(files._sum.size ?? 0)}
            </p>
            {org.logoKey && (
              <div className="mt-3 flex h-16 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- privat billede bag login */}
                <img src={`/api/admin/logo/${org.id}`} alt={`Logo for ${org.name}`} className="max-h-full max-w-full object-contain" />
              </div>
            )}
            <Link href={`/admin/files?org=${org.id}`} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
              Se koncernens filer →
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
