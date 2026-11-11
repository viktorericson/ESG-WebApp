"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/admin", label: "Overblik", exact: true },
  { href: "/admin/organizations", label: "Koncerner" },
  { href: "/admin/users", label: "Brugere" },
  { href: "/admin/files", label: "Filer" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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
