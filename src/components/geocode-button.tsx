"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { geocodeLocationAddress } from "@/lib/actions/geocode";

type Message = { tone: "ok" | "warn" | "error"; text: string };

const TONES: Record<Message["tone"], string> = {
  ok: "text-brand-700",
  warn: "text-amber-700",
  error: "text-red-600",
};

/** Slår adressen i den omgivende formular op og udfylder bredde- og længdegrad. Værdierne kan rettes inden der gemmes. */
export function GeocodeButton() {
  const root = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  function lookup() {
    const form = root.current?.closest("form");
    if (!form) return;
    const field = (name: string) => {
      const el = form.elements.namedItem(name);
      return el instanceof HTMLInputElement ? el : null;
    };
    startTransition(async () => {
      const result = await geocodeLocationAddress(field("address")?.value ?? "");
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      const { latitude, longitude, matched, precise } = result.hit;
      const set = (name: string, value: number) => {
        const el = field(name);
        if (el) el.value = String(value).replace(".", ",");
      };
      set("latitude", latitude);
      set("longitude", longitude);
      setMessage(
        precise
          ? { tone: "ok", text: `Fundet: ${matched}. Kontrollér, at det er den rigtige adresse.` }
          : { tone: "warn", text: `Kun omtrentligt træf (uden husnummer): ${matched}. Kontrollér koordinaterne.` },
      );
    });
  }

  return (
    <div ref={root} className="mb-2">
      <Button type="button" variant="secondary" className="whitespace-nowrap py-1.5" onClick={lookup} disabled={pending}>
        {pending ? "Søger…" : "Find koordinater ud fra adressen"}
      </Button>
      {message && (
        <p className={`mt-1 text-xs ${TONES[message.tone]}`} aria-live="polite">
          {message.text}
        </p>
      )}
    </div>
  );
}
