"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrgAccess, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env, showDevLinks } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { ROLE_LABELS, validParentIds } from "@/lib/permissions";
import { createSession } from "@/lib/session";
import { createDefaultReport } from "@/lib/reports";
import { generateToken, hashToken } from "@/lib/tokens";
import {
  companySchema,
  cvrSchema,
  fieldErrors,
  inviteSchema,
  locationSchema,
  periodSchema,
  type ActionState,
} from "@/lib/validation";

const INVITE_DAYS = 14;
const NO_ACCESS: ActionState = { error: "Du har ikke adgang til at udføre denne handling." };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}

function refresh(orgId: string) {
  revalidatePath(`/org/${orgId}`, "layout");
}

// ---------- Organisation ----------

const createOrgSchema = z.object({
  orgName: z.string().trim().min(1, "Angiv koncernens navn"),
  companyName: z.string().trim().min(1, "Angiv moderselskabets navn"),
  cvr: cvrSchema,
});

export async function createOrganization(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!env.allowSignup) return { error: "Oprettelse af nye koncerner er slået fra. Bed om en invitation." };

  const parsed = createOrgSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { orgName, companyName, cvr } = parsed.data;

  const org = await db.organization.create({
    data: {
      name: orgName,
      memberships: { create: { userId: user.id, role: "ORG_ADMIN" } },
      companies: { create: { name: companyName, cvr } },
    },
  });
  await audit({ organizationId: org.id, userId: user.id, action: "organization.create", entityType: "Organization", entityId: org.id });
  redirect(`/org/${org.id}`);
}

export async function renameOrganization(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const name = str(fd, "name").trim();
  if (!name) return { fieldErrors: { name: "Angiv et navn" } };
  await db.organization.update({ where: { id: orgId }, data: { name } });
  await audit({ organizationId: orgId, userId: user.id, action: "organization.rename", entityType: "Organization", entityId: orgId, data: { name } });
  refresh(orgId);
  return { ok: "Navnet er gemt." };
}

// ---------- Selskaber ----------

async function checkParent(orgId: string, companyId: string | null, parentId: string | null | undefined) {
  if (!parentId) return true;
  const companies = await db.company.findMany({ where: { organizationId: orgId, archivedAt: null }, select: { id: true, parentId: true } });
  return validParentIds(companies, companyId).has(parentId);
}

export async function createCompany(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;

  const parsed = companySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const data = parsed.data;
  if (!(await checkParent(orgId, null, data.parentId))) return { fieldErrors: { parentId: "Ugyldigt moderselskab" } };
  if (await db.company.findUnique({ where: { organizationId_cvr: { organizationId: orgId, cvr: data.cvr } } })) {
    return { fieldErrors: { cvr: "Et selskab med dette CVR-nummer findes allerede" } };
  }

  const company = await db.company.create({ data: { ...data, organizationId: orgId } });
  await audit({ organizationId: orgId, userId: user.id, action: "company.create", entityType: "Company", entityId: company.id, data: { name: data.name, cvr: data.cvr } });
  refresh(orgId);
  redirect(`/org/${orgId}/companies/${company.id}`);
}

export async function updateCompany(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const companyId = str(fd, "companyId");
  const { user, access } = await requireOrgAccess(orgId);
  const existing = await db.company.findFirst({ where: { id: companyId, organizationId: orgId } });
  if (!existing || !access.canEditCompany(companyId)) return NO_ACCESS;

  const parsed = companySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const data = parsed.data;

  // Kun koncernadmin kan flytte selskaber i koncernstrukturen og ændre konsolidering
  if (!access.canManageOrg) {
    data.parentId = existing.parentId;
    data.consolidate = existing.consolidate;
  } else if (!(await checkParent(orgId, companyId, data.parentId))) {
    return { fieldErrors: { parentId: "Ugyldigt moderselskab (kan ikke være selskabet selv eller et datterselskab af det)" } };
  }

  const clash = await db.company.findUnique({ where: { organizationId_cvr: { organizationId: orgId, cvr: data.cvr } } });
  if (clash && clash.id !== companyId) return { fieldErrors: { cvr: "Et andet selskab har dette CVR-nummer" } };

  await db.company.update({ where: { id: companyId }, data });
  await audit({ organizationId: orgId, userId: user.id, action: "company.update", entityType: "Company", entityId: companyId, data: { ...data } });
  refresh(orgId);
  return { ok: "Selskabet er gemt." };
}

