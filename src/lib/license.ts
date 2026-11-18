/**
 * Capana-licens – rene funktioner (ingen I/O), så de kan enhedstestes.
 *
 * Hver koncern har én licensnøgle, som tjekkes mod licensserveren (capana-license-backend):
 *   GET <LICENSE_SERVER_URL>/license/<nøgle>            – extension-licenser (standard)
 *   GET <LICENSE_SERVER_URL>/license/<nøgle>?type=<type> – andre typer, fx "mcp"
 * En extension-licens svarer { _id, expires (ms) } uden type; andre typer { _id, type, expires, limitType, limit }.
 * Ukendte, tilbagekaldte og nøgler af en anden type giver 404.
 *
 * Det seneste gyldige svar gemmes på koncernen. Kan serveren ikke nås, bruges det i højst 7 dage;
 * en nøgle, serveren ikke kender (tilbagekaldt), gælder med det samme.
 */

/** Licenstypen, som licensserveren bruger, når en licens ikke har en type */
export const EXTENSION = "extension";

export const MAX_OFFLINE_MS = 7 * 24 * 3600 * 1000;
/** Hvor ofte en gyldig licens tjekkes igen */
export const REFRESH_MS = 3600 * 1000;

export type LicenseInfo = { limitType: string | null; limit: number | null; expiresAt: Date };

export type LicenseReason = "no_key" | "invalid_key" | "not_found" | "wrong_type" | "unreachable" | "invalid_response" | "expired" | "unverified" | "in_use";

export type FetchResult = { ok: true; license: LicenseInfo } | { ok: false; reason: LicenseReason };

/** Felterne, som gemmes på koncernen */
export type StoredLicense = {
  licenseKey: string | null;
  licenseLimitType: string | null;
  licenseLimit: number | null;
  licenseExpiresAt: Date | null;
  licenseCheckedAt: Date | null;
  licenseError: string | null;
};

export type LicenseStatus = { ok: true; license: LicenseInfo } | { ok: false; reason: LicenseReason };

export const LICENSE_MESSAGES: Record<LicenseReason, string> = {
  no_key: "Koncernen har ingen licensnøgle.",
  invalid_key: "Licensnøglen har et ugyldigt format. Den består af 8–64 bogstaver, tal, - og _.",
  not_found: "Licensnøglen findes ikke eller er tilbagekaldt.",
  wrong_type: "Nøglen er ikke en licens til esgBRICKS.",
  unreachable: "Licensserveren kunne ikke nås. Prøv igen om lidt.",
  invalid_response: "Licensserveren svarede uventet. Kontakt Capana.",
  expired: "Licensen er udløbet.",
  unverified: "Licensen er ikke bekræftet endnu.",
  in_use: "Licensnøglen bruges allerede af en anden koncern.",
};

export const normalizeKey = (key: unknown) => (typeof key === "string" ? key.trim() : "");

export const validKey = (key: string) => /^[A-Za-z0-9_-]{8,64}$/.test(key);

/** Nøglen med alt undtagen de første 4 tegn skjult */
export const maskKey = (key: string | null) => (key ? key.slice(0, 4) + "•".repeat(Math.max(key.length - 4, 4)) : null);

/** Tolker licensserverens svar på et opslag af `key` */
export function parseLicense(body: unknown, key: string, type: string): FetchResult {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid_response" };
  const b = body as Record<string, unknown>;
  if (b._id !== key) return { ok: false, reason: "invalid_response" };
  // Licensserveren udelader typen for extension-licenser
  if ((b.type ?? EXTENSION) !== type) return { ok: false, reason: "wrong_type" };
  const expires = typeof b.expires === "string" && /^\d+$/.test(b.expires) ? Number(b.expires) : b.expires;
  if (typeof expires !== "number" || !Number.isFinite(expires)) return { ok: false, reason: "invalid_response" };
  const limit = b.limit === undefined || b.limit === null ? null : b.limit;
  if (limit !== null && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0)) return { ok: false, reason: "invalid_response" };
  const limitType = typeof b.limitType === "string" ? b.limitType : null;
  return { ok: true, license: { limitType, limit: limit as number | null, expiresAt: new Date(expires) } };
}

/** Er koncernens licens gyldig lige nu, ud fra det gemte svar? */
export function licenseValidity(s: StoredLicense, now: Date): LicenseStatus {
  if (!s.licenseKey) return { ok: false, reason: "no_key" };
  if (!s.licenseExpiresAt || !s.licenseCheckedAt) return { ok: false, reason: (s.licenseError as LicenseReason | null) ?? "unverified" };
  if (s.licenseExpiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (now.getTime() - s.licenseCheckedAt.getTime() > MAX_OFFLINE_MS) return { ok: false, reason: "unreachable" };
  return { ok: true, license: { limitType: s.licenseLimitType, limit: s.licenseLimit, expiresAt: s.licenseExpiresAt } };
}

/** Skal licensen tjekkes med serveren igen? */
export const needsRefresh = (s: StoredLicense, now: Date) => !!s.licenseKey && (!s.licenseCheckedAt || now.getTime() - s.licenseCheckedAt.getTime() > REFRESH_MS);

/** Felterne, der skal gemmes efter et opslag. Ved "kan ikke nås" bevares det seneste gyldige svar. */
export function afterFetch(result: FetchResult, now: Date): Partial<StoredLicense> {
  if (result.ok) {
    return {
      licenseLimitType: result.license.limitType,
      licenseLimit: result.license.limit,
      licenseExpiresAt: result.license.expiresAt,
      licenseCheckedAt: now,
      licenseError: null,
    };
  }
  if (result.reason === "unreachable") return { licenseError: "unreachable" };
  // Ukendt, tilbagekaldt eller forkert type: glem det gemte svar med det samme
  return { licenseLimitType: null, licenseLimit: null, licenseExpiresAt: null, licenseCheckedAt: null, licenseError: result.reason };
}

/** Er der plads til endnu en bruger under licensens grænse? (kun ved limitType "users") */
export function userLimitReached(license: LicenseInfo, users: number) {
  return license.limitType === "users" && license.limit !== null && users >= license.limit;
}

/** Udløbsdatoen, hvis en gyldig licens udløber inden for `days` dage – ellers null */
export function expiringSoon(status: LicenseStatus | null, days = 30, now = new Date()): Date | null {
  if (!status?.ok) return null;
  return status.license.expiresAt.getTime() - now.getTime() < days * 86_400_000 ? status.license.expiresAt : null;
}
