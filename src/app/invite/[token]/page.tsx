import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Input, Label } from "@/components/ui";
import { acceptInvitation } from "@/lib/actions/org";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { hashToken } from "@/lib/tokens";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: true, company: true, location: { include: { company: true } }, invitedBy: true },
  });
  const valid = inv && !inv.acceptedAt && !inv.revokedAt && inv.expiresAt > new Date();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-6">
        {!valid ? (
          <>
            <h1 className="text-xl font-semibold">Invitationen virker ikke</h1>
            <p className="mt-2 text-sm text-neutral-600">Den er udløbet, trukket tilbage eller allerede brugt. Bed afsenderen om en ny.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">ESG Rapportering</p>
            <h1 className="mt-2 text-xl font-semibold">Du er inviteret til {inv.organization.name}</h1>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex gap-2"><dt className="w-24 text-neutral-500">Rolle</dt><dd>{ROLE_LABELS[inv.role]}</dd></div>
              {inv.company && <div className="flex gap-2"><dt className="w-24 text-neutral-500">Selskab</dt><dd>{inv.company.name}</dd></div>}
              {inv.location && (
                <div className="flex gap-2"><dt className="w-24 text-neutral-500">Lokation</dt><dd>{inv.location.name} ({inv.location.company.name})</dd></div>
              )}
              <div className="flex gap-2"><dt className="w-24 text-neutral-500">E-mail</dt><dd>{inv.email}</dd></div>
              <div className="flex gap-2"><dt className="w-24 text-neutral-500">Fra</dt><dd>{inv.invitedBy.name ?? inv.invitedBy.email}</dd></div>
            </dl>
            <ActionForm action={acceptInvitation} className="mt-6 space-y-4">
              <input type="hidden" name="token" value={token} />
              <div>
                <Label htmlFor="name">Dit navn (valgfrit)</Label>
                <Input id="name" name="name" className="mt-1" autoComplete="name" />
              </div>
              <SubmitButton className="w-full" pendingText="Accepterer…">Acceptér og log ind</SubmitButton>
            </ActionForm>
          </>
        )}
      </Card>
    </main>
  );
}
