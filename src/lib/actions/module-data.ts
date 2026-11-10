"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { evaluateModule, nextStatus, sanitizeAnswers } from "@/lib/forms/engine";
import type { Answers } from "@/lib/forms/types";
import { loadModuleScope, type Target } from "@/lib/module-data";

type Input = { orgId: string; periodId: string; moduleKey: string; target: Target };

export type SaveResult =
  | { ok: true; savedAt: string; status: string }
  | { ok: false; error: string };

async function scopeFor(input: Input) {
  const { user, access } = await requireOrgAccess(input.orgId);
  const scope = await loadModuleScope(input.orgId, access, input.periodId, input.moduleKey, input.target);
  return { user, scope };
}

function errorFor(scope: Awaited<ReturnType<typeof loadModuleScope>>): string | null {
  if (!scope) return "Modulet findes ikke, eller du har ikke adgang.";
  if (scope.locked) return "Data er låst, fordi selskabet indgår i en godkendt rapport.";
  if (!scope.canEdit) return "Du har ikke adgang til at redigere dette modul.";
  return null;
}

/** Autosave. Gemmer de sanerede svar og opdaterer status. */
export async function saveModuleAnswers(input: Input & { answers: Answers }): Promise<SaveResult> {
  const { user, scope } = await scopeFor(input);
  const err = errorFor(scope);
  if (err || !scope) return { ok: false, error: err! };

  const answers = sanitizeAnswers(scope.def, input.answers ?? {}, scope.ctx);
  const json = answers as Prisma.InputJsonObject;
  const existing = await db.moduleData.findUnique({
    where: { periodId_moduleKey_targetKey: { periodId: input.periodId, moduleKey: input.moduleKey, targetKey: scope.targetKey } },
  });
  const status = nextStatus(existing?.status ?? "NOT_STARTED", evaluateModule(scope.def, answers, scope.ctx));

  const row = await db.moduleData.upsert({
    where: { periodId_moduleKey_targetKey: { periodId: input.periodId, moduleKey: input.moduleKey, targetKey: scope.targetKey } },
    create: {
      periodId: input.periodId,
      moduleKey: input.moduleKey,
      targetKey: scope.targetKey,
      companyId: scope.company.id,
      locationId: scope.location?.id ?? null,
      answers: json,
      status,
      updatedById: user.id,
    },
    update: { answers: json, status, updatedById: user.id, ...(status !== existing?.status && status !== "NOT_RELEVANT" ? { statusNote: null } : {}) },
  });
  return { ok: true, savedAt: row.updatedAt.toISOString(), status: row.status };
}

/** Markér færdig / ikke relevant / genåbn */
export async function setModuleStatus(
  input: Input & { status: "COMPLETED" | "NOT_RELEVANT" | "IN_PROGRESS"; note?: string },
): Promise<SaveResult> {
  const { user, scope } = await scopeFor(input);
  const err = errorFor(scope);
  if (err || !scope) return { ok: false, error: err! };

  const where = { periodId_moduleKey_targetKey: { periodId: input.periodId, moduleKey: input.moduleKey, targetKey: scope.targetKey } };
  const existing = await db.moduleData.findUnique({ where });
  const answers = (existing?.answers ?? {}) as Answers;
  const note = input.note?.trim().slice(0, 2000) || null;

  if (input.status === "COMPLETED" && !evaluateModule(scope.def, answers, scope.ctx).complete) {
    return { ok: false, error: "Udfyld alle krævede felter, eller markér sektioner som “data mangler” med en begrundelse." };
  }
  if (input.status === "NOT_RELEVANT" && !note) return { ok: false, error: "Angiv hvorfor modulet ikke er relevant." };

  const status = input.status === "IN_PROGRESS" ? nextStatus("IN_PROGRESS", evaluateModule(scope.def, answers, scope.ctx)) : input.status;
  const row = await db.moduleData.upsert({
    where,
    create: {
      periodId: input.periodId,
      moduleKey: input.moduleKey,
      targetKey: scope.targetKey,
      companyId: scope.company.id,
      locationId: scope.location?.id ?? null,
      status,
      statusNote: input.status === "NOT_RELEVANT" ? note : null,
      updatedById: user.id,
    },
    update: { status, statusNote: input.status === "NOT_RELEVANT" ? note : null, updatedById: user.id },
  });
  await audit({
    organizationId: input.orgId,
    userId: user.id,
    action: "module.status",
    entityType: "ModuleData",
    entityId: row.id,
    data: { name: `${scope.def.title} – ${scope.location?.name ?? scope.company.name}`, status },
  });
  revalidatePath(`/org/${input.orgId}`, "layout");
  return { ok: true, savedAt: row.updatedAt.toISOString(), status: row.status };
}
