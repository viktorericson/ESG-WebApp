import Link from "next/link";
import { Badge, Card, CardHeader, cx } from "@/components/ui";
import { CompanyResults, fmt, viewOfGroup } from "@/components/results";
import { calculateReport, calculateReportPrevious } from "@/lib/calc/server";
import { db } from "@/lib/db";
import { ALL_POLICY_TOPICS } from "@/lib/forms/modules/company-policies";
import { readiness, SUBMISSION_LABELS, SUBMISSION_TONE } from "@/lib/review";

type Company = { id: string; name: string };

/** Status pr. omfattet selskab: indsendelse og modulfremdrift */
export async function ReportStatus({ orgId, periodId, companies }: { orgId: string; periodId: string; companies: Company[] }) {
  const [subs, ready] = await Promise.all([
    db.companySubmission.findMany({ where: { periodId, companyId: { in: companies.map((c) => c.id) } } }),
    Promise.all(companies.map((c) => readiness(periodId, c.id))),
  ]);
  const approved = subs.filter((s) => s.status === "APPROVED").length;
  return (
    <Card>
      <CardHeader title="Status pr. selskab" description={`${approved} af ${companies.length} selskaber er godkendt. Rapporten kan godkendes, når alle er godkendt.`} />
      <ul className="divide-y divide-neutral-100 text-sm">
        {companies.map((c, i) => {
          const status = subs.find((s) => s.companyId === c.id)?.status ?? "DRAFT";
          const r = ready[i];
          return (
            <li key={c.id}>
              <Link href={`/org/${orgId}/companies/${c.id}?period=${periodId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-neutral-50">
                <span className="min-w-40 flex-1 font-medium">{c.name}</span>
                <span className="flex w-48 items-center gap-2 whitespace-nowrap text-xs text-neutral-500">
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-200">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
                  </span>
                  {r.done}/{r.total} moduler
                </span>
                <Badge tone={SUBMISSION_TONE[status]}>{SUBMISSION_LABELS[status]}</Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Koncernens konsoliderede nøgletal (100 % af de omfattede selskaber) */
export async function GroupKpis({ reportId, consolidated }: { reportId: string; consolidated: boolean }) {
  const [{ group, factorSet, factorYear }, previous, report] = await Promise.all([
    calculateReport(reportId),
    calculateReportPrevious(reportId),
    db.report.findUniqueOrThrow({ where: { id: reportId }, select: { period: { select: { year: true } } } }),
  ]);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{consolidated ? "Koncernens nøgletal (konsolideret)" : "Nøgletal"}</h2>
      <CompanyResults
        r={viewOfGroup(group)}
        year={report.period.year}
        previous={previous ? { year: previous.year, r: viewOfGroup(previous.group) } : null}
        factorLabel={`${consolidated ? "Fuld konsolidering af de omfattede selskaber. Rater er genberegnet ud fra summerede rådata. " : ""}${factorSet ? `Emissionsfaktorer: ${factorSet.name} ${factorSet.version}, faktorår ${factorYear}. GWP: IPCC AR6.` : ""}`}
        breakdown={
          consolidated && (
            <Card>
              <CardHeader title="Pr. selskab" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                    <tr>
                      {["Selskab", "Scope 1 (t)", "Scope 2 lok. (t)", "Scope 3 (t)", "Energi (MWh)", "Ansatte"].map((h, i) => (
                        <th key={h} className={cx("px-5 py-2 font-medium", i > 0 && "text-right")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.companies.map((c) => (
                      <tr key={c.companyId} className="border-b border-neutral-100">
                        <td className="px-5 py-2">{c.name}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{fmt(c.scope1T, 2)}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{fmt(c.scope2LocationT, 2)}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{fmt(c.scope3T, 2)}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{fmt(c.energyMWh)}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{fmt(c.employees, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        }
      />
    </section>
  );
}

const PRACTICE: Record<string, { label: string; tone: "green" | "amber" | "neutral" }> = {
  PUBLIC: { label: "Offentlig", tone: "green" },
  INTERNAL: { label: "Intern", tone: "amber" },
  NO: { label: "Nej", tone: "neutral" },
};

/** B2: praksisser og politikker pr. emne på tværs af selskaberne */
export async function PolicyMatrix({ periodId, companies }: { periodId: string; companies: Company[] }) {
  const rows = await db.moduleData.findMany({
    where: { periodId, moduleKey: "company.policies", companyId: { in: companies.map((c) => c.id) }, locationId: null },
    select: { companyId: true, answers: true },
  });
  const answersOf = (id: string) => (rows.find((r) => r.companyId === id)?.answers ?? {}) as Record<string, unknown>;
  return (
    <Card>
      <CardHeader
        title="Politikker og praksisser (B2)"
        description="Koncernens samlede svar pr. emne: “Ja”, hvis mindst ét selskab har praksis eller politik. Offentlig, hvis mindst ét selskabs er offentligt tilgængelig. ✓ = mål fastsat."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-5 py-2 font-medium">Emne</th>
              <th className="px-3 py-2 font-medium">Koncern</th>
              {companies.map((c) => (
                <th key={c.id} className="px-3 py-2 font-medium">{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_POLICY_TOPICS.map((t) => {
              const values = companies.map((c) => ({ practice: answersOf(c.id)[`${t.key}_practice`] as string | undefined, targets: answersOf(c.id)[`${t.key}_targets`] === "yes" }));
              const group = values.some((v) => v.practice === "PUBLIC") ? "PUBLIC" : values.some((v) => v.practice === "INTERNAL") ? "INTERNAL" : values.every((v) => v.practice === "NO") ? "NO" : undefined;
              const groupTargets = values.some((v) => (v.practice === "PUBLIC" || v.practice === "INTERNAL") && v.targets);
              return (
                <tr key={t.key} className="border-b border-neutral-100">
                  <td className="px-5 py-2">{t.label}</td>
                  <td className="px-3 py-2">{group ? <Badge tone={PRACTICE[group].tone}>{PRACTICE[group].label}{groupTargets ? " ✓" : ""}</Badge> : <span className="text-neutral-400">–</span>}</td>
                  {values.map((v, i) => (
                    <td key={companies[i].id} className="px-3 py-2">
                      {v.practice ? (
                        <span className="text-neutral-700">
                          {PRACTICE[v.practice]?.label ?? v.practice}
                          {v.targets && v.practice !== "NO" ? " ✓" : ""}
                        </span>
                      ) : (
                        <span className="text-neutral-400">–</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
