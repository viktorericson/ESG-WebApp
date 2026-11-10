/**
 * Skemamotor – rene funktioner: synlighed, sanering, validering og fremdrift.
 */
import {
  EVIDENCE_KEY,
  META_KEY,
  type Answers,
  type ColumnDef,
  type DataSource,
  type Evidence,
  type FieldDef,
  type FormContext,
  type ModuleDef,
  type ModuleWarning,
  type SectionDef,
  type SectionMeta,
} from "./types";

export function sectionVisible(s: SectionDef, a: Answers, ctx: FormContext) {
  if (s.cOnly && !ctx.comprehensive) return false;
  return s.showIf ? s.showIf(a, ctx) : true;
}

export function fieldVisible(f: FieldDef, a: Answers, ctx: FormContext) {
  if (f.cOnly && !ctx.comprehensive) return false;
  return f.showIf ? f.showIf(a, ctx) : true;
}

export function fieldRequired(f: FieldDef, a: Answers, ctx: FormContext) {
  return typeof f.required === "function" ? f.required(a, ctx) : !!f.required;
}

export function sectionMeta(a: Answers, key: string): SectionMeta {
  const all = (a[META_KEY] ?? {}) as Record<string, SectionMeta>;
  return all[key] ?? {};
}

export function sectionEvidence(a: Answers, key: string): Evidence {
  const all = (a[EVIDENCE_KEY] ?? {}) as Record<string, Evidence>;
  return all[key] ?? {};
}

// ---------- Sanering (server) ----------

const str = (v: unknown, max = 5000): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** Accepterer tal og strenge med dansk decimalkomma */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Kolonnens valgmuligheder – statiske eller fra konteksten */
export function columnOptions(col: ColumnDef, ctx?: FormContext) {
  return col.dynamicOptions === "locations" ? (ctx?.locations ?? []) : (col.options ?? []);
}

function cleanCell(col: ColumnDef, v: unknown, ctx?: FormContext): unknown {
  switch (col.type) {
    case "number":
      return toNumber(v);
    case "select":
      if (typeof v !== "string") return null;
      // Uden kontekst (fx i tests) accepteres dynamiske værdier, som serveren validerer med kontekst
      if (col.dynamicOptions && !ctx) return v.slice(0, 40);
      return columnOptions(col, ctx).some((o) => o.value === v) ? v : null;
    case "date":
      return isDate(v) ? v : null;
    default:
      return str(v, 1000);
  }
}

function cleanField(f: FieldDef, v: unknown, ctx?: FormContext): unknown {
  switch (f.type) {
    case "text":
      return str(v, 1000);
    case "textarea":
      return str(v, 10000);
    case "date":
      return isDate(v) ? v : null;
    case "number":
      return toNumber(v);
    case "quantity": {
      const q = (v ?? {}) as Record<string, unknown>;
      const unit = typeof q.unit === "string" && f.units.includes(q.unit) ? q.unit : null;
      const value = toNumber(q.value);
      return value === null && unit === null ? null : { value, unit };
    }
    case "select":
    case "radio":
      return typeof v === "string" && f.options.some((o) => o.value === v) ? v : null;
    case "yesno":
      return v === "yes" || v === "no" ? v : null;
    case "table": {
      if (!Array.isArray(v)) return [];
      return v.slice(0, 500).map((row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        const out: Record<string, unknown> = { _id: typeof r._id === "string" ? r._id.slice(0, 40) : crypto.randomUUID() };
        for (const col of f.columns) out[col.key] = cleanCell(col, r[col.key], ctx);
        return out;
      });
    }
  }
}

/**
 * Fjerner ukendte nøgler og tvinger værdier til feltets type. Skjulte felters værdier bevares.
 * Med kontekst valideres dynamiske valgmuligheder (fx at en lokation hører til selskabet).
 */
export function sanitizeAnswers(def: ModuleDef, input: Answers, ctx?: FormContext): Answers {
  const out: Answers = {};
  const meta: Record<string, SectionMeta> = {};
  const evidence: Record<string, Evidence> = {};
  const inMeta = (input[META_KEY] ?? {}) as Record<string, SectionMeta>;
  const inEv = (input[EVIDENCE_KEY] ?? {}) as Record<string, Evidence>;

  for (const s of def.sections) {
    for (const f of s.fields) {
      if (f.key in input) out[f.key] = cleanField(f, input[f.key], ctx);
    }
    const m = inMeta[s.key];
    if (m?.missing) meta[s.key] = { missing: true, missingReason: str(m.missingReason, 2000) ?? undefined };
    if (s.evidence && inEv[s.key]) {
      const e = inEv[s.key];
      const sources: DataSource[] = Array.isArray(e.sources)
        ? e.sources.slice(0, 20).map((d) => ({
            system: str(d?.system, 200) ?? undefined,
            department: str(d?.department, 200) ?? undefined,
            person: str(d?.person, 200) ?? undefined,
            role: str(d?.role, 200) ?? undefined,
          }))
        : [];
      evidence[s.key] = { sources, comment: str(e.comment, 5000) ?? undefined };
    }
  }
  if (Object.keys(meta).length) out[META_KEY] = meta;
  if (Object.keys(evidence).length) out[EVIDENCE_KEY] = evidence;
  return out;
}

