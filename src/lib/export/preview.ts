/**
 * De indrapporterede data pr. afsnit, som de står i rapporten – vises ved siden af afsnittets
 * kommentarfelt, så man kan se, hvad man kommenterer på. Bygges af eksportmodellen, så tallene
 * er præcis de samme som i PowerPoint-filen. Ren funktion (ingen database).
 */
import type { SectionKey } from "../report-content";
import type { ExportModel } from "./model";

export type PreviewTable = {
  title?: string;
  /** Kolonneoverskrifter. Nøgle/værdi-tabeller har ingen og sammenlignes med året før. */
  head?: string[];
  rows: string[][];
};

export type SectionPreview = {
  tables: PreviewTable[];
  /** Afsnittet udelades i rapporten, fordi der ikke er noget at vise (kommentaren kommer så ikke med) */
  omitted?: string;
};

export type Previews = Partial<Record<SectionKey, SectionPreview>>;

const kv = (rows: [string, string | null | undefined][], title?: string): PreviewTable => ({ title, rows: rows.map(([k, v]) => [k, v ?? "–"]) });
const list = (head: string[], rows: string[][], empty: string, title?: string): PreviewTable => ({ title, head, rows: rows.length ? rows : [[empty, ...head.slice(1).map(() => "")]] });

export function buildPreviews(m: ExportModel): Previews {
  const p: Previews = {
    b1: { tables: [kv([["Rapportgrundlag", m.comprehensive ? "Basismodul + Udvidet Modul" : "Basismodul"], ["Afgrænsning", m.consolidated ? "Konsolideret" : "Individuel"], ["Datterselskaber", m.b1.subsidiaries.map((s) => s.name).join(", ") || "Ingen"]])] },
    b1Figures: {
      tables: [kv([["Virksomhedsform", m.b1.legalForm], ["NACE-kode(r)", m.b1.nace], ["Balancesum", m.b1.balance], ["Omsætning", m.b1.turnover], ["Antal ansatte", m.b1.employees], ["Udeladelser", m.b1.omissions ?? "Ingen"]])],
    },
    b1Locations: {
      tables: [
        list(["Lokation", "Adresse", "Geolokation"], m.b1.locations.map((l) => [l.name, [l.street, [l.postal, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), l.geo]), "Ingen lokationer", "Lokationer"),
        list(["Certificering", "Udsteder", "Dato", "Vurdering"], m.b1.certifications.map((c) => [c.name, c.description, c.date, c.rating]), "Ingen certificeringer", "Certificeringer og miljømærker"),
      ],
    },
    b2: {
      tables: [list(["Emne", "Praksis/politik", "Offentlig", "Mål"], m.b2.rows.map((r) => [r.label, r.has, r.isPublic, r.targets]), "–")],
      omitted: m.b2.any ? undefined : "Afsnittet udelades, fordi ingen emner har praksisser eller politikker.",
    },
    b3Energy: {
      tables: [
        list(
          ["MWh", "Vedvarende", "Ikke-vedvarende", "Total"],
          [
            ["Elektricitet", m.energy.electricity.renewable, m.energy.electricity.nonRenewable, m.energy.electricity.total],
            ["Brændstoffer", m.energy.fuels.renewable, m.energy.fuels.nonRenewable, m.energy.fuels.total],
            ["Andet (fx fjernvarme)", m.energy.other.renewable, m.energy.other.nonRenewable, m.energy.other.total],
            ["Total", m.energy.total.renewable, m.energy.total.nonRenewable, m.energy.total.total],
          ],
          "–",
        ),
      ],
    },
    b3Ghg: {
      tables: [
        kv([
          ["Scope 1 (t CO₂e)", m.ghg.scope1],
          ["Scope 2, lokationsbaseret (t CO₂e)", m.ghg.scope2Location],
          ["Scope 1 + 2, lokationsbaseret (t CO₂e)", m.ghg.totalLocation],
          ["Scope 2, markedsbaseret (t CO₂e)", m.ghg.scope2Market],
          ["CO₂e-intensitet", m.ghg.intensity],
        ]),
      ],
    },
    scope3: m.scope3
      ? { tables: [kv([["Scope 3 i alt (t CO₂e)", m.scope3.total], ...m.scope3.categories.map((c) => [c.label, c.value] as [string, string])])] }
      : { tables: [], omitted: "Scope 3 er ikke opgjort, så afsnittet udelades." },
    b4: {
      tables: [list(["Stof", "Mængde", "Udledt til"], m.b4.map((x) => [x.substance, x.amount, x.medium]), "Ingen udledninger")],
      omitted: m.b4.length ? undefined : "Afsnittet udelades, fordi der ikke er rapporteret udledninger.",
    },
    b5: {
      tables: [list(["Lokation", "Areal (ha)", "Område", "Placering"], m.b5.map((x) => [x.location, x.areaHa, x.areaName, x.relation]), "Ingen lokationer i eller nær følsomme områder")],
      omitted: m.b5.length ? undefined : "Afsnittet udelades, fordi ingen lokationer ligger i eller nær et biodiversitetsfølsomt område.",
    },
    b6: { tables: [kv([["Vandindtag", m.b6.intake], ["Vandforbrug", m.b6.consumption ?? "Ikke væsentligt"], ["Heraf i områder med vandstress", m.b6.consumptionStress ?? "0 m³"]])] },
    b7Circular: { tables: [kv([["Anvender principper for cirkulær økonomi", m.b7.circular], ["Beskrivelse", m.b7.circularText ?? "–"]])] },
    b7Waste: {
      tables: [
        kv([["Ikke-farligt affald", m.b7.totals.nonHazardous], ["Farligt affald", m.b7.totals.hazardous], ["Til genanvendelse/genbrug", m.b7.totals.recycled]]),
        list(["Fraktion", "Mængde", "Genanvendt"], [...m.b7.nonHazardous, ...m.b7.hazardous].map((w) => [w.type, w.total, w.recycled]), "Ingen fraktioner", "Fraktioner"),
      ],
    },
    b7Materials: {
      tables: [list(["Materiale", "Mængde"], m.b7.materials.map((x) => [x.material, x.amount]), "Ingen materialer")],
      omitted: m.b7.materials.length ? undefined : "Afsnittet udelades, fordi der ikke er registreret materialer.",
    },
    b8: {
      tables: [
        kv(
          [
            ["Fastansatte", m.b8.permanent],
            ["Midlertidigt ansatte", m.b8.temporary],
            ["Mænd", m.b8.male],
            ["Kvinder", m.b8.female],
            ["Andet", m.b8.other],
            ["Ikke registreret", m.b8.unreported],
            ["I alt", m.b8.total],
          ],
          `Antal ansatte (${m.b8.unitLabel})`,
        ),
      ],
    },
    b8Countries: {
      tables: [list(["Land", `Ansatte (${m.b8.unitLabel})`], m.b8.countries.map((c) => [c.country, c.count]), "–")],
      omitted: m.b8.otherCountries ? undefined : "Afsnittet udelades, fordi alle ansatte er i Danmark.",
    },
    b9: { tables: [kv([["Registrerbare arbejdsulykker", m.b9.accidents], ["Ulykkesfrekvens (pr. 200.000 timer)", m.b9.rate], ["Dødsfald – ulykker", m.b9.fatalAccidents], ["Dødsfald – arbejdsrelateret sygdom", m.b9.fatalIllHealth]])] },
    b10: { tables: [kv([["Alle får mindst mindsteløn", m.b10.minWage], ["Lønforskel mænd/kvinder", m.b10.payGap ?? "Ikke omfattet af krav om oplysning"]])] },
    b10b: { tables: [kv([["Dækket af overenskomst", m.b10.cba], ["Uddannelsestimer pr. ansat", m.b10.training]])] },
    b11: { tables: [kv([["Domme for korruption/bestikkelse", m.b11.convictions], ["Bøder", m.b11.fines]])] },
  };

  if (m.comprehensive) {
    Object.assign(p, {
      c1: { tables: [kv([["Produkter og tjenester", m.c1.products], ["Markeder", m.c1.markets], ["Forretningsforbindelser", m.c1.relations], ["Strategi", m.c1.strategy]])] },
      c2: { tables: [list(["Emne", "Beskrivelse", "Ansvarlig"], m.c2.filter((r) => r.any).map((r) => [r.label, r.description, r.responsible]), "Ingen indsatser beskrevet")] },
      c3: {
        tables: [
          list(["Scope", "Mål", "Basisår"], m.c3.targets.map((t) => [t.scope, t.target, t.baseline]), "Ingen reduktionsmål", "Reduktionsmål"),
          list(["Tiltag"], m.c3.actions.map((a) => [a]), "Ingen tiltag", "Tiltag"),
        ],
        omitted: m.c3.targets.length ? undefined : "Afsnittet udelades, fordi der ikke er reduktionsmål.",
      },
      c3Transition: m.c3.transition
        ? { tables: [kv([["Omstillingsplan", m.c3.transition.hasPlan], ["Plan", m.c3.transition.plan], ["Vil vedtage en plan", m.c3.transition.willAdopt], ["Hvornår", m.c3.transition.when]])] }
        : { tables: [], omitted: "Afsnittet udelades, fordi der ikke er svaret om omstillingsplan." },
      c4: {
        tables: [list(["Type", "Risiko", "Eksponering", "Tidshorisont"], m.c4.risks.map((r) => [r.type === "TRANSITION" ? "Omstilling" : r.type === "ACUTE" ? "Akut" : "Kronisk", r.description, r.exposure, r.horizon]), "Ingen klimarisici")],
        omitted: m.c4.risks.length ? undefined : "Afsnittet udelades, fordi der ikke er identificeret klimarisici.",
      },
      c5: { tables: [kv([["Medarbejderomsætning", m.c5.turnover], ["Forhold kvinder/mænd i ledelsen", m.c5.managementRatio], ["Selvstændige", m.c5.selfEmployed?.toString()], ["Vikarer", m.c5.agency?.toString()]])] },
      c6: { tables: [kv([["Menneskerettighedspolitik", m.c6.policy], ["Klagemekanisme", m.c6.grievance], ...m.c6.covers])] },
      c7: { tables: [kv(m.c7.own, "Egen arbejdsstyrke"), kv(m.c7.valueChain, "Værdikæden")] },
      c8: m.c8 ? { tables: [kv(["Våben", "Tobak", "Kul", "Olie", "Gas", "Kemikalier"].map((s, i) => [s, m.c8![i]]))] } : { tables: [], omitted: "Afsnittet udelades, fordi selskabet ikke har aktiviteter i sektorerne." },
      c9: m.c9 ? { tables: [kv([["Forhold kvinder/mænd i øverste ledelsesorgan", m.c9]])] } : { tables: [], omitted: "Afsnittet udelades, fordi der ikke er oplyst et ledelsesorgan." },
    } satisfies Previews);
  }
  return p;
}

/**
 * Lægger årets før ind som ekstra kolonne i nøgle/værdi-tabellerne (matchet på rækkens navn),
 * så man kan kommentere udviklingen. Tabeller med kolonneoverskrifter røres ikke.
 */
export function withPrevious(current: Previews, previous: Previews | null, years: { now: number; before: number } | null): Previews {
  if (!previous || !years) return current;
  const out: Previews = {};
  for (const [key, sec] of Object.entries(current) as [SectionKey, SectionPreview][]) {
    const prev = previous[key];
    out[key] = {
      ...sec,
      tables: sec.tables.map((t, i) => {
        const pt = prev?.tables[i];
        if (t.head || !pt || pt.head) return t;
        const lookup = new Map(pt.rows.map((r) => [r[0], r[1]]));
        return { ...t, head: ["", String(years.before), String(years.now)], rows: t.rows.map((r) => [r[0], lookup.get(r[0]) ?? "–", r[1]]) };
      }),
    };
  }
  return out;
}
