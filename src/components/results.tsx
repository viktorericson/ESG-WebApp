import type { ReactNode } from "react";
import { Card, CardHeader, cx } from "@/components/ui";
import type { CompanyResult } from "@/lib/calc/company";
import type { GroupResult } from "@/lib/calc/consolidate";

/** Fælles visning for et selskab eller en konsolideret koncern */
export type ResultView = Pick<CompanyResult, "energy" | "ghg" | "water" | "waste" | "workforce" | "health" | "pay" | "c5" | "issues" | "scope3"> & {
  scope1Lines: CompanyResult["scope1"]["lines"];
  locations?: CompanyResult["locations"];
};

export const viewOfCompany = (r: CompanyResult): ResultView => ({ ...r, scope1Lines: r.scope1.lines });
export const viewOfGroup = (g: GroupResult): ResultView => ({ ...g, scope1Lines: g.scope1Lines });
import { categoryLabel } from "@/lib/calc/scope3";
import { totalOf, type EnergySplit } from "@/lib/calc/types";

const nf = (digits: number) => new Intl.NumberFormat("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmt = (v: number | null | undefined, digits = 1, unit = "") => (v === null || v === undefined || !Number.isFinite(v) ? "–" : `${nf(digits).format(v)}${unit ? ` ${unit}` : ""}`);

const GENDER: Record<string, string> = { MALE: "Mænd", FEMALE: "Kvinder", OTHER: "Andet", UNREPORTED: "Ikke registreret" };
const CONTRACT: Record<string, string> = { PERMANENT: "Fastansatte", TEMPORARY: "Midlertidigt ansatte" };

export function StatTile({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
        {unit && value !== "–" && <span className="ml-1 text-sm font-normal text-neutral-500">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </Card>
  );
}

export function GhgTiles({ r }: { r: Pick<CompanyResult, "ghg"> }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="Scope 1" value={fmt(r.ghg.scope1T, 2)} unit="t CO₂e" />
      <StatTile label="Scope 2 (lokationsbaseret)" value={fmt(r.ghg.scope2LocationT, 2)} unit="t CO₂e" hint={`Markedsbaseret: ${fmt(r.ghg.scope2MarketT, 2)} t`} />
      <StatTile label="Scope 1 + 2" value={fmt(r.ghg.totalLocationT, 2)} unit="t CO₂e" />
      <StatTile label="CO₂e-intensitet" value={fmt(r.ghg.intensityPerMDKK, 2)} unit="t/mio. kr." />
    </div>
  );
}

function Table({ head, rows, foot }: { head: ReactNode[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cx("px-5 py-2 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-neutral-100">
              {r.map((c, j) => (
                <td key={j} className={cx("px-5 py-2", j > 0 && "text-right tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot className="font-semibold">
            <tr>
              {foot.map((c, j) => (
                <td key={j} className={cx("px-5 py-2", j > 0 && "text-right tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const splitRow = (label: string, s: EnergySplit) => [label, fmt(s.renewable), fmt(s.nonRenewable), fmt(totalOf(s))];

type Previous = { year: number; r: ResultView } | null | undefined;

/** Nøgletal for i år mod året før. Ændringer over ±50 % markeres som et plausibilitetstjek. */
export function YearComparison({ r, year, previous }: { r: ResultView; year: number; previous: NonNullable<Previous> }) {
  const p = previous.r;
  const rows: [string, number | null, number | null, number, string?][] = [
    ["Scope 1 (t CO₂e)", p.ghg.scope1T, r.ghg.scope1T, 2],
    ["Scope 2 lokationsbaseret (t CO₂e)", p.ghg.scope2LocationT, r.ghg.scope2LocationT, 2],
    ["Scope 1 + 2 (t CO₂e)", p.ghg.totalLocationT, r.ghg.totalLocationT, 2],
    ["Scope 3 (t CO₂e)", p.ghg.scope3T, r.ghg.scope3T, 2],
    ["CO₂e-intensitet (t/mio. kr.)", p.ghg.intensityPerMDKK, r.ghg.intensityPerMDKK, 2],
    ["Energiforbrug (MWh)", totalOf(p.energy.total), totalOf(r.energy.total), 1],
    ["Vandindtag (m³)", p.water.intakeM3, r.water.intakeM3, 0],
    ["Affald (t)", p.waste.totalT, r.waste.totalT, 2],
    ["Ansatte", p.workforce.total, r.workforce.total, 0],
    ["Ulykkesfrekvens", p.health.accidentRate, r.health.accidentRate, 1],
  ];
  return (
    <Card>
      <CardHeader title={`Sammenligning med ${previous.year}`} description="Store ændringer (over ±50 %) er markeret, så de kan tjekkes for tastefejl eller ændret opgørelse." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-5 py-2 font-medium" />
              <th className="px-5 py-2 text-right font-medium">{previous.year}</th>
              <th className="px-5 py-2 text-right font-medium">{year}</th>
              <th className="px-5 py-2 text-right font-medium">Ændring</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, before, now, digits]) => {
              const change = before !== null && now !== null && before !== 0 ? ((now - before) / Math.abs(before)) * 100 : null;
              const big = change !== null && Math.abs(change) > 50;
              return (
                <tr key={label} className="border-b border-neutral-100">
                  <td className="px-5 py-2">{label}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-neutral-500">{fmt(before, digits)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{fmt(now, digits)}</td>
                  <td className={cx("px-5 py-2 text-right tabular-nums", big ? "font-medium text-amber-700" : change !== null && change < 0 ? "text-brand-700" : "text-neutral-600")}>
                    {change === null ? "–" : `${change > 0 ? "+" : ""}${fmt(change, 0)} %`}
                    {big && <span className="ml-1" title="Over ±50 % – tjek tallet">⚠</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function CompanyResults({
  r,
  factorLabel,
  breakdown,
  year,
  previous,
}: {
  r: ResultView;
  factorLabel: string;
  breakdown?: ReactNode;
  year?: number;
  previous?: Previous;
}) {
  const sortedEntries = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const scope1ByCategory = Object.entries(
    r.scope1Lines.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.category]: (acc[l.category] ?? 0) + l.tCO2e }), {}),
  );

  return (
    <div className="space-y-6">
      <GhgTiles r={r} />

      {r.issues.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 px-5 py-4">
          <h2 className="text-sm font-semibold text-amber-900">Bemærkninger til beregningen</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {r.issues.map((i, k) => (
              <li key={k}>
                <span className="mr-1.5 text-xs font-medium uppercase">{i.level === "missing" ? "Mangler" : i.level === "estimate" ? "Estimat" : "Info"}</span>
                {i.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {previous && year !== undefined && <YearComparison r={r} year={year} previous={previous} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Energiforbrug (B3)" description="MWh, pkt. 32" />
          <Table
            head={["", "Vedvarende", "Ikke-vedvarende", "Total"]}
            rows={[splitRow("Elektricitet", r.energy.electricity), splitRow("Brændstoffer", r.energy.fuels), splitRow("Andet (fx fjernvarme)", r.energy.other)]}
            foot={splitRow("Total", r.energy.total)}
          />
          <p className="px-5 py-3 text-xs text-neutral-500">
            El regnes kun som vedvarende, når den er dækket af oprindelsesgarantier eller er egenproduceret. Fjernvarme regnes som ikke-vedvarende, medmindre andelen er oplyst.
          </p>
        </Card>

        <Card>
          <CardHeader title="Drivhusgasudledning (B3)" description="t CO₂e, pkt. 33" />
          <Table
            head={["", "t CO₂e"]}
            rows={[
              ["Scope 1", fmt(r.ghg.scope1T, 2)],
              ...scope1ByCategory.map(([c, t]) => [<span key={c} className="pl-4 text-neutral-500">{c}</span>, fmt(t, 2)]),
              ["Scope 2 (lokationsbaseret)", fmt(r.ghg.scope2LocationT, 2)],
              ["Scope 2 (markedsbaseret)", fmt(r.ghg.scope2MarketT, 2)],
              ...(r.scope3.included
                ? [
                    ["Scope 3 (værdikæden)", fmt(r.scope3.totalT, 2)],
                    ...Object.entries(r.scope3.byCategory)
                      .sort((a, b) => Number(a[0]) - Number(b[0]))
                      .map(([c, t]) => [<span key={`s3-${c}`} className="pl-4 text-neutral-500">{categoryLabel(Number(c))}</span>, fmt(t, 2)]),
                  ]
                : []),
              ["Biogen CO₂ (udenfor scopes)", fmt(r.ghg.outsideScopesT, 2)],
            ]}
            foot={["Scope 1 + 2 (lokationsbaseret)", fmt(r.ghg.totalLocationT, 2)]}
          />
          {r.scope3.included ? (
            <p className="px-5 py-3 text-xs text-neutral-500">
              Scope 1 + 2 + 3: {fmt(r.ghg.totalLocationT + r.scope3.totalT, 2)} t CO₂e. Scope 3 er frivilligt og omfatter kun de registrerede kategorier.
            </p>
          ) : (
            <p className="px-5 py-3 text-xs text-neutral-500">Scope 3 er ikke opgjort (selskabsmodul 11).</p>
          )}
        </Card>
      </div>

      {breakdown}

      {r.locations && r.locations.length > 0 && (
        <Card>
          <CardHeader title="Pr. lokation" />
          <Table
            head={["Lokation", "El og varme (MWh)", "Scope 1 (t)", "Scope 2 lok. (t)", "Vandindtag (m³)", "Affald (t)"]}
            rows={r.locations.map((l) => [
              l.name,
              fmt(totalOf(l.energy.electricity) + totalOf(l.energy.ownElectricity) + totalOf(l.energy.districtHeating) + totalOf(l.energy.steamCooling)),
              fmt(l.scope1T, 2),
              fmt(l.energy.scope2LocationT, 2),
              fmt(l.water.intakeM3, 0),
              fmt(l.waste.hazardousT + l.waste.nonHazardousT, 2),
            ])}
          />
          <p className="px-5 py-3 text-xs text-neutral-500">Scope 1 pr. lokation omfatter kun kilder, der er knyttet til lokationen i selskabets Scope 1-modul.</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Vand (B6) og affald (B7)" />
          <Table
            head={["", "Værdi"]}
            rows={[
              ["Vandindtag", fmt(r.water.intakeM3, 0, "m³")],
              ["Vandforbrug (processer)", fmt(r.water.consumptionM3, 0, "m³")],
              ["Heraf i områder med vandstress", fmt(r.water.consumptionStressM3, 0, "m³")],
              ["Ikke-farligt affald", fmt(r.waste.nonHazardousT, 2, "t")],
              ["Farligt affald", fmt(r.waste.hazardousT, 2, "t")],
              ["Til genanvendelse/genbrug", fmt(r.waste.recycledT, 2, "t")],
              ["Genanvendelsesandel", fmt(r.waste.recyclingRate === null ? null : r.waste.recyclingRate * 100, 1, "%")],
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Medarbejdere (B8–B10)" description={r.workforce.unit === "FTE" ? "Opgjort i FTE" : r.workforce.unit === "HEADCOUNT" ? "Opgjort i antal personer" : undefined} />
          <Table
            head={["", "Værdi"]}
            rows={[
              ["Ansatte i alt", fmt(r.workforce.total, 0)],
              ...sortedEntries(r.workforce.byContract).map(([k, v]) => [<span key={k} className="pl-4 text-neutral-500">{CONTRACT[k] ?? k}</span>, fmt(v, 0)]),
              ...sortedEntries(r.workforce.byGender).map(([k, v]) => [<span key={k} className="pl-4 text-neutral-500">{GENDER[k] ?? k}</span>, fmt(v, 0)]),
              ...(Object.keys(r.workforce.byCountry).length > 1
                ? sortedEntries(r.workforce.byCountry).map(([k, v]) => [<span key={k} className="pl-4 text-neutral-500">{k}</span>, fmt(v, 0)])
                : []),
              ["Registrerbare arbejdsulykker", fmt(r.health.accidents, 0)],
              ["Ulykkesfrekvens (pr. 200.000 timer)", fmt(r.health.accidentRate, 1)],
              ["Dødsfald (ulykker / sygdom)", `${fmt(r.health.fatalitiesAccidents, 0)} / ${fmt(r.health.fatalitiesIllHealth, 0)}`],
              ["Lønforskel mænd/kvinder", fmt(r.pay.payGapPct, 1, "%")],
              ["Overenskomstdækning", fmt(r.pay.cbaCoveragePct, 1, "%")],
              ["Uddannelsestimer pr. ansat", fmt(r.pay.trainingHoursPerEmployee, 1)],
              ["Medarbejderomsætning (C5)", fmt(r.c5.turnoverPct, 1, "%")],
            ]}
          />
        </Card>
      </div>

      <p className="text-xs text-neutral-500">{factorLabel}</p>
    </div>
  );
}
