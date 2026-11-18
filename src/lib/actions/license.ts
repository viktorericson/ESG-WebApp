"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { LICENSE_MESSAGES, maskKey, normalizeKey, validKey } from "@/lib/license";
import { refreshLicense } from "@/lib/license-server";
import type { ActionState } from "@/lib/validation";

const NO_ACCESS: ActionState = { error: "Kun koncernadmin kan ændre licensen." };

/** Gemmer en ny licensnøgle for koncernen og tjekker den med det samme */
export async function setLicenseKey(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = String(fd.get("orgId") ?? "");
  const { user, access, organization } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;

  const key = normalizeKey(fd.get("licenseKey"));
  if (!validKey(key)) return { fieldErrors: { licenseKey: LICENSE_MESSAGES.invalid_key } };
  const other = await db.organization.findUnique({ where: { licenseKey: key }, select: { id: true } });
  if (other && other.id !== orgId) return { fieldErrors: { licenseKey: LICENSE_MESSAGES.in_use } };

  const org = await db.organization.update({
    where: { id: orgId },
    data: key === organization.licenseKey ? {} : { licenseKey: key, licenseLimitType: null, licenseLimit: null, licenseExpiresAt: null, licenseCheckedAt: null, licenseError: null },
  });
  const status = await refreshLicense(org);
  await audit({ organizationId: orgId, userId: user.id, action: "organization.license", entityType: "Organization", entityId: orgId, data: { name: maskKey(key) } });
  revalidatePath(`/org/${orgId}`, "layout");
  return status.ok ? { ok: "Licensen er gyldig og gemt." } : { fieldErrors: { licenseKey: LICENSE_MESSAGES[status.reason] } };
}

/** Tjekker koncernens licens med licensserveren nu */
export async function checkLicense(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = String(fd.get("orgId") ?? "");
  const { access, organization } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const status = await refreshLicense(organization);
  revalidatePath(`/org/${orgId}`, "layout");
  return status.ok ? { ok: "Licensen er tjekket og gyldig." } : { error: LICENSE_MESSAGES[status.reason] };
}
