/**
 * Engangsimport: Alumichem A/S' ESG-data fra den gamle Qlik-løsning (esgBRICKS konfigurator,
 * tabellen MA_Fact_ESG_Reported_Table_Lines) til den nye app.
 *
 *   npx tsx scripts/import-alumichem-qlik.ts
 *
 * Opretter brugeren test@alumichem.dk som koncernadmin, koncernen "Alumichem", selskabet,
 * lokationerne, rapporteringsårene 2023–2025 med en B-rapport hver og modulsvarene.
 * Findes koncernen allerede (samme navn + CVR), slettes den og oprettes forfra.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { evaluateModule, nextStatus, sanitizeAnswers } from "../src/lib/forms/engine";
import { getModule } from "../src/lib/forms/registry";
import type { Answers, FormContext } from "../src/lib/forms/types";
import type { ReportContent } from "../src/lib/report-content";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) });

const EMAIL = "test@alumichem.dk";
const ORG_NAME = "Alumichem";
const CVR = "70895528";
/** Qlik-rapporten angav balance og omsætning i euro. Den nye app bruger kr. (Nationalbankens centralkurs) */
const EUR_DKK = 7.46038;

const SRC = (year: number) => `Importeret fra Qlik (esgBRICKS konfigurator), rapporteringsår ${year}.`;

type Loc = "hq" | "v3" | "v7";
type YearData = {
  year: number;
  balanceEur: number;
  turnoverEur: number;
  employees: number;
  certifications: { name: string; issuer: string; issued: string | null; score?: string }[];
  /** [praksis, mål] – alle praksisser var markeret som ikke offentligt tilgængelige */
  policies: Partial<Record<string, ["yes" | "no", "yes" | "no"]>>;
  circular: "yes" | "no" | null;
  gasM3: number;
  electricityKWh: number;
  districtHeatingMWh: number;
  water: Record<Loc, { intake: number; discharge: number | null; onlyPublicSupply: boolean }>;
  wasteV3: { type: string; generated: number; recycled: number | null; disposed: number | null }[];
  heavyMetalsWaterKg: number | null;
  sensitiveArea: { name: string | null; ha: number };
  sealedHa: Record<Loc, number>;
  materials: [string, number][];
  women: number;
  men: number;
  accidents: number;
  minWageByAgreement: "yes" | "no";
  covered: number;
  hoursWomen: number | null;
  hoursMen: number | null;
  trainingWomen: number;
  trainingMen: number;
};

/**
 * Eksempelindhold til 2024-rapporten: Alumichems egne tekster fra ESG-ledelsesrapporten for 2024
 * (lavet i Qlik). Viser, hvordan forord, kernefortælling og kommentarer pr. afsnit kommer med i eksporten.
 */
