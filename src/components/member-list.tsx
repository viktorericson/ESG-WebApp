import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, EmptyState } from "@/components/ui";
import { removeMembership, revokeInvitation } from "@/lib/actions/org";
import type { getMembersAndInvites } from "@/lib/org-data";
import { ROLE_LABELS, type Access } from "@/lib/permissions";

type Data = Awaited<ReturnType<typeof getMembersAndInvites>>;

function scopeText(x: { company: { name: string } | null; location: { name: string; company: { name: string } } | null }) {
  if (x.location) return `${x.location.company.name} – ${x.location.name}`;
  if (x.company) return x.company.name;
  return "Hele koncernen";
}

const dateFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });

export function MemberList({ orgId, data, access, currentUserId }: { orgId: string; data: Data; access: Access; currentUserId: string }) {
  const { memberships, invitations } = data;
  if (memberships.length === 0 && invitations.length === 0) return <EmptyState>Ingen brugere endnu.</EmptyState>;

  return (
    <ul className="divide-y divide-neutral-100">
      {memberships.map((m) => {
        const canRemove = access.canInvite({ role: m.role, companyId: m.companyId, location: m.location });
        return (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {m.user.name ?? m.user.email}
                {m.userId === currentUserId && <span className="ml-2 text-xs font-normal text-neutral-500">(dig)</span>}
              </p>
              {m.user.name && <p className="text-xs text-neutral-500">{m.user.email}</p>}
            </div>
            <Badge tone={m.role === "ORG_ADMIN" ? "green" : "neutral"}>{ROLE_LABELS[m.role]}</Badge>
            <span className="w-56 truncate text-neutral-600">{scopeText(m)}</span>
            {canRemove ? (
              <ActionForm action={removeMembership} confirm={`Fjern ${m.user.email}s adgang som ${ROLE_LABELS[m.role].toLowerCase()}?`}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="membershipId" value={m.id} />
                <SubmitButton variant="ghost" pendingText="…" className="px-2 py-1 text-xs">
                  Fjern
                </SubmitButton>
              </ActionForm>
            ) : (
              <span className="w-12" />
            )}
          </li>
        );
      })}
      {invitations.map((inv) => (
        <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-neutral-50/60 px-5 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-neutral-700">{inv.email}</p>
            <p className="text-xs text-neutral-500">Inviteret · udløber {dateFmt.format(inv.expiresAt)}</p>
          </div>
          <Badge tone="amber">Afventer</Badge>
          <span className="text-neutral-500">{ROLE_LABELS[inv.role]}</span>
          <span className="w-56 truncate text-neutral-600">{scopeText(inv)}</span>
          {access.canInvite({ role: inv.role, companyId: inv.companyId, location: inv.location }) && (
            <ActionForm action={revokeInvitation}>
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="invitationId" value={inv.id} />
              <SubmitButton variant="ghost" pendingText="…" className="px-2 py-1 text-xs">
                Træk tilbage
              </SubmitButton>
            </ActionForm>
          )}
        </li>
      ))}
    </ul>
  );
}
