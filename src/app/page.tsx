import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Card, CardHeader, Input, Label } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import { createOrganization } from "@/lib/actions/org";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export default async function Home() {
  const user = await requireUser();
  const orgs = await db.organization.findMany({
    where: { memberships: { some: { userId: user.id } } },
    orderBy: { name: "asc" },
  });
  if (orgs.length === 1) redirect(`/org/${orgs[0].id}`);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">ESG Rapportering</p>
        <UserMenu email={user.email} />
      </div>

      {orgs.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Vælg koncern" />
          <ul className="divide-y divide-neutral-100">
            {orgs.map((o) => (
              <li key={o.id}>
                <Link href={`/org/${o.id}`} className="block px-5 py-3 text-sm font-medium hover:bg-neutral-50">
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {env.allowSignup ? (
        <Card>
          <CardHeader
            title="Opret koncern"
            description="Opret koncernen og dens øverste moderselskab. Datterselskaber og lokationer tilføjes bagefter."
          />
          <ActionForm action={createOrganization} className="space-y-4 p-5">
            <div>
              <Label htmlFor="orgName">Koncernens navn</Label>
              <Input id="orgName" name="orgName" required className="mt-1" placeholder="fx Hansen Gruppen" />
              <FieldError name="orgName" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="companyName">Moderselskab</Label>
                <Input id="companyName" name="companyName" required className="mt-1" placeholder="fx Hansen Holding A/S" />
                <FieldError name="companyName" />
              </div>
              <div>
                <Label htmlFor="cvr">CVR-nummer</Label>
                <Input id="cvr" name="cvr" required inputMode="numeric" className="mt-1" placeholder="12345678" />
                <FieldError name="cvr" />
              </div>
            </div>
            <SubmitButton pendingText="Opretter…">Opret koncern</SubmitButton>
          </ActionForm>
        </Card>
      ) : (
        orgs.length === 0 && (
          <Card className="p-6 text-sm text-neutral-600">Du har endnu ikke adgang til nogen koncern. Bed en koncernadmin om en invitation.</Card>
        )
      )}
    </main>
  );
}
