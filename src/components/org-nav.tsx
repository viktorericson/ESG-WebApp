"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function OrgNav({ orgId, isAdmin, showMembers, showReports }: { orgId: string; isAdmin: boolean; showMembers: boolean; showReports: boolean }) {
  const pathname = usePathname();
  const base = `/org/${orgId}`;
  const items = [
    { href: base, label: "Overblik", exact: true },
    ...(showMembers ? [{ href: `${base}/members`, label: "Medlemmer" }] : []),
    ...(showReports ? [{ href: `${base}/reports`, label: "Rapporter" }] : []),
    ...(isAdmin ? [{ href: `${base}/settings`, label: "Indstillinger" }] : []),
  ];
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href || pathname.startsWith(`${base}/companies`) : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-neutral-600 hover:text-neutral-900",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
