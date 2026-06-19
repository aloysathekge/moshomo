"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Employee } from "@/modules/employees/employees-panel";
import type { Role } from "@/lib/apps";
import { moshomoApi } from "@/lib/api";

type LeaveTypeValue = "annual" | "sick" | "family_responsibility" | "unpaid";
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type DayPart = "full" | "morning" | "afternoon";

type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: LeaveTypeValue;
  start_date: string;
  end_date: string;
  day_part: DayPart;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decision_note: string | null;
  employee?: { first_name?: string | null; last_name?: string | null; employee_number?: string | null } | null;
};
type Balance = { leave_type: LeaveTypeValue; allotted: number; used: number; remaining: number };

const LEAVE_TYPES: { value: LeaveTypeValue; label: string }[] = [
  { value: "annual", label: "Annual" },
  { value: "sick", label: "Sick" },
  { value: "family_responsibility", label: "Family responsibility" },
  { value: "unpaid", label: "Unpaid" },
];
const typeLabel = (value: LeaveTypeValue) => LEAVE_TYPES.find((t) => t.value === value)?.label ?? value;

const statusStyles: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-stone-200 text-stone-600",
};

function computeDays(start: string, end: string, dayPart: DayPart): number | null {
  if (!start || !end) return null;
  if (dayPart !== "full") return 0.5;
  const diff = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  return diff > 0 ? diff : null;
}

function formatRange(req: LeaveRequest): string {
  const suffix = req.day_part === "morning" ? " (AM)" : req.day_part === "afternoon" ? " (PM)" : "";
  return req.start_date === req.end_date ? `${req.start_date}${suffix}` : `${req.start_date} → ${req.end_date}`;
}

