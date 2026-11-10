import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { LEGAL_FORM_LABELS } from "@/lib/validation";

export default async function CompanyModulePage({ params, searchParams }: PageProps<"/org/[orgId]/companies/[companyId]/modules/[moduleKey]">) {
  const { orgId, companyId, moduleKey } = await params;
  const { period } = await searchParams;
  const companyHref = `/org/${orgId}/companies/${companyId}`;

  // B1: vis stamdata, som ikke indtastes pr. år
  let intro = null;
  if (moduleKey === "company.general") {
    const company = await db.company.findFirst({
      where: { id: companyId, organizationId: orgId },
      include: { locations: { where: { archivedAt: null } } },
    });
    if (company) {
      const missingGeo = company.locations.filter((l) => l.latitude === null).length;
      intro = (
        <Card className="px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Stamdata (genbruges hvert år)</h2>
            <Link href={companyHref} className="text-xs text-brand-700 hover:underline">Ret stamdata</Link>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-neutral-500">CVR</dt><dd className="font-mono">{company.cvr}</dd></div>
            <div><dt className="text-xs text-neutral-500">Juridisk form</dt><dd>{company.legalForm ? LEGAL_FORM_LABELS[company.legalForm] : <span className="text-amber-700">Mangler</span>}</dd></div>
            <div><dt className="text-xs text-neutral-500">NACE-kode(r)</dt><dd>{company.naceCodes.join(", ") || <span className="text-amber-700">Mangler</span>}</dd></div>
            <div>
              <dt className="text-xs text-neutral-500">Lokationer (B1 pkt. 27e vii)</dt>
              <dd>
                {company.locations.length}
                {missingGeo > 0 && <span className="text-amber-700"> · {missingGeo} uden geolokation</span>}
              </dd>
            </div>
          </dl>
        </Card>
      );
    }
  }

  return (
    <ModulePage
      orgId={orgId}
      moduleKey={moduleKey}
      target={{ companyId }}
      periodParam={period}
      backHref={companyHref}
      backLabel="Selskab"
      basePath={`${companyHref}/modules/${moduleKey}`}
      intro={intro}
    />
  );
}
