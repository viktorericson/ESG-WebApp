import { isYes } from "../engine";
import type { ModuleDef } from "../types";

/** Selskabsmodul 7 – Ledelse og forretningsadfærd (B11 + C8, C9) */
export const companyGovernance: ModuleDef = {
  key: "company.governance",
  scope: "company",
  number: 7,
  title: "Ledelse og forretningsadfærd",
  vs: ["B11", "C8", "C9"],
  description: "Domme og bøder for korruption og bestikkelse. I Udvidet Modul også omsætning fra bestemte sektorer og kønsfordeling i det øverste ledelsesorgan.",
  sections: [
    {
      key: "corruption",
      title: "Korruption og bestikkelse",
      vs: ["B11.43"],
      description: "Skal kun udfyldes med tal, hvis selskabet i rapporteringsperioden har fået domme eller bøder for overtrædelse af lovgivning om antikorruption eller antibestikkelse.",
      evidence: true,
      fields: [
        { key: "hadConvictions", label: "Har selskabet fået domme eller bøder for korruption eller bestikkelse i rapporteringsåret?", type: "yesno", required: true, vs: ["B11.43"] },
        { key: "convictions", label: "Antal domme", type: "number", integer: true, min: 0, required: true, showIf: isYes("hadConvictions"), vs: ["B11.43"] },
        { key: "fines", label: "Samlet bødebeløb", type: "number", unit: "kr.", min: 0, required: true, showIf: isYes("hadConvictions"), vs: ["B11.43"] },
      ],
    },
    {
      key: "sectorRevenue",
      title: "Omsætning fra bestemte sektorer",
      vs: ["C8.63"],
      cOnly: true,
      fields: [
        {
          key: "activeInSectors",
          label: "Har selskabet aktiviteter inden for forbudt våbenindustri, tobak, fossile brændstoffer eller fremstilling af kemikalier?",
          type: "yesno",
          required: true,
          vs: ["C8.63"],
        },
        {
          key: "sectorRevenueList",
          label: "Omsætning pr. sektor",
          type: "table",
          required: true,
          showIf: isYes("activeInSectors"),
          vs: ["C8.63a", "C8.63b", "C8.63c", "C8.63d"],
          columns: [
            {
              key: "sector",
              label: "Sektor",
              type: "select",
              required: true,
              options: [
                { value: "WEAPONS", label: "Forbudt våbenindustri (personelminer, klyngeammunition, kemiske og biologiske våben)" },
                { value: "TOBACCO", label: "Dyrkning og produktion af tobak" },
                { value: "COAL", label: "Fossile brændstoffer – kul" },
                { value: "OIL", label: "Fossile brændstoffer – olie" },
                { value: "GAS", label: "Fossile brændstoffer – gas" },
                { value: "CHEMICALS", label: "Fremstilling af kemikalier (NACE 20.2)" },
              ],
            },
            { key: "revenue", label: "Omsætning (kr.)", type: "number", required: true },
          ],
        },
      ],
    },
    {
      key: "boardDiversity",
      title: "Kønsfordeling i øverste ledelsesorgan",
      vs: ["C9.64"],
      cOnly: true,
      fields: [
        { key: "hasBoard", label: "Har selskabet et øverste ledelsesorgan (fx bestyrelse)?", type: "yesno", required: true },
        { key: "boardWomen", label: "Antal kvinder i ledelsesorganet", type: "number", integer: true, min: 0, required: true, showIf: isYes("hasBoard"), vs: ["C9.64"] },
        {
          key: "boardMen",
          label: "Antal mænd i ledelsesorganet",
          type: "number",
          integer: true,
          min: 0,
          required: true,
          showIf: isYes("hasBoard"),
          vs: ["C9.64"],
          hint: "Forholdet beregnes som kvinder ÷ mænd. Under 1 betyder flere mænd end kvinder.",
        },
      ],
    },
  ],
};
