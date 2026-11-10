import type { Answers, ModuleDef } from "../types";

/** Lokationsmodul 5 – Forurening (B4) */
export const locationPollution: ModuleDef = {
  key: "location.pollution",
  scope: "location",
  number: 5,
  title: "Forurening",
  vs: ["B4"],
  description:
    "Udledning af forurenende stoffer til luft, vand og jord fra lokationen. Kun et oplysningskrav, hvis udledningerne allerede rapporteres til myndighederne eller frivilligt gennem et miljøledelsessystem.",
  sections: [
    {
      key: "emissions",
      title: "Udledning af forurenende stoffer",
      vs: ["B4.34"],
      evidence: true,
      fields: [
        {
          key: "reportingBasis",
          label: "Er selskabet forpligtet til – eller rapporterer det frivilligt – udledning af forurenende stoffer fra denne lokation?",
          type: "radio",
          required: true,
          vs: ["B4.34"],
          options: [
            { value: "MANDATORY", label: "Ja, vi er lovpligtigt forpligtet til at rapportere" },
            { value: "VOLUNTARY", label: "Ja, vi rapporterer frivilligt gennem fx EMAS eller ISO 14001" },
            { value: "NO", label: "Nej, vi rapporterer ikke og er ikke forpligtet til det" },
          ],
          info: "Der skal kun oplyses om forurening, som udledes fra selskabets egen virksomhed – ikke fra fx leverandører.",
        },
        {
          key: "pollutants",
          label: "Stoffer og mængder",
          type: "table",
          required: true,
          showIf: (a: Answers) => a.reportingBasis === "MANDATORY" || a.reportingBasis === "VOLUNTARY",
          addLabel: "Tilføj stof",
          vs: ["B4.34"],
          info: "Eksempler: NOx, SOx, CO, CO₂, CH₄, bly, kviksølv, cadmium, organisk stof (COD/BOD), olie/benzin, tungmetaller og suspenderede stoffer.",
          columns: [
            { key: "substance", label: "Stof", type: "text", required: true, placeholder: "fx NOx" },
            {
              key: "medium",
              label: "Udledt til",
              type: "select",
              required: true,
              options: [
                { value: "AIR", label: "Luft" },
                { value: "WATER", label: "Vand" },
                { value: "SOIL", label: "Jord" },
              ],
            },
            { key: "amountKg", label: "Mængde (kg)", type: "number", required: true },
            { key: "publicLink", label: "Link til offentlig opgørelse", type: "text", placeholder: "Valgfrit" },
          ],
        },
      ],
    },
  ],
};
