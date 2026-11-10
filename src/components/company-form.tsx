import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Input, Label, Select } from "@/components/ui";
import type { ActionState } from "@/lib/validation";
import { LEGAL_FORM_LABELS, legalForms } from "@/lib/validation";

type Company = {
  id: string;
  name: string;
  cvr: string;
  address: string | null;
  legalForm: string | null;
  naceCodes: string[];
  parentId: string | null;
  consolidate: boolean;
};

export function CompanyForm({
  action,
  orgId,
  company,
  parentOptions,
  canEditStructure,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  orgId: string;
  company?: Company;
  parentOptions: { id: string; name: string }[];
  canEditStructure: boolean;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="space-y-4 p-5">
      <input type="hidden" name="orgId" value={orgId} />
      {company && <input type="hidden" name="companyId" value={company.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Navn</Label>
          <Input id="name" name="name" required defaultValue={company?.name} className="mt-1" />
          <FieldError name="name" />
        </div>
        <div>
          <Label htmlFor="cvr">CVR-nummer</Label>
          <Input id="cvr" name="cvr" required inputMode="numeric" defaultValue={company?.cvr} className="mt-1" />
          <FieldError name="cvr" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="address">Adresse</Label>
          <Input id="address" name="address" defaultValue={company?.address ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="legalForm">Juridisk form</Label>
          <Select id="legalForm" name="legalForm" defaultValue={company?.legalForm ?? ""} className="mt-1">
            <option value="">Vælg…</option>
            {legalForms.map((f) => (
              <option key={f} value={f}>
                {LEGAL_FORM_LABELS[f]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="naceCodes">NACE-kode(r)</Label>
          <Input id="naceCodes" name="naceCodes" defaultValue={company?.naceCodes.join(", ")} placeholder="fx 62.01, 70.22" className="mt-1" />
          <p className="mt-1 text-xs text-neutral-500">Kommasepareret. Findes på datacvr.virk.dk under “Branchekode”.</p>
        </div>
        {canEditStructure ? (
          <>
            <div>
              <Label htmlFor="parentId">Moderselskab</Label>
              <Select id="parentId" name="parentId" defaultValue={company?.parentId ?? ""} className="mt-1">
                <option value="">Intet (øverste niveau)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <FieldError name="parentId" />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="consolidate" defaultChecked={company?.consolidate ?? true} className="size-4 accent-brand-600" />
              Medtag i koncernens konsoliderede opgørelse
            </label>
          </>
        ) : (
          <>
            {/* Felterne sendes ikke-redigerbare; serveren bevarer eksisterende værdier */}
            <input type="hidden" name="parentId" value={company?.parentId ?? ""} />
            {company?.consolidate && <input type="hidden" name="consolidate" value="on" />}
          </>
        )}
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
