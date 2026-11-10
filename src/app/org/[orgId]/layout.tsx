import Link from "next/link";
import { OrgNav } from "@/components/org-nav";
import { UserMenu } from "@/components/user-menu";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function OrgLayout({ children, params }: LayoutProps<"/org/[orgId]">) {
  const { orgId } = await params;
  const { user, access, organization } = await requireOrgAccess(orgId);
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
          <OrgNav orgId={orgId} isAdmin={access.isAdmin} showMembers={access.canViewAll || access.managesAnyCompany} showReports={access.canViewAll} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
