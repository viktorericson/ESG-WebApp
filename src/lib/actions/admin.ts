"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminLog, isPlatformOwner, requirePlatformAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { afterFetch, LICENSE_MESSAGES, licenseValidity, normalizeKey, validKey, type StoredLicense } from "@/lib/license";
import { fetchLicense } from "@/lib/license-server";
import { startImpersonation } from "@/lib/session";
import { storage } from "@/lib/storage";
import { cvrSchema, emailSchema, fieldErrors, type ActionState } from "@/lib/validation";

/**
 * Handlinger i platformens admin-dashboard. Hver handling tjekker selv, at brugeren er
 * platformens ejer, og logges i AdminLog. Ændringer i en koncern logges også i koncernens
 * egen aktivitetslog, så kunden kan se dem.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ORG_ROLES = ["ORG_ADMIN", "VIEWER"] as const;

function refreshAdmin() {
  revalidatePath("/admin", "layout");
}

/** Koncernen må ikke stå uden koncernadmin */
async function wouldRemoveLastAdmin(membershipId: string) {
  const m = await db.membership.findUnique({ where: { id: membershipId } });
  if (!m || m.role !== "ORG_ADMIN") return false;
  const admins = await db.membership.count({ where: { organizationId: m.organizationId, role: "ORG_ADMIN" } });
  return admins <= 1;
}

/**
 * Retter navn og/eller e-mail. Formularer uden navnefelt (fx "Skift e-mail" på koncernsiden) lader navnet
 * være. Skifter e-mailen, logges brugeren ud overalt, da login-links nu går til den nye adresse.
 * Ejernes e-mail styres i miljøet og kan ikke ændres her.
 */
export async function updateUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const userId = str(fd, "userId");
  const parsed = emailSchema.safeParse(str(fd, "email"));
  if (!parsed.success) return { fieldErrors: { email: "Ugyldig e-mailadresse" } };
  const email = parsed.data;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Brugeren findes ikke." };
  const name = fd.has("name") ? str(fd, "name") || null : user.name;
  const emailChanged = email !== user.email;
  if (emailChanged && isPlatformOwner(user.email)) return { fieldErrors: { email: "Platformens ejere styres i PLATFORM_ADMIN_EMAILS, så deres e-mail ændres dér." } };
  if (emailChanged && isPlatformOwner(email)) return { fieldErrors: { email: "Adressen tilhører en af platformens ejere." } };
  if (emailChanged && (await db.user.findUnique({ where: { email } }))) {
    return { fieldErrors: { email: "Der findes allerede en bruger med den e-mailadresse." } };
  }
  await db.user.update({ where: { id: userId }, data: { name, email } });
  if (emailChanged && userId !== admin.id) await db.session.deleteMany({ where: { userId } });
  await adminLog({ actorId: admin.id, action: "user.update", targetType: "User", targetId: userId, data: { from: { name: user.name, email: user.email }, to: { name, email } } });
  if (emailChanged) {
    const orgs = await db.membership.findMany({ where: { userId }, distinct: ["organizationId"], select: { organizationId: true } });
    for (const { organizationId } of orgs) {
      await audit({ organizationId, userId: admin.id, action: "user.email", entityType: "User", entityId: userId, data: { from: user.email, to: email } });
    }
  }
  refreshAdmin();
  return { ok: emailChanged ? `E-mailen er ændret til ${email}. Brugeren logger ind med den nye adresse.` : "Brugeren er gemt." };
}

/** Giver eller fjerner platform-admin. Ejerne (miljøet) kan ikke ændres, og man kan ikke fjerne sig selv. */
export async function setPlatformAdmin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const userId = str(fd, "userId");
  const on = str(fd, "on") === "1";
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Brugeren findes ikke." };
  if (isPlatformOwner(user.email)) return { error: "Platformens ejere er altid admin (PLATFORM_ADMIN_EMAILS)." };
  if (!on && userId === admin.id) return { error: "Du kan ikke fjerne din egen admin-adgang." };
  if (on && user.disabledAt) return { error: "Ophæv spærringen, før brugeren gøres til admin." };
  if (user.platformAdmin === on) return { ok: "Uændret." };
  await db.user.update({ where: { id: userId }, data: { platformAdmin: on } });
  // En fjernet admin skal ikke beholde åbne admin-sider eller "log ind som"-sessioner
  if (!on) await db.session.deleteMany({ where: { OR: [{ userId }, { impersonatorId: userId }] } });
  await adminLog({ actorId: admin.id, action: on ? "user.admin.grant" : "user.admin.revoke", targetType: "User", targetId: userId, data: { email: user.email } });
  refreshAdmin();
  return { ok: on ? `${user.email} er nu platform-admin.` : `${user.email} er ikke længere platform-admin og er logget ud.` };
}

const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(200).optional(),
  organizationId: z.string().optional(),
  role: z.enum(ORG_ROLES).optional(),
});

