import { describe, expect, it } from "vitest";
import { evaluateModule, isYes, nextStatus, over10, sanitizeAnswers, toNumber } from "./engine";
import { MODULES } from "./registry";
import { EVIDENCE_KEY, META_KEY, type FormContext, type ModuleDef } from "./types";

const ctx: FormContext = { comprehensive: false, employees: 25 };

const def: ModuleDef = {
  key: "test",
  scope: "company",
  number: 1,
  title: "Test",
  vs: [],
  description: "",
  sections: [
    {
      key: "a",
      title: "A",
      evidence: true,
      fields: [
        { key: "turnover", label: "Omsætning", type: "number", min: 0, required: true },
        { key: "hasCert", label: "Certificering?", type: "yesno", required: true },
        {
          key: "certs",
          label: "Certificeringer",
          type: "table",
          required: true,
          showIf: isYes("hasCert"),
          columns: [
            { key: "name", label: "Navn", type: "text", required: true },
            { key: "date", label: "Dato", type: "date" },
          ],
        },
      ],
    },
    {
      key: "energy",
      title: "Energi",
      fields: [{ key: "el", label: "El", type: "quantity", units: ["kWh", "MWh"], required: over10 }],
    },
    {
      key: "c1",
      title: "Strategi",
      cOnly: true,
      fields: [{ key: "strategy", label: "Strategi", type: "textarea", required: true }],
    },
  ],
};

describe("toNumber", () => {
  it("forstår dansk decimalkomma og mellemrum", () => {
    expect(toNumber("1 234,5")).toBe(1234.5);
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
  });
});

describe("sanitizeAnswers", () => {
  it("fjerner ukendte nøgler og tvinger typer", () => {
    const out = sanitizeAnswers(def, {
      turnover: "12,5",
      hasCert: "maybe",
      hacker: "x",
      el: { value: "100", unit: "GJ" },
      certs: [{ name: " ISO 14001 ", date: "ikke-en-dato", extra: 1 }],
    });
    expect(out.turnover).toBe(12.5);
    expect(out.hasCert).toBeNull();
    expect(out).not.toHaveProperty("hacker");
    expect(out.el).toEqual({ value: 100, unit: null });
    const certs = out.certs as Record<string, unknown>[];
    expect(certs[0]).toMatchObject({ name: "ISO 14001", date: null });
    expect(certs[0]).not.toHaveProperty("extra");
    expect(typeof certs[0]._id).toBe("string");
  });

  it("bevarer sektion-metadata og evidens kun for kendte sektioner", () => {
    const out = sanitizeAnswers(def, {
      [META_KEY]: { energy: { missing: true, missingReason: "Ingen målere" }, ukendt: { missing: true } },
      [EVIDENCE_KEY]: { a: { sources: [{ system: "e-conomic" }], comment: "ok" }, energy: { comment: "ingen evidens-blok" } },
    });
    expect(out[META_KEY]).toEqual({ energy: { missing: true, missingReason: "Ingen målere" } });
    expect(out[EVIDENCE_KEY]).toEqual({ a: { sources: [{ system: "e-conomic" }], comment: "ok" } });
  });
});

