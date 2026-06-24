"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const highlights = [
  "Employees, leave, and smart shifts in one workspace",
  "Role-aware for admins, managers, and employees",
  "A workforce assistant grounded in your own data",
];

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const fullName = String(form.get("fullName") ?? "");
    try {
      const supabase = getSupabaseBrowserClient();
      const result =
        mode === "signup"
          ? await supabase.auth.signUp({
              email,
              password,
              options: { data: { full_name: fullName } },
            })
          : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
        return;
      }
      router.replace("/app");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(640px 420px at 14% -10%, rgba(111,224,168,0.22), transparent 60%), linear-gradient(150deg, #123d2a 0%, #0c2a1d 58%, #16352b 100%)",
          }}
        />
        <Link className="flex items-center gap-2.5" href="/">
          <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-sm font-black text-brand-100">
            M
          </span>
          <span className="text-lg font-semibold tracking-tight">Moshomo</span>
        </Link>

        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-300">
            Workforce OS
          </p>
          <h1 className="mt-5 text-balance text-5xl font-semibold leading-[1.06]">
            Your work and your team, in one place.
          </h1>
          <ul className="mt-9 space-y-3.5">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-emerald-50/85">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-300/20 text-brand-300">
                  <svg
                    aria-hidden
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                <span className="text-sm leading-6">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-emerald-100/55">
          © {new Date().getFullYear()} Moshomo · AI-native workforce operations
        </p>
      </section>

      <section className="flex items-center justify-center bg-canvas p-6 sm:p-10">
        <div className="premium-card w-full max-w-md animate-rise p-8 sm:p-9">
          <Link
            className="mb-7 flex items-center gap-2 text-sm font-semibold text-ink-soft lg:hidden"
            href="/"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-brand-900 text-xs font-black text-brand-100">
              M
            </span>
            Moshomo
          </Link>
          <p className="eyebrow">{mode === "signup" ? "Create account" : "Welcome back"}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            {mode === "signup" ? "Start your company" : "Sign in to Moshomo"}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            {mode === "signup"
              ? "You will become its founding admin and first employee."
              : "Continue to your workforce workspace."}
          </p>

          <form className="mt-8 space-y-5" onSubmit={submit}>
            {mode === "signup" && <Field autoComplete="name" label="Full name" name="fullName" />}
            <Field autoComplete="email" label="Work email" name="email" type="email" />
            <Field autoComplete={mode === "signup" ? "new-password" : "current-password"} label="Password" minLength={mode === "signup" ? 8 : undefined} name="password" type="password" />
            {mode === "signup" && <p className="-mt-2 text-xs text-ink-faint">Use at least 8 characters.</p>}
            {message && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
                {message}
              </p>
            )}
            <button className="primary-button w-full py-3.5" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <button
            className="mt-6 text-sm font-medium text-ink-muted transition hover:text-ink"
            onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(undefined); }}
          >
            {mode === "signup"
              ? "Already have an account? Sign in"
              : "New to Moshomo? Create an account"}
          </button>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="block text-sm font-medium text-ink-soft">
      {label}
      <input autoComplete={autoComplete} className="input mt-2" minLength={minLength} name={name} type={type} required />
    </label>
  );
}
