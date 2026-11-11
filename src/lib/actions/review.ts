"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { readiness } from "@/lib/review";
import type { ActionState } from "@/lib/validation";

const NO_ACCESS: ActionState = { error: "Du har ikke adgang til at udføre denne handling." };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
/** Dansk genitiv: "Hansen A/S" → "Hansen A/S'", "Test ApS" → "Test ApS'", "Byg" → "Bygs" */
const gen = (name: string) => (/[sxz]$/i.test(name) ? `${name}'` : `${name}s`);

async function load(orgId: string, fd: FormData) {
  const [period, company] = await Promise.all([
    db.reportingPeriod.findFirst({ where: { id: str(fd, "periodId"), organizationId: orgId } }),
    db.company.findFirst({ where: { id: str(fd, "companyId"), organizationId: orgId, archivedAt: null } }),
  ]);
  return period && company ? { period, company } : null;
}

async function approvedReportFor(periodId: string, companyId: string) {
  return (await db.report.count({ where: { periodId, status: "APPROVED", companies: { some: { companyId } } } })) > 0;
}

/** Mail til brugere med en bestemt rolle (koncernadmin eller selskabets ansvarlige) */
async function notify(orgId: string, where: { role: "ORG_ADMIN" } | { role: "COMPANY_MANAGER"; companyId: string }, subject: string, text: string) {
  const members = await db.membership.findMany({ where: { organizationId: orgId, ...where }, include: { user: true } });
  await Promise.all([...new Set(members.map((m) => m.user.email))].map((to) => sendMail({ to, subject, text })));
}

export async function submitCompany(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access, organization } = await requireOrgAccess(orgId);
  const found = await load(orgId, fd);
  if (!found || !access.managesCompany(found.company.id)) return NO_ACCESS;
  const { period, company } = found;

  const current = await db.companySubmission.findUnique({ where: { periodId_companyId: { periodId: period.id, companyId: company.id } } });
  if (current?.status === "SUBMITTED" || current?.status === "APPROVED") return { error: "Data er allerede indsendt." };
  if (await approvedReportFor(period.id, company.id)) return { error: "Selskabet indgår i en godkendt rapport." };
  const r = await readiness(period.id, company.id);
  if (!r.ready) return { error: `${r.total - r.done} moduler mangler at blive markeret som færdige eller ikke relevante.` };

  const data = { status: "SUBMITTED" as const, submittedAt: new Date(), submittedById: user.id, comment: str(fd, "comment").trim() || null };
  await db.companySubmission.upsert({
    where: { periodId_companyId: { periodId: period.id, companyId: company.id } },
    create: { periodId: period.id, companyId: company.id, ...data },
    update: data,
  });
  await audit({ organizationId: orgId, userId: user.id, action: "submission.submit", entityType: "CompanySubmission", entityId: company.id, data: { name: company.name, year: period.year } });
  await notify(
    orgId,
    { role: "ORG_ADMIN" },
    `${company.name} har indsendt ESG-data for ${period.year}`,
    `${user.name ?? user.email} har indsendt ${gen(company.name)} ESG-data for ${period.year} til gennemgang i ${organization.name}.\n\n${data.comment ? `Kommentar: ${data.comment}\n\n` : ""}Gennemgå data her:\n${env.appUrl}/org/${orgId}/companies/${company.id}?period=${period.id}`,
  );
  revalidatePath(`/org/${orgId}`, "layout");
  return { ok: "Data er indsendt til gennemgang." };
}

export async function reviewCompany(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const found = await load(orgId, fd);
  if (!found) return NO_ACCESS;
  const { period, company } = found;
  const decision = str(fd, "decision");
  const comment = str(fd, "comment").trim() || null;

  const current = await db.companySubmission.findUnique({ where: { periodId_companyId: { periodId: period.id, companyId: company.id } } });
  if (await approvedReportFor(period.id, company.id)) return { error: "Selskabet indgår i en godkendt rapport. Sæt rapporten tilbage til “Under udarbejdelse” først." };

  if (decision === "APPROVE") {
    if (current?.status !== "SUBMITTED") return { error: "Kun indsendte data kan godkendes." };
  } else if (decision === "RETURN") {
    if (!comment) return { fieldErrors: { comment: "Skriv hvad der skal rettes" } };
    if (current?.status !== "SUBMITTED" && current?.status !== "APPROVED") return { error: "Data er ikke indsendt." };
  } else return { error: "Ugyldig handling" };

  const status = decision === "APPROVE" ? ("APPROVED" as const) : ("RETURNED" as const);
  await db.companySubmission.update({
    where: { id: current!.id },
    data: { status, comment: comment ?? current!.comment, reviewedAt: new Date(), reviewedById: user.id },
  });
  await audit({ organizationId: orgId, userId: user.id, action: `submission.${decision.toLowerCase()}`, entityType: "CompanySubmission", entityId: company.id, data: { name: company.name, year: period.year } });
  await notify(
    orgId,
    { role: "COMPANY_MANAGER", companyId: company.id },
    status === "APPROVED" ? `ESG-data for ${company.name} ${period.year} er godkendt` : `ESG-data for ${company.name} ${period.year} er sendt tilbage`,
    status === "APPROVED"
      ? `Koncernadmin har godkendt ${gen(company.name)} ESG-data for ${period.year}.${comment ? `\n\nKommentar: ${comment}` : ""}`
      : `Koncernadmin har sendt ${gen(company.name)} ESG-data for ${period.year} tilbage til rettelse.\n\nKommentar: ${comment}\n\nRet data her:\n${env.appUrl}/org/${orgId}/companies/${company.id}?period=${period.id}`,
  );
  revalidatePath(`/org/${orgId}`, "layout");
  return { ok: status === "APPROVED" ? "Data er godkendt og låst." : "Data er sendt tilbage til selskabet." };
}
