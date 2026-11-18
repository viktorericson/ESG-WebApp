import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { LicensePanel } from "@/components/license-panel";
import { LogoUpload } from "@/components/logo-upload";
import { Card, CardHeader, EmptyState, Input, Label, PageHeader } from "@/components/ui";
import { renameOrganization, setBrandColor } from "@/lib/actions/org";
import { TEMPLATE_DARK } from "@/lib/brand";
import { deny, requireOrgAccess } from "@/lib/auth";
import { ACTION_LABELS } from "@/lib/audit-labels";
import { db } from "@/lib/db";
import { countLicensedUsers, orgLicenseStatus } from "@/lib/license-server";

export const metadata = { title: "Indstillinger" };


const timeFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });

function describe(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const text = [d.name, d.email, d.year, d.status].filter((v) => v !== undefined && v !== null).join(" · ");
  return d.impersonatedBy ? `${text}${text ? " · " : ""}via platform-admin ${d.impersonatedBy}` : text;
}

export default async function SettingsPage({ params }: PageProps<"/org/[orgId]/settings">) {
  const { orgId } = await params;
  const { access, organization } = await requireOrgAccess(orgId);
  if (!access.isAdmin) deny();
  const [license, users] = await Promise.all([orgLicenseStatus(organization), countLicensedUsers(orgId)]);
  const log = await db.auditLog.findMany({ where: { organizationId: orgId }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <>
      <PageHeader title="Indstillinger" />
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6 self-start">
        {license && (
          <Card>
            <CardHeader title="Licens" description="Koncernens Capana-licens. Den tjekkes med licensserveren hver time." />
            <LicensePanel orgId={orgId} org={organization} status={license} users={users} />
          </Card>
        )}
        <Card>
          <CardHeader title="Emissionsfaktorer" description="Klimakompasset som standard – med mulighed for egne faktorsæt." />
          <div className="px-5 py-4">
            <Link href={`/org/${orgId}/settings/factors`} className="text-sm font-medium text-brand-700 hover:underline">Administrér faktorsæt →</Link>
          </div>
        </Card>
        <Card>
          <CardHeader title="Logo til rapporter" description="Bruges i PowerPoint- og PDF-eksporten." />
          <LogoUpload orgId={orgId} version={organization.logoKey ? (organization.logoUpdatedAt?.toISOString() ?? organization.logoKey) : null} />
        </Card>
        <Card>
          <CardHeader title="Forsidefoto" description="Erstatter skabelonens forsidebillede i eksporten." />
          <LogoUpload kind="cover" orgId={orgId} version={organization.coverKey ? (organization.coverUpdatedAt?.toISOString() ?? organization.coverKey) : null} />
        </Card>
        <Card>
          <CardHeader title="Rapportfarve" description="Erstatter skabelonens mørkegrønne farve i overskrifter, tabeller og bokse. Lysere toner afledes automatisk." />
          <ActionForm action={setBrandColor} className="space-y-3 p-5">
            <input type="hidden" name="orgId" value={orgId} />
            <div className="flex items-center gap-3">
              <Label htmlFor="brandColor">Farve</Label>
              <input
                id="brandColor"
                name="brandColor"
                type="color"
                defaultValue={`#${organization.brandColor ?? TEMPLATE_DARK}`}
                className="h-9 w-16 cursor-pointer rounded border border-neutral-300 bg-white p-1"
              />
              <span className="text-sm tabular-nums text-neutral-500">{organization.brandColor ? `#${organization.brandColor}` : "Skabelonens grønne"}</span>
            </div>
            <FieldError name="brandColor" />
            <p className="text-xs text-neutral-500">Vælg en mørk farve, så hvid tekst kan læses på den.</p>
            <div className="flex gap-2">
              <SubmitButton>Gem farve</SubmitButton>
              {organization.brandColor && (
                <button type="submit" name="reset" value="1" className="text-sm text-neutral-600 hover:underline">
                  Brug skabelonens farve
                </button>
              )}
            </div>
          </ActionForm>
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