export async function archiveCompany(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const companyId = str(fd, "companyId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const company = await db.company.findFirst({ where: { id: companyId, organizationId: orgId }, include: { children: { where: { archivedAt: null } } } });
  if (!company) return NO_ACCESS;
  if (company.children.length > 0) return { error: "Selskabet har aktive datterselskaber. Flyt eller arkivér dem først." };
  if (await db.report.count({ where: { reportingCompanyId: companyId } })) {
    return { error: "Selskabet er rapporterende selskab i en rapport. Skift det rapporterende selskab eller slet rapporten først." };
  }

  await db.$transaction([
    db.company.update({ where: { id: companyId }, data: { archivedAt: new Date() } }),
    // Fjern selskabet fra rapporter der ikke er godkendt
    db.reportCompany.deleteMany({ where: { companyId, report: { status: { not: "APPROVED" } } } }),
  ]);
  await audit({ organizationId: orgId, userId: user.id, action: "company.archive", entityType: "Company", entityId: companyId });
  refresh(orgId);
  redirect(`/org/${orgId}`);
}

// ---------- Lokationer ----------

export async function createLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const companyId = str(fd, "companyId");
  const { user, access } = await requireOrgAccess(orgId);
  const company = await db.company.findFirst({ where: { id: companyId, organizationId: orgId, archivedAt: null } });
  if (!company || !access.managesCompany(companyId)) return NO_ACCESS;

  const parsed = locationSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const loc = await db.location.create({ data: { ...parsed.data, companyId } });
  await audit({ organizationId: orgId, userId: user.id, action: "location.create", entityType: "Location", entityId: loc.id, data: parsed.data });
  refresh(orgId);
  return { ok: `Lokationen "${loc.name}" er oprettet.` };
}

export async function updateLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const locationId = str(fd, "locationId");
  const { user, access } = await requireOrgAccess(orgId);
  const loc = await db.location.findFirst({ where: { id: locationId, company: { organizationId: orgId } } });
  if (!loc || !access.canEditLocationMeta(loc)) return NO_ACCESS;

  const parsed = locationSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  await db.location.update({ where: { id: locationId }, data: parsed.data });
  await audit({ organizationId: orgId, userId: user.id, action: "location.update", entityType: "Location", entityId: locationId, data: parsed.data });
  refresh(orgId);
  return { ok: "Lokationen er gemt." };
}

export async function archiveLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const locationId = str(fd, "locationId");
  const { user, access } = await requireOrgAccess(orgId);
  const loc = await db.location.findFirst({ where: { id: locationId, company: { organizationId: orgId } } });
  if (!loc || !access.canEditLocationMeta(loc)) return NO_ACCESS;

  await db.location.update({ where: { id: locationId }, data: { archivedAt: new Date() } });
  await audit({ organizationId: orgId, userId: user.id, action: "location.archive", entityType: "Location", entityId: locationId });
  refresh(orgId);
  return { ok: "Lokationen er arkiveret." };
}

// ---------- Rapporteringsår ----------

export async function createPeriod(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;

  const parsed = periodSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { year } = parsed.data;
  if (await db.reportingPeriod.findUnique({ where: { organizationId_year: { organizationId: orgId, year } } })) {
    return { fieldErrors: { year: `Rapporteringsår ${year} findes allerede` } };
  }

  const period = await db.reportingPeriod.create({ data: { ...parsed.data, organizationId: orgId } });
  await audit({ organizationId: orgId, userId: user.id, action: "period.create", entityType: "ReportingPeriod", entityId: period.id, data: { year } });
  const report = await createDefaultReport(orgId, period.id, year);
  refresh(orgId);
  if (report) redirect(`/org/${orgId}/reports/${report.id}`);
  return { ok: `Rapporteringsår ${year} er oprettet.` };
}

export async function deletePeriod(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const periodId = str(fd, "periodId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  if (await db.report.count({ where: { periodId, status: "APPROVED" } })) {
    return { error: "Året har en godkendt rapport og kan ikke slettes." };
  }
  const { count } = await db.reportingPeriod.deleteMany({ where: { id: periodId, organizationId: orgId } });
  if (count) await audit({ organizationId: orgId, userId: user.id, action: "period.delete", entityType: "ReportingPeriod", entityId: periodId });
  refresh(orgId);
  return { ok: "Rapporteringsåret og dets rapporter er slettet." };
}

// ---------- Medlemmer og invitationer ----------

