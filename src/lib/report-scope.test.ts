import { describe, expect, it } from "vitest";
import { defaultIncluded, resolveIncluded, subtree } from "./report-scope";

const companies = [
  { id: "P", parentId: null, consolidate: true },
  { id: "A", parentId: "P", consolidate: true },
  { id: "A1", parentId: "A", consolidate: false },
  { id: "B", parentId: "P", consolidate: true },
  { id: "X", parentId: null, consolidate: true }, // andet top-selskab i samme org
];

describe("rapportafgrænsning", () => {
  it("subtree finder alle efterkommere", () => {
    expect([...subtree(companies, "A")].sort()).toEqual(["A", "A1"]);
  });

  it("konsolideret standard tager kun selskaber markeret til konsolidering", () => {
    expect(defaultIncluded(companies, "P", "CONSOLIDATED").sort()).toEqual(["A", "B", "P"]);
  });

  it("individuel omfatter kun det rapporterende selskab", () => {
    expect(defaultIncluded(companies, "A", "INDIVIDUAL")).toEqual(["A"]);
    expect(resolveIncluded(companies, "A", "INDIVIDUAL", ["A", "A1"])).toEqual({ ok: true, ids: ["A"] });
  });

  it("konsolideret afviser selskaber uden for koncernen og medtager altid roden", () => {
    expect(resolveIncluded(companies, "P", "CONSOLIDATED", ["A", "X"]).ok).toBe(false);
    expect(resolveIncluded(companies, "P", "CONSOLIDATED", ["A1"])).toEqual({ ok: true, ids: ["P", "A1"] });
  });

  it("konsolideret kræver mindst ét datterselskab", () => {
    expect(resolveIncluded(companies, "B", "CONSOLIDATED", []).ok).toBe(false);
  });
});
