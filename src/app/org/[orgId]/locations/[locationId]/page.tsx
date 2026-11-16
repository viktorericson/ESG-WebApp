import Link from "next/link";
import { ModuleList, PeriodSwitcher } from "@/components/module-list";
import { Badge, buttonStyles, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDoneStatus, modulesFor, requiredModules } from "@/lib/forms/registry";
import { formContext, lockReasonFor, moduleStatuses } from "@/lib/module-data";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { LOCATION_CONTROL_LABELS } from "@/lib/validation";

const dateFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });

export default async function LocationPage({ params, searchParams }: PageProps<"/org/[orgId]/locations/[locationId]">) {
  const { orgId, locationId } = await params;
  const { period: periodParam } = await searchParams;
  const { access } = await requireOrgAccess(orgId);
  const location = await db.location.findFirst({ where: { id: locationId, archivedAt: null, company: { organizationId: orgId } }, include: { company: true } });
  if (!location || !access.canViewLocation(location)) deny();

  const periods = await getPeriods(orgId);
  const period = pickPeriod(periods, periodParam);
  const ctx = period ? await formContext(period.id, location.companyId) : null;
  const statuses = period && ctx ? await moduleStatuses(period.id, `location:${locationId}`, ctx) : new Map();
  const base = `/org/${orgId}/locations/${locationId}`;
  const lockReason = period ? await lockReasonFor(period.id, location.companyId) : null;
  const required = ctx ? requiredModules("location", ctx.comprehensive) : [];
  // Moduler, der kun mangler at blive markeret færdige, kommer først – de er hurtigst at lukke
  const open = required.filter((m) => !isDoneStatus(statuses.get(m.key)?.status)).sort((a, b) => Number(!!statuses.get(b.key)?.ready) - Number(!!statuses.get(a.key)?.ready));
  const fillable = open.filter((m) => statuses.get(m.key)?.ready).length;
  const doneCount = required.length - open.length;
  const canReport = access.canReportLocation(location);
  const managesCompany = access.managesCompany(location.companyId);
  const canSeeCompany = access.canViewCompany(location.companyId, [location]);

  return (
    <>
      {canSeeCompany && (
        <Link href={`/org/${orgId}/companies/${location.companyId}${period ? `?period=${period.id}` : ""}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← {location.company.name}
        </Link>
      )}
      <PageHeader
        title={location.name}
        description={
          <>
            {location.address} · {LOCATION_CONTROL_LABELS[location.control]} · {location.company.name}
          </>
        }
      />
      {period && required.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 text-sm">
          <div className="min-w-56 flex-1">
            <p className="font-semibold">
              {lockReason ? "🔒 Data er låst" : open.length === 0 ? "✓ Alle lokationens moduler er færdige" : `${doneCount} af ${required.length} moduler er færdige`}
            </p>
            <p className="mt-0.5 text-neutral-600">
              {lockReason ??
                (open.length === 0
                  ? managesCompany
                    ? "Selskabets data indsendes samlet fra selskabssiden, når alle moduler er færdige."
                    : "Du er færdig her. Den selskabsansvarlige indsender selskabets data samlet til koncernen."
                  : canReport
                    ? fillable > 0
                      ? `${fillable} ${fillable === 1 ? "modul er udfyldt og mangler" : "moduler er udfyldt og mangler"} kun at blive markeret som færdige.`
                      : "Et modul er færdigt, når det er markeret “Færdig” eller “Ikke relevant”. Dine svar gemmes automatisk."
                    : "Du har læseadgang til lokationens data.")}
            </p>
            <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Færdige moduler" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={required.length}>
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(doneCount / required.length) * 100}%` }} />
            </div>
          </div>
          {!lockReason && canReport && open[0] ? (
            <Link href={`${base}/modules/${open[0].key}?period=${period.id}`} className={`${buttonStyles.primary} whitespace-nowrap`}>
              {statuses.get(open[0].key)?.ready ? "Markér færdig" : doneCount > 0 || statuses.size > 0 ? "Fortsæt" : "Start"}: {open[0].title} →
            </Link>
          ) : (
            !lockReason && open.length === 0 && managesCompany && (
              <Link href={`/org/${orgId}/companies/${location.companyId}?period=${period.id}`} className={`${buttonStyles.primary} whitespace-nowrap`}>
                Til selskabets indsendelse →
              </Link>
            )
          )}
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader
            title={period ? `Indrapportering ${period.year}` : "Indrapportering"}
            description="Energi, vand, affald og øvrige data for lokationen."
            action={period && <PeriodSwitcher periods={periods} current={period.id} hrefFor={(id) => `${base}?period=${id}`} />}
          />
          {period && ctx ? (
            <ModuleList modules={modulesFor("location")} statuses={statuses} comprehensive={ctx.comprehensive} hrefFor={(m) => `${base}/modules/${m.key}?period=${period.id}`} />
          ) : (
            <EmptyState>Der er ikke oprettet et rapporteringsår endnu.</EmptyState>
          )}
        </Card>
        <Card className="self-start px-5 py-4 text-sm">
          <h2 className="font-semibold">Stamdata</h2>
          <dl className="mt-3 space-y-2">
            <div><dt className="text-xs text-neutral-500">Funktion</dt><dd>{location.function ?? "–"}</dd></div>
            <div>
              <dt className="text-xs text-neutral-500">Geolokation</dt>
              <dd>{location.latitude !== null && location.longitude !== null ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : <Badge tone="amber" icon="!">Mangler</Badge>}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Driftsperiode</dt>
              <dd>
                {location.operationalFrom || location.operationalTo
                  ? `${location.operationalFrom ? dateFmt.format(location.operationalFrom) : "…"} – ${location.operationalTo ? dateFmt.format(location.operationalTo) : "i drift"}`
                  : "Hele perioden"}
              </dd>
            </div>
          </dl>
          {access.canEditLocationMeta(location) && (
            <Link href={`/org/${orgId}/companies/${location.companyId}`} className="mt-3 inline-block text-xs text-brand-700 hover:underline">
              Ret stamdata under selskabet
            </Link>
          )}
        </Card>
      </div>
    </>
  );
}
