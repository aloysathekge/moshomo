"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { moshomoApi } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type Role = "admin" | "manager" | "employee";
export type EmployeeStatus = "active" | "suspended" | "terminated" | "resigned";

export type Employee = {
  id: string;
  company_id: string;
  profile_id: string | null;
  department_id: string | null;
  manager_employee_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  job_title: string | null;
  employment_type: string | null;
  start_date: string | null;
  status: EmployeeStatus;
};

export type Department = { id: string; name: string };
export type Account = { role: Role; state: string };
export type EmployeeDocument = {
  id: string;
  storage_path: string;
  file_name: string;
  doc_type: string;
  created_at: string;
};

type Props = {
  session: Session;
  companyId: string;
  employees: Employee[];
  departments: Department[];
  accounts: Record<string, Account>;
  canManage: boolean;
  onChanged: () => void | Promise<void>;
  onNotice: (text: string) => void;
};

// Roles are a category, not a status — kept neutral so only status carries
// colour (monochrome + accent + semantic-status). The label says the role.
const roleStyles: Record<Role, string> = {
  admin: "",
  manager: "",
  employee: "",
};

const statusStyles: Record<EmployeeStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-700",
  terminated: "bg-rose-100 text-rose-700",
  resigned: "bg-stone-200 text-stone-600",
};

