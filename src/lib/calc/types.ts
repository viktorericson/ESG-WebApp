/** Emissionsfaktor i kg CO2e pr. enhed, opdelt på scope (Klimakompassets format) */
export type FactorValue = { scope1: number; scope2: number; scope3: number; outsideScopes: number; unit: string; source?: string | null };

/** Opslag på Klimakompasset-nøgle for rapporteringsåret */
export type FactorLookup = (key: string) => FactorValue | undefined;

export type CalcIssue = { level: "missing" | "estimate" | "info"; message: string };

/** Energi i MWh, fordelt på vedvarende og ikke-vedvarende (B3 pkt. 32) */
export type EnergySplit = { renewable: number; nonRenewable: number };

export const emptySplit = (): EnergySplit => ({ renewable: 0, nonRenewable: 0 });
export const addSplit = (a: EnergySplit, b: EnergySplit): EnergySplit => ({ renewable: a.renewable + b.renewable, nonRenewable: a.nonRenewable + b.nonRenewable });
export const totalOf = (s: EnergySplit) => s.renewable + s.nonRenewable;
