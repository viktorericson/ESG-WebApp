"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Card, Textarea, cx } from "@/components/ui";
import { saveModuleAnswers, setModuleStatus } from "@/lib/actions/module-data";
import { evaluateModule, fieldRequired, fieldVisible, sanitizeAnswers, sectionEvidence, sectionMeta, sectionVisible } from "@/lib/forms/engine";
import { getModule } from "@/lib/forms/registry";
import { STATUS_ICON, STATUS_LABELS, STATUS_TONE, type ModuleStatusValue } from "@/lib/forms/status";
import { EVIDENCE_KEY, META_KEY, type Answers, type Evidence, type FormContext, type SectionMeta } from "@/lib/forms/types";
import { EvidenceBlock, type AttachmentInfo } from "./evidence-block";
import { FieldControl, VsChips } from "./fields";
import { GeoSuggestions } from "./geo-suggestions";

type Status = ModuleStatusValue;

type SaveState = { kind: "idle" | "dirty" | "saving" | "saved" | "error"; at?: string; message?: string };

const timeFmt = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" });

export function ModuleForm({
  moduleKey,
  orgId,
  periodId,
  target,
  initialAnswers,
  initialStatus,
  initialNote,
  initialAttachments,
  ctx,
  canEdit,
  lockedReason,
  intro,
}: {
  moduleKey: string;
  orgId: string;
  periodId: string;
  target: { companyId: string; locationId?: string | null };
  initialAnswers: Answers;
  initialStatus: Status;
  initialNote: string | null;
  initialAttachments: AttachmentInfo[];
  ctx: FormContext;
  canEdit: boolean;
  lockedReason?: string;
  intro?: ReactNode;
}) {
  const def = getModule(moduleKey)!;
  const base = { orgId, periodId, moduleKey, target };

  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [note, setNote] = useState(initialNote ?? "");
  const [attachments, setAttachments] = useState(initialAttachments);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [statusError, setStatusError] = useState<string | null>(null);
  const [askNotRelevant, setAskNotRelevant] = useState(false);

  const latest = useRef(answers);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<unknown> | null>(null);

  const clean = useMemo(() => sanitizeAnswers(def, answers, ctx), [def, answers, ctx]);
  const ev = useMemo(() => evaluateModule(def, clean, ctx), [def, clean, ctx]);
  const issueFor = (section: string, field: string) => ev.issues.find((i) => i.section === section && i.field === field && i.row === undefined)?.message;

  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    setSave({ kind: "saving" });
    const p = saveModuleAnswers({ ...base, answers: latest.current });
    inflight.current = p;
    const res = await p;
    inflight.current = null;
    if (res.ok) {
      setSave({ kind: dirty.current ? "dirty" : "saved", at: res.savedAt });
      setStatus(res.status as Status);
      return true;
    }
    dirty.current = true;
    setSave({ kind: "error", message: res.error });
    return false;
  }

  function update(fn: (prev: Answers) => Answers) {
    const next = fn(latest.current);
    latest.current = next;
    setAnswers(next);
    dirty.current = true;
    setSave({ kind: "dirty" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }

  const setField = (key: string, v: unknown) => update((a) => ({ ...a, [key]: v }));
  const setMeta = (section: string, m: SectionMeta) =>
    update((a) => ({ ...a, [META_KEY]: { ...((a[META_KEY] as object) ?? {}), [section]: m } }));
  const setEvidence = (section: string, e: Evidence) =>
    update((a) => ({ ...a, [EVIDENCE_KEY]: { ...((a[EVIDENCE_KEY] as object) ?? {}), [section]: e } }));

  /** Anvender et forslag: sætter felterne og noterer kilden under sektionens dokumentation (én gang). */
  const applySuggestion = (fields: Answers, source?: { section: string; system: string }) =>
    update((a) => {
      const next = { ...a, ...fields };
      if (!source) return next;
      const ev = sectionEvidence(a, source.section);
      if (ev.sources?.some((s) => s.system === source.system)) return next;
      return { ...next, [EVIDENCE_KEY]: { ...((a[EVIDENCE_KEY] as object) ?? {}), [source.section]: { ...ev, sources: [...(ev.sources ?? []), { system: source.system }] } } };
    });

  // Advar ved lukning med ugemte ændringer
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function changeStatus(next: "COMPLETED" | "NOT_RELEVANT" | "IN_PROGRESS") {
    setStatusError(null);
    if (!(await flush())) return;
    const res = await setModuleStatus({ ...base, status: next, note: next === "NOT_RELEVANT" ? note : undefined });
    if (res.ok) {
      setStatus(res.status as Status);
      setAskNotRelevant(false);
    } else setStatusError(res.error);
  }

  const readOnly = !canEdit || status === "NOT_RELEVANT";
  const pct = ev.required ? Math.round((ev.filled / ev.required) * 100) : ev.complete ? 100 : 0;
  const missingCount = ev.required - ev.filled;
  const firstOpen = ev.sections.find((s) => s.visible && !s.done);
  const goToFirstOpen = () => {
    if (!firstOpen) return;
    const el = document.getElementById(`section-${firstOpen.key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-5">
      {/* Statuslinje */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-200 bg-[#f6f7f6]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>{STATUS_LABELS[status]}</Badge>
          {status !== "NOT_RELEVANT" && (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Udfyldte krævede felter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="tabular-nums">
                {ev.filled}/{ev.required} krævede felter
              </span>
            </div>
          )}
          <span className="text-xs text-neutral-500" aria-live="polite">
            {save.kind === "saving" && "Gemmer…"}
            {save.kind === "dirty" && "Ugemte ændringer"}
            {save.kind === "saved" && save.at && `Gemt kl. ${timeFmt.format(new Date(save.at))}`}
            {save.kind === "error" && <span className="text-red-600">Ikke gemt: {save.message}</span>}
          </span>
          {canEdit && (
            <div className="ml-auto flex flex-wrap gap-2">
              {status === "COMPLETED" || status === "NOT_RELEVANT" ? (
                <Button variant="secondary" onClick={() => changeStatus("IN_PROGRESS")}>
                  Genåbn
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setAskNotRelevant((v) => !v)}>
                    Ikke relevant
                  </Button>
                  {!ev.complete && (
                    <span className="flex items-center gap-1 self-center text-xs text-neutral-600" id="complete-reason">
                      {missingCount > 0 ? `${missingCount} krævede ${missingCount === 1 ? "felt mangler" : "felter mangler"}` : "Ret fejlene markeret med rødt"}
                      {firstOpen && (
                        <button type="button" onClick={goToFirstOpen} className="rounded px-1 py-2 font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900">
                          Gå til
                        </button>
                      )}
                    </span>
                  )}
                  <Button onClick={() => changeStatus("COMPLETED")} disabled={!ev.complete} aria-describedby={ev.complete ? undefined : "complete-reason"}>
                    Markér som færdig
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {askNotRelevant && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <label htmlFor="nr-note" className="mb-1 block text-xs font-medium text-neutral-700">
                Hvorfor er modulet ikke relevant for {target.locationId ? "lokationen" : "selskabet"}?
              </label>
              <Textarea id="nr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button onClick={() => changeStatus("NOT_RELEVANT")} disabled={!note.trim()}>
              Markér ikke relevant
            </Button>
          </div>
        )}
        {statusError && <p className="mt-2 text-sm text-red-600">{statusError}</p>}
      </div>

      {lockedReason && (
        <p className="flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-neutral-800">
          <span aria-hidden="true">🔒</span>
          <span>
            <span className="font-medium">Skrivebeskyttet. </span>
            {lockedReason}
          </span>
        </p>
      )}
      {status === "NOT_RELEVANT" && (
        <p className="rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
          <span className="font-medium">Markeret som ikke relevant:</span> {initialNote ?? note}
        </p>
      )}

      {intro}

      {moduleKey === "location.biodiversity" && target.locationId && canEdit && (
        <GeoSuggestions orgId={orgId} locationId={target.locationId} disabled={readOnly} onApply={applySuggestion} />
      )}

      {def.sections.map((section) => {
        if (!sectionVisible(section, clean, ctx)) return null;
        const prog = ev.sections.find((s) => s.key === section.key)!;
        const meta = sectionMeta(answers, section.key);
        return (
          <Card key={section.key} id={`section-${section.key}`} className={cx("scroll-mt-24", meta.missing && "border-amber-200")}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
              <div>
                <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                  {section.title}
                  {section.cOnly && <Badge>Udvidet Modul</Badge>}
                  <VsChips vs={section.vs} />
                </h2>
                {section.description && <p className="mt-0.5 text-sm text-neutral-500">{section.description}</p>}
              </div>
              <span className={cx("text-xs tabular-nums", prog.done ? "text-brand-700" : "text-neutral-500")}>
                {prog.missingMarked ? "Data mangler (begrundet)" : prog.done ? "✓ Udfyldt" : `${prog.filled}/${prog.required}`}
              </span>
            </div>

            <fieldset disabled={readOnly} className="min-w-0 space-y-5 px-5 py-5">
              {ev.warnings
                .filter((w) => w.section === section.key)
                .map((w) => (
                  <p key={w.message} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    ⚠ {w.message}
                  </p>
                ))}
              {section.fields.map((f) =>
                fieldVisible(f, clean, ctx) ? (
                  <FieldControl
                    key={f.key}
                    id={`${section.key}-${f.key}`}
                    field={f}
                    value={answers[f.key]}
                    onChange={(v) => setField(f.key, v)}
                    error={issueFor(section.key, f.key) ?? ev.issues.find((i) => i.field === f.key && i.row !== undefined)?.message}
                    required={fieldRequired(f, clean, ctx)}
                    ctx={ctx}
                    readOnly={readOnly}
                  />
                ) : null,
              )}

              {section.evidence && (
                <EvidenceBlock
                  sectionKey={section.key}
                  value={sectionEvidence(answers, section.key)}
                  onChange={(e) => setEvidence(section.key, e)}
                  attachments={attachments.filter((a) => a.sectionKey === section.key)}
                  onAttachmentsChange={(next) => setAttachments([...attachments.filter((a) => a.sectionKey !== section.key), ...next])}
                  uploadFields={{ orgId, periodId, moduleKey, companyId: target.companyId, locationId: target.locationId ?? "" }}
                  disabled={readOnly}
                />
              )}

              {prog.required > 0 && (!readOnly || meta.missing) && (
                <div className="rounded-md border border-dashed border-neutral-300 px-4 py-3">
                  <label className="flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={!!meta.missing}
                      onChange={(e) => setMeta(section.key, { ...meta, missing: e.target.checked })}
                      className="size-4 accent-amber-600"
                    />
                    Data mangler for denne sektion
                  </label>
                  {meta.missing && (
                    <Textarea
                      aria-label="Begrundelse for manglende data"
                      rows={2}
                      value={meta.missingReason ?? ""}
                      placeholder="Hvorfor kan data ikke fremskaffes? Begrundelsen kan indgå under udeladelser i rapporten."
                      onChange={(e) => setMeta(section.key, { ...meta, missingReason: e.target.value })}
                      className="mt-2"
                    />
                  )}
                </div>
              )}
            </fieldset>
          </Card>
        );
      })}
    </div>
  );
}
