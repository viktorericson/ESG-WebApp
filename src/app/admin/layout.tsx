import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { UserMenu } from "@/components/user-menu";
import { requirePlatformAdmin } from "@/lib/admin";

// Rodlayoutet tilføjer selv " · ESG Rapportering"
export const metadata = { title: { template: "%s · Admin", default: "Admin" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePlatformAdmin();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                ESG
              </Link>
              <span className="text-neutral-300">/</span>
              <span className="font-medium">Platform-admin</span>
            </div>
            <UserMenu email={user.email} />
          </div>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
