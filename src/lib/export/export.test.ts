import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { calcCompany, type CompanyInput } from "../calc/company";
import { consolidate } from "../calc/consolidate";
import type { FactorLookup } from "../calc/types";
import { fillEsgTemplate } from "./esg-template";
import { imageSize } from "./image-size";
import { buildExportModel, combineYesNo, splitAddress, type ExportCompany, type ExportInput } from "./model";

const template = readFileSync(path.join(process.cwd(), "templates/esg_skabelon_dansk.pptx"));
const noFactors: FactorLookup = () => undefined;

function company(id: string, name: string, extra: Partial<ExportCompany["modules"]> = {}, locations: ExportCompany["locations"] = []): ExportCompany {
  return {
    id,
    name,
    cvr: id === "a" ? "12345678" : "87654321",
    address: "Industrivej 4, 8000 Aarhus C",
    legalForm: "APS",
    naceCodes: ["25.62"],
    modules: {
      "company.general": { turnover: 50_000_000, balanceSheetTotal: 20_000_000, employeeUnit: "HEADCOUNT", employees: 30, hasCertification: "yes", certificationList: [{ name: "ISO 14001", issuer: "DNV", issued: "2025-03-01" }], productsServices: "Maskindele til fødevareindustrien.", markets: "B2B i Norden" },
      "company.workforce": {
        unit: "HEADCOUNT",
        employees: [
          { country: "Danmark", gender: "MALE", contract: "PERMANENT", count: 18 },
          { country: "Danmark", gender: "FEMALE", contract: "PERMANENT", count: 10 },
          { country: id === "b" ? "Sverige" : "Danmark", gender: "FEMALE", contract: "TEMPORARY", count: 2 },
        ],
        leavers: 3,
        employeesStart: 29,
        employeesEnd: 30,
        managementWomen: 2,
        managementMen: 3,
      },
      "company.policies": { climate_practice: "PUBLIC", climate_targets: "yes", climate_description: "Klimapolitik med mål om 50 % reduktion i 2030.", climate_responsible: "Direktionen", ownWorkforce_practice: id === "a" ? "INTERNAL" : "NO", ownWorkforce_targets: "no", usesCircularPrinciples: id === "a" ? "yes" : "no", circularDescription: "Reparation af returvarer." },
      "company.health": { recordableAccidents: 1, fatalitiesAccidents: 0, fatalitiesIllHealth: 0 },
      "company.pay": { allAboveMinWage: "YES", coveredByAgreement: 25, hoursMen: 30_000, hoursWomen: 20_000, trainingHoursMen: 300, trainingHoursWomen: 200, payGapRequired: "no" },
      "company.governance": { hadConvictions: "no", hasBoard: "yes", boardWomen: 1, boardMen: 3, activeInSectors: "no" },
      "company.humanRights": { hasHumanRightsPolicy: "yes", covChildLabour: "yes", covForcedLabour: "yes", covTrafficking: "yes", covDiscrimination: "yes", covAccidents: "yes", covOther: "no", hasGrievanceMechanism: "yes", incChildLabour: "no", incForcedLabour: "no", incTrafficking: "no", incDiscrimination: "no", incOther: "no", hasValueChainIncidents: "no" },
      "company.climate": {
        hasTargets: "yes",
        targets: [
          { scope: "S12", baseYear: 2023, baseValue: 120, targetYear: 2030, targetValue: 50, unit: "PCT", coverage: 100 },
          { scope: "S3", baseYear: 2023, baseValue: 900, targetYear: 2035, targetValue: 600, unit: "TCO2E" },
        ],
        targetActions: "Elbiler inden 2027\nVarmepumpe på lageret",
        hasTransitionPlan: "no",
        willAdoptPlan: "yes",
        adoptPlanWhen: "2027",
        hasClimateRisks: "yes",
        risks: [
          { riskType: "ACUTE", area: "ASSETS", description: "Skybrud på lageret", exposure: "HIGH", sensitivity: "MEDIUM", horizon: "MEDIUM", adaptation: "YES" },
          { riskType: "TRANSITION", area: "ACTIVITIES", description: "CO₂-afgift", exposure: "MEDIUM", sensitivity: "MEDIUM", horizon: "SHORT", adaptation: "NO" },
        ],
        riskAssessment: "Vurderet ud fra Klimaatlas og leverandørdialog.",
        financialImpacts: [{ riskType: "TRANSITION", description: "CO₂-afgift", impact: "Højere energiomkostninger", level: "MEDIUM", horizon: "SHORT" }],
      },
      "company.scope3": {
        includeScope3: "yes",
        cat1: "RELEVANT",
        cat11: "NOT_RELEVANT",
        exclusionReason: "Produkterne bruger ikke energi.",
        autoCategory3: "no",
        activities: [{ category: "1", description: "Stål", supplierT: 42.5 }],
        boundary: "Leverandørdata for de fem største leverandører.",
      },
      ...extra,
    },
    locations,
  };
}

