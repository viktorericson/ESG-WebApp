import { isYes, over10 } from "../engine";
import type { Answers, ModuleDef, Option } from "../types";

/**
 * Selskabsmodul 10 – Klimamål og klimarisici (Udvidet Modul C3 + C4).
 * Ordlyd efter VS pkt. 53–57. Basisårets og målårets værdier sammenholdes i rapporten med
 * selskabets beregnede scope 1- og 2-udledning (B3). Klimafarer registreret på lokationerne
 * (lokationsmodul 7) indgår i rapportens C4-tabel sammen med selskabets egne.
 */

export const LEVELS: Option[] = [
  { value: "LOW", label: "Lav" },
  { value: "MEDIUM", label: "Mellem" },
  { value: "HIGH", label: "Høj" },
];

export const HORIZONS: Option[] = [
  { value: "SHORT", label: "Kort sigt (0–1 år)" },
  { value: "MEDIUM", label: "Mellemlangt sigt (2–5 år)" },
  { value: "LONG", label: "Langt sigt (over 5 år)" },
];

export const RISK_TYPES: Option[] = [
  { value: "CHRONIC", label: "Kronisk fysisk fare" },
  { value: "ACUTE", label: "Akut fysisk fare" },
  { value: "TRANSITION", label: "Omstillingshændelse" },
];

export const RISK_AREAS: Option[] = [
  { value: "ASSETS", label: "Aktiver" },
  { value: "ACTIVITIES", label: "Aktiviteter" },
  { value: "VALUE_CHAIN", label: "Værdikæde" },
];

export const TARGET_SCOPES: Option[] = [
  { value: "S1", label: "Scope 1" },
  { value: "S2", label: "Scope 2" },
  { value: "S12", label: "Scope 1 og 2 samlet" },
  { value: "S3", label: "Scope 3" },
];

export const TARGET_UNITS: Option[] = [
  { value: "TCO2E", label: "t CO₂e" },
  { value: "PCT", label: "% reduktion" },
];

const YES_NO: Option[] = [
  { value: "YES", label: "Ja" },
  { value: "NO", label: "Nej" },
];

const hasTargets = isYes("hasTargets");
const hasRisks = isYes("hasClimateRisks");

