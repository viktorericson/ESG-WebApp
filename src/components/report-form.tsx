"use client";

import { useMemo, useState } from "react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui";
import { defaultIncluded, subtree, type Basis } from "@/lib/report-scope";
import {
  REPORT_BASIS_LABELS,
  REPORT_MODULE_LABELS,
  reportBases,
  reportModules,
  type ActionState,
} from "@/lib/validation";

type Company = { id: string; name: string; cvr: string; parentId: string | null; consolidate: boolean };

type Report = {
  id: string;
  name: string;
  module: (typeof reportModules)[number];
  basis: Basis;
  reportingCompanyId: string;
  omissions: string | null;
  companyIds: string[];
};

export function ReportForm({
  action,
  orgId,
  periodId,
  companies,
  report,
  disabled,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  orgId: string;
  periodId?: string;
  companies: Company[];
  report: Report;
  disabled?: boolean;
  submitLabel: string;
}) {
  const [basis, setBasis] = useState<Basis>(report.basis);
  const [rootId, setRootId] = useState(report.reportingCompanyId);
  const [selected, setSelected] = useState(() => new Set(report.companyIds));

  // Når afgrænsningen ændres, foreslås standardvalget igen
  function reset(nextBasis: Basis, nextRoot: string) {
    setBasis(nextBasis);
    setRootId(nextRoot);
    setSelected(new Set(defaultIncluded(companies, nextRoot, nextBasis)));
  }

  const ordered = useMemo(() => {
    // Selskaber i rodens undertræ, i træ-rækkefølge med indrykning
    const inTree = subtree(companies, rootId);
    const out: { company: Company; depth: number }[] = [];
    const walk = (id: string, depth: number) => {
      const c = companies.find((x) => x.id === id);
      if (!c) return;
      out.push({ company: c, depth });
      companies.filter((x) => x.parentId === id && inTree.has(x.id)).forEach((x) => walk(x.id, depth + 1));
    };
    walk(rootId, 0);
    return out;
  }, [companies, rootId]);

  return (
    <ActionForm action={action} className="space-y-5 p-5">
      <input type="hidden" name="orgId" value={orgId} />
      {periodId && <input type="hidden" name="periodId" value={periodId} />}
      <input type="hidden" name="reportId" value={report.id} />

      <fieldset disabled={disabled} className="space-y-5 disabled:opacity-70">
        <div>
          <Label htmlFor="name">Navn</Label>
          <Input id="name" name="name" required defaultValue={report.name} className="mt-1" />
          <FieldError name="name" />
        </div>

        <div>
          <span className="block text-sm font-medium text-neutral-800">Rapportgrundlag</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {reportModules.map((m) => (
              <label key={m} className="flex cursor-pointer items-start gap-2 rounded-md border border-neutral-200 p-3 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
                <input type="radio" name="module" value={m} defaultChecked={report.module === m} className="mt-0.5 accent-brand-600" />
                <span>
                  <span className="font-medium">{REPORT_MODULE_LABELS[m]}</span>
                  <span className="block text-xs text-neutral-500">
                    {m === "BASIC" ? "De mest efterspurgte oplysninger." : "C-felterne vises i modulerne, når dette er valgt."}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="basis">Afgrænsning</Label>
            <Select id="basis" name="basis" value={basis} onChange={(e) => reset(e.target.value as Basis, rootId)} className="mt-1">
              {reportBases.map((b) => (
                <option key={b} value={b}>
                  {REPORT_BASIS_LABELS[b]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="reportingCompanyId">{basis === "CONSOLIDATED" ? "Moderselskab" : "Selskab"}</Label>
            <Select id="reportingCompanyId" name="reportingCompanyId" value={rootId} onChange={(e) => reset(basis, e.target.value)} className="mt-1">
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <FieldError name="reportingCompanyId" />
          </div>
        </div>

        {basis === "CONSOLIDATED" && (
          <div>
            <span className="block text-sm font-medium text-neutral-800">Omfattede selskaber</span>
            <p className="text-xs text-neutral-500">Forvalgt ud fra selskabernes konsolideringsindstilling. Bliver til B1-tabellen over datterselskaber.</p>
            <ul className="mt-2 divide-y divide-neutral-100 rounded-md border border-neutral-200">
              {ordered.map(({ company, depth }) => {
                const isRoot = company.id === rootId;
                return (
                  <li key={company.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2 pr-3 text-sm" style={{ paddingLeft: `${12 + depth * 20}px` }}>
                      <input
                        type="checkbox"
                        name="companyIds"
                        value={company.id}
                        checked={isRoot || selected.has(company.id)}
                        disabled={isRoot}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(company.id);
                          else next.delete(company.id);
                          setSelected(next);
                        }}
                        className="size-4 accent-brand-600"
                      />
                      <span className="font-medium">{company.name}</span>
                      <span className="font-mono text-xs text-neutral-500">{company.cvr}</span>
                      {isRoot && <span className="text-xs text-neutral-500">(rapporterende)</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <FieldError name="companyIds" />
          </div>
        )}

        <div>
          <Label htmlFor="omissions">Undtagelser og udeladelser (B1)</Label>
          <Textarea
            id="omissions"
            name="omissions"
            rows={3}
            defaultValue={report.omissions ?? ""}
            placeholder="Fx oplysninger, der er udeladt fordi de ikke er relevante eller ikke kan fremskaffes, og hvorfor."
            className="mt-1"
          />
        </div>

        <SubmitButton>{submitLabel}</SubmitButton>
      </fieldset>
    </ActionForm>
  );
}
