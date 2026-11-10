import "server-only";
import { db } from "./db";
import type { Access } from "./permissions";

/** Aktive selskaber og lokationer, filtreret efter hvad brugeren må se. */
export async function getVisibleCompanies(orgId: string, access: Access) {
  const companies = await db.company.findMany({
    where: { organizationId: orgId, archivedAt: null },
    include: { locations: { where: { archivedAt: null }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  const locations = companies.flatMap((c) => c.locations.map((l) => ({ id: l.id, companyId: c.id })));
  const visible = companies.filter((c) => access.canViewCompany(c.id, locations));
  return visible.map((c) => ({
    ...c,
    locations: c.locations.filter((l) => access.canViewLocation(l)),
  }));
}

export type VisibleCompany = Awaited<ReturnType<typeof getVisibleCompanies>>[number];

export type TreeNode = VisibleCompany & { children: TreeNode[] };

/** Bygger koncerntræet. Selskaber hvis forælder ikke er synlig, bliver rødder. */
export function buildTree(companies: VisibleCompany[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>(companies.map((c) => [c.id, { ...c, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Hvilke roller/selskaber/lokationer brugeren må invitere til. */
export function getInviteOptions(access: Access, companies: VisibleCompany[]) {
  const roles = access.isAdmin
    ? (["COMPANY_MANAGER", "LOCATION_CONTRIBUTOR", "VIEWER", "ORG_ADMIN"] as const)
    : (["COMPANY_MANAGER", "LOCATION_CONTRIBUTOR"] as const);
  const managed = companies.filter((c) => access.managesCompany(c.id));
  return {
    roles: [...roles],
    companies: managed.map((c) => ({ id: c.id, name: c.name })),
    locations: managed.flatMap((c) => c.locations.map((l) => ({ id: l.id, name: l.name, companyName: c.name }))),
  };
}

/** Medlemmer og åbne invitationer, evt. afgrænset til ét selskab (inkl. dets lokationer). */
export async function getMembersAndInvites(orgId: string, companyId?: string) {
  const scope = companyId ? { OR: [{ companyId }, { location: { companyId } }] } : {};
  const [memberships, invitations] = await Promise.all([
    db.membership.findMany({
      where: { organizationId: orgId, ...scope },
      include: { user: true, company: true, location: { include: { company: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.invitation.findMany({
      where: { organizationId: orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, ...scope },
      include: { company: true, location: { include: { company: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { memberships, invitations };
}
