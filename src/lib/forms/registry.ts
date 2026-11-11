/**
 * Modulregister – strukturen fra ModulOpdeling.md.
 * Moduler med tomme sektioner er endnu ikke bygget (fase 2b–2d).
 */
import { companyGeneral } from "./modules/company-general";
import { companyGovernance } from "./modules/company-governance";
import { companyHealth } from "./modules/company-health";
import { companyHumanRights } from "./modules/company-human-rights";
import { companyMaterials } from "./modules/company-materials";
import { companyPay } from "./modules/company-pay";
import { companyPolicies } from "./modules/company-policies";
import { companyScope1 } from "./modules/company-scope1";
import { companyWorkforce } from "./modules/company-workforce";
import { locationBiodiversity } from "./modules/location-biodiversity";
import { companyClimate } from "./modules/company-climate";
import { companyScope3 } from "./modules/company-scope3";
import { locationEnergy } from "./modules/location-energy";
import { locationLocal } from "./modules/location-local";
import { locationPollution } from "./modules/location-pollution";
import { locationWaste } from "./modules/location-waste";
import { locationWater } from "./modules/location-water";
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
  companyPolicies,
  companyWorkforce,
  companyHealth,
  companyPay,
  companyHumanRights,
  companyGovernance,
  companyScope1,
  companyMaterials,
  companyClimate,
  companyScope3,
  // Lokationsblok
  { ...stub("location", 1, "general", "Generelle lokationsoplysninger", ["B1"], "Navn, adresse, geolokation og driftsperiode – vedligeholdes under lokationens stamdata."), stamdata: true },
  locationEnergy,
  locationWater,
  locationWaste,
  locationPollution,
  locationBiodiversity,
  locationLocal,
];

export function getModule(key: string): ModuleDef | undefined {
  return MODULES.find((m) => m.key === key);
}

export function modulesFor(scope: ModuleScope): ModuleDef[] {
  return MODULES.filter((m) => m.scope === scope).sort((a, b) => a.number - b.number);
}

export const isBuilt = (m: ModuleDef) => m.sections.length > 0;