const CONTENT_2024: ReportContent = {
  foreword: [
    "Bæredygtighed er kernen i vores forretning. Hos ALUMICHEM udvikler vi innovative løsninger, der hjælper virksomheder med at reducere vandforbrug, optimere processer og minimere miljøpåvirkningen. Vi arbejder målrettet for at beskytte naturressourcerne og bidrage til en mere ansvarlig brug af råmaterialer – især vand – gennem både reduktion af forbrug og udvikling af nye, miljøvenlige teknologier.",
    "I flere år har vi arbejdet strategisk med FN’s Verdensmål som rettesnor for vores indsats. Vi har især bidraget til målene om rent vand og sanitet, livet i havet, ansvarligt forbrug og produktion, sundhed og trivsel, industri, innovation og infrastruktur samt partnerskaber for handling. En samlet beskrivelse af vores arbejde med Verdensmålene kan findes på www.alumichem.com.",
    "Denne rapport markerer et nyt skridt: Vores første ESG-rapport udarbejdet efter den frivillige VSME-standard for SMV-virksomheders bæredygtighedsrapportering. Med rapporten ønsker vi at skabe indsigt og gennemsigtighed i vores arbejde med miljø, sociale forhold og god selskabsledelse – og at dokumentere, hvordan vi omsætter vores værdier og verdensmålene til konkrete resultater.",
    "ESG er en løbende rejse, og vi vil fortsætte med at udvikle, måle og rapportere på vores indsatser for at sikre, at vi skaber værdi for både kunder, medarbejdere, samfundet og miljøet.",
    "Jens Husted Kjær, CEO",
  ].join("\n"),
  about: [
    "ALUMICHEM blev grundlagt med en klar mission: at udvikle fremtidens løsninger til vandbehandling gennem innovation, specialisering og ansvarlighed. Siden 2011 har vi kombineret avanceret kemi, højteknologiske systemer og dyb faglig ekspertise for at skabe skræddersyede løsninger, der optimerer processer, reducerer miljøpåvirkningen og sikrer, at vores kunder kan nå deres bæredygtighedsmål.",
    "Vores arbejde spænder bredt – fra udvikling af avancerede kemikalier til produktion af komplette systemløsninger for både industrielt og kommunalt vand- og spildevand. Vi leverer løsninger til en lang række sektorer, herunder akvakultur, føde- og drikkevareindustrien, fødevareforarbejdning, energiproduktion, bygge- og anlægsbranchen, minedrift samt kommunale vandforsyninger.",
    "Hos ALUMICHEM tror vi på partnerskab. Vi hjælper vores kunder hele vejen – fra behovsafdækning, udvikling og test til implementering, træning, drift og optimering. Vi ved, at der ikke findes én universel løsning, og derfor arbejder vi tæt sammen med vores kunder for at levere den mest effektive og bæredygtige løsning til deres unikke behov.",
    "Bæredygtighed er ikke et separat initiativ hos os – det er integreret i alt, hvad vi gør. Med fokus på cirkulær anvendelse af vand, reduktion af farlige kemikalier, beskyttelse af marine miljøer og udvikling af teknologier, der bidrager til FN’s Verdensmål, arbejder vi hver dag for at skabe en renere, mere ressourceeffektiv fremtid.",
  ].join("\n"),
  summary: { show: true },
  sections: {
    b1: [
      "Dette er vores første ESG-rapport, udarbejdet med udgangspunkt i Basis-modulet i VSME-standarden. Rapporteringen repræsenterer vores entry level og giver os et solidt fundament for at arbejde struktureret med bæredygtighedsrapportering.",
      "Denne rapport er udarbejdet på individuelt niveau og omfatter udelukkende vores danske afdeling. Når denne rapport er afsluttet, vil vi påbegynde ESG-rapportering for vores øvrige lokationer, hvorefter vi udarbejder en samlet koncernrapport.",
      "Vi forventer, at vi i rapporten for 2025 vil løfte niveauet og rapportere efter Basis + Udvidet, så vi kan give et endnu mere nuanceret og dækkende billede af vores indsats.",
    ].join("\n"),
    b1Locations: [
      "Tabellen viser vores tre danske lokationer, som danner grundlag for rapportens øvrige indhold.",
      "Hovedkvarter – Blokken 38, 3460 Birkerød: administrativt centrum og base for ledelse, projekthåndtering, kundekontakt og interne funktioner.",
      "Produktion og lager – Elise Sørensens Vej 3 og 7, 4400 Kalundborg: her producerer og pakker vi vores produkter. De to adresser fungerer samlet som vores primære driftsanlæg i Danmark.",
      "Certificeringer: Svanemærket på afisningsproduktet Ice & Dust-away dokumenterer lav miljøbelastning gennem hele livscyklussen. ISO 14001 viser, at vi arbejder systematisk med at overvåge, reducere og forebygge miljøpåvirkninger. Derudover har vi ISO 9001 (kvalitetsledelse) og NSF/ANSI/CAN 60 (produktsikkerhed i drikkevandsbehandling).",
    ].join("\n"),
    b4: [
      "Vi rapporterer frivilligt om udledning af tungmetaller til vand, selvom der ikke er et lovkrav om at offentliggøre disse data. Det er en integreret del af vores ISO 14001-certificerede miljøledelsessystem og følger principperne om løbende forbedringer og gennemsigtighed i miljøpåvirkninger.",
      "Vi arbejder målrettet på at minimere udledningen ved hjælp af vores egne teknologier – herunder CSS-systemet, som binder tungmetaller i slammet under rensningsprocessen.",
    ].join("\n"),
    b5: [
      "Lokationen på Elise Sørensens Vej 3 grænser direkte op til et §3-beskyttet naturområde – sø (ID 103377, kilde: Danmarks Arealinformation, Miljøportalen). I vurderingen er der pålagt en bufferzone på 10 meter omkring selve grunden.",
      "Derudover overlapper lokationen med beskyttelseslinjer til to fredede fortidsminder:",
      "- Lokalitetsnr. 21 – Langhøj, dateret til stenalderen (Fredningsnr. 312124)",
      "- Lokalitetsnr. 23 – Langhøj, dateret til stenalderen (Fredningsnr. 312036)",
      "Elise Sørensens Vej 3 og 7 ligger desuden inden for et område, der i et foreløbigt forslag er udpeget som en del af 30 % beskyttet natur. Udpegningen er endnu ikke endeligt vedtaget.",
    ].join("\n"),
    b6: [
      "Hovedkontoret og lagerfaciliteten har intet nævneværdigt vandforbrug. Alt vand leveres fra det offentlige vandforsyningsnet og ledes direkte til kloak uden væsentligt procesforbrug, så vandforbruget registreres som 0.",
      "Produktions- og lagerfaciliteten har vandforbrug som led i de kemiske produktionsprocesser. Det indvundne vand anvendes i produktionen, hvorefter en del udledes til kloak. Ingen af faciliteterne har regnvandsopsamling.",
    ].join("\n"),
    b7Waste: [
      "Husholdningsaffald fra hovedkontoret sorteres efter de gældende regler, men der foreligger ikke udspecificerede mængdedata.",
      "For lager og produktion har vi endnu ikke fuldt specificerede data for genanvendt og bortskaffet affald. Det samlede affald håndteres efter følgende fordeling:",
      "- Genanvendelse: 1,97 %",
      "- Forbrænding: 14,44 %",
      "- Deponi: 83,59 %",
      "Vi forventer at kunne levere fuld rapportering efter VSME’s krav i vores ESG-rapport for 2026.",
    ].join("\n"),
    b7Materials: [
      "Masseflowet af nøglematerialer giver os et klart billede af, hvilke råvarer vi er mest afhængige af – især aluminium-trihydrat og natronlud, som udgør de største materialestrømme.",
      "Som en del af vores indsats for FN’s Verdensmål nr. 12 arbejder vi målrettet med at optimere produktionsprocesserne for at reducere energiforbrug, vandforbrug og råvareforbrug.",
    ].join("\n"),
    b8: [
      "Blandt de 46 fastansatte medarbejdere er 14 kvinder (30,4 %) og 32 mænd (69,6 %). Målt i fuldtidsækvivalenter udgør kvinder 28,8 %, hvilket skyldes en højere andel af deltidsstillinger blandt kvinder.",
      "Kategorierne “andet end kvinder og mænd” og “køn ikke angivet” indgår ikke i årets opgørelse, da vores HR-system hidtil ikke har haft dem. De implementeres fra 2025.",
      "Virksomheden tolererer ingen form for chikane eller diskrimination og rekrutterer altid på objektivt grundlag.",
    ].join("\n"),
    b10b: [
      "En del af vores arbejdsstyrke er dækket af Industriens Overenskomst. Vi bekræfter, at alle ansatte modtager en løn, der som minimum svarer til overenskomstens niveau. I alt er 12 medarbejdere omfattet.",
      "Opgørelsen over træningstimer er et estimat. Fra 2025 indfører vi en fast procedure for registrering af træningstimer.",
    ].join("\n"),
    b11: [
      "I rapporteringsperioden har vi hverken modtaget domme eller bøder.",
      "Vi tager klart afstand fra alle former for korruption og bestikkelse – både direkte betalinger og indirekte fordele. Vi har interne politikker og procedurer, der forebygger korruption.",
    ].join("\n"),
  },
  closing: "Vi har valgt at anvende EFRAG’s frivillige Basis-modul (VSME-standarden) for ESG-rapportering for 2024. En standard, som er udarbejdet til SMV-virksomheder.",
};

