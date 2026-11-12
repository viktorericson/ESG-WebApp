"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, buttonStyles } from "@/components/ui";

const KINDS = {
  logo: {
    alt: "Koncernens logo",
    empty: "Intet logo. Rapporterne bruger Erhvervsstyrelsens skabelon uden logo.",
    upload: "Upload logo",
    change: "Skift logo",
    help: "PNG eller JPEG, højst 2 MB. Et liggende logo med gennemsigtig baggrund (PNG) ser bedst ud. Vises på forsiden, bagsiden og øverst på hver side.",
    box: "h-20",
  },
  cover: {
    alt: "Forsidefoto",
    empty: "Intet forsidefoto. Rapporterne bruger skabelonens skovbillede.",
    upload: "Upload forsidefoto",
    change: "Skift forsidefoto",
    help: "PNG eller JPEG i liggende format (16:9), mindst 1.600 pixels bredt, højst 10 MB. Fylder hele forsiden – vælg et roligt billede, så titlen kan læses.",
    box: "aspect-video",
  },
} as const;

/** Upload/fjern koncernens logo eller forsidefoto til rapporterne */
export function LogoUpload({ orgId, version, kind = "logo" }: { orgId: string; version: string | null; kind?: keyof typeof KINDS }) {
  const k = KINDS[kind];
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function send(method: "POST" | "DELETE", file?: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      if (file) fd.set("file", file);
      const res = await fetch(`/api/org/${orgId}/${kind}`, { method, body: method === "POST" ? fd : undefined });
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Noget gik galt");
      else startTransition(() => router.refresh());
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {version ? (
        <div className={`flex ${k.box} items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 ${kind === "logo" ? "p-3" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- privat billede bag login */}
          <img src={`/api/org/${orgId}/${kind}?v=${encodeURIComponent(version)}`} alt={k.alt} className={kind === "logo" ? "max-h-full max-w-full object-contain" : "h-full w-full object-cover"} />
        </div>
      ) : (
        <p className="text-sm text-neutral-500">{k.empty}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <label className={`${buttonStyles.secondary} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Gemmer…" : version ? k.change : k.upload}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void send("POST", f);
            }}
          />
        </label>
        {version && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void send("DELETE")}>
            Fjern
          </Button>
        )}
      </div>
      <p className="text-xs text-neutral-500">{k.help}</p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
