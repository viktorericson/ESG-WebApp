import Link from "next/link";
import { Badge, buttonStyles, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildTree, getVisibleCompanies, type TreeNode } from "@/lib/org-data";
import { readiness, SUBMISSION_ICON, SUBMISSION_LABELS, SUBMISSION_TONE } from "@/lib/review";

type Progress = { status: string; done: number; total: number };

export default async function OrgOverview({ params }: PageProps<"/org/[orgId]">) {
  const { orgId } = await params;
  const { access, organization } = await requireOrgAccess(orgId);
  const companies = await getVisibleCompanies(orgId, access);
  const tree = buildTree(companies);
  const period = await db.reportingPeriod.findFirst({ where: { organizationId: orgId }, orderBy: { year: "desc" } });

  // Indsendelsesstatus pr. selskab for det seneste rapporteringsår – det koncernadmin skal følge op på
  const progress = new Map<string, Progress>();
  if (period) {
    const subs = await db.companySubmission.findMany({ where: { periodId: period.id, companyId: { in: companies.map((c) => c.id) } } });
    const ready = await Promise.all(companies.map((c) => readiness(period.id, c.id)));
    companies.forEach((c, i) => {
      progress.set(c.id, { status: subs.find((s) => s.companyId === c.id)?.status ?? "DRAFT", done: ready[i].done, total: ready[i].total });
    });
  }
  const count = (status: string) => [...progress.values()].filter((p) => p.status === status).length;
  const summary = [
    { status: "APPROVED", n: count("APPROVED"), label: "godkendt" },
    { status: "SUBMITTED", n: count("SUBMITTED"), label: "afventer gennemgang" },
    { status: "RETURNED", n: count("RETURNED"), label: "sendt tilbage" },
    { status: "DRAFT", n: count("DRAFT"), label: "ikke indsendt" },
  ].filter((s) => s.n > 0);

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

      {period && summary.length > 0 && (
        <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-neutral-700">
          <span className="font-medium">Indsendelse {period.year}:</span>
          {summary.map((s) => (
            <Badge key={s.status} tone={SUBMISSION_TONE[s.status as keyof typeof SUBMISSION_TONE]} icon={SUBMISSION_ICON[s.status]}>
              {s.n} {s.label}
            </Badge>
          ))}
        </p>
      )}

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
        <CardHeader
          title="Koncernstruktur"
          description={`Selskaber markeret “ikke konsolideret” indgår ikke i koncernens samlede opgørelse.${period ? ` Status gælder rapporteringsår ${period.year}.` : ""}`}
        />
        {tree.length === 0 ? (
          <EmptyState>Ingen selskaber endnu.</EmptyState>
        ) : (
          <ul className="py-2">
            {tree.map((node) => (
              <CompanyRow key={node.id} node={node} orgId={orgId} depth={0} progress={progress} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function CompanyRow({ node, orgId, depth, progress }: { node: TreeNode; orgId: string; depth: number; progress: Map<string, Progress> }) {
  const p = progress.get(node.id);
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
        {!node.parentId && <Badge>Moderselskab</Badge>}
        {!node.consolidate && <Badge>Ikke konsolideret</Badge>}
        <span className="ml-auto flex items-center gap-3 text-xs text-neutral-600">
          <span>
            {node.locations.length} {node.locations.length === 1 ? "lokation" : "lokationer"}
          </span>
          {p && (
            <>
              <span className="tabular-nums">
                {p.done}/{p.total} moduler
              </span>
              <Badge tone={SUBMISSION_TONE[p.status as keyof typeof SUBMISSION_TONE]} icon={SUBMISSION_ICON[p.status]}>
                {SUBMISSION_LABELS[p.status]}
              </Badge>
            </>
          )}
        </span>
      </Link>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <CompanyRow key={child.id} node={child} orgId={orgId} depth={depth + 1} progress={progress} />
          ))}
        </ul>
      )}
    </li>
  );
}
