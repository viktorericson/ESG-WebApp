import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, Input, PageHeader, Select } from "@/components/ui";
import { copyFactorSet, setPeriodFactorSet } from "@/lib/actions/factors";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Emissionsfaktorer" };

export default async function FactorSetsPage({ params }: PageProps<"/org/[orgId]/settings/factors">) {
  const { orgId } = await params;
  const { access } = await requireOrgAccess(orgId);
  if (!access.canViewAll) deny();

  const [sets, periods] = await Promise.all([
    db.factorSet.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: orgId }] },
      include: { _count: { select: { factors: true } }, basedOn: true },
      orderBy: [{ organizationId: "asc" }, { createdAt: "asc" }],
    }),
    db.reportingPeriod.findMany({ where: { organizationId: orgId }, orderBy: { year: "desc" } }),
  ]);
  const yearRanges = await db.emissionFactor.groupBy({ by: ["setId"], _min: { year: true }, _max: { year: true } });
  const range = (id: string) => yearRanges.find((r) => r.setId === id);
  const defaultSet = sets.find((s) => s.isDefault && !s.organizationId);

  return (
    <>
      <Link href={`/org/${orgId}/settings`} className="text-sm text-neutral-600 hover:text-neutral-900">← Indstillinger</Link>
      <PageHeader
        title="Emissionsfaktorer"
        description="Beregningerne bruger Klimakompassets emissionsfaktorer som standard. Du kan oprette et eget faktorsæt som kopi og rette enkelte faktorer, fx leverandørspecifikke værdier."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Faktorsæt" />
          <ul className="divide-y divide-neutral-100">
            {sets.map((s) => {
              const r = range(s.id);
              return (
                <li key={s.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/org/${orgId}/settings/factors/${s.id}`} className="font-medium text-brand-700 hover:underline">
                      {s.name} {s.version}
                    </Link>
                    {s.isDefault && !s.organizationId && <Badge>Standard</Badge>}
                    {s.organizationId ? <Badge>Eget sæt</Badge> : <Badge>Officielt</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {s._count.factors.toLocaleString("da-DK")} faktorer{r?._min.year ? ` · ${r._min.year}–${r._max.year}` : ""}
                    {s.basedOn ? ` · kopi af ${s.basedOn.name} ${s.basedOn.version}` : ""}
                  </p>
                  {s.description && <p className="mt-1 text-xs text-neutral-500">{s.description}</p>}
                  {s.sourceUrl && !s.organizationId && (
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-neutral-500 underline">
                      Kilde
                    </a>
                  )}
                  {access.canManageOrg && !s.organizationId && (
                    <ActionForm action={copyFactorSet} className="mt-3 flex flex-wrap gap-2">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="setId" value={s.id} />
                      <Input name="name" placeholder={`${s.name} (egen tilpasning)`} className="max-w-xs py-1.5" aria-label="Navn på eget sæt" />
                      <SubmitButton variant="secondary" pendingText="Kopierer…">Kopiér til eget sæt</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="self-start">
          <CardHeader title="Faktorsæt pr. rapporteringsår" description="Uden valg bruges standardsættet. Faktorerne for selve rapporteringsåret anvendes." />
          {periods.length === 0 ? (
            <p className="px-5 py-4 text-sm text-neutral-500">Ingen rapporteringsår.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {periods.map((p) => (
                <li key={p.id} className="px-5 py-3">
                  {access.canManageOrg ? (
                    <ActionForm action={setPeriodFactorSet} className="flex items-center gap-2">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="periodId" value={p.id} />
                      <span className="w-12 font-semibold tabular-nums">{p.year}</span>
                      <Select name="setId" defaultValue={p.factorSetId ?? ""} aria-label={`Faktorsæt for ${p.year}`} className="py-1.5">
                        <option value="">Standard{defaultSet ? ` (${defaultSet.name} ${defaultSet.version})` : ""}</option>
                        {sets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.version}
                          </option>
                        ))}
                      </Select>
                      <SubmitButton variant="secondary" pendingText="…" className="px-2.5 py-1.5">Gem</SubmitButton>
                    </ActionForm>
                  ) : (
                    <p className="text-sm">
                      <span className="mr-3 font-semibold">{p.year}</span>
                      {sets.find((s) => s.id === p.factorSetId)?.name ?? "Standard"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
