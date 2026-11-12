import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { deleteFactorSet, updateFactor } from "@/lib/actions/factors";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";

const PAGE = 100;
const nf = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 6 });

export default async function FactorSetPage({ params, searchParams }: PageProps<"/org/[orgId]/settings/factors/[setId]">) {
  const { orgId, setId } = await params;
  const sp = await searchParams;
  const { access } = await requireOrgAccess(orgId);
  if (!access.canViewAll) deny();
  const set = await db.factorSet.findFirst({ where: { id: setId, OR: [{ organizationId: null }, { organizationId: orgId }] } });
  if (!set) deny();
  const editable = access.canManageOrg && set.organizationId === orgId;

  const years = (await db.emissionFactor.findMany({ where: { setId }, distinct: ["year"], select: { year: true }, orderBy: { year: "asc" } })).map((y) => y.year);
  const categories = (await db.emissionFactor.findMany({ where: { setId }, distinct: ["category"], select: { mainCategory: true, category: true }, orderBy: [{ mainCategory: "asc" }, { category: "asc" }] }));
  const thisYear = new Date().getFullYear();
  const year = Number(sp.year) || (years.includes(thisYear) ? thisYear : years.at(-1)) || thisYear;
  const category = typeof sp.category === "string" ? sp.category : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const customizedOnly = sp.customized === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const where = {
    setId,
    year,
    ...(category ? { category } : {}),
    ...(customizedOnly ? { customized: true } : {}),
    ...(q ? { OR: [{ key: { contains: q, mode: "insensitive" as const } }, { parameter2: { contains: q, mode: "insensitive" as const } }, { parameter1: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [total, factors] = await Promise.all([
    db.emissionFactor.count({ where }),
    db.emissionFactor.findMany({ where, orderBy: [{ category: "asc" }, { key: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
  ]);
  const qs = (p: number) => new URLSearchParams({ year: String(year), ...(category && { category }), ...(q && { q }), ...(customizedOnly && { customized: "1" }), page: String(p) }).toString();

  return (
    <>
      <Link href={`/org/${orgId}/settings/factors`} className="text-sm text-neutral-600 hover:text-neutral-900">← Emissionsfaktorer</Link>
      <PageHeader
        title={`${set.name} ${set.version}`}
        description={editable ? "Eget faktorsæt. Rettede faktorer markeres og bruges i alle år, der anvender sættet." : "Officielt faktorsæt – kan ikke rettes. Kopiér det for at lave egne tilpasninger."}
      />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-neutral-600">
          År
          <Select name="year" defaultValue={String(year)} className="mt-1 w-24 py-1.5">
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-neutral-600">
          Kategori
          <Select name="category" defaultValue={category} className="mt-1 py-1.5">
            <option value="">Alle</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.mainCategory} – {c.category}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-neutral-600">
          Søg
          <Input name="q" defaultValue={q} placeholder="fx Diesel" className="mt-1 w-48 py-1.5" />
        </label>
        {set.organizationId && (
          <label className="flex items-center gap-1.5 pb-2 text-xs text-neutral-600">
            <input type="checkbox" name="customized" value="1" defaultChecked={customizedOnly} className="accent-brand-600" /> Kun rettede
          </label>
        )}
        <Button type="submit" variant="secondary" className="py-1.5">Filtrér</Button>
      </form>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Faktor</th>
                <th className="px-2 py-2 font-medium">Enhed</th>
                <th className="px-2 py-2 text-right font-medium">Scope 1</th>
                <th className="px-2 py-2 text-right font-medium">Scope 2</th>
                <th className="px-2 py-2 text-right font-medium">Scope 3</th>
                <th className="px-2 py-2 text-right font-medium">Udenfor</th>
                {editable && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {factors.map((f) => (
                <tr key={f.id} className="border-b border-neutral-100 align-top">
                  <td className="px-4 py-2">
                    <span className="font-medium">{[f.parameter1, f.parameter2].filter(Boolean).join(" · ") || f.category}</span>
                    {f.customized && <span className="ml-2"><Badge icon="✎">Rettet</Badge></span>}
                    <span className="block text-xs text-neutral-500">{f.mainCategory} – {f.category}</span>
                    {f.source && <span className="block max-w-xl truncate text-xs text-neutral-500" title={f.source}>{f.source}</span>}
                  </td>
                  <td className="px-2 py-2 text-neutral-600">{f.unit}</td>
                  {editable ? (
                    <td colSpan={5} className="px-2 py-2">
                      <ActionForm action={updateFactor} className="flex flex-wrap items-center justify-end gap-1.5">
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="factorId" value={f.id} />
                        {(["scope1", "scope2", "scope3", "outsideScopes"] as const).map((k) => (
                          <Input key={k} name={k} defaultValue={String(f[k]).replace(".", ",")} aria-label={k} inputMode="decimal" className="w-24 py-1 text-right tabular-nums" />
                        ))}
                        <SubmitButton variant="secondary" pendingText="…" className="px-2 py-1 text-xs">Gem</SubmitButton>
                      </ActionForm>
                    </td>
                  ) : (
                    (["scope1", "scope2", "scope3", "outsideScopes"] as const).map((k) => (
                      <td key={k} className="px-2 py-2 text-right tabular-nums">{f[k] ? nf.format(f[k]) : "–"}</td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 text-sm text-neutral-600">
          <span>
            {total.toLocaleString("da-DK")} faktorer i {year} · kg CO₂e pr. enhed
          </span>
          <span className="flex gap-3">
            {page > 1 && <Link href={`?${qs(page - 1)}`} className="text-brand-700 hover:underline">← Forrige</Link>}
            {page * PAGE < total && <Link href={`?${qs(page + 1)}`} className="text-brand-700 hover:underline">Næste →</Link>}
          </span>
        </div>
      </Card>

      {editable && (
        <ActionForm action={deleteFactorSet} confirm={`Slet faktorsættet "${set.name}"? År der bruger det, falder tilbage til standardsættet.`} className="mt-6">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="setId" value={set.id} />
          <SubmitButton variant="danger" pendingText="Sletter…">Slet faktorsæt</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
