"use client";

import { useState } from "react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Input, Label, Select } from "@/components/ui";
import { inviteMember } from "@/lib/actions/org";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

export type InviteOptions = {
  roles: Role[];
  companies: { id: string; name: string }[];
  locations: { id: string; name: string; companyName: string }[];
};

const ROLE_HELP: Record<Role, string> = {
  ORG_ADMIN: "Fuld adgang til hele koncernen, inkl. brugere og struktur.",
  VIEWER: "Kan se alle selskaber og data, men ikke ændre noget (fx revisor).",
  COMPANY_MANAGER: "Udfylder selskabets skemaer og administrerer dets lokationer.",
  LOCATION_CONTRIBUTOR: "Indrapporterer kun data for én lokation.",
};

export function InviteForm({ orgId, options, defaultCompanyId }: { orgId: string; options: InviteOptions; defaultCompanyId?: string }) {
  const [role, setRole] = useState<Role>(options.roles.includes("COMPANY_MANAGER") ? "COMPANY_MANAGER" : options.roles[0]);

  return (
    <ActionForm action={inviteMember} className="space-y-4 p-5" resetOnSuccess>
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="invite-email">E-mail</Label>
          <Input id="invite-email" name="email" type="email" required className="mt-1" placeholder="navn@virksomhed.dk" />
          <FieldError name="email" />
        </div>
        <div>
          <Label htmlFor="invite-role">Rolle</Label>
          <Select id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1">
            {options.roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-neutral-500">{ROLE_HELP[role]}</p>
        </div>
        {role === "COMPANY_MANAGER" && (
          <div className="sm:col-span-2">
            <Label htmlFor="invite-company">Selskab</Label>
            <Select id="invite-company" name="companyId" defaultValue={defaultCompanyId ?? ""} required className="mt-1">
              <option value="">Vælg selskab…</option>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <FieldError name="companyId" />
          </div>
        )}
        {role === "LOCATION_CONTRIBUTOR" && (
          <div className="sm:col-span-2">
            <Label htmlFor="invite-location">Lokation</Label>
            <Select id="invite-location" name="locationId" required className="mt-1">
              <option value="">Vælg lokation…</option>
              {options.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.companyName} – {l.name}
                </option>
              ))}
            </Select>
            <FieldError name="locationId" />
          </div>
        )}
      </div>
      <SubmitButton pendingText="Sender…">Send invitation</SubmitButton>
    </ActionForm>
  );
}
