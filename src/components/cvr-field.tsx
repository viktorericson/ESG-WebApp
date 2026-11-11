"use client";

import { useRef, useState, useTransition } from "react";
import { FieldError } from "@/components/action-form";
import { Button, Input, Label } from "@/components/ui";
import { lookupCompanyByCvr } from "@/lib/actions/cvr";

type Message = { tone: "ok" | "warn" | "error"; text: string };

const TONES: Record<Message["tone"], string> = {
  ok: "text-brand-700",
  warn: "text-amber-700",
  error: "text-red-600",
};

/**
 * CVR-felt med opslag, der forudfylder navn, adresse, juridisk form og NACE-kode i den omgivende formular.
 * Felterne er ukontrollerede, så værdierne sættes direkte og kan rettes inden der gemmes.
 */
export function CvrField({ orgId, defaultValue }: { orgId: string; defaultValue?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  function lookup() {
    const el = input.current;
    const form = el?.form;
    if (!el || !form) return;
    startTransition(async () => {
      const result = await lookupCompanyByCvr(orgId, el.value);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      const c = result.company;
      const set = (name: string, value: string) => {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = value;
      };
      set("name", c.name);
      set("address", c.address ?? "");
      set("legalForm", c.legalForm);
      set("naceCodes", c.naceCodes.join(", "));
      setMessage(
        c.ended
          ? { tone: "warn", text: `Hentet fra CVR: ${c.name}. Bemærk: selskabet er registreret som ophørt.` }
          : { tone: "ok", text: `Hentet fra CVR: ${c.name}. Kontrollér felterne, inden du gemmer.` },
      );
    });
  }

  return (
    <div>
      <Label htmlFor="cvr">CVR-nummer</Label>
      <div className="mt-1 flex gap-2">
        <Input
          ref={input}
          id="cvr"
          name="cvr"
          required
          inputMode="numeric"
          defaultValue={defaultValue}
          className="min-w-0 flex-1"
          onKeyDown={(e) => {
            // Enter i CVR-feltet slår op i stedet for at indsende en halvt udfyldt formular
            if (e.key === "Enter" && !nameIsFilled(e.currentTarget)) {
              e.preventDefault();
              lookup();
            }
          }}
        />
        <Button type="button" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={lookup} disabled={pending}>
          {pending ? "Henter…" : "Hent fra CVR"}
        </Button>
      </div>
      <FieldError name="cvr" />
      {message && (
        <p className={`mt-1 text-xs ${TONES[message.tone]}`} aria-live="polite">
          {message.text}
        </p>
      )}
    </div>
  );
}

function nameIsFilled(el: HTMLInputElement): boolean {
  const name = el.form?.elements.namedItem("name");
  return name instanceof HTMLInputElement && name.value.trim() !== "";
}