const CIRCULAR_2024 = [
  "Vi arbejder målrettet med principperne for cirkulær økonomi med fokus på at minimere vores ressourceforbrug, reducere miljøpåvirkningen og holde materialer i kredsløb så længe som muligt.",
  "Vi genanvender eventuelle kasserede produkter i efterfølgende produktioner og genbruger vaskevand fra rengøring af tanke, IBC’er og anden emballage. I samarbejde med Dansk Emballage har vi etableret et landsdækkende system til indsamling, rengøring og genanvendelse af tom emballage – et fuldt lukket kredsløb, der reducerer både affaldsmængder og ressourceforbrug.",
  "Vi har desuden udviklet teknologier, der reducerer mængden af overskudsslam fra kemiske vandrensningsprocesser. Det rene slam kan genanvendes, hvilket giver en endnu mere ressourceeffektiv udnyttelse af materialerne.",
].join("\n");

const AREA_2024 = "§3-beskyttet naturområde – sø (ID 103377, kilde: Danmarks Arealinformation, Miljøportalen)";

const DATA: YearData[] = [
  {
    year: 2024,
    balanceEur: 21_777_459.2,
    turnoverEur: 23_605_178.9,
    employees: 46,
    certifications: [
      { name: "Svanemærket (produktet 'Ice & Dust-away')", issuer: "Miljømærkning Danmark", issued: null, score: "N/A" },
      { name: "ISO 14001:2015", issuer: "Bureau Veritas", issued: "2024-08-22", score: "N/A" },
    ],
    policies: {
      climate: ["yes", "yes"],
      pollution: ["yes", "yes"],
      water: ["no", "no"],
      biodiversity: ["no", "no"],
      circular: ["yes", "yes"],
      ownWorkforce: ["yes", "no"],
      valueChainWorkers: ["yes", "yes"],
      communities: ["no", "no"],
      consumers: ["yes", "no"],
      businessConduct: ["yes", "yes"],
    },
    circular: "yes",
    gasM3: 35_983,
    electricityKWh: 184_236,
    districtHeatingMWh: 78.42,
    water: {
      hq: { intake: 0, discharge: 0, onlyPublicSupply: true },
      v3: { intake: 5625.62, discharge: 5564, onlyPublicSupply: true },
      v7: { intake: 15.96, discharge: 15.96, onlyPublicSupply: true },
    },
    wasteV3: [
      { type: "Pap", generated: 460, recycled: null, disposed: null },
      { type: "Papir", generated: 110, recycled: null, disposed: null },
      { type: "Plast", generated: 399, recycled: null, disposed: null },
      { type: "Brændbart", generated: 6575, recycled: null, disposed: null },
      { type: "Deponi", generated: 41_080, recycled: null, disposed: null },
    ],
    heavyMetalsWaterKg: 0,
    sensitiveArea: { name: AREA_2024, ha: 1.99 },
    sealedHa: { hq: 0.2484, v3: 0.6025, v7: 0.1414 },
    materials: [
      ["Aluminium-trihydrat", 2400],
      ["Saltsyre 30-34%", 1885.76],
      ["Eddikesyre, opløsning 50-60%", 86.38],
      ["Natronlud 50%", 1678.9],
      ["Genbrugslud", 358.12],
      ["Kalilud 50% bulk", 61.1],
      ["Aluminium halfballs", 216.18],
      ["Aluminium-bar 20/25 kg", 196.68],
    ],
    women: 14,
    men: 32,
    accidents: 2,
    minWageByAgreement: "yes",
    covered: 12,
    hoursWomen: null,
    hoursMen: null,
    trainingWomen: 37,
    trainingMen: 83,
  },
  {
    year: 2025,
    balanceEur: 21_777_459.2,
    turnoverEur: 23_605_178.9,
    employees: 46,
    certifications: [
      { name: "Svanemærket", issuer: "Miljømærkning Danmark", issued: "2023-11-23", score: "Gyldig til 31.12.2029" },
      { name: "ISO 14001:2015", issuer: "Bureau Veritas", issued: "2018-08-25", score: "Gyldig til 25.08.2027" },
    ],
    // Forbrugere og slutbrugere samt Forretningsadfærd var ikke udfyldt for 2025 i Qlik
    policies: {
      climate: ["yes", "yes"],
      pollution: ["yes", "yes"],
      water: ["no", "no"],
      biodiversity: ["no", "no"],
      circular: ["yes", "yes"],
      ownWorkforce: ["yes", "no"],
      valueChainWorkers: ["yes", "yes"],
      communities: ["no", "no"],
    },
    circular: null,
    gasM3: 24_500,
    electricityKWh: 152_405,
    districtHeatingMWh: 65.59,
    water: {
      hq: { intake: 278, discharge: 0, onlyPublicSupply: true },
      v3: { intake: 5561, discharge: 0, onlyPublicSupply: false },
      v7: { intake: 0, discharge: 0, onlyPublicSupply: true },
    },
    wasteV3: [
      { type: "Pap", generated: 500, recycled: 500, disposed: null },
      { type: "Papir", generated: 50, recycled: 50, disposed: null },
      { type: "Plast", generated: 285, recycled: 285, disposed: null },
      { type: "Brændbart", generated: 7850, recycled: null, disposed: 7850 },
      { type: "Deponi", generated: 32_560, recycled: null, disposed: 32_560 },
      { type: "Jern- og stålskrot", generated: 200, recycled: 200, disposed: null },
    ],
    heavyMetalsWaterKg: null,
    // Områdets navn var kun angivet for 2024 – samme lokation, så det overføres
    sensitiveArea: { name: AREA_2024, ha: 31.84 },
    sealedHa: { hq: 0, v3: 1.0, v7: 5 },
    materials: [
      ["Aluminium-trihydrat", 2286],
      ["Saltsyre 30-34%", 1917],
      ["Eddikesyre, opløsning 50-60%", 78],
      ["Natronlud 50%", 1527],
      ["Genbrugslud", 438],
      ["Kalilud 50% bulk", 63],
      ["Aluminium halfballs", 388],
      ["Aluminium-bar 20/25 kg", 106],
      ["Natriumglyconat (stabilisator)", 3.3],
      ["Abocel (cellulose)", 1.0],
      ["Vinsyre", 0.3],
      ["Myresyre", 12.7],
      ["Kalk", 5.9],
      ["Magnesiumoxid", 10.4],
      ["Kalilud HT", 1121],
      ["Salpetersyre", 199],
      ["Magnesiumhydroxid", 68],
    ],
    women: 13,
    men: 32,
    accidents: 2,
    minWageByAgreement: "yes",
    covered: 12,
    hoursWomen: 23_266.4,
    hoursMen: 53_089.3,
    trainingWomen: 37,
    trainingMen: 86,
  },
];

