import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { Card } from "@/components/ui";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { scope1SourcesForLocation } from "@/lib/scope1-links";

export default async function LocationModulePage({ params, searchParams }: PageProps<"/org/[orgId]/locations/[locationId]/modules/[moduleKey]">) {
  const { orgId, locationId, moduleKey } = await params;
  const { period } = await searchParams;
  const { access } = await requireOrgAccess(orgId);
  const location = await db.location.findFirst({ where: { id: locationId, company: { organizationId: orgId } } });
  if (!location || !access.canViewLocation(location)) deny();
  const locationHref = `/org/${orgId}/locations/${locationId}`;

  // Energioverblik: vis scope 1-kilder, som selskabet har knyttet til lokationen (registreres kun ét sted)
  let intro = null;
  if (moduleKey === "location.energy") {
    const p = pickPeriod(await getPeriods(orgId), period);
    const sources = p ? await scope1SourcesForLocation(p.id, location.companyId, locationId) : [];
    const canSeeScope1 = access.canViewAll || access.managesCompany(location.companyId);
    intro = (
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Brændsler og egne anlæg (Scope 1)</h2>
          {canSeeScope1 && p && (
            <Link href={`/org/${orgId}/companies/${location.companyId}/modules/company.scope1?period=${p.id}`} className="text-xs text-brand-700 hover:underline">
              Åbn selskabets Scope 1-modul
            </Link>
          )}
        </div>
        {sources.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Ingen scope 1-kilder er knyttet til lokationen. Gasfyr, oliefyr, køretøjer og kølemidler registreres i selskabets Scope 1-modul og kan knyttes til lokationen dér.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 text-sm">
            {sources.map((s, i) => (
              <li key={i} className="flex gap-3 py-1.5">
                <span className="w-36 shrink-0 text-neutral-500">{s.kind}</span>
                <span className="flex-1">{s.label}</span>
                <span className="tabular-nums">{s.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <ModulePage
      orgId={orgId}
      moduleKey={moduleKey}
      target={{ companyId: location.companyId, locationId }}
      periodParam={period}
      backHref={locationHref}
      backLabel="Lokation"
      basePath={`${locationHref}/modules/${moduleKey}`}
      intro={intro}
    />
  );
}
