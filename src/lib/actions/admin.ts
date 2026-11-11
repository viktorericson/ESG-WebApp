"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminLog, requirePlatformAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { emailSchema, type ActionState } from "@/lib/validation";

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

export async function updateUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const userId = str(fd, "userId");
  const name = str(fd, "name") || null;
  const parsed = emailSchema.safeParse(str(fd, "email"));
  if (!parsed.success) return { fieldErrors: { email: "Ugyldig e-mailadresse" } };
  const email = parsed.data;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Brugeren findes ikke." };
  if (email !== user.email && (await db.user.findUnique({ where: { email } }))) {
    return { fieldErrors: { email: "Der findes allerede en bruger med den e-mailadresse." } };
  }
  await db.user.update({ where: { id: userId }, data: { name, email } });
  await adminLog({ actorId: admin.id, action: "user.update", targetType: "User", targetId: userId, data: { from: { name: user.name, email: user.email }, to: { name, email } } });
  refreshAdmin();
  return { ok: "Brugeren er gemt." };
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
