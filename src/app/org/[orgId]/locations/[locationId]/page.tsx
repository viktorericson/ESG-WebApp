import Link from "next/link";
import { ModuleList, PeriodSwitcher } from "@/components/module-list";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { modulesFor } from "@/lib/forms/registry";
import { formContext, moduleStatuses } from "@/lib/module-data";
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
  const [statuses, ctx] = period
    ? await Promise.all([moduleStatuses(period.id, `location:${locationId}`), formContext(period.id, location.companyId)])
    : [new Map(), null];
  const base = `/org/${orgId}/locations/${locationId}`;
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
