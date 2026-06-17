"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function AppShell({ children, companyName, role }: { children: React.ReactNode; companyName?: string; role?: string }) {
  const router = useRouter();
  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    localStorage.removeItem("moshomo_company_id");
    router.replace("/auth");
  }
  return <main className="min-h-screen bg-stone-100 text-stone-950"><header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><div className="flex items-center gap-4"><Link className="text-lg font-bold" href="/app">Moshomo</Link>{companyName && <span className="text-sm text-stone-500">{companyName}</span>}{role && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-800">{role}</span>}</div><button className="text-sm font-medium text-stone-600" onClick={signOut}>Sign out</button></div></header><div className="mx-auto max-w-6xl px-5 py-8">{children}</div></main>;
}
