import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { isPlatformAdmin } from "@/lib/env";

export function UserMenu({ email }: { email: string }) {
  return (
    <form action={logout} className="flex items-center gap-3 text-sm">
      {isPlatformAdmin(email) && (
        <Link href="/admin" className="rounded-md px-2 py-1 font-medium text-brand-700 hover:bg-brand-50">
          Admin
        </Link>
      )}
      <span className="hidden text-neutral-500 sm:inline">{email}</span>
      <button type="submit" className="rounded-md px-2 py-1 text-neutral-700 hover:bg-neutral-100">
        Log ud
      </button>
    </form>
  );
}
