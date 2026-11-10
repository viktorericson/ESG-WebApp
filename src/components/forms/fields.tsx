"use client";

import type { ReactNode } from "react";
import { Input, Select, Textarea, cx } from "@/components/ui";
import { columnOptions } from "@/lib/forms/engine";
import type { ColumnDef, FieldDef, FormContext, Quantity } from "@/lib/forms/types";

/** Tal vises med dansk decimalkomma; under redigering gemmes den rå tekst */
export function displayNumber(v: unknown): string {
  if (typeof v === "number") return String(v).replace(".", ",");
  return typeof v === "string" ? v : "";
}

export function Help({ info, howTo }: { info?: string; howTo?: string }) {
  if (!info && !howTo) return null;
  return (
    <details className="group mt-1.5 text-xs">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-brand-700 hover:underline">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> Vejledning
      </summary>
      <div className="mt-1.5 space-y-2 rounded-md border border-brand-100 bg-brand-50/60 p-3 leading-relaxed text-neutral-700">
        {info && <p>{info}</p>}
        {howTo && (
          <p>
            <span className="font-semibold">Sådan finder du data: </span>
            {howTo}
          </p>
        )}
      </div>
    </details>
  );
}

export function VsChips({ vs }: { vs?: string[] }) {
  if (!vs?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {vs.map((v) => (
        <span key={v} className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
          {v}
        </span>
      ))}
    </span>
  );
}

function WithUnit({ unit, children }: { unit?: string; children: ReactNode }) {
  if (!unit) return <>{children}</>;
  return (
    <div className="flex items-stretch">
      {children}
      <span className="flex items-center rounded-r-md border border-l-0 border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-500">{unit}</span>
    </div>
  );
}

type FieldProps = {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  required: boolean;
  id: string;
  ctx?: FormContext;
};

export function FieldControl({ field, value, onChange, error, required, id, ctx }: FieldProps) {
  const invalid = error ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "";

  const control = (() => {
    switch (field.type) {
      case "text":
        return <Input id={id} value={(value as string) ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={invalid} />;
      case "textarea":
        return <Textarea id={id} rows={3} value={(value as string) ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={invalid} />;
      case "date":
        return <Input id={id} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={cx("max-w-48", invalid)} />;
      case "number":
        return (
          <WithUnit unit={field.unit}>
            <Input
              id={id}
              inputMode="decimal"
              value={displayNumber(value)}
              placeholder={field.placeholder}
              onChange={(e) => onChange(e.target.value)}
              className={cx("max-w-56", field.unit && "rounded-r-none", invalid)}
            />
          </WithUnit>
        );
      case "quantity": {
        const q = (value ?? {}) as Partial<Quantity> & { value?: unknown };
        return (
          <div className="flex max-w-80 items-stretch">
            <Input
              id={id}
              inputMode="decimal"
              value={displayNumber(q.value)}
              placeholder="Mængde"
              onChange={(e) => onChange({ ...q, value: e.target.value })}
              className={cx("rounded-r-none", invalid)}
            />
            <Select
              aria-label={`${field.label} – enhed`}
              value={q.unit ?? ""}
              onChange={(e) => onChange({ ...q, unit: e.target.value || null })}
              className={cx("w-28 rounded-l-none border-l-0", invalid)}
            >
              <option value="">Enhed</option>
              {field.units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
        );
      }
      case "select":
        return (
          <Select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} className={cx("max-w-md", invalid)}>
            <option value="">Vælg…</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        );
      case "radio":
      case "yesno": {
        const options = field.type === "yesno" ? [{ value: "yes", label: "Ja" }, { value: "no", label: "Nej" }] : field.options;
        return (
          <div role="radiogroup" aria-labelledby={`${id}-label`} className={cx("flex gap-2", field.type === "radio" ? "flex-col" : "flex-wrap")}>
            {options.map((o) => (
              <label
                key={o.value}
                className={cx(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  value === o.value ? "border-brand-500 bg-brand-50" : "border-neutral-200 bg-white hover:bg-neutral-50",
                )}
              >
                <input type="radio" name={id} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-brand-600" />
                {o.label}
              </label>
            ))}
          </div>
        );
      }
      case "table":
        return <TableControl columns={field.columns} rows={(value as Row[]) ?? []} onChange={onChange} addLabel={field.addLabel} ctx={ctx} />;
    }
  })();

  return (
    <div>
      {field.heading && <h3 className="-mx-5 mb-4 border-t border-neutral-100 bg-neutral-50/70 px-5 py-2 text-sm font-semibold text-neutral-900 first:mt-0">{field.heading}</h3>}
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <label id={`${id}-label`} htmlFor={field.type === "radio" || field.type === "yesno" || field.type === "table" ? undefined : id} className="text-sm font-medium text-neutral-800">
          {field.label}
          {required ? <span className="text-red-600"> *</span> : <span className="ml-1 text-xs font-normal text-neutral-400">(valgfrit)</span>}
        </label>
        <VsChips vs={field.vs} />
      </div>
      {control}
      {field.hint && <p className="mt-1 text-xs text-neutral-500">{field.hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <Help info={field.info} howTo={field.howTo} />
    </div>
  );
}

type Row = Record<string, unknown> & { _id: string };

function TableControl({ columns, rows, onChange, addLabel, ctx }: { columns: ColumnDef[]; rows: Row[]; onChange: (v: Row[]) => void; addLabel?: string; ctx?: FormContext }) {
  const update = (i: number, key: string, v: unknown) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-600">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-2 py-1.5 font-medium">
                    {c.label}
                    {c.required && <span className="text-red-600"> *</span>}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row._id} className="border-t border-neutral-100 align-top">
                  {columns.map((c) => (
                    <td key={c.key} className="min-w-32 p-1.5">
                      {c.type === "select" ? (
                        <Select aria-label={c.label} value={(row[c.key] as string) ?? ""} onChange={(e) => update(i, c.key, e.target.value || null)} className="py-1.5">
                          <option value="">Vælg…</option>
                          {columnOptions(c, ctx).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          aria-label={c.label}
                          type={c.type === "date" ? "date" : "text"}
                          inputMode={c.type === "number" ? "decimal" : undefined}
                          value={c.type === "number" ? displayNumber(row[c.key]) : ((row[c.key] as string) ?? "")}
                          placeholder={c.placeholder}
                          onChange={(e) => update(i, c.key, e.target.value)}
                          className="py-1.5"
                        />
                      )}
                    </td>
                  ))}
                  <td className="p-1.5">
                    <button
                      type="button"
                      aria-label={`Fjern række ${i + 1}`}
                      onClick={() => onChange(rows.filter((_, j) => j !== i))}
                      className="rounded px-2 py-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...rows, { _id: crypto.randomUUID() }])}
        className="rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:border-brand-500 hover:text-brand-700"
      >
        + {addLabel ?? "Tilføj række"}
      </button>
    </div>
  );
}
