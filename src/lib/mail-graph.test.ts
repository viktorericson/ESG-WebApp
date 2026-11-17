import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearGraphTokens, graphToken, sendGraphMail, senderAddress } from "./mail-graph";

const cfg = { tenantId: "tenant", clientId: "client", clientSecret: "secret" };
const mail = { from: "esgBRICKS <noreply@example.dk>", to: "bruger@example.dk", subject: "Login", text: "Link" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokenOk = () => json({ access_token: "tok", expires_in: 3600 });

beforeEach(() => clearGraphTokens());

describe("senderAddress", () => {
  it("finder adressen i 'Navn <adresse>' og i en ren adresse", () => {
    expect(senderAddress("esgBRICKS <noreply@example.dk>")).toBe("noreply@example.dk");
    expect(senderAddress(" noreply@example.dk ")).toBe("noreply@example.dk");
  });
});

describe("sendGraphMail", () => {
  it("henter token og sender fra postkassen i MAIL_FROM", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(new Response(null, { status: 202 }));
    await sendGraphMail(cfg, mail, fetchFn);

    const [tokenUrl, tokenInit] = fetchFn.mock.calls[0];
    expect(tokenUrl).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
    expect(String(tokenInit?.body)).toContain("grant_type=client_credentials");

    const [sendUrl, sendInit] = fetchFn.mock.calls[1];
    expect(sendUrl).toBe("https://graph.microsoft.com/v1.0/users/noreply%40example.dk/sendMail");
    expect((sendInit?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(String(sendInit?.body));
    expect(body.message.toRecipients).toEqual([{ emailAddress: { address: "bruger@example.dk" } }]);
    expect(body.message.body).toEqual({ contentType: "Text", content: "Link" });
    expect(body.saveToSentItems).toBe(false);
  });

  it("genbruger tokenet mellem afsendelser", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenOk()).mockImplementation(async () => new Response(null, { status: 202 }));
    await sendGraphMail(cfg, mail, fetchFn);
    await sendGraphMail(cfg, mail, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("henter et nyt token, når det gamle er ved at udløbe", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => json({ access_token: "tok", expires_in: 3600 }));
    await graphToken(cfg, fetchFn, 0);
    await graphToken(cfg, fetchFn, 3_590_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("prøver igen med nyt token ved 401", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(json({ error: { message: "Token udløbet" } }, 401))
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    await expect(sendGraphMail(cfg, mail, fetchFn)).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("giver en forståelig fejl, når Graph afviser", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(json({ error: { code: "ErrorAccessDenied", message: "Access is denied." } }, 403));
    await expect(sendGraphMail(cfg, mail, fetchFn)).rejects.toThrow("(403): Access is denied.");
  });

  it("giver en forståelig fejl, når login fejler – uden at afsløre hemmeligheden", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided.\nTrace ID: x" }, 401));
    const err = await sendGraphMail(cfg, mail, fetchFn).catch((e: Error) => e);
    expect((err as Error).message).toBe("Microsoft-login for mail fejlede (401): AADSTS7000215: Invalid client secret provided.");
    expect((err as Error).message).not.toContain("secret\"");
  });
});
