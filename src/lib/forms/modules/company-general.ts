import { isYes } from "../engine";
import type { ModuleDef } from "../types";

/** Selskabsmodul 1 – Generelle oplysninger (B1 + C1) */
export const companyGeneral: ModuleDef = {
  key: "company.general",
  scope: "company",
  number: 1,
  title: "Generelle oplysninger",
  vs: ["B1", "C1"],
  description: "Grundlæggende nøgletal for rapporteringsåret samt certificeringer og miljømærker. Juridisk form, NACE-koder og adresse hentes fra selskabets stamdata.",
  sections: [
    {
      key: "keyFigures",
      title: "Nøgletal for rapporteringsåret",
      vs: ["B1.27e"],
      description: "Alle tal skal dække selskabets regnskabsår for den valgte periode.",
      evidence: true,
      fields: [
        {
          key: "balanceSheetTotal",
          label: "Samlet balance",
          type: "number",
          unit: "kr.",
          min: 0,
          required: true,
          vs: ["B1.27e.iii"],
          howTo: "Totalen af aktiver/passiver – findes i årsregnskabet. Eller på datacvr.virk.dk under “Regnskaber”.",
        },
        {
          key: "turnover",
          label: "Omsætning",
          type: "number",
          unit: "kr.",
          min: 0,
          required: true,
          vs: ["B1.27e.iv"],
          hint: "Bruges også til at beregne CO₂e-intensitet (B3).",
          howTo: "Virksomhedens indtægter fra salg af varer/ydelser i rapporteringsåret. Findes i årsregnskabet eller på datacvr.virk.dk under “Regnskaber”.",
        },
        {
          key: "employeeUnit",
          label: "Antal ansatte opgøres som",
          type: "radio",
          required: true,
          vs: ["B1.27e.v"],
          options: [
            { value: "HEADCOUNT", label: "Antal personer (headcount)" },
            { value: "FTE", label: "Fuldtidsækvivalenter (FTE)" },
          ],
        },
        {
          key: "employees",
          label: "Antal ansatte",
          type: "number",
          min: 0,
          required: true,
          vs: ["B1.27e.v"],
          hint: "Afgør hvilke oplysningspunkter der er obligatoriske (10 eller færre / flere end 10 ansatte).",
          howTo:
            "Kan findes i virksomhedens HR- eller lønsystem eller på datacvr.virk.dk under “Regnskaber” (personaleoplysninger). FTE kan beregnes som det samlede antal arbejdstimer i rapporteringsåret divideret med 1.924, hvor 1.924 timer svarer til én typisk fuldtidsstilling i Danmark (37 timer pr. uge × 52 uger).",
        },
        {
          key: "operatingCountries",
          label: "Primære driftslande",
          type: "text",
          placeholder: "fx Danmark, Sverige",
          required: true,
          vs: ["B1.27e.vi"],
          hint: "De lande hvor selskabet primært har aktiviteter. Lokationernes adresser og geolokation hentes automatisk.",
        },
      ],
    },
    {
      key: "certifications",
      title: "Certificeringer og miljømærker",
      vs: ["B1.28"],
      description: "Skal oplyses, hvis selskabet har et ESG-certifikat eller miljømærke.",
      evidence: true,
      fields: [
        {
          key: "hasCertification",
          label: "Har selskabet opnået en bæredygtighedscertificering eller et miljømærke?",
          type: "yesno",
          required: true,
          info: "Fx ISO 14001, EMAS, Svanemærket, B Corp eller en EcoVadis-rating.",
        },
        {
          key: "certificationList",
          label: "Certificeringer",
          type: "table",
          required: true,
          showIf: isYes("hasCertification"),
          addLabel: "Tilføj certificering",
          columns: [
            { key: "name", label: "Navn", type: "text", required: true, placeholder: "fx ISO 14001" },
            { key: "issuer", label: "Udsteder", type: "text" },
            { key: "issued", label: "Udstedelsesdato", type: "date" },
            { key: "score", label: "Score/vurdering", type: "text" },
          ],
        },
      ],
    },
    {
      key: "strategy",
      title: "Forretningsmodel og strategi",
      vs: ["C1"],
      cOnly: true,
      description: "Beskriver indirekte selskabets bæredygtighedsprofil, også hvis der ikke er en nedskrevet bæredygtighedsstrategi.",
      fields: [
        { key: "productsServices", label: "Væsentlige grupper af produkter og/eller tjenesteydelser", type: "textarea", required: true, vs: ["C1"] },
        { key: "markets", label: "Væsentlige markeder", type: "textarea", required: true, vs: ["C1"] },
        { key: "businessRelations", label: "Primære forretningsforbindelser", type: "textarea", required: true, vs: ["C1"], hint: "Fx centrale leverandører, kunder og distributionskanaler." },
        { key: "strategyElements", label: "Centrale elementer i strategien, der relaterer til bæredygtighed", type: "textarea", vs: ["C1"] },
      ],
    },
  ],
};