export function LeavePanel({
  companyId,
  employees,
  role,
  session,
}: {
  companyId: string;
  employees: Employee[];
  role: Role;
  session: Session;
}) {
  const canApprove = role === "manager" || role === "admin";
  const isAdmin = role === "admin";

  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [notice, setNotice] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const bal = await moshomoApi<{ employee_id: string | null; balances: Balance[] }>(
        "/workforce/leave/balances",
        { session, companyId },
      );
      setMyEmployeeId(bal.employee_id);
      setBalances(bal.balances);
      setMyRequests(await moshomoApi<LeaveRequest[]>("/workforce/leave/requests?mine=true", { session, companyId }));
      if (canApprove) {
        setAllRequests(await moshomoApi<LeaveRequest[]>("/workforce/leave/requests", { session, companyId }));
      }
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, [session, companyId, canApprove]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state set after async load
    void load();
  }, [load]);

  const approvals = useMemo(
    () => allRequests.filter((r) => r.status === "pending" && r.employee_id !== myEmployeeId),
    [allRequests, myEmployeeId],
  );

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = String(form.get("start_date"));
    const end = String(form.get("end_date"));
    let dayPart = String(form.get("day_part")) as DayPart;
    if (start !== end) dayPart = "full";
    setBusy(true);
    try {
      await moshomoApi("/workforce/leave/requests", {
        method: "POST",
        session,
        companyId,
        body: { leave_type: form.get("leave_type"), start_date: start, end_date: end, day_part: dayPart, reason: form.get("reason") || null },
      });
      (event.target as HTMLFormElement).reset();
      setNotice("Leave request submitted.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit request.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: "approve" | "reject" | "cancel", note?: string) {
    setBusy(true);
    try {
      await moshomoApi(`/workforce/leave/requests/${id}`, { method: "PATCH", session, companyId, body: { action, note } });
      setNotice(`Request ${action === "cancel" ? "cancelled" : action + "d"}.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl animate-rise">
      <div className="mb-6">
        <p className="eyebrow">Time off</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Leave</h1>
        <p className="mt-2 text-ink-muted">Request time off, track your balance, and review your history.</p>
      </div>

      {unavailable && (
        <p className="notice mb-6 px-4 py-3 text-sm font-medium">
          Leave is being set up. It becomes available once the leave-management migration is applied.
        </p>
      )}
      {notice && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-900">
          <span>{notice}</span>
          <button className="text-brand-700/70 hover:text-brand-700" onClick={() => setNotice(undefined)}>✕</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <RequestForm busy={busy} onSubmit={submitRequest} />
        <BalanceCard balances={balances} />
      </div>

      {canApprove && (
        <section className="premium-card mt-6">
          <h2 className="text-lg font-semibold">Approvals</h2>
          <p className="mt-1 text-sm text-ink-muted">Pending requests awaiting your decision.</p>
          {approvals.length === 0 ? (
            <div className="empty-state mt-5 px-5 py-8">
              <p className="text-sm font-semibold text-ink-soft">Nothing to review</p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-muted">New leave requests from your team will appear here.</p>
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {approvals.map((req) => (
                <li className="rounded-2xl border border-[var(--line)] bg-surface-muted p-4" key={req.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{(req.employee?.first_name ?? "") + " " + (req.employee?.last_name ?? "")}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{typeLabel(req.leave_type)} · {formatRange(req)} · {req.days} day{req.days === 1 ? "" : "s"}</p>
                      {req.reason && <p className="mt-1 text-xs italic text-ink-muted">“{req.reason}”</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="primary-button px-3 py-1.5 text-xs" disabled={busy} onClick={() => decide(req.id, "approve")}>Approve</button>
                      <button className="secondary-button border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => decide(req.id, "reject")}>Reject</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="premium-card mt-6">
        <h2 className="text-lg font-semibold">My requests</h2>
        {myRequests.length === 0 ? (
          <div className="empty-state mt-5 px-5 py-8">
            <p className="text-sm font-semibold text-ink-soft">No leave yet</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-muted">Submit a request above and track its status here.</p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-[var(--line)]">
            {myRequests.map((req) => (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={req.id}>
                <div>
                  <p className="text-sm font-semibold">{typeLabel(req.leave_type)} · {req.days} day{req.days === 1 ? "" : "s"}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{formatRange(req)}{req.decision_note ? ` · note: ${req.decision_note}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${statusStyles[req.status]}`}>{req.status}</span>
                  {req.status === "pending" && (
                    <button className="text-xs font-semibold text-rose-600" disabled={busy} onClick={() => decide(req.id, "cancel")}>Cancel</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && <AllowancesEditor busy={busy} companyId={companyId} employees={employees} onSaved={(m) => { setNotice(m); void load(); }} session={session} />}
    </div>
  );
}

function RequestForm({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dayPart, setDayPart] = useState<DayPart>("full");
  const singleDay = Boolean(start) && start === end;
  const days = computeDays(start, end, singleDay ? dayPart : "full");

  return (
    <section className="premium-card">
      <h2 className="text-lg font-semibold">Request leave</h2>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <label className="text-sm font-medium text-ink-soft sm:col-span-2">Leave type
          <select className="input mt-2" name="leave_type">{LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-ink-soft">Start date
          <input className="input mt-2" name="start_date" onChange={(e) => { setStart(e.target.value); if (!end) setEnd(e.target.value); }} required type="date" value={start} />
        </label>
        <label className="text-sm font-medium text-ink-soft">End date
          <input className="input mt-2" min={start || undefined} name="end_date" onChange={(e) => setEnd(e.target.value)} required type="date" value={end} />
        </label>
        <label className="text-sm font-medium text-ink-soft sm:col-span-2">Duration
          <select className="input mt-2" disabled={!singleDay} name="day_part" onChange={(e) => setDayPart(e.target.value as DayPart)} value={singleDay ? dayPart : "full"}>
            <option value="full">Full day</option>
            <option value="morning">Half day — morning</option>
            <option value="afternoon">Half day — afternoon</option>
          </select>
          {!singleDay && <span className="mt-1 block text-xs font-normal text-ink-faint">Half days apply to single-day requests.</span>}
        </label>
        <label className="text-sm font-medium text-ink-soft sm:col-span-2">Reason <span className="font-normal text-ink-faint">Optional</span>
          <input className="input mt-2" maxLength={500} name="reason" placeholder="e.g. Family holiday" />
        </label>
        <div className="flex items-center justify-between sm:col-span-2">
          <span className="text-sm text-ink-muted">{days ? `${days} day${days === 1 ? "" : "s"}` : " "}</span>
          <button className="primary-button" disabled={busy || !days}>Submit request</button>
        </div>
      </form>
    </section>
  );
}

function BalanceCard({ balances }: { balances: Balance[] }) {
  return (
    <section className="premium-card">
      <h2 className="text-lg font-semibold">My balance</h2>
      <p className="mt-1 text-sm text-ink-muted">Allowance minus approved leave.</p>
      <ul className="mt-5 space-y-3">
        {balances.map((b) => (
          <li className="rounded-2xl border border-[var(--line)] bg-surface-muted p-4" key={b.leave_type}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{typeLabel(b.leave_type)}</span>
              <span className="text-sm font-semibold tabular-nums text-brand-700">{b.remaining} left</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">{b.used} used of {b.allotted} allotted</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AllowancesEditor({
  busy,
  companyId,
  employees,
  onSaved,
  session,
}: {
  busy: boolean;
  companyId: string;
  employees: Employee[];
  onSaved: (message: string) => void;
  session: Session;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [values, setValues] = useState<Record<LeaveTypeValue, string>>({ annual: "", sick: "", family_responsibility: "", unpaid: "" });
  const [saving, setSaving] = useState(false);

  async function pick(id: string) {
    setEmployeeId(id);
    if (!id) return;
    try {
      const bal = await moshomoApi<{ balances: Balance[] }>(`/workforce/leave/balances?employee_id=${id}`, { session, companyId });
      const next = { ...values };
      for (const b of bal.balances) next[b.leave_type] = String(b.allotted);
      setValues(next);
    } catch {
      /* leave inputs blank */
    }
  }

  async function save() {
    if (!employeeId) return;
    setSaving(true);
    try {
      await moshomoApi(`/workforce/leave/allowances/${employeeId}`, {
        method: "PUT",
        session,
        companyId,
        body: { allowances: LEAVE_TYPES.map((t) => ({ leave_type: t.value, allotted_days: Number(values[t.value]) || 0 })) },
      });
      onSaved("Allowances saved.");
    } catch (error) {
      onSaved(error instanceof Error ? error.message : "Could not save allowances.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="premium-card mt-6">
      <h2 className="text-lg font-semibold">Allowances</h2>
      <p className="mt-1 text-sm text-ink-muted">Set the annual allowance per leave type for an employee.</p>
      <label className="mt-5 block max-w-sm text-sm font-medium text-ink-soft">Employee
        <select className="input mt-2" onChange={(e) => pick(e.target.value)} value={employeeId}>
          <option value="">Select an employee…</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
        </select>
      </label>
      {employeeId && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LEAVE_TYPES.map((t) => (
              <label className="text-sm font-medium text-ink-soft" key={t.value}>{t.label}
                <input className="input mt-2" min={0} onChange={(e) => setValues((v) => ({ ...v, [t.value]: e.target.value }))} step="0.5" type="number" value={values[t.value]} />
              </label>
            ))}
          </div>
          <button className="primary-button mt-5" disabled={busy || saving} onClick={save}>{saving ? "Saving…" : "Save allowances"}</button>
        </>
      )}
    </section>
  );
}
