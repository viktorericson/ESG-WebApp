"use client";

import { useRef, useState } from "react";
import { Input, Textarea } from "@/components/ui";
import type { DataSource, Evidence } from "@/lib/forms/types";

export type AttachmentInfo = { id: string; sectionKey: string; filename: string; size: number };

const SOURCE_FIELDS: { key: keyof DataSource; label: string; placeholder: string }[] = [
  { key: "system", label: "System", placeholder: "Systemet hvor data findes" },
  { key: "department", label: "Afdeling", placeholder: "fx Drift, Økonomi, HR" },
  { key: "person", label: "Person", placeholder: "" },
  { key: "role", label: "Rolle", placeholder: "" },
];

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Datakilde, kommentar og dokumentation for en sektion */
export function EvidenceBlock({
  sectionKey,
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  uploadFields,
  disabled,
}: {
  sectionKey: string;
  value: Evidence;
  onChange: (v: Evidence) => void;
  attachments: AttachmentInfo[];
  onAttachmentsChange: (next: AttachmentInfo[]) => void;
  uploadFields: Record<string, string>;
  disabled: boolean;
}) {
  const sources = value.sources ?? [];
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const filled = sources.length > 0 || !!value.comment || attachments.length > 0;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const added: AttachmentInfo[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      Object.entries(uploadFields).forEach(([k, v]) => fd.append(k, v));
      fd.append("sectionKey", sectionKey);
      fd.append("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`${file.name}: ${json.error ?? "Upload fejlede"}`);
        continue;
      }
      added.push(json as AttachmentInfo);
    }
    onAttachmentsChange([...attachments, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(id: string) {
    if (!window.confirm("Slet filen?")) return;
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (res.ok) onAttachmentsChange(attachments.filter((a) => a.id !== id));
    else setError("Filen kunne ikke slettes");
  }

  return (
    <details className="group rounded-md border border-neutral-200 bg-neutral-50/60" open={filled || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-700">
        <span className="inline-block transition-transform group-open:rotate-90">›</span>
        Datakilde og dokumentation
        {filled && <span className="text-xs font-normal text-neutral-500">· {[sources.length && `${sources.length} kilde${sources.length > 1 ? "r" : ""}`, attachments.length && `${attachments.length} fil${attachments.length > 1 ? "er" : ""}`].filter(Boolean).join(", ") || "kommentar"}</span>}
      </summary>
      <div className="space-y-4 border-t border-neutral-200 px-4 py-4">
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-600">Hvordan er data fundet?</p>
          {sources.map((src, i) => (
            <div key={i} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(4,1fr)_auto]">
              {SOURCE_FIELDS.map((f) => (
                <Input
                  key={f.key}
                  aria-label={f.label}
                  placeholder={f.placeholder || f.label}
                  value={src[f.key] ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...value, sources: sources.map((s, j) => (j === i ? { ...s, [f.key]: e.target.value } : s)) })}
                  className="py-1.5"
                />
              ))}
              {!disabled && (
                <button type="button" aria-label="Fjern kilde" onClick={() => onChange({ ...value, sources: sources.filter((_, j) => j !== i) })} className="rounded px-2 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                  ✕
                </button>
              )}
            </div>
          ))}
          {!disabled && (
            <button type="button" onClick={() => onChange({ ...value, sources: [...sources, {}] })} className="text-sm text-brand-700 hover:underline">
              + Tilføj datakilde
            </button>
          )}
        </div>

        <div>
          <label htmlFor={`${sectionKey}-comment`} className="mb-1 block text-xs font-medium text-neutral-600">
            Kommentar til data, manglende data eller dokumentation
          </label>
          <Textarea id={`${sectionKey}-comment`} rows={2} value={value.comment ?? ""} disabled={disabled} onChange={(e) => onChange({ ...value, comment: e.target.value })} />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-neutral-600">Dokumentation</p>
          {attachments.length > 0 && (
            <ul className="mb-2 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white text-sm">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <a href={`/api/attachments/${a.id}`} className="truncate text-brand-700 hover:underline">
                    {a.filename}
                  </a>
                  <span className="ml-auto shrink-0 text-xs text-neutral-500">{formatSize(a.size)}</span>
                  {!disabled && (
                    <button type="button" onClick={() => remove(a.id)} className="text-xs text-neutral-500 hover:text-red-600">
                      Slet
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!disabled && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">
              {uploading ? "Uploader…" : "Upload filer"}
              <input ref={fileRef} type="file" multiple className="sr-only" disabled={uploading} accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.docx" onChange={(e) => upload(e.target.files)} />
            </label>
          )}
          <p className="mt-1 text-xs text-neutral-500">PDF, billeder, Excel, Word eller CSV. Maks. 20 MB pr. fil.</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </details>
  );
}
