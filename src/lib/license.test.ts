import { describe, expect, it } from "vitest";
import { afterFetch, licenseValidity, maskKey, MAX_OFFLINE_MS, needsRefresh, parseLicense, REFRESH_MS, userLimitReached, validKey, type StoredLicense } from "./license";

const KEY = "ABCD-1234-efgh";
const now = new Date("2026-11-17T10:00:00Z");
const nextYear = new Date("2027-11-17T10:00:00Z").getTime();
const body = { _id: KEY, type: "esg", limitType: "users", limit: 5, expires: nextYear };

const stored = (o: Partial<StoredLicense> = {}): StoredLicense => ({
  licenseKey: KEY,
  licenseLimitType: "users",
  licenseLimit: 5,
  licenseExpiresAt: new Date(nextYear),
  licenseCheckedAt: now,
  licenseError: null,
  ...o,
});

describe("validKey og maskKey", () => {
  it("accepterer 8–64 tegn af bogstaver, tal, - og _", () => {
    expect(validKey(KEY)).toBe(true);
    expect(validKey("kort")).toBe(false);
    expect(validKey("med mellemrum 123")).toBe(false);
    expect(validKey("a".repeat(65))).toBe(false);
  });
  it("viser kun de første 4 tegn", () => {
    expect(maskKey(KEY)).toBe("ABCD" + "•".repeat(KEY.length - 4));
    expect(maskKey(null)).toBeNull();
  });
});

describe("parseLicense", () => {
  it("læser en extension-licens, som licensserveren sender uden type og grænse", () => {
    expect(parseLicense({ _id: KEY, expires: nextYear }, KEY, "extension")).toEqual({ ok: true, license: { limitType: null, limit: null, expiresAt: new Date(nextYear) } });
    expect(parseLicense({ _id: KEY, expires: String(nextYear) }, KEY, "extension")).toMatchObject({ ok: true });
  });
  it("afviser en MCP-licens, når der forventes en extension-licens", () => {
    expect(parseLicense({ ...body, type: "mcp" }, KEY, "extension")).toEqual({ ok: false, reason: "wrong_type" });
  });
  it("læser et gyldigt svar", () => {
    expect(parseLicense(body, KEY, "esg")).toEqual({ ok: true, license: { limitType: "users", limit: 5, expiresAt: new Date(nextYear) } });
  });
  it("tillader svar uden grænse", () => {
    const r = parseLicense({ _id: KEY, type: "esg", expires: nextYear }, KEY, "esg");
    expect(r).toEqual({ ok: true, license: { limitType: null, limit: null, expiresAt: new Date(nextYear) } });
  });
  it("afviser en nøgle til et andet produkt", () => {
    expect(parseLicense({ ...body, type: "mcp" }, KEY, "esg")).toEqual({ ok: false, reason: "wrong_type" });
  });
  it("afviser svar for en anden nøgle eller uden udløb", () => {
    expect(parseLicense({ ...body, _id: "andenNøgle" }, KEY, "esg")).toEqual({ ok: false, reason: "invalid_response" });
    expect(parseLicense({ ...body, expires: "snart" }, KEY, "esg")).toEqual({ ok: false, reason: "invalid_response" });
    expect(parseLicense({ ...body, limit: -1 }, KEY, "esg")).toEqual({ ok: false, reason: "invalid_response" });
    expect(parseLicense(null, KEY, "esg")).toEqual({ ok: false, reason: "invalid_response" });
  });
});

describe("licenseValidity", () => {
  it("er gyldig med et nyligt, ikke-udløbet svar", () => {
    expect(licenseValidity(stored(), now)).toMatchObject({ ok: true, license: { limit: 5 } });
  });
  it("kræver en nøgle", () => {
    expect(licenseValidity(stored({ licenseKey: null }), now)).toEqual({ ok: false, reason: "no_key" });
  });
  it("er udløbet efter udløbsdatoen", () => {
    expect(licenseValidity(stored({ licenseExpiresAt: new Date(now.getTime() - 1) }), now)).toEqual({ ok: false, reason: "expired" });
  });
  it("gælder i 7 dage uden kontakt til serveren", () => {
    expect(licenseValidity(stored({ licenseCheckedAt: new Date(now.getTime() - MAX_OFFLINE_MS + 1000), licenseError: "unreachable" }), now).ok).toBe(true);
    expect(licenseValidity(stored({ licenseCheckedAt: new Date(now.getTime() - MAX_OFFLINE_MS - 1000) }), now)).toEqual({ ok: false, reason: "unreachable" });
  });
  it("viser årsagen, når nøglen ikke er bekræftet", () => {
    expect(licenseValidity(stored({ licenseExpiresAt: null, licenseCheckedAt: null, licenseError: "not_found" }), now)).toEqual({ ok: false, reason: "not_found" });
    expect(licenseValidity(stored({ licenseExpiresAt: null, licenseCheckedAt: null }), now)).toEqual({ ok: false, reason: "unverified" });
  });
});

describe("afterFetch", () => {
  it("gemmer et gyldigt svar og nulstiller fejlen", () => {
    const parsed = parseLicense(body, KEY, "esg");
    expect(afterFetch(parsed, now)).toEqual({ licenseLimitType: "users", licenseLimit: 5, licenseExpiresAt: new Date(nextYear), licenseCheckedAt: now, licenseError: null });
  });
  it("bevarer det seneste gyldige svar, når serveren ikke kan nås", () => {
    expect(afterFetch({ ok: false, reason: "unreachable" }, now)).toEqual({ licenseError: "unreachable" });
  });
  it("glemmer licensen med det samme, når nøglen er tilbagekaldt", () => {
    expect(afterFetch({ ok: false, reason: "not_found" }, now)).toEqual({ licenseLimitType: null, licenseLimit: null, licenseExpiresAt: null, licenseCheckedAt: null, licenseError: "not_found" });
  });
});

describe("needsRefresh og userLimitReached", () => {
  it("tjekker igen efter en time", () => {
    expect(needsRefresh(stored(), now)).toBe(false);
    expect(needsRefresh(stored({ licenseCheckedAt: new Date(now.getTime() - REFRESH_MS - 1) }), now)).toBe(true);
    expect(needsRefresh(stored({ licenseKey: null }), now)).toBe(false);
  });
  it("håndhæver kun brugergrænser", () => {
    const lic = { limitType: "users", limit: 5, expiresAt: new Date(nextYear) };
    expect(userLimitReached(lic, 4)).toBe(false);
    expect(userLimitReached(lic, 5)).toBe(true);
    expect(userLimitReached({ ...lic, limitType: "reports" }, 50)).toBe(false);
    expect(userLimitReached({ ...lic, limit: null }, 50)).toBe(false);
  });
});
