import Link from "next/link";
import { Plus } from "lucide-react";

export function VaultFab() {
  return (
    <Link
      href="/vault?new=1"
      className="fixed bottom-20 right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-200 transition hover:brightness-110"
      aria-label="Add vault item"
    >
      <Plus className="h-6 w-6" />
    </Link>
  );
}
