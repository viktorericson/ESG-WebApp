import { isYes } from "../engine";
import type { ModuleDef } from "../types";

/** Lokationsmodul 6 – Biodiversitet og geografiske miljøforhold (B5 + vandstress til B6) */
export const locationBiodiversity: ModuleDef = {
  key: "location.biodiversity",
  scope: "location",
  number: 6,
  title: "Biodiversitet og geografiske forhold",
  vs: ["B5", "B6"],
  description: "Om lokationen ligger i eller nær et biodiversitetsfølsomt område, naturorienterede arealer samt vurdering af vandstress, som genbruges i B6.",
  sections: [
    {
      key: "sensitiveAreas",
      title: "Biodiversitetsfølsomme områder",
      vs: ["B5.35"],
      evidence: true,
      fields: [
        {
          key: "nearSensitiveArea",
          label: "Ligger lokationen i eller nær et biodiversitetsfølsomt område?",
          type: "yesno",
          required: true,
          vs: ["B5.35"],
          info: "Biodiversitetsfølsomme områder omfatter fx Natura 2000-områder, UNESCO-verdensarvsområder og andre beskyttede naturområder. Du kan se beskyttede områder for en adresse på arealinformation.miljoeportal.dk.",
        },
        { key: "sensitiveAreaName", label: "Områdets navn", type: "text", required: true, showIf: isYes("nearSensitiveArea"), vs: ["B5.35"], placeholder: "fx Natura 2000-område nr. 113" },
        {
          key: "sensitiveAreaRelation",
          label: "Placering i forhold til området",
          type: "radio",
          required: true,
          showIf: isYes("nearSensitiveArea"),
          options: [
            { value: "IN", label: "I området" },
            { value: "NEAR", label: "Nær området" },
          ],
        },
      ],
    },
    {
      key: "landUse",
      title: "Naturorienterede arealer",
      vs: ["B5"],
      description: "Frivilligt. Bruges til at beskrive lokationens arealanvendelse.",
      evidence: true,
      fields: [
        {
          key: "hasNatureArea",
          label: "Er der et naturorienteret område på lokationens grund?",
          type: "yesno",
          info:
            "Et areal, der primært er indrettet, bevaret eller genskabt for at fremme natur og biodiversitet. Fx grønne tage eller facader, regnvandsbede eller bassiner udformet som levesteder, arealer med vilde blomster eller gamle træer, og områder genskabt til eng, skov eller vådområde.",
        },
        {
          key: "natureAreaHa",
          label: "Areal",
          type: "number",
          unit: "ha",
          min: 0,
          showIf: isYes("hasNatureArea"),
          howTo: "Søg adressen og brug målefunktionen på arealinformation.miljoeportal.dk.",
        },
        { key: "natureAreaDescription", label: "Beskriv området", type: "textarea", showIf: isYes("hasNatureArea") },
        { key: "sealedAreaHa", label: "Befæstet areal (bygninger, asfalt mv.)", type: "number", unit: "ha", min: 0 },
      ],
    },
    {
      key: "waterStress",
      title: "Vandstress",
      vs: ["B6.37"],
      fields: [
        {
          key: "waterStress",
          label: "Ligger lokationen i et område med høj vandstress?",
          type: "radio",
          required: true,
          vs: ["B6.37"],
          options: [
            { value: "YES", label: "Ja" },
            { value: "NO", label: "Nej" },
            { value: "UNKNOWN", label: "Ved ikke" },
          ],
          info: "Områder med høj vandstress er områder, hvor efterspørgslen efter vand er høj i forhold til de tilgængelige ressourcer. Det kan fx vurderes med WRI Aqueduct Water Risk Atlas. De fleste lokationer i Danmark ligger ikke i områder med høj vandstress.",
          hint: "Vandforbrug på lokationer i områder med vandstress skal oplyses særskilt i rapporten.",
        },
      ],
    },
  ],
};
