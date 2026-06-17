"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(undefined);
    const form = new FormData(event.currentTarget); const email = String(form.get("email")); const password = String(form.get("password")); const fullName = String(form.get("fullName") ?? "");
    try {
      const supabase = getSupabaseBrowserClient();
      const result = mode === "signup" ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }) : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session) { setMessage("Check your email to confirm your account, then sign in."); return; }
      router.replace("/app");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Authentication failed."); } finally { setLoading(false); }
  }
  return <main className="grid min-h-screen bg-stone-100 lg:grid-cols-2"><section className="hidden bg-emerald-950 p-12 text-white lg:flex lg:flex-col lg:justify-between"><Link className="text-xl font-bold" href="/">Moshomo</Link><div><p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Workforce OS</p><h1 className="max-w-xl text-5xl font-semibold leading-tight">Your work and your team, in one place.</h1></div></section><section className="flex items-center justify-center p-6"><div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm"><p className="text-sm font-semibold text-emerald-700">{mode === "signup" ? "Create account" : "Welcome back"}</p><h2 className="mt-2 text-3xl font-semibold">{mode === "signup" ? "Start your company" : "Sign in to Moshomo"}</h2><form className="mt-8 space-y-5" onSubmit={submit}>{mode === "signup" && <Field label="Full name" name="fullName" />}<Field label="Work email" name="email" type="email" /><Field label="Password" name="password" type="password" />{message && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}<button className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={loading}>{loading ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</button></form><button className="mt-6 text-sm font-medium text-stone-600" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Already have an account? Sign in" : "New to Moshomo? Create an account"}</button></div></section></main>;
}

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) { return <label className="block text-sm font-medium text-stone-700">{label}<input className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3" name={name} type={type} required /></label>; }
