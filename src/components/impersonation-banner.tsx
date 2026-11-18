import { endImpersonation } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

/** Vises øverst på alle sider, mens en platform-admin er logget ind som en anden bruger */
export async function ImpersonationBanner() {
  const user = await getCurrentUser();
  if (!user?.impersonator) return null;
  return (
    <form action={endImpersonation} role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-100 px-4 py-2 text-sm text-amber-950">
      <span>
        Du er logget ind som <strong>{user.email}</strong> (admin: {user.impersonator.email}). Ændringer logges med din e-mail.
      </span>
      <button type="submit" className="rounded-md bg-amber-950 px-3 py-1 text-xs font-medium text-white hover:bg-amber-900">
        Tilbage til admin
      </button>
    </form>
  );
}
