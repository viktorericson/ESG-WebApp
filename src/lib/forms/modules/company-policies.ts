import { isYes } from "../engine";
import type { Answers, FieldDef, ModuleDef, SectionDef } from "../types";

/**
 * Selskabsmodul 2 – Politikker, praksisser og initiativer (B2 + C2) samt cirkulær økonomi (B7).
 * Fungerer som selskabets fælles politikregister, som C6 og lokationernes indsatser linker til.
 */

export type PolicyTopic = { key: string; label: string; inspiration: string };

export const POLICY_TOPICS: { env: PolicyTopic[]; social: PolicyTopic[] } = {
  env: [
    { key: "climate", label: "Klimaforandringer", inspiration: "Fx energirenovering, CO₂-reduktion, grøn transport, klimamål eller klimapolitik." },
    {
      key: "pollution",
      label: "Forurening",
      inspiration: "Fx rensning af spildevand, brug af miljøvenlige kemikalier, støjreducerende tiltag, minimering af luftforurening eller politik for håndtering af farligt affald.",
    },
    {
      key: "water",
      label: "Vand- og havressourcer",
      inspiration: "Fx opsamling af regnvand, vandbesparende udstyr, reduktion af spildevand, brug af vand i lukkede kredsløb eller ansvarlig brug af havressourcer.",
    },
    {
      key: "biodiversity",
      label: "Biodiversitet og økosystemer",
      inspiration: "Fx undgåelse af naturområder, pleje af grønne arealer, brug af hjemmehørende planter, samarbejde om naturgenopretning eller vurdering af naturpåvirkning ved nybyggeri.",
    },
    {
      key: "circular",
      label: "Cirkulær økonomi",
      inspiration: "Fx genbrug af materialer, affaldssortering, reparation i stedet for udskiftning, design for genanvendelse eller reduktion af emballage.",
    },
  ],
  social: [
    {
      key: "ownWorkforce",
      label: "Egen arbejdsstyrke",
      inspiration: "Fx fleksible arbejdstider, sikkerhedsudstyr, personalepolitik for ligebehandling, efteruddannelse eller trivselspolitik.",
    },
    {
      key: "valueChainWorkers",
      label: "Arbejdstagere i værdikæden",
      inspiration: "Fx krav om ordentlige arbejdsvilkår hos leverandører, samarbejde med sociale virksomheder eller opfølgning på arbejdsforhold i produktionen.",
    },
    {
      key: "communities",
      label: "Berørte lokalsamfund",
      inspiration: "Fx dialog med naboer, støjafskærmning, donationer til lokale initiativer, samarbejde med lokalsamfund eller ansvarlig arealanvendelse.",
    },
    {
      key: "consumers",
      label: "Forbrugere og slutbrugere",
      inspiration: "Fx brugervenligt og sikkert design, gennemsigtig information, inkluderende markedsføring, databeskyttelse eller fokus på tilgængelighed.",
    },
    {
      key: "businessConduct",
      label: "Forretningsadfærd",
      inspiration: "Fx antikorruptionspolitik, whistleblower-ordning, etisk kodeks, ansvarlig leverandørstyring eller politik for politisk neutralitet.",
    },
  ],
};

export const ALL_POLICY_TOPICS = [...POLICY_TOPICS.env, ...POLICY_TOPICS.social];

const hasPractice = (topic: string) => (a: Answers) => a[`${topic}_practice`] === "PUBLIC" || a[`${topic}_practice`] === "INTERNAL";

