import "server-only";
import { db } from "./db";
import { env } from "./env";
import { afterFetch, EXTENSION, licenseValidity, needsRefresh, parseLicense, type FetchResult, type LicenseStatus, type StoredLicense } from "./license";

/** Slår en nøgle op hos licensserveren */
export async function fetchLicense(key: string, fetchFn: typeof fetch = fetch): Promise<FetchResult> {
  // Som Capanas extensions: extension-licenser slås op uden ?type
  const query = env.licenseType === EXTENSION ? "" : `?type=${encodeURIComponent(env.licenseType)}`;
  const url = `${env.licenseServerUrl}/license/${encodeURIComponent(key)}${query}`;
  let res: Response;
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch (e) {
    console.warn(`[licens] Licensserveren kunne ikke nås: ${e instanceof Error ? e.message : e}`);
    return { ok: false, reason: "unreachable" };
  }
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) {
    console.warn(`[licens] Licensserveren svarede HTTP ${res.status}`);
    return { ok: false, reason: "unreachable" };
  }
  const body = await res.json().catch(() => null);
  // Ældre licensservere svarer 200 med { code: 404 } for ukendte nøgler
  if (body && typeof body === "object" && (body as { code?: unknown }).code === 404) return { ok: false, reason: "not_found" };
  return parseLicense(body, key, env.licenseType);
}

/** Sidste forsøg pr. koncern, så en nede licensserver ikke tjekkes ved hver sidevisning */
const lastAttempt = new Map<string, number>();
const RETRY_MS = 5 * 60 * 1000;

type OrgLicense = StoredLicense & { id: string };

/** Tjekker licensen med serveren nu og gemmer svaret */
export async function refreshLicense(org: OrgLicense): Promise<LicenseStatus> {
  if (!org.licenseKey) return licenseValidity(org, new Date());
  lastAttempt.set(org.id, Date.now());
  const now = new Date();
  const fields = afterFetch(await fetchLicense(org.licenseKey), now);
  const updated = await db.organization.update({ where: { id: org.id }, data: fields });
  return licenseValidity(updated, now);
}

/**
 * Koncernens licensstatus. Tjekker med serveren, når det seneste tjek er over en time gammelt
 * (højst hvert 5. minut, hvis serveren ikke svarer). Uden LICENSE_REQUIRED er alle koncerner gyldige.
 */
export async function orgLicenseStatus(org: OrgLicense): Promise<LicenseStatus | null> {
  if (!env.licenseRequired) return null;
  const now = new Date();
  const recentlyTried = Date.now() - (lastAttempt.get(org.id) ?? 0) < RETRY_MS;
  if (needsRefresh(org, now) && !recentlyTried) return refreshLicense(org);
  return licenseValidity(org, now);
}

/** Antal brugere, der tæller med under en brugergrænse: medlemmer plus åbne invitationer */
export async function countLicensedUsers(orgId: string) {
  const [members, invites] = await Promise.all([
    db.membership.findMany({ where: { organizationId: orgId }, distinct: ["userId"], select: { userId: true } }),
    db.invitation.findMany({ where: { organizationId: orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, distinct: ["email"], select: { email: true } }),
  ]);
  return members.length + invites.length;
}
