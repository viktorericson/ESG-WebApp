import { isYes } from "../engine";
import type { ModuleDef } from "../types";

const UNITS = ["kg", "ton", "m3", "Nm3", "stk"].map((u) => ({ value: u, label: u }));

/** Selskabsmodul 9 – Materialer og ressourceforbrug (B7) */
export const companyMaterials: ModuleDef = {
  key: "company.materials",
  scope: "company",
  number: 9,
  title: "Materialer og ressourceforbrug",
  vs: ["B7"],
  description: "Årlige massestrømme for nøglematerialer. Kun et krav, hvis selskabet opererer i en sektor med væsentlige materialestrømme.",
  sections: [
    {
      key: "massFlows",
      title: "Massestrømme for nøglematerialer",
      vs: ["B7.40"],
      evidence: true,
      fields: [
        {
          key: "significantMaterialFlows",
          label: "Er selskabet aktivt i en branche med betydelige materialestrømme?",
          type: "yesno",
          required: true,
          info: "Gælder typisk produktionsvirksomheder (NACE sektion C), bygge- og anlægsvirksomheder (NACE sektion F) og emballering og pakning (NACE N82.92) – eller hvis driften i væsentlig grad afhænger af materialer som træ, stål, plast, gips, kemikalier eller glas.",
        },
        {
          key: "materials",
          label: "Nøglematerialer anvendt i rapporteringsåret",
          type: "table",
          required: true,
          showIf: isYes("significantMaterialFlows"),
          addLabel: "Tilføj materiale",
          vs: ["B7.40"],
          info: "Medtag alle væsentlige materialer, der anvendes i produktion eller drift – både indkøbte og internt genbrugte. Udelad energi og vand, som rapporteres andetsteds.",
          columns: [
            { key: "material", label: "Materiale", type: "text", required: true, placeholder: "fx stål, træ, plast" },
            { key: "unit", label: "Enhed", type: "select", required: true, options: UNITS },
            { key: "amount", label: "Mængde", type: "number", required: true },
            {
              key: "origin",
              label: "Oprindelse",
              type: "select",
              options: [
                { value: "VIRGIN", label: "Nyt (jomfrueligt)" },
                { value: "RECYCLED", label: "Genanvendt/genbrugt" },
                { value: "RENEWABLE", label: "Fornybart (fx træ)" },
                { value: "MIXED", label: "Blandet/ukendt" },
              ],
            },
            { key: "purpose", label: "Formål", type: "text", placeholder: "fx emballage, konstruktion" },
          ],
        },
      ],
    },
  ],
};
