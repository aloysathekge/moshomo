"use client";

import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AssistantPanel } from "@/modules/assistant/assistant-panel";
import { EmployeesPanel, type Account, type Employee, type Role } from "@/modules/employees/employees-panel";
import { HomePanel } from "@/modules/home/home-panel";
import { LeavePanel } from "@/modules/leave/leave-panel";
import { PlanPanel } from "@/modules/plan/plan-panel";
import { ShiftsPanel } from "@/modules/shifts/shifts-panel";
import { Icon } from "@/components/icon";
import { moduleForSection } from "@/lib/apps";
import { moshomoApi } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Membership = { company_id: string; role: Role };
type Company = { id: string; name: string; slug: string; logo_path: string | null };
type Department = { id: string; company_id: string; name: string };
type MembershipRow = { user_id: string; role: Role; status: string };
type InvitationRow = { email: string; role: Role; status: string };

const EMPLOYEE_COLUMNS =
  "id,company_id,profile_id,department_id,manager_employee_id,employee_number,first_name,last_name,email,phone_number,job_title,employment_type,start_date,status";

export default function WorkspacePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session>();
  const [membership, setMembership] = useState<Membership>();
  const [company, setCompany] = useState<Company>();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string>();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [section, setSection] = useState("home");
  // Enabled sellable app keys for this company. undefined = not yet loaded (show all).
  const [enabledApps, setEnabledApps] = useState<Set<string>>();
  // A question typed on the home composer, handed to the assistant on navigation.
  const [assistantSeed, setAssistantSeed] = useState<string>();

  const loadWorkspace = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/auth");
      return;
    }
    setSession(data.session);
    const { data: rows } = await supabase
      .from("company_memberships")
      .select("company_id,role")
      .eq("status", "active")
      .limit(1);
    const active = rows?.[0] as Membership | undefined;
    if (!active) {
      setMembership(undefined);
      setLoading(false);
      return;
    }
    setMembership(active);
    localStorage.setItem("moshomo_company_id", active.company_id);

    const [
      { data: companies },
      { data: departmentRows },
      { data: employeeRows },
      { data: membershipRows },
      { data: invitationRows },
    ] = await Promise.all([
      supabase.from("companies").select("id,name,slug,logo_path").eq("id", active.company_id).limit(1),
      supabase.from("departments").select("id,company_id,name").eq("company_id", active.company_id).order("name"),
      supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("company_id", active.company_id).order("last_name"),
      supabase.from("company_memberships").select("user_id,role,status").eq("company_id", active.company_id),
      supabase.from("company_invitations").select("email,role,status").eq("company_id", active.company_id),
    ]);

    const employeeList = (employeeRows ?? []) as Employee[];
    setCompany(companies?.[0] as Company | undefined);
    setDepartments((departmentRows ?? []) as Department[]);
    setEmployees(employeeList);
    setAccounts(deriveAccounts(employeeList, (membershipRows ?? []) as MembershipRow[], (invitationRows ?? []) as InvitationRow[]));

    // App entitlements — which sellable apps this org has. Non-fatal: on error,
    // leave undefined so everything stays visible (don't hide apps on a glitch).
    try {
      const appsRes = await moshomoApi<{ apps: { key: string; enabled: boolean }[] }>(
        `/companies/${active.company_id}/apps`,
        { session: data.session, companyId: active.company_id },
      );
      setEnabledApps(new Set(appsRes.apps.filter((a) => a.enabled).map((a) => a.key)));
    } catch {
      setEnabledApps(undefined);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after async fetches, not synchronously
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const sync = () => setSection(window.location.hash.replace(/^#/, "") || "home");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = new FormData(event.currentTarget);
    try {
      const result = await moshomoApi<{ company_id: string }>("/companies", { method: "POST", session, body: Object.fromEntries(form) });
      localStorage.setItem("moshomo_company_id", result.company_id);
      location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Company creation failed.");
    }
  }

  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      await moshomoApi<Department>(`/companies/${membership.company_id}/departments`, { method: "POST", session, companyId: membership.company_id, body: { name: form.get("name") } });
      element.reset();
      setNotice("Department created.");
      await loadWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Department creation failed.");
    }
  }

  async function uploadLogo(file: File) {
    if (!session || !membership || !company) return;
    const allowedTypes: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
    const extension = allowedTypes[file.type];
    if (!extension) {
      setNotice("Choose a PNG, JPEG, or WebP logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice("Company logos must be smaller than 5 MB.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const logoPath = `${membership.company_id}/logo-${Date.now()}.${extension}`;
    setUploadingLogo(true);
    setNotice(undefined);
    try {
      const { error } = await supabase.storage.from("company-assets").upload(logoPath, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      await moshomoApi(`/companies/${membership.company_id}/branding`, { method: "PATCH", session, companyId: membership.company_id, body: { logo_path: logoPath } });
      const previousPath = company.logo_path;
      setCompany({ ...company, logo_path: logoPath });
      if (previousPath) await supabase.storage.from("company-assets").remove([previousPath]);
      setNotice("Company logo updated.");
    } catch (error) {
      await supabase.storage.from("company-assets").remove([logoPath]);
      setNotice(error instanceof Error ? error.message : "Logo upload failed.");
    } finally {
      setUploadingLogo(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center text-white" style={{ background: "radial-gradient(520px 320px at 50% 28%, rgba(16,185,129,0.16), transparent 60%), linear-gradient(180deg, #18181b 0%, #09090b 100%)" }}><span className="flex items-center gap-3 text-sm font-semibold tracking-wide"><span className="size-2 animate-ping rounded-full bg-brand-300" />Preparing your workspace…</span></main>;
  if (!session) return null;
  if (!membership) return <CreateCompany notice={notice} onSubmit={createCompany} />;

  const logoUrl = company?.logo_path ? publicLogoUrl(company.logo_path) : undefined;
  const setup = {
    hasLogo: Boolean(company?.logo_path),
    hasDepartment: departments.length > 0,
    hasTeam: employees.length > 1,
  };
  const setupComplete = setup.hasLogo && setup.hasDepartment && setup.hasTeam;
  const shellProps = { companyName: company?.name, enabledApps, logoUrl, role: membership.role, userEmail: session.user.email };

  function homeFor(role: Role) {
    const firstName = employees.find((e) => e.email === session?.user.email)?.first_name;
    return (
      <HomePanel
        companyId={membership!.company_id}
        enabledApps={enabledApps}
        employees={employees}
        firstName={firstName ?? undefined}
        onAsk={(question) => {
          setAssistantSeed(question);
          go("assistant");
        }}
        onNavigate={(s) => go(s)}
        role={role}
        session={session!}
        setupComplete={setupComplete}
      />
    );
  }

  function content() {
    const role = membership!.role;
    const activeModule = moduleForSection(section, role);
    if (!activeModule || activeModule.id === "dashboard") return homeFor(role);
    if (activeModule.sellable && enabledApps && !enabledApps.has(activeModule.id))
      return <LockedApp isAdmin={role === "admin"} label={activeModule.roles[role]!.label} />;
    if (activeModule.status === "coming-soon") return <ComingSoon title={activeModule.roles[role]!.label} />;
    if (activeModule.id === "assistant")
      return (
        <AssistantPanel
          companyId={membership!.company_id}
          initialQuestion={assistantSeed}
          onInitialConsumed={() => setAssistantSeed(undefined)}
          role={role}
          session={session!}
        />
      );
    if (activeModule.id === "leave")
      return <LeavePanel companyId={membership!.company_id} departments={departments} employees={employees} role={role} session={session!} />;
    if (activeModule.id === "shifts")
      return <ShiftsPanel companyId={membership!.company_id} employees={employees} role={role} session={session!} />;
    if (activeModule.id === "employees")
      return <EmployeesPanel accounts={accounts} canManage={role === "admin"} companyId={membership!.company_id} departments={departments} employees={employees} onChanged={loadWorkspace} onNotice={setNotice} session={session!} />;
    if (activeModule.id === "departments")
      return <DepartmentsView departments={departments} employees={employees} onCreate={createDepartment} />;
    if (activeModule.id === "plan")
      return <PlanPanel companyId={membership!.company_id} onChanged={loadWorkspace} session={session!} />;
    if (activeModule.id === "settings")
      return <SettingsView company={company} complete={setupComplete} logoUrl={logoUrl} onLogo={uploadLogo} setup={setup} uploadingLogo={uploadingLogo} />;
    return homeFor(role);
  }

  return (
    <AppShell {...shellProps}>
      {notice && (
        <div className="mx-auto mb-5 max-w-6xl">
          <Notice onDismiss={() => setNotice(undefined)} text={notice} />
        </div>
      )}
      {content()}
    </AppShell>
  );
}

function CreateCompany({ notice, onSubmit }: { notice?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <main className="min-h-screen bg-canvas"><header className="bg-white"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"><div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-brand-900 text-sm font-black text-brand-100">M</span><span className="font-semibold">Moshomo</span></div><span className="badge">Company setup</span></div></header><div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[0.65fr_1fr] lg:items-start lg:py-16"><aside className="lg:sticky lg:top-10"><p className="eyebrow">Workspace setup</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Create your company</h1><p className="mt-4 max-w-md text-sm leading-7 text-ink-muted">Set up your company workspace and founding employee record. You can add branding, departments, and teammates next.</p><ol className="mt-8 space-y-4"><SetupStep active label="Company details" number="1" /><SetupStep label="Brand and departments" number="2" /><SetupStep label="Invite your team" number="3" /></ol></aside><form className="premium-card grid gap-5 sm:grid-cols-2" onSubmit={onSubmit}><div className="sm:col-span-2"><h2 className="text-xl font-semibold">Company and admin details</h2><p className="mt-1 text-sm text-ink-muted">You will become the founding admin and first employee.</p></div><Field label="Company name" name="company_name" /><Field label="Company slug" name="company_slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><Field label="First name" name="first_name" /><Field label="Last name" name="last_name" /><Field label="Employee number" name="employee_number" /><Field label="Job title" name="job_title" required={false} />{notice && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2" role="alert">{notice}</p>}<div className="flex items-center justify-between gap-4 pt-5 sm:col-span-2"><p className="text-xs text-ink-faint">You can update these details later.</p><button className="primary-button">Create workspace <span aria-hidden>→</span></button></div></form></div></main>;
}

function SetupStep({ active = false, label, number }: { active?: boolean; label: string; number: string }) { return <li className="flex items-center gap-3"><span className={`grid size-8 place-items-center rounded-full text-xs font-bold ${active ? "bg-brand-900 text-white" : "bg-white text-ink-faint"}`}>{number}</span><span className={`text-sm font-medium ${active ? "text-ink" : "text-ink-faint"}`}>{label}</span></li>; }

function DepartmentsView({ departments, employees, onCreate }: { departments: Department[]; employees: Employee[]; onCreate: (event: FormEvent<HTMLFormElement>) => void }) {
  const counts = new Map<string, number>();
  for (const employee of employees) if (employee.department_id) counts.set(employee.department_id, (counts.get(employee.department_id) ?? 0) + 1);
  return (
    <div className="mx-auto max-w-4xl animate-rise">
      <DashboardHeading eyebrow="Organization" title="Departments" subtitle="Organize employees around the way your company works." />
      <section className="premium-card">
        <form className="flex gap-3" onSubmit={onCreate}>
          <input className="input" name="name" placeholder="e.g. Operations" required />
          <button className="dark-button">Add</button>
        </form>
        {departments.length === 0 ? (
          <EmptyState detail="Create your first department to group your workforce." title="No departments yet" />
        ) : (
          <ul className="mt-6">
            {departments.map((department) => (
              <li className="flex items-center justify-between py-3" key={department.id}>
                <span className="font-medium">{department.name}</span>
                <span className="badge">{counts.get(department.id) ?? 0} {(counts.get(department.id) ?? 0) === 1 ? "person" : "people"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SettingsView({ company, complete, logoUrl, onLogo, setup, uploadingLogo }: { company?: Company; complete: boolean; logoUrl?: string; onLogo: (file: File) => Promise<void>; setup: SetupState; uploadingLogo: boolean }) {
  return (
    <div className="mx-auto max-w-4xl animate-rise">
      <DashboardHeading eyebrow="Workspace" title="Settings" subtitle="Manage your company branding and workspace details." />
      {!complete && (
        <section className="premium-card mb-6">
          <h2 className="text-lg font-semibold">Finish setting up</h2>
          <p className="mt-1 text-sm text-ink-muted">A few steps remain before your workspace is fully ready.</p>
          <ul className="mt-5 space-y-2">
            <ChecklistItem done={setup.hasLogo} hash="settings" label="Add your company logo" />
            <ChecklistItem done={setup.hasDepartment} hash="departments" label="Create your first department" />
            <ChecklistItem done={setup.hasTeam} hash="employees" label="Invite a teammate" />
          </ul>
        </section>
      )}
      <div className="grid gap-6">
        <button
          className="premium-card flex items-center justify-between gap-4 text-left transition hover:-translate-y-0.5"
          onClick={() => go("plan")}
          type="button"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-sunken text-ink-soft">
              <Icon name="apps" className="size-5" />
            </span>
            <span>
              <span className="block text-base font-semibold">Apps &amp; plan</span>
              <span className="mt-0.5 block text-sm text-ink-muted">Choose your apps and see your monthly total.</span>
            </span>
          </span>
          <span aria-hidden className="text-ink-faint">→</span>
        </button>
        <LogoPanel company={company} logoUrl={logoUrl} onLogo={onLogo} uploading={uploadingLogo} />
        <section className="premium-card">
          <h2 className="text-lg font-semibold">Company details</h2>
          <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wide text-ink-faint">Company name</dt><dd className="mt-1 font-medium">{company?.name ?? "—"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-faint">Workspace slug</dt><dd className="mt-1 font-medium">{company?.slug ?? "—"}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function ChecklistItem({ done, hash, label }: { done: boolean; hash: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-4 py-3">
      <span className="flex items-center gap-3">
        <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${done ? "bg-brand-500 text-white" : "text-ink-faint"}`}>{done ? "✓" : ""}</span>
        <span className={`text-sm font-medium ${done ? "text-ink-muted line-through" : "text-ink"}`}>{label}</span>
      </span>
      {!done && <button className="text-sm font-semibold text-ink-soft transition hover:text-ink" onClick={() => go(hash)}>Do it →</button>}
    </li>
  );
}

function LockedApp({ isAdmin, label }: { isAdmin: boolean; label: string }) {
  return (
    <div className="mx-auto max-w-2xl animate-rise">
      <div className="premium-card text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-sunken text-ink-soft">
          <svg aria-hidden className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
            <rect height="11" rx="2" width="18" x="3" y="11" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{label} isn’t in your plan</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">
          {isAdmin
            ? "Add this app to your organization’s plan to switch it on for your team."
            : "This app isn’t enabled for your organization. Ask an admin to add it to your plan."}
        </p>
      </div>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-4xl animate-rise">
      <DashboardHeading eyebrow="Coming soon" title={title} subtitle="This module is on the Moshomo roadmap." />
      <section className="premium-card">
        <EmptyState detail="We are building this experience next. Employee management is available now from the Employees area." title={`${title} is coming soon`} />
      </section>
    </div>
  );
}

function LogoPanel({ company, logoUrl, uploading, onLogo }: { company?: Company; logoUrl?: string; uploading: boolean; onLogo: (file: File) => Promise<void> }) {
  return <section className="premium-card"><h2 className="text-lg font-semibold">Company logo</h2><p className="mt-1 text-sm leading-6 text-ink-muted">Used in the sidebar and branded employee experience. PNG, JPEG, or WebP up to 5 MB.</p><div className="mt-5 flex items-center gap-4"><div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-surface-muted bg-contain bg-center bg-no-repeat text-xl font-black text-brand-800 ring-1 ring-brand-300/30" style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : undefined}>{logoUrl ? null : (company?.name ?? "M").slice(0, 2).toUpperCase()}</div><label className="secondary-button cursor-pointer">{uploading ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}<input accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onLogo(file); event.currentTarget.value = ""; }} type="file" /></label></div></section>;
}

function DashboardHeading({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: React.ReactNode }) { return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{subtitle}</p></div>{actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}</div>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state mt-5 px-5 py-10"><p className="text-sm font-semibold text-ink-soft">{title}</p><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-muted">{detail}</p></div>; }
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) { return <div className="notice flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium"><span>{text}</span><button aria-label="Dismiss" className="text-ink-muted hover:text-ink" onClick={onDismiss}>✕</button></div>; }

type SetupState = { hasLogo: boolean; hasDepartment: boolean; hasTeam: boolean };

function go(hash: string) { window.location.hash = hash; }
function publicLogoUrl(path: string) { return getSupabaseBrowserClient().storage.from("company-assets").getPublicUrl(path).data.publicUrl; }
function Field({ label, name, type = "text", required = true, pattern }: { label: string; name: string; type?: string; required?: boolean; pattern?: string }) { return <label className="text-sm font-medium text-ink-soft">{label}{!required && <span className="ml-1 font-normal text-ink-faint">Optional</span>}<input className="input mt-2" name={name} pattern={pattern} required={required} type={type} /></label>; }

function deriveAccounts(employees: Employee[], memberships: MembershipRow[], invitations: InvitationRow[]): Record<string, Account> {
  const byUser = new Map(memberships.map((row) => [row.user_id, row]));
  const byEmail = new Map(invitations.map((row) => [row.email.toLowerCase(), row]));
  const result: Record<string, Account> = {};
  for (const employee of employees) {
    const membership = employee.profile_id ? byUser.get(employee.profile_id) : undefined;
    if (membership) {
      result[employee.id] = { role: membership.role, state: membership.status === "active" ? "Active" : capitalize(membership.status) };
      continue;
    }
    const invitation = employee.email ? byEmail.get(employee.email.toLowerCase()) : undefined;
    if (invitation) {
      result[employee.id] = { role: invitation.role, state: invitation.status === "accepted" ? "Active" : capitalize(invitation.status) };
      continue;
    }
    result[employee.id] = { role: "employee", state: "No account" };
  }
  return result;
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
