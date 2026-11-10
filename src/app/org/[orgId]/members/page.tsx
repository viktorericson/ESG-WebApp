import { InviteForm } from "@/components/invite-form";
import { MemberList } from "@/components/member-list";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { deny, requireOrgAccess } from "@/lib/auth";
import { getInviteOptions, getMembersAndInvites, getVisibleCompanies } from "@/lib/org-data";

export const metadata = { title: "Medlemmer" };

export default async function MembersPage({ params }: PageProps<"/org/[orgId]/members">) {
  const { orgId } = await params;
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canViewAll && !access.managesAnyCompany) deny();
  const companies = await getVisibleCompanies(orgId, access);
  const inviteOptions = getInviteOptions(access, companies);

  // Koncernadmin/læser ser alle; selskabsansvarlige ser brugerne på deres egne selskaber
  const managed = companies.filter((c) => access.managesCompany(c.id));
  const data = access.canViewAll
    ? await getMembersAndInvites(orgId)
    : await Promise.all(managed.map((c) => getMembersAndInvites(orgId, c.id))).then((parts) => ({
        memberships: [...new Map(parts.flatMap((p) => p.memberships).map((m) => [m.id, m])).values()],
        invitations: [...new Map(parts.flatMap((p) => p.invitations).map((i) => [i.id, i])).values()],
      }));

  return (
    <>
      <PageHeader title="Medlemmer" description="Hvem har adgang, og til hvad. Invitationer sendes pr. mail og gælder i 14 dage." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Brugere og invitationer" />
          <MemberList orgId={orgId} data={data} access={access} currentUserId={user.id} />
        </Card>
        {inviteOptions.companies.length > 0 || access.isAdmin ? (
          <Card className="self-start">
            <CardHeader title="Invitér bruger" />
            <InviteForm orgId={orgId} options={inviteOptions} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