const LOCATIONS: Record<Loc, { name: string; address: string; function: string; latitude: number; longitude: number }> = {
  hq: { name: "Hovedkvarter", address: "Blokken 38, 3460 Birkerød", function: "Hovedkontor", latitude: 55.83507, longitude: 12.40193 },
  v3: { name: "Produktion og lager (Vej 3)", address: "Elise Sørensens Vej 3, 4400 Kalundborg", function: "Produktion og lager", latitude: 55.67862, longitude: 11.12248 },
  v7: { name: "Produktion og lager (Vej 7)", address: "Elise Sørensens Vej 7, 4400 Kalundborg", function: "Produktion og lager", latitude: 55.67755, longitude: 11.12186 },
};

const ev = (comment: string) => ({ comment, sources: [{ system: "Qlik – esgBRICKS konfigurator" }] });

function companyModules(d: YearData): Record<string, Answers> {
  const policyAnswers: Answers = {};
  for (const [topic, v] of Object.entries(d.policies)) {
    if (!v) continue;
    policyAnswers[`${topic}_practice`] = v[0] === "yes" ? "INTERNAL" : "NO";
    if (v[0] === "yes") policyAnswers[`${topic}_targets`] = v[1];
  }
  const src = SRC(d.year);
  return {
    "company.general": {
      balanceSheetTotal: Math.round(d.balanceEur * EUR_DKK),
      turnover: Math.round(d.turnoverEur * EUR_DKK),
      employeeUnit: "HEADCOUNT",
      employees: d.employees,
      operatingCountries: "Danmark",
      hasCertification: "yes",
      certificationList: d.certifications.map((c) => ({ ...c })),
      __evidence: {
        keyFigures: ev(
          `${src} Balance (${d.balanceEur.toLocaleString("da-DK")} €) og omsætning (${d.turnoverEur.toLocaleString("da-DK")} €) er omregnet til kr. med kurs ${EUR_DKK}. Omsætningen var i Qlik betegnet "Bruttoomsætning" (engelsk version: "Gross Profit") – kontrollér mod årsrapporten.`,
        ),
        certifications: ev(src),
      },
    },
    "company.policies": {
      ...policyAnswers,
      ...(d.circular ? { usesCircularPrinciples: d.circular } : {}),
      ...(d.year === 2024 ? { circularDescription: CIRCULAR_2024 } : {}),
      __evidence: { environment: ev(src), socialGovernance: ev(src), circularPrinciples: ev(src) },
    },
    "company.workforce": {
      unit: "HEADCOUNT",
      employees: [
        { country: "Danmark", gender: "FEMALE", contract: "PERMANENT", count: d.women },
        { country: "Danmark", gender: "MALE", contract: "PERMANENT", count: d.men },
      ],
      __evidence: { headcount: ev(`${src} Ingen midlertidigt ansatte.`) },
    },
    "company.health": {
      recordableAccidents: d.accidents,
      fatalitiesAccidents: 0,
      fatalitiesIllHealth: 0,
      __evidence: { accidents: ev(src) },
    },
    "company.pay": {
      minWageByAgreement: d.minWageByAgreement,
      allAboveMinWage: "YES",
      coveredByAgreement: d.covered,
      payGapRequired: "no",
      ...(d.hoursMen !== null ? { hoursMen: d.hoursMen } : {}),
      ...(d.hoursWomen !== null ? { hoursWomen: d.hoursWomen } : {}),
      trainingHoursMen: d.trainingMen,
      trainingHoursWomen: d.trainingWomen,
      __evidence: { hoursPayTraining: ev(d.hoursMen === null ? `${src} Arbejdstimer var ikke indrapporteret for året.` : src) },
    },
    "company.governance": {
      hadConvictions: "no",
      __evidence: { corruption: ev(`${src} Antal domme 0, bøder 0 kr.`) },
    },
    "company.scope1": {
      hasStationary: "yes",
      stationarySources: [{ description: "Gasforbrug (ledningsgas)", fuel: "Ledningsgas", unit: "m3", amount: d.gasM3, location: "@v3" }],
      __evidence: {
        stationary: ev(`${src} Qlik opgjorde gasforbruget samlet for selskabet – her knyttet til produktionen på Elise Sørensens Vej 3.`),
      },
    },
    "company.materials": {
      significantMaterialFlows: "yes",
      materials: d.materials.map(([material, amount]) => ({ material, unit: "ton", amount })),
      __evidence: { massFlows: ev(src) },
    },
  };
}

