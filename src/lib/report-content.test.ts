import { describe, expect, it } from "vitest";
import { compactContent, isImageSlot, MAX_SECTION_TEXT, readContent, reportContentSchema, showSummary } from "./report-content";

describe("rapportindhold", () => {
  it("accepterer gyldigt indhold og afviser ukendte afsnit og for lang tekst", () => {
    expect(reportContentSchema.safeParse({ foreword: "Hej", sections: { b6: "Vand" }, summary: { show: false } }).success).toBe(true);
    expect(reportContentSchema.safeParse({ sections: { b99: "x" } }).success).toBe(false);
    expect(reportContentSchema.safeParse({ sections: { b6: "x".repeat(MAX_SECTION_TEXT + 1) } }).success).toBe(false);
  });

  it("læser lagret indhold tolerant og fjerner tomme tekster", () => {
    expect(readContent(null)).toEqual({});
    expect(readContent({ sections: { b99: "x" } })).toEqual({});
    const c = compactContent({ foreword: "  ", about: " Om os ", sections: { b1: "", b6: " Vand " }, summary: { show: true, social: " " } });
    expect(c).toEqual({ foreword: undefined, about: "Om os", sections: { b6: "Vand" }, summary: { show: true, environment: undefined, social: undefined, governance: undefined }, closing: undefined });
  });

  it("viser ledelsesoversigten, medmindre den er slået fra", () => {
    expect(showSummary({})).toBe(true);
    expect(showSummary({ summary: { show: false } })).toBe(false);
  });

  it("kender billedpladserne", () => {
    expect(isImageSlot("appendix")).toBe(true);
    expect(isImageSlot("section:b5")).toBe(true);
    expect(isImageSlot("section:x")).toBe(false);
  });
});
