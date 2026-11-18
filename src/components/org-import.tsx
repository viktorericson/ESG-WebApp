"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import type { TransferSummary } from "@/lib/org-transfer";

/** Upload af en eksporteret koncern (platform-admin). Viser indholdet, før der importeres. */
export function OrgImport() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<TransferSummary | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(dryRun: boolean, f = file) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", f);
      if (dryRun) fd.set("dryRun", "1");
      else fd.set("name", name);
      const res = await fetch("/api/admin/organizations/import", { method: "POST", body: fd });
      const json = (await res.json().catch(() => null)) as { error?: string; summary?: TransferSummary; organizationId?: string } | null;
      if (!res.ok || !json?.summary) {
        setError(json?.error ?? "Noget gik galt");
        return;
      }
      if (dryRun) {
        setSummary(json.summary);
        setName(json.summary.name);
      } else router.push(`/admin/organizations/${json.organizationId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-5">
      <p className="text-sm text-neutral-600">
        Opretter en koncern fra en eksportfil fra en anden installation – med selskaber, lokationer, rapporter, modulsvar, tekster, billeder og adgange. Intet eksisterende overskrives. Licensen
        følger ikke med og skal sættes på den nye koncern.
      </p>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="block text-sm"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          setSummary(null);
          if (f) void send(true, f);
        }}
      />
      {summary && (
        <div className="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <p>
            <span className="font-medium">{summary.name}</span>: {summary.companies} selskab(er), {summary.locations} lokationer, rapporteringsår {summary.years.join(", ") || "–"}, {summary.reports} rapporter,{" "}
            {summary.modules} modulsvar, {summary.files} filer og {summary.members} adgange.
          </p>
          <div>
            <Label htmlFor="import-name">Navn på den nye koncern</Label>
            <Input id="import-name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="button" disabled={busy || !name.trim()} onClick={() => void send(false)}>
            {busy ? "Importerer…" : "Importér koncern"}
          </Button>
        </div>
      )}
      {busy && !summary && <p className="text-sm text-neutral-500">Læser filen…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