/** Opretter en bruger (evt. med adgang til en koncern). Brugeren logger ind med login-link på sin mail. */
export async function createUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const parsed = createUserSchema.safeParse({ email: str(fd, "email"), name: str(fd, "name") || undefined, organizationId: str(fd, "organizationId") || undefined, role: str(fd, "role") || undefined });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { email, name, organizationId, role } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return { fieldErrors: { email: "Der findes allerede en bruger med den e-mailadresse." } };
  const org = organizationId ? await db.organization.findUnique({ where: { id: organizationId } }) : null;
  if (organizationId && !org) return { fieldErrors: { organizationId: "Vælg en koncern." } };

  const user = await db.user.create({ data: { email, name: name || null } });
  await adminLog({ actorId: admin.id, action: "user.create", targetType: "User", targetId: user.id, data: { email } });
  if (org) {
    const m = await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: role ?? "ORG_ADMIN" } });
    await audit({ organizationId: org.id, userId: admin.id, action: "membership.grant", entityType: "Membership", entityId: m.id, data: { email, role: m.role } });
  }
  refreshAdmin();
  redirect(`/admin/users/${user.id}`);
}

const createOrgSchema = z.object({
  orgName: z.string().trim().min(1, "Angiv koncernens navn"),
  companyName: z.string().trim().min(1, "Angiv moderselskabets navn"),
  cvr: cvrSchema,
  adminEmail: emailSchema.optional(),
});

/**
 * Opretter en koncern med moderselskab og evt. en koncernadmin (findes eller oprettes på mail).
 * Kræver installationen licens, kan nøglen angives nu; ellers er koncernen låst, til en nøgle sættes.
 */
export async function createOrganizationAsAdmin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const parsed = createOrgSchema.safeParse({ orgName: str(fd, "orgName"), companyName: str(fd, "companyName"), cvr: str(fd, "cvr"), adminEmail: str(fd, "adminEmail") || undefined });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { orgName, companyName, cvr, adminEmail } = parsed.data;

  let license = {};
  const rawKey = str(fd, "licenseKey");
  if (rawKey) {
    const key = normalizeKey(rawKey);
    if (!validKey(key)) return { fieldErrors: { licenseKey: LICENSE_MESSAGES.invalid_key } };
    if (await db.organization.findUnique({ where: { licenseKey: key }, select: { id: true } })) return { fieldErrors: { licenseKey: LICENSE_MESSAGES.in_use } };
    const result = await fetchLicense(key);
    if (!result.ok) return { fieldErrors: { licenseKey: LICENSE_MESSAGES[result.reason] } };
    const now = new Date();
    license = { licenseKey: key, ...afterFetch(result, now) };
    const valid = licenseValidity(license as StoredLicense, now);
    if (!valid.ok) return { fieldErrors: { licenseKey: LICENSE_MESSAGES[valid.reason] } };
  }

  const owner = adminEmail ? await db.user.upsert({ where: { email: adminEmail }, create: { email: adminEmail }, update: {} }) : null;
  const org = await db.organization.create({
    data: {
      ...license,
      name: orgName,
      companies: { create: { name: companyName, cvr } },
      ...(owner ? { memberships: { create: { userId: owner.id, role: "ORG_ADMIN" } } } : {}),
    },
  });
  await adminLog({ actorId: admin.id, action: "organization.create", targetType: "Organization", targetId: org.id, data: { name: orgName, admin: adminEmail ?? null } });
  await audit({ organizationId: org.id, userId: admin.id, action: "organization.create", entityType: "Organization", entityId: org.id });
  refreshAdmin();
  redirect(`/admin/organizations/${org.id}`);
}

/**
 * "Log ind som": admin ser og arbejder i appen som brugeren, fx for at hjælpe med at udfylde data.
 * Ikke muligt for andre admins, spærrede brugere eller én selv. Sessionen udløber efter kort tid.
 */
export async function impersonateUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const user = await db.user.findUnique({ where: { id: str(fd, "userId") } });
  if (!user) return { error: "Brugeren findes ikke." };
  if (user.id === admin.id) return { error: "Du er allerede logget ind som dig selv." };
  if (user.disabledAt) return { error: "Brugeren er spærret." };
  if (user.platformAdmin || isPlatformOwner(user.email)) return { error: "Du kan ikke logge ind som en anden admin." };
  await startImpersonation(admin.id, user.id);
  await adminLog({ actorId: admin.id, action: "user.impersonate", targetType: "User", targetId: user.id, data: { email: user.email } });
  const orgId = str(fd, "organizationId");
  redirect(orgId ? `/org/${orgId}` : "/");
}

export async function setUserDisabled(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const userId = str(fd, "userId");
  const disable = str(fd, "disable") === "1";
  if (userId === admin.id) return { error: "Du kan ikke spærre dig selv." };
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Brugeren findes ikke." };
  await db.user.update({ where: { id: userId }, data: { disabledAt: disable ? new Date() : null } });
  // En spærret bruger logges ud med det samme
  if (disable) await db.session.deleteMany({ where: { userId } });
  await adminLog({ actorId: admin.id, action: disable ? "user.disable" : "user.enable", targetType: "User", targetId: userId, data: { email: user.email } });
  refreshAdmin();
  return { ok: disable ? "Brugeren er spærret og logget ud." : "Spærringen er ophævet." };
}

