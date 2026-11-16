"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { generateAreaMaps, type AreaMapsResult } from "@/lib/actions/area-maps";

const list = (names: string[]) => names.join(", ");

/** Danner kort over beskyttede naturområder for rapportens lokationer og lægger dem ind som billeder under B5. */
export function AreaMapsButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AreaMapsResult | null>(null);

  function run() {
    startTransition(async () => {
      const res = await generateAreaMaps(reportId);
      setResult(res);
      if (res.ok && res.added > 0) router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-neutral-700">
          Hent et kort fra Danmarks Arealinformation for hver lokation med Natura 2000, Ramsar, beskyttet natur (§3) og fredede områder. Tidligere hentede kort erstattes.
        </p>
        <Button type="button" variant="secondary" className="whitespace-nowrap" onClick={run} disabled={pending}>
          {pending ? "Henter kort…" : "Hent kort over lokationerne"}
        </Button>
      </div>
      <div aria-live="polite" className="text-sm">
        {result && !result.ok && <p className="mt-2 text-red-700">{result.error}</p>}
        {result?.ok && (
          <ul className="mt-2 space-y-0.5">
            <li className="text-brand-700">
              {result.added === 0 ? "Ingen kort blev tilføjet." : `${result.added} kort tilføjet${result.inAppendix > 0 ? `, heraf ${result.inAppendix} under Bilag, fordi der højst er plads til 4 billeder her` : ""}.`}
            </li>
            {result.withoutCoordinates.length > 0 && <li className="text-amber-800">Mangler koordinater eller BFE-nummer: {list(result.withoutCoordinates)}. Tilføj dem under lokationens stamdata.</li>}
            {result.failed.length > 0 && <li className="text-red-700">Arealinformation svarede ikke for: {list(result.failed)}. Prøv igen senere.</li>}
            {result.noRoom.length > 0 && <li className="text-amber-800">Ikke plads til: {list(result.noRoom)}. Fjern billeder under B5 eller Bilag.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