const loc = (id: string, name: string, waste: unknown[] = []): ExportCompany["locations"][number] => ({
  id,
  name,
  address: `${name}vej 1, 7100 Vejle`,
  latitude: 55.7,
  longitude: 9.53,
  modules: {
    "location.waste": { householdOnly: "no", wasteRows: waste },
    "location.biodiversity": { nearSensitiveArea: id === "l1" ? "yes" : "no", sensitiveAreaName: "Natura 2000-område nr. 79", sensitiveAreaRelation: "NEAR", sealedAreaHa: 1.2 },
    "location.pollution": id === "l1" ? { reportingBasis: "MANDATORY", pollutants: [{ substance: "NOx", medium: "AIR", amountKg: 120 }] } : {},
    "location.local":
      id === "l1"
        ? {
            hasLocalInitiatives: "yes",
            localInitiatives: [{ topic: "climate", description: "Solceller på taget" }],
            hasClimateActions: "yes",
            climateActions: [{ action: "Varmepumpe erstatter gasfyr", reduction: 12, year: 2026 }],
            hasHazards: "yes",
            hazards: [{ hazard: "CLOUDBURST", exposure: "HIGH", sensitivity: "HIGH", horizon: "SHORT", adaptation: "Højvandsklapper" }],
          }
        : {},
  },
});

function input(companies: ExportCompany[], comprehensive: boolean): ExportInput {
  const parts = companies.map((c) => {
    const ci: CompanyInput = {
      modules: {
        general: c.modules["company.general"],
        workforce: c.modules["company.workforce"],
        health: c.modules["company.health"],
        pay: c.modules["company.pay"],
        governance: c.modules["company.governance"],
        scope3: c.modules["company.scope3"],
      },
      locations: c.locations.map((l) => ({ id: l.id, name: l.name, waste: l.modules["location.waste"] })),
    };
    return { companyId: c.id, name: c.name, result: calcCompany(ci, noFactors) };
  });
  return {
    reportName: "Koncernrapport 2026",
    organizationName: "Test Koncern",
    year: 2026,
    comprehensive,
    consolidated: companies.length > 1,
    approved: false,
    omissions: null,
    reportingCompanyId: companies[0].id,
    companies,
    group: consolidate(parts, { reportingCompanyId: companies[0].id }),
    factorNote: null,
  };
}

