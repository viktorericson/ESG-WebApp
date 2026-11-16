"use client";

import { useEffect, useRef, useState } from "react";
import { Button, buttonStyles, Input } from "@/components/ui";
import { imageLimit } from "@/lib/report-content";

export type ReportImageItem = { id: string; slot: string; caption: string | null; width: number; height: number };

/** Billeder på én plads i rapporten (forord, kernefortælling, et afsnit eller bilag) */
export function ReportImages({
  reportId,
  slot,
  initial,
  canEdit,
  hint,
}: {
  reportId: string;
  slot: string;
  initial: ReportImageItem[];
  canEdit: boolean;
  hint?: string;
}) {
  const [images, setImages] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ReportImageItem | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal();
  }, [preview]);
  const limit = imageLimit(slot);
  const base = `/api/reports/${reportId}/images`;

  async function upload(files: FileList) {
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("slot", slot);
        const res = await fetch(base, { method: "POST", body: fd });
        const json = (await res.json().catch(() => null)) as { error?: string; image?: ReportImageItem } | null;
        if (!res.ok || !json?.image) {
          setError(json?.error ?? "Billedet kunne ikke gemmes");
          break;
        }
        setImages((list) => [...list, json.image!]);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`${base}/${id}`, { method: "DELETE" });
    if (res.ok) setImages((list) => list.filter((i) => i.id !== id));
    else setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Billedet kunne ikke fjernes");
  }

  async function saveCaption(id: string, caption: string) {
    const res = await fetch(`${base}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption }) });
    if (!res.ok) setError("Billedteksten kunne ikke gemmes");
  }

  if (!canEdit && images.length === 0) return null;

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <li key={img.id} className="space-y-1.5 rounded-md border border-neutral-200 p-2">
              <button
                type="button"
                onClick={() => setPreview(img)}
                aria-label={`Vis større: ${img.caption ?? "billede i rapporten"}`}
                title="Klik for at se billedet større"
                className="flex aspect-video w-full cursor-zoom-in items-center justify-center overflow-hidden rounded bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- privat billede bag login */}
                <img src={`${base}/${img.id}`} alt={img.caption ?? "Billede i rapporten"} className="max-h-full max-w-full object-contain" />
              </button>
              <Input
                aria-label="Billedtekst"
                placeholder="Billedtekst (valgfri)"
                defaultValue={img.caption ?? ""}
                maxLength={300}
                disabled={!canEdit}
                onBlur={(e) => {
                  if (e.target.value !== (img.caption ?? "")) void saveCaption(img.id, e.target.value);
                }}
              />
              {canEdit && (
                <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => void remove(img.id)}>
                  Fjern billede
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && images.length < limit && (
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${buttonStyles.secondary} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy ? "Uploader…" : "Tilføj billede"}
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              multiple={limit - images.length > 1}
              className="sr-only"
              disabled={busy}
              onChange={(e) => e.target.files?.length && void upload(e.target.files)}
            />
          </label>
          <span className="text-xs text-neutral-500">{hint ?? `PNG eller JPEG, højst 10 MB. Op til ${limit} ${limit === 1 ? "billede" : "billeder"}.`}</span>
        </div>
      )}
      {/* Stor visning. <dialog> giver Escape-lukning og fokusfælde; klik på baggrunden lukker også. */}
      <dialog
        ref={dialog}
        onClose={() => setPreview(null)}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="m-auto max-h-[92vh] max-w-[min(96vw,1600px)] rounded-lg bg-white p-0 shadow-2xl backdrop:bg-black/70"
      >
        {preview && (
          <figure className="flex max-h-[92vh] flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element -- privat billede bag login */}
            <img src={`${base}/${preview.id}`} alt={preview.caption ?? "Billede i rapporten"} className="min-h-0 flex-1 object-contain" />
            <figcaption className="flex items-start justify-between gap-4 border-t border-neutral-200 px-4 py-3 text-sm text-neutral-700">
              <span>{preview.caption}</span>
              <Button type="button" variant="secondary" className="shrink-0 py-1.5" autoFocus onClick={() => dialog.current?.close()}>
                Luk
              </Button>
            </figcaption>
          </figure>
        )}
      </dialog>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
