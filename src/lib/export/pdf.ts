import "server-only";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * PPTX → PDF med LibreOffice (headless), så PDF og PowerPoint altid er ens.
 * Stien kan sættes med SOFFICE_PATH; ellers prøves de almindelige installationssteder.
 */
const CANDIDATES = [
  process.env.SOFFICE_PATH,
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
  "/usr/lib/libreoffice/program/soffice",
  "/opt/libreoffice/program/soffice",
].filter((p): p is string => !!p);

export function sofficePath(): string | null {
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export class PdfUnavailableError extends Error {}

export async function pptxToPdf(pptx: Buffer, timeoutMs = 120_000): Promise<Buffer> {
  const soffice = sofficePath();
  if (!soffice) throw new PdfUnavailableError("LibreOffice er ikke installeret på serveren, så der kan ikke laves PDF.");
  const dir = await mkdtemp(path.join(tmpdir(), "esg-pdf-"));
  try {
    const input = path.join(dir, "rapport.pptx");
    await writeFile(input, pptx);
    // Hentes ved kørsel, så bundleren ikke prøver at spore det eksterne program (og dermed hele projektet)
    const { execFile } = process.getBuiltinModule("node:child_process");
    // LibreOffice fejler af og til ved første opstart af en ny profil – derfor ét nyt forsøg
    for (let attempt = 1; ; attempt++) {
      try {
        // Egen profil pr. forsøg, så samtidige konverteringer ikke låser hinanden
        const profile = pathToFileURL(path.join(dir, `profile-${attempt}`)).href;
        await new Promise<void>((resolve, reject) => {
          execFile(
            soffice,
            [`-env:UserInstallation=${profile}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", dir, input],
            { timeout: timeoutMs },
            (err) => (err ? reject(err) : resolve()),
          );
        });
        return await readFile(path.join(dir, "rapport.pdf"));
      } catch (e) {
        if (attempt >= 2) throw e;
        console.warn("[eksport] PDF-konvertering fejlede, prøver igen", e);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
