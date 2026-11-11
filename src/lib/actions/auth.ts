"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env, showDevLinks } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { createSession, destroySession } from "@/lib/session";
import { generateToken, hashToken } from "@/lib/tokens";
import { emailSchema, type ActionState } from "@/lib/validation";

const LOGIN_TOKEN_MINUTES = 15;

function safeRedirect(path: unknown): string | null {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export async function requestLoginLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: "Ugyldig e-mailadresse" } };
  const email = parsed.data;

  const generic = { ok: `Hvis ${email} har adgang, er der sendt et login-link. Linket virker i ${LOGIN_TOKEN_MINUTES} minutter.` };

  const known = await db.user.findUnique({ where: { email } });
  // Afslører ikke, om adressen findes eller er spærret
  if (!known && !env.allowSignup) return generic;
  if (known?.disabledAt) return generic;

  const token = generateToken();
  await db.loginToken.create({
    data: {
      tokenHash: hashToken(token),
      email,
      redirectTo: safeRedirect(formData.get("next")),
      expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000),
    },
  });

  const link = `${env.appUrl}/auth/verify?token=${token}`;
  await sendMail({
    to: email,
    subject: "Dit login-link til ESG Rapportering",
    text: `Klik på linket for at logge ind:\n\n${link}\n\nLinket udløber om ${LOGIN_TOKEN_MINUTES} minutter. Har du ikke bedt om det, kan du se bort fra denne mail.`,
  });

  return showDevLinks ? { ...generic, devLink: link } : generic;
}

/**
 * Forbruges via en knap (POST) i stedet for direkte ved GET,
 * så mailscannere der forhåndsåbner links ikke bruger tokenet op.
 */
export async function verifyLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const record = await db.loginToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "Linket er ugyldigt eller udløbet. Bed om et nyt login-link." };
  }
  await db.loginToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  const user = await db.user.upsert({ where: { email: record.email }, create: { email: record.email, lastLoginAt: new Date() }, update: {} });
  if (user.disabledAt) return { error: "Din adgang er spærret. Kontakt den, der administrerer platformen." };
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  redirect(record.redirectTo ?? "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
