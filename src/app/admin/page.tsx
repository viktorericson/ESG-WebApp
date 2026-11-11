import Link from "next/link";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatBytes, formatTime, requirePlatformAdmin } from "@/lib/admin";
import { ACTION_LABELS } from "@/lib/audit-labels";
import { db } from "@/lib/db";

export const metadata = { title: "Overblik" };

const ADMIN_ACTIONS: Record<string, string> = {
  "user.update": "redigerede bruger",
  "user.disable": "spærrede bruger",
  "user.enable": "ophævede spærring af bruger",
  "user.signOut": "loggede bruger ud",
  "membership.role": "ændrede rolle",
  "membership.remove": "fjernede adgang",
  "membership.grant": "gav adgang",
  "attachment.delete": "slettede fil",
};

function Stat({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const body = (
    <Card className="px-4 py-3 transition-colors hover:border-brand-300">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function AdminHome() {
  await requirePlatformAdmin();
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  // Én transaktion i stedet for 12 samtidige forbindelser (den lokale prisma dev-database tåler få)
  const [orgs, companies, locations, users, disabled, activeUsers, files, reports, approved, newUsers, adminLog, activity] = await db.$transaction([
    db.organization.count(),
    db.company.count({ where: { archivedAt: null } }),
    db.location.count({ where: { archivedAt: null } }),
    db.user.count(),
    db.user.count({ where: { disabledAt: { not: null } } }),
    db.session.findMany({ where: { expiresAt: { gt: now } }, distinct: ["userId"], select: { userId: true } }),
    db.attachment.aggregate({ _count: true, _sum: { size: true } }),
    db.report.count(),
    db.report.count({ where: { status: "APPROVED" } }),
    db.user.findMany({ where: { createdAt: { gte: monthAgo } }, orderBy: { createdAt: "desc" }, take: 8, include: { memberships: { include: { organization: true } } } }),
    db.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { actor: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { user: true, organization: true } }),
  ]);

  return (
    <>
      <PageHeader title="Platformens overblik" description="Alle koncerner, brugere og filer på tværs af platformen." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Koncerner" value={orgs} hint={`${companies} selskaber · ${locations} lokationer`} href="/admin/organizations" />
        <Stat label="Brugere" value={users} hint={`${activeUsers.length} logget ind${disabled ? ` · ${disabled} spærret` : ""}`} href="/admin/users" />
        <Stat label="Filer" value={files._count} hint={formatBytes(files._sum.size ?? 0)} href="/admin/files" />
        <Stat label="Rapporter" value={reports} hint={`${approved} godkendt`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Seneste aktivitet i koncernerne" />
          {activity.length === 0 ? (
            <EmptyState>Ingen aktivitet endnu.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-2.5">
                  <span className="w-28 shrink-0 text-xs text-neutral-500 tabular-nums">{formatTime(a.createdAt)}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{a.user?.email ?? "System"}</span> <span className="text-neutral-600">{ACTION_LABELS[a.action] ?? a.action}</span>
                    <Link href={`/admin/organizations/${a.organizationId}`} className="block truncate text-xs text-brand-700 hover:underline">
                      {a.organization.name}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Nye brugere" description="De seneste 30 dage." />
            {newUsers.length === 0 ? (
              <EmptyState>Ingen nye brugere.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {newUsers.map((u) => (
                  <li key={u.id}>
                    <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-neutral-50">
                      <span className="min-w-0 flex-1 truncate font-medium">{u.email}</span>
                      <span className="truncate text-xs text-neutral-500">{[...new Set(u.memberships.map((m) => m.organization.name))].join(", ") || "Ingen koncern"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Admin-log" description="Ændringer foretaget her i admin." />
            {adminLog.length === 0 ? (
              <EmptyState>Ingen handlinger endnu.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {adminLog.map((a) => (
                  <li key={a.id} className="flex gap-3 px-5 py-2.5">
                    <span className="w-28 shrink-0 text-xs text-neutral-500 tabular-nums">{formatTime(a.createdAt)}</span>
                    <span>
                      <span className="font-medium">{a.actor?.email ?? "–"}</span> {ADMIN_ACTIONS[a.action] ?? a.action}
                      {a.targetType === "User" && (
                        <Link href={`/admin/users/${a.targetId}`} className="ml-1 text-brand-700 hover:underline">
                          vis
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