function locationModules(d: YearData, loc: Loc): Record<string, Answers | { notRelevant: string }> {
  const src = SRC(d.year);
  const w = d.water[loc];
  const out: Record<string, Answers | { notRelevant: string }> = {
    "location.water": {
      buysWater: "yes",
      waterIntake: { value: w.intake, unit: "m3" },
      usesRainwater: "no",
      significantConsumption: w.onlyPublicSupply ? "no" : "yes",
      ...(w.onlyPublicSupply ? {} : { waterDischarge: { value: w.discharge, unit: "m3" } }),
      __evidence: {
        intake: ev(src),
        ...(w.onlyPublicSupply
          ? {}
          : { consumption: ev(`${src} Qlik angav, at vandet ikke udelukkende ledes til kloak, men udledningen var opgjort til 0 m³ – kontrollér.`) }),
      },
    },
    "location.biodiversity": {
      nearSensitiveArea: loc === "v3" ? "yes" : "no",
      ...(loc === "v3" ? { sensitiveAreaName: d.sensitiveArea.name, sensitiveAreaRelation: "NEAR" } : {}),
      hasNatureArea: "no",
      sealedAreaHa: d.sealedHa[loc],
      waterStress: "NO",
      __evidence: {
        sensitiveAreas: ev(
          loc === "v3"
            ? `${src} Areal angivet i Qlik: ${d.sensitiveArea.ha.toLocaleString("da-DK")} ha.${d.year === 2025 ? " Områdets navn er overført fra 2024." : ""}`
            : `${src} Lokationen var ikke angivet som liggende i eller nær et biodiversitetsfølsomt område.`,
        ),
        landUse: ev(src),
      },
    },
  };

  const together = "I Qlik er energi og affald opgjort samlet for selskabet og registreret på Produktion og lager (Elise Sørensens Vej 3).";
  if (loc === "v3") {
    out["location.energy"] = {
      buysElectricity: "yes",
      electricity: { value: d.electricityKWh, unit: "kWh" },
      hasGuaranteesOfOrigin: "no",
      usesOwnElectricity: "no",
      buysDistrictHeating: "yes",
      districtHeatingAmount: { value: d.districtHeatingMWh, unit: "MWh" },
      buysSteamCooling: "no",
      __evidence: {
        purchasedElectricity: ev(`${src} Selskabets samlede elforbrug (Qlik brugte Energinets Eldeklaration).`),
        districtHeating: ev(`${src} Selskabets samlede fjernvarmeforbrug.`),
      },
    };
    out["location.waste"] = {
      householdOnly: "no",
      wasteRows: d.wasteV3.map((r) => ({ type: r.type, hazardous: "NON_HAZARDOUS", unit: "kg", generated: r.generated, recycled: r.recycled, disposed: r.disposed })),
      __evidence: { waste: ev(`${src} Affaldet er i Qlik opgjort samlet for Elise Sørensens Vej 3 og 7.`) },
    };
    out["location.pollution"] = {
      reportingBasis: "VOLUNTARY",
      pollutants: [{ substance: "Tungmetaller", medium: "WATER", amountKg: d.heavyMetalsWaterKg }],
      __evidence: {
        emissions: ev(`${src} Rapporteres frivilligt via ISO 14001 (antaget).${d.heavyMetalsWaterKg === null ? " Mængden var ikke udfyldt i Qlik." : ""}`),
      },
    };
  } else {
    out["location.energy"] = { notRelevant: together };
    out["location.waste"] =
      loc === "hq"
        ? { householdOnly: "yes", __evidence: { waste: ev(`${src} Kun husholdningsaffald (ikke opgjort i Qlik).`) } }
        : { notRelevant: together };
  }
  return out;
}

