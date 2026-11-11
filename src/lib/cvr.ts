import type { legalForms } from "@/lib/validation";

/** Stamdata hentet fra CVR, klar til at forudfylde selskabsformularen. */
export type CvrCompany = {
  cvr: string;
  name: string;
  address: string | null;
  legalForm: (typeof legalForms)[number];
  naceCodes: string[];
  /** Selskabet er ophørt ifølge CVR */
  ended: boolean;
};

/** En aktiv produktionsenhed (P-enhed), som kan foreslås som lokation. */
export type CvrUnit = { pno: string; name: string; address: string; function: string | null; main: boolean };

export type CvrUnitsResult = { ok: true; units: CvrUnit[] } | { ok: false; error: string };

export type CvrResult = { ok: true; company: CvrCompany } | { ok: false; error: string };

/** Erhvervsstyrelsens virksomhedsformkoder → appens juridiske former */
const LEGAL_FORM_BY_CODE: Record<number, CvrCompany["legalForm"]> = {
  10: "ENKELTMAND",
  15: "PMV",
  30: "IS",
  40: "KS",
  60: "AS",
  80: "APS",
};

/** Dansk branchekode (6 cifre, fx 212000) → NACE-kode (de fire første cifre, fx "21.20") */
export function naceFromIndustryCode(code: unknown): string | null {
  if (typeof code !== "number" && typeof code !== "string") return null;
  const digits = String(code).replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 6) return null;
  const padded = digits.padStart(6, "0");
  return `${padded.slice(0, 2)}.${padded.slice(2, 4)}`;
}

const ERRORS: Record<string, string> = {
  NOT_FOUND: "Der blev ikke fundet et selskab med dette CVR-nummer.",
  QUOTA_EXCEEDED: "Dagens kvote for CVR-opslag er brugt. Udfyld felterne manuelt, eller prøv igen i morgen.",
};
const UNAVAILABLE = "CVR-opslaget er ikke tilgængeligt lige nu. Udfyld felterne manuelt.";

function formatAddress(r: Record<string, unknown>): string | null {
  const street = typeof r.address === "string" ? r.address.trim() : "";
  const town = [r.zipcode, r.city].filter((v) => typeof v === "string" && v).join(" ");
  return [street, town].filter(Boolean).join(", ") || null;
}

/** Sammenligningsnøgle for adresser: uden store bogstaver, tegnsætning og mellemrum */
export function addressKey(address: string): string {
  return address.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Uddrager de aktive P-enheder med adresse fra et svar fra cvrapi.dk. Hovedenheden står først. */
export function mapCvrApiUnits(json: unknown): CvrUnitsResult {
  const base = mapCvrApiResponse(json);
  if (!base.ok) return base;
  const raw = (json as Record<string, unknown>).productionunits;
  const units: CvrUnit[] = [];
  for (const u of Array.isArray(raw) ? raw : []) {
    if (!u || typeof u !== "object") continue;
    const r = u as Record<string, unknown>;
    const address = formatAddress(r);
    if (!address || r.pno == null || (typeof r.enddate === "string" && r.enddate !== "")) continue;
    units.push({
      pno: String(r.pno),
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : base.company.name,
      address,
      function: typeof r.industrydesc === "string" && r.industrydesc.trim() ? r.industrydesc.trim() : null,
      main: r.main === true,
    });
  }
  units.sort((a, b) => Number(b.main) - Number(a.main) || a.address.localeCompare(b.address, "da"));
  return { ok: true, units };
}

/** Oversætter et svar fra cvrapi.dk til appens stamdata. */
export function mapCvrApiResponse(json: unknown): CvrResult {
  if (!json || typeof json !== "object") return { ok: false, error: UNAVAILABLE };
  const r = json as Record<string, unknown>;
  if (typeof r.error === "string") return { ok: false, error: ERRORS[r.error] ?? UNAVAILABLE };
  if (typeof r.name !== "string" || r.vat == null) return { ok: false, error: UNAVAILABLE };

  const address = formatAddress(r);
  const nace = naceFromIndustryCode(r.industrycode);

  return {
    ok: true,
    company: {
      cvr: String(r.vat),
      name: r.name.trim(),
      address,
      legalForm: LEGAL_FORM_BY_CODE[Number(r.companycode)] ?? "ANDET",
      naceCodes: nace ? [nace] : [],
      ended: typeof r.enddate === "string" && r.enddate !== "",
    },
  };
}

async function fetchCvrApi(cvr: string): Promise<unknown> {
  try {
    const res = await fetch(`https://cvrapi.dk/api?country=dk&vat=${cvr}`, {
      headers: { "User-Agent": process.env.CVR_USER_AGENT ?? "esg-webapp" },
      signal: AbortSignal.timeout(8000),
    });
    return await res.json();
  } catch {
    return null;
  }
}

/** Slår et selskab op i CVR via cvrapi.dk. cvr skal være valideret (8 cifre). */
export async function lookupCvr(cvr: string): Promise<CvrResult> {
  return mapCvrApiResponse(await fetchCvrApi(cvr));
}

/** Henter selskabets aktive P-enheder fra CVR via cvrapi.dk. */
export async function lookupCvrUnits(cvr: string): Promise<CvrUnitsResult> {
  return mapCvrApiUnits(await fetchCvrApi(cvr));
}
