import "server-only";
import { notFound } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser, type CurrentUser } from "./auth";
import { db } from "./db";
import { isPlatformAdmin } from "./env";

/**
 * Adgang til /admin på tværs af alle koncerner har:
 * - platformens ejere (PLATFORM_ADMIN_EMAILS i miljøet) – kan ikke fjernes gennem appen
 * - platform-admins, som en ejer eller anden admin har givet adgangen i appen
 * Under "log ind som" er man den anden bruger og har ikke admin-adgang, før man går tilbage.
 * Andre får 404, så det ikke afsløres, at siden findes.
 */
export const isPlatformOwner = (email: string | null | undefined) => isPlatformAdmin(email);
export const hasAdminAccess = (u: Pick<CurrentUser, "email" | "platformAdmin" | "impersonator"> | null | undefined) =>
  !!u && !u.impersonator && (isPlatformOwner(u.email) || u.platformAdmin);

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!hasAdminAccess(user)) notFound();
  return user;
}

export async function adminLog(entry: { actorId: string; action: string; targetType: string; targetId: string; data?: Prisma.InputJsonValue }) {
  await db.adminLog.create({ data: entry });
}

export const formatBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

const dateFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });
const timeFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });
export const formatDate = (d: Date | null | undefined) => (d ? dateFmt.format(d) : "–");
export const formatTime = (d: Date | null | undefined) => (d ? timeFmt.format(d) : "–");
