"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Role = "admin" | "manager" | "employee";
type NavItem = { href: string; icon: IconName; label: string };
type IconName = "home" | "people" | "building" | "leave" | "shifts" | "sparkles" | "settings" | "profile";

const navigation: Record<Role, NavItem[]> = {
  admin: [
    { href: "/app", icon: "home", label: "Dashboard" },
    { href: "/app#employees", icon: "people", label: "Employees" },
    { href: "/app#departments", icon: "building", label: "Departments" },
    { href: "/app#leave", icon: "leave", label: "Leave" },
    { href: "/app#shifts", icon: "shifts", label: "Shifts" },
    { href: "/app#assistant", icon: "sparkles", label: "AI Assistant" },
    { href: "/app#settings", icon: "settings", label: "Settings" },
  ],
  manager: [
    { href: "/app", icon: "home", label: "Dashboard" },
    { href: "/app#team", icon: "people", label: "Team" },
    { href: "/app#leave", icon: "leave", label: "Leave" },
    { href: "/app#shifts", icon: "shifts", label: "Shifts" },
    { href: "/app#assistant", icon: "sparkles", label: "AI Assistant" },
    { href: "/app#profile", icon: "profile", label: "Profile" },
  ],
  employee: [
    { href: "/app", icon: "home", label: "Home" },
    { href: "/app#shifts", icon: "shifts", label: "My Shifts" },
    { href: "/app#leave", icon: "leave", label: "Leave" },
    { href: "/app#assistant", icon: "sparkles", label: "Assistant" },
    { href: "/app#profile", icon: "profile", label: "Profile" },
  ],
};

export function AppShell({ children, companyName, logoUrl, role = "employee" }: { children: React.ReactNode; companyName?: string; logoUrl?: string; role?: Role }) {
  const router = useRouter();
  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    localStorage.removeItem("moshomo_company_id");
    router.replace("/auth");
  }

  const items = navigation[role];
  return (
    <main className="min-h-screen text-ink md:grid md:grid-cols-[276px_1fr]">
      <aside
        className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-white/5 px-5 py-6 text-white md:flex"
        style={{
          background:
            "radial-gradient(520px 300px at 50% -10%, rgba(111,224,168,0.16), transparent 60%), linear-gradient(180deg, #103a28 0%, #0c2a1d 100%)",
        }}
      >
        <Link className="flex items-center gap-3 px-1" href="/app">
          <CompanyLogo companyName={companyName} logoUrl={logoUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{companyName ?? "Moshomo"}</p>
            <p className="mt-0.5 text-xs capitalize text-brand-300/80">{role} workspace</p>
          </div>
        </Link>

        <nav className="mt-9 space-y-1" aria-label="Workspace navigation">
          {items.map((item, index) => (
            <Link
              className={index === 0 ? "nav-link nav-link-active" : "nav-link"}
              href={item.href}
              key={item.label}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand-300">
            <Icon name="sparkles" /> MOSHOMO AI
          </div>
          <p className="mt-2 text-sm leading-5 text-white/75">
            Your workforce copilot is ready when you are.
          </p>
          <Link
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-white transition hover:text-brand-300"
            href="/app#assistant"
          >
            Ask a question <span aria-hidden>→</span>
          </Link>
        </div>
        <button
          className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/60 transition hover:bg-white/[0.08] hover:text-white"
          onClick={signOut}
        >
          <Icon name="profile" />
          Sign out
        </button>
      </aside>

      <section className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-white/80 px-5 py-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              <CompanyLogo companyName={companyName} logoUrl={logoUrl} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{companyName ?? "Moshomo"}</p>
                <p className="text-xs capitalize text-ink-muted">{role} workspace</p>
              </div>
            </div>
            <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 md:block">
              Workforce OS
            </p>
            <div className="flex items-center gap-3">
              <span className="badge hidden sm:inline-flex">{role}</span>
              <button
                className="secondary-button px-3 py-2 text-sm md:hidden"
                onClick={signOut}
              >
                Sign out
              </button>
              <div className="grid size-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 ring-1 ring-brand-300/40">
                {role.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </div>
          <nav
            className="mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden"
            aria-label="Mobile workspace navigation"
          >
            {items.map((item, index) => (
              <Link
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  index === 0
                    ? "bg-brand-900 text-white"
                    : "border border-[var(--line-strong)] bg-surface text-ink-muted"
                }`}
                href={item.href}
                key={item.label}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <div className="animate-fade px-5 py-6 sm:px-7 md:px-8 md:py-9 xl:px-10">{children}</div>
      </section>
    </main>
  );
}

function CompanyLogo({ companyName, logoUrl }: { companyName?: string; logoUrl?: string }) {
  if (logoUrl) return <div aria-label={`${companyName ?? "Company"} logo`} className="size-10 shrink-0 rounded-xl bg-white bg-contain bg-center bg-no-repeat shadow-sm ring-1 ring-black/5" role="img" style={{ backgroundImage: `url("${logoUrl}")` }} />;
  return <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-sm font-black text-brand-800 ring-1 ring-brand-300/40">{(companyName ?? "M").slice(0, 2).toUpperCase()}</div>;
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    building: <><path d="M3 21h18M6 21V4h9v17M15 9h3v12M9 8h2M9 12h2M9 16h2"/></>,
    leave: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01"/></>,
    shifts: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    sparkles: <><path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3Z"/><path d="m5 15-.7 2.3L2 18l2.3.7L5 21l.7-2.3L8 18l-2.3-.7L5 15ZM19 14l-.7 2.3-2.3.7 2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.2.36.6.8 1.1 1 .35.15.75.2 1.1.2h.1v4h-.1a1.7 1.7 0 0 0-1.1.4c-.5.2-.9.6-1.1 1Z"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  };
  return <svg aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{paths[name]}</svg>;
}
