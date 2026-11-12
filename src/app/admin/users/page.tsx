import Link from "next/link";
import { Badge, Card, EmptyState, Input, PageHeader, buttonStyles } from "@/components/ui";
import { formatDate, formatTime, requirePlatformAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/env";
import { ROLE_LABELS } from "@/lib/permissions";

export const metadata = { title: "Brugere" };

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const onlyDisabled = sp.status === "disabled";

  const users = await db.user.findMany({
    where: {
      ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
      ...(onlyDisabled ? { disabledAt: { not: null } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      memberships: { include: { organization: { select: { id: true, name: true } } } },
      _count: { select: { attachments: true } },
      sessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true } },
    },
  });

  return (
    <>
      <PageHeader title="Brugere" description="Alle brugere på platformen og deres adgange." />

      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Søg på e-mail eller navn" className="max-w-xs" aria-label="Søg" />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="status" value="disabled" defaultChecked={onlyDisabled} className="size-4 accent-brand-600" />
          Kun spærrede
        </label>
        <button type="submit" className={buttonStyles.secondary}>
          Søg
        </button>
        {(q || onlyDisabled) && (
          <Link href="/admin/users" className="text-sm text-neutral-600 hover:text-neutral-900">
            Nulstil
          </Link>
        )}
      </form>

      <Card>
        {users.length === 0 ? (
          <EmptyState>Ingen brugere matcher.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Bruger</th>
                  <th className="px-3 py-2 font-medium">Koncerner og roller</th>
                  <th className="px-3 py-2 text-right font-medium">Filer</th>
                  <th className="px-3 py-2 font-medium">Sidst logget ind</th>
                  <th className="px-5 py-2 font-medium">Oprettet</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const byOrg = new Map<string, { name: string; roles: Set<string> }>();
                  for (const m of u.memberships) {
                    const cur = byOrg.get(m.organizationId) ?? { name: m.organization.name, roles: new Set<string>() };
                    cur.roles.add(ROLE_LABELS[m.role]);
                    byOrg.set(m.organizationId, cur);
                  }
                  return (
                    <tr key={u.id} className="border-b border-neutral-100 align-top hover:bg-neutral-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/admin/users/${u.id}`} className="font-medium text-brand-700 hover:underline">
                          {u.email}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-1.5">
                          {u.name && <span className="text-xs text-neutral-500">{u.name}</span>}
                          {isPlatformAdmin(u.email) && <Badge>Platformejer</Badge>}
                          {u.disabledAt && <Badge tone="red">Spærret</Badge>}
                          {u.sessions.length > 0 && !u.disabledAt && <Badge>Logget ind</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-700">
                        {byOrg.size === 0 ? (
                          <span className="text-neutral-500">Ingen koncern</span>
                        ) : (
                          [...byOrg.entries()].map(([id, o]) => (
                            <div key={id}>
                              {o.name} <span className="text-xs text-neutral-500">({[...o.roles].join(", ")})</span>
                            </div>
                          ))
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{u._count.attachments}</td>
                      <td className="px-3 py-2.5 text-neutral-600">{formatTime(u.lastLoginAt)}</td>
                      <td className="px-5 py-2.5 text-neutral-600">{formatDate(u.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {users.length === 200 && <p className="px-5 py-3 text-xs text-neutral-500">Viser de 200 nyeste. Brug søgningen for at finde andre.</p>}
      </Card>
    </>
  );
}