type ModuleInput = Answers | { notRelevant: string };
type YearImport = {
  year: number;
  /** Antal ansatte fra B1 – null hvis B1 ikke var udfyldt */
  employees: number | null;
  company: Record<string, Answers>;
  location: (loc: Loc) => Record<string, ModuleInput>;
};

/**
 * 2023 var kun delvist udfyldt i Qlik: energi (gas, el, fjernvarme), vand pr. lokation og
 * fordelingen af ansatte på køn. B1, politikker, affald, ulykker, løn mv. var tomme, så de moduler oprettes ikke.
 */
function year2023(): YearImport {
  const src = `${SRC(2023)} Året var kun delvist udfyldt i Qlik.`;
  const water: Record<Loc, { intake: number | null; dischargeNote?: string }> = {
    hq: { intake: null },
    v3: { intake: 3718.52, dischargeNote: " Qlik angav desuden en udledning på 3.613 m³ (alt vand fra det offentlige net og udledt til kloak)." },
    v7: { intake: 24.8 },
  };
  const together = "I Qlik er energi opgjort samlet for selskabet og registreret på Produktion og lager (Elise Sørensens Vej 3).";
  return {
    year: 2023,
    employees: null,
    company: {
      "company.workforce": {
        unit: "HEADCOUNT",
        employees: [
          { country: "Danmark", gender: "FEMALE", contract: "PERMANENT", count: 10 },
          { country: "Danmark", gender: "MALE", contract: "PERMANENT", count: 37 },
        ],
        __evidence: { headcount: ev(src) },
      },
      "company.scope1": {
        hasStationary: "yes",
        stationarySources: [{ description: "Gasforbrug (ledningsgas)", fuel: "Ledningsgas", unit: "m3", amount: 28_401, location: "@v3" }],
        __evidence: { stationary: ev(`${src} Gasforbruget var opgjort samlet for selskabet – her knyttet til Elise Sørensens Vej 3.`) },
      },
    },
    location: (loc) => {
      const w = water[loc];
      const out: Record<string, ModuleInput> = {
        "location.water": {
          ...(w.intake !== null ? { buysWater: "yes", waterIntake: { value: w.intake, unit: "m3" } } : {}),
          significantConsumption: "no",
          __evidence: { intake: ev(`${src}${w.intake === null ? " Vandindtaget var ikke udfyldt." : ""}${w.dischargeNote ?? ""}`) },
        },
        "location.biodiversity": { waterStress: "NO" },
      };
      out["location.energy"] =
        loc === "v3"
          ? {
              buysElectricity: "yes",
              electricity: { value: 152_370, unit: "kWh" },
              hasGuaranteesOfOrigin: "no",
              buysDistrictHeating: "yes",
              districtHeatingAmount: { value: 81.01, unit: "MWh" },
              __evidence: {
                purchasedElectricity: ev(`${src} Selskabets samlede elforbrug (Qlik brugte Energinets Eldeklaration).`),
                districtHeating: ev(`${src} Selskabets samlede fjernvarmeforbrug.`),
              },
            }
          : { notRelevant: together };
      return out;
    },
  };
}

