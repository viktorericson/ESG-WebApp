import { isYes, over10 } from "../engine";
import type { ColumnDef, ModuleDef, Option } from "../types";

/**
 * Selskabsmodul 8 – Direkte emissioner, Scope 1 (B3).
 * Kilderne registreres på selskabet, men kan knyttes til en lokation (fx et gasfyr på lageret).
 * De bruges både til scope 1-beregningen og til det samlede energiforbrug, og vises i lokationens energioverblik.
 */

const opts = (values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));

export const VEHICLE_TYPES = opts([
  "Personbil (benzin)",
  "Personbil (diesel)",
  "Personbil (el)",
  "Personbil (hybrid, ikke plug-in)",
  "Varebil (benzin)",
  "Varebil (diesel)",
  "Varebil (el)",
  "Lastbil (diesel)",
  "Lastbil (biodiesel/HVO)",
  "Lastbil (CNG)",
  "Lastbil (CBG/biogas)",
  "Lastbil (LNG)",
  "Lastbil (LBG)",
  "Lastbil (LPG)",
  "Bus (diesel)",
  "Motorcykel (benzin)",
  "Entreprenør-/arbejdsmaskine (diesel)",
  "Truck/gaffeltruck (diesel)",
  "Truck/gaffeltruck (LPG)",
  "Andet",
]);

export const STATIONARY_FUELS = opts([
  "Naturgas",
  "Ledningsgas",
  "Biogas",
  "Fyringsolie",
  "Fuelolie",
  "Diesel",
  "Benzin",
  "LPG",
  "Propan",
  "Træpiller",
  "Træflis",
  "Halm",
  "Andet",
]);

export const PROCESS_GASES = opts([
  "CO2",
  "CH4",
  "N2O",
  "SF6",
  "NF3",
  "HFC-23",
  "HFC-32",
  "HFC-41",
  "HFC-125",
  "HFC-134",
  "HFC-134a",
  "HFC-143",
  "HFC-143a",
  "HFC-152a",
  "HFC-227ea",
  "HFC-236fa",
  "HFC-245ca",
  "HFC-43-10mee",
  "PFC-14 (CF4)",
  "PFC-116 (C2F6)",
  "PFC-218 (C3F8)",
  "PFC-318 (c-C4F8)",
  "PFC-31-10 (C4F10)",
  "PFC-41-12 (C5F12)",
  "PFC-51-14 (C6F14)",
]);

export const REFRIGERANTS = opts(["R-32", "R-134a", "R-404A", "R-407C", "R-410A", "R-422D", "R-448A", "R-449A", "R-452A", "R-507A", "R-744 (CO2)", "R-290 (propan)", "R-717 (ammoniak)", "Andet"]);

const locationColumn: ColumnDef = { key: "location", label: "Lokation", type: "select", dynamicOptions: "locations" };

