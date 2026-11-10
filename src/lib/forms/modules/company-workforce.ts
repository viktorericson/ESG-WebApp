import { num, sumColumn } from "../engine";
import type { ModuleDef } from "../types";

/** Selskabsmodul 3 – Medarbejdere og ansættelsesforhold (B8 + C5) */
export const companyWorkforce: ModuleDef = {
  key: "company.workforce",
  scope: "company",
  number: 3,
  title: "Medarbejdere og ansættelsesforhold",
  vs: ["B8", "C5"],
  description: "Antal ansatte fordelt på kontrakttype, køn og land (kontraktland). Alle medarbejderoplysninger registreres på selskabsniveau – ikke på lokationerne.",
  sections: [
    {
      key: "headcount",
      title: "Ansatte i rapporteringsåret",
      vs: ["B8.40a", "B8.40b", "B8.40c"],
      description: "Én række pr. kombination af land, køn og ansættelsestype. Det samlede antal bør stemme med antallet i modul 1 (B1).",
      evidence: true,
      fields: [
        {
          key: "unit",
          label: "Opgøres som",
          type: "radio",
          required: true,
          options: [
            { value: "HEADCOUNT", label: "Antal personer (headcount)" },
            { value: "FTE", label: "Fuldtidsækvivalenter (FTE)" },
          ],
          info: "En fuldtidsækvivalent på 1,0 svarer til én fuldtidsstilling. FTE kan beregnes som samlede arbejdstimer ÷ 1.924.",
        },
        {
          key: "employees",
          label: "Fordeling af ansatte",
          type: "table",
          required: true,
          addLabel: "Tilføj række",
          vs: ["B8.40a", "B8.40b", "B8.40c"],
          info: "Land er det land, hvor ansættelseskontrakten er indgået. Opdelingen på lande skal kun bruges, hvis selskabet har ansatte i andre lande end Danmark. Kønsfordelingen kan fx tage udgangspunkt i CPR-numre, men overvej om det er dækkende for medarbejdergruppen.",
          howTo: "HR- eller lønsystemet kan typisk trække antal ansatte pr. køn og ansættelsestype.",
          columns: [
            { key: "country", label: "Land", type: "text", required: true, placeholder: "fx Danmark" },
            {
              key: "gender",
              label: "Køn",
              type: "select",
              required: true,
              options: [
                { value: "MALE", label: "Mand" },
                { value: "FEMALE", label: "Kvinde" },
                { value: "OTHER", label: "Andet" },
                { value: "UNREPORTED", label: "Ikke registreret" },
              ],
            },
            {
              key: "contract",
              label: "Ansættelsestype",
              type: "select",
              required: true,
              options: [
                { value: "PERMANENT", label: "Fastansat" },
                { value: "TEMPORARY", label: "Midlertidigt ansat" },
              ],
            },
            { key: "count", label: "Antal", type: "number", required: true },
          ],
        },
      ],
    },
    {
      key: "supplementary",
      title: "Supplerende oplysninger om arbejdsstyrken",
      vs: ["C5"],
      cOnly: true,
      description: "Frivilligt i Udvidet Modul. Medarbejderomsætning er relevant for selskaber med over 50 ansatte.",
      fields: [
        {
          key: "leavers",
          label: "Antal medarbejdere der har forladt selskabet i rapporteringsåret",
          type: "number",
          integer: true,
          min: 0,
          vs: ["C5.58"],
          info: "Medregn alle fratrædelser – uanset årsag (frivilligt, afskediget, pensioneret eller død i tjeneste). Medarbejderomsætning = fratrådte ÷ gennemsnitligt antal ansatte × 100.",
        },
        { key: "employeesStart", label: "Antal ansatte ved årets start", type: "number", integer: true, min: 0, vs: ["C5.58"] },
        { key: "employeesEnd", label: "Antal ansatte ved årets slutning", type: "number", integer: true, min: 0, vs: ["C5.58"] },
        { key: "managementWomen", label: "Kvinder på ledelsesniveau", type: "number", integer: true, min: 0, vs: ["C5.57"] },
        { key: "managementMen", label: "Mænd på ledelsesniveau", type: "number", integer: true, min: 0, vs: ["C5.57"] },
        {
          key: "selfEmployed",
          label: "Selvstændige der arbejder for selskabet",
          type: "number",
          integer: true,
          min: 0,
          vs: ["C5.59"],
          hint: "Relevant hvis selskabet har en betydelig eller stigende afhængighed af selvstændige eller vikarer.",
        },
        { key: "agencyWorkers", label: "Vikarer fra vikarbureauer", type: "number", integer: true, min: 0, vs: ["C5.59"] },
      ],
    },
  ],
  checks: (a, ctx) => {
    const total = sumColumn(a, "employees", "count");
    const warnings = [];
    if (ctx.employees !== null && total > 0 && Math.abs(total - ctx.employees) > 0.5) {
      warnings.push({
        section: "headcount",
        message: `Summen af ansatte (${total.toLocaleString("da-DK")}) afviger fra antallet i modul 1 (${ctx.employees.toLocaleString("da-DK")}). Tjek at begge opgøres på samme måde (headcount/FTE).`,
      });
    }
    const start = num(a, "employeesStart");
    const end = num(a, "employeesEnd");
    const leavers = num(a, "leavers");
    const average = start !== null && end !== null ? (start + end) / 2 : null;
    if (leavers !== null && average && leavers / average > 1) {
      warnings.push({ section: "supplementary", message: `Medarbejderomsætningen bliver over 100 % (${Math.round((leavers / average) * 100)} %). Tjek tallene.` });
    }
    return warnings;
  },
};
