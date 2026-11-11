import { SCOPE3_CATEGORIES } from "../../calc/scope3";
import { isYes } from "../engine";
import type { Answers, FieldDef, ModuleDef } from "../types";

/**
 * Selskabsmodul 11 – Scope 3 (VS pkt. 49–52). Frivilligt: standarden lægger op til at oplyse
 * scope 3, hvor det er relevant for branchen, og i så fald de vigtige kategorier.
 *
 * Forløbet følger ModulOpdeling: 1) vurdering af relevante kategorier, 2) aktivitets- eller
 * leverandørdata, 3) beregning og dokumentation, 4) samlet opgørelse og afgrænsning.
 */

const included = isYes("includeScope3");

const relevanceField = (c: (typeof SCOPE3_CATEGORIES)[number], i: number): FieldDef => ({
  key: `cat${c.n}`,
  label: `${c.n}. ${c.label}`,
  type: "radio",
  required: true,
  heading: i === 0 ? "Opstrøms (før varerne når selskabet)" : c.n === 9 ? "Nedstrøms (efter salget)" : undefined,
  options: [
    { value: "RELEVANT", label: "Relevant" },
    { value: "NOT_RELEVANT", label: "Ikke relevant" },
  ],
});

export const companyScope3: ModuleDef = {
  key: "company.scope3",
  scope: "company",
  number: 11,
  title: "Scope 3 – værdikæden",
  vs: ["B3"],
  description:
    "Indirekte udledninger i værdikæden, fordelt på GHG-protokollens 15 kategorier. Frivilligt, men relevant for fx produktion, fødevarer, byggeri og emballage. Kategori 3 kan beregnes automatisk fra scope 1 og 2.",
  sections: [
    {
      key: "scope",
      title: "1. Skal selskabet opgøre scope 3?",
      vs: ["B3.49"],
      fields: [
        {
          key: "includeScope3",
          label: "Opgør selskabet sine scope 3-udledninger i år?",
          type: "yesno",
          required: true,
          info: "Scope 3 er indirekte udledninger fra værdikæden: indkøbte varer, transport, affald, medarbejderes pendling, brugen af solgte produkter mv. De udgør ofte størstedelen af udledningen. Svarer du Nej, er modulet færdigt.",
        },
      ],
    },
    {
      key: "relevance",
      title: "2. Vurdering af relevante kategorier",
      vs: ["B3.51"],
      description: "Vurder hver kategori. Relevante kategorier er typisk dem med stor udledning, stort reduktionspotentiale eller tæt tilknytning til forretningen.",
      showIf: included,
      evidence: true,
      fields: [
        ...SCOPE3_CATEGORIES.map(relevanceField),
        {
          key: "exclusionReason",
          label: "Begrundelse for de kategorier, der ikke er relevante",
          type: "textarea",
          required: (a: Answers) => SCOPE3_CATEGORIES.some((c) => a[`cat${c.n}`] === "NOT_RELEVANT"),
          hint: "Fx “Selskabet sælger rådgivning og har ingen fysiske produkter (kategori 9–12)”.",
        },
      ],
    },
    {
      key: "data",
      title: "3. Aktiviteter og beregning",
      vs: ["B3.51", "B3.52"],
      description:
        "Registrér aktiviteterne i de relevante kategorier. Vælg en faktor fra Klimakompasset og angiv mængden i faktorens enhed, eller angiv leverandørens egen opgørelse i t CO₂e. Upload fakturaer eller leverandørdata som dokumentation.",
      showIf: included,
      evidence: true,
      fields: [
        {
          key: "autoCategory3",
          label: "Beregn kategori 3 (brændsels- og energirelaterede aktiviteter) automatisk ud fra scope 1 og 2?",
          type: "yesno",
          required: true,
          info: "Opstrøms udledning fra produktion og transport af de brændsler, den el og den varme, selskabet har registreret. Beregnes med Klimakompassets faktorer, så der ikke skal indtastes noget ekstra.",
        },
        {
          key: "activities",
          label: "Aktiviteter",
          type: "table",
          addLabel: "Tilføj aktivitet",
          columns: [
            { key: "category", label: "Kategori", type: "select", required: true, options: SCOPE3_CATEGORIES.map((c) => ({ value: String(c.n), label: `${c.n}. ${c.label}` })) },
            { key: "description", label: "Beskrivelse", type: "text", required: true, placeholder: "fx Indkøb af stål, flyrejser" },
            { key: "factor", label: "Klimakompasset-faktor", type: "select", dynamicOptions: "scope3Factors" },
            { key: "amount", label: "Mængde (faktorens enhed)", type: "number" },
            { key: "supplierT", label: "Eller: leverandørens tal (t CO₂e)", type: "number" },
            { key: "location", label: "Lokation", type: "select", dynamicOptions: "locations" },
          ],
        },
      ],
    },
    {
      key: "summary",
      title: "4. Afgrænsning og metode",
      vs: ["B3.52"],
      showIf: included,
      fields: [
        {
          key: "boundary",
          label: "Beskriv opgørelsens afgrænsning og metode",
          type: "textarea",
          required: true,
          hint: "Fx hvilke leverandører og perioder der er med, om der er brugt beløbsbaserede (kr.) eller mængdebaserede faktorer, og kendte usikkerheder.",
        },
      ],
    },
  ],
  checks: (a: Answers) => {
    if (a.includeScope3 !== "yes") return [];
    const w = [];
    const rows = Array.isArray(a.activities) ? (a.activities as Record<string, unknown>[]) : [];
    const incomplete = rows.filter((r) => typeof r.supplierT !== "number" && (typeof r.amount !== "number" || !r.factor));
    if (incomplete.length) w.push({ section: "data", message: `${incomplete.length} aktivitet(er) mangler enten faktor og mængde eller leverandørens tal og tælles ikke med.` });
    const relevant = SCOPE3_CATEGORIES.filter((c) => a[`cat${c.n}`] === "RELEVANT").map((c) => c.n);
    const covered = new Set(rows.map((r) => Number(r.category)));
    if (a.autoCategory3 === "yes") covered.add(3);
    const missing = relevant.filter((c) => !covered.has(c));
    if (missing.length) w.push({ section: "data", message: `Der er ingen aktiviteter for de relevante kategorier ${missing.join(", ")}.` });
    return w;
  },
};