// ---------- Validering og fremdrift ----------

export function isEmpty(f: FieldDef, v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (f.type === "quantity") {
    const q = v as { value: unknown; unit: unknown };
    return q.value === null || q.value === undefined || !q.unit;
  }
  if (f.type === "table") return !Array.isArray(v) || v.length === 0;
  return false;
}

export type FieldIssue = { section: string; field: string; message: string; row?: number };

export type SectionProgress = {
  key: string;
  visible: boolean;
  required: number;
  filled: number;
  missingMarked: boolean;
  /** Alle krævede felter udfyldt, eller markeret "data mangler" med begrundelse */
  done: boolean;
};

export type ModuleEvaluation = {
  sections: SectionProgress[];
  issues: FieldIssue[];
  /** Ikke-blokerende advarsler fra modulets checks (kun for synlige sektioner) */
  warnings: ModuleWarning[];
  required: number;
  filled: number;
  /** Kan markeres som færdig */
  complete: boolean;
  /** Der er indtastet noget */
  started: boolean;
};

function validateValue(f: FieldDef, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (f.type === "number") {
    const n = v as number;
    if (f.min !== undefined && n < f.min) return `Skal være mindst ${f.min}`;
    if (f.max !== undefined && n > f.max) return `Må højst være ${f.max}`;
    if (f.integer && !Number.isInteger(n)) return "Skal være et helt tal";
  }
  if (f.type === "quantity") {
    const q = v as { value: number | null; unit: string | null };
    if (q.value !== null && f.min !== undefined && q.value < f.min) return `Skal være mindst ${f.min}`;
    if (q.value !== null && !q.unit) return "Vælg enhed";
    if (q.value === null && q.unit) return "Angiv mængde";
  }
  return null;
}

export function evaluateModule(def: ModuleDef, a: Answers, ctx: FormContext): ModuleEvaluation {
  const issues: FieldIssue[] = [];
  const sections: SectionProgress[] = [];
  let started = false;

  for (const s of def.sections) {
    const visible = sectionVisible(s, a, ctx);
    const meta = sectionMeta(a, s.key);
    let required = 0;
    let filled = 0;

    if (visible) {
      for (const f of s.fields) {
        if (!fieldVisible(f, a, ctx)) continue;
        const v = a[f.key];
        if (!isEmpty(f, v)) started = true;
        const err = validateValue(f, v);
        if (err) issues.push({ section: s.key, field: f.key, message: err });

        if (f.type === "table" && Array.isArray(v)) {
          v.forEach((row: Record<string, unknown>, i) => {
            for (const col of f.columns) {
              if (col.required && (row[col.key] === null || row[col.key] === undefined || row[col.key] === "")) {
                issues.push({ section: s.key, field: f.key, row: i, message: `Række ${i + 1}: udfyld “${col.label}”` });
              }
            }
          });
        }

        if (fieldRequired(f, a, ctx)) {
          required++;
          if (!isEmpty(f, v) && !err) filled++;
        }
      }
    }
    const missingMarked = !!meta.missing && !!meta.missingReason;
    if (meta.missing) started = true;
    const rowIssues = issues.some((i) => i.section === s.key);
    sections.push({ key: s.key, visible, required, filled, missingMarked, done: !visible || missingMarked || (filled === required && !rowIssues) });
  }

  const vis = sections.filter((s) => s.visible);
  const visibleKeys = new Set(vis.map((s) => s.key));
  const warnings = (def.checks?.(a, ctx) ?? []).filter((w) => visibleKeys.has(w.section));
  return {
    sections,
    issues,
    warnings,
    required: vis.reduce((n, s) => n + (s.missingMarked ? 0 : s.required), 0),
    filled: vis.reduce((n, s) => n + (s.missingMarked ? 0 : s.filled), 0),
    complete: def.sections.length > 0 && sections.every((s) => s.done),
    started,
  };
}

/** Status efter gem: et færdigt modul der bliver ufuldstændigt, falder tilbage til "i gang". */
export function nextStatus(
  current: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "NOT_RELEVANT",
  ev: ModuleEvaluation,
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "NOT_RELEVANT" {
  if (current === "NOT_RELEVANT") return current;
  if (current === "COMPLETED" && ev.complete) return current;
  return ev.started ? "IN_PROGRESS" : "NOT_STARTED";
}

/** >10 ansatte: mange B-punkter er kun obligatoriske over denne grænse */
export const over10 = (_a: Answers, ctx: FormContext) => ctx.employees === null || ctx.employees > 10;
export const isYes = (key: string) => (a: Answers) => a[key] === "yes";

/** Summerer en talkolonne i en tabel (tomme/ugyldige celler ignoreres) */
export function sumColumn(a: Answers, tableKey: string, column: string, where?: (row: Record<string, unknown>) => boolean): number {
  const rows = Array.isArray(a[tableKey]) ? (a[tableKey] as Record<string, unknown>[]) : [];
  return rows.filter((r) => !where || where(r)).reduce((n, r) => n + (toNumber(r[column]) ?? 0), 0);
}

export const num = (a: Answers, key: string): number | null => toNumber(a[key]);
