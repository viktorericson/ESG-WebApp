/**
 * Afsendelse af mail via Microsoft Graph med en Entra-appregistrering (client credentials).
 * Bruges i stedet for SMTP, når MS_GRAPH_* er sat. Ren modul uden server-only, så det kan enhedstestes.
 *
 * Kræver Graph-applikationstilladelsen Mail.Send med admin-samtykke. Afsenderen er postkassen i MAIL_FROM.
 */

export type GraphConfig = { tenantId: string; clientId: string; clientSecret: string };
export type GraphMail = { from: string; to: string; subject: string; text: string };

type Fetch = typeof fetch;
type Token = { value: string; expiresAt: number };

/** "Navn <a@b.dk>" → "a@b.dk". Graph skal bruge postkassens adresse, ikke visningsnavnet. */
export function senderAddress(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
}

const tokens = new Map<string, Token>();

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string; error_description?: string };
    const msg = json.error_description ?? (typeof json.error === "object" ? json.error?.message : json.error);
    if (msg) return String(msg).split("\n")[0];
  } catch {
    // ikke JSON – brug rå tekst
  }
  return body.slice(0, 300);
}

/** Henter et adgangstoken og genbruger det, til der er et minut tilbage af levetiden. */
export async function graphToken(cfg: GraphConfig, fetchFn: Fetch = fetch, now = Date.now()): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt - 60_000 > now) return cached.value;

  const res = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) throw new Error(`Microsoft-login for mail fejlede (${res.status}): ${await errorText(res)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokens.set(key, { value: json.access_token, expiresAt: now + json.expires_in * 1000 });
  return json.access_token;
}

export async function sendGraphMail(cfg: GraphConfig, mail: GraphMail, fetchFn: Fetch = fetch): Promise<void> {
  const send = async (token: string) =>
    fetchFn(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderAddress(mail.from))}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          body: { contentType: "Text", content: mail.text },
          toRecipients: [{ emailAddress: { address: mail.to } }],
        },
        saveToSentItems: false,
      }),
    });

  let res = await send(await graphToken(cfg, fetchFn));
  if (res.status === 401) {
    // Tokenet kan være tilbagekaldt før udløb – hent et nyt og prøv én gang til
    tokens.delete(`${cfg.tenantId}:${cfg.clientId}`);
    res = await send(await graphToken(cfg, fetchFn));
  }
  if (!res.ok) throw new Error(`Mail kunne ikke sendes via Microsoft Graph (${res.status}): ${await errorText(res)}`);
}

/** Kun til tests */
export const clearGraphTokens = () => tokens.clear();
