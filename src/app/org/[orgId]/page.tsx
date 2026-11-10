import Link from "next/link";
import { Badge, buttonStyles, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildTree, getVisibleCompanies, type TreeNode } from "@/lib/org-data";

export default async function OrgOverview({ params }: PageProps<"/org/[orgId]">) {
  const { orgId } = await params;
  const { access, organization } = await requireOrgAccess(orgId);
  const companies = await getVisibleCompanies(orgId, access);
  const tree = buildTree(companies);
  const [members, periods] = await Promise.all([
    db.membership.findMany({ where: { organizationId: orgId }, distinct: ["userId"], select: { userId: true } }),
    db.reportingPeriod.findMany({ where: { organizationId: orgId }, orderBy: { year: "desc" } }),
  ]);
  const locationCount = companies.reduce((n, c) => n + c.locations.length, 0);

  const stats = [
    { label: "Selskaber", value: companies.length },
    { label: "Lokationer", value: locationCount },
    { label: "Brugere", value: members.length },
    { label: "Seneste rapporteringsår", value: periods[0]?.year ?? "–" },
  ];

  return (
    <>
      <PageHeader
        title={organization.name}
        description="Koncernstruktur med selskaber og deres lokationer/faciliteter."
        action={
          access.canManageOrg && (
            <Link href={`/org/${orgId}/companies/new`} className={buttonStyles.primary}>
              Tilføj selskab
            </Link>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <p className="text-xs text-neutral-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      {!access.canViewAll && (
        <Card className="mb-6">
          <CardHeader title="Dine indrapporteringer" description="De selskaber og lokationer du har ansvar for." />
          <ul className="divide-y divide-neutral-100 text-sm">
            {companies
              .filter((c) => access.managesCompany(c.id))
              .map((c) => (
                <li key={c.id}>
                  <Link href={`/org/${orgId}/companies/${c.id}`} className="flex justify-between px-5 py-3 hover:bg-neutral-50">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-neutral-500">Selskab</span>
                  </Link>
                </li>
              ))}
            {companies
              .flatMap((c) => c.locations.filter((l) => access.contributesTo(l.id)).map((l) => ({ ...l, companyName: c.name })))
              .map((l) => (
                <li key={l.id}>
                  <Link href={`/org/${orgId}/locations/${l.id}`} className="flex justify-between px-5 py-3 hover:bg-neutral-50">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-xs text-neutral-500">Lokation · {l.companyName}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Koncernstruktur" description="Selskaber markeret “ikke konsolideret” indgår ikke i koncernens samlede opgørelse." />
        {tree.length === 0 ? (
          <EmptyState>Ingen selskaber endnu.</EmptyState>
        ) : (
          <ul className="py-2">
            {tree.map((node) => (
              <CompanyRow key={node.id} node={node} orgId={orgId} depth={0} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function CompanyRow({ node, orgId, depth }: { node: TreeNode; orgId: string; depth: number }) {
  return (
    <li>
      <Link
        href={`/org/${orgId}/companies/${node.id}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 pr-5 hover:bg-neutral-50"
        style={{ paddingLeft: `${20 + depth * 24}px` }}
      >
        {depth > 0 && <span className="text-neutral-300">└</span>}
        <span className="font-medium">{node.name}</span>
        <span className="font-mono text-xs text-neutral-500">CVR {node.cvr}</span>
        {!node.parentId && <Badge tone="green">Moderselskab</Badge>}
        {!node.consolidate && <Badge tone="amber">Ikke konsolideret</Badge>}
        <span className="ml-auto text-xs text-neutral-500">
          {node.locations.length} {node.locations.length === 1 ? "lokation" : "lokationer"}
        </span>
      </Link>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <CompanyRow key={child.id} node={child} orgId={orgId} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