async function saveModule(periodId: string, companyId: string, locationId: string | null, moduleKey: string, input: Answers | { notRelevant: string }, ctx: FormContext, userId: string) {
  const def = getModule(moduleKey);
  if (!def) throw new Error(`Ukendt modul ${moduleKey}`);
  const targetKey = locationId ? `location:${locationId}` : `company:${companyId}`;
  if ("notRelevant" in input && typeof input.notRelevant === "string") {
    await db.moduleData.create({ data: { periodId, moduleKey, targetKey, companyId, locationId, status: "NOT_RELEVANT", statusNote: input.notRelevant, updatedById: userId } });
    return { moduleKey, status: "NOT_RELEVANT", missing: [] as string[] };
  }
  const answers = sanitizeAnswers(def, input as Answers, ctx);
  const evaluation = evaluateModule(def, answers, ctx);
  const status = nextStatus("NOT_STARTED", evaluation);
  await db.moduleData.create({
    data: { periodId, moduleKey, targetKey, companyId, locationId, answers: answers as Prisma.InputJsonObject, status, updatedById: userId },
  });
  return { moduleKey, status, missing: evaluation.issues.map((i) => `${i.section}.${i.field}: ${i.message}`) };
}

async function main() {
  const existing = await db.organization.findFirst({ where: { name: ORG_NAME, companies: { some: { cvr: CVR } } } });
  if (existing) {
    // Rapporter peger på det rapporterende selskab uden kaskade – slet årene (og dermed rapporterne) først
    await db.reportingPeriod.deleteMany({ where: { organizationId: existing.id } });
    await db.organization.delete({ where: { id: existing.id } });
    console.log(`Slettede eksisterende koncern ${existing.id}`);
  }

  const user = await db.user.upsert({ where: { email: EMAIL }, create: { email: EMAIL, name: "Alumichem test" }, update: {} });
  const org = await db.organization.create({ data: { name: ORG_NAME, memberships: { create: { userId: user.id, role: "ORG_ADMIN" } } } });
  const company = await db.company.create({
    data: {
      organizationId: org.id,
      name: "Alumichem A/S",
      cvr: CVR,
      address: "Blokken 38, 3460 Birkerød",
      legalForm: "AS",
      naceCodes: ["20.13"],
    },
  });

  const locIds = {} as Record<Loc, string>;
  for (const [k, l] of Object.entries(LOCATIONS) as [Loc, (typeof LOCATIONS)[Loc]][]) {
    const row = await db.location.create({ data: { companyId: company.id, control: "EJER", ...l } });
    locIds[k] = row.id;
  }
  const ctxBase: FormContext = {
    comprehensive: false,
    employees: null,
    highImpactSector: true,
    locations: (Object.keys(LOCATIONS) as Loc[]).map((k) => ({ value: locIds[k], label: `${LOCATIONS[k].name} – ${LOCATIONS[k].address}` })),
  };

  const years: YearImport[] = [
    year2023(),
    ...DATA.map((d) => ({ year: d.year, employees: d.employees, company: companyModules(d), location: (l: Loc) => locationModules(d, l) })),
  ];

  const summary: string[] = [];
  for (const d of years) {
    const period = await db.reportingPeriod.create({
      data: { organizationId: org.id, year: d.year, startDate: new Date(Date.UTC(d.year, 0, 1)), endDate: new Date(Date.UTC(d.year, 11, 31)) },
    });
    const report = await db.report.create({
      data: {
        periodId: period.id,
        name: `ESG-opgørelse ${d.year}`,
        module: "BASIC",
        basis: "INDIVIDUAL",
        reportingCompanyId: company.id,
        omissions: "Ingen",
        content: (d.year === 2024 ? CONTENT_2024 : {}) as Prisma.InputJsonObject,
        companies: { create: [{ companyId: company.id }] },
      },
    });
    const ctx: FormContext = { ...ctxBase, employees: d.employees };

    const mods = d.company;
    // Lokationsreferencer i scope 1 ("@v3") erstattes med lokationens id
    for (const row of (mods["company.scope1"]?.stationarySources as Record<string, unknown>[] | undefined) ?? []) {
      if (typeof row.location === "string" && row.location.startsWith("@")) row.location = locIds[row.location.slice(1) as Loc];
    }
    for (const [key, answers] of Object.entries(mods)) {
      const r = await saveModule(period.id, company.id, null, key, answers, ctx, user.id);
      summary.push(`${d.year} ${company.name} ${r.moduleKey}: ${r.status}${r.missing.length ? `\n    mangler: ${r.missing.join("; ")}` : ""}`);
    }
    for (const loc of Object.keys(LOCATIONS) as Loc[]) {
      for (const [key, answers] of Object.entries(d.location(loc))) {
        const r = await saveModule(period.id, company.id, locIds[loc], key, answers, ctx, user.id);
        summary.push(`${d.year} ${LOCATIONS[loc].name} ${r.moduleKey}: ${r.status}${r.missing.length ? `\n    mangler: ${r.missing.join("; ")}` : ""}`);
      }
    }
    summary.push(`→ Rapport ${d.year}: /org/${org.id}/reports/${report.id}`);
  }

  await db.auditLog.create({
    data: { organizationId: org.id, userId: user.id, action: "organization.create", entityType: "Organization", entityId: org.id, data: { source: "Qlik-import" } },
  });
  console.log(`Koncern: /org/${org.id}\n` + summary.join("\n"));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
