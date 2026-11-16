"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AreaMapsButton } from "@/components/area-maps-button";
import { ReportImages, type ReportImageItem } from "@/components/report-images";
import { RichTextField } from "@/components/rich-text-editor";
import { Button, Card, CardHeader, cx } from "@/components/ui";
import { copyContentFromPrevious, saveReportContent } from "@/lib/actions/reports";
import { MAX_SECTION_TEXT, MAX_SUMMARY_TEXT, MAX_TEXT, SECTIONS, type ReportContent, type SectionKey } from "@/lib/report-content";
import type { Previews, SectionPreview } from "@/lib/export/preview";
import { formatChange, isImprovement, type Summary } from "@/lib/summary";

/** Billedlisten holder sin egen tilstand; nøglen nulstiller den, når serveren har ændret billederne (fx hentede kort) */
const imageKey = (images: ReportImageItem[]) => images.map((i) => i.id).join(",");

type Save = { kind: "idle" } | { kind: "dirty" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

const timeFmt = new Intl.DateTimeFormat("da-DK", { timeStyle: "short" });

function Counter({ value, max }: { value: string | undefined; max: number }) {
  const n = value?.length ?? 0;
  return <span className={cx("text-xs tabular-nums", n > max ? "text-red-700" : "text-neutral-500")}>{n.toLocaleString("da-DK")} / {max.toLocaleString("da-DK")}</span>;
}

/** Tekstfelt med fuld editor (fed, kursiv, understregning, overskrifter, lister) og "Udvid" til et stort vindue */
function TextField({
  id,
  label,
  hint,
  value,
  max,
  rows = 6,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  value: string | undefined;
  max: number;
  rows?: number;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <RichTextField
      id={id}
      label={label}
      hint={hint}
      value={value}
      disabled={disabled}
      onChange={onChange}
      counter={<Counter value={value} max={max} />}
      minHeight={`${rows * 1.5}rem`}
    />
  );
}

function SummaryPreview({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {summary.columns.map((col) => (
        <div key={col.key} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{col.title}</p>
          {col.tiles.map((t) => {
            const better = isImprovement(t);
            const change = formatChange(t.change, t.changeUnit);
            return (
              <div key={t.label} className="rounded-md border border-neutral-200 px-3 py-2">
                <p className="text-xs text-neutral-500">{t.label}</p>
                <p className="text-sm font-semibold tabular-nums">{t.value}</p>
                {change && (
                  <p className={cx("text-xs tabular-nums", better === true ? "text-brand-700" : better === false ? "text-amber-700" : "text-neutral-500")}>
                    {change} ift. {summary.previousYear}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** De indrapporterede data for afsnittet, som de står i rapporten */
function SectionData({ preview }: { preview: SectionPreview | undefined }) {
  if (!preview) return null;
  return (
    <div className="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Indrapporteret</p>
      {preview.omitted && <p className="text-xs text-amber-800">{preview.omitted}</p>}
      {preview.tables.map((t, i) => {
        // Nøgle/værdi (evt. med året før som ekstra kolonne): tallene højrestilles
        const numeric = !t.head || t.head[0] === "";
        return (
          <div key={i} className="overflow-x-auto">
            {t.title && <p className="mb-1 text-xs font-medium text-neutral-700">{t.title}</p>}
            <table className="w-full text-xs">
              {t.head && (
                <thead className="text-neutral-500">
                  <tr>
                    {t.head.map((h, j) => (
                      <th key={j} className={cx("py-1 pr-3 font-medium", numeric && j > 0 ? "text-right" : "text-left")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {t.rows.map((r, j) => (
                  <tr key={j} className="border-t border-neutral-200 align-top">
                    {r.map((c, k) => (
                      <td
                        key={k}
                        className={cx(
                          "whitespace-pre-line py-1 pr-3",
                          k === 0 ? "text-neutral-600" : "text-neutral-900",
                          numeric && k > 0 && "text-right tabular-nums",
                          // Året før står nedtonet
                          numeric && r.length === 3 && k === 1 && "text-neutral-500",
                        )}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function ReportContentEditor({
  orgId,
  reportId,
  initial,
  images,
  canEdit,
  comprehensive,
  previousYear,
  summary,
  previews,
}: {
  orgId: string;
  reportId: string;
  initial: ReportContent;
  images: ReportImageItem[];
  canEdit: boolean;
  comprehensive: boolean;
  /** Året før, hvis der findes en rapport at hente tekster fra */
  previousYear: number | null;
  summary: Summary | null;
  /** Indrapporterede data pr. afsnit (vises ved kommentarfeltet) */
  previews: Previews;
}) {
  const [content, setContent] = useState<ReportContent>(initial);
  const [save, setSave] = useState<Save>({ kind: "idle" });
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const latest = useRef(content);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<unknown> | null>(null);
  const imagesFor = (slot: string) => images.filter((i) => i.slot === slot);

  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    setSave({ kind: "saving" });
    const p = saveReportContent({ orgId, reportId, content: latest.current });
    inflight.current = p;
    const res = await p;
    inflight.current = null;
    if (res.ok) {
      setSave(dirty.current ? { kind: "dirty" } : { kind: "saved", at: res.savedAt });
      return true;
    }
    dirty.current = true;
    setSave({ kind: "error", message: res.error });
    return false;
  }

  function update(fn: (c: ReportContent) => ReportContent) {
    const next = fn(latest.current);
    latest.current = next;
    setContent(next);
    dirty.current = true;
    setSave({ kind: "dirty" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }

  const setSection = (key: SectionKey, v: string) => update((c) => ({ ...c, sections: { ...c.sections, [key]: v } }));
  const setSummary = (patch: Partial<NonNullable<ReportContent["summary"]>>) => update((c) => ({ ...c, summary: { show: c.summary?.show ?? true, ...c.summary, ...patch } }));

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function copyPrevious() {
    setCopyMsg(null);
    if (!(await flush())) return;
    const res = await copyContentFromPrevious({ orgId, reportId });
    if (res.ok && res.content) {
      latest.current = res.content;
      setContent(res.content);
      setSave({ kind: "saved", at: res.savedAt });
      setCopyMsg(`Teksterne fra ${previousYear} er hentet. Husk at opdatere tal og årstal i teksten.`);
    } else if (!res.ok) setCopyMsg(res.error);
  }

  const disabled = !canEdit;
  const showSummary = content.summary?.show !== false;
  const sections = SECTIONS.filter((s) => !("c" in s && s.c) || comprehensive);
  const filled = sections.filter((s) => content.sections?.[s.key]?.trim()).length;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-3 bg-neutral-50/95 px-1 py-2 backdrop-blur">
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {[
            ["#indledning", "Indledning"],
            ["#ledelsesoversigt", "Ledelsesoversigt"],
            ["#afsnit", "Kommentarer pr. afsnit"],
            ["#afslutning", "Afslutning og bilag"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="text-brand-700 hover:underline">
              {label}
            </a>
          ))}
        </nav>
        <span role="status" className={cx("ml-auto text-xs", save.kind === "error" ? "text-red-700" : "text-neutral-500")}>
          {save.kind === "saving" && "Gemmer…"}
          {save.kind === "dirty" && "Ikke gemt endnu"}
          {save.kind === "saved" && `Gemt ${timeFmt.format(new Date(save.at))}`}
          {save.kind === "error" && save.message}
        </span>
        {canEdit && previousYear && (
          <Button type="button" variant="secondary" onClick={() => void copyPrevious()}>
            Hent tekster fra {previousYear}
          </Button>
        )}
      </div>
      {copyMsg && <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">{copyMsg}</p>}

      <Card id="indledning" className="scroll-mt-16">
        <CardHeader title="Indledning" description="Valgfrie sider forrest i rapporten. Tomme felter udelades." />
        <div className="space-y-6 p-5">
          <div className="space-y-3">
            <TextField
              id="foreword"
              label="Forord"
              hint="Fx ledelsens ord om året, hvorfor I rapporterer, og hvad I vil opnå."
              value={content.foreword}
              max={MAX_TEXT}
              rows={8}
              disabled={disabled}
              onChange={(v) => update((c) => ({ ...c, foreword: v }))}
            />
            <ReportImages reportId={reportId} slot="foreword" initial={imagesFor("foreword")} canEdit={canEdit} />
          </div>
          <div className="space-y-3">
            <TextField
              id="about"
              label="Om virksomheden (kernefortælling)"
              hint="Hvem I er, hvad I laver, og hvordan bæredygtighed hænger sammen med forretningen."
              value={content.about}
              max={MAX_TEXT}
              rows={8}
              disabled={disabled}
              onChange={(v) => update((c) => ({ ...c, about: v }))}
            />
            <ReportImages reportId={reportId} slot="about" initial={imagesFor("about")} canEdit={canEdit} />
          </div>
        </div>
      </Card>

      <Card id="ledelsesoversigt" className="scroll-mt-16">
        <CardHeader
          title="Ledelsesoversigt"
          description="Én side med årets vigtigste nøgletal og udviklingen siden sidste år. Tallene beregnes automatisk."
          action={
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <input type="checkbox" checked={showSummary} disabled={disabled} onChange={(e) => setSummary({ show: e.target.checked })} className="size-4 accent-brand-600" />
              Med i rapporten
            </label>
          }
        />
        {showSummary && (
          <div className="space-y-5 p-5">
            {summary ? <SummaryPreview summary={summary} /> : <p className="text-sm text-neutral-500">Nøgletallene kunne ikke beregnes.</p>}
            {summary && !summary.previousYear && <p className="text-xs text-neutral-500">Der er ingen data for året før, så ændringer vises ikke.</p>}
            <div className="grid gap-4 md:grid-cols-3">
              {(
                [
                  ["environment", "Kommentar til miljø"],
                  ["social", "Kommentar til sociale forhold"],
                  ["governance", "Kommentar til ledelse"],
                ] as const
              ).map(([key, label]) => (
                <TextField
                  key={key}
                  id={`summary-${key}`}
                  label={label}
                  hint="Kort: 1–3 sætninger om udviklingen."
                  value={content.summary?.[key]}
                  max={MAX_SUMMARY_TEXT}
                  rows={4}
                  disabled={disabled}
                  onChange={(v) => setSummary({ [key]: v })}
                />
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card id="afsnit" className="scroll-mt-16">
        <CardHeader
          title="Kommentarer pr. afsnit"
          description={`Står ved siden af tabellerne i rapporten – fx forklaring på udviklingen, metode og forventninger. Åbn et afsnit for at se de indrapporterede tal. ${filled} af ${sections.length} udfyldt.`}
        />
        <ul className="divide-y divide-neutral-100">
          {sections.map((s) => {
            const value = content.sections?.[s.key];
            const imgs = imagesFor(`section:${s.key}`);
            return (
              <li key={s.key}>
                <details open={!!value?.trim() || imgs.length > 0} className="group px-5 py-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                    <span className="text-neutral-400 transition-transform group-open:rotate-90">›</span>
                    {s.label}
                    {(value?.trim() || imgs.length > 0) && <span className="ml-auto text-xs font-normal text-brand-700">{[value?.trim() && "tekst", imgs.length > 0 && `${imgs.length} billede${imgs.length > 1 ? "r" : ""}`].filter(Boolean).join(" · ")}</span>}
                  </summary>
                  <div className="mt-3 space-y-3 pl-4">
                    <SectionData preview={previews[s.key]} />
                    <TextField
                      id={`section-${s.key}`}
                      label="Kommentar"
                      value={value}
                      max={MAX_SECTION_TEXT}
                      rows={5}
                      disabled={disabled}
                      onChange={(v) => setSection(s.key, v)}
                    />
                    {s.key === "b5" && canEdit && <AreaMapsButton reportId={reportId} />}
                    <ReportImages
                      key={imageKey(imgs)}
                      reportId={reportId}
                      slot={`section:${s.key}`}
                      initial={imgs}
                      canEdit={canEdit}
                      hint="Billeder vises på en side lige efter afsnittet – fx kort over lokationerne eller et kortudsnit."
                    />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card id="afslutning" className="scroll-mt-16">
        <CardHeader title="Afslutning og bilag" />
        <div className="space-y-6 p-5">
          <TextField
            id="closing"
            label="Kommentarer til opgørelsen"
            hint="Fx valg af standard, afgrænsning, datagrundlag og planer for næste års rapport. Står sidst i rapporten."
            value={content.closing}
            max={MAX_TEXT}
            rows={6}
            disabled={disabled}
            onChange={(v) => update((c) => ({ ...c, closing: v }))}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-800">Bilag</p>
            <p className="text-xs text-neutral-500">Ét billede pr. side bagerst i rapporten, med billedteksten som overskrift – fx certifikater, virksomhedsprofil eller kort.</p>
            <ReportImages key={imageKey(imagesFor("appendix"))} reportId={reportId} slot="appendix" initial={imagesFor("appendix")} canEdit={canEdit} hint="PNG eller JPEG, højst 10 MB. Op til 20 bilag." />
          </div>
        </div>
      </Card>
    </div>
  );
}
