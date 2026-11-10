/**
 * Modulregister – strukturen fra ModulOpdeling.md.
 * Moduler med tomme sektioner er endnu ikke bygget (fase 2b–2d).
 */
import { companyGeneral } from "./modules/company-general";
import { locationEnergy } from "./modules/location-energy";
import type { ModuleDef, ModuleScope } from "./types";

const stub = (scope: ModuleScope, number: number, key: string, title: string, vs: string[], description: string): ModuleDef => ({
  key: `${scope}.${key}`,
  scope,
  number,
  title,
  vs,
  description,
  sections: [],
});

export const MODULES: ModuleDef[] = [
  // Selskabsblok
  companyGeneral,
  stub("company", 2, "policies", "Politikker, praksisser og initiativer", ["B2", "B7", "C2"], "Fælles politikregister for de 10 bæredygtighedsemner samt cirkulær økonomi."),
  stub("company", 3, "workforce", "Medarbejdere og ansættelsesforhold", ["B8", "C5"], "Ansatte fordelt på kontrakttype, køn og land."),
  stub("company", 4, "health", "Arbejdsmiljø og sikkerhed", ["B9"], "Arbejdsulykker, ulykkesfrekvens og dødsfald."),
  stub("company", 5, "pay", "Løn, overenskomst og uddannelse", ["B10"], "Mindsteløn, lønforskel, overenskomstdækning og uddannelsestimer."),
  stub("company", 6, "humanRights", "Menneskerettigheder", ["C6", "C7"], "Adfærdskodeks, klagemekanisme og hændelser. Kun ved Udvidet Modul."),
  stub("company", 7, "governance", "Ledelse og forretningsadfærd", ["B11", "C8", "C9"], "Domme og bøder for korruption samt kønsdiversitet i ledelsen."),
  stub("company", 8, "scope1", "Direkte emissioner – Scope 1", ["B3"], "Brændstof til køretøjer, stationære anlæg og procesudledninger."),
  stub("company", 9, "materials", "Materialer og ressourceforbrug", ["B7"], "Massestrømme for nøglematerialer i materialetunge sektorer."),
  stub("company", 10, "climate", "Klimamål og klimarisici", ["C3", "C4"], "Reduktionsmål og samlet vurdering af klimarisici. Kun ved Udvidet Modul."),
  // Lokationsblok
  stub("location", 1, "general", "Generelle lokationsoplysninger", ["B1"], "Navn, adresse, geolokation og driftsperiode – vedligeholdes under lokationens stamdata."),
  locationEnergy,
  stub("location", 3, "water", "Vand", ["B6"], "Vandindtag, udledning og forbrug i områder med vandstress."),
  stub("location", 4, "waste", "Affald", ["B7"], "Farligt og ikke-farligt affald samt genanvendelse."),
  stub("location", 5, "pollution", "Forurening", ["B4"], "Udledning af forurenende stoffer til luft, vand og jord."),
  stub("location", 6, "biodiversity", "Biodiversitet og geografiske forhold", ["B5"], "Biodiversitetsfølsomme områder og vandstress."),
  stub("location", 7, "local", "Lokale indsatser og klimarisici", ["B2", "C2", "C3", "C4"], "Lokale initiativer og klimafarer."),
];

export function getModule(key: string): ModuleDef | undefined {
  return MODULES.find((m) => m.key === key);
}

export function modulesFor(scope: ModuleScope): ModuleDef[] {
  return MODULES.filter((m) => m.scope === scope).sort((a, b) => a.number - b.number);
}

export const isBuilt = (m: ModuleDef) => m.sections.length > 0;
