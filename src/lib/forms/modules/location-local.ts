import { isYes } from "../engine";
import type { ModuleDef, Option } from "../types";
import { HORIZONS, LEVELS } from "./company-climate";
import { ALL_POLICY_TOPICS } from "./company-policies";

/**
 * Lokationsmodul 7 – Lokale indsatser og klimarisici.
 * Lokale initiativer knyttes til et emne i selskabets politikregister (B2/C2), så de samles
 * under det samme emne i rapporten. Lokale klimatiltag (C3) og klimafarer (C4) indgår i
 * selskabets C3/C4-oplysninger i rapporten.
 */

export const HAZARDS: Option[] = [
  { value: "CLOUDBURST", label: "Skybrud og ekstrem nedbør" },
  { value: "FLOOD", label: "Oversvømmelse fra hav eller vandløb" },
  { value: "STORM", label: "Storm" },
  { value: "HEAT", label: "Hedebølge" },
  { value: "DROUGHT", label: "Tørke og vandmangel" },
  { value: "SEA_LEVEL", label: "Havniveaustigning" },
  { value: "GROUNDWATER", label: "Stigende grundvand" },
  { value: "EROSION", label: "Erosion og jordskred" },
  { value: "OTHER", label: "Andet" },
];

/** Akutte farer opstår ved enkelthændelser; kroniske er langsigtede ændringer */
export const CHRONIC_HAZARDS = new Set(["SEA_LEVEL", "GROUNDWATER", "DROUGHT", "EROSION"]);

const TOPICS: Option[] = ALL_POLICY_TOPICS.map((t) => ({ value: t.key, label: t.label }));

export const locationLocal: ModuleDef = {
  key: "location.local",
  scope: "location",
  number: 7,
  title: "Lokale indsatser og klimarisici",
  vs: ["B2", "C2", "C3", "C4"],
  description: "Lokale initiativer, klimatiltag og klimafarer på lokationen. De samles med selskabets politikregister, klimamål og klimarisici i rapporten.",
  sections: [
    {
      key: "initiatives",
      title: "Lokale praksisser og initiativer",
      vs: ["B2", "C2"],
      description: "Initiativer, der kun gælder denne lokation. De knyttes til et emne i selskabets politikregister (selskabsmodul 2).",
      evidence: true,
      fields: [
        { key: "hasLocalInitiatives", label: "Har lokationen egne praksisser eller initiativer for bæredygtighed?", type: "yesno", required: true },
        {
          key: "localInitiatives",
          label: "Initiativer",
          type: "table",
          required: true,
          showIf: isYes("hasLocalInitiatives"),
          addLabel: "Tilføj initiativ",
          columns: [
            { key: "topic", label: "Emne", type: "select", required: true, options: TOPICS },
            { key: "description", label: "Beskrivelse", type: "text", required: true, placeholder: "fx Solceller på taget, sortering af madaffald" },
          ],
        },
      ],
    },
    {
      key: "climateActions",
      title: "Lokale klimatiltag",
      vs: ["C3.53e"],
      cOnly: true,
      description: "Tiltag på lokationen, der bidrager til selskabets reduktionsmål (selskabsmodul 10).",
      evidence: true,
      fields: [
        { key: "hasClimateActions", label: "Gennemfører lokationen tiltag, der skal reducere udledningen?", type: "yesno", required: true },
        {
          key: "climateActions",
          label: "Tiltag",
          type: "table",
          required: true,
          showIf: isYes("hasClimateActions"),
          addLabel: "Tilføj tiltag",
          columns: [
            { key: "action", label: "Tiltag", type: "text", required: true, placeholder: "fx Varmepumpe erstatter gasfyr" },
            { key: "reduction", label: "Forventet reduktion (t CO₂e/år)", type: "number" },
            { key: "year", label: "Gennemføres (år)", type: "number" },
          ],
        },
      ],
    },
    {
      key: "hazards",
      title: "Lokale klimafarer",
      vs: ["C4.56"],
      cOnly: true,
      description: "Farer, der kan ramme netop denne lokation. Brug fx Klimaatlas (klimaatlas.dk) til at se risikoen for skybrud, oversvømmelse og havniveaustigning på adressen.",
      evidence: true,
      fields: [
        { key: "hasHazards", label: "Er der identificeret klimafarer for lokationen?", type: "yesno", required: true },
        {
          key: "hazards",
          label: "Klimafarer",
          type: "table",
          required: true,
          showIf: isYes("hasHazards"),
          addLabel: "Tilføj klimafare",
          columns: [
            { key: "hazard", label: "Fare", type: "select", required: true, options: HAZARDS },
            { key: "exposure", label: "Eksponering", type: "select", required: true, options: LEVELS },
            { key: "sensitivity", label: "Følsomhed", type: "select", required: true, options: LEVELS },
            { key: "horizon", label: "Tidshorisont", type: "select", required: true, options: HORIZONS },
            { key: "adaptation", label: "Tilpasning", type: "text", placeholder: "fx Højvandsklapper på kloakken (tom = ingen)" },
          ],
        },
      ],
    },
  ],
};
