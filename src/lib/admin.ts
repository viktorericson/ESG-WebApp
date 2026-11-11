import "server-only";
import { notFound } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "./auth";
import { db } from "./db";
import { isPlatformAdmin } from "./env";

/**
 * Platformens ejer: adgang til /admin på tværs af alle koncerner.
 * Styres af PLATFORM_ADMIN_EMAILS i miljøet, så ingen kan give sig selv adgangen gennem appen.
 * Andre får 404, så det ikke afsløres, at siden findes.
 */
export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
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
