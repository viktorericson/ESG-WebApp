import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Card, CardHeader, EmptyState, Input, Label, PageHeader } from "@/components/ui";
import { renameOrganization } from "@/lib/actions/org";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Indstillinger" };

const ACTION_LABELS: Record<string, string> = {
  "organization.create": "oprettede koncernen",
  "organization.rename": "omdøbte koncernen",
  "company.create": "oprettede selskab",
  "company.update": "opdaterede selskab",
  "company.archive": "arkiverede selskab",
  "location.create": "oprettede lokation",
  "location.update": "opdaterede lokation",
  "location.archive": "arkiverede lokation",
  "period.create": "oprettede rapporteringsår",
  "period.delete": "slettede rapporteringsår",
  "invitation.create": "inviterede",
  "invitation.revoke": "trak invitation tilbage",
  "invitation.accept": "accepterede invitation",
  "membership.remove": "fjernede adgang",
  "report.create": "oprettede rapport",
  "report.update": "opdaterede rapport",
  "report.status": "ændrede status på rapport",
  "report.delete": "slettede rapport",
  "module.status": "ændrede status på modul",
  "factorSet.copy": "oprettede eget faktorsæt",
  "factorSet.delete": "slettede faktorsæt",
  "factor.update": "rettede emissionsfaktor",
  "period.factorSet": "skiftede faktorsæt for rapporteringsår",
};

const timeFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });

function describe(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  return [d.name, d.email, d.year, d.status].filter((v) => v !== undefined && v !== null).join(" · ");
}

export default async function SettingsPage({ params }: PageProps<"/org/[orgId]/settings">) {
  const { orgId } = await params;
  const { access, organization } = await requireOrgAccess(orgId);
  if (!access.isAdmin) deny();
  const log = await db.auditLog.findMany({ where: { organizationId: orgId }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <>
      <PageHeader title="Indstillinger" />
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6 self-start">
        <Card>
          <CardHeader title="Emissionsfaktorer" description="Klimakompasset som standard – med mulighed for egne faktorsæt." />
          <div className="px-5 py-4">
            <Link href={`/org/${orgId}/settings/factors`} className="text-sm font-medium text-brand-700 hover:underline">Administrér faktorsæt →</Link>
          </div>
        </Card>
        <Card>
          <CardHeader title="Koncern" />
          <ActionForm action={renameOrganization} className="space-y-4 p-5">
            <input type="hidden" name="orgId" value={orgId} />
            <div>
              <Label htmlFor="name">Navn</Label>
              <Input id="name" name="name" defaultValue={organization.name} required className="mt-1" />
              <FieldError name="name" />
            </div>
            <SubmitButton>Gem</SubmitButton>
          </ActionForm>
        </Card>
        </div>
        <Card>
          <CardHeader title="Aktivitetslog" description="De seneste 50 ændringer." />
          {log.length === 0 ? (
            <EmptyState>Ingen aktivitet.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {log.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-3 px-5 py-2.5">
                  <span className="w-32 shrink-0 tabular-nums text-neutral-500">{timeFmt.format(e.createdAt)}</span>
                  <span className="font-medium">{e.user?.name ?? e.user?.email ?? "System"}</span>
                  <span className="text-neutral-700">{ACTION_LABELS[e.action] ?? e.action}</span>
                  <span className="text-neutral-500">{describe(e.data)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
