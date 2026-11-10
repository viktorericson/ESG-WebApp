import { isYes, over10 } from "../engine";
import type { ModuleDef } from "../types";

const WATER_UNITS = ["m3", "L"];

/** Lokationsmodul 3 – Vand (B6) */
export const locationWater: ModuleDef = {
  key: "location.water",
  scope: "location",
  number: 3,
  title: "Vand",
  vs: ["B6"],
  description:
    "Vandindtag (B6 pkt. 36) og – ved væsentligt vandforbrugende processer – udledning til beregning af vandforbrug (pkt. 37). Om lokationen ligger i et område med vandstress, registreres under Biodiversitet og geografiske forhold. Obligatorisk for selskaber med flere end 10 ansatte.",
  sections: [
    {
      key: "intake",
      title: "Vandindtag",
      vs: ["B6.36"],
      evidence: true,
      fields: [
        { key: "buysWater", label: "Indkøbes der vand til lokationen?", type: "yesno", required: over10 },
        {
          key: "waterIntake",
          label: "Vandindtag i rapporteringsåret",
          type: "quantity",
          units: WATER_UNITS,
          min: 0,
          required: true,
          showIf: isYes("buysWater"),
          vs: ["B6.36"],
          howTo:
            "Tjek vandregninger for lokationen. Kontakt økonomi- eller driftsafdelingen for forbrugsoplysninger. Brug vandmåleraflæsninger eller forsyningsselskabets opgørelser – mange forsyninger har online selvbetjening.",
        },
        {
          key: "usesRainwater",
          label: "Opsamles der regnvand, som bruges aktivt på lokationen?",
          type: "yesno",
          required: over10,
          info: "Fx til toiletskyl, havevanding, procesvand eller lignende.",
        },
        {
          key: "rainwater",
          label: "Opsamlet og anvendt regnvand",
          type: "quantity",
          units: WATER_UNITS,
          min: 0,
          required: true,
          showIf: isYes("usesRainwater"),
          howTo: "Se driftsoplysninger fra bygningens tekniske anlæg eller regnvandsopsamlingssystem, måleraflæsning fra regnvandstank eller driftslog. Kontakt den driftsansvarlige for bygningen.",
        },
      ],
    },
    {
      key: "consumption",
      title: "Vandforbrug i produktionsprocesser",
      vs: ["B6.37"],
      evidence: true,
      fields: [
        {
          key: "significantConsumption",
          label: "Er der væsentlige mængder vandindtag, som ikke udledes igen?",
          type: "yesno",
          required: over10,
          info:
            "Vand, der forsvinder ud af systemet ved at blive optaget i produkter, indgå i produktionsprocesser eller fordampe – ud over almindeligt kontorforbrug (kaffemaskiner, håndvask, toiletskyl). Kontakt produktion/teknisk afdeling, eller se procesbeskrivelser og interne forbrugsanalyser.",
        },
        {
          key: "waterDischarge",
          label: "Vandudledning i rapporteringsåret",
          type: "quantity",
          units: WATER_UNITS,
          min: 0,
          required: true,
          showIf: isYes("significantConsumption"),
          vs: ["B6.37"],
          hint: "Vandforbrug beregnes automatisk som indtag + regnvand − udledning.",
          howTo: "Måleraflæsninger fra udledningsmålere (hvis installeret) eller en beregning ud fra vandindtag minus vand, der ikke udledes igen.",
        },
      ],
    },
  ],
  checks: (a) => {
    const intake = (a.waterIntake as { value?: number; unit?: string } | undefined) ?? {};
    const out = (a.waterDischarge as { value?: number; unit?: string } | undefined) ?? {};
    const toM3 = (q: { value?: number; unit?: string }) => (typeof q.value === "number" ? (q.unit === "L" ? q.value / 1000 : q.value) : null);
    const i = toM3(intake);
    const o = toM3(out);
    return i !== null && o !== null && a.significantConsumption === "yes" && o > i
      ? [{ section: "consumption", message: "Udledningen er større end vandindtaget. Tjek enheder og tal (regnvand kan forklare en lille forskel)." }]
      : [];
  },
};
