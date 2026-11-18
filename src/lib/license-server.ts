import "server-only";
import { db } from "./db";
import { env } from "./env";
import { afterFetch, EXTENSION, licensedUserCount, licenseValidity, needsRefresh, parseLicense, type FetchResult, type LicenseStatus, type StoredLicense } from "./license";

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
  // Svaret gælder alle koncerner med nøglen – fx slår en tilbagekaldelse igennem for dem alle med det samme
  await db.organization.updateMany({ where: { licenseKey: org.licenseKey }, data: fields });
  for (const o of await db.organization.findMany({ where: { licenseKey: org.licenseKey }, select: { id: true } })) lastAttempt.set(o.id, Date.now());
  const updated = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
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

/** Koncerner, der bruger nøglen */
export async function orgsWithKey(key: string | null): Promise<{ id: string; name: string }[]> {
  if (!key) return [];
  return db.organization.findMany({ where: { licenseKey: key }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

/**
 * Antal personer under licensens brugergrænse – samlet for alle koncerner med nøglen.
 * `orgId` medtages, også hvis den endnu ikke har nøglen (fx når en koncern skal kobles på).
 * `extraUserIds`/`extraEmails` er personer, der er ved at få adgang, så man kan regne "efter".
 */
export async function countLicensedUsers(key: string | null, opts: { orgId?: string; extraUserIds?: string[]; extraEmails?: string[] } = {}) {
  const orgIds = (await orgsWithKey(key)).map((o) => o.id);
  if (opts.orgId && !orgIds.includes(opts.orgId)) orgIds.push(opts.orgId);
  const [members, invites, extraUsers] = await Promise.all([
    db.membership.findMany({ where: { organizationId: { in: orgIds } }, distinct: ["userId"], select: { userId: true, user: { select: { email: true } } } }),
    db.invitation.findMany({ where: { organizationId: { in: orgIds }, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, distinct: ["email"], select: { email: true } }),
    opts.extraUserIds?.length ? db.user.findMany({ where: { id: { in: opts.extraUserIds } }, select: { id: true, email: true } }) : [],
  ]);
  return licensedUserCount(
    [...members.map((m) => ({ userId: m.userId, email: m.user.email })), ...extraUsers.map((u) => ({ userId: u.id, email: u.email }))],
    [...invites.map((i) => i.email), ...(opts.extraEmails ?? [])],
  );
}

/**
 * Ville handlingen bringe licensen over brugergrænsen? Kun nye personer tæller: er de allerede med
 * (i en af koncernerne med nøglen), ændrer tallet sig ikke.
 */
export async function exceedsUserLimit(
  license: { limitType: string | null; limit: number | null },
  key: string | null,
  opts: { orgId?: string; extraUserIds?: string[]; extraEmails?: string[] },
): Promise<boolean> {
  if (license.limitType !== "users" || license.limit === null) return false;
  const [before, after] = await Promise.all([countLicensedUsers(key, { orgId: opts.orgId && (await orgsWithKey(key)).some((o) => o.id === opts.orgId) ? opts.orgId : undefined }), countLicensedUsers(key, opts)]);
  return after > before && after > license.limit;
}
