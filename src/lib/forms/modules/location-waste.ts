import { over10, sumColumn } from "../engine";
import type { Answers, ModuleDef } from "../types";

/** Lokationsmodul 4 – Affald (B7) */
export const locationWaste: ModuleDef = {
  key: "location.waste",
  scope: "location",
  number: 4,
  title: "Affald",
  vs: ["B7"],
  description: "Affaldets vægt fordelt på farligt og ikke-farligt affald samt mængder sendt til genanvendelse eller forberedelse til genbrug. Andelen beregnes automatisk. Obligatorisk for selskaber med flere end 10 ansatte.",
  sections: [
    {
      key: "waste",
      title: "Affald genereret i rapporteringsåret",
      vs: ["B7.39a", "B7.39b"],
      evidence: true,
      fields: [
        {
          key: "householdOnly",
          label: "Har lokationen kun husholdningslignende affald, der indsamles via en kommunal ordning?",
          type: "yesno",
          required: over10,
          hint: "Svarer du Ja, kan affaldstabellen udelades (opgøres som 0). Har lokationen en aftale med en privat affaldsindsamler, skal mængderne oplyses.",
        },
        {
          key: "wasteRows",
          label: "Affaldsfraktioner",
          type: "table",
          required: true,
          showIf: (a: Answers) => a.householdOnly === "no",
          addLabel: "Tilføj fraktion",
          vs: ["B7.39a", "B7.39b"],
          info: "Farligt affald er fx brugte batterier, olier, pesticider, kviksølvholdigt udstyr og lysstofrør. EAK-koden er det fælles europæiske kodesæt for affaldstyper og fremgår typisk af affaldsoperatørens opgørelse.",
          howTo:
            "Tjek affaldsopgørelser fra jeres renovations- eller affaldsfirma – mange har online selvbetjening med rapporter over mængder, typer og behandlingsformer. Har du ikke udspecificerede data for husholdningsaffald, kan det rapporteres som én samlet kategori.",
          columns: [
            { key: "type", label: "Type", type: "text", required: true, placeholder: "fx pap, plast" },
            { key: "ewc", label: "EAK-kode", type: "text", placeholder: "fx 15 01 01" },
            {
              key: "hazardous",
              label: "Farligt?",
              type: "select",
              required: true,
              options: [
                { value: "NON_HAZARDOUS", label: "Ikke-farligt" },
                { value: "HAZARDOUS", label: "Farligt" },
              ],
            },
            {
              key: "unit",
              label: "Enhed",
              type: "select",
              required: true,
              options: [
                { value: "kg", label: "kg" },
                { value: "ton", label: "ton" },
              ],
            },
            { key: "generated", label: "Genereret", type: "number", required: true },
            { key: "recycled", label: "Til genanvendelse/genbrug", type: "number" },
            { key: "disposed", label: "Bortskaffet", type: "number" },
          ],
        },
      ],
    },
  ],
  checks: (a) => {
    const rows = Array.isArray(a.wasteRows) ? (a.wasteRows as Record<string, unknown>[]) : [];
    const bad = rows.filter((r) => {
      const g = Number(r.generated);
      const handled = (Number(r.recycled) || 0) + (Number(r.disposed) || 0);
      return Number.isFinite(g) && handled > g * 1.001;
    });
    const w = bad.map((r) => ({ section: "waste", message: `“${r.type ?? "Fraktion"}”: genanvendt + bortskaffet er større end den genererede mængde.` }));
    if (a.householdOnly === "no" && rows.length > 0 && sumColumn(a, "wasteRows", "generated") === 0) {
      w.push({ section: "waste", message: "Den samlede genererede mængde er 0." });
    }
    return w;
  },
};