async function slideTexts(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const pres = await zip.file("ppt/presentation.xml")!.async("string");
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string");
  const ids = [...pres.matchAll(/<p:sldId [^>]*r:id="(rId\d+)"/g)].map((m) => m[1]);
  const target = (id: string) => rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))?.[1] ?? rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${id}"`))?.[1];
  return Promise.all(ids.map(async (id) => (await zip.file(`ppt/${target(id)}`)!.async("string")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")));
}

describe("eksportmodel", () => {
  it("kombinerer ja/nej på tværs af selskaber", () => {
    expect(combineYesNo([true, true])).toBe("Ja");
    expect(combineYesNo([false, null])).toBe("Nej");
    expect(combineYesNo([true, false, false])).toBe("Delvist (1 af 3 selskaber)");
    expect(combineYesNo([null])).toBeNull();
  });

  it("deler danske adresser op", () => {
    expect(splitAddress("Industrivej 4, 8000 Aarhus C")).toEqual({ street: "Industrivej 4", postal: "8000", city: "Aarhus C", country: "Danmark" });
    expect(splitAddress("Kungsgatan 1, Stockholm")).toMatchObject({ street: "Kungsgatan 1, Stockholm", postal: "" });
  });

  it("summerer og formaterer koncerntal", () => {
    const m = buildExportModel(input([company("a", "Moder ApS"), company("b", "Datter ApS")], true));
    expect(m.b1.subsidiaries).toEqual([{ name: "Datter ApS (CVR 87654321)", address: "Industrivej 4, 8000 Aarhus C" }]);
    expect(m.b1.turnover).toBe("100.000.000 kr.");
    expect(m.b8.total).toBe("60");
    expect(m.b8.otherCountries).toBe(true);
    expect(m.b2.rows.find((r) => r.key === "ownWorkforce")!.has).toBe("Delvist (1 af 2 selskaber)");
    expect(m.b7.circular).toBe("Delvist (1 af 2 selskaber)");
    expect(m.c1.products).toBe("Moder ApS: Maskindele til fødevareindustrien.\nDatter ApS: Maskindele til fødevareindustrien.");
  });
});

describe("PowerPoint-skabelon", () => {
  it("udfylder basismodul uden glemte pladsholdere og uden Udvidet Modul", async () => {
    const m = buildExportModel(input([company("a", "Solo ApS")], false));
    const { buffer, leftovers } = await fillEsgTemplate(template, m);
    expect(leftovers).toEqual([]);
    const texts = await slideTexts(buffer);
    expect(texts[0]).toContain("OPGØRELSE 2026 · UDKAST");
    expect(texts.some((t) => t.includes("Strategi: Forretningsmodel"))).toBe(false);
    expect(texts.some((t) => t.includes("Om denne ESG-skabelon"))).toBe(false);
    expect(texts.join(" ")).not.toContain("KLIK FOR AT INDSÆTTE FIRMANAVN");
    expect(texts.some((t) => t.includes("Oversigt over datterselskaber"))).toBe(false);
  });

  it("udfylder koncernrapport med Udvidet Modul og fortsætter lange tabeller", { timeout: 30_000 }, async () => {
    const many = Array.from({ length: 14 }, (_, i) => loc(`l${i + 1}`, `Lokation ${i + 1}`, [{ type: `Affald ${i}`, hazardous: i % 3 ? "NON_HAZARDOUS" : "HAZARDOUS", unit: "kg", generated: 1000 + i, recycled: 500 }]));
    const m = buildExportModel(input([company("a", "Moder ApS", {}, many), company("b", "Datter ApS")], true));
    const logoData = readFileSync(path.join(__dirname, "__fixtures__/logo.png"));
    const size = imageSize(logoData)!;
    expect(size).toEqual({ type: "png", width: 400, height: 120 });
    const { buffer, leftovers } = await fillEsgTemplate(template, m, { data: logoData, ext: "png", width: size.width, height: size.height });
    if (process.env.EXPORT_SAMPLE) writeFileSync(process.env.EXPORT_SAMPLE, buffer);
    expect(leftovers).toEqual([]);
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file(/ppt\/media\/export-image\d+\.png/).length).toBeGreaterThan(10);
    const texts = await slideTexts(buffer);
    const all = texts.join(" ");
    expect(all).toContain("Datter ApS (CVR 87654321)");
    expect(all).toContain("Lokation 14");
    expect(texts.some((t) => t.includes("– fortsat"))).toBe(true);
    expect(all).toContain("Natura 2000-område nr. 79");
    expect(all).toContain("NOx");
    // C3, C4, Scope 3 og lokale data
    expect(all).toContain("50 % reduktion i 2030");
    expect(all).toContain("Varmepumpe erstatter gasfyr");
    expect(all).toContain("Skybrud og ekstrem nedbør");
    expect(all).toContain("Vurderet ud fra Klimaatlas");
    expect(all).toContain("Højere energiomkostninger");
    expect(all).toContain("CO₂e-udledning i scope 3 (B3)");
    expect(all).toContain("Lokalt – Moder ApS – Lokation 1: Solceller på taget");
    // Scope 3 står lige efter scope 1 og 2
    const ghgIdx = texts.findIndex((t) => t.includes("pkt. 33"));
    expect(texts[ghgIdx + 1]).toContain("scope 3");
  });
});
