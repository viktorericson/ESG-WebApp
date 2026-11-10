/**
 * Importerer Klimakompassets emissionsfaktorark (Energistyrelsen) som et globalt faktorsæt.
 *
 *   npm run factors:import -- <fil.xlsx> [--version "2024 v5"] [--default]
 *
 * Kun danske faktorer importeres. Findes et sæt med samme navn og version, erstattes dets faktorer.
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const NAME = "Klimakompasset";
const SOURCE_URL = "https://ens.dk/analyser-og-statistik/beregning-af-klimaaftryk";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const clean = (v: unknown) =>
  v === null || v === undefined ? null : String(typeof v === "object" && v && "result" in v ? (v as { result: unknown }).result : v).replace(/ /g, " ").replace(/\s+/g, " ").trim() || null;

const num = (v: unknown) => {
  const raw = typeof v === "object" && v && "result" in v ? (v as { result: unknown }).result : v;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
};

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Angiv stien til xlsx-filen");
  const version = arg("--version") ?? "2024 v5";
  const makeDefault = process.argv.includes("--default");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  type Row = { year: number; key: string; mainCategory: string; category: string; parameter1: string | null; parameter2: string | null; unit: string; scope1: number; scope2: number; scope3: number; outsideScopes: number; source: string | null };
  const rows: Row[] = [];

  for (const ws of wb.worksheets) {
    const m = /^(\d{4})v\d+$/.exec(ws.name.trim());
    if (!m) continue;
    const year = Number(m[1]);
    const seen = new Set<string>();
    ws.eachRow((row, i) => {
      if (i <= 10) return; // header på række 10
      const key = clean(row.getCell(2).value);
      const land = clean(row.getCell(12).value);
      if (!key || land !== "Danmark") return;
      const normalizedKey = key.replace(/\s/g, "");
      if (seen.has(normalizedKey)) return;
      seen.add(normalizedKey);
      rows.push({
        year,
        key: normalizedKey,
        mainCategory: clean(row.getCell(3).value) ?? "",
        category: clean(row.getCell(4).value) ?? "",
        parameter1: clean(row.getCell(5).value),
        parameter2: clean(row.getCell(6).value),
        unit: clean(row.getCell(7).value) ?? "",
        scope1: num(row.getCell(8).value),
        scope2: num(row.getCell(9).value),
        scope3: num(row.getCell(10).value),
        outsideScopes: num(row.getCell(11).value),
        source: clean(row.getCell(13).value),
      });
    });
  }
  if (rows.length === 0) throw new Error("Ingen faktorer fundet – er det det rigtige ark?");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const existing = await db.factorSet.findFirst({ where: { name: NAME, version, organizationId: null } });
    const hasDefault = (await db.factorSet.count({ where: { isDefault: true, organizationId: null } })) > 0;
    const set =
      existing ??
      (await db.factorSet.create({
        data: {
          name: NAME,
          version,
          description: "Klimakompassets emissionsfaktorer (Energistyrelsen). GWP: IPCC AR6.",
          sourceUrl: SOURCE_URL,
          isDefault: makeDefault || !hasDefault,
        },
      }));
    if (makeDefault) {
      await db.factorSet.updateMany({ where: { organizationId: null, NOT: { id: set.id } }, data: { isDefault: false } });
      await db.factorSet.update({ where: { id: set.id }, data: { isDefault: true } });
    }
    await db.emissionFactor.deleteMany({ where: { setId: set.id } });
    for (let i = 0; i < rows.length; i += 1000) {
      await db.emissionFactor.createMany({ data: rows.slice(i, i + 1000).map((r) => ({ ...r, setId: set.id })) });
    }
    const years = [...new Set(rows.map((r) => r.year))].sort();
    console.log(`Importeret ${rows.length} faktorer for ${years[0]}–${years.at(-1)} i "${NAME} ${version}" (${set.id})${set.isDefault || makeDefault ? " – standardsæt" : ""}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