export const companyScope1: ModuleDef = {
  key: "company.scope1",
  scope: "company",
  number: 8,
  title: "Direkte emissioner – Scope 1",
  vs: ["B3"],
  description:
    "Brændstof til egne eller leasede køretøjer og maskiner, stationære anlæg (kedler, fyr, generatorer), procesudledninger og lækage af kølemidler. Brændslernes energiindhold indgår også i det samlede energiforbrug. Obligatorisk for selskaber med flere end 10 ansatte.",
  sections: [
    {
      key: "mobile",
      title: "Mobil forbrænding",
      vs: ["B3.32", "B3.33"],
      evidence: true,
      fields: [
        {
          key: "hasVehicles",
          label: "Har selskabet egne ejede eller leasede køretøjer eller maskiner, der kører på brændstof eller strøm?",
          type: "yesno",
          required: over10,
          info: "Medtag biler, varevogne, lastbiler, trucks og arbejdsmaskiner, som selskabet ejer eller leaser. Medarbejderes egne biler, der bruges til erhvervskørsel, hører under scope 3.",
        },
        {
          key: "vehicles",
          label: "Køretøjer og maskiner",
          type: "table",
          required: true,
          showIf: isYes("hasVehicles"),
          addLabel: "Tilføj køretøj/maskine",
          vs: ["B3.33"],
          info: "Brændstof i liter giver den mest præcise beregning. Kilometer kan bruges, hvis der ikke findes brændstofdata. Biogas til lastbiler (CBG/LBG) angives i kg. El til elbiler, der lades på selskabets lokationer, indgår i lokationens elforbrug og skal ikke medtages her.",
          howTo: "Brændstofkort, tankkvitteringer, flådestyringssystem eller leasingselskabets opgørelser.",
          columns: [
            { key: "vehicleType", label: "Køretøj/drivmiddel", type: "select", required: true, options: VEHICLE_TYPES },
            { key: "unit", label: "Enhed", type: "select", required: true, options: opts(["L", "km", "kWh", "kg"]) },
            { key: "amount", label: "Mængde", type: "number", required: true },
            { key: "count", label: "Antal", type: "number" },
            locationColumn,
          ],
        },
      ],
    },
    {
      key: "stationary",
      title: "Stationær forbrænding",
      vs: ["B3.32", "B3.33"],
      evidence: true,
      fields: [
        {
          key: "hasStationary",
          label: "Har selskabet egne kedler, opvarmningsanlæg, generatorer eller andet stationært udstyr, der bruger brændsel?",
          type: "yesno",
          required: over10,
          info: "Fx naturgasfyr, oliefyr, træpillefyr eller nødstrømsgeneratorer. Fjernvarme hører ikke hertil – den indrapporteres under lokationens energimodul (scope 2).",
        },
        {
          key: "stationarySources",
          label: "Anlæg og brændsler",
          type: "table",
          required: true,
          showIf: isYes("hasStationary"),
          addLabel: "Tilføj anlæg",
          vs: ["B3.33"],
          howTo: "Gas- og olieregninger, måleraflæsninger eller leverandørens årsopgørelse.",
          info: "Vælg “Ledningsgas”, hvis I køber almindelig gas fra gasnettet og ikke kender biogasandelen – Klimakompassets faktor for ledningsgas indeholder nettets gennemsnitlige andel af biogas. Vælg “Naturgas” og angiv biogasandelen, hvis den er dokumenteret.",
          columns: [
            { key: "description", label: "Beskrivelse", type: "text", placeholder: "fx Gasfyr kontor" },
            { key: "fuel", label: "Brændsel", type: "select", required: true, options: STATIONARY_FUELS },
            { key: "unit", label: "Enhed", type: "select", required: true, options: opts(["m3", "Nm3", "L", "ton"]) },
            { key: "amount", label: "Mængde", type: "number", required: true },
            { key: "biogasShare", label: "Andel biogas (%)", type: "number", placeholder: "Kun naturgas" },
            locationColumn,
          ],
        },
      ],
    },
    {
      key: "refrigerants",
      title: "Kølemidler",
      vs: ["B3.33"],
      description: "Lækage af kølemidler fra køle-, fryse- og varmepumpeanlæg. Mængden svarer typisk til den mængde, der er påfyldt ved service i løbet af året.",
      evidence: true,
      fields: [
        { key: "hasRefrigerantLeaks", label: "Er der påfyldt kølemiddel på selskabets anlæg i rapporteringsåret?", type: "yesno", required: over10 },
        {
          key: "refrigerantLeaks",
          label: "Påfyldt kølemiddel",
          type: "table",
          required: true,
          showIf: isYes("hasRefrigerantLeaks"),
          addLabel: "Tilføj kølemiddel",
          howTo: "Servicerapporter fra kølefirmaet (logbog for kølesystemet) angiver kølemiddeltype og påfyldt mængde.",
          columns: [
            { key: "refrigerant", label: "Kølemiddel", type: "select", required: true, options: REFRIGERANTS },
            { key: "kg", label: "Påfyldt (kg)", type: "number", required: true },
            { key: "equipment", label: "Anlæg", type: "text", placeholder: "fx Kølerum" },
            locationColumn,
          ],
        },
      ],
    },
    {
      key: "process",
      title: "Procesudledninger",
      vs: ["B3.33"],
      description: "Udledninger fra fysiske eller kemiske processer, der ikke er forbrænding – fx CO₂ fra kalcinering, katalytisk krakning eller PFC fra metallurgiske processer.",
      evidence: true,
      fields: [
        { key: "hasProcessEmissions", label: "Har selskabet procesudledninger?", type: "yesno", required: over10 },
        {
          key: "processEmissions",
          label: "Procesudledninger",
          type: "table",
          required: true,
          showIf: isYes("hasProcessEmissions"),
          addLabel: "Tilføj udledning",
          columns: [
            { key: "description", label: "Beskrivelse", type: "text" },
            { key: "gas", label: "Drivhusgas", type: "select", required: true, options: PROCESS_GASES },
            { key: "unit", label: "Enhed", type: "select", required: true, options: opts(["kg", "ton"]) },
            { key: "amount", label: "Mængde", type: "number", required: true },
            locationColumn,
          ],
        },
      ],
    },
  ],
  checks: (a) => {
    const rows = Array.isArray(a.vehicles) ? (a.vehicles as Record<string, unknown>[]) : [];
    const w = [];
    if (rows.some((r) => String(r.vehicleType ?? "").includes("(el)") && r.unit === "L")) {
      w.push({ section: "mobile", message: "Elkøretøjer kan ikke opgøres i liter. Brug kWh eller km." });
    }
    const gasRows = Array.isArray(a.stationarySources) ? (a.stationarySources as Record<string, unknown>[]) : [];
    if (gasRows.some((r) => r.biogasShare !== null && r.biogasShare !== undefined && r.biogasShare !== "" && r.fuel !== "Naturgas")) {
      w.push({ section: "stationary", message: "Andel biogas bruges kun for naturgas og ignoreres for andre brændsler." });
    }
    return w;
  },
};
