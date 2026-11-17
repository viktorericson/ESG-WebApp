import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";
import { sendGraphMail } from "./mail-graph";

type Mail = { to: string; subject: string; text: string };

/**
 * Sender via Microsoft Graph, hvis MS_GRAPH_* er sat, ellers via SMTP_URL.
 * Uden mailopsætning skrives mailen i serverens log, så login-links kan findes dér.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.graph) {
    try {
      return await sendGraphMail(env.graph, { from: env.mailFrom, ...mail });
    } catch (e) {
      // Årsagen skal kunne findes i serverens log – brugeren ser kun en generel fejl
      console.error(`[mail] ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }
  if (!env.smtpUrl) {
    console.log(`\n[mail] Til: ${mail.to}\n[mail] Emne: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const transport = nodemailer.createTransport(env.smtpUrl);
  await transport.sendMail({ from: env.mailFrom, ...mail });
}
