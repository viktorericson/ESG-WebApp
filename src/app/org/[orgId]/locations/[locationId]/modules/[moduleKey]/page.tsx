import { ModulePage } from "@/components/module-page";
import { deny } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function LocationModulePage({ params, searchParams }: PageProps<"/org/[orgId]/locations/[locationId]/modules/[moduleKey]">) {
  const { orgId, locationId, moduleKey } = await params;
  const { period } = await searchParams;
  const location = await db.location.findFirst({ where: { id: locationId, company: { organizationId: orgId } } });
  if (!location) deny();
  const locationHref = `/org/${orgId}/locations/${locationId}`;

  return (
    <ModulePage
      orgId={orgId}
      moduleKey={moduleKey}
      target={{ companyId: location.companyId, locationId }}
      periodParam={period}
      backHref={locationHref}
      backLabel="Lokation"
      basePath={`${locationHref}/modules/${moduleKey}`}
    />
  );
}
