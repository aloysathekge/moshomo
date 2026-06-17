"use client";

import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { type AppModule, navGroupsFor, type Role } from "@/lib/apps";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function AppShell({ children, companyName, logoUrl, role = "employee", userEmail }: { children: React.ReactNode; companyName?: string; logoUrl?: string; role?: Role; userEmail?: string }) {
  const router = useRouter();
  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    localStorage.removeItem("moshomo_company_id");
    router.replace("/auth");
  }

  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const isActive = (href: string) => {
    const target = href.includes("#") ? `#${href.split("#")[1]}` : "";
    return target ? hash === target : hash === "" || hash === "#";
  };

  // Navigate in-page sections by setting the hash directly. Assigning location.hash
  // always *replaces* the fragment, so it never accumulates (e.g. #employees#shifts).
  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const key = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
    if (key) {
      if (window.location.hash !== `#${key}`) window.location.hash = key;
    } else if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  };
  const goSection = (section: string) => {
    if (section && window.location.hash !== `#${section}`) window.location.hash = section;
  };

  const groups = navGroupsFor(role);
  const topGroups = groups.filter((group) => group.id === "main" || group.id === "manage");
  const accountGroup = groups.find((group) => group.id === "account");
  const appModules = groups.find((group) => group.id === "apps")?.modules ?? [];
  const href = (section: string) => (section ? `/app#${section}` : "/app");
  const coreItems = [...topGroups, ...(accountGroup ? [accountGroup] : [])].flatMap((group) =>
    group.modules.map((module) => ({ href: href(module.section), label: module.roles[role]!.label })),
  );

  return (
    <main className="min-h-screen text-ink md:grid md:grid-cols-[268px_1fr]">
      <aside
        className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-white/5 px-4 py-6 text-white md:flex"
        style={{
          background:
            "radial-gradient(520px 300px at 50% -10%, rgba(111,224,168,0.16), transparent 60%), linear-gradient(180deg, #103a28 0%, #0c2a1d 100%)",
        }}
      >
        <a className="flex items-center gap-3 px-2" href="/app" onClick={(event) => navigate(event, "/app")}>
          <CompanyLogo companyName={companyName} logoUrl={logoUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{companyName ?? "Moshomo"}</p>
            <p className="mt-0.5 text-xs capitalize text-brand-300/80">{role} workspace</p>
          </div>
        </a>

        <nav className="mt-8 space-y-6" aria-label="Workspace navigation">
          {topGroups.map((group) => (
            <div className="space-y-1" key={group.id}>
              {group.label && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/45">
                  {group.label}
                </p>
              )}
              {group.modules.map((module) => (
                <a
                  className={isActive(href(module.section)) ? "nav-link nav-link-active" : "nav-link"}
                  href={href(module.section)}
                  key={module.id}
                  onClick={(event) => navigate(event, href(module.section))}
                >
                  <Icon name={module.icon} />
                  {module.roles[role]!.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto space-y-3 pt-6">
          {appModules.length > 0 && (
            <AppsDock activeHash={hash} modules={appModules} onPick={goSection} role={role} />
          )}
          <div className="space-y-1 border-t border-white/10 pt-3">
            {accountGroup?.modules.map((module) => (
              <a
                className={isActive(href(module.section)) ? "nav-link nav-link-active" : "nav-link"}
                href={href(module.section)}
                key={module.id}
                onClick={(event) => navigate(event, href(module.section))}
              >
                <Icon name={module.icon} />
                {module.roles[role]!.label}
              </a>
            ))}
            <div className="mt-1 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-sm font-bold text-brand-800">
                {role.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{userEmail ?? companyName ?? "Account"}</p>
                <p className="text-xs capitalize text-brand-300/70">{role}</p>
              </div>
              <button
                aria-label="Sign out"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white"
                onClick={signOut}
                title="Sign out"
              >
                <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="m16 17 5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
              </button>
            </div>
          </div>
        </div>
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
              <button className="secondary-button px-3 py-2 text-sm md:hidden" onClick={signOut}>
                Sign out
              </button>
              <div className="grid size-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 ring-1 ring-brand-300/40">
                {role.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden" aria-label="Mobile workspace navigation">
            {coreItems.map((item) => (
              <a
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  isActive(item.href)
                    ? "bg-brand-900 text-white"
                    : "border border-[var(--line-strong)] bg-surface text-ink-muted"
                }`}
                href={item.href}
                key={item.label}
                onClick={(event) => navigate(event, item.href)}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </header>
        <div className="animate-fade px-5 py-6 sm:px-7 md:px-8 md:py-9 xl:px-10">{children}</div>
      </section>
    </main>
  );
}

function AppsDock({ activeHash, modules, onPick, role }: { activeHash: string; modules: AppModule[]; onPick: (section: string) => void; role: Role }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/45">Apps</p>
      <div className="grid grid-cols-4 gap-1.5">
        {modules.map((module) => {
          const active = activeHash === `#${module.section}`;
          return (
            <button
              aria-label={module.roles[role]!.label}
              className={`grid aspect-square place-items-center rounded-xl transition ${
                active ? "bg-white text-brand-800" : "text-emerald-100/70 hover:bg-white/10 hover:text-white"
              }`}
              key={module.id}
              onClick={() => onPick(module.section)}
              title={module.roles[role]!.label}
            >
              <Icon name={module.icon} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompanyLogo({ companyName, logoUrl }: { companyName?: string; logoUrl?: string }) {
  if (logoUrl) return <div aria-label={`${companyName ?? "Company"} logo`} className="size-10 shrink-0 rounded-xl bg-white bg-contain bg-center bg-no-repeat shadow-sm ring-1 ring-black/5" role="img" style={{ backgroundImage: `url("${logoUrl}")` }} />;
  return <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-sm font-black text-brand-800 ring-1 ring-brand-300/40">{(companyName ?? "M").slice(0, 2).toUpperCase()}</div>;
}
