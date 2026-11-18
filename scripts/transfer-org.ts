/**
 * Eksport og import af en hel koncern fra kommandolinjen – samme format som "Eksportér koncern" og
 * "Importér koncern" i platform-admin (/admin/organizations).
 *
 *   npx tsx --conditions=react-server scripts/transfer-org.ts export <koncern-id> <fil.zip>
 *   npx tsx --conditions=react-server scripts/transfer-org.ts inspect <fil.zip>
 *   npx tsx --conditions=react-server scripts/transfer-org.ts import <fil.zip> [nyt navn]
 *
 * --conditions=react-server er nødvendig, fordi modulerne er markeret "server-only".
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { exportOrganization, importOrganization, inspectBundle } from "../src/lib/org-transfer";

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "export" && a && b) {
    const { buffer, summary } = await exportOrganization(a);
    await writeFile(b, buffer);
    console.log(`Gemt ${b} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`, summary);
  } else if (cmd === "inspect" && a) {
    console.log(await inspectBundle(await readFile(a)));
  } else if (cmd === "import" && a) {
    const { organizationId, summary } = await importOrganization(await readFile(a), { name: b });
    console.log(`Importeret som koncern ${organizationId}`, summary);
  } else {
    console.error("Brug: transfer-org.ts export <koncern-id> <fil.zip> | inspect <fil.zip> | import <fil.zip> [navn]");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
