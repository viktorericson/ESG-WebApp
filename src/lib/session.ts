import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import { env } from "./env";
import { generateToken, hashToken } from "./tokens";

const COOKIE = "esg_session";
/** Adminens egen session gemmes her, mens hen er logget ind som en anden bruger */
const ADMIN_COOKIE = "esg_admin_session";
const SESSION_DAYS = 30;
/** "Log ind som" udløber af sig selv efter kort tid */
export const IMPERSONATION_HOURS = 2;

const cookieOptions = (expires: Date) => ({ httpOnly: true, sameSite: "lax" as const, secure: env.isProd, path: "/", expires });

async function newSession(userId: string, expiresAt: Date, impersonatorId: string | null = null) {
  const token = generateToken();
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt, impersonatorId } });
  return token;
}

export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const token = await newSession(userId, expiresAt);
  (await cookies()).set(COOKIE, token, cookieOptions(expiresAt));
}

export type SessionInfo = { id: string; userId: string; impersonatorId: string | null };

/** Den aktive session. En "log ind som"-session er kun gyldig, mens adminen ikke er spærret. */
export async function getSession(): Promise<SessionInfo | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { disabledAt: true } }, impersonator: { select: { disabledAt: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.disabledAt) return null;
  if (session.impersonatorId && (!session.impersonator || session.impersonator.disabledAt)) return null;
  return { id: session.id, userId: session.userId, impersonatorId: session.impersonatorId };
}

export async function getSessionUserId(): Promise<string | null> {
  return (await getSession())?.userId ?? null;
}

/**
 * Starter "log ind som": adminens egen session lægges til side, og en kortvarig session som brugeren
 * sættes i stedet. Adgangstjek (kun platform-admin, ikke andre admins) ligger hos kalderen.
 */
export async function startImpersonation(adminId: string, userId: string): Promise<void> {
  const store = await cookies();
  const own = store.get(COOKIE)?.value;
  if (!own) throw new Error("Ingen aktiv session");
  const expiresAt = new Date(Date.now() + IMPERSONATION_HOURS * 3_600_000);
  const token = await newSession(userId, expiresAt, adminId);
  const ownSession = await db.session.findUnique({ where: { tokenHash: hashToken(own) } });
  store.set(ADMIN_COOKIE, own, cookieOptions(ownSession?.expiresAt ?? expiresAt));
  store.set(COOKIE, token, cookieOptions(expiresAt));
}

/**
 * Afslutter "log ind som" og genskaber adminens egen session, hvis den stadig er gyldig og tilhører
 * den admin, der startede. Returnerer adminens id, eller null hvis adminen skal logge ind igen.
 */
export async function stopImpersonation(): Promise<{ adminId: string | null; userId: string | null }> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  const current = token ? await db.session.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
  if (current?.impersonatorId) await db.session.delete({ where: { id: current.id } });
  const backup = store.get(ADMIN_COOKIE)?.value;
  store.delete(ADMIN_COOKIE);
  const own = backup ? await db.session.findUnique({ where: { tokenHash: hashToken(backup) } }) : null;
  if (own && current?.impersonatorId === own.userId && !own.impersonatorId && own.expiresAt > new Date()) {
    store.set(COOKIE, backup!, cookieOptions(own.expiresAt));
    return { adminId: own.userId, userId: current.userId };
  }
  store.delete(COOKIE);
  return { adminId: null, userId: current?.userId ?? null };
}

/** Log ud. Under "log ind som" logges også adminens egen, tilsidesatte session ud. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  for (const name of [COOKIE, ADMIN_COOKIE]) {
    const token = store.get(name)?.value;
    if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    store.delete(name);
  }
}
