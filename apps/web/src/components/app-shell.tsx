"use client";

import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { navGroupsFor, type Role } from "@/lib/apps";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function AppShell({ children, companyName, logoUrl, role = "employee", userEmail }: { children: React.ReactNode; companyName?: string; logoUrl?: string; role?: Role; userEmail?: string }) {
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = useMemo(() => navGroupsFor(role), [role]);

  useEffect(() => {
    const sync = () => {
      setHash(window.location.hash);
      setMobileOpen(false);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    localStorage.removeItem("moshomo_company_id");
    router.replace("/auth");
  }

  const href = (section: string) => (section ? `/app#${section}` : "/app");
  const isActive = (section: string) => section ? hash === `#${section}` : hash === "" || hash === "#";
  const activeModule = groups.flatMap((group) => group.modules).find((module) => isActive(module.section));
  const activeLabel = activeModule?.roles[role]?.label ?? (role === "employee" ? "Home" : "Dashboard");

  function navigate(event: MouseEvent<HTMLAnchorElement>, section: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (section) {
      if (window.location.hash !== `#${section}`) window.location.hash = section;
      else setMobileOpen(false);
      return;
    }
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } else {
      setMobileOpen(false);
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <a className="flex items-center gap-3 rounded-xl px-2 py-1" href="/app" onClick={(event) => navigate(event, "")}>
        <CompanyLogo companyName={companyName} logoUrl={logoUrl} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-white">{companyName ?? "Moshomo"}</p>
          <p className="mt-0.5 text-xs capitalize text-white/55">{role} workspace</p>
        </div>
      </a>

      <nav className="mt-8 flex-1 space-y-7 overflow-y-auto pr-1" aria-label="Workspace navigation">
        {groups.map((group) => (
          <div className="space-y-1" key={group.id}>
            {group.label && <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{group.label}</p>}
            {group.modules.map((module) => (
              <a
                aria-current={isActive(module.section) ? "page" : undefined}
                className={isActive(module.section) ? "nav-link nav-link-active" : "nav-link"}
                href={href(module.section)}
                key={module.id}
                onClick={(event) => navigate(event, module.section)}
              >
                <Icon name={module.icon} />
                <span className="flex-1">{module.roles[role]!.label}</span>
                {module.status === "coming-soon" && <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/45">Soon</span>}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-5 pt-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-2.5 ring-1 ring-white/8">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-sm font-bold text-ink">{role.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{userEmail ?? companyName ?? "Account"}</p><p className="mt-0.5 text-[11px] capitalize text-white/50">{role}</p></div>
          <button aria-label="Sign out" className="icon-button-dark" onClick={signOut} title="Sign out"><LogoutIcon /></button>
        </div>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-canvas text-ink md:pl-[276px]">
      <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[276px] px-4 py-5 text-white md:block">{sidebar}</aside>

      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />}
      <aside aria-label="Mobile navigation" className={`app-sidebar fixed inset-y-0 left-0 z-50 w-[min(88vw,320px)] px-4 py-5 text-white shadow-2xl transition-transform duration-200 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{sidebar}</aside>

      <section className="min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 shadow-sm backdrop-blur-xl">
          <div className="flex h-[68px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button aria-label="Open navigation" className="icon-button md:hidden" onClick={() => setMobileOpen(true)}><MenuIcon /></button>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{activeLabel}</p><p className="hidden truncate text-xs text-ink-muted sm:block">{companyName ?? "Moshomo workforce workspace"}</p></div>
            </div>
            <div className="flex items-center gap-2">
              <button className="topbar-search hidden lg:flex" type="button"><SearchIcon /><span>Search workspace</span><kbd>⌘ K</kbd></button>
              <button aria-label="Notifications" className="icon-button" title="Notifications"><BellIcon /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-emerald-500 ring-2 ring-white" /></button>
              <span className="hidden h-7 w-px bg-[var(--line)] sm:block" />
              <div className="grid size-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 ring-1 ring-brand-300/40">{role.slice(0, 1).toUpperCase()}</div>
            </div>
          </div>
        </header>
        <div className="px-4 py-6 sm:px-6 md:py-8 lg:px-8 xl:px-10">{children}</div>
      </section>
    </main>
  );
}

function CompanyLogo({ companyName, logoUrl }: { companyName?: string; logoUrl?: string }) {
  if (logoUrl) return <div aria-label={`${companyName ?? "Company"} logo`} className="size-10 shrink-0 rounded-xl bg-white bg-contain bg-center bg-no-repeat shadow-sm ring-1 ring-black/5" role="img" style={{ backgroundImage: `url("${logoUrl}")` }} />;
  return <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-sm font-black text-ink">{(companyName ?? "M").slice(0, 2).toUpperCase()}</div>;
}

function MenuIcon() { return <svg aria-hidden className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>; }
function SearchIcon() { return <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>; }
function BellIcon() { return <svg aria-hidden className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>; }
function LogoutIcon() { return <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>; }
