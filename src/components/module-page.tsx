import Link from "next/link";
import type { ReactNode } from "react";
import { ModuleForm } from "@/components/forms/module-form";
import { PeriodSwitcher } from "@/components/module-list";
import { PageHeader } from "@/components/ui";
import { deny, requireOrgAccess } from "@/lib/auth";
import type { Answers } from "@/lib/forms/types";
import { getModuleData, loadModuleScope, type Target } from "@/lib/module-data";
import { getPeriods, pickPeriod } from "@/lib/periods";

/** Fælles side for et selskabs- eller lokationsmodul */
export async function ModulePage({
  orgId,
  moduleKey,
  target,
  periodParam,
  backHref,
  backLabel,
  basePath,
  intro,
}: {
  orgId: string;
  moduleKey: string;
  target: Target;
  periodParam: unknown;
  backHref: string;
  backLabel: string;
  basePath: string;
  intro?: ReactNode;
}) {
  const { access } = await requireOrgAccess(orgId);
  const periods = await getPeriods(orgId);
  const period = pickPeriod(periods, periodParam);
  if (!period) deny();

  const scope = await loadModuleScope(orgId, access, period.id, moduleKey, target);
  if (!scope || scope.def.sections.length === 0) deny();
  const data = await getModuleData(period.id, moduleKey, scope.targetKey);

  const owner = scope.location ? `${scope.location.name} · ${scope.company.name}` : scope.company.name;

  return (
    <>
      <Link href={`${backHref}?period=${period.id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
        ← {backLabel}
      </Link>
      <PageHeader
        title={
          <span>
            <span className="mr-2 text-neutral-500">{scope.def.number}.</span>
            {scope.def.title}
          </span>
        }
        description={`${owner} · Rapporteringsår ${period.year}. ${scope.def.description}`}
        action={<PeriodSwitcher periods={periods} current={period.id} hrefFor={(id) => `${basePath}?period=${id}`} />}
      />
      <ModuleForm
        key={`${period.id}-${scope.targetKey}`}
        moduleKey={moduleKey}
        orgId={orgId}
        periodId={period.id}
        target={target}
        initialAnswers={(data?.answers ?? {}) as Answers}
        initialStatus={data?.status ?? "NOT_STARTED"}
        initialNote={data?.statusNote ?? null}
        initialAttachments={(data?.attachments ?? []).map((a) => ({ id: a.id, sectionKey: a.sectionKey, filename: a.filename, size: a.size }))}
        ctx={scope.ctx}
        canEdit={scope.canEdit}
        lockedReason={scope.lockReason ?? undefined}
        intro={intro}
      />
    </>
  );
}
