"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { suggestLocationsFromCvr, type LocationSuggestions } from "@/lib/actions/cvr";
import type { CvrUnit } from "@/lib/cvr";

/**
 * Foreslår lokationer ud fra selskabets P-enheder i CVR. "Brug" forudfylder navn, adresse og funktion
 * i den omgivende formular; brugeren vælger selv ejerforhold og tilføjer lokationen.
 */
export function CvrLocationSuggestions({ orgId, companyId }: { orgId: string; companyId: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LocationSuggestions | null>(null);
  const [used, setUsed] = useState<string | null>(null);

  function load() {
    startTransition(async () => {
      setResult(await suggestLocationsFromCvr(orgId, companyId));
      setUsed(null);
    });
  }

  function pick(unit: CvrUnit) {
    const form = root.current?.closest("form");
    if (!form) return;
    const set = (name: string, value: string) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement) field.value = value;
    };
    set("name", unit.name);
    set("address", unit.address);
    set("function", unit.function ?? "");
    setUsed(unit.pno);
  }

  return (
    <div ref={root} className="rounded-md border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-700">Hent forslag fra selskabets registrerede P-enheder i CVR.</p>
        <Button type="button" variant="secondary" className="whitespace-nowrap py-1.5" onClick={load} disabled={pending}>
          {pending ? "Henter…" : result ? "Hent igen" : "Hent lokationer fra CVR"}
        </Button>
      </div>
      <div aria-live="polite">
        {result && !result.ok && <p className="mt-2 text-xs text-red-600">{result.error}</p>}
        {result?.ok && (
          <>
            <p className="mt-2 text-xs text-neutral-500">
              {result.units.length === 0 ? "Ingen nye P-enheder at foreslå." : "Vælg en P-enhed for at udfylde felterne nedenfor. Ret navn og ejerforhold, og tilføj lokationen."}
              {result.alreadyAdded > 0 && ` ${result.alreadyAdded} er allerede oprettet som lokation.`}
            </p>
            {result.units.length > 0 && (
              <ul className="mt-2 max-h-64 divide-y divide-neutral-100 overflow-y-auto rounded-md border border-neutral-200">
                {result.units.map((u) => (
                  <li key={u.pno} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">
                        {u.address}
                        {u.main && <span className="ml-2 text-xs font-normal text-neutral-500">Hovedadresse</span>}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {u.name} · P-nr. {u.pno}
                      </p>
                    </div>
                    <Button type="button" variant={used === u.pno ? "ghost" : "secondary"} className="whitespace-nowrap py-1" onClick={() => pick(u)}>
                      {used === u.pno ? "Valgt" : "Brug"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
