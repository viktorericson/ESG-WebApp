import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { getSessionUserId } from "./session";
import { Access } from "./permissions";

export type CurrentUser = { id: string; email: string; name: string | null };

/** Data Access Layer: læser sessionen én gang pr. request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Brugeren + adgang til en organisation. 404 hvis brugeren ikke er medlem (afslører ikke at org findes). */
export const requireOrgAccess = cache(async (organizationId: string) => {
  const user = await requireUser();
  const memberships = await db.membership.findMany({
    where: { userId: user.id, organizationId },
    select: { role: true, organizationId: true, companyId: true, locationId: true },
  });
  const access = new Access(memberships, organizationId);
  if (!access.isMember) notFound();
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return { user, access, organization };
});

/** Manglende adgang vises som 404, så det ikke afsløres hvad der findes. */
export function deny(): never {
  notFound();
}
