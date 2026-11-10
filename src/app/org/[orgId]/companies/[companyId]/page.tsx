import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CompanyForm } from "@/components/company-form";
import { InviteForm } from "@/components/invite-form";
import { LocationFields } from "@/components/location-fields";
import { MemberList } from "@/components/member-list";
import { Badge, buttonStyles, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { archiveCompany, archiveLocation, createLocation, updateCompany, updateLocation } from "@/lib/actions/org";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { getInviteOptions, getMembersAndInvites, getVisibleCompanies } from "@/lib/org-data";
import { validParentIds } from "@/lib/permissions";
import { LEGAL_FORM_LABELS, LOCATION_CONTROL_LABELS } from "@/lib/validation";
import { ModuleList, PeriodSwitcher } from "@/components/module-list";
import { modulesFor } from "@/lib/forms/registry";
import { formContext, moduleStatuses } from "@/lib/module-data";
import { getPeriods, pickPeriod } from "@/lib/periods";

const dateFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });

export default async function CompanyPage({ params, searchParams }: PageProps<"/org/[orgId]/companies/[companyId]">) {
  const { orgId, companyId } = await params;
  const { period: periodParam } = await searchParams;
  const { user, access } = await requireOrgAccess(orgId);
  const companies = await getVisibleCompanies(orgId, access);
  const company = companies.find((c) => c.id === companyId);
  if (!company) deny();

  const canEdit = access.canEditCompany(companyId);
  const canSeeData = access.canViewAll || access.managesCompany(companyId);
  const periods = await getPeriods(orgId);
  const period = pickPeriod(periods, periodParam);
  const [statuses, dataCtx] = period
    ? await Promise.all([moduleStatuses(period.id, `company:${companyId}`), formContext(period.id, companyId)])
    : [new Map(), null];
  const allCompanies = await db.company.findMany({ where: { organizationId: orgId, archivedAt: null }, select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } });
  const allowedParents = validParentIds(allCompanies, companyId);
  const parent = allCompanies.find((c) => c.id === company.parentId);
  const children = allCompanies.filter((c) => c.parentId === companyId);
  const members = canEdit ? await getMembersAndInvites(orgId, companyId) : null;
  const inviteOptions = getInviteOptions(access, companies);
  const companyInviteOptions = {
    roles: inviteOptions.roles.filter((r) => r === "COMPANY_MANAGER" || r === "LOCATION_CONTRIBUTOR"),
    companies: inviteOptions.companies.filter((c) => c.id === companyId),
    locations: inviteOptions.locations.filter((l) => company.locations.some((x) => x.id === l.id)),
  };

  return (
    <>
      <Link href={`/org/${orgId}`} className="text-sm text-neutral-500 hover:text-neutral-800">← Overblik</Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {company.name}
            {!company.parentId && <Badge tone="green">Moderselskab</Badge>}
            {!company.consolidate && <Badge tone="amber">Ikke konsolideret</Badge>}
          </span>
        }
        description={
          <>
            CVR {company.cvr}
            {parent && (
              <>
                {" · Datterselskab af "}
                <Link className="underline underline-offset-2" href={`/org/${orgId}/companies/${parent.id}`}>{parent.name}</Link>
              </>
            )}
          </>
        }
        action={
          access.canManageOrg && (
            <Link href={`/org/${orgId}/companies/new?parent=${companyId}`} className={buttonStyles.secondary}>
              Tilføj datterselskab
            </Link>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Indrapportering */}
          {canSeeData && (
            <Card>
              <CardHeader
                title={period ? `Indrapportering ${period.year}` : "Indrapportering"}
                description="Selskabets moduler. Lokationernes moduler findes på hver lokation."
                action={period && <PeriodSwitcher periods={periods} current={period.id} hrefFor={(id) => `/org/${orgId}/companies/${companyId}?period=${id}`} />}
              />
              {period && dataCtx ? (
                <ModuleList
                  modules={modulesFor("company")}
                  statuses={statuses}
                  comprehensive={dataCtx.comprehensive}
                  hrefFor={(m) => `/org/${orgId}/companies/${companyId}/modules/${m.key}?period=${period.id}`}
                />
              ) : (
                <EmptyState>Der er ikke oprettet et rapporteringsår endnu. {access.canManageOrg ? "Opret det under Rapporter." : "Kontakt koncernadmin."}</EmptyState>
              )}
            </Card>
          )}

          {/* Lokationer */}
          <Card>
            <CardHeader title="Lokationer og faciliteter" description="Alle lokationer selskabet ejer, lejer eller driver/forvalter. Hver lokation indrapporterer energi, vand og affald." />
            {company.locations.length === 0 ? (
              <EmptyState>Ingen lokationer endnu.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {company.locations.map((loc) => (
                  <li key={loc.id} className="px-5 py-3">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <Link href={`/org/${orgId}/locations/${loc.id}${period ? `?period=${period.id}` : ""}`} className="font-medium text-brand-700 hover:underline">
                          {loc.name}
                        </Link>
                        <span className="text-neutral-600">{loc.address}</span>
                        <Badge>{LOCATION_CONTROL_LABELS[loc.control]}</Badge>
                        {loc.latitude === null ? <Badge tone="amber">Mangler geolokation</Badge> : null}
                        {loc.operationalTo && loc.operationalTo < new Date() ? <Badge tone="red">Ophørt</Badge> : null}
                        {canEdit && <span className="ml-auto text-xs text-neutral-500 group-open:hidden">Redigér</span>}
                      </summary>
                      <div className="mt-1 space-y-0.5 text-sm text-neutral-500">
                        {loc.function && <p>{loc.function}</p>}
                        {loc.latitude !== null && loc.longitude !== null && (
                          <p>
                            <a
                              className="underline underline-offset-2 hover:text-neutral-800"
                              href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=16/${loc.latitude}/${loc.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                            </a>
                          </p>
                        )}
                        {(loc.operationalFrom || loc.operationalTo) && (
                          <p>
                            I drift {loc.operationalFrom ? `fra ${dateFmt.format(loc.operationalFrom)}` : ""}
                            {loc.operationalTo ? ` til ${dateFmt.format(loc.operationalTo)}` : ""}
                          </p>
                        )}
                      </div>
                      {access.canEditLocationMeta(loc) && (
                        <div className="mt-4 space-y-3 rounded-md bg-neutral-50 p-4">
                          <ActionForm action={updateLocation} className="space-y-3">
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="locationId" value={loc.id} />
                            <LocationFields loc={loc} idPrefix={loc.id} />
                            <SubmitButton>Gem lokation</SubmitButton>
                          </ActionForm>
                          <ActionForm action={archiveLocation} confirm={`Arkivér lokationen "${loc.name}"?`}>
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="locationId" value={loc.id} />
                            <SubmitButton variant="danger" pendingText="Arkiverer…">Arkivér lokation</SubmitButton>
                          </ActionForm>
                        </div>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="border-t border-neutral-200 bg-neutral-50/50 px-5 py-4">
                <h3 className="mb-3 text-sm font-semibold">Tilføj lokation</h3>
                <ActionForm action={createLocation} className="space-y-3" resetOnSuccess>
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="companyId" value={companyId} />
                  <LocationFields idPrefix="new" />
                  <SubmitButton pendingText="Tilføjer…">Tilføj lokation</SubmitButton>
                </ActionForm>
              </div>
            )}
          </Card>

          {/* Stamdata */}
          <Card>
            <CardHeader title="Stamdata (B1)" description="Grundlæggende oplysninger, der bruges i rapportens afsnit om grundlag for udarbejdelse." />
            {canEdit ? (
              <CompanyForm
                action={updateCompany}
                orgId={orgId}
                company={company}
                parentOptions={allCompanies.filter((c) => allowedParents.has(c.id))}
                canEditStructure={access.canManageOrg}
                submitLabel="Gem stamdata"
              />
            ) : (
              <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
                <div><dt className="text-neutral-500">Adresse</dt><dd>{company.address ?? "–"}</dd></div>
                <div><dt className="text-neutral-500">Juridisk form</dt><dd>{company.legalForm ? LEGAL_FORM_LABELS[company.legalForm] : "–"}</dd></div>
                <div><dt className="text-neutral-500">NACE-kode(r)</dt><dd>{company.naceCodes.join(", ") || "–"}</dd></div>
              </dl>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          {children.length > 0 && (
            <Card>
              <CardHeader title="Datterselskaber" />
              <ul className="divide-y divide-neutral-100 text-sm">
                {children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/org/${orgId}/companies/${c.id}`} className="block px-5 py-2.5 hover:bg-neutral-50">{c.name}</Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {members && (
            <Card>
              <CardHeader title="Brugere" description="Personer med adgang til selskabet eller dets lokationer." />
              <MemberList orgId={orgId} data={members} access={access} currentUserId={user.id} />
            </Card>
          )}

          {companyInviteOptions.companies.length > 0 && (
            <Card>
              <CardHeader title="Invitér" />
              <InviteForm orgId={orgId} options={companyInviteOptions} defaultCompanyId={companyId} />
            </Card>
          )}

          {access.canManageOrg && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Arkivér selskab</h3>
              <p className="mt-1 mb-3 text-xs text-neutral-500">Selskabet skjules og indgår ikke i rapporter. Data slettes ikke.</p>
              <ActionForm action={archiveCompany} confirm={`Arkivér ${company.name}?`}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="companyId" value={companyId} />
                <SubmitButton variant="danger" pendingText="Arkiverer…">Arkivér</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
