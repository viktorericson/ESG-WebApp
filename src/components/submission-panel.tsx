import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, Textarea } from "@/components/ui";
import { reviewCompany, submitCompany } from "@/lib/actions/review";
import type { Access } from "@/lib/permissions";
import { getSubmission, readiness, SUBMISSION_ICON, SUBMISSION_LABELS, SUBMISSION_TONE } from "@/lib/review";

const timeFmt = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" });

/** Indsendelse og gennemgang af selskabets data for et rapporteringsår */
export async function SubmissionPanel({ orgId, periodId, year, companyId, access }: { orgId: string; periodId: string; year: number; companyId: string; access: Access }) {
  const [sub, r] = await Promise.all([getSubmission(periodId, companyId), readiness(periodId, companyId)]);
  const status = sub?.status ?? "DRAFT";
  const canSubmit = access.managesCompany(companyId) && (status === "DRAFT" || status === "RETURNED");
  const hidden = (
    <>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="companyId" value={companyId} />
    </>
  );
  const missing = r.items.filter((i) => !i.done);
  const hrefFor = (i: (typeof r.items)[number]) =>
    i.locationId ? `/org/${orgId}/locations/${i.locationId}/modules/${i.moduleKey}?period=${periodId}` : `/org/${orgId}/companies/${companyId}/modules/${i.moduleKey}?period=${periodId}`;

  return (
    <Card>
      <CardHeader
        title={`Indsendelse ${year}`}
        description={`${r.done} af ${r.total} moduler er færdige eller markeret ikke relevante.`}
        action={<Badge tone={SUBMISSION_TONE[status]} icon={SUBMISSION_ICON[status]}>{SUBMISSION_LABELS[status]}</Badge>}
      />
      <div className="space-y-4 px-5 py-4 text-sm">
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Færdige moduler" aria-valuenow={r.done} aria-valuemin={0} aria-valuemax={r.total}>
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
        </div>

        {sub?.comment && (status === "RETURNED" || status === "APPROVED" || status === "SUBMITTED") && (
          <p className={status === "RETURNED" ? "rounded-md bg-red-50 px-3 py-2 text-red-800" : "rounded-md bg-neutral-50 px-3 py-2 text-neutral-700"}>
            <span className="font-medium">{status === "SUBMITTED" ? "Kommentar fra selskabet" : "Kommentar fra koncernadmin"}:</span> {sub.comment}
          </p>
        )}
        {sub?.submittedAt && (
          <p className="text-xs text-neutral-500">
            Indsendt {timeFmt.format(sub.submittedAt)} af {sub.submittedBy?.name ?? sub.submittedBy?.email ?? "–"}
            {sub.reviewedAt && ` · gennemgået ${timeFmt.format(sub.reviewedAt)} af ${sub.reviewedBy?.name ?? sub.reviewedBy?.email ?? "–"}`}
          </p>
        )}

        {missing.length > 0 && status !== "APPROVED" && (
          <details>
            <summary className="cursor-pointer text-neutral-700">Mangler ({missing.length})</summary>
            <ul className="mt-2 space-y-1">
              {missing.map((i) => (
                <li key={`${i.moduleKey}-${i.locationId}`}>
                  <Link href={hrefFor(i)} className="text-brand-700 hover:underline">
                    {i.target}: {i.title}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}

        {canSubmit && (
          <ActionForm action={submitCompany} className="space-y-2">
            {hidden}
            <Textarea name="comment" rows={2} placeholder="Evt. kommentar til koncernadmin" aria-label="Kommentar til koncernadmin" />
            <SubmitButton disabled={!r.ready} pendingText="Indsender…" aria-describedby={r.ready ? undefined : "submit-reason"}>
              Indsend til gennemgang
            </SubmitButton>
            {!r.ready && (
              <p id="submit-reason" className="text-xs text-neutral-600">
                Kan indsendes, når alle {r.total} moduler er færdige eller markeret ikke relevante – {missing.length} mangler (se listen ovenfor).
              </p>
            )}
            <p className="text-xs text-neutral-500">Når data er indsendt, er de låst, indtil koncernadmin har godkendt dem eller sendt dem tilbage.</p>
          </ActionForm>
        )}

        {access.canManageOrg && (status === "SUBMITTED" || status === "APPROVED") && (
          <div className="space-y-2 border-t border-neutral-100 pt-4">
            <p className="font-medium">Gennemgang</p>
            <ActionForm action={reviewCompany} className="space-y-2">
              {hidden}
              <Textarea name="comment" rows={2} placeholder={status === "APPROVED" ? "Hvorfor skal data genåbnes?" : "Kommentar (krævet ved “send tilbage”)"} aria-label="Kommentar til selskabet" />
              <FieldError name="comment" />
              <div className="flex flex-wrap gap-2">
                {status === "SUBMITTED" && (
                  <SubmitButton name="decision" value="APPROVE" pendingText="…">
                    Godkend og lås
                  </SubmitButton>
                )}
                <SubmitButton name="decision" value="RETURN" variant="secondary" pendingText="…">
                  {status === "APPROVED" ? "Genåbn og send tilbage" : "Send tilbage"}
                </SubmitButton>
              </div>
            </ActionForm>
          </div>
        )}
      </div>
    </Card>
  );
}
