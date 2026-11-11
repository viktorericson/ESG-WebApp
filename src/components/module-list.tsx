import Link from "next/link";
import { Badge, cx } from "@/components/ui";
import { isBuilt } from "@/lib/forms/registry";
import { STATUS_LABELS, STATUS_TONE, type ModuleStatusValue } from "@/lib/forms/status";
import type { ModuleDef } from "@/lib/forms/types";

export function ModuleList({
  modules,
  statuses,
  hrefFor,
  comprehensive,
}: {
  modules: ModuleDef[];
  statuses: Map<string, { status: ModuleStatusValue }>;
  hrefFor: (m: ModuleDef) => string;
  comprehensive: boolean;
}) {
  return (
    <ul className="divide-y divide-neutral-100">
      {modules.map((m) => {
        const built = isBuilt(m);
        const status = statuses.get(m.key)?.status ?? "NOT_STARTED";
        const cOnlyModule = m.vs.every((v) => v.startsWith("C"));
        const inner = (
          <>
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-neutral-400">{m.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{m.title}</span>
              <span className="block truncate text-xs text-neutral-500">{m.description}</span>
            </span>
            <span className="hidden gap-1 sm:flex">
              {m.vs.map((v) => (
                <span key={v} className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                  {v}
                </span>
              ))}
            </span>
            <span className="w-28 shrink-0 text-right">
              {m.stamdata ? (
                <span className="text-xs text-neutral-500">Stamdata</span>
              ) : !built ? (
                <span className="text-xs text-neutral-400">Kommer snart</span>
              ) : cOnlyModule && !comprehensive ? (
                <span className="text-xs text-neutral-400">Kun ved B+C</span>
              ) : (
                <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>
              )}
            </span>
          </>
        );
        const cls = "flex items-center gap-3 px-5 py-3 text-sm";
        return (
          <li key={m.key}>
            {built && !(cOnlyModule && !comprehensive) ? (
              <Link href={hrefFor(m)} className={cx(cls, "hover:bg-neutral-50")}>
                {inner}
              </Link>
            ) : (
              <div className={cx(cls, !m.stamdata && "opacity-60")}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PeriodSwitcher({ periods, current, hrefFor }: { periods: { id: string; year: number }[]; current: string; hrefFor: (id: string) => string }) {
  if (periods.length <= 1) return null;
  return (
    <nav aria-label="Rapporteringsår" className="flex gap-1">
      {periods.map((p) => (
        <Link
          key={p.id}
          href={hrefFor(p.id)}
          aria-current={p.id === current ? "page" : undefined}
          className={cx("rounded-md px-2.5 py-1 text-sm tabular-nums", p.id === current ? "bg-brand-600 text-white" : "text-neutral-600 hover:bg-neutral-100")}
        >
          {p.year}
        </Link>
      ))}
    </nav>
  );
}
