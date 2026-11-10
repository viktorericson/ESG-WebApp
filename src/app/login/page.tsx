import { redirect } from "next/navigation";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Card, Input, Label } from "@/components/ui";
import { requestLoginLink } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">ESG Rapportering</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Log ind</h1>
          <p className="mt-1 text-sm text-neutral-500">Vi sender et login-link til din e-mail – ingen adgangskode.</p>
        </div>
        <Card className="p-5">
          <ActionForm action={requestLoginLink} className="space-y-4">
            <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1" placeholder="navn@virksomhed.dk" />
              <FieldError name="email" />
            </div>
            <SubmitButton className="w-full" pendingText="Sender…">
              Send login-link
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </main>
  );
}
