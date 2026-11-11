"use client";

import { createContext, startTransition, use, useActionState, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { ActionState } from "@/lib/validation";
import { Button, buttonStyles, cx } from "./ui";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const StateContext = createContext<ActionState>({});
const PendingContext = createContext(false);

/**
 * Formular bundet til en server action, med fejl- og succesbeskeder.
 * Indsendes via onSubmit (ikke action-prop), så React ikke nulstiller felterne ved valideringsfejl.
 * Ved succes nulstilles formularen kun hvis resetOnSuccess er sat.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <StateContext value={state}>
      <PendingContext value={pending}>
      <form
        ref={ref}
        // Fallback før hydrering (progressive enhancement). Efter hydrering håndteres indsendelsen i onSubmit,
        // så React ikke nulstiller felterne ved valideringsfejl.
        action={formAction}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          // Medtag den knap, der blev trykket på (name/value), fx "decision"
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        <FormMessages />
      </form>
      </PendingContext>
    </StateContext>
  );
}

function FormMessages() {
  const state = use(StateContext);
  if (!state.error && !state.ok && !state.devLink) return null;
  return (
    <div className="mt-3 space-y-2 text-sm" aria-live="polite">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-md bg-brand-50 px-3 py-2 text-brand-700">{state.ok}</p>}
      {state.devLink && (
        <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          Udviklingstilstand (ingen SMTP):{" "}
          <a className="font-medium underline break-all" href={state.devLink}>
            {state.devLink}
          </a>
        </p>
      )}
    </div>
  );
}

export function FieldError({ name }: { name: string }) {
  const state = use(StateContext);
  const msg = state.fieldErrors?.[name];
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

export function SubmitButton({
  children,
  pendingText = "Gemmer…",
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: keyof typeof buttonStyles }) {
  const pending = use(PendingContext);
  return (
    <Button type="submit" variant={variant} disabled={pending} className={cx(className)} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