export async function inviteMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access, organization } = await requireOrgAccess(orgId);

  const parsed = inviteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { email, role } = parsed.data;
  let companyId: string | null = null;
  let locationId: string | null = null;
  let scopeLabel = organization.name;

  if (role === "COMPANY_MANAGER") {
    const company = parsed.data.companyId
      ? await db.company.findFirst({ where: { id: parsed.data.companyId, organizationId: orgId, archivedAt: null } })
      : null;
    if (!company) return { fieldErrors: { companyId: "Vælg et selskab" } };
    companyId = company.id;
    scopeLabel = company.name;
  } else if (role === "LOCATION_CONTRIBUTOR") {
    const loc = parsed.data.locationId
      ? await db.location.findFirst({ where: { id: parsed.data.locationId, archivedAt: null, company: { organizationId: orgId } }, include: { company: true } })
      : null;
    if (!loc) return { fieldErrors: { locationId: "Vælg en lokation" } };
    locationId = loc.id;
    scopeLabel = `${loc.name}, ${loc.company.name}`;
    if (!access.canInvite({ role, location: loc })) return NO_ACCESS;
  }
  if (role !== "LOCATION_CONTRIBUTOR" && !access.canInvite({ role, companyId })) return NO_ACCESS;

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    const dup = await db.membership.findFirst({ where: { userId: existingUser.id, organizationId: orgId, role, companyId, locationId } });
    if (dup) return { error: `${email} har allerede denne adgang.` };
  }

  // Erstat evt. tidligere åben invitation til samme adgang
  await db.invitation.updateMany({
    where: { organizationId: orgId, email, role, companyId, locationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const token = generateToken();
  const invitation = await db.invitation.create({
    data: {
      email,
      role,
      companyId,
      locationId,
      organizationId: orgId,
      tokenHash: hashToken(token),
      invitedById: user.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });

  const link = `${env.appUrl}/invite/${token}`;
  await sendMail({
    to: email,
    subject: `Invitation til ESG-rapportering for ${organization.name}`,
    text: `${user.name ?? user.email} har inviteret dig som ${ROLE_LABELS[role].toLowerCase()} for ${scopeLabel}.\n\nKlik på linket for at acceptere og logge ind:\n\n${link}\n\nInvitationen udløber om ${INVITE_DAYS} dage.`,
  });
  await audit({ organizationId: orgId, userId: user.id, action: "invitation.create", entityType: "Invitation", entityId: invitation.id, data: { email, role, companyId, locationId } });
  refresh(orgId);

  const ok = `Invitation sendt til ${email}.`;
  return showDevLinks ? { ok, devLink: link } : { ok };
}

export async function revokeInvitation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const invitationId = str(fd, "invitationId");
  const { user, access } = await requireOrgAccess(orgId);
  const inv = await db.invitation.findFirst({ where: { id: invitationId, organizationId: orgId }, include: { location: true } });
  if (!inv || !access.canInvite({ role: inv.role, companyId: inv.companyId, location: inv.location })) return NO_ACCESS;

  await db.invitation.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
  await audit({ organizationId: orgId, userId: user.id, action: "invitation.revoke", entityType: "Invitation", entityId: inv.id });
  refresh(orgId);
  return { ok: "Invitationen er trukket tilbage." };
}

export async function removeMembership(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const membershipId = str(fd, "membershipId");
  const { user, access } = await requireOrgAccess(orgId);
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId: orgId }, include: { location: true } });
  if (!m || !access.canInvite({ role: m.role, companyId: m.companyId, location: m.location })) return NO_ACCESS;

  if (m.role === "ORG_ADMIN") {
    const admins = await db.membership.count({ where: { organizationId: orgId, role: "ORG_ADMIN" } });
    if (admins <= 1) return { error: "Der skal være mindst én koncernadmin." };
  }
  await db.membership.delete({ where: { id: m.id } });
  await audit({ organizationId: orgId, userId: user.id, action: "membership.remove", entityType: "Membership", entityId: m.id, data: { userId: m.userId, role: m.role } });
  refresh(orgId);
  return { ok: "Adgangen er fjernet." };
}

/** Invitationslinket beviser ejerskab af mailadressen, så det logger også ind. */
export async function acceptInvitation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, "token");
  const inv = await db.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
    return { error: "Invitationen er ugyldig, udløbet eller allerede brugt." };
  }

  const name = str(fd, "name").trim() || null;
  const user = await db.user.upsert({
    where: { email: inv.email },
    create: { email: inv.email, name },
    update: name ? { name } : {},
  });
  const scope = { userId: user.id, organizationId: inv.organizationId, role: inv.role, companyId: inv.companyId, locationId: inv.locationId };
  const exists = await db.membership.findFirst({ where: scope });
  if (!exists) await db.membership.create({ data: scope });
  await db.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
  await audit({ organizationId: inv.organizationId, userId: user.id, action: "invitation.accept", entityType: "Invitation", entityId: inv.id });

  await createSession(user.id);
  redirect(`/org/${inv.organizationId}`);
}
