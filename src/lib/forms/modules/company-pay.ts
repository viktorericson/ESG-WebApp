import { isYes, num } from "../engine";
import type { ModuleDef, ModuleWarning } from "../types";

/** Selskabsmodul 5 – Løn, overenskomst og uddannelse (B10) */
export const companyPay: ModuleDef = {
  key: "company.pay",
  scope: "company",
  number: 5,
  title: "Løn, overenskomst og uddannelse",
  vs: ["B10"],
  description: "Mindsteløn, lønforskel mellem mænd og kvinder, overenskomstdækning og uddannelsestimer. Arbejdstimerne bruges også til ulykkesfrekvensen i modul 4.",
  sections: [
    {
      key: "minimumWage",
      title: "Mindsteløn",
      vs: ["B10.42a"],
      fields: [
        { key: "minWageByAgreement", label: "Er mindstelønnen for medarbejderne fastsat gennem en overenskomst?", type: "yesno", required: true, vs: ["B10.42a"] },
        {
          key: "allAboveMinWage",
          label: "Modtager alle ansatte mindst den gældende mindsteløn?",
          type: "radio",
          required: true,
          vs: ["B10.42a"],
          info: "Mindsteløn refererer til den overenskomstbestemte mindsteløn, hvor den findes.",
          options: [
            { value: "YES", label: "Ja" },
            { value: "NO", label: "Nej" },
            { value: "NA", label: "Ikke relevant" },
          ],
        },
      ],
    },
    {
      key: "collectiveAgreements",
      title: "Overenskomstdækning",
      vs: ["B10.42c"],
      fields: [
        {
          key: "coveredByAgreement",
          label: "Antal ansatte dækket af en kollektiv overenskomst",
          type: "number",
          min: 0,
          required: true,
          vs: ["B10.42c"],
          hint: "Procentandelen beregnes automatisk ud fra det samlede antal ansatte. Skriv 0, hvis ingen er dækket.",
          info: "Overenskomsten dækker alle ansatte inden for den pågældende sektor, uanset om den enkelte er medlem af en fagforening eller ej.",
        },
      ],
    },
    {
      key: "hoursPayTraining",
      title: "Arbejdstimer, løn og uddannelse",
      vs: ["B10.42b", "B10.42d", "B9.41a"],
      description: "Timer og lønsummer opgøres for hele rapporteringsåret. Estimater er tilladt, hvis de præcise tal ikke kan opgøres.",
      evidence: true,
      fields: [
        {
          key: "payGapRequired",
          label: "Er selskabet ved EU- eller national lov forpligtet til at oplyse lønforskellen mellem mænd og kvinder?",
          type: "yesno",
          required: true,
          vs: ["B10.42b"],
          hint: "Lønforskellen skal kun oplyses i rapporten, hvis selskabet allerede er forpligtet til det.",
        },
        { key: "hoursMen", label: "Samlede arbejdstimer – mænd", type: "number", unit: "timer", min: 0, required: true, vs: ["B9.41a", "B10.42b"] },
        { key: "hoursWomen", label: "Samlede arbejdstimer – kvinder", type: "number", unit: "timer", min: 0, required: true, vs: ["B9.41a", "B10.42b"] },
        {
          key: "grossPayMen",
          label: "Samlet bruttoløn – mænd",
          type: "number",
          unit: "kr.",
          min: 0,
          required: true,
          showIf: isYes("payGapRequired"),
          vs: ["B10.42b"],
          info: "Bruttoløn dækker alle aflønningselementer, fx basisløn, bonus, kontante tillæg, fri bil, forsikringer og sundhedsordninger. Lønforskel = (gns. timeløn mænd − gns. timeløn kvinder) ÷ gns. timeløn mænd × 100.",
        },
        { key: "grossPayWomen", label: "Samlet bruttoløn – kvinder", type: "number", unit: "kr.", min: 0, required: true, showIf: isYes("payGapRequired"), vs: ["B10.42b"] },
        {
          key: "trainingHoursMen",
          label: "Uddannelsestimer i alt – mænd",
          type: "number",
          unit: "timer",
          min: 0,
          required: true,
          vs: ["B10.42d"],
          info: "Uddannelsestimer omfatter udvikling af færdigheder og kompetencer – både formelt (kurser) og uformelt (fx sidemandsoplæring). Kan baseres på estimater.",
        },
        { key: "trainingHoursWomen", label: "Uddannelsestimer i alt – kvinder", type: "number", unit: "timer", min: 0, required: true, vs: ["B10.42d"] },
      ],
    },
  ],
  checks: (a, ctx) => {
    const w: ModuleWarning[] = [];
    const covered = num(a, "coveredByAgreement");
    if (covered !== null && ctx.employees !== null && covered > ctx.employees) {
      w.push({ section: "collectiveAgreements", message: `Flere dækket af overenskomst (${covered}) end antal ansatte i modul 1 (${ctx.employees}).` });
    }
    const hours = (num(a, "hoursMen") ?? 0) + (num(a, "hoursWomen") ?? 0);
    if (hours > 0 && ctx.employees) {
      const perEmployee = hours / ctx.employees;
      if (perEmployee > 2500 || perEmployee < 300) {
        w.push({
          section: "hoursPayTraining",
          message: `Arbejdstimerne svarer til ca. ${Math.round(perEmployee).toLocaleString("da-DK")} timer pr. ansat. En fuldtidsstilling er ca. 1.924 timer om året – tjek tallene.`,
        });
      }
    }
    return w;
  },
};
