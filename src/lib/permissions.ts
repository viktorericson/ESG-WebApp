/**
 * Rene adgangsregler (ingen I/O), så de kan enhedstestes.
 *
 * ORG_ADMIN            – alt i organisationen
 * VIEWER               – læse alt i organisationen
 * COMPANY_MANAGER      – læse/redigere ét selskab og dets lokationer, invitere til dem
 * LOCATION_CONTRIBUTOR – læse/indrapportere for én lokation
 */
import type { Role } from "@/generated/prisma/enums";

export type MembershipLite = {
  role: Role;
  organizationId: string;
  companyId: string | null;
  locationId: string | null;
};

export type LocationRef = { id: string; companyId: string };

export const ROLE_LABELS: Record<Role, string> = {
  ORG_ADMIN: "Koncernadmin",
  COMPANY_MANAGER: "Selskabsansvarlig",
  LOCATION_CONTRIBUTOR: "Lokationsbidragyder",
  VIEWER: "Læser/revisor",
};

export class Access {
  private readonly ms: MembershipLite[];

  constructor(
    memberships: MembershipLite[],
    readonly organizationId: string,
  ) {
    this.ms = memberships.filter((m) => m.organizationId === organizationId);
  }

  private has(role: Role, pred: (m: MembershipLite) => boolean = () => true) {
    return this.ms.some((m) => m.role === role && pred(m));
  }

  get isMember() {
    return this.ms.length > 0;
  }
  get isAdmin() {
    return this.has("ORG_ADMIN");
  }
  get isViewer() {
    return this.has("VIEWER");
  }
  /** Kan se hele organisationen (alle selskaber) */
  get canViewAll() {
    return this.isAdmin || this.isViewer;
  }
  get canManageOrg() {
    return this.isAdmin;
  }

  /** Har brugeradministration for mindst ét selskab */
  get managesAnyCompany() {
    return this.isAdmin || this.has("COMPANY_MANAGER");
  }

  managesCompany(companyId: string) {
    return this.isAdmin || this.has("COMPANY_MANAGER", (m) => m.companyId === companyId);
  }

  contributesTo(locationId: string) {
    return this.has("LOCATION_CONTRIBUTOR", (m) => m.locationId === locationId);
  }

  /** locations: de lokationer i organisationen, som bidragyderens adgang kan slås op i */
  canViewCompany(companyId: string, locations: LocationRef[] = []) {
    if (this.canViewAll || this.managesCompany(companyId)) return true;
    return locations.some((l) => l.companyId === companyId && this.contributesTo(l.id));
  }

  canEditCompany(companyId: string) {
    return this.managesCompany(companyId);
  }

  canViewLocation(loc: LocationRef) {
    return this.canViewAll || this.managesCompany(loc.companyId) || this.contributesTo(loc.id);
  }

  /** Stamdata (navn, adresse) – ikke indrapportering */
  canEditLocationMeta(loc: LocationRef) {
    return this.managesCompany(loc.companyId);
  }

  /** Indrapportering af data for lokationen (bruges fra fase 2) */
  canReportLocation(loc: LocationRef) {
    return this.managesCompany(loc.companyId) || this.contributesTo(loc.id);
  }

  canInvite(target: { role: Role; companyId?: string | null; location?: LocationRef | null }) {
    if (this.isAdmin) return true;
    switch (target.role) {
      case "COMPANY_MANAGER":
        return !!target.companyId && this.managesCompany(target.companyId);
      case "LOCATION_CONTRIBUTOR":
        return !!target.location && this.managesCompany(target.location.companyId);
      default:
        return false;
    }
  }

  /** Selskabs-id'er brugeren direkte er tilknyttet (bruges til at filtrere lister) */
  scopedCompanyIds(locations: LocationRef[] = []): Set<string> {
    const ids = new Set<string>();
    for (const m of this.ms) {
      if (m.companyId) ids.add(m.companyId);
      if (m.locationId) {
        const loc = locations.find((l) => l.id === m.locationId);
        if (loc) ids.add(loc.companyId);
      }
    }
    return ids;
  }
}

/** Gyldige forældre for et selskab: samme org, ikke sig selv og ikke en efterkommer (undgår cykler). */
export function validParentIds(
  companies: { id: string; parentId: string | null }[],
  companyId: string | null,
): Set<string> {
  const all = new Set(companies.map((c) => c.id));
  if (!companyId) return all;
  const excluded = new Set<string>([companyId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of companies) {
      if (c.parentId && excluded.has(c.parentId) && !excluded.has(c.id)) {
        excluded.add(c.id);
        changed = true;
      }
    }
  }
  return new Set([...all].filter((id) => !excluded.has(id)));
}
