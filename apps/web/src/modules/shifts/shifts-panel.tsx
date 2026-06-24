"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Employee } from "@/modules/employees/employees-panel";
import type { Role } from "@/lib/apps";
import { moshomoApi } from "@/lib/api";

type Template = { id: string; name: string; start_time: string; end_time: string; color: string | null };
type Assignment = {
  id: string;
  template_id: string;
  employee_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "cancelled";
  notes: string | null;
  employee?: { first_name?: string | null; last_name?: string | null } | null;
  template?: { name?: string | null } | null;
};
type AvailabilityWindow = { weekday: number; start_time: string; end_time: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hm = (t: string) => t.slice(0, 5);

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function mondayOf(d: Date): Date {
  const day = d.getDay();
  return addDays(d, day === 0 ? -6 : 1 - day);
}
function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ShiftsPanel({
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
  const canManage = role === "manager" || role === "admin";
  const myEmployeeId = useMemo(
    () => employees.find((e) => e.profile_id === session.user.id)?.id ?? null,
    [employees, session.user.id],
  );

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [templates, setTemplates] = useState<Template[]>([]);
  const [weekShifts, setWeekShifts] = useState<Assignment[]>([]);
  const [myShifts, setMyShifts] = useState<Assignment[]>([]);
  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [notice, setNotice] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i))), [weekStart]);

  const load = useCallback(async () => {
    try {
      const today = isoDate(new Date());
      const [tmpls, mine, avail] = await Promise.all([
        moshomoApi<Template[]>("/workforce/shifts/templates", { session, companyId }),
        moshomoApi<Assignment[]>(`/workforce/shifts/assignments?mine=true&from=${today}&to=${isoDate(addDays(new Date(), 14))}`, { session, companyId }),
        moshomoApi<AvailabilityWindow[]>("/workforce/shifts/availability", { session, companyId }),
      ]);
      setTemplates(tmpls);
      setMyShifts(mine.filter((s) => s.status === "scheduled"));
      setAvailability(avail);
      if (canManage) {
        const from = isoDate(weekStart);
        const to = isoDate(addDays(weekStart, 6));
        setWeekShifts(await moshomoApi<Assignment[]>(`/workforce/shifts/assignments?from=${from}&to=${to}`, { session, companyId }));
      }
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, [session, companyId, canManage, weekStart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state set after async load
    void load();
  }, [load]);

  async function act(run: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await run();
      setNotice(message);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const shiftsByDay = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    for (const s of weekShifts) (map[s.shift_date] ??= []).push(s);
    return map;
  }, [weekShifts]);

  return (
    <div className="mx-auto max-w-5xl animate-rise">
      <div className="mb-6">
        <p className="eyebrow">Scheduling</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Shifts</h1>
        <p className="mt-2 text-ink-muted">Plan the schedule, fill open shifts, and set your availability.</p>
      </div>

      {unavailable && (
        <p className="notice mb-6 px-4 py-3 text-sm font-medium">
          Shifts is being set up. It becomes available once the shifts migration is applied.
        </p>
      )}
      {notice && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-sm font-medium text-ink-soft">
          <span>{notice}</span>
          <button className="text-ink-muted hover:text-ink" onClick={() => setNotice(undefined)}>✕</button>
        </div>
      )}

      {canManage && (
        <>
          <section className="premium-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Week schedule</h2>
              <div className="flex items-center gap-2">
                <button className="secondary-button px-3 py-1.5 text-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹ Prev</button>
                <span className="text-sm font-medium text-ink-soft">{dayLabel(weekDays[0])} – {dayLabel(weekDays[6])}</span>
                <button className="secondary-button px-3 py-1.5 text-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next ›</button>
              </div>
            </div>

            <AddShiftForm
              busy={busy}
              defaultDate={weekDays[0]}
              employees={employees}
              onSubmit={(body) => act(() => moshomoApi("/workforce/shifts/assignments", { method: "POST", session, companyId, body }), "Shift added.")}
              templates={templates}
            />

            <div className="mt-5 grid gap-3">
              {weekDays.map((day) => (
                <div className="rounded-2xl bg-surface-muted p-4" key={day}>
                  <p className="text-sm font-semibold">{dayLabel(day)}</p>
                  {(shiftsByDay[day] ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-ink-faint">No shifts</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {(shiftsByDay[day] ?? []).map((s) => (
                        <li className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ${s.status === "cancelled" ? "bg-stone-50 opacity-60" : s.employee_id ? "bg-surface" : "bg-amber-50"}`} key={s.id}>
                          <div className="text-sm">
                            <span className="font-semibold">{s.template?.name ?? "Shift"}</span>
                            <span className="text-ink-muted"> · {hm(s.start_time)}–{hm(s.end_time)}</span>
                            <span className={s.employee_id ? "text-ink-soft" : "font-semibold text-amber-700"}> · {s.employee_id ? `${s.employee?.first_name ?? ""} ${s.employee?.last_name ?? ""}`.trim() : "Open"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {!s.employee_id && s.status === "scheduled" && (
                              <select className="input max-w-[160px] py-1 text-xs" disabled={busy} onChange={(e) => e.target.value && act(() => moshomoApi(`/workforce/shifts/assignments/${s.id}`, { method: "PATCH", session, companyId, body: { employee_id: e.target.value } }), "Shift assigned.")} value="">
                                <option value="">Assign…</option>
                                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
                              </select>
                            )}
                            <button className="text-xs font-semibold text-rose-600" disabled={busy} onClick={() => act(() => moshomoApi(`/workforce/shifts/assignments/${s.id}`, { method: "DELETE", session, companyId }), "Shift removed.")}>Delete</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <TemplatesSection
            busy={busy}
            onCreate={(body) => act(() => moshomoApi("/workforce/shifts/templates", { method: "POST", session, companyId, body }), "Template created.")}
            onDelete={(id) => act(() => moshomoApi(`/workforce/shifts/templates/${id}`, { method: "DELETE", session, companyId }), "Template removed.")}
            templates={templates}
          />
        </>
      )}

      <section className="premium-card mt-6">
        <h2 className="text-lg font-semibold">My shifts</h2>
        <p className="mt-1 text-sm text-ink-muted">Your scheduled shifts for the next two weeks.</p>
        {myShifts.length === 0 ? (
          <div className="empty-state mt-5 px-5 py-8">
            <p className="text-sm font-semibold text-ink-soft">No upcoming shifts</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-muted">Published shifts assigned to you will appear here.</p>
          </div>
        ) : (
          <ul className="mt-5">
            {myShifts.map((s) => (
              <li className="flex items-center justify-between gap-3 py-3" key={s.id}>
                <div>
                  <p className="text-sm font-semibold">{s.template?.name ?? "Shift"} · {hm(s.start_time)}–{hm(s.end_time)}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{dayLabel(s.shift_date)}{s.notes ? ` · ${s.notes}` : ""}</p>
                </div>
                <span className="badge bg-brand-100 text-brand-700">scheduled</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {myEmployeeId && (
        <AvailabilityEditor
          busy={busy}
          initial={availability}
          onSave={(windows) => act(() => moshomoApi(`/workforce/shifts/availability/${myEmployeeId}`, { method: "PUT", session, companyId, body: { windows } }), "Availability saved.")}
        />
      )}
    </div>
  );
}

function AddShiftForm({
  busy,
  defaultDate,
  employees,
  onSubmit,
  templates,
}: {
  busy: boolean;
  defaultDate: string;
  employees: Employee[];
  onSubmit: (body: Record<string, unknown>) => void;
  templates: Template[];
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      template_id: form.get("template_id"),
      shift_date: form.get("shift_date"),
      employee_id: form.get("employee_id") || null,
      notes: form.get("notes") || null,
    });
    (event.target as HTMLFormElement).reset();
  }
  if (templates.length === 0) {
    return <p className="mt-4 rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">Create a shift template below before scheduling shifts.</p>;
  }
  return (
    <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={submit}>
      <select className="input" name="template_id">{templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({hm(t.start_time)}–{hm(t.end_time)})</option>)}</select>
      <input className="input" defaultValue={defaultDate} name="shift_date" required type="date" />
      <select className="input" name="employee_id"><option value="">— Open shift —</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select>
      <input className="input" name="notes" placeholder="Notes (optional)" />
      <button className="primary-button" disabled={busy}>Add shift</button>
    </form>
  );
}

function TemplatesSection({
  busy,
  onCreate,
  onDelete,
  templates,
}: {
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  templates: Template[];
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onCreate({ name: form.get("name"), start_time: form.get("start_time"), end_time: form.get("end_time") });
    (event.target as HTMLFormElement).reset();
  }
  return (
    <section className="premium-card mt-6">
      <h2 className="text-lg font-semibold">Shift templates</h2>
      <p className="mt-1 text-sm text-ink-muted">Reusable patterns you can schedule onto any day.</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-4" onSubmit={submit}>
        <input className="input" name="name" placeholder="e.g. Morning" required />
        <input className="input" name="start_time" required type="time" />
        <input className="input" name="end_time" required type="time" />
        <button className="dark-button" disabled={busy}>Add template</button>
      </form>
      {templates.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {templates.map((t) => (
            <li className="flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5 text-sm" key={t.id}>
              <span className="font-medium">{t.name}</span>
              <span className="text-ink-muted">{hm(t.start_time)}–{hm(t.end_time)}</span>
              <button aria-label={`Delete ${t.name}`} className="text-ink-faint hover:text-rose-600" disabled={busy} onClick={() => onDelete(t.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AvailabilityEditor({
  busy,
  initial,
  onSave,
}: {
  busy: boolean;
  initial: AvailabilityWindow[];
  onSave: (windows: AvailabilityWindow[]) => void;
}) {
  const [windows, setWindows] = useState<AvailabilityWindow[]>(initial);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local editor with loaded data
    setWindows(initial);
  }, [initial]);

  return (
    <section className="premium-card mt-6">
      <h2 className="text-lg font-semibold">My availability</h2>
      <p className="mt-1 text-sm text-ink-muted">Weekly windows your manager can schedule you within.</p>
      <ul className="mt-5 space-y-2">
        {windows.map((w, i) => (
          <li className="flex flex-wrap items-center gap-2" key={i}>
            <select className="input max-w-[140px]" onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))} value={w.weekday}>
              {WEEKDAYS.map((label, idx) => <option key={idx} value={idx}>{label}</option>)}
            </select>
            <input className="input max-w-[130px]" onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))} type="time" value={hm(w.start_time)} />
            <span className="text-ink-faint">to</span>
            <input className="input max-w-[130px]" onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))} type="time" value={hm(w.end_time)} />
            <button className="text-sm font-semibold text-rose-600" onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}>Remove</button>
          </li>
        ))}
        {windows.length === 0 && <li className="text-sm text-ink-muted">No availability set.</li>}
      </ul>
      <div className="mt-4 flex gap-2">
        <button className="secondary-button" onClick={() => setWindows((ws) => [...ws, { weekday: 1, start_time: "09:00", end_time: "17:00" }])}>Add window</button>
        <button className="primary-button" disabled={busy} onClick={() => onSave(windows)}>Save availability</button>
      </div>
    </section>
  );
}
