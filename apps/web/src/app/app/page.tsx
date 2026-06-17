"use client";

import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { moshomoApi } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Role = "admin" | "manager" | "employee";
type Membership = { company_id: string; role: Role };
type Company = { id: string; name: string; slug: string; logo_path: string | null };
type Department = { id: string; company_id: string; name: string };

export default function WorkspacePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session>();
  const [membership, setMembership] = useState<Membership>();
  const [company, setCompany] = useState<Company>();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string>();
  const [showSetup, setShowSetup] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    async function load() {
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
      if (active) {
        setMembership(active);
        localStorage.setItem("moshomo_company_id", active.company_id);
        setShowSetup(localStorage.getItem(setupStorageKey(active.company_id)) !== "true");
        const [{ data: companies }, { data: departmentRows }, { data: employees }] = await Promise.all([
          supabase.from("companies").select("id,name,slug,logo_path").eq("id", active.company_id).limit(1),
          supabase.from("departments").select("id,company_id,name").eq("company_id", active.company_id).order("name"),
          supabase.from("employees").select("id").eq("company_id", active.company_id).eq("status", "active"),
        ]);
        setCompany(companies?.[0] as Company | undefined);
        setDepartments((departmentRows ?? []) as Department[]);
        setEmployeeCount(employees?.length ?? 0);
      }
      setLoading(false);
    }
    void load();
  }, [router]);

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
      const department = await moshomoApi<Department>(`/companies/${membership.company_id}/departments`, { method: "POST", session, companyId: membership.company_id, body: { name: form.get("name") } });
      setDepartments((current) => [...current, department]);
      element.reset();
      setNotice("Department created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Department creation failed.");
    }
  }

  async function inviteEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership) return;
    const element = event.currentTarget;
    const body = Object.fromEntries(new FormData(element));
    if (!body.department_id) delete body.department_id;
    try {
      await moshomoApi(`/companies/${membership.company_id}/invitations`, { method: "POST", session, companyId: membership.company_id, body });
      element.reset();
      setEmployeeCount((current) => current + 1);
      setNotice(`Invitation sent to ${body.email}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Invitation failed.");
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

  function skipSetup() {
    if (!membership) return;
    localStorage.setItem(setupStorageKey(membership.company_id), "true");
    setShowSetup(false);
    setNotice(undefined);
  }

  function continueSetup() {
    if (!membership) return;
    localStorage.removeItem(setupStorageKey(membership.company_id));
    setShowSetup(true);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#10281e] text-sm font-semibold tracking-wide text-white">Preparing your workspace...</main>;
  if (!session) return null;
  if (!membership) return <CreateCompany sessionReady={Boolean(session)} notice={notice} onSubmit={createCompany} />;

  const logoUrl = company?.logo_path ? publicLogoUrl(company.logo_path) : undefined;
  const shellProps = { companyName: company?.name, logoUrl, role: membership.role };

  if (membership.role === "employee") return <AppShell {...shellProps}><EmployeeDashboard companyName={company?.name} /></AppShell>;
  if (membership.role === "manager") return <AppShell {...shellProps}><ManagerDashboard companyName={company?.name} employeeCount={employeeCount} /></AppShell>;
  if (!showSetup) return <AppShell {...shellProps}><AdminDashboard company={company} departments={departments.length} employeeCount={employeeCount} uploadingLogo={uploadingLogo} onContinueSetup={continueSetup} onLogo={uploadLogo} /></AppShell>;

  return (
    <AppShell {...shellProps}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="eyebrow">Company setup</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Build your workforce</h1><p className="mt-2 text-stone-500">Add your brand, create departments, then invite your team.</p></div>
          <button className="secondary-button" onClick={skipSetup}>Skip for now</button>
        </div>
        {notice && <Notice text={notice} />}
        <div className="grid gap-6 xl:grid-cols-2">
          <LogoPanel company={company} logoUrl={logoUrl} uploading={uploadingLogo} onLogo={uploadLogo} />
          <section className="premium-card" id="departments"><p className="step-label">Step 2</p><h2 className="mt-2 text-xl font-semibold">Create departments</h2><p className="mt-1 text-sm text-stone-500">Organize employees around the way your company works.</p><form className="mt-5 flex gap-3" onSubmit={createDepartment}><input className="input" name="name" placeholder="e.g. Operations" required /><button className="dark-button">Add</button></form><div className="mt-5 flex flex-wrap gap-2">{departments.map((item) => <span className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800" key={item.id}>{item.name}</span>)}</div></section>
          <section className="premium-card xl:col-span-2" id="employees"><div className="max-w-xl"><p className="step-label">Step 3</p><h2 className="mt-2 text-xl font-semibold">Invite an employee</h2><p className="mt-1 text-sm text-stone-500">Their role determines the workspace and actions they receive.</p></div><form className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={inviteEmployee}><Field label="First name" name="first_name" /><Field label="Last name" name="last_name" /><Field label="Email" name="email" type="email" /><Field label="Employee number" name="employee_number" /><Select label="Role" name="role"><option value="employee">Employee</option><option value="manager">Manager</option><option value="admin">Admin</option></Select><Select label="Department" name="department_id"><option value="">No department</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Field label="Job title" name="job_title" required={false} /><Field label="Employment type" name="employment_type" required={false} /><button className="primary-button sm:col-span-2 lg:col-span-4">Create employee and send invite</button></form></section>
        </div>
      </div>
    </AppShell>
  );
}

function CreateCompany({ notice, onSubmit }: { sessionReady: boolean; notice?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <AppShell role="admin"><section className="mx-auto max-w-3xl"><p className="eyebrow">Step 1 of 3</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Create your company</h1><p className="mt-3 text-stone-500">Set up your workspace. You will become its founding admin and first employee.</p><form className="premium-card mt-8 grid gap-5 sm:grid-cols-2" onSubmit={onSubmit}><Field label="Company name" name="company_name" /><Field label="Company slug" name="company_slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><Field label="Employee number" name="employee_number" /><Field label="Job title" name="job_title" required={false} /><Field label="First name" name="first_name" /><Field label="Last name" name="last_name" />{notice && <p className="text-sm text-rose-700 sm:col-span-2">{notice}</p>}<button className="primary-button sm:col-span-2">Create company</button></form></section></AppShell>;
}

function AdminDashboard({ company, departments, employeeCount, uploadingLogo, onContinueSetup, onLogo }: { company?: Company; departments: number; employeeCount: number; uploadingLogo: boolean; onContinueSetup: () => void; onLogo: (file: File) => Promise<void> }) {
  const logoUrl = company?.logo_path ? publicLogoUrl(company.logo_path) : undefined;
  return <div className="mx-auto max-w-6xl"><DashboardHeading eyebrow="Admin dashboard" title={`Good morning${company?.name ? `, ${company.name}` : ""}`} subtitle="Here is what is happening across your workforce today." /><section className="hero-panel"><div><span className="hero-pill">Workforce health</span><h2 className="mt-5 max-w-xl text-3xl font-semibold leading-tight text-white">Your team is ready for the day.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-emerald-100/75">Keep employee records, leave decisions, and shift coverage moving from one calm workspace.</p></div><div className="mt-8 grid grid-cols-2 gap-3 sm:max-w-md"><HeroStat label="Active employees" value={String(employeeCount)} /><HeroStat label="Departments" value={String(departments)} /></div></section><div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"><MetricCard accent="emerald" label="Employees" value={String(employeeCount)} detail="Active workforce" /><MetricCard accent="amber" label="On leave today" value="0" detail="No absences recorded" /><MetricCard accent="violet" label="Pending requests" value="0" detail="Nothing waiting" /><MetricCard accent="blue" label="Open shift gaps" value="0" detail="Coverage looks good" /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]"><section className="premium-card" id="employees"><SectionTitle title="Workforce overview" action="View employees" /><div className="mt-5 space-y-3"><ActivityRow color="bg-emerald-500" title="Company workspace created" detail="Your workforce foundation is active" /><ActivityRow color="bg-blue-500" title={`${departments} departments configured`} detail="Organize teams from company setup" /><ActivityRow color="bg-violet-500" title="Moshomo AI is standing by" detail="Assistant tools will appear as modules launch" /></div><button className="secondary-button mt-5" onClick={onContinueSetup}>Continue company setup</button></section><LogoPanel company={company} compact logoUrl={logoUrl} uploading={uploadingLogo} onLogo={onLogo} /></div></div>;
}

function ManagerDashboard({ companyName, employeeCount }: { companyName?: string; employeeCount: number }) {
  return <div className="mx-auto max-w-6xl"><DashboardHeading eyebrow="Manager dashboard" title="Your team, at a glance" subtitle={`Plan today with a clear view of ${companyName ?? "your company"}.`} /><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"><MetricCard accent="emerald" label="Team members" value={String(employeeCount)} detail="In your workforce" /><MetricCard accent="amber" label="On leave" value="0" detail="Today" /><MetricCard accent="violet" label="Pending approvals" value="0" detail="No action needed" /><MetricCard accent="blue" label="Shift gaps" value="0" detail="Coverage looks good" /></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="premium-card" id="team"><SectionTitle title="Today’s team" action="View team" /><EmptyState title="Your team activity will appear here" detail="Employee status, leave, and shift coverage will populate as modules come online." /></section><section className="premium-card" id="leave"><SectionTitle title="Requests awaiting review" action="View leave" /><EmptyState title="You are all caught up" detail="New employee leave requests will appear here for review." /></section></div></div>;
}

function EmployeeDashboard({ companyName }: { companyName?: string }) {
  return <div className="mx-auto max-w-6xl"><DashboardHeading eyebrow="My workspace" title="Good morning" subtitle={`Everything you need at ${companyName ?? "work"}, in one place.`} /><section className="hero-panel"><div><span className="hero-pill">Your next shift</span><h2 className="mt-5 text-3xl font-semibold text-white">No upcoming shift yet</h2><p className="mt-3 text-sm text-emerald-100/75">Your schedule will appear here as soon as your manager publishes it.</p></div><button className="mt-7 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#174d35]">View my schedule</button></section><div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"><MetricCard accent="emerald" label="Leave balance" value="—" detail="Available days" /><MetricCard accent="blue" label="Upcoming shifts" value="0" detail="Next 7 days" /><MetricCard accent="amber" label="Leave requests" value="0" detail="Pending" /><MetricCard accent="violet" label="Notifications" value="0" detail="You are up to date" /></div><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]"><section className="premium-card" id="shifts"><SectionTitle title="My week" action="Open schedule" /><EmptyState title="Your schedule is clear" detail="Published shifts and approved leave will appear on your weekly timeline." /></section><section className="rounded-3xl bg-[#e8f7ef] p-6" id="assistant"><p className="eyebrow">Moshomo AI</p><h2 className="mt-3 text-2xl font-semibold text-[#173f2d]">Ask about your workday</h2><p className="mt-2 text-sm leading-6 text-[#476654]">Try “When is my next shift?” or “How many leave days do I have?”</p><button className="mt-6 rounded-xl bg-[#174d35] px-5 py-3 text-sm font-semibold text-white">Ask Moshomo</button></section></div></div>;
}

function LogoPanel({ company, logoUrl, uploading, onLogo, compact = false }: { company?: Company; logoUrl?: string; uploading: boolean; onLogo: (file: File) => Promise<void>; compact?: boolean }) {
  return <section className="premium-card" id="settings"><p className="step-label">{compact ? "Company settings" : "Step 1"}</p><h2 className="mt-2 text-xl font-semibold">Company logo</h2><p className="mt-1 text-sm leading-6 text-stone-500">Used in the sidebar and branded employee experience. PNG, JPEG, or WebP up to 5 MB.</p><div className="mt-5 flex items-center gap-4"><div className="grid size-20 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-stone-50 bg-contain bg-center bg-no-repeat text-xl font-black text-emerald-800" style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : undefined}>{logoUrl ? null : (company?.name ?? "M").slice(0, 2).toUpperCase()}</div><label className="secondary-button cursor-pointer">{uploading ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}<input accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onLogo(file); event.currentTarget.value = ""; }} type="file" /></label></div></section>;
}

function DashboardHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <div className="mb-7"><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1><p className="mt-2 text-stone-500">{subtitle}</p></div>; }
function HeroStat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><p className="text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-emerald-100/65">{label}</p></div>; }
function MetricCard({ accent, label, value, detail }: { accent: "emerald" | "amber" | "violet" | "blue"; label: string; value: string; detail: string }) { const colors = { emerald: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", violet: "bg-violet-100 text-violet-700", blue: "bg-blue-100 text-blue-700" }; return <div className="premium-card"><div className={`grid size-10 place-items-center rounded-xl text-sm font-bold ${colors[accent]}`}>{label.slice(0, 1)}</div><p className="mt-5 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-sm font-medium text-stone-700">{label}</p><p className="mt-1 text-xs text-stone-400">{detail}</p></div>; }
function SectionTitle({ title, action }: { title: string; action: string }) { return <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">{title}</h2><button className="text-sm font-semibold text-emerald-700">{action}</button></div>; }
function ActivityRow({ color, title, detail }: { color: string; title: string; detail: string }) { return <div className="flex items-center gap-4 rounded-2xl bg-stone-50 p-4"><span className={`size-2.5 rounded-full ${color}`} /><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-stone-500">{detail}</p></div></div>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="mt-5 rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-10 text-center"><p className="text-sm font-semibold text-stone-700">{title}</p><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-stone-500">{detail}</p></div>; }
function Notice({ text }: { text: string }) { return <p className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{text}</p>; }

function setupStorageKey(companyId: string) { return `moshomo_onboarding_dismissed:${companyId}`; }
function publicLogoUrl(path: string) { return getSupabaseBrowserClient().storage.from("company-assets").getPublicUrl(path).data.publicUrl; }
function Field({ label, name, type = "text", required = true, pattern }: { label: string; name: string; type?: string; required?: boolean; pattern?: string }) { return <label className="text-sm font-medium text-stone-700">{label}{!required && <span className="ml-1 font-normal text-stone-400">Optional</span>}<input className="input mt-2" name={name} pattern={pattern} required={required} type={type} /></label>; }
function Select({ label, name, children }: { label: string; name: string; children: React.ReactNode }) { return <label className="text-sm font-medium text-stone-700">{label}<select className="input mt-2" name={name}>{children}</select></label>; }
