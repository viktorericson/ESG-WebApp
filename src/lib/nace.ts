/**
 * Sektorer med stor klimaindvirkning (VS pkt. 54, fodnote 9): NACE-hovedafdeling A–H samt fast ejendom
 * (L i NACE rev. 2, M i rev. 2.1). Afgøres af de to første cifre i NACE-koden:
 * A 01–03, B 05–09, C 10–33, D 35, E 36–39, F 41–43, G 45–47, H 49–53, fast ejendom 68.
 */
export function isHighImpactNace(code: string): boolean {
  const division = Number(code.replace(/\D/g, "").slice(0, 2));
  if (!Number.isFinite(division) || division === 0) return false;
  return (division >= 1 && division <= 53) || division === 68;
}

/** true/false ud fra selskabets NACE-koder; null når ingen koder er angivet */
export function highImpactSector(codes: string[]): boolean | null {
  const valid = codes.filter((c) => /\d{2}/.test(c));
  return valid.length ? valid.some(isHighImpactNace) : null;
}
