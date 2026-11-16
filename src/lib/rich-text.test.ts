import { describe, expect, it } from "vitest";
import { parseInline, parseRich, plainText, serializeRich } from "./rich-text";

describe("formateret tekst", () => {
  it("læser almindelig tekst fra før editoren uændret", () => {
    expect(parseRich("Første afsnit\n\nAndet afsnit")).toEqual([
      { type: "paragraph", runs: [{ text: "Første afsnit" }] },
      { type: "paragraph", runs: [{ text: "Andet afsnit" }] },
    ]);
    expect(parseRich("• gammelt punkt")[0].type).toBe("bullet");
  });

  it("forstår overskrifter, lister og inline-formatering", () => {
    const b = parseRich("## Mål\n- **Fed** og *kursiv*\n1. ++Understreget++\n2. Nummer to");
    expect(b.map((x) => x.type)).toEqual(["heading", "bullet", "ordered", "ordered"]);
    expect(b[1].runs).toEqual([{ text: "Fed", bold: true }, { text: " og " }, { text: "kursiv", italic: true }]);
    expect(b[2].runs).toEqual([{ text: "Understreget", underline: true }]);
  });

  it("lader enlige stjerner stå som tekst", () => {
    expect(parseInline("5 * 3 = 15")).toEqual([{ text: "5 * 3 = 15" }]);
    expect(parseInline("**fed *kursiv***")).toEqual([{ text: "fed ", bold: true }, { text: "kursiv", bold: true, italic: true }]);
  });

  it("gemmer og læser formateringen tilbage uden tab", () => {
    const text = "## Overskrift\nAlmindelig **fed** tekst med *kursiv* og ++streg++\n- Punkt\n1. Et\n2. To";
    expect(serializeRich(parseRich(text))).toBe(text);
    // Tegn, der ligner formatering, escapes
    const tricky = [{ type: "paragraph" as const, runs: [{ text: "2 * 3 og a++b" }] }];
    expect(parseRich(serializeRich(tricky))).toEqual(tricky);
  });

  it("giver den synlige tekst uden formateringstegn", () => {
    expect(plainText("## Titel\n- **fed** punkt")).toBe("Titel\nfed punkt");
  });
});