export async function signOutUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const userId = str(fd, "userId");
  if (userId === admin.id) return { error: "Brug “Log ud” i menuen for at logge dig selv ud." };
  const { count } = await db.session.deleteMany({ where: { userId } });
  await adminLog({ actorId: admin.id, action: "user.signOut", targetType: "User", targetId: userId, data: { sessions: count } });
  refreshAdmin();
  return { ok: count ? `Logget ud fra ${count} ${count === 1 ? "session" : "sessioner"}.` : "Brugeren var ikke logget ind." };
}

export async function setMembershipRole(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const role = z.enum(ORG_ROLES).safeParse(str(fd, "role"));
  if (!role.success) return { error: "Ugyldig rolle." };
  const m = await db.membership.findUnique({ where: { id: str(fd, "membershipId") } });
  if (!m) return { error: "Adgangen findes ikke." };
  // Kun adgange til hele koncernen kan skifte mellem koncernadmin og læser
  if (m.companyId || m.locationId || !ORG_ROLES.includes(m.role as (typeof ORG_ROLES)[number])) {
    return { error: "Rollen kan kun skiftes for adgange til hele koncernen." };
  }
  if (m.role === role.data) return { ok: "Uændret." };
  if (await wouldRemoveLastAdmin(m.id)) return { error: "Koncernen skal have mindst én koncernadmin." };
  const clash = await db.membership.findFirst({ where: { userId: m.userId, organizationId: m.organizationId, role: role.data, companyId: null, locationId: null } });
  if (clash) await db.membership.delete({ where: { id: m.id } });
  else await db.membership.update({ where: { id: m.id }, data: { role: role.data } });
  await adminLog({ actorId: admin.id, action: "membership.role", targetType: "Membership", targetId: m.id, data: { userId: m.userId, organizationId: m.organizationId, from: m.role, to: role.data } });
  await audit({ organizationId: m.organizationId, userId: admin.id, action: "membership.role", entityType: "Membership", entityId: m.id, data: { from: m.role, to: role.data } });
  refreshAdmin();
  return { ok: "Rollen er ændret." };
}

export async function removeMembership(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const m = await db.membership.findUnique({ where: { id: str(fd, "membershipId") } });
  if (!m) return { error: "Adgangen findes ikke." };
  if (await wouldRemoveLastAdmin(m.id)) return { error: "Koncernen skal have mindst én koncernadmin." };
  await db.membership.delete({ where: { id: m.id } });
  await adminLog({ actorId: admin.id, action: "membership.remove", targetType: "Membership", targetId: m.id, data: { userId: m.userId, organizationId: m.organizationId, role: m.role } });
  await audit({ organizationId: m.organizationId, userId: admin.id, action: "membership.remove", entityType: "Membership", entityId: m.id, data: { userId: m.userId, role: m.role } });
  refreshAdmin();
  return { ok: "Adgangen er fjernet." };
}

/** Giver en bruger adgang til hele en koncern – fx platformens ejer selv, ved support */
export async function grantOrgAccess(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const role = z.enum(ORG_ROLES).safeParse(str(fd, "role"));
  if (!role.success) return { error: "Vælg en rolle." };
  const userId = str(fd, "userId") || admin.id;
  const organizationId = str(fd, "organizationId");
  const [user, org] = await Promise.all([db.user.findUnique({ where: { id: userId } }), db.organization.findUnique({ where: { id: organizationId } })]);
  if (!user || !org) return { error: "Vælg en koncern." };
  const exists = await db.membership.findFirst({ where: { userId, organizationId, role: role.data, companyId: null, locationId: null } });
  if (exists) return { ok: "Brugeren har allerede den adgang." };
  const m = await db.membership.create({ data: { userId, organizationId, role: role.data } });
  await adminLog({ actorId: admin.id, action: "membership.grant", targetType: "Membership", targetId: m.id, data: { userId, organizationId, role: role.data } });
  await audit({ organizationId, userId: admin.id, action: "membership.grant", entityType: "Membership", entityId: m.id, data: { email: user.email, role: role.data } });
  refreshAdmin();
  return { ok: `${user.email} har nu adgang til ${org.name}.` };
}

export async function deleteAttachment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const att = await db.attachment.findUnique({ where: { id: str(fd, "attachmentId") }, include: { moduleData: { include: { company: true } } } });
  if (!att) return { error: "Filen findes ikke." };
  await db.attachment.delete({ where: { id: att.id } });
  await storage.delete(att.storageKey);
  await adminLog({ actorId: admin.id, action: "attachment.delete", targetType: "Attachment", targetId: att.id, data: { filename: att.filename, company: att.moduleData.company.name } });
  await audit({ organizationId: att.moduleData.company.organizationId, userId: admin.id, action: "attachment.delete", entityType: "Attachment", entityId: att.id, data: { name: att.filename } });
  refreshAdmin();
  return { ok: "Filen er slettet." };
}
