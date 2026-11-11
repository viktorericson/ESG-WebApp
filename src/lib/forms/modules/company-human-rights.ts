import { isYes, over10 } from "../engine";
import type { Answers, FieldDef, ModuleDef } from "../types";

/**
 * Selskabsmodul 6 – Menneskerettigheder (Udvidet Modul C6 + C7).
 * Ordlyd efter VS (EU-Kommissionens henstilling), pkt. 61–62. Punkter markeret
 * "frivilligt for virksomheder med 10 ansatte eller derunder" er kun krævet over 10 ansatte.
 */

const yesNo = (key: string, label: string, opts: Partial<FieldDef> = {}): FieldDef =>
  ({ key, label, type: "yesno", required: true, ...opts }) as FieldDef;

const POLICY_TOPICS = [
  ["covChildLabour", "Børnearbejde", "C6.61b.i"],
  ["covForcedLabour", "Tvangsarbejde", "C6.61b.ii"],
  ["covTrafficking", "Menneskehandel", "C6.61b.iii"],
  ["covDiscrimination", "Forskelsbehandling", "C6.61b.iv"],
  ["covAccidents", "Forebyggelse af ulykker", "C6.61b.v"],
] as const;

const INCIDENT_TOPICS = [
  ["incChildLabour", "Børnearbejde", "C7.62a.i"],
  ["incForcedLabour", "Tvangsarbejde", "C7.62a.ii"],
  ["incTrafficking", "Menneskehandel", "C7.62a.iii"],
  ["incDiscrimination", "Forskelsbehandling", "C7.62a.iv"],
] as const;

const hasPolicy = isYes("hasHumanRightsPolicy");
const anyIncident = (a: Answers) => [...INCIDENT_TOPICS.map(([k]) => k), "incOther"].some((k) => a[k] === "yes");

export const companyHumanRights: ModuleDef = {
  key: "company.humanRights",
  scope: "company",
  number: 6,
  title: "Menneskerettigheder",
  vs: ["C6", "C7"],
  description: "Adfærdskodeks eller menneskerettighedspolitik, klagemekanisme og bekræftede menneskerettighedshændelser i egen arbejdsstyrke og i værdikæden. Kun ved Udvidet Modul.",
  sections: [
    {
      key: "policy",
      title: "Menneskerettighedspolitikker og -processer",
      vs: ["C6.61"],
      cOnly: true,
      description: "Politikken registreres også i politikregistret (modul 2) under “Egen arbejdsstyrke”, så den kun skal beskrives ét sted.",
      evidence: true,
      fields: [
        yesNo("hasHumanRightsPolicy", "Har selskabet en adfærdskodeks eller en menneskerettighedspolitik for sin egen arbejdsstyrke?", {
          required: over10,
          vs: ["C6.61a"],
          hint: "Frivilligt for virksomheder med 10 ansatte eller derunder.",
          info: "Egen arbejdsstyrke er de personer, der er direkte ansat i selskabet, samt selvstændige og vikarer, som selskabet benytter.",
        }),
        ...POLICY_TOPICS.map(([key, label, vs], i) =>
          yesNo(key, label, { showIf: hasPolicy, vs: [vs], ...(i === 0 ? { heading: "Omfatter kodeksen/politikken:" } : {}) }),
        ),
        yesNo("covOther", "Andet", { showIf: hasPolicy, vs: ["C6.61b.vi"] }),
        { key: "covOtherSpec", label: "Angiv hvad ellers politikken omfatter", type: "text", required: true, showIf: (a) => hasPolicy(a) && a.covOther === "yes", vs: ["C6.61b.vi"] },
        { key: "policyLink", label: "Link til kodeks/politik", type: "text", showIf: hasPolicy, placeholder: "Valgfrit – fx på hjemmesiden" },
        yesNo("hasGrievanceMechanism", "Har selskabet en klagebehandlingsmekanisme for sin egen arbejdsstyrke?", {
          required: over10,
          heading: "Klagebehandling",
          vs: ["C6.61c"],
          hint: "Frivilligt for virksomheder med 10 ansatte eller derunder.",
          info: "Fx en whistleblowerordning, en anonym klagekanal eller en fast procedure for at rejse og behandle klager over arbejdsforhold.",
        }),
      ],
    },
    {
      key: "incidentsOwn",
      title: "Bekræftede hændelser i egen arbejdsstyrke",
      vs: ["C7.62a", "C7.62b"],
      cOnly: true,
      description: "Har selskabet i rapporteringsperioden haft bekræftede hændelser i sin egen arbejdsstyrke relateret til følgende? Frivilligt for virksomheder med 10 ansatte eller derunder.",
      evidence: true,
      fields: [
        ...INCIDENT_TOPICS.map(([key, label, vs]) => yesNo(key, label, { required: over10, vs: [vs] })),
        yesNo("incOther", "Andet", { required: over10, vs: ["C7.62a.v"] }),
        { key: "incOtherSpec", label: "Angiv hvilke andre hændelser", type: "text", required: true, showIf: isYes("incOther"), vs: ["C7.62a.v"] },
        {
          key: "incidentActions",
          label: "Beskriv de tiltag, der iværksættes for at håndtere hændelserne",
          type: "textarea",
          showIf: anyIncident,
          vs: ["C7.62b"],
          hint: "Valgfrit efter standarden, men anbefales.",
        },
      ],
    },
    {
      key: "incidentsValueChain",
      title: "Bekræftede hændelser i værdikæden",
      vs: ["C7.62c"],
      cOnly: true,
      fields: [
        yesNo("hasValueChainIncidents", "Har selskabet kendskab til bekræftede hændelser i rapporteringsperioden, der involverer arbejdstagere i værdikæden, berørte samfund, forbrugere eller slutbrugere?", {
          required: over10,
          vs: ["C7.62c"],
          hint: "Frivilligt for virksomheder med 10 ansatte eller derunder.",
        }),
        {
          key: "valueChainIncidents",
          label: "Hvilke hændelser",
          type: "table",
          required: true,
          showIf: isYes("hasValueChainIncidents"),
          addLabel: "Tilføj hændelse",
          vs: ["C7.62c"],
          columns: [
            {
              key: "group",
              label: "Berørt gruppe",
              type: "select",
              required: true,
              options: [
                { value: "VALUE_CHAIN_WORKERS", label: "Arbejdstagere i værdikæden" },
                { value: "COMMUNITIES", label: "Berørte samfund" },
                { value: "CONSUMERS", label: "Forbrugere og slutbrugere" },
              ],
            },
            { key: "description", label: "Beskrivelse", type: "text", required: true },
          ],
        },
      ],
    },
  ],
  checks: (a) =>
    anyIncident(a) && !(typeof a.incidentActions === "string" && a.incidentActions.trim())
      ? [{ section: "incidentsOwn", message: "Der er bekræftede hændelser. Overvej at beskrive de tiltag, der iværksættes (C7 pkt. 62b)." }]
      : [],
};
