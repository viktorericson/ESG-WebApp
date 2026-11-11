"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button, Card } from "@/components/ui";
import { suggestGeoFacts, type GeoFactsResult } from "@/lib/actions/geo-facts";
import { NEAR_METERS, type NaturaFinding, type WaterStressFinding } from "@/lib/geo-facts";
import type { Answers } from "@/lib/forms/types";

const WATER_LABELS = { YES: "Ja", NO: "Nej" } as const;

function naturaAnswers(f: NaturaFinding): Answers {
  if (f.relation === "NONE") return { nearSensitiveArea: "no" };
  return {
    nearSensitiveArea: "yes",
    sensitiveAreaName: `Natura 2000: ${f.sites.map((s) => `${s.name} (${s.code})`).join("; ")}`,
    sensitiveAreaRelation: f.relation,
  };
}

/**
 * Forslag til biodiversitetsmodulet ud fra lokationens koordinater. Intet ændres i skemaet,
 * før brugeren trykker "Anvend" – derefter gemmes svarene som alle andre ændringer.
 */
export function GeoSuggestions({
  orgId,
  locationId,
  disabled,
  onApply,
}: {
  orgId: string;
  locationId: string;
  disabled: boolean;
  onApply: (answers: Answers, source?: { section: string; system: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GeoFactsResult | null>(null);
  const [applied, setApplied] = useState<{ natura?: boolean; water?: boolean }>({});

  function load() {
    startTransition(async () => {
      setResult(await suggestGeoFacts(orgId, locationId));
      setApplied({});
    });
  }

  const natura = result?.ok ? result.natura : null;
  const water = result?.ok ? result.waterStress : null;

  return (
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Forslag ud fra lokationens koordinater</h2>
          <p className="mt-0.5 text-sm text-neutral-500">Slår Natura 2000-områder og vandstress op. Du vælger selv, om forslagene skal anvendes.</p>
        </div>
        <Button variant="secondary" className="whitespace-nowrap" onClick={load} disabled={pending}>
          {pending ? "Slår op…" : result ? "Slå op igen" : "Hent forslag"}
        </Button>
      </div>

      <div aria-live="polite">
        {result && !result.ok && <p className="mt-3 text-sm text-red-600">{result.error}</p>}

        {natura && (
          <Row
            title="Biodiversitetsfølsomt område"
            error={natura.ok ? null : natura.error}
            action={
              natura.ok && (
                <ApplyButton
                  disabled={disabled}
                  done={!!applied.natura}
                  onClick={() => {
                    onApply(naturaAnswers(natura.value), { section: "sensitiveAreas", system: "EEA Natura 2000-datasættet (opslag på lokationens koordinater)" });
                    setApplied((a) => ({ ...a, natura: true }));
                  }}
                />
              )
            }
          >
            {natura.ok && <NaturaText finding={natura.value} />}
          </Row>
        )}

        {water && (
          <Row
            title="Vandstress"
            error={water.ok ? null : water.error}
            action={
              water.ok &&
              water.value.suggestion && (
                <ApplyButton
                  disabled={disabled}
                  done={!!applied.water}
                  onClick={() => {
                    onApply({ waterStress: water.value.suggestion });
                    setApplied((a) => ({ ...a, water: true }));
                  }}
                />
              )
            }
          >
            {water.ok && <WaterText finding={water.value} />}
          </Row>
        )}
      </div>
    </Card>
  );
}

function Row({ title, error, action, children }: { title: string; error: string | null; action: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-neutral-100 pt-3">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-neutral-900">{title}</p>
        {error ? <p className="mt-0.5 text-red-600">{error}</p> : children}
      </div>
      {action}
    </div>
  );
}

function ApplyButton({ disabled, done, onClick }: { disabled: boolean; done: boolean; onClick: () => void }) {
  return (
    <Button variant={done ? "ghost" : "secondary"} className="whitespace-nowrap py-1.5" disabled={disabled} onClick={onClick}>
      {done ? "Anvendt" : "Anvend"}
    </Button>
  );
}

function NaturaText({ finding }: { finding: NaturaFinding }) {
  const names = finding.sites.map((s) => `${s.name} (${s.code})`).join("; ");
  return (
    <>
      <p className="mt-0.5 text-neutral-700">
        {finding.relation === "IN" && <>Forslag: <strong>Ja, i området</strong>. Koordinaterne ligger i Natura 2000-området {names}.</>}
        {finding.relation === "NEAR" && <>Forslag: <strong>Ja, nær området</strong>. Inden for {NEAR_METERS / 1000} km ligger Natura 2000-området {names}.</>}
        {finding.relation === "NONE" && <>Forslag: <strong>Nej</strong>. Der er ingen Natura 2000-områder inden for {NEAR_METERS / 1000} km.</>}
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">
        Kilde: EEA’s Natura 2000-datasæt. Andre beskyttede områder (fx §3-natur, UNESCO-verdensarv og Key Biodiversity Areas) er ikke tjekket.
      </p>
    </>
  );
}

function WaterText({ finding }: { finding: WaterStressFinding }) {
  return (
    <>
      <p className="mt-0.5 text-neutral-700">
        {finding.suggestion ? (
          <>Forslag: <strong>{WATER_LABELS[finding.suggestion]}</strong>. </>
        ) : (
          <>Intet forslag – vurder selv. </>
        )}
        Aqueduct angiver “{finding.label}”{finding.region && ` for ${finding.region}`}.
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">Kilde: WRI Aqueduct 4.0, baseline water stress. Høj vandstress svarer til kategorierne High og Extremely High.</p>
    </>
  );
}
