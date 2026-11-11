/**
 * Eksportmodellen: alt, der skal stå i rapporten, som færdigformaterede tekster.
 * Bygges af rene funktioner ud fra modulsvar og beregnede nøgletal, så den kan testes
 * uden database, og så PowerPoint-udfyldningen kun skal placere tekst.
 *
 * Ved konsolidering samles selskabernes svar: tal summeres, ja/nej-svar vises som
 * "Ja", "Nej" eller "Delvist (x af y selskaber)", og fritekst får selskabets navn foran.
 */
import type { GroupResult } from "../calc/consolidate";
import { totalOf, type EnergySplit } from "../calc/types";
import { categoryLabel } from "../calc/scope3";
import { ALL_POLICY_TOPICS } from "../forms/modules/company-policies";
import { CHRONIC_HAZARDS, HAZARDS } from "../forms/modules/location-local";

type Answers = Record<string, unknown>;
type Row = Record<string, unknown>;

export type ExportCompany = {
  id: string;
  name: string;
  cvr: string;
  address: string | null;
  legalForm: string | null;
  naceCodes: string[];
  /** Svar pr. modulnøgle (moduler markeret "ikke relevant" er udeladt) */
  modules: Record<string, Answers | undefined>;
  locations: {
    id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    modules: Record<string, Answers | undefined>;
  }[];
};

export type ExportInput = {
  reportName: string;
  organizationName: string;
  year: number;
  comprehensive: boolean;
  consolidated: boolean;
  approved: boolean;
  omissions: string | null;
  reportingCompanyId: string;
  /** Rapporterende selskab først */
  companies: ExportCompany[];
  group: GroupResult;
  factorNote: string | null;
};

export type YesNo = "Ja" | "Nej" | string;

/* ------------------------------------------------------------------ */
/* Formatering                                                         */
/* ------------------------------------------------------------------ */

