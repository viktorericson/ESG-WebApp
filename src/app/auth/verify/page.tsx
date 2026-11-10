import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card } from "@/components/ui";
import { verifyLogin } from "@/lib/actions/auth";

export default async function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  const { token } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-6 text-center">
        <h1 className="text-xl font-semibold">Fortsæt til ESG Rapportering</h1>
        <p className="mt-1 mb-5 text-sm text-neutral-500">Klik for at logge ind.</p>
        <ActionForm action={verifyLogin}>
          <input type="hidden" name="token" value={typeof token === "string" ? token : ""} />
          <SubmitButton className="w-full" pendingText="Logger ind…">
            Log ind
          </SubmitButton>
        </ActionForm>
      </Card>
    </main>
  );
}
