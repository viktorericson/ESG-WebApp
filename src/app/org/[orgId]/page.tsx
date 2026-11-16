import Link from "next/link";
import { Badge, buttonStyles, Card, CardHeader, cx, EmptyState, PageHeader } from "@/components/ui";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildTree, getVisibleCompanies, type TreeNode, type VisibleCompany } from "@/lib/org-data";
import { readiness, SUBMISSION_ICON, SUBMISSION_LABELS, SUBMISSION_TONE, type ModuleReadiness } from "@/lib/review";

type Progress = { status: string; done: number; total: number; items: ModuleReadiness[] };
type Step = { title: string; detail: string; done: boolean; action?: { href: string; label: string }; links?: { href: string; label: string }[] };

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
      progress.set(c.id, { status: subs.find((s) => s.companyId === c.id)?.status ?? "DRAFT", done: ready[i].done, total: ready[i].total, items: ready[i].items });
    });
  }
  const count = (status: string) => [...progress.values()].filter((p) => p.status === status).length;
  const summary = [
    { status: "APPROVED", n: count("APPROVED"), label: "godkendt" },
    { status: "SUBMITTED", n: count("SUBMITTED"), label: "afventer gennemgang" },
    { status: "RETURNED", n: count("RETURNED"), label: "sendt tilbage" },
    { status: "DRAFT", n: count("DRAFT"), label: "ikke indsendt" },
  ].filter((s) => s.n > 0);

  const steps = access.canManageOrg ? await adminSteps(orgId, companies, period, progress) : null;
  const current = steps?.findIndex((s) => !s.done) ?? -1;
  const q = period ? `?period=${period.id}` : "";

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

      {steps && current >= 0 && (
        <Card className="mb-6">
          <CardHeader
            title={period ? `Vejen til ESG-rapporten ${period.year}` : "Kom i gang"}
            description={`Trin ${current + 1} af ${steps.length}: ${steps[current].title.toLowerCase()}.`}
          />
          <ol className="divide-y divide-neutral-100">
            {steps.map((s, i) => (
              <li key={s.title} aria-current={i === current ? "step" : undefined} className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm", i === current && "bg-brand-50/60")}>
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    s.done ? "bg-brand-600 text-white" : i === current ? "border-2 border-brand-600 text-brand-700" : "border border-neutral-300 text-neutral-500",
                  )}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <span className="min-w-48 flex-1">
                  <span className={cx("block font-medium", !s.done && i !== current && "text-neutral-600")}>
                    {s.title}
                    {s.done && <span className="sr-only"> (færdig)</span>}
                  </span>
                  <span className="block text-xs text-neutral-600">{s.detail}</span>
                  {i === current && s.links && s.links.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {s.links.map((l) => (
                        <Link key={l.href} href={l.href} className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900">
                          {l.label}
                        </Link>
                      ))}
                    </span>
                  )}
                </span>
                {i === current && s.action && (
                  <Link href={s.action.href} className={`${buttonStyles.primary} whitespace-nowrap py-1.5`}>
                    {s.action.label} →
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {!access.canViewAll && (
        <Card className="mb-6">
          <CardHeader
            title={period ? `Dine indrapporteringer ${period.year}` : "Dine indrapporteringer"}
            description={period ? "Udfyld modulerne for de selskaber og lokationer, du har ansvar for. Svar gemmes automatisk." : "Koncernadmin har endnu ikke oprettet et rapporteringsår, så der er ikke noget at udfylde endnu."}
          />
          <ul className="divide-y divide-neutral-100 text-sm">
            {companies
              .filter((c) => access.managesCompany(c.id))
              .map((c) => {
                const p = progress.get(c.id);
                return (
                  <TaskRow
                    key={c.id}
                    href={`/org/${orgId}/companies/${c.id}${q}`}
                    name={c.name}
                    kind={`Selskab · ${c.locations.length} ${c.locations.length === 1 ? "lokation" : "lokationer"}`}
                    done={p?.done}
                    total={p?.total}
                    status={p?.status}
                    cta={!p ? "Åbn" : p.status === "SUBMITTED" || p.status === "APPROVED" ? "Se data" : p.done === p.total && p.total > 0 ? "Indsend" : p.status === "RETURNED" ? "Ret data" : p.done > 0 ? "Fortsæt" : "Start"}
                  />
                );
              })}
            {companies
              .flatMap((c) => c.locations.filter((l) => access.contributesTo(l.id)).map((l) => ({ ...l, companyName: c.name, p: progress.get(c.id) })))
              .map((l) => {
                const items = l.p?.items.filter((i) => i.locationId === l.id);
                const done = items?.filter((i) => i.done).length;
                const locked = l.p?.status === "SUBMITTED" || l.p?.status === "APPROVED";
                return (
                  <TaskRow
                    key={l.id}
                    href={`/org/${orgId}/locations/${l.id}${q}`}
                    name={l.name}
                    kind={`Lokation · ${l.companyName}`}
                    done={done}
                    total={items?.length}
                    status={locked || l.p?.status === "RETURNED" ? l.p?.status : undefined}
                    cta={!items ? "Åbn" : locked || done === items.length ? "Se data" : done ? "Fortsæt" : "Start"}
                  />
                );
              })}
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

/** Én opgave for en selskabsansvarlig eller lokationsbidragyder: fremdrift, status og en tydelig vej ind */
function TaskRow({ href, name, kind, done, total, status, cta }: { href: string; name: string; kind: string; done?: number; total?: number; status?: string; cta: string }) {
  const complete = total !== undefined && total > 0 && done === total;
  const primary = cta !== "Se data" && cta !== "Åbn";
  return (
    <li>
      <Link href={href} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-neutral-50">
        <span className="min-w-40 flex-1">
          <span className="block font-medium">{name}</span>
          <span className="block text-xs text-neutral-500">{kind}</span>
        </span>
        {total !== undefined && (
          <span className="w-40 text-xs text-neutral-600">
            <span className="block h-1.5 overflow-hidden rounded-full bg-neutral-200">
              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${total ? ((done ?? 0) / total) * 100 : 0}%` }} />
            </span>
            <span className="mt-1 block tabular-nums">{complete ? "✓ Alle moduler færdige" : `${done ?? 0} af ${total} moduler færdige`}</span>
          </span>
        )}
        {status && status !== "DRAFT" && (
          <Badge tone={SUBMISSION_TONE[status as keyof typeof SUBMISSION_TONE]} icon={SUBMISSION_ICON[status]}>
            {SUBMISSION_LABELS[status]}
          </Badge>
        )}
        <span className={`${primary ? buttonStyles.primary : buttonStyles.secondary} whitespace-nowrap py-1.5`}>{cta} →</span>
      </Link>
    </li>
  );
}

/**
 * Koncernadmins vej fra tom koncern til eksporteret rapport. Første trin, der ikke er færdigt, er det aktuelle.
 * Trin 3–4 tæller de selskaber, der er omfattet af årets rapporter (alle selskaber, hvis ingen rapport findes).
 */
async function adminSteps(orgId: string, companies: VisibleCompany[], period: { id: string; year: number } | null, progress: Map<string, Progress>): Promise<Step[]> {
  const base = `/org/${orgId}`;
  const q = period ? `?period=${period.id}` : "";
  const reports = period
    ? await db.report.findMany({ where: { periodId: period.id }, select: { id: true, name: true, status: true, companies: { select: { companyId: true } } }, orderBy: { createdAt: "asc" } })
    : [];
  const inScope = new Set(reports.flatMap((r) => r.companies.map((c) => c.companyId)));
  const scoped = inScope.size ? companies.filter((c) => inScope.has(c.id)) : companies;
  const rows = scoped.map((c) => ({ c, p: progress.get(c.id) }));

  const locations = companies.reduce((n, c) => n + c.locations.length, 0);
  const noLocations = companies.filter((c) => c.locations.length === 0);
  const done = rows.reduce((n, r) => n + (r.p?.done ?? 0), 0);
  const total = rows.reduce((n, r) => n + (r.p?.total ?? 0), 0);
  const unfinished = rows.filter((r) => r.p && r.p.done < r.p.total);
  const awaiting = rows.filter((r) => r.p?.status === "SUBMITTED");
  const notSubmitted = rows.filter((r) => r.p?.status === "DRAFT" || r.p?.status === "RETURNED");
  const approved = rows.filter((r) => r.p?.status === "APPROVED").length;
  const report = reports.find((r) => r.status !== "APPROVED") ?? reports[0];
  const companyLink = (r: (typeof rows)[number], suffix = "") => ({ href: `${base}/companies/${r.c.id}${q}`, label: `${r.c.name}${suffix}` });
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return [
    {
      title: "Opbyg koncernen",
      detail:
        locations === 0
          ? "Tilføj de lokationer, selskaberne ejer, lejer eller driver. Energi, vand og affald indrapporteres pr. lokation."
          : `${plural(companies.length, "selskab", "selskaber")} og ${plural(locations, "lokation", "lokationer")}${noLocations.length ? ` · ${plural(noLocations.length, "selskab", "selskaber")} uden lokationer` : ""}.`,
      done: locations > 0,
      action: noLocations[0] ? { href: `${base}/companies/${noLocations[0].id}`, label: "Tilføj lokationer" } : undefined,
    },
    {
      title: "Opret rapporteringsår",
      detail: period ? `Rapporteringsår ${period.year} er oprettet.` : "Året følger regnskabsåret. Der oprettes automatisk en rapport for koncernen.",
      done: !!period,
      action: { href: `${base}/reports`, label: "Opret rapporteringsår" },
    },
    {
      title: "Indrapportér data",
      detail: period
        ? `${done} af ${total} moduler er færdige. Du kan selv udfylde dem eller invitere ansvarlige for selskaber og lokationer.`
        : "Hvert selskab og hver lokation udfylder sine moduler – selv eller via inviterede ansvarlige.",
      done: !!period && total > 0 && unfinished.length === 0,
      action: unfinished[0] ? { href: `${base}/companies/${unfinished[0].c.id}${q}`, label: unfinished.length === 1 ? "Fortsæt udfyldning" : `Fortsæt med ${unfinished[0].c.name}` } : undefined,
      links: [...unfinished.slice(1, 5).map((r) => companyLink(r, ` (${r.p!.done}/${r.p!.total})`)), { href: `${base}/members`, label: "Invitér ansvarlige" }],
    },
    {
      title: "Indsend og godkend selskabernes data",
      detail: !period
        ? "Hvert selskab indsender sine data, og du godkender dem eller sender dem tilbage."
        : awaiting.length
          ? `${plural(awaiting.length, "selskab", "selskaber")} afventer din gennemgang · ${approved} af ${rows.length} godkendt.`
          : `${approved} af ${plural(rows.length, "selskab", "selskaber")} er godkendt${notSubmitted.length ? ` · ${notSubmitted.length} er ikke indsendt endnu` : ""}.`,
      done: !!period && rows.length > 0 && approved === rows.length,
      action: awaiting[0] ? { href: `${base}/companies/${awaiting[0].c.id}${q}`, label: `Gennemgå ${awaiting[0].c.name}` } : notSubmitted[0] ? { href: `${base}/companies/${notSubmitted[0].c.id}${q}`, label: `Indsend ${notSubmitted[0].c.name}` } : undefined,
      links: [...awaiting.slice(1), ...(awaiting.length ? notSubmitted : notSubmitted.slice(1))].slice(0, 5).map((r) => companyLink(r)),
    },
    {
      title: "Godkend og eksportér rapporten",
      detail: report ? `${report.name}: skriv forord og kommentarer, godkend rapporten og hent den som PowerPoint eller PDF.` : "Skriv forord og kommentarer, godkend rapporten og hent den som PowerPoint eller PDF.",
      done: reports.length > 0 && reports.every((r) => r.status === "APPROVED"),
      action: report ? { href: `${base}/reports/${report.id}`, label: "Åbn rapporten" } : { href: `${base}/reports`, label: "Gå til rapporter" },
    },
  ];
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
