import { describe, expect, it } from "vitest";
import { Access, validParentIds, type MembershipLite } from "./permissions";

const ORG = "org1";
const m = (p: Partial<MembershipLite> & Pick<MembershipLite, "role">): MembershipLite => ({
  organizationId: ORG,
  companyId: null,
  locationId: null,
  ...p,
});
const locA1 = { id: "locA1", companyId: "A" };
const locB1 = { id: "locB1", companyId: "B" };

describe("Access", () => {
  it("koncernadmin kan alt", () => {
    const a = new Access([m({ role: "ORG_ADMIN" })], ORG);
    expect(a.canManageOrg).toBe(true);
    expect(a.canEditCompany("A")).toBe(true);
    expect(a.canInvite({ role: "ORG_ADMIN" })).toBe(true);
  });

  it("medlemskab i en anden organisation giver ingen adgang", () => {
    const a = new Access([m({ role: "ORG_ADMIN", organizationId: "other" })], ORG);
    expect(a.isMember).toBe(false);
    expect(a.canViewCompany("A")).toBe(false);
  });

  it("læser kan se alt men ikke redigere eller invitere", () => {
    const a = new Access([m({ role: "VIEWER" })], ORG);
    expect(a.canViewCompany("A")).toBe(true);
    expect(a.canViewLocation(locB1)).toBe(true);
    expect(a.canEditCompany("A")).toBe(false);
    expect(a.canInvite({ role: "LOCATION_CONTRIBUTOR", location: locA1 })).toBe(false);
  });

  it("selskabsansvarlig er begrænset til sit eget selskab", () => {
    const a = new Access([m({ role: "COMPANY_MANAGER", companyId: "A" })], ORG);
    expect(a.canEditCompany("A")).toBe(true);
    expect(a.canEditCompany("B")).toBe(false);
    expect(a.canViewLocation(locA1)).toBe(true);
    expect(a.canViewLocation(locB1)).toBe(false);
    expect(a.canInvite({ role: "LOCATION_CONTRIBUTOR", location: locA1 })).toBe(true);
    expect(a.canInvite({ role: "LOCATION_CONTRIBUTOR", location: locB1 })).toBe(false);
    expect(a.canInvite({ role: "COMPANY_MANAGER", companyId: "A" })).toBe(true);
    expect(a.canInvite({ role: "ORG_ADMIN" })).toBe(false);
    expect(a.canInvite({ role: "VIEWER" })).toBe(false);
  });

  it("lokationsbidragyder kan kun indrapportere for sin lokation", () => {
    const a = new Access([m({ role: "LOCATION_CONTRIBUTOR", locationId: "locA1" })], ORG);
    expect(a.canReportLocation(locA1)).toBe(true);
    expect(a.canReportLocation(locB1)).toBe(false);
    expect(a.canEditLocationMeta(locA1)).toBe(false);
    expect(a.canViewCompany("A", [locA1, locB1])).toBe(true);
    expect(a.canViewCompany("B", [locA1, locB1])).toBe(false);
    expect([...a.scopedCompanyIds([locA1, locB1])]).toEqual(["A"]);
  });
});

describe("validParentIds", () => {
  const companies = [
    { id: "P", parentId: null },
    { id: "A", parentId: "P" },
    { id: "A1", parentId: "A" },
    { id: "B", parentId: "P" },
  ];

  it("udelukker selskabet selv og dets efterkommere", () => {
    expect([...validParentIds(companies, "A")].sort()).toEqual(["B", "P"]);
  });

  it("nyt selskab kan have alle som forælder", () => {
    expect(validParentIds(companies, null).size).toBe(4);
  });
});