describe("evaluateModule", () => {
  it("tom besvarelse er ikke startet og ikke færdig", () => {
    const ev = evaluateModule(def, {}, ctx);
    expect(ev.started).toBe(false);
    expect(ev.complete).toBe(false);
    expect(ev.required).toBe(3); // turnover, hasCert, el (C1 skjult)
  });

  it("betingede felter tæller kun når de er synlige", () => {
    const ev = evaluateModule(def, { turnover: 10, hasCert: "yes" }, ctx);
    expect(ev.required).toBe(4);
    expect(ev.filled).toBe(2);
  });

  it("påkrævede kolonner i tabeller giver fejl og blokerer færdiggørelse", () => {
    const a = { turnover: 10, hasCert: "yes", certs: [{ _id: "1", name: null }], el: { value: 5, unit: "MWh" } };
    const ev = evaluateModule(def, a, ctx);
    expect(ev.issues.map((i) => i.message)).toContain("Række 1: udfyld “Navn”");
    expect(ev.complete).toBe(false);
  });

  it("“data mangler” med begrundelse gør sektionen færdig", () => {
    const a = { turnover: 10, hasCert: "no", [META_KEY]: { energy: { missing: true, missingReason: "Ingen data" } } };
    expect(evaluateModule(def, a, ctx).complete).toBe(true);
    const noReason = { turnover: 10, hasCert: "no", [META_KEY]: { energy: { missing: true } } };
    expect(evaluateModule(def, noReason, ctx).complete).toBe(false);
  });

  it("felter krævet ved >10 ansatte er frivillige for små virksomheder", () => {
    expect(evaluateModule(def, { turnover: 1, hasCert: "no" }, { ...ctx, employees: 8 }).complete).toBe(true);
    expect(evaluateModule(def, { turnover: 1, hasCert: "no" }, { ...ctx, employees: null }).complete).toBe(false);
  });

  it("C-sektioner kræves kun ved B+C", () => {
    const a = { turnover: 1, hasCert: "no", el: { value: 1, unit: "kWh" } };
    expect(evaluateModule(def, a, ctx).complete).toBe(true);
    expect(evaluateModule(def, a, { ...ctx, comprehensive: true }).complete).toBe(false);
  });

  it("ugyldig værdi tæller ikke som udfyldt", () => {
    const ev = evaluateModule(def, { turnover: -5 }, ctx);
    expect(ev.issues[0].message).toBe("Skal være mindst 0");
    expect(ev.filled).toBe(0);
  });
});

describe("nextStatus", () => {
  it("færdigt modul falder tilbage hvis det bliver ufuldstændigt", () => {
    const incomplete = evaluateModule(def, { turnover: 1 }, ctx);
    expect(nextStatus("COMPLETED", incomplete)).toBe("IN_PROGRESS");
    expect(nextStatus("NOT_RELEVANT", incomplete)).toBe("NOT_RELEVANT");
    expect(nextStatus("NOT_STARTED", evaluateModule(def, {}, ctx))).toBe("NOT_STARTED");
  });
});


describe("modulregister", () => {
  it("har 10 selskabsmoduler og 7 lokationsmoduler med unikke nøgler", () => {
    expect(MODULES.filter((m) => m.scope === "company")).toHaveLength(10);
    expect(MODULES.filter((m) => m.scope === "location")).toHaveLength(7);
    expect(new Set(MODULES.map((m) => m.key)).size).toBe(MODULES.length);
  });

  it("feltnøgler er unikke inden for hvert modul", () => {
    for (const m of MODULES) {
      const keys = m.sections.flatMap((s) => s.fields.map((f) => f.key));
      expect(new Set(keys).size, m.key).toBe(keys.length);
    }
  });
});

describe("checks", () => {
  const withCheck: ModuleDef = {
    ...def,
    checks: (a, c) => (typeof a.turnover === "number" && c.employees !== null && a.turnover < c.employees ? [{ section: "a", message: "Lav omsætning" }, { section: "c1", message: "skjult" }] : []),
  };

  it("advarsler vises kun for synlige sektioner og blokerer ikke", () => {
    const ev = evaluateModule(withCheck, { turnover: 1, hasCert: "no", el: { value: 1, unit: "kWh" } }, ctx);
    expect(ev.warnings).toEqual([{ section: "a", message: "Lav omsætning" }]);
    expect(ev.complete).toBe(true);
  });
});

describe("dynamiske valgmuligheder", () => {
  const dyn: ModuleDef = {
    ...def,
    sections: [{ key: "s", title: "S", fields: [{ key: "rows", label: "R", type: "table", columns: [{ key: "loc", label: "Lokation", type: "select", dynamicOptions: "locations" }] }] }],
  };

  it("validerer lokation mod konteksten", () => {
    const withLocs = { ...ctx, locations: [{ value: "L1", label: "Lager" }] };
    const out = sanitizeAnswers(dyn, { rows: [{ _id: "1", loc: "L1" }, { _id: "2", loc: "fremmed" }] }, withLocs);
    expect((out.rows as Record<string, unknown>[]).map((r) => r.loc)).toEqual(["L1", null]);
  });
});
