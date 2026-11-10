import type { ModuleDef } from "../types";

/** Selskabsmodul 4 – Arbejdsmiljø og sikkerhed (B9) */
export const companyHealth: ModuleDef = {
  key: "company.health",
  scope: "company",
  number: 4,
  title: "Arbejdsmiljø og sikkerhed",
  vs: ["B9"],
  description: "Registrerbare arbejdsulykker og arbejdsrelaterede dødsfald i egen arbejdsstyrke. Ulykkesfrekvensen beregnes automatisk ud fra arbejdstimerne i modul 5.",
  sections: [
    {
      key: "accidents",
      title: "Arbejdsulykker",
      vs: ["B9.41a"],
      evidence: true,
      fields: [
        {
          key: "recordableAccidents",
          label: "Antal registrerbare arbejdsulykker i rapporteringsåret",
          type: "number",
          integer: true,
          min: 0,
          required: true,
          vs: ["B9.41a"],
          info:
            "En arbejdsulykke er en hændelse, der fører til fysisk eller psykisk skade, mens personen udfører arbejdsrelaterede opgaver eller er på arbejdspladsen i arbejdstiden. “Registrerbar” betyder, at skaden eller sygdommen er diagnosticeret af en læge eller anden autoriseret sundhedsprofessionel, og at den har ført til fx fravær, skånejob, omplacering eller medicinsk behandling. Eksempler: fald, belastningsskader, skæresår og kemiske påvirkninger.",
          hint: "Frekvens = antal ulykker ÷ samlede arbejdstimer × 200.000 (svarer til ulykker pr. 100 fuldtidsansatte).",
        },
      ],
    },
    {
      key: "fatalities",
      title: "Arbejdsrelaterede dødsfald",
      vs: ["B9.41b"],
      description: "Skal oplyses, hvis relevant. Skriv 0, hvis der ikke har været dødsfald.",
      fields: [
        {
          key: "fatalitiesAccidents",
          label: "Dødsfald som følge af arbejdsulykker",
          type: "number",
          integer: true,
          min: 0,
          required: true,
          vs: ["B9.41b"],
          info: "Dødsfald som følge af ulykker eller akutte hændelser på arbejdspladsen (fx fald, klemning eller eksplosioner). Skal være baseret på dokumenterede hændelser, fx lægelig vurdering eller arbejdsskadeanmeldelse.",
        },
        {
          key: "fatalitiesIllHealth",
          label: "Dødsfald som følge af arbejdsrelateret sygdom",
          type: "number",
          integer: true,
          min: 0,
          required: true,
          vs: ["B9.41b"],
          info: "Dødsfald som følge af længerevarende erhvervspåvirkninger (fx kræft efter kemisk eksponering, lungesygdomme eller psykisk belastning).",
        },
      ],
    },
  ],
};
