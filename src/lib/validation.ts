import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Ugyldig e-mailadresse"));

export const cvrSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{8}$/, "CVR-nummer skal være 8 cifre"));

export const legalForms = ["PMV", "ENKELTMAND", "IS", "APS", "AS", "KS", "ANDET"] as const;
export const LEGAL_FORM_LABELS: Record<(typeof legalForms)[number], string> = {
  PMV: "Personligt ejet mindre virksomhed (PMV)",
  ENKELTMAND: "Enkeltmandsvirksomhed",
  IS: "Interessentskab (I/S)",
  APS: "Anpartsselskab (ApS)",
  AS: "Aktieselskab (A/S)",
  KS: "Kommanditselskab (K/S)",
  ANDET: "Andet",
};

export const companySchema = z.object({
  name: z.string().trim().min(1, "Angiv selskabets navn"),
  cvr: cvrSchema,
  address: optionalText,
  legalForm: z
    .enum(legalForms)
    .or(z.literal("").transform(() => null))
    .nullable()
    .optional(),
  naceCodes: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  parentId: optionalText,
  consolidate: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export const locationControls = ["EJER", "LEJER", "DRIVER"] as const;
export const LOCATION_CONTROL_LABELS: Record<(typeof locationControls)[number], string> = {
  EJER: "Ejer",
  LEJER: "Lejer",
  DRIVER: "Driver/forvalter",
};

/** Tomt felt → null, ellers tal (accepterer dansk decimalkomma) */
const optionalNumber = (min: number, max: number, msg: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = (v ?? "").trim().replace(",", ".");
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: msg });
        return z.NEVER;
      }
      return n;
    });

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Ugyldig dato");

export const locationSchema = z
  .object({
    name: z.string().trim().min(1, "Angiv lokationens type/navn"),
    address: z.string().trim().min(1, "Angiv adresse"),
    function: optionalText,
    control: z.enum(locationControls),
    latitude: optionalNumber(-90, 90, "Breddegrad skal være mellem -90 og 90"),
    longitude: optionalNumber(-180, 180, "Længdegrad skal være mellem -180 og 180"),
    operationalFrom: optionalDate,
    operationalTo: optionalDate,
  })
  .refine((l) => (l.latitude === null) === (l.longitude === null), {
    message: "Angiv både bredde- og længdegrad",
    path: ["longitude"],
  })
  .refine((l) => !l.operationalFrom || !l.operationalTo || l.operationalTo >= l.operationalFrom, {
    message: "Slutdato skal ligge efter startdato",
    path: ["operationalTo"],
  });

export const periodSchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((p) => p.endDate > p.startDate, { message: "Slutdato skal ligge efter startdato", path: ["endDate"] });

export const reportModules = ["BASIC", "BASIC_AND_COMPREHENSIVE"] as const;
export const REPORT_MODULE_LABELS: Record<(typeof reportModules)[number], string> = {
  BASIC: "Basismodul (B1–B11)",
  BASIC_AND_COMPREHENSIVE: "Basismodul + Udvidet Modul (B + C1–C9)",
};
export const reportBases = ["CONSOLIDATED", "INDIVIDUAL"] as const;
export const REPORT_BASIS_LABELS: Record<(typeof reportBases)[number], string> = {
  CONSOLIDATED: "Konsolideret (moderselskab + datterselskaber)",
  INDIVIDUAL: "Individuel (kun ét selskab)",
};
export const reportStatuses = ["DRAFT", "IN_REVIEW", "APPROVED"] as const;
export const REPORT_STATUS_LABELS: Record<(typeof reportStatuses)[number], string> = {
  DRAFT: "Under udarbejdelse",
  IN_REVIEW: "Til gennemgang",
  APPROVED: "Godkendt",
};

export const reportSchema = z.object({
  name: z.string().trim().min(1, "Giv rapporten et navn"),
  module: z.enum(reportModules),
  basis: z.enum(reportBases),
  reportingCompanyId: z.string().min(1, "Vælg det rapporterende selskab"),
  omissions: optionalText,
  consolidatedTurnover: optionalNumber(0, 1e15, "Angiv omsætningen i kr. som et positivt tal"),
});

export const roles = ["ORG_ADMIN", "COMPANY_MANAGER", "LOCATION_CONTRIBUTOR", "VIEWER"] as const;

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(roles),
  companyId: optionalText,
  locationId: optionalText,
});

/** Første fejlbesked pr. felt, til visning i formularer */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}

export type ActionState = {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  devLink?: string;
};
