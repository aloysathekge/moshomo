"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Department, Employee } from "@/modules/employees/employees-panel";
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
type Balance = {
  leave_type: LeaveTypeValue;
  allotted: number;
  used: number;
  pending: number;
  available: number;
  remaining: number;
};
type Holiday = { id: string; holiday_date: string; name: string };

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

// ---------- date helpers (all in local YYYY-MM-DD space) ----------
function todayIso(): string {
  const now = new Date();
  return isoOf(now.getFullYear(), now.getMonth(), now.getDate());
}
function isoOf(year: number, month0: number, day: number): string {
  const m = String(month0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}
function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
function eachDate(startIso: string, endIso: string): Date[] {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (!start || !end || end < start) return [];
  const out: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
function toIso(date: Date): string {
  return isoOf(date.getFullYear(), date.getMonth(), date.getDate());
}

// Working-day count mirroring the server: exclude weekends + holidays.
// Single-day half-day requests count as 0.5.
function computeWorkingDays(
  startIso: string,
  endIso: string,
  dayPart: DayPart,
  holidays: Set<string>,
): number | null {
  const dates = eachDate(startIso, endIso);
  if (dates.length === 0) return null;
  const working = dates.filter((d) => !isWeekend(d) && !holidays.has(toIso(d)));
  if (startIso === endIso && dayPart !== "full") {
    // half day only counts if the single day is a working day
    return working.length === 0 ? 0 : 0.5;
  }
  return working.length;
}

function formatRange(req: LeaveRequest): string {
  const suffix = req.day_part === "morning" ? " (AM)" : req.day_part === "afternoon" ? " (PM)" : "";
  return req.start_date === req.end_date ? `${req.start_date}${suffix}` : `${req.start_date} → ${req.end_date}`;
}

function employeeName(req: LeaveRequest): string {
  const name = `${req.employee?.first_name ?? ""} ${req.employee?.last_name ?? ""}`.trim();
  return name || req.employee?.employee_number || "Employee";
}

function initialsOf(req: LeaveRequest): string {
  const first = req.employee?.first_name?.trim()?.[0] ?? "";
  const last = req.employee?.last_name?.trim()?.[0] ?? "";
  const combined = `${first}${last}`.toUpperCase();
  return combined || (req.employee?.employee_number ?? "?").slice(0, 2).toUpperCase();
}

export function LeavePanel({
  companyId,
  departments,
  employees,
  role,
  session,
}: {
  companyId: string;
  departments: Department[];
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
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [notice, setNotice] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  // per-row busy: maps request id -> true while an action runs on it
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  const holidayDates = useMemo(() => new Set(holidays.map((h) => h.holiday_date)), [holidays]);

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
      // Holidays for the current year (used by the form's live count and calendar).
      try {
        const year = new Date().getFullYear();
        const res = await moshomoApi<{ holidays: Holiday[] }>(`/workforce/leave/holidays?year=${year}`, {
          session,
          companyId,
        });
        setHolidays(res.holidays ?? []);
      } catch {
        setHolidays([]);
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

  async function submitRequest(payload: {
    leave_type: LeaveTypeValue;
    start_date: string;
    end_date: string;
    day_part: DayPart;
    reason: string | null;
  }): Promise<boolean> {
    setBusy(true);
    try {
      await moshomoApi("/workforce/leave/requests", {
        method: "POST",
        session,
        companyId,
        body: payload,
      });
      setNotice("Leave request submitted.");
      await load();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit request.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: "approve" | "reject" | "cancel", note?: string) {
    setRowBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await moshomoApi(`/workforce/leave/requests/${id}`, { method: "PATCH", session, companyId, body: { action, note } });
      setNotice(`Request ${action === "cancel" ? "cancelled" : action + "d"}.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setRowBusy((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  type Tab = "my" | "approvals" | "calendar" | "settings";
  const [tab, setTab] = useState<Tab>("my");
  const tabs: { id: Tab; label: string }[] = [
    { id: "my", label: "My leave" },
    ...(canApprove
      ? [{ id: "approvals" as const, label: approvals.length ? `Approvals (${approvals.length})` : "Approvals" }]
      : []),
    ...(canApprove ? [{ id: "calendar" as const, label: "Team calendar" }] : []),
    ...(isAdmin ? [{ id: "settings" as const, label: "Settings" }] : []),
  ];

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
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-sm font-medium text-ink-soft">
          <span>{notice}</span>
          <button aria-label="Dismiss" className="text-ink-muted hover:text-ink" onClick={() => setNotice(undefined)}>✕</button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <button
            aria-selected={tab === t.id}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t.id ? "bg-ink text-white" : "bg-surface-muted text-ink-soft hover:bg-surface-sunken"
            }`}
            key={t.id}
            onClick={() => setTab(t.id)}
            role="tab"
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "my" && (
        <div className="space-y-6">
          <BalanceStrip balances={balances} />
          <div className="grid gap-6 lg:grid-cols-2">
            <RequestForm balances={balances} busy={busy} holidayDates={holidayDates} onSubmit={submitRequest} />
            <MyRequestsSection onCancel={(id) => decide(id, "cancel")} requests={myRequests} rowBusy={rowBusy} />
          </div>
        </div>
      )}

      {tab === "approvals" && canApprove && (
        <ApprovalsSection approvals={approvals} onDecide={decide} rowBusy={rowBusy} />
      )}

      {tab === "calendar" && canApprove && (
        <TeamCalendar departments={departments} employees={employees} holidayDates={holidayDates} requests={allRequests} />
      )}

      {tab === "settings" && isAdmin && (
        <div className="space-y-6">
          <HolidaysAdmin companyId={companyId} holidays={holidays} onChanged={() => void load()} onNotice={setNotice} session={session} />
          <AllowancesEditor busy={busy} companyId={companyId} employees={employees} onSaved={(m) => { setNotice(m); void load(); }} session={session} />
        </div>
      )}
    </div>
  );
}

function RequestForm({
  balances,
  busy,
  holidayDates,
  onSubmit,
}: {
  balances: Balance[];
  busy: boolean;
  holidayDates: Set<string>;
  onSubmit: (payload: {
    leave_type: LeaveTypeValue;
    start_date: string;
    end_date: string;
    day_part: DayPart;
    reason: string | null;
  }) => Promise<boolean>;
}) {
  const today = todayIso();
  const [leaveType, setLeaveType] = useState<LeaveTypeValue>("annual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dayPart, setDayPart] = useState<DayPart>("full");
  const [reason, setReason] = useState("");

  const singleDay = Boolean(start) && start === end;
  const effectiveDayPart = singleDay ? dayPart : "full";
  const days = computeWorkingDays(start, end, effectiveDayPart, holidayDates);

  const balance = balances.find((b) => b.leave_type === leaveType);
  // Unpaid leave (or types with no allowance) should not block on balance.
  const hasAllowance = Boolean(balance) && leaveType !== "unpaid" && (balance?.allotted ?? 0) > 0;
  const available = balance?.available ?? 0;
  const overBalance = hasAllowance && days !== null && days > available;

  const canSubmit = !busy && days !== null && days > 0 && !overBalance;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!start || !end) return;
    const ok = await onSubmit({
      leave_type: leaveType,
      start_date: start,
      end_date: end,
      day_part: effectiveDayPart,
      reason: reason.trim() || null,
    });
    if (ok) {
      setStart("");
      setEnd("");
      setDayPart("full");
      setReason("");
    }
  }

  return (
    <section className="premium-card">
      <h2 className="text-lg font-semibold">Request leave</h2>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="text-sm font-medium text-ink-soft sm:col-span-2" htmlFor="leave-type">Leave type
          <select
            className="input mt-2"
            id="leave-type"
            name="leave_type"
            onChange={(e) => setLeaveType(e.target.value as LeaveTypeValue)}
            value={leaveType}
          >
            {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-ink-soft" htmlFor="leave-start">Start date
          <input
            className="input mt-2"
            id="leave-start"
            min={today}
            name="start_date"
            onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }}
            required
            type="date"
            value={start}
          />
        </label>
        <label className="text-sm font-medium text-ink-soft" htmlFor="leave-end">End date
          <input
            className="input mt-2"
            id="leave-end"
            min={start || today}
            name="end_date"
            onChange={(e) => setEnd(e.target.value)}
            required
            type="date"
            value={end}
          />
        </label>
        <label className="text-sm font-medium text-ink-soft sm:col-span-2" htmlFor="leave-daypart">Duration
          <select
            className="input mt-2"
            disabled={!singleDay}
            id="leave-daypart"
            name="day_part"
            onChange={(e) => setDayPart(e.target.value as DayPart)}
            value={effectiveDayPart}
          >
            <option value="full">Full day</option>
            <option value="morning">Half day — morning</option>
            <option value="afternoon">Half day — afternoon</option>
          </select>
          {!singleDay && <span className="mt-1 block text-xs font-normal text-ink-faint">Half days apply to single-day requests.</span>}
        </label>
        <label className="text-sm font-medium text-ink-soft sm:col-span-2" htmlFor="leave-reason">Reason <span className="font-normal text-ink-faint">Optional</span>
          <input
            className="input mt-2"
            id="leave-reason"
            maxLength={500}
            name="reason"
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Family holiday"
            value={reason}
          />
        </label>

        <div className="rounded-2xl bg-surface-muted px-4 py-3 text-sm sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink-soft">
              {days !== null && days > 0
                ? <><span className="font-semibold tabular-nums text-ink">{days}</span> working day{days === 1 ? "" : "s"}</>
                : <span className="text-ink-muted">Pick dates to see the working-day count.</span>}
            </span>
            {balance && (
              <span className="text-xs text-ink-muted">
                {hasAllowance
                  ? <><span className="font-semibold tabular-nums text-ink-soft">{available}</span> available</>
                  : "No allowance limit"}
              </span>
            )}
          </div>
          {days !== null && days > 0 && (
            <p className="mt-1 text-xs text-ink-faint">Weekends and company holidays are excluded.</p>
          )}
          {overBalance && (
            <p className="mt-2 text-xs font-medium text-rose-700">
              This request needs {days} day{days === 1 ? "" : "s"} but only {available} are available.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end sm:col-span-2">
          <button className="primary-button" disabled={!canSubmit}>Submit request</button>
        </div>
      </form>
    </section>
  );
}

function BalanceStrip({ balances }: { balances: Balance[] }) {
  // Only show types that are actually in play (configured or with activity).
  const shown = balances.filter((b) => b.allotted > 0 || b.used > 0 || b.pending > 0);
  if (shown.length === 0) {
    return (
      <div className="empty-state px-5 py-6">
        <p className="text-sm font-semibold text-ink-soft">No allowances set</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-muted">
          Your balances appear once an admin assigns leave allowances.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {shown.map((b) => (
        <div className="metric-card" key={b.leave_type}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{typeLabel(b.leave_type)}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {b.available}
            <span className="ml-1.5 text-xs font-normal text-ink-faint">available</span>
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-ink-muted">
            {b.used} used · {b.pending} pending · {b.allotted} total
          </p>
        </div>
      ))}
    </div>
  );
}

function ApprovalsSection({
  approvals,
  onDecide,
  rowBusy,
}: {
  approvals: LeaveRequest[];
  onDecide: (id: string, action: "approve" | "reject" | "cancel", note?: string) => void;
  rowBusy: Record<string, boolean>;
}) {
  return (
    <section className="premium-card">
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
            <ApprovalRow busy={Boolean(rowBusy[req.id])} key={req.id} onDecide={onDecide} req={req} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApprovalRow({
  busy,
  onDecide,
  req,
}: {
  busy: boolean;
  onDecide: (id: string, action: "approve" | "reject" | "cancel", note?: string) => void;
  req: LeaveRequest;
}) {
  const [note, setNote] = useState("");
  return (
    <li className="rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{employeeName(req)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {typeLabel(req.leave_type)} · {formatRange(req)} · {req.days} working day{req.days === 1 ? "" : "s"}
          </p>
          {req.reason && <p className="mt-1 text-xs italic text-ink-muted">“{req.reason}”</p>}
        </div>
        <span className={`badge shrink-0 ${statusStyles[req.status]}`}>{req.status}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[180px] flex-1 text-xs font-medium text-ink-soft" htmlFor={`note-${req.id}`}>
          Note <span className="font-normal text-ink-faint">Optional</span>
          <input
            className="input mt-1.5 py-2 text-sm"
            id={`note-${req.id}`}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note for the employee"
            value={note}
          />
        </label>
        <div className="flex shrink-0 gap-2">
          <button
            className="primary-button px-3 py-2 text-xs"
            disabled={busy}
            onClick={() => onDecide(req.id, "approve", note.trim() || undefined)}
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <button
            className="secondary-button px-3 py-2 text-xs text-rose-700"
            disabled={busy}
            onClick={() => onDecide(req.id, "reject", note.trim() || undefined)}
          >
            Reject
          </button>
        </div>
      </div>
    </li>
  );
}

function MyRequestsSection({
  onCancel,
  requests,
  rowBusy,
}: {
  onCancel: (id: string) => void;
  requests: LeaveRequest[];
  rowBusy: Record<string, boolean>;
}) {
  const today = todayIso();
  const { upcoming, history } = useMemo(() => {
    const sorted = [...requests].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
    return {
      upcoming: sorted.filter((r) => r.end_date >= today),
      history: sorted.filter((r) => r.end_date < today),
    };
  }, [requests, today]);

  function row(req: LeaveRequest) {
    const busy = Boolean(rowBusy[req.id]);
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3" key={req.id}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{typeLabel(req.leave_type)} · {req.days} day{req.days === 1 ? "" : "s"}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {formatRange(req)}{req.decision_note ? ` · note: ${req.decision_note}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`badge ${statusStyles[req.status]}`}>{req.status}</span>
          {req.status === "pending" && (
            <button
              className="text-xs font-semibold text-rose-600 disabled:opacity-50"
              disabled={busy}
              onClick={() => { if (window.confirm("Cancel this leave request?")) onCancel(req.id); }}
            >
              {busy ? "Cancelling…" : "Cancel"}
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <section className="premium-card">
      <h2 className="text-lg font-semibold">My requests</h2>
      {requests.length === 0 ? (
        <div className="empty-state mt-5 px-5 py-8">
          <p className="text-sm font-semibold text-ink-soft">No leave yet</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-muted">Submit a request above and track its status here.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          <div>
            <p className="eyebrow">Upcoming</p>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No upcoming leave.</p>
            ) : (
              <ul className="mt-3 space-y-2">{upcoming.map(row)}</ul>
            )}
          </div>
          {history.length > 0 && (
            <div>
              <p className="eyebrow">History</p>
              <ul className="mt-3 space-y-2">{history.map(row)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TeamCalendar({
  departments,
  employees,
  holidayDates,
  requests,
}: {
  departments: Department[];
  employees: Employee[];
  holidayDates: Set<string>;
  requests: LeaveRequest[];
}) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [departmentId, setDepartmentId] = useState("");

  // Only departments that actually have staff, labelled by real name.
  const usedDepartments = useMemo(() => {
    const withStaff = new Set(employees.map((e) => e.department_id).filter(Boolean) as string[]);
    return departments.filter((d) => withStaff.has(d.id));
  }, [departments, employees]);

  // employee_id -> department_id, to support the department filter
  const empDept = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const e of employees) map.set(e.id, e.department_id);
    return map;
  }, [employees]);

  // Map each in-scope day to the requests covering it (approved + pending only).
  const byDay = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    const relevant = requests.filter((r) => r.status === "approved" || r.status === "pending");
    for (const req of relevant) {
      if (departmentId && empDept.get(req.employee_id) !== departmentId) continue;
      for (const date of eachDate(req.start_date, req.end_date)) {
        if (isWeekend(date)) continue;
        const iso = toIso(date);
        const list = map.get(iso) ?? [];
        list.push(req);
        map.set(iso, list);
      }
    }
    return map;
  }, [requests, departmentId, empDept]);

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shift(delta: number) {
    setView((v) => {
      const next = new Date(v.year, v.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <section className="premium-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Team calendar</h2>
          <p className="mt-1 text-sm text-ink-muted">Who is off each day this month.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {usedDepartments.length > 0 && (
            <>
              <label className="sr-only" htmlFor="calendar-dept">Department</label>
              <select
                className="input w-auto py-2 text-sm"
                id="calendar-dept"
                onChange={(e) => setDepartmentId(e.target.value)}
                value={departmentId}
              >
                <option value="">All departments</option>
                {usedDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </>
          )}
          <button aria-label="Previous month" className="secondary-button px-3 py-2 text-sm" onClick={() => shift(-1)}>‹</button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-ink">{monthLabel}</span>
          <button aria-label="Next month" className="secondary-button px-3 py-2 text-sm" onClick={() => shift(1)}>›</button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1.5">
        {weekdayLabels.map((label) => (
          <div className="px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-faint" key={label}>{label}</div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div className="min-h-[72px] rounded-xl bg-surface" key={`pad-${idx}`} />;
          const iso = isoOf(view.year, view.month, day);
          const date = new Date(view.year, view.month, day);
          const weekend = isWeekend(date);
          const holiday = holidayDates.has(iso);
          const people = byDay.get(iso) ?? [];
          const overlap = people.length >= 2;
          const muted = weekend || holiday;
          const cellBg = overlap ? "bg-surface-sunken" : muted ? "bg-surface" : "bg-surface-muted";
          return (
            <div className={`min-h-[72px] rounded-xl p-1.5 ${cellBg}`} key={iso}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold tabular-nums ${muted ? "text-ink-faint" : "text-ink-soft"}`}>{day}</span>
                {overlap && <span className="text-[10px] font-semibold tabular-nums text-ink-muted">{people.length}</span>}
              </div>
              {holiday && !weekend && <span className="mt-0.5 block text-[10px] text-ink-faint">Holiday</span>}
              <div className="mt-1 flex flex-wrap gap-0.5">
                {people.slice(0, 4).map((req) => (
                  <span
                    className={`rounded px-1 py-0.5 text-[10px] font-semibold ${req.status === "pending" ? "text-ink-muted" : "text-ink-soft"} bg-surface`}
                    key={req.id}
                    title={`${employeeName(req)} · ${typeLabel(req.leave_type)} · ${req.status}`}
                  >
                    {initialsOf(req)}
                  </span>
                ))}
                {people.length > 4 && <span className="text-[10px] text-ink-faint">+{people.length - 4}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-faint">Showing approved and pending leave. Weekends and holidays are muted.</p>
    </section>
  );
}

function HolidaysAdmin({
  companyId,
  holidays,
  onChanged,
  onNotice,
  session,
}: {
  companyId: string;
  holidays: Holiday[];
  onChanged: () => void;
  onNotice: (message: string) => void;
  session: Session;
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [yearHolidays, setYearHolidays] = useState<Holiday[]>(holidays);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [working, setWorking] = useState(false);

  const loadYear = useCallback(async (targetYear: number) => {
    try {
      const res = await moshomoApi<{ holidays: Holiday[] }>(`/workforce/leave/holidays?year=${targetYear}`, {
        session,
        companyId,
      });
      setYearHolidays(res.holidays ?? []);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not load holidays.");
      setYearHolidays([]);
    }
  }, [session, companyId, onNotice]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state set after async load
    void loadYear(year);
  }, [loadYear, year]);

  async function importHolidays() {
    setWorking(true);
    try {
      await moshomoApi(`/workforce/leave/holidays/import`, { method: "POST", session, companyId, body: { year } });
      onNotice("South African public holidays imported.");
      await loadYear(year);
      onChanged();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not import holidays.");
    } finally {
      setWorking(false);
    }
  }

  async function addHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newDate || !newName.trim()) return;
    setWorking(true);
    try {
      await moshomoApi(`/workforce/leave/holidays`, {
        method: "POST",
        session,
        companyId,
        body: { holiday_date: newDate, name: newName.trim() },
      });
      onNotice("Holiday added.");
      setNewDate("");
      setNewName("");
      await loadYear(year);
      onChanged();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not add holiday.");
    } finally {
      setWorking(false);
    }
  }

  async function removeHoliday(id: string) {
    setWorking(true);
    try {
      await moshomoApi(`/workforce/leave/holidays/${id}`, { method: "DELETE", session, companyId });
      onNotice("Holiday removed.");
      await loadYear(year);
      onChanged();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not remove holiday.");
    } finally {
      setWorking(false);
    }
  }

  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <section className="premium-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Public holidays</h2>
          <p className="mt-1 text-sm text-ink-muted">Holidays are excluded from working-day counts.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="holiday-year">Year</label>
          <select
            className="input w-auto py-2 text-sm"
            id="holiday-year"
            onChange={(e) => setYear(Number(e.target.value))}
            value={year}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="secondary-button px-3 py-2 text-sm" disabled={working} onClick={importHolidays}>
            Import South African holidays
          </button>
        </div>
      </div>

      <form className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end" onSubmit={addHoliday}>
        <label className="text-sm font-medium text-ink-soft" htmlFor="holiday-date">Date
          <input
            className="input mt-2"
            id="holiday-date"
            name="holiday_date"
            onChange={(e) => setNewDate(e.target.value)}
            required
            type="date"
            value={newDate}
          />
        </label>
        <label className="text-sm font-medium text-ink-soft" htmlFor="holiday-name">Name
          <input
            className="input mt-2"
            id="holiday-name"
            maxLength={120}
            name="name"
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Company shutdown"
            required
            value={newName}
          />
        </label>
        <button className="primary-button" disabled={working || !newDate || !newName.trim()}>Add holiday</button>
      </form>

      {yearHolidays.length === 0 ? (
        <div className="empty-state mt-5 px-5 py-8">
          <p className="text-sm font-semibold text-ink-soft">No holidays for {year}</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-muted">Import the public holidays or add your own above.</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {[...yearHolidays].sort((a, b) => (a.holiday_date < b.holiday_date ? -1 : 1)).map((h) => (
            <li className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3" key={h.id}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{h.name}</p>
                <p className="mt-0.5 text-xs text-ink-muted tabular-nums">{h.holiday_date}</p>
              </div>
              <button
                className="text-xs font-semibold text-rose-600 disabled:opacity-50"
                disabled={working}
                onClick={() => removeHoliday(h.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
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
      const next: Record<LeaveTypeValue, string> = { annual: "", sick: "", family_responsibility: "", unpaid: "" };
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
    <section className="premium-card">
      <h2 className="text-lg font-semibold">Allowances</h2>
      <p className="mt-1 text-sm text-ink-muted">Set the annual allowance per leave type for an employee.</p>
      <label className="mt-5 block max-w-sm text-sm font-medium text-ink-soft" htmlFor="allowance-employee">Employee
        <select className="input mt-2" id="allowance-employee" onChange={(e) => pick(e.target.value)} value={employeeId}>
          <option value="">Select an employee…</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
        </select>
      </label>
      {employeeId && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LEAVE_TYPES.map((t) => (
              <label className="text-sm font-medium text-ink-soft" htmlFor={`allowance-${t.value}`} key={t.value}>{t.label}
                <input
                  className="input mt-2"
                  id={`allowance-${t.value}`}
                  min={0}
                  onChange={(e) => setValues((v) => ({ ...v, [t.value]: e.target.value }))}
                  step="0.5"
                  type="number"
                  value={values[t.value]}
                />
              </label>
            ))}
          </div>
          <button className="primary-button mt-5" disabled={busy || saving} onClick={save}>{saving ? "Saving…" : "Save allowances"}</button>
        </>
      )}
    </section>
  );
}
