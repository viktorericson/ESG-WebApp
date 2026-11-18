import Link from "next/link";
import { LicensePanel } from "@/components/license-panel";
import { OrgNav } from "@/components/org-nav";
import { Card, CardHeader } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { expiringSoon, LICENSE_MESSAGES } from "@/lib/license";
import { orgLicenseStatus } from "@/lib/license-server";

const dateFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "long" });

export default async function OrgLayout({ children, params }: LayoutProps<"/org/[orgId]">) {
  const { orgId } = await params;
  const { user, access, organization } = await requireOrgAccess(orgId);
  const license = await orgLicenseStatus(organization);
  const locked = license !== null && !license.ok;
  // Varsel til koncernadmin, når licensen udløber inden for 30 dage
  const expiresSoon = expiringSoon(license);
  const orgCount = await db.membership.findMany({ where: { userId: user.id }, distinct: ["organizationId"], select: { organizationId: true } });

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href={`/org/${orgId}`} className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                ESG
              </Link>
              <span className="text-neutral-300">/</span>
              <span className="truncate font-medium">{organization.name}</span>
              {orgCount.length > 1 && (
                <Link href="/" className="text-xs text-neutral-500 underline-offset-2 hover:underline">
                  skift
                </Link>
              )}
            </div>
            <UserMenu email={user.email} />
          </div>
          {!locked && <OrgNav orgId={orgId} isAdmin={access.isAdmin} showMembers={access.canViewAll || access.managesAnyCompany} showReports={access.canViewAll} />}
        </div>
      </header>
      {expiresSoon && access.isAdmin && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Koncernens licens udløber {dateFmt.format(expiresSoon)}. Kontakt Capana for at forny den, og skift nøglen under{" "}
          <Link href={`/org/${orgId}/settings`} className="font-medium underline underline-offset-2">Indstillinger</Link>.
        </p>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {locked ? (
          /* Uden gyldig licens vises kun denne side – koncernadmin kan indtaste en ny nøgle */
          <Card className="mx-auto max-w-xl">
            <CardHeader title="Koncernen har ingen gyldig licens" description={LICENSE_MESSAGES[license.reason]} />
            {access.isAdmin ? (
              <>
                <p className="px-5 pt-4 text-sm text-neutral-700">Indtast koncernens licensnøgle fra Capana for at fortsætte. Jeres data er ikke slettet.</p>
                <LicensePanel orgId={orgId} org={organization} status={license} />
              </>
            ) : (
              <p className="p-5 text-sm text-neutral-700">Jeres data er ikke slettet, men koncernen kan ikke bruges, før koncernadmin har tilføjet en gyldig licensnøgle.</p>
            )}
          </Card>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
