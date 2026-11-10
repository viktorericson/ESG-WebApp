import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";

type Mail = { to: string; subject: string; text: string };

export async function sendMail(mail: Mail): Promise<void> {
  if (!env.smtpUrl) {
    console.log(`\n[mail] Til: ${mail.to}\n[mail] Emne: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const transport = nodemailer.createTransport(env.smtpUrl);
  await transport.sendMail({ from: env.mailFrom, ...mail });
}