export const companyClimate: ModuleDef = {
  key: "company.climate",
  scope: "company",
  number: 10,
  title: "Klimamål og klimarisici",
  vs: ["C3", "C4"],
  description: "Reduktionsmål for drivhusgasser, omstillingsplan og samlet vurdering af klimarisici. Kun ved Udvidet Modul.",
  sections: [
    {
      key: "targets",
      title: "Mål for reduktion af drivhusgasemissioner",
      vs: ["C3.53"],
      cOnly: true,
      description: "Frivilligt for virksomheder med 10 ansatte eller derunder.",
      evidence: true,
      fields: [
        {
          key: "hasTargets",
          label: "Har selskabet fastsat mål for reduktion af drivhusgasemissioner?",
          type: "yesno",
          required: over10,
          vs: ["C3.53"],
          info: "Målene skal oplyses i absolutte værdier for scope 1 og scope 2. Har selskabet også mål for scope 3, skal de omfatte de vigtige scope 3-kategorier.",
        },
        {
          key: "targets",
          label: "Reduktionsmål",
          type: "table",
          required: true,
          showIf: hasTargets,
          addLabel: "Tilføj mål",
          vs: ["C3.53a", "C3.53b", "C3.53c", "C3.53d"],
          hint: "Basisårets værdi kan aflæses under “Se alle nøgletal” for det år, hvis det er indrapporteret her.",
          columns: [
            { key: "scope", label: "Omfatter", type: "select", required: true, options: TARGET_SCOPES },
            { key: "baseYear", label: "Basisår", type: "number", required: true },
            { key: "baseValue", label: "Udledning i basisår (t CO₂e)", type: "number", required: true },
            { key: "targetYear", label: "Målår", type: "number", required: true },
            { key: "targetValue", label: "Mål", type: "number", required: true },
            { key: "unit", label: "Enhed", type: "select", required: true, options: TARGET_UNITS },
            { key: "coverage", label: "Andel af scope (%)", type: "number", placeholder: "100" },
          ],
        },
        {
          key: "targetActions",
          label: "De vigtigste tiltag for at nå målene",
          type: "textarea",
          required: true,
          showIf: hasTargets,
          vs: ["C3.53e"],
          hint: "Ét tiltag pr. linje, fx “Udskiftning af firmabiler til el inden 2027”.",
        },
      ],
    },
    {
      key: "transition",
      title: "Omstillingsplan",
      vs: ["C3.54", "C3.55"],
      cOnly: true,
      description: "Gælder selskaber i sektorer med stor klimaindvirkning (NACE A–H og fast ejendom). Afgøres af selskabets NACE-koder.",
      showIf: (_a, ctx) => ctx.highImpactSector !== false,
      evidence: true,
      fields: [
        {
          key: "hasTransitionPlan",
          label: "Har selskabet vedtaget en omstillingsplan for modvirkning af klimaændringer?",
          type: "yesno",
          required: (_a, ctx) => ctx.highImpactSector === true,
          vs: ["C3.54"],
        },
        {
          key: "transitionPlan",
          label: "Beskriv omstillingsplanen, og hvordan den bidrager til at reducere drivhusgasemissionerne",
          type: "textarea",
          showIf: isYes("hasTransitionPlan"),
          vs: ["C3.54"],
          hint: "Frivilligt efter standarden.",
        },
        {
          key: "willAdoptPlan",
          label: "Vil selskabet vedtage en omstillingsplan?",
          type: "yesno",
          required: true,
          showIf: (a) => a.hasTransitionPlan === "no",
          vs: ["C3.55"],
        },
        { key: "adoptPlanWhen", label: "Hvornår?", type: "text", required: true, showIf: isYes("willAdoptPlan"), vs: ["C3.55"], placeholder: "fx Inden udgangen af 2027" },
      ],
    },
    {
      key: "risks",
      title: "Klimarisici",
      vs: ["C4.56"],
      cOnly: true,
      description: "Frivilligt for virksomheder med 10 ansatte eller derunder. Klimafarer, der er registreret på lokationerne (lokationsmodul 7), kommer automatisk med i rapporten.",
      evidence: true,
      fields: [
        {
          key: "hasClimateRisks",
          label: "Har selskabet identificeret klimarelaterede farer eller omstillingshændelser, der skaber risici for selskabet?",
          type: "yesno",
          required: over10,
          vs: ["C4.56"],
          info: "Fysiske farer kan være akutte (fx skybrud, storm, oversvømmelse) eller kroniske (fx stigende temperaturer, havniveaustigning). Omstillingshændelser kan være ny regulering, teknologiskift, ændrede markeder eller omdømme.",
        },
        {
          key: "risks",
          label: "Risici",
          type: "table",
          required: true,
          showIf: hasRisks,
          addLabel: "Tilføj risiko",
          vs: ["C4.56a", "C4.56c", "C4.56d"],
          columns: [
            { key: "riskType", label: "Type", type: "select", required: true, options: RISK_TYPES },
            { key: "area", label: "Hvor", type: "select", required: true, options: RISK_AREAS },
            { key: "description", label: "Kort beskrivelse", type: "text", required: true },
            { key: "exposure", label: "Eksponering", type: "select", required: true, options: LEVELS },
            { key: "sensitivity", label: "Følsomhed", type: "select", required: true, options: LEVELS },
            { key: "horizon", label: "Tidshorisont", type: "select", required: true, options: HORIZONS },
            { key: "adaptation", label: "Tilpasning iværksat", type: "select", required: true, options: YES_NO },
          ],
        },
        {
          key: "riskAssessment",
          label: "Hvordan har selskabet vurderet eksponering og følsomhed for sine aktiver, aktiviteter og værdikæde?",
          type: "textarea",
          required: true,
          showIf: hasRisks,
          vs: ["C4.56b"],
        },
      ],
    },
    {
      key: "financial",
      title: "Mulige finansielle konsekvenser",
      vs: ["C4.57"],
      cOnly: true,
      description: "Frivilligt. Hvordan klimarisiciene kan påvirke økonomi og drift.",
      showIf: hasRisks,
      fields: [
        {
          key: "financialImpacts",
          label: "Konsekvenser",
          type: "table",
          addLabel: "Tilføj konsekvens",
          vs: ["C4.57"],
          columns: [
            { key: "riskType", label: "Type", type: "select", required: true, options: RISK_TYPES },
            { key: "description", label: "Risiko", type: "text", required: true },
            { key: "impact", label: "Påvirkning af økonomi og drift", type: "text", required: true },
            { key: "level", label: "Finansiel risiko", type: "select", required: true, options: LEVELS },
            { key: "horizon", label: "Tidshorisont", type: "select", required: true, options: HORIZONS },
          ],
        },
      ],
    },
  ],
  checks: (a: Answers) => {
    const rows = Array.isArray(a.targets) ? (a.targets as Record<string, unknown>[]) : [];
    const w = [];
    if (a.hasTargets === "yes" && rows.length > 0 && !rows.some((r) => ["S1", "S2", "S12"].includes(String(r.scope)))) {
      w.push({ section: "targets", message: "VS kræver, at reduktionsmål oplyses for scope 1 og scope 2. Tilføj et mål for scope 1, scope 2 eller begge samlet." });
    }
    if (rows.some((r) => typeof r.baseYear === "number" && typeof r.targetYear === "number" && r.targetYear <= r.baseYear)) {
      w.push({ section: "targets", message: "Målåret skal ligge efter basisåret." });
    }
    return w;
  },
};