function topicFields(t: PolicyTopic): FieldDef[] {
  return [
    {
      key: `${t.key}_practice`,
      heading: t.label,
      label: "Har selskabet praksisser, politikker eller fremtidige initiativer?",
      type: "radio",
      required: true,
      vs: ["B2.29a", "B2.29b"],
      info: t.inspiration,
      options: [
        { value: "PUBLIC", label: "Ja, og de er offentligt tilgængelige (fx på hjemmesiden)" },
        { value: "INTERNAL", label: "Ja, men ikke offentligt tilgængelige" },
        { value: "NO", label: "Nej" },
      ],
    },
    {
      key: `${t.key}_targets`,
      label: "Er der fastsat mål for at følge implementeringen og måle fremskridt?",
      type: "yesno",
      required: true,
      vs: ["B2.29c"],
      showIf: hasPractice(t.key),
    },
    {
      key: `${t.key}_description`,
      label: "Beskrivelse af praksisser, politikker, initiativer og mål",
      type: "textarea",
      required: true,
      cOnly: true,
      vs: ["C2"],
      showIf: hasPractice(t.key),
    },
    {
      key: `${t.key}_coverage`,
      label: "Omfatter de også leverandører eller kunder?",
      type: "select",
      cOnly: true,
      vs: ["C2"],
      showIf: hasPractice(t.key),
      options: [
        { value: "OWN", label: "Kun egen virksomhed" },
        { value: "SUPPLIERS", label: "Også leverandører" },
        { value: "CUSTOMERS", label: "Også kunder" },
        { value: "BOTH", label: "Leverandører og kunder" },
      ],
    },
    {
      key: `${t.key}_responsible`,
      label: "Øverste ansvarlige niveau",
      type: "text",
      cOnly: true,
      vs: ["C2"],
      placeholder: "fx Direktionen",
      showIf: hasPractice(t.key),
    },
    {
      key: `${t.key}_comment`,
      label: "Kommentar",
      type: "textarea",
      hint: "Uddyb eventuelt praksisser, politikker og mål – eller fraværet af dem.",
    },
  ];
}

const topicSection = (key: string, title: string, topics: PolicyTopic[]): SectionDef => ({
  key,
  title,
  vs: ["B2"],
  description:
    "Svar for hvert emne. Lokale initiativer på lokationerne og menneskerettighedspolitikker (C6) henviser til dette register, så politikker kun skal registreres ét sted.",
  evidence: true,
  fields: topics.flatMap(topicFields),
});

export const companyPolicies: ModuleDef = {
  key: "company.policies",
  scope: "company",
  number: 2,
  title: "Politikker, praksisser og initiativer",
  vs: ["B2", "B7", "C2"],
  description: "Selskabets fælles politikregister for de 10 bæredygtighedsemner samt anvendelse af principper for cirkulær økonomi.",
  sections: [
    topicSection("environment", "Miljø", POLICY_TOPICS.env),
    topicSection("socialGovernance", "Sociale forhold og forretningsadfærd", POLICY_TOPICS.social),
    {
      key: "circularPrinciples",
      title: "Principper for cirkulær økonomi",
      vs: ["B7.38"],
      evidence: true,
      fields: [
        {
          key: "usesCircularPrinciples",
          label: "Anvender selskabet principper for cirkulær økonomi?",
          type: "yesno",
          required: true,
          vs: ["B7.38"],
          info: "De europæiske principper for cirkulær økonomi er: anvendelighed, genanvendelighed, reparerbarhed, adskillelse, omfabrikation eller istandsættelse, genbrug, recirkulering via det biologiske kredsløb samt anden mulig optimering af produkt- og materialeanvendelse.",
        },
        {
          key: "circularDescription",
          label: "Hvordan anvender selskabet principperne for cirkulær økonomi?",
          type: "textarea",
          required: true,
          showIf: isYes("usesCircularPrinciples"),
          hint: "Fx genbrug, reparation, ressourceeffektivitet, affaldsreduktion, take-back-ordninger eller design til genanvendelse.",
          info: "Eksempel: Virksomheden har indført en ordning, hvor produkter, der returneres fra kunder med mindre defekter, bliver vurderet og repareret i stedet for at blive kasseret. Efter reparation sælges de som “refurbished” eller bruges som erstatningsprodukter ved reklamation. Ordningen reducerer affald og materialeforbrug og forlænger produkternes levetid.",
        },
      ],
    },
  ],
  checks: (a) =>
    a.circular_practice === "NO" && a.usesCircularPrinciples === "yes"
      ? [{ section: "circularPrinciples", message: "Selskabet anvender principper for cirkulær økonomi, men har svaret “Nej” til praksisser for cirkulær økonomi under Miljø. Overvej at opdatere politikregistret." }]
      : [],
};
