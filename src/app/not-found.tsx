import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Siden findes ikke</h1>
      <p className="text-sm text-neutral-500">Den er flyttet, eller du har ikke adgang til den.</p>
      <Link href="/" className="mt-3 text-sm font-medium text-brand-700 underline underline-offset-2">Til forsiden</Link>
    </main>
  );
}
