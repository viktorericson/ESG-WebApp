import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui";
import { grantOrgAccess } from "@/lib/actions/admin";
import { formatBytes, formatDate, formatTime, requirePlatformAdmin } from "@/lib/admin";
import { ACTION_LABELS } from "@/lib/audit-labels";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { SUBMISSION_LABELS, SUBMISSION_TONE } from "@/lib/review";
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

  return (
    <>
      <Link href="/admin/organizations" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← Koncerner
      </Link>
      <PageHeader
        title={org.name}
        description={`Oprettet ${formatDate(org.createdAt)} · ${org.companies.filter((c) => !c.archivedAt).length} selskaber · ${org.memberships.length} adgange · ${files._count} filer (${formatBytes(files._sum.size ?? 0)})`}
        action={
          ownAccess.length ? (
            <Link href={`/org/${org.id}`} className="text-sm font-medium text-brand-700 hover:underline">
              Åbn koncernen →
            </Link>
          ) : undefined
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
                              <Badge tone={SUBMISSION_TONE[sub.status]}>
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