const nf = (digits: number) => new Intl.NumberFormat("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const num = (v: number | null | undefined, digits = 0, unit = "") =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : `${nf(digits).format(v)}${unit ? ` ${unit}` : ""}`;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sumOrNull = (values: (number | null)[]) => (values.every((v) => v === null) ? null : values.reduce<number>((s, v) => s + (v ?? 0), 0));

/** "Ja", "Nej" eller "Delvist (x af y selskaber)" ud fra selskabernes svar; null hvis ingen har svaret */
export function combineYesNo(values: (boolean | null)[]): YesNo | null {
  const answered = values.filter((v): v is boolean => v !== null);
  if (answered.length === 0) return null;
  const yes = answered.filter(Boolean).length;
  if (yes === 0) return "Nej";
  if (yes === answered.length) return "Ja";
  return `Delvist (${yes} af ${answered.length} selskaber)`;
}
const yn = (v: unknown): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

/** Fritekst fra flere selskaber; ved ét selskab uden navn */
function joinTexts(parts: { company: string; text: string | null }[], multi: boolean): string | null {
  const present = parts.filter((p) => p.text);
  if (present.length === 0) return null;
  if (!multi || present.length === 1 && parts.length === 1) return present.map((p) => p.text).join("\n");
  return present.map((p) => `${p.company}: ${p.text}`).join("\n");
}

/** Dansk adresse "Vej 1, 8000 Aarhus C" → dele. Ukendte formater står samlet i adressefeltet. */
export function splitAddress(address: string | null): { street: string; postal: string; city: string; country: string } {
  const a = (address ?? "").trim();
  const m = a.match(/^(.*?),?\s*(?:DK-)?(\d{4})\s+([^,]+?)(?:,\s*(Danmark|Denmark))?$/i);
  if (m) return { street: m[1].replace(/,\s*$/, ""), postal: m[2], city: m[3], country: "Danmark" };
  return { street: a || "–", postal: "", city: "", country: "" };
}

const LEGAL_FORMS: Record<string, string> = {
  PMV: "Personligt ejet mindre virksomhed (PMV)",
  ENKELTMAND: "Enkeltmandsvirksomhed",
  IS: "Interessentskab (I/S)",
  APS: "Anpartsselskab (ApS)",
  AS: "Aktieselskab (A/S)",
  KS: "Kommanditselskab (K/S)",
  ANDET: "Anden virksomhedsform",
};

const MEDIUM: Record<string, string> = { AIR: "Luft", WATER: "Vand", SOIL: "Jord" };
const SECTORS: [string, string][] = [
  ["WEAPONS", "Kontroversielle våben"],
  ["TOBACCO", "Tobak"],
  ["COAL", "Kul"],
  ["OIL", "Olie"],
  ["GAS", "Gas"],
  ["CHEMICALS", "Kemikalier"],
];

const TARGET_SCOPE: Record<string, string> = { S1: "Scope 1", S2: "Scope 2", S12: "Scope 1 og 2", S3: "Scope 3" };
const LEVEL: Record<string, string> = { LOW: "Lav", MEDIUM: "Mellem", HIGH: "Høj" };
const HORIZON: Record<string, string> = { SHORT: "0–1 år", MEDIUM: "2–5 år", LONG: "> 5 år" };
const AREA: Record<string, string> = { ASSETS: "Aktiver", ACTIVITIES: "Aktiviteter", VALUE_CHAIN: "Værdikæde" };

/* ------------------------------------------------------------------ */
/* Modellen                                                            */
/* ------------------------------------------------------------------ */

export type EnergyRow = { renewable: string; nonRenewable: string; total: string };

export function buildExportModel(input: ExportInput) {
  const { companies, group: g } = input;
  const multi = companies.length > 1;
  const reporting = companies.find((c) => c.id === input.reportingCompanyId) ?? companies[0];
  const mod = (c: ExportCompany, key: string) => c.modules[key] ?? {};
  const allLocations = companies.flatMap((c) => c.locations.map((l) => ({ ...l, company: c })));
  const label = (c: ExportCompany, name: string) => (multi ? `${c.name} – ${name}` : name);

  // B1
  const unit = g.workforce.unit ?? (str(mod(reporting, "company.general").employeeUnit) as string | null);
  const unitLabel = unit === "FTE" ? "fuldtidsækvivalenter" : "personer";
  const balance = sumOrNull(companies.map((c) => n(mod(c, "company.general").balanceSheetTotal)));
  const b1 = {
    subsidiaries: companies.filter((c) => c.id !== reporting.id).map((c) => ({ name: `${c.name} (CVR ${c.cvr})`, address: c.address ?? "–" })),
    legalForm: reporting.legalForm ? (LEGAL_FORMS[reporting.legalForm] ?? reporting.legalForm) : "–",
    nace: [...new Set(companies.flatMap((c) => c.naceCodes))].join(", ") || "–",
    balance: balance === null ? "–" : num(balance, 0, "kr."),
    turnover: g.raw.turnover === null ? "–" : num(g.raw.turnover, 0, "kr."),
    employees: g.raw.employees === null ? "–" : `${num(g.raw.employees, unit === "FTE" ? 1 : 0)} ${unitLabel}`,
    omissions: str(input.omissions),
    locations: allLocations.map((l) => {
      const a = splitAddress(l.address);
      return {
        name: label(l.company, l.name),
        ...a,
        geo: l.latitude !== null && l.longitude !== null ? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}` : "–",
      };
    }),
    certifications: companies.flatMap((c) => {
      const gen = mod(c, "company.general");
      if (gen.hasCertification !== "yes") return [];
      return rows(gen.certificationList).map((r) => ({
        name: str(r.name) ?? "–",
        description: [multi ? c.name : null, str(r.issuer) ? `Udsteder: ${str(r.issuer)}` : null].filter(Boolean).join(" · ") || "–",
        date: str(r.issued) ? new Date(String(r.issued)).toLocaleDateString("da-DK") : "–",
        rating: str(r.score) ?? "–",
      }));
    }),
  };

  // Lokale initiativer (lokationsmodul 7) samles under emnet i politikregistret
  const localByTopic = new Map<string, string[]>();
  for (const l of allLocations) {
    const a = l.modules["location.local"] ?? {};
    if (a.hasLocalInitiatives !== "yes") continue;
    for (const r of rows(a.localInitiatives)) {
      const d = str(r.description);
      if (!d) continue;
      const list = localByTopic.get(String(r.topic)) ?? [];
      list.push(`${label(l.company, l.name)}: ${d}`);
      localByTopic.set(String(r.topic), list);
    }
  }

  // B2 og C2
  const policies = ALL_POLICY_TOPICS.map((t) => {
    const per = companies.map((c) => mod(c, "company.policies"));
    const has = per.map((a) => (a[`${t.key}_practice`] ? a[`${t.key}_practice`] !== "NO" : null));
    const isPublic = per.map((a, i) => (has[i] ? a[`${t.key}_practice`] === "PUBLIC" : has[i] === false ? false : null));
    const targets = per.map((a, i) => (has[i] ? yn(a[`${t.key}_targets`]) : has[i] === false ? false : null));
    return {
      key: t.key,
      label: t.label,
      has: combineYesNo(has) ?? "–",
      isPublic: combineYesNo(isPublic) ?? "–",
      targets: combineYesNo(targets) ?? "–",
      description:
        [joinTexts(companies.map((c, i) => ({ company: c.name, text: has[i] ? str(per[i][`${t.key}_description`]) : null })), multi), ...(localByTopic.get(t.key) ?? []).map((x) => `Lokalt – ${x}`)]
          .filter(Boolean)
          .join("\n") || "–",
      responsible: joinTexts(companies.map((c, i) => ({ company: c.name, text: has[i] ? str(per[i][`${t.key}_responsible`]) : null })), multi) ?? "–",
      any: has.some(Boolean),
    };
  });

  // B3
  const split = (s: EnergySplit): EnergyRow => ({ renewable: num(s.renewable, 1), nonRenewable: num(s.nonRenewable, 1), total: num(totalOf(s), 1) });
  const energy = { electricity: split(g.energy.electricity), fuels: split(g.energy.fuels), other: split(g.energy.other), total: split(g.energy.total) };
  const ghg = {
    scope1: num(g.ghg.scope1T, 2),
    scope2Location: num(g.ghg.scope2LocationT, 2),
    totalLocation: num(g.ghg.totalLocationT, 2),
    scope2Market: num(g.ghg.scope2MarketT, 2),
    totalMarket: num(g.ghg.totalMarketT, 2),
    intensity: g.ghg.intensityPerMDKK === null ? null : num(g.ghg.intensityPerMDKK, 2, "t CO₂e pr. mio. kr."),
  };

  // B4 – forurening, summeret pr. stof og medie
  const pollution = new Map<string, { substance: string; medium: string; kg: number }>();
  const pollutionLinks: string[] = [];
  for (const l of allLocations) {
    const a = l.modules["location.pollution"] ?? {};
    if (a.reportingBasis !== "MANDATORY" && a.reportingBasis !== "VOLUNTARY") continue;
    for (const r of rows(a.pollutants)) {
      const substance = str(r.substance) ?? "–";
      const medium = MEDIUM[String(r.medium)] ?? "–";
      const k = `${substance.toLowerCase()}|${medium}`;
      const cur = pollution.get(k) ?? { substance, medium, kg: 0 };
      cur.kg += n(r.amountKg) ?? 0;
      pollution.set(k, cur);
      const link = str(r.publicLink);
      if (link && !pollutionLinks.includes(link)) pollutionLinks.push(link);
    }
  }
  const b4 = [...pollution.values()].map((p) => ({ substance: p.substance, amount: num(p.kg, 1, "kg"), medium: p.medium }));

  // B5
  const b5 = allLocations
    .filter((l) => l.modules["location.biodiversity"]?.nearSensitiveArea === "yes")
    .map((l) => {
      const a = l.modules["location.biodiversity"]!;
      const area = sumOrNull([n(a.natureAreaHa), n(a.sealedAreaHa)]);
      return {
        location: label(l.company, l.name),
        areaHa: area === null ? "–" : num(area, 2),
        areaName: str(a.sensitiveAreaName) ?? "–",
        relation: a.sensitiveAreaRelation === "IN" ? "I et biodiversitetsfølsomt område" : "I nærheden af et biodiversitetsfølsomt område",
      };
    });

  // B6
  const b6 = {
    intake: num(g.water.intakeM3, 0, "m³"),
    consumption: g.water.consumptionM3 === null ? null : num(g.water.consumptionM3, 0, "m³"),
    consumptionStress: g.water.consumptionStressM3 === null ? null : num(g.water.consumptionStressM3, 0, "m³"),
  };

  // B7 – cirkulær økonomi, affald pr. type, materialer
  const circular = combineYesNo(companies.map((c) => yn(mod(c, "company.policies").usesCircularPrinciples)));
  const circularText = joinTexts(
    companies.map((c) => {
      const a = mod(c, "company.policies");
      return { company: c.name, text: a.usesCircularPrinciples === "yes" ? str(a.circularDescription) : null };
    }),
    multi,
  );
  const waste = { hazardous: new Map<string, { type: string; total: number; recycled: number }>(), nonHazardous: new Map<string, { type: string; total: number; recycled: number }>() };
  for (const l of allLocations) {
    const a = l.modules["location.waste"] ?? {};
    if (a.householdOnly !== "no") continue;
    for (const r of rows(a.wasteRows)) {
      const toT = (v: unknown) => (n(v) === null ? 0 : r.unit === "kg" ? (v as number) / 1000 : (v as number));
      const type = [str(r.type) ?? "Andet", str(r.ewc) ? `(EAK ${str(r.ewc)})` : null].filter(Boolean).join(" ");
      const bucket = r.hazardous === "HAZARDOUS" ? waste.hazardous : waste.nonHazardous;
      const cur = bucket.get(type.toLowerCase()) ?? { type, total: 0, recycled: 0 };
      cur.total += toT(r.generated);
      cur.recycled += toT(r.recycled);
      bucket.set(type.toLowerCase(), cur);
    }
  }
  const wasteRows = (m: Map<string, { type: string; total: number; recycled: number }>) =>
    [...m.values()].sort((a, b) => b.total - a.total).map((w) => ({ type: w.type, total: num(w.total, 2, "t"), recycled: num(w.recycled, 2, "t") }));
  const materials = new Map<string, { material: string; unit: string; amount: number }>();
  for (const m of g.materials) {
    const k = `${m.material.toLowerCase()}|${m.unit}`;
    const cur = materials.get(k) ?? { ...m, amount: 0 };
    cur.amount += m.amount;
    materials.set(k, cur);
  }
  const b7 = {
    circular: circular ?? "–",
    circularText,
    nonHazardous: wasteRows(waste.nonHazardous),
    hazardous: wasteRows(waste.hazardous),
    totals: { nonHazardous: num(g.waste.nonHazardousT, 2, "t"), hazardous: num(g.waste.hazardousT, 2, "t"), recycled: num(g.waste.recycledT, 2, "t") },
    materials: [...materials.values()].map((m) => ({ material: m.material, amount: num(m.amount, 1, m.unit) })),
  };

  // B8
  const wf = g.workforce;
  const dig = unit === "FTE" ? 1 : 0;
  const countries = Object.entries(wf.byCountry).sort((a, b) => (a[0] === "Danmark" ? -1 : b[0] === "Danmark" ? 1 : b[1] - a[1]));
  const b8 = {
    unitLabel,
    temporary: num(wf.byContract.TEMPORARY ?? 0, dig),
    permanent: num(wf.byContract.PERMANENT ?? 0, dig),
    total: num(wf.total, dig),
    male: num(wf.byGender.MALE ?? 0, dig),
    female: num(wf.byGender.FEMALE ?? 0, dig),
    other: num(wf.byGender.OTHER ?? 0, dig),
    unreported: num(wf.byGender.UNREPORTED ?? 0, dig),
    countries: countries.map(([country, count]) => ({ country, count: num(count, dig) })),
    otherCountries: countries.some(([c]) => !/^(danmark|denmark|dk)$/i.test(c.trim())),
  };

  // B9–B11
  const b9 = {
    accidents: num(g.health.accidents),
    rate: num(g.health.accidentRate, 1),
    fatalAccidents: num(g.health.fatalitiesAccidents),
    fatalIllHealth: num(g.health.fatalitiesIllHealth),
  };
  const minWage = companies.map((c) => {
    const v = mod(c, "company.pay").allAboveMinWage;
    return v === "YES" ? true : v === "NO" ? false : null;
  });
  const b10 = {
    minWage: combineYesNo(minWage),
    payGap: g.pay.payGapPct === null ? null : num(g.pay.payGapPct, 1, "%"),
    cba: num(g.pay.cbaCoveragePct, 1, "%"),
    training: num(g.pay.trainingHoursPerEmployee, 1, "timer"),
  };
  const b11 = { convictions: num(g.governance.convictions), fines: num(g.governance.fines, 0, "kr.") };

  // C1
  const c1Field = (key: string) => joinTexts(companies.map((c) => ({ company: c.name, text: str(mod(c, "company.general")[key]) })), multi);
  const c1 = { products: c1Field("productsServices"), markets: c1Field("markets"), relations: c1Field("businessRelations"), strategy: c1Field("strategyElements") };

  // C5
  const c5 = {
    turnover: num(g.c5.turnoverPct, 1, "%"),
    managementRatio: g.c5.managementRatio === null ? null : num(g.c5.managementRatio, 2),
    selfEmployed: sumOrNull(companies.map((c) => n(mod(c, "company.workforce").selfEmployed))),
    agency: sumOrNull(companies.map((c) => n(mod(c, "company.workforce").agencyWorkers))),
  };

  // C6 og C7
  const hr = companies.map((c) => mod(c, "company.humanRights"));
  const hasPolicy = hr.map((a) => yn(a.hasHumanRightsPolicy));
  const covers = (key: string) => combineYesNo(hr.map((a, i) => (hasPolicy[i] ? yn(a[key]) : null))) ?? "–";
  const c6 = {
    policy: combineYesNo(hasPolicy) ?? "–",
    grievance: combineYesNo(hr.map((a) => yn(a.hasGrievanceMechanism))) ?? "–",
    anyPolicy: hasPolicy.some(Boolean),
    covers: [
      ["Børnearbejde", covers("covChildLabour")],
      ["Tvangsarbejde", covers("covForcedLabour")],
      ["Menneskehandel", covers("covTrafficking")],
      ["Diskrimination", covers("covDiscrimination")],
      ["Sikkerhed/forebyggelse af ulykker", covers("covAccidents")],
      [
        "Andet",
        [covers("covOther"), joinTexts(companies.map((c, i) => ({ company: c.name, text: hr[i].covOther === "yes" ? str(hr[i].covOtherSpec) : null })), multi)].filter((x) => x && x !== "–").join(" – ") || "–",
      ],
    ] as [string, string][],
  };
  const actions = joinTexts(companies.map((c, i) => ({ company: c.name, text: str(hr[i].incidentActions) })), multi);
  const incident = (key: string) => combineYesNo(hr.map((a) => yn(a[key]))) ?? "–";
  const vcIncidents = (group: string) => {
    const texts = companies.flatMap((c, i) => rows(hr[i].valueChainIncidents).filter((r) => r.group === group).map((r) => (multi ? `${c.name}: ${str(r.description) ?? ""}` : (str(r.description) ?? ""))));
    const answered = hr.some((a) => a.hasValueChainIncidents === "yes" || a.hasValueChainIncidents === "no");
    if (!answered) return "–";
    return texts.length ? `Ja\n${texts.join("\n")}` : "Nej";
  };
  const c7 = {
    own: [
      ["Børnearbejde", incident("incChildLabour")],
      ["Tvangsarbejde", incident("incForcedLabour")],
      ["Menneskehandel", incident("incTrafficking")],
      ["Diskrimination", incident("incDiscrimination")],
      [
        "Andet",
        [incident("incOther"), joinTexts(companies.map((c, i) => ({ company: c.name, text: hr[i].incOther === "yes" ? str(hr[i].incOtherSpec) : null })), multi)].filter((x) => x && x !== "–").join(" – ") || "–",
      ],
    ] as [string, string][],
    actions,
    valueChain: [
      ["Arbejdstagere i værdikæden", vcIncidents("VALUE_CHAIN_WORKERS")],
      ["Berørte samfund", vcIncidents("COMMUNITIES")],
      ["Forbrugere og slutbrugere", vcIncidents("CONSUMERS")],
    ] as [string, string][],
  };

  // C8
  const sectorSums = new Map<string, number>();
  let anySectors = false;
  for (const c of companies) {
    const a = mod(c, "company.governance");
    if (a.activeInSectors !== "yes") continue;
    for (const r of rows(a.sectorRevenueList)) {
      anySectors = true;
      sectorSums.set(String(r.sector), (sectorSums.get(String(r.sector)) ?? 0) + (n(r.revenue) ?? 0));
    }
  }
  const c8 = anySectors ? SECTORS.map(([k]) => (sectorSums.has(k) ? num(sectorSums.get(k)!, 0, "kr.") : "0 kr.")) : null;

  // C9
  const c9 = g.governance.boardRatio === null ? null : num(g.governance.boardRatio, 2);

  // C3 – reduktionsmål, tiltag og omstillingsplan
  const climate = companies.map((c) => mod(c, "company.climate"));
  const prefix = (c: ExportCompany) => (multi ? `${c.name}: ` : "");
  const targets = companies.flatMap((c, i) =>
    climate[i].hasTargets !== "yes"
      ? []
      : rows(climate[i].targets).map((t) => ({
          scope: `${prefix(c)}${TARGET_SCOPE[String(t.scope)] ?? "–"}`,
          target:
            t.unit === "PCT" ? `${num(n(t.targetValue), 0)} % reduktion i ${n(t.targetYear) ?? "–"}` : `${num(n(t.targetValue), 1)} t CO₂e i ${n(t.targetYear) ?? "–"}`,
          baseline: `${num(n(t.baseValue), 1)} t CO₂e (${n(t.baseYear) ?? "–"})`,
          share: `${num(n(t.coverage) ?? 100, 0)} %`,
        })),
  );
  const targetActions = [
    ...companies.flatMap((c, i) =>
      climate[i].hasTargets === "yes"
        ? String(climate[i].targetActions ?? "")
            .split("\n")
            .map((x) => x.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean)
            .map((x) => prefix(c) + x)
        : [],
    ),
    ...allLocations.flatMap((l) => {
      const a = l.modules["location.local"] ?? {};
      if (a.hasClimateActions !== "yes") return [];
      return rows(a.climateActions)
        .filter((r) => str(r.action))
        .map((r) => {
          const extra = [n(r.reduction) !== null ? `ca. ${num(n(r.reduction), 1)} t CO₂e/år` : null, n(r.year) !== null ? `${n(r.year)}` : null].filter(Boolean).join(", ");
          return `${label(l.company, l.name)}: ${str(r.action)}${extra ? ` (${extra})` : ""}`;
        });
    }),
  ];
  const answeredTransition = climate.some((a) => a.hasTransitionPlan === "yes" || a.hasTransitionPlan === "no");
  const c3 = {
    targets,
    actions: targetActions,
    transition: answeredTransition
      ? {
          hasPlan: combineYesNo(climate.map((a) => yn(a.hasTransitionPlan))) ?? "–",
          plan: joinTexts(companies.map((c, i) => ({ company: c.name, text: climate[i].hasTransitionPlan === "yes" ? str(climate[i].transitionPlan) : null })), multi),
          willAdopt: combineYesNo(climate.map((a) => (a.hasTransitionPlan === "no" ? yn(a.willAdoptPlan) : null))),
          when: joinTexts(companies.map((c, i) => ({ company: c.name, text: climate[i].willAdoptPlan === "yes" ? str(climate[i].adoptPlanWhen) : null })), multi),
        }
      : null,
  };

  // C4 – klimarisici fra selskaberne og klimafarer fra lokationerne
  type Risk = { type: string; area: string; description: string; exposure: string; sensitivity: string; horizon: string; adaptation: string };
  const risks: Risk[] = [
    ...companies.flatMap((c, i) =>
      climate[i].hasClimateRisks !== "yes"
        ? []
        : rows(climate[i].risks).map((r) => ({
            type: String(r.riskType),
            area: AREA[String(r.area)] ?? "–",
            description: `${prefix(c)}${str(r.description) ?? "–"}`,
            exposure: LEVEL[String(r.exposure)] ?? "–",
            sensitivity: LEVEL[String(r.sensitivity)] ?? "–",
            horizon: HORIZON[String(r.horizon)] ?? "–",
            adaptation: r.adaptation === "YES" ? "JA" : r.adaptation === "NO" ? "NEJ" : "–",
          })),
    ),
    ...allLocations.flatMap((l) => {
      const a = l.modules["location.local"] ?? {};
      if (a.hasHazards !== "yes") return [];
      return rows(a.hazards).map((r) => ({
        type: CHRONIC_HAZARDS.has(String(r.hazard)) ? "CHRONIC" : "ACUTE",
        area: "Aktiver",
        description: `${label(l.company, l.name)}: ${HAZARDS.find((h) => h.value === r.hazard)?.label ?? "–"}${str(r.adaptation) ? ` (tilpasning: ${str(r.adaptation)})` : ""}`,
        exposure: LEVEL[String(r.exposure)] ?? "–",
        sensitivity: LEVEL[String(r.sensitivity)] ?? "–",
        horizon: HORIZON[String(r.horizon)] ?? "–",
        adaptation: str(r.adaptation) ? "JA" : "NEJ",
      }));
    }),
  ];
  const financial = companies.flatMap((c, i) =>
    climate[i].hasClimateRisks !== "yes"
      ? []
      : rows(climate[i].financialImpacts).map((r) => ({
          type: String(r.riskType),
          description: `${prefix(c)}${str(r.description) ?? "–"}`,
          impact: str(r.impact) ?? "–",
          level: LEVEL[String(r.level)] ?? "–",
          horizon: HORIZON[String(r.horizon)] ?? "–",
        })),
  );
  const c4 = {
    risks,
    assessment: joinTexts(companies.map((c, i) => ({ company: c.name, text: climate[i].hasClimateRisks === "yes" ? str(climate[i].riskAssessment) : null })), multi),
    financial,
  };

  // Scope 3 (B3 pkt. 49–52) – præsenteres sammen med scope 1 og 2
  const s3 = g.scope3;
  const scope3 = s3.included
    ? {
        total: num(s3.totalT, 2),
        totalAll: num(g.ghg.totalLocationT + s3.totalT, 2),
        categories: Object.entries(s3.byCategory)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([c, t]) => ({ label: categoryLabel(Number(c)), value: num(t, 2) })),
        notRelevant: s3.notRelevant.map(categoryLabel),
        notRelevantNumbers: s3.notRelevant,
        exclusionReason: s3.exclusionReason,
        boundary: s3.boundary,
      }
    : null;

  return {
    title: input.reportName,
    companyName: reporting.name,
    footerName: multi ? `${reporting.name} (koncern)` : reporting.name,
    year: input.year,
    draft: !input.approved,
    comprehensive: input.comprehensive,
    consolidated: input.consolidated,
    contact: [reporting.name, `CVR-nummer: ${reporting.cvr}`, reporting.address ?? null].filter((x): x is string => !!x),
    factorNote: input.factorNote,
    b1,
    b2: { rows: policies, any: policies.some((p) => p.any) },
    energy,
    ghg,
    b4,
    b4Links: pollutionLinks,
    b5,
    b6,
    b7,
    b8,
    b9,
    b10,
    b11,
    c1,
    c2: policies,
    c5,
    c6,
    c7,
    c8,
    c9,
    c3,
    c4,
    scope3,
  };
}

export type ExportModel = ReturnType<typeof buildExportModel>;
