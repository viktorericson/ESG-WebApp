import { isYes, over10 } from "../engine";
import type { FieldDef, ModuleDef } from "../types";

const ENERGY_UNITS = ["kWh", "MWh", "GJ"];

const howToElectricity =
  "Tjek elregninger eller energirapporter for denne lokation. Kontakt virksomhedens økonomi- eller driftsafdeling, hvis du ikke selv har adgang. I mange tilfælde kan leverandøren give et overblik via online kundeportal eller årsopgørelse.";

const yes = (key: string, label: string, info: string): FieldDef => ({ key, label, type: "yesno", required: over10, info });

/** Lokationsmodul 2 – Energi og indirekte emissioner (B3, scope 2) */
export const locationEnergy: ModuleDef = {
  key: "location.energy",
  scope: "location",
  number: 2,
  title: "Energi og scope 2",
  vs: ["B3"],
  description:
    "Indkøbt elektricitet, varme, damp og køling samt egenproduceret el. Bruges til energiforbruget (B3 pkt. 32) og til scope 2 (pkt. 33). Obligatorisk for selskaber med flere end 10 ansatte.",
  sections: [
    {
      key: "purchasedElectricity",
      title: "Indkøbt elektricitet",
      vs: ["B3.32", "B3.33"],
      evidence: true,
      fields: [
        yes(
          "buysElectricity",
          "Indkøbes der elektricitet på denne lokation?",
          "Dette dækker al elektricitet, som leveres via elnettet fra en ekstern leverandør. Oplysningerne bruges både til at rapportere strømforbrug og til at beregne CO₂-udledningen (scope 2).",
        ),
        {
          key: "electricity",
          label: "Forbrug af indkøbt el",
          type: "quantity",
          units: ENERGY_UNITS,
          min: 0,
          required: true,
          showIf: isYes("buysElectricity"),
          vs: ["B3.32"],
          howTo: howToElectricity,
        },
        {
          key: "hasGuaranteesOfOrigin",
          label: "Er der købt oprindelsesgarantier (certifikater for grøn strøm) for lokationens elforbrug?",
          type: "yesno",
          required: true,
          showIf: isYes("buysElectricity"),
          info:
            "Scope 2 for el beregnes altid med begge metoder, som Klimakompasset gør: Den lokationsbaserede metode bruger Energinets Miljødeklaration (det faktiske energimix i elnettet) og er den, VSME kræver. Den markedsbaserede metode bruger Energinets Eldeklaration, som er korrigeret for handel med oprindelsesgarantier – her trækkes den el, der er dækket af selskabets oprindelsesgarantier, fra. En oprindelsesgaranti dokumenterer 1 MWh el produceret fra vedvarende energi.",
          howTo: "Oprindelsesgarantier fremgår af aftalen med elleverandøren eller af en særskilt dokumentation for køb af grøn strøm.",
        },
        {
          key: "goShare",
          label: "Andel af elforbruget dækket af oprindelsesgarantier",
          type: "number",
          unit: "%",
          min: 0,
          max: 100,
          required: true,
          showIf: (a) => a.buysElectricity === "yes" && a.hasGuaranteesOfOrigin === "yes",
          hint: "Bruges til den markedsbaserede scope 2 og til at fordele elforbruget på vedvarende og ikke-vedvarende energi.",
        },
      ],
    },
    {
      key: "ownElectricity",
      title: "Egenproduceret elektricitet",
      vs: ["B3.32"],
      evidence: true,
      fields: [
        yes(
          "usesOwnElectricity",
          "Forbruges der egenproduceret elektricitet på denne lokation?",
          "Al elektricitet, som er produceret på lokationen og forbruges her – fx fra solceller, vindmøller, biogasanlæg eller andre produktionsanlæg til el. Tæller som vedvarende energi.",
        ),
        {
          key: "ownElectricityAmount",
          label: "Forbrug af egenproduceret el",
          type: "quantity",
          units: ENERGY_UNITS,
          min: 0,
          required: true,
          showIf: isYes("usesOwnElectricity"),
          howTo:
            "Tjek måleraflæsninger fra produktionsanlæg (ofte tilgængeligt via inverter-app, driftslog eller energistyringssystem). Kontakt den ansvarlige for drift af solceller, vindmøller eller andet elproducerende udstyr. Ved nettoafregning kan oplysninger også findes på afregningsopgørelser fra netselskabet.",
        },
      ],
    },
    {
      key: "districtHeating",
      title: "Fjernvarme",
      vs: ["B3.32", "B3.33"],
      evidence: true,
      fields: [
        yes(
          "buysDistrictHeating",
          "Indkøbes der fjernvarme til lokationen?",
          "Hvis der købes brændsler som fx naturgas, bygas, træpiller, træflis eller olie til opvarmning via eget fyr eller kedel, skal det ikke rapporteres her, men under selskabets Scope 1-modul.",
        ),
        {
          key: "districtHeatingAmount",
          label: "Forbrug af fjernvarme",
          type: "quantity",
          units: ENERGY_UNITS,
          min: 0,
          required: true,
          showIf: isYes("buysDistrictHeating"),
          howTo:
            "Se fjernvarmeregninger for lokationen. Kontakt virksomhedens økonomi- eller driftsafdeling for overblik over varmeforbrug. Mange fjernvarmeselskaber tilbyder online selvbetjening, hvor du kan se forbrug og afregning.",
        },
        { key: "districtHeatingSupplier", label: "Fjernvarmeselskab", type: "text", showIf: isYes("buysDistrictHeating") },
        {
          key: "districtHeatingRenewableShare",
          label: "Andel vedvarende energi i fjernvarmen",
          type: "number",
          unit: "%",
          min: 0,
          max: 100,
          showIf: isYes("buysDistrictHeating"),
          hint: "Valgfrit. Fremgår ofte af fjernvarmeselskabets varmedeklaration. Uden oplysningen regnes fjernvarmen som ikke-vedvarende.",
        },
        {
          key: "districtHeatingFactor",
          label: "Leverandørens emissionsfaktor",
          type: "number",
          unit: "kg CO₂e/MWh",
          min: 0,
          showIf: isYes("buysDistrictHeating"),
          hint: "Valgfrit. Bruges i den markedsbaserede scope 2. Den lokationsbaserede bruger altid Klimakompassets landsgennemsnit.",
        },
      ],
    },
    {
      key: "steamCooling",
      title: "Damp og køling",
      vs: ["B3.32", "B3.33"],
      fields: [
        { key: "buysSteamCooling", label: "Indkøbes der damp eller fjernkøling til lokationen?", type: "yesno", required: over10 },
        {
          key: "steamCoolingList",
          label: "Indkøbt damp og køling",
          type: "table",
          required: true,
          showIf: isYes("buysSteamCooling"),
          columns: [
            { key: "type", label: "Type", type: "select", required: true, options: [{ value: "STEAM", label: "Damp" }, { value: "COOLING", label: "Fjernkøling" }] },
            { key: "unit", label: "Enhed", type: "select", required: true, options: ENERGY_UNITS.map((u) => ({ value: u, label: u })) },
            { key: "amount", label: "Mængde", type: "number", required: true },
            { key: "supplier", label: "Leverandør", type: "text" },
          ],
        },
      ],
    },
  ],
};