export function EmployeesPanel({
  session,
  companyId,
  employees,
  departments,
  accounts,
  canManage,
  onChanged,
  onNotice,
}: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeStatus>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [showInvite, setShowInvite] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();

  const departmentName = useMemo(() => {
    const map = new Map(departments.map((d) => [d.id, d.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [departments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((employee) => {
      if (statusFilter !== "all" && employee.status !== statusFilter) return false;
      if (departmentFilter !== "all" && (employee.department_id ?? "unassigned") !== departmentFilter) return false;
      if (!q) return true;
      return [employee.first_name, employee.last_name, employee.email ?? "", employee.employee_number, employee.job_title ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [departmentFilter, employees, query, statusFilter]);

  const selected = employees.find((employee) => employee.id === selectedId);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const body = Object.fromEntries(new FormData(element));
    if (!body.department_id) delete body.department_id;
    try {
      await moshomoApi(`/companies/${companyId}/invitations`, {
        method: "POST",
        session,
        companyId,
        body,
      });
      element.reset();
      setShowInvite(false);
      onNotice(`Invitation sent to ${body.email}.`);
      await onChanged();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Invitation failed.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-rise">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Workforce</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Employees</h1>
          <p className="mt-2 text-ink-muted">
            {employees.length} {employees.length === 1 ? "person" : "people"} in your workforce.
          </p>
        </div>
        {canManage && (
          <button className="primary-button" onClick={() => setShowInvite((value) => !value)}>
            {showInvite ? "Close" : "Add employee"}
          </button>
        )}
      </div>

      {canManage && showInvite && (
        <section className="premium-card mb-6 animate-rise">
          <h2 className="text-lg font-semibold">Invite an employee</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Their role determines the workspace and actions they receive.
          </p>
          <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={invite}>
            <Field label="First name" name="first_name" />
            <Field label="Last name" name="last_name" />
            <Field label="Email" name="email" type="email" />
            <Field label="Employee number" name="employee_number" />
            <SelectField label="Role" name="role">
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </SelectField>
            <SelectField label="Department" name="department_id">
              <option value="">No department</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
            <Field label="Job title" name="job_title" required={false} />
            <Field label="Employment type" name="employment_type" required={false} />
            <button className="primary-button sm:col-span-2 lg:col-span-4">
              Create employee and send invite
            </button>
          </form>
        </section>
      )}

      <section className="premium-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <input aria-label="Search employees" className="input" onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, number, or title" value={query} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select aria-label="Filter by status" className="input sm:w-40" onChange={(event) => setStatusFilter(event.target.value as "all" | EmployeeStatus)} value={statusFilter}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="terminated">Terminated</option><option value="resigned">Resigned</option></select>
            <select aria-label="Filter by department" className="input sm:w-48" onChange={(event) => setDepartmentFilter(event.target.value)} value={departmentFilter}><option value="all">All departments</option><option value="unassigned">Unassigned</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
          </div>
        </div>
        <div className="flex items-center justify-between bg-surface-muted px-5 py-2.5 text-xs text-ink-muted"><span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>{(query || statusFilter !== "all" || departmentFilter !== "all") && <button className="font-semibold text-ink-soft transition hover:text-ink" onClick={() => { setQuery(""); setStatusFilter("all"); setDepartmentFilter("all"); }}>Clear filters</button>}</div>
        {filtered.length === 0 ? (
          <div className="empty-state m-4 px-5 py-12">
            <p className="text-sm font-semibold text-ink-soft">
              {employees.length === 0 ? "No employees yet" : "No matches"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-muted">
              {employees.length === 0
                ? canManage
                  ? "Invite your first teammate to start building your workforce."
                  : "Team members will appear here once they are added."
                : "Try a different search."}
            </p>
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-faint md:grid">
              <span>Name</span>
              <span>Department</span>
              <span>Role</span>
              <span>Status</span>
              <span className="text-right">Account</span>
            </div>
            {filtered.map((employee) => {
              const account = accounts[employee.id];
              return (
                <button
                  className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-surface-muted md:grid md:grid-cols-[2fr_1.4fr_1fr_1fr_auto] md:items-center md:gap-4"
                  key={employee.id}
                  onClick={() => setSelectedId(employee.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                      {initials(employee)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {employee.first_name} {employee.last_name}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {employee.job_title ?? employee.email ?? employee.employee_number}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm text-ink-soft">{departmentName(employee.department_id)}</span>
                  <span>
                    <span className={`badge ${account ? roleStyles[account.role] : ""}`}>
                      {account?.role ?? "—"}
                    </span>
                  </span>
                  <span>
                    <span className={`badge ${statusStyles[employee.status]}`}>{employee.status}</span>
                  </span>
                  <span className="text-right text-xs font-medium text-ink-muted">
                    {account?.state ?? "—"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected && (
        <EmployeeModal
          account={accounts[selected.id]}
          canManage={canManage}
          companyId={companyId}
          departmentName={departmentName(selected.department_id)}
          departments={departments}
          employee={selected}
          managers={employees.filter((item) => item.id !== selected.id)}
          onChanged={onChanged}
          onClose={() => setSelectedId(undefined)}
          onNotice={onNotice}
          session={session}
        />
      )}
    </div>
  );
}

function EmployeeModal({
  account,
  canManage,
  companyId,
  departmentName,
  departments,
  employee,
  managers,
  onChanged,
  onClose,
  onNotice,
  session,
}: {
  account?: Account;
  canManage: boolean;
  companyId: string;
  departmentName: string;
  departments: Department[];
  employee: Employee;
  managers: Employee[];
  onChanged: () => void | Promise<void>;
  onClose: () => void;
  onNotice: (text: string) => void;
  session: Session;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      first_name: form.get("first_name"),
      last_name: form.get("last_name"),
      phone_number: String(form.get("phone_number") ?? "") || null,
      job_title: String(form.get("job_title") ?? "") || null,
      employment_type: String(form.get("employment_type") ?? "") || null,
      department_id: form.get("department_id") || null,
      manager_employee_id: form.get("manager_employee_id") || null,
      status: form.get("status"),
    };
    try {
      setBusy(true);
      await moshomoApi(`/companies/${companyId}/employees/${employee.id}`, {
        method: "PATCH",
        session,
        companyId,
        body,
      });
      onNotice("Employee updated.");
      await onChanged();
      onClose();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(role: Role) {
    try {
      setBusy(true);
      await moshomoApi(`/companies/${companyId}/employees/${employee.id}/role`, {
        method: "PATCH",
        session,
        companyId,
        body: { role },
      });
      onNotice(`Role updated to ${role}.`);
      await onChanged();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Role change failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${employee.first_name} ${employee.last_name}? This cannot be undone.`)) return;
    try {
      setBusy(true);
      await moshomoApi(`/companies/${companyId}/employees/${employee.id}`, {
        method: "DELETE",
        session,
        companyId,
      });
      onNotice("Employee removed.");
      await onChanged();
      onClose();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-labelledby="employee-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-6"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="animate-rise max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-100 text-lg font-black text-brand-800">
              {initials(employee)}
            </span>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight" id="employee-dialog-title">
                {employee.first_name} {employee.last_name}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <span className={`badge ${account ? roleStyles[account.role] : ""}`}>
                  {account?.role ?? "—"}
                </span>
                <span className={`badge ${statusStyles[employee.status]}`}>{employee.status}</span>
                <span>{account?.state ?? ""}</span>
              </p>
            </div>
          </div>
          <button className="secondary-button px-3 py-2" onClick={onClose}>
            Close
          </button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl bg-surface-muted p-5 text-sm">
          <Detail label="Employee number" value={employee.employee_number} />
          <Detail label="Email" value={employee.email ?? "—"} />
          <Detail label="Department" value={departmentName} />
          <Detail label="Employment type" value={employee.employment_type ?? "—"} />
          <Detail label="Job title" value={employee.job_title ?? "—"} />
          <Detail label="Start date" value={employee.start_date ?? "—"} />
        </dl>

        {canManage && (
          <>
            <Section title="Role & permissions">
              <div className="flex flex-wrap items-center gap-2">
                {(["employee", "manager", "admin"] as Role[]).map((role) => (
                  <button
                    className={`chip ${account?.role === role ? "ring-2 ring-brand-300" : ""}`}
                    disabled={busy || account?.role === role}
                    key={role}
                    onClick={() => changeRole(role)}
                  >
                    {account?.role === role ? `${role} (current)` : `Make ${role}`}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Edit details">
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveDetails}>
                <Field defaultValue={employee.first_name} label="First name" name="first_name" />
                <Field defaultValue={employee.last_name} label="Last name" name="last_name" />
                <Field defaultValue={employee.phone_number ?? ""} label="Phone" name="phone_number" required={false} />
                <Field defaultValue={employee.job_title ?? ""} label="Job title" name="job_title" required={false} />
                <Field
                  defaultValue={employee.employment_type ?? ""}
                  label="Employment type"
                  name="employment_type"
                  required={false}
                />
                <SelectField defaultValue={employee.status} label="Status" name="status">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="terminated">Terminated</option>
                  <option value="resigned">Resigned</option>
                </SelectField>
                <SelectField
                  defaultValue={employee.department_id ?? ""}
                  label="Department"
                  name="department_id"
                >
                  <option value="">No department</option>
                  {departments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  defaultValue={employee.manager_employee_id ?? ""}
                  label="Reports to"
                  name="manager_employee_id"
                >
                  <option value="">No manager</option>
                  {managers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.first_name} {item.last_name}
                    </option>
                  ))}
                </SelectField>
                <button className="primary-button sm:col-span-2" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </form>
            </Section>

            <DocumentsSection
              companyId={companyId}
              employeeId={employee.id}
              onNotice={onNotice}
              session={session}
            />

            <Section title="Danger zone">
              <button className="secondary-button text-rose-700 hover:bg-rose-50" disabled={busy} onClick={remove}>
                Remove employee
              </button>
            </Section>
          </>
        )}

        {!canManage && (
          <DocumentsSection
            companyId={companyId}
            employeeId={employee.id}
            onNotice={onNotice}
            readOnly
            session={session}
          />
        )}
      </div>
    </div>
  );
}

function DocumentsSection({
  companyId,
  employeeId,
  onNotice,
  readOnly = false,
  session,
}: {
  companyId: string;
  employeeId: string;
  onNotice: (text: string) => void;
  readOnly?: boolean;
  session: Session;
}) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  async function reload() {
    try {
      const rows = await moshomoApi<EmployeeDocument[]>(
        `/companies/${companyId}/employees/${employeeId}/documents`,
        { session, companyId },
      );
      setDocuments(rows);
      setUnavailable(false);
    } catch {
      // Migration not applied yet, or no access.
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the async fetch resolves
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, employeeId]);

  async function upload(file: File, docType: string) {
    const allowed: Record<string, string> = {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    const extension = allowed[file.type];
    if (!extension) {
      onNotice("Documents must be PDF, PNG, JPEG, or WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onNotice("Documents must be smaller than 10 MB.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const path = `${companyId}/${employeeId}/${Date.now()}-${sanitize(file.name)}`;
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("employee-documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      await moshomoApi(`/companies/${companyId}/employees/${employeeId}/documents`, {
        method: "POST",
        session,
        companyId,
        body: {
          storage_path: path,
          file_name: file.name,
          doc_type: docType,
          content_type: file.type,
          size_bytes: file.size,
        },
      });
      onNotice("Document uploaded.");
      await reload();
    } catch (error) {
      await supabase.storage.from("employee-documents").remove([path]);
      onNotice(error instanceof Error ? error.message : "Document upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function view(document: EmployeeDocument) {
    const { data, error } = await getSupabaseBrowserClient()
      .storage.from("employee-documents")
      .createSignedUrl(document.storage_path, 60);
    if (error || !data) {
      onNotice("Could not open the document.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove(document: EmployeeDocument) {
    if (!window.confirm(`Delete ${document.file_name}?`)) return;
    try {
      await moshomoApi(
        `/companies/${companyId}/employees/${employeeId}/documents/${document.id}`,
        { method: "DELETE", session, companyId },
      );
      await getSupabaseBrowserClient()
        .storage.from("employee-documents")
        .remove([document.storage_path]);
      onNotice("Document deleted.");
      await reload();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  return (
    <Section title="Documents">
      {unavailable ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Document storage becomes available once the employee-documents migration is applied.
        </p>
      ) : (
        <>
          {!readOnly && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <DocumentUpload disabled={uploading} onUpload={upload} uploading={uploading} />
            </div>
          )}
          {loading ? (
            <p className="text-sm text-ink-muted">Loading documents…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-ink-muted">No documents yet.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((document) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-4 py-3"
                  key={document.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{document.file_name}</p>
                    <p className="text-xs capitalize text-ink-muted">{document.doc_type}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button className="text-sm font-semibold text-ink-soft transition hover:text-ink" onClick={() => view(document)}>
                      View
                    </button>
                    {!readOnly && (
                      <button className="text-sm font-semibold text-rose-600" onClick={() => remove(document)}>
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

function DocumentUpload({
  disabled,
  onUpload,
  uploading,
}: {
  disabled: boolean;
  onUpload: (file: File, docType: string) => Promise<void>;
  uploading: boolean;
}) {
  const [docType, setDocType] = useState("contract");
  return (
    <>
      <select
        className="input max-w-[180px]"
        onChange={(event) => setDocType(event.target.value)}
        value={docType}
      >
        <option value="contract">Contract</option>
        <option value="id">ID</option>
        <option value="certification">Certification</option>
        <option value="other">Other</option>
      </select>
      <label className="secondary-button cursor-pointer">
        {uploading ? "Uploading…" : "Upload document"}
        <input
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUpload(file, docType);
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 pt-6">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm font-medium text-ink-soft">
      {label}
      {!required && <span className="ml-1 font-normal text-ink-faint">Optional</span>}
      <input className="input mt-2" defaultValue={defaultValue} name={name} required={required} type={type} />
    </label>
  );
}

function SelectField({
  label,
  name,
  children,
  defaultValue,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm font-medium text-ink-soft">
      {label}
      <select className="input mt-2" defaultValue={defaultValue} name={name}>
        {children}
      </select>
    </label>
  );
}

function initials(employee: Employee) {
  return `${employee.first_name[0] ?? ""}${employee.last_name[0] ?? ""}`.toUpperCase();
}

function sanitize(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}
