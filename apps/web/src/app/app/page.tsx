"use client";

import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AssistantPanel } from "@/components/assistant-panel";
import { EmployeesPanel, type Account, type Employee, type Role } from "@/components/employees-panel";
import { Icon } from "@/components/icon";
import { appModulesFor, moduleForSection } from "@/lib/apps";
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
  const [pendingInvites, setPendingInvites] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string>();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [section, setSection] = useState("home");

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
    setPendingInvites(
      ((invitationRows ?? []) as InvitationRow[]).filter((row) => row.status === "pending" || row.status === "sent").length,
    );
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

  if (loading) return <main className="grid min-h-screen place-items-center text-white" style={{ background: "radial-gradient(520px 320px at 50% 30%, rgba(111,224,168,0.18), transparent 60%), linear-gradient(180deg, #103a28 0%, #0c2a1d 100%)" }}><span className="flex items-center gap-3 text-sm font-semibold tracking-wide"><span className="size-2 animate-ping rounded-full bg-brand-300" />Preparing your workspace…</span></main>;
  if (!session) return null;
  if (!membership) return <CreateCompany notice={notice} onSubmit={createCompany} />;

  const logoUrl = company?.logo_path ? publicLogoUrl(company.logo_path) : undefined;
  const setup = {
    hasLogo: Boolean(company?.logo_path),
    hasDepartment: departments.length > 0,
    hasTeam: employees.length > 1,
  };
  const setupComplete = setup.hasLogo && setup.hasDepartment && setup.hasTeam;
  const shellProps = { companyName: company?.name, logoUrl, role: membership.role, userEmail: session.user.email };

  function homeFor(role: Role) {
    if (role === "employee") return <EmployeeDashboard companyName={company?.name} />;
    if (role === "manager") return <ManagerDashboard companyName={company?.name} employeeCount={employees.length} />;
    return <AdminHome company={company} complete={setupComplete} departments={departments.length} employeeCount={employees.length} employees={employees} pendingInvites={pendingInvites} setup={setup} />;
  }

  function content() {
    const role = membership!.role;
    const activeModule = moduleForSection(section, role);
    if (!activeModule || activeModule.id === "dashboard") return homeFor(role);
    if (activeModule.status === "coming-soon") return <ComingSoon title={activeModule.roles[role]!.label} />;
    if (activeModule.id === "assistant")
      return <AssistantPanel companyId={membership!.company_id} role={role} session={session!} />;
    if (activeModule.id === "employees")
      return <EmployeesPanel accounts={accounts} canManage={role === "admin"} companyId={membership!.company_id} departments={departments} employees={employees} onChanged={loadWorkspace} onNotice={setNotice} session={session!} />;
    if (activeModule.id === "departments")
      return <DepartmentsView departments={departments} employees={employees} onCreate={createDepartment} />;
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
  return <main className="min-h-screen bg-canvas"><header className="border-b border-[var(--line)] bg-white"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"><div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-brand-900 text-sm font-black text-brand-100">M</span><span className="font-semibold">Moshomo</span></div><span className="badge">Company setup</span></div></header><div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[0.65fr_1fr] lg:items-start lg:py-16"><aside className="lg:sticky lg:top-10"><p className="eyebrow">Workspace setup</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Create your company</h1><p className="mt-4 max-w-md text-sm leading-7 text-ink-muted">Set up your company workspace and founding employee record. You can add branding, departments, and teammates next.</p><ol className="mt-8 space-y-4"><SetupStep active label="Company details" number="1" /><SetupStep label="Brand and departments" number="2" /><SetupStep label="Invite your team" number="3" /></ol></aside><form className="premium-card grid gap-5 sm:grid-cols-2" onSubmit={onSubmit}><div className="sm:col-span-2"><h2 className="text-xl font-semibold">Company and admin details</h2><p className="mt-1 text-sm text-ink-muted">You will become the founding admin and first employee.</p></div><Field label="Company name" name="company_name" /><Field label="Company slug" name="company_slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><Field label="First name" name="first_name" /><Field label="Last name" name="last_name" /><Field label="Employee number" name="employee_number" /><Field label="Job title" name="job_title" required={false} />{notice && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2" role="alert">{notice}</p>}<div className="flex items-center justify-between gap-4 border-t border-[var(--line)] pt-5 sm:col-span-2"><p className="text-xs text-ink-faint">You can update these details later.</p><button className="primary-button">Create workspace <span aria-hidden>→</span></button></div></form></div></main>;
}

function SetupStep({ active = false, label, number }: { active?: boolean; label: string; number: string }) { return <li className="flex items-center gap-3"><span className={`grid size-8 place-items-center rounded-full text-xs font-bold ${active ? "bg-brand-900 text-white" : "border border-[var(--line-strong)] bg-white text-ink-faint"}`}>{number}</span><span className={`text-sm font-medium ${active ? "text-ink" : "text-ink-faint"}`}>{label}</span></li>; }

function AdminHome({ company, complete, departments, employeeCount, employees, pendingInvites, setup }: { company?: Company; complete: boolean; departments: number; employeeCount: number; employees: Employee[]; pendingInvites: number; setup: SetupState }) {
  return (
    <div className="mx-auto max-w-6xl animate-rise">
      <DashboardHeading actions={<><button className="secondary-button" onClick={() => go("assistant")}><Icon className="size-4" name="sparkles" />Ask Moshomo</button><button className="primary-button" onClick={() => go("employees")}><Icon className="size-4" name="people" />Add employee</button></>} eyebrow="Admin dashboard" title="Workforce overview" subtitle={`A clear view of people and workspace activity${company?.name ? ` at ${company.name}` : ""}.`} />
      {!complete && <SetupBanner setup={setup} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard accent="emerald" detail="In your workforce" label="Employees" value={String(employeeCount)} />
        <MetricCard accent="blue" detail="Configured" label="Departments" value={String(departments)} />
        <MetricCard accent="violet" detail="Awaiting acceptance" label="Pending invites" value={String(pendingInvites)} />
        <MetricCard accent="amber" detail="No absences recorded" label="On leave today" value="0" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
        <section className="premium-card">
          <SectionTitle action="View employees" onAction={() => go("employees")} title="Your team" />
          {employees.length === 0 ? (
            <EmptyState detail="Invite your first teammate from the Employees area to start building your workforce." title="No employees yet" />
          ) : (
            <ul className="mt-5 divide-y divide-[var(--line)]">
              {employees.slice(0, 5).map((employee) => (
                <li className="flex items-center gap-3 py-3" key={employee.id}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{`${employee.first_name[0] ?? ""}${employee.last_name[0] ?? ""}`.toUpperCase()}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{employee.first_name} {employee.last_name}</p><p className="truncate text-xs text-ink-muted">{employee.job_title ?? employee.employee_number}</p></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="premium-card">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Shortcuts</p><h2 className="mt-1 text-lg font-semibold">Quick actions</h2></div>
          <div className="mt-4 space-y-2">
            <QuickAction label="Add an employee" onClick={() => go("employees")} />
            <QuickAction label="Manage departments" onClick={() => go("departments")} />
            <QuickAction label="Company settings" onClick={() => go("settings")} />
          </div>
          <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-brand-800"><span className="size-2 rounded-full bg-brand-500" />Workspace status</div><p className="mt-2 text-xs leading-5 text-brand-700/80">Core employee management is active. Leave and shift modules will appear here as they launch.</p></div>
        </section>
      </div>
      <AppsGrid role="admin" />
    </div>
  );
}

function ManagerDashboard({ companyName, employeeCount }: { companyName?: string; employeeCount: number }) {
  return <div className="mx-auto max-w-6xl animate-rise"><DashboardHeading actions={<button className="primary-button" onClick={() => go("assistant")}><Icon className="size-4" name="sparkles" />Ask Moshomo</button>} eyebrow="Manager dashboard" title="Team operations" subtitle={`Plan today with a clear view of ${companyName ?? "your company"}.`} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard accent="emerald" label="Team members" value={String(employeeCount)} detail="In your workforce" /><MetricCard accent="amber" label="On leave" value="0" detail="Today" /><MetricCard accent="violet" label="Pending approvals" value="0" detail="No action needed" /><MetricCard accent="blue" label="Shift gaps" value="0" detail="Coverage looks good" /></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="premium-card"><SectionTitle title="Today’s team" action="View team" onAction={() => go("employees")} /><EmptyState title="Your team activity will appear here" detail="Employee status, leave, and shift coverage will populate as modules come online." /></section><section className="premium-card"><SectionTitle title="Requests awaiting review" action="View leave" onAction={() => go("leave")} /><EmptyState title="You are all caught up" detail="New employee leave requests will appear here for review." /></section></div><AppsGrid role="manager" /></div>;
}

function EmployeeDashboard({ companyName }: { companyName?: string }) {
  return <div className="mx-auto max-w-6xl animate-rise"><DashboardHeading actions={<><button className="secondary-button" onClick={() => go("leave")}>Request leave</button><button className="primary-button" onClick={() => go("assistant")}><Icon className="size-4" name="sparkles" />Ask Moshomo</button></>} eyebrow="My workspace" title="Your workday" subtitle={`Everything you need at ${companyName ?? "work"}, in one place.`} /><div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]"><section className="hero-panel"><div><span className="hero-pill">Your next shift</span><h2 className="mt-4 text-2xl font-semibold text-white">No upcoming shift yet</h2><p className="mt-2 text-sm text-emerald-100/75">Your schedule will appear here as soon as your manager publishes it.</p></div><button className="mt-6 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#174d35]" onClick={() => go("shifts")}>View schedule</button></section><section className="premium-card"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Leave balance</p><p className="mt-4 text-4xl font-semibold tracking-tight">—</p><p className="mt-1 text-sm text-ink-muted">Available days</p><button className="mt-5 text-sm font-semibold text-brand-700" onClick={() => go("leave")}>View leave details →</button></section></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><MetricCard accent="blue" label="Upcoming shifts" value="0" detail="Next 7 days" /><MetricCard accent="amber" label="Leave requests" value="0" detail="Pending" /><MetricCard accent="violet" label="Notifications" value="0" detail="You are up to date" /></div><div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.8fr]"><section className="premium-card"><SectionTitle title="My week" action="Open schedule" onAction={() => go("shifts")} /><EmptyState title="Your schedule is clear" detail="Published shifts and approved leave will appear on your weekly timeline." /></section><section className="rounded-[var(--radius-xl)] border border-brand-100 bg-brand-50 p-6"><p className="eyebrow">Moshomo AI</p><h2 className="mt-3 text-xl font-semibold text-brand-800">Ask about your workday</h2><p className="mt-2 text-sm leading-6 text-brand-700/80">Try “When is my next shift?” or “How many leave days do I have?”</p><button className="dark-button mt-5" onClick={() => go("assistant")}>Ask Moshomo</button></section></div><AppsGrid role="employee" /></div>;
}

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
          <ul className="mt-6 divide-y divide-[var(--line)]">
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
    <li className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-surface-muted px-4 py-3">
      <span className="flex items-center gap-3">
        <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${done ? "bg-brand-500 text-white" : "border border-[var(--line-strong)] text-ink-faint"}`}>{done ? "✓" : ""}</span>
        <span className={`text-sm font-medium ${done ? "text-ink-muted line-through" : "text-ink"}`}>{label}</span>
      </span>
      {!done && <button className="text-sm font-semibold text-brand-700" onClick={() => go(hash)}>Do it →</button>}
    </li>
  );
}

function SetupBanner({ setup }: { setup: SetupState }) {
  const steps = [
    { done: setup.hasLogo, label: "Add a logo", hash: "settings" },
    { done: setup.hasDepartment, label: "Create a department", hash: "departments" },
    { done: setup.hasTeam, label: "Invite a teammate", hash: "employees" },
  ].filter((step) => !step.done);
  return (
    <section className="mb-6 flex flex-col gap-4 rounded-3xl border border-brand-100 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-brand-800">Finish setting up your workspace</p>
        <p className="mt-1 text-sm text-brand-700/80">{steps.length} step{steps.length === 1 ? "" : "s"} left: {steps.map((step) => step.label).join(", ")}.</p>
      </div>
      <button className="primary-button shrink-0" onClick={() => go(steps[0]?.hash ?? "settings")}>Continue setup</button>
    </section>
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
  return <section className="premium-card"><h2 className="text-lg font-semibold">Company logo</h2><p className="mt-1 text-sm leading-6 text-ink-muted">Used in the sidebar and branded employee experience. PNG, JPEG, or WebP up to 5 MB.</p><div className="mt-5 flex items-center gap-4"><div className="grid size-20 shrink-0 place-items-center rounded-2xl border border-[var(--line)] bg-surface-muted bg-contain bg-center bg-no-repeat text-xl font-black text-brand-800 ring-1 ring-brand-300/30" style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : undefined}>{logoUrl ? null : (company?.name ?? "M").slice(0, 2).toUpperCase()}</div><label className="secondary-button cursor-pointer">{uploading ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}<input accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onLogo(file); event.currentTarget.value = ""; }} type="file" /></label></div></section>;
}

function AppsGrid({ role }: { role: Role }) {
  const apps = appModulesFor(role);
  if (apps.length === 0) return null;
  return (
    <section className="premium-card mt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">Apps</h2>
        <span className="text-xs text-ink-muted">Your workforce toolkit</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {apps.map((app) => (
          <button
            className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--line)] bg-surface-muted p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50"
            key={app.id}
            onClick={() => go(app.section)}
          >
            <span className="grid size-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <Icon name={app.icon} className="size-5" />
            </span>
            <span className="text-sm font-semibold">{app.roles[role]!.label}</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              {app.status === "coming-soon" ? "Coming soon" : "Open"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-surface-muted px-4 py-3 text-left text-sm font-semibold transition hover:border-brand-300 hover:bg-brand-50" onClick={onClick}>{label} <span aria-hidden className="text-brand-700">→</span></button>;
}

function DashboardHeading({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: React.ReactNode }) { return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{subtitle}</p></div>{actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}</div>; }
function MetricCard({ accent, label, value, detail }: { accent: "emerald" | "amber" | "violet" | "blue"; label: string; value: string; detail: string }) { const colors = { emerald: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", violet: "bg-violet-100 text-violet-700", blue: "bg-blue-100 text-blue-700" }; const bars = { emerald: "bg-emerald-400", amber: "bg-amber-400", violet: "bg-violet-400", blue: "bg-blue-400" }; return <div className="metric-card"><span className={`absolute inset-x-0 top-0 h-0.5 ${bars[accent]}`} /><div className={`grid size-10 place-items-center rounded-xl text-sm font-bold ${colors[accent]}`}>{label.slice(0, 1)}</div><p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-sm font-medium text-ink-soft">{label}</p><p className="mt-0.5 text-xs text-ink-faint">{detail}</p></div>; }
function SectionTitle({ title, action, onAction }: { title: string; action: string; onAction: () => void }) { return <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">{title}</h2><button className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 transition hover:gap-1.5" onClick={onAction}>{action} <span aria-hidden>→</span></button></div>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state mt-5 px-5 py-10"><p className="text-sm font-semibold text-ink-soft">{title}</p><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-muted">{detail}</p></div>; }
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) { return <div className="notice flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium"><span>{text}</span><button aria-label="Dismiss" className="text-brand-700/70 hover:text-brand-700" onClick={onDismiss}>✕</button></div>; }

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
