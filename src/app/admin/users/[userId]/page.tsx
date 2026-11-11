import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState, Input, Label, PageHeader, Select } from "@/components/ui";
import { grantOrgAccess, removeMembership, setMembershipRole, setUserDisabled, signOutUser, updateUser } from "@/lib/actions/admin";
import { formatBytes, formatDate, formatTime, requirePlatformAdmin } from "@/lib/admin";
import { ACTION_LABELS } from "@/lib/audit-labels";
import { db } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/env";
import { ROLE_LABELS } from "@/lib/permissions";

export default async function AdminUser({ params }: PageProps<"/admin/users/[userId]">) {
  const { userId } = await params;
  const admin = await requirePlatformAdmin();
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { organization: { select: { id: true, name: true } }, company: { select: { name: true } }, location: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      sessions: { where: { expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } },
      attachments: { orderBy: { createdAt: "desc" }, take: 20, include: { moduleData: { include: { company: { select: { name: true } } } } } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 15, include: { organization: { select: { name: true } } } },
    },
  });
  if (!user) notFound();
  const orgs = await db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const isSelf = user.id === admin.id;

  return (
    <>
      <Link href="/admin/users" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← Brugere
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {user.email}
            {isPlatformAdmin(user.email) && <Badge tone="green">Platformejer</Badge>}
            {user.disabledAt && <Badge tone="red">Spærret</Badge>}
          </span>
        }
        description={`Oprettet ${formatDate(user.createdAt)} · sidst logget ind ${formatTime(user.lastLoginAt)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Adgange" description="Roller i koncernerne. Roller for hele koncernen kan skiftes her; adgange til ét selskab eller én lokation kan fjernes." />
            {user.memberships.length === 0 ? (
              <EmptyState>Brugeren har ingen adgange.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {user.memberships.map((m) => {
                  const orgWide = !m.companyId && !m.locationId && (m.role === "ORG_ADMIN" || m.role === "VIEWER");
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/organizations/${m.organizationId}`} className="font-medium text-brand-700 hover:underline">
                          {m.organization.name}
                        </Link>
                        <p className="text-xs text-neutral-500">
                          {m.company ? `Selskab: ${m.company.name}` : m.location ? `Lokation: ${m.location.name}` : "Hele koncernen"} · siden {formatDate(m.createdAt)}
                        </p>
                      </div>
                      {orgWide ? (
                        <ActionForm action={setMembershipRole} className="flex items-center gap-2">
                          <input type="hidden" name="membershipId" value={m.id} />
                          <Select name="role" defaultValue={m.role} aria-label={`Rolle i ${m.organization.name}`} className="w-auto">
                            <option value="ORG_ADMIN">{ROLE_LABELS.ORG_ADMIN}</option>
                            <option value="VIEWER">{ROLE_LABELS.VIEWER}</option>
                          </Select>
                          <SubmitButton variant="secondary" pendingText="…">
                            Gem
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <span className="text-sm text-neutral-700">{ROLE_LABELS[m.role]}</span>
                      )}
                      <ActionForm action={removeMembership} confirm={`Fjern ${user.email}s adgang til ${m.organization.name}?`}>
                        <input type="hidden" name="membershipId" value={m.id} />
                        <SubmitButton variant="ghost" pendingText="…">
                          Fjern
                        </SubmitButton>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
            )}
            <ActionForm action={grantOrgAccess} className="flex flex-wrap items-end gap-2 border-t border-neutral-200 px-5 py-4" resetOnSuccess>
              <input type="hidden" name="userId" value={user.id} />
              <div>
                <Label htmlFor="organizationId">Giv adgang til koncern</Label>
                <Select id="organizationId" name="organizationId" defaultValue="" className="mt-1">
                  <option value="" disabled>
                    Vælg koncern
                  </option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="role">Rolle</Label>
                <Select id="role" name="role" defaultValue="VIEWER" className="mt-1">
                  <option value="VIEWER">{ROLE_LABELS.VIEWER}</option>
                  <option value="ORG_ADMIN">{ROLE_LABELS.ORG_ADMIN}</option>
                </Select>
              </div>
              <SubmitButton variant="secondary">Giv adgang</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title="Filer uploadet af brugeren" description={user.attachments.length === 20 ? "De 20 nyeste." : undefined} />
            {user.attachments.length === 0 ? (
              <EmptyState>Ingen filer.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {user.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                    <a href={`/api/admin/attachments/${a.id}`} className="min-w-0 flex-1 truncate font-medium text-brand-700 hover:underline">
                      {a.filename}
                    </a>
                    <span className="text-xs text-neutral-500">
                      {a.moduleData.company.name} · {formatBytes(a.size)} · {formatDate(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Seneste aktivitet" />
            {user.auditLogs.length === 0 ? (
              <EmptyState>Ingen aktivitet.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {user.auditLogs.map((a) => (
                  <li key={a.id} className="flex gap-3 px-5 py-2">
                    <span className="w-28 shrink-0 text-xs text-neutral-500 tabular-nums">{formatTime(a.createdAt)}</span>
                    <span>
                      {ACTION_LABELS[a.action] ?? a.action} <span className="text-neutral-500">i {a.organization.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Profil" />
            <ActionForm action={updateUser} className="space-y-4 p-5">
              <input type="hidden" name="userId" value={user.id} />
              <div>
                <Label htmlFor="name">Navn</Label>
                <Input id="name" name="name" defaultValue={user.name ?? ""} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" required defaultValue={user.email} className="mt-1" />
                <FieldError name="email" />
                <p className="mt-1 text-xs text-neutral-500">Brugeren logger ind med den nye adresse fremover.</p>
              </div>
              <SubmitButton>Gem</SubmitButton>
            </ActionForm>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold">Login</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {user.sessions.length === 0 ? "Ikke logget ind lige nu." : `${user.sessions.length} aktiv${user.sessions.length === 1 ? "" : "e"} session${user.sessions.length === 1 ? "" : "er"} · seneste ${formatTime(user.sessions[0].createdAt)}`}
            </p>
            {isSelf ? (
              <p className="mt-3 text-xs text-neutral-500">Det er din egen konto, så den kan ikke spærres eller logges ud herfra.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {user.sessions.length > 0 && (
                  <ActionForm action={signOutUser}>
                    <input type="hidden" name="userId" value={user.id} />
                    <SubmitButton variant="secondary" pendingText="Logger ud…">
                      Log ud på alle enheder
                    </SubmitButton>
                  </ActionForm>
                )}
                <ActionForm
                  action={setUserDisabled}
                  confirm={user.disabledAt ? `Ophæv spærringen af ${user.email}?` : `Spær ${user.email}? Brugeren logges ud og kan ikke logge ind igen, før spærringen ophæves. Data og adgange bevares.`}
                >
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="disable" value={user.disabledAt ? "0" : "1"} />
                  <SubmitButton variant={user.disabledAt ? "secondary" : "danger"} pendingText="…">
                    {user.disabledAt ? "Ophæv spærring" : "Spær bruger"}
                  </SubmitButton>
                </ActionForm>
                {user.disabledAt && <p className="text-xs text-neutral-500">Spærret {formatTime(user.disabledAt)}.</p>}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
