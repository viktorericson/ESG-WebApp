import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Badge, Input, Label } from "@/components/ui";
import { checkLicense, setLicenseKey } from "@/lib/actions/license";
import { LICENSE_MESSAGES, maskKey, type LicenseStatus, type StoredLicense } from "@/lib/license";

const dateFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });
const timeFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });

const LIMIT_LABELS: Record<string, string> = { users: "brugere" };

/** Licensens status og formular til at skifte nøgle – bruges under Indstillinger og på låseskærmen */
export function LicensePanel({
  orgId,
  org,
  status,
  users,
  sharedWith = 0,
}: {
  orgId: string;
  org: StoredLicense;
  status: LicenseStatus;
  users?: number;
  /** Antal andre koncerner, der bruger samme nøgle */
  sharedWith?: number;
}) {
  return (
    <div className="space-y-4 p-5 text-sm">
      {org.licenseKey && (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-neutral-500">Nøgle</dt>
            <dd className="font-mono">{maskKey(org.licenseKey)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Status</dt>
            <dd>
              {status.ok ? <Badge tone="green" icon="✓">Gyldig</Badge> : <Badge tone="red" icon="!">{LICENSE_MESSAGES[status.reason]}</Badge>}
            </dd>
          </div>
          {status.ok && (
            <>
              <div>
                <dt className="text-xs text-neutral-500">Udløber</dt>
                <dd>{dateFmt.format(status.license.expiresAt)}</dd>
              </div>
              {status.license.limit !== null && (
                <div>
                  <dt className="text-xs text-neutral-500">Grænse</dt>
                  <dd>
                    {status.license.limitType === "users" && users !== undefined ? `${users} af ` : ""}
                    {status.license.limit} {LIMIT_LABELS[status.license.limitType ?? ""] ?? status.license.limitType ?? ""}
                    {sharedWith > 0 && status.license.limitType === "users" && <span className="text-neutral-500"> (samlet for alle koncerner med nøglen)</span>}
                  </dd>
                </div>
              )}
            </>
          )}
          {sharedWith > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-neutral-500">Deling</dt>
              <dd>
                Nøglen deles med {sharedWith} {sharedWith === 1 ? "anden koncern" : "andre koncerner"}
              </dd>
            </div>
          )}
          {org.licenseCheckedAt && (status.ok || status.reason === "unreachable") && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-neutral-500">Senest tjekket</dt>
              <dd>
                {timeFmt.format(org.licenseCheckedAt)}
                {org.licenseError === "unreachable" && <span className="text-amber-800"> · licensserveren svarer ikke lige nu – den seneste gyldige licens bruges i op til 7 dage</span>}
              </dd>
            </div>
          )}
        </dl>
      )}

      <ActionForm action={setLicenseKey} className="space-y-2">
        <input type="hidden" name="orgId" value={orgId} />
        <Label htmlFor="licenseKey">{org.licenseKey ? "Ny licensnøgle" : "Licensnøgle"}</Label>
        <p className="text-xs text-neutral-500">En nøgle kan deles af flere koncerner. Har licensen en brugergrænse, gælder den samlet for dem alle.</p>
        <Input id="licenseKey" name="licenseKey" required autoComplete="off" spellCheck={false} className="font-mono" />
        <FieldError name="licenseKey" />
        <SubmitButton pendingText="Tjekker…">{org.licenseKey ? "Skift nøgle" : "Gem og tjek nøgle"}</SubmitButton>
      </ActionForm>

      {org.licenseKey && (
        <ActionForm action={checkLicense}>
          <input type="hidden" name="orgId" value={orgId} />
          <SubmitButton variant="secondary" pendingText="Tjekker…">
            Tjek licensen nu
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
