"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { moshomoApi } from "@/lib/api";
import type { Employee } from "@/modules/employees/employees-panel";
import type { Role } from "@/lib/apps";
import { HomeHero } from "@/modules/home/home-hero";

type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string | null;
  employee?: { first_name?: string | null; last_name?: string | null } | null;
};
type Balance = { leave_type: string; available: number };
type ShiftAssignment = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: string;
  template?: { name?: string | null } | null;
};

function iso(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export function HomePanel({
  companyId,
  enabledApps,
  employees,
  firstName,
  onAsk,
  onNavigate,
  role,
  session,
  setupComplete,
}: {
  companyId: string;
  enabledApps?: ReadonlySet<string>;
  employees: Employee[];
  firstName?: string;
  onAsk: (question: string) => void;
  onNavigate: (section: string) => void;
  role: Role;
  session: Session;
  setupComplete: boolean;
}) {
  const canApprove = role === "admin" || role === "manager";
  const hasLeave = enabledApps ? enabledApps.has("leave") : true;
  const hasShifts = enabledApps ? enabledApps.has("shifts") : true;

  const [approvals, setApprovals] = useState<LeaveRequest[]>([]);
  const [onLeaveToday, setOnLeaveToday] = useState(0);
  const [openShifts, setOpenShifts] = useState<ShiftAssignment[]>([]);
  const [myShifts, setMyShifts] = useState<ShiftAssignment[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [myPending, setMyPending] = useState(0);

  const load = useCallback(async () => {
    const today = iso();
    if (hasLeave) {
      try {
        const bal = await moshomoApi<{ employee_id: string | null; balances: Balance[] }>(
          "/workforce/leave/balances",
          { session, companyId },
        );
        setBalances(bal.balances);
        if (canApprove) {
          const all = await moshomoApi<LeaveRequest[]>("/workforce/leave/requests", { session, companyId });
          setApprovals(all.filter((r) => r.status === "pending" && r.employee_id !== bal.employee_id));
          setOnLeaveToday(all.filter((r) => r.status === "approved" && r.start_date <= today && today <= r.end_date).length);
        } else {
          const mine = await moshomoApi<LeaveRequest[]>("/workforce/leave/requests?mine=true", { session, companyId });
          setMyPending(mine.filter((r) => r.status === "pending").length);
        }
      } catch {
        /* leave unavailable — widgets just stay empty */
      }
    }
    if (hasShifts) {
      try {
        if (canApprove) {
          setOpenShifts(
            await moshomoApi<ShiftAssignment[]>(
              `/workforce/shifts/assignments?open=true&from=${today}&to=${iso(14)}`,
              { session, companyId },
            ),
          );
        } else {
          setMyShifts(
            await moshomoApi<ShiftAssignment[]>(
              `/workforce/shifts/assignments?mine=true&from=${today}&to=${iso(14)}`,
              { session, companyId },
            ),
          );
        }
      } catch {
        /* shifts unavailable */
      }
    }
  }, [companyId, session, canApprove, hasLeave, hasShifts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state set after async load
    void load();
  }, [load]);

  const annual = balances.find((b) => b.leave_type === "annual")?.available;
  const nextShift = [...myShifts]
    .filter((s) => s.status === "scheduled" && s.shift_date >= iso())
    .sort((a, b) => (a.shift_date < b.shift_date ? -1 : a.shift_date > b.shift_date ? 1 : a.start_time < b.start_time ? -1 : 1))[0];

  // Compact widget strip — sits ON TOP of the hero so the whole home fits one screen.
  const strip = canApprove ? (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Team" onClick={() => onNavigate("employees")} value={employees.length} />
      {hasLeave && <Tile label="On leave today" value={onLeaveToday} />}
      {hasLeave && <Tile attention={approvals.length > 0} label="Approvals" onClick={() => onNavigate("leave")} value={approvals.length} />}
      {hasShifts && <Tile attention={openShifts.length > 0} label="Open shifts" onClick={() => onNavigate("shifts")} value={openShifts.length} />}
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {hasShifts && <Tile label="Next shift" onClick={() => onNavigate("shifts")} value={nextShift ? fmtDate(nextShift.shift_date) : "—"} />}
      {hasLeave && <Tile label="Annual leave" onClick={() => onNavigate("leave")} value={annual ?? "—"} />}
      {hasLeave && <Tile attention={myPending > 0} label="Pending" onClick={() => onNavigate("leave")} value={myPending} />}
    </div>
  );

  const showStrip = canApprove ? hasLeave || hasShifts : (hasShifts && nextShift !== undefined) || hasLeave;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9.5rem)] max-w-3xl flex-col justify-center gap-6 py-2 animate-rise">
      {showStrip && strip}

      <HomeHero firstName={firstName} onAsk={onAsk} role={role} />

      {role === "admin" && !setupComplete && (
        <button
          className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl bg-surface-muted px-4 py-2.5 text-left text-sm transition hover:bg-surface-sunken"
          onClick={() => onNavigate("settings")}
          type="button"
        >
          <span className="font-medium text-ink-soft">Finish setting up your workspace</span>
          <span aria-hidden className="text-ink-faint">→</span>
        </button>
      )}
    </div>
  );
}

function Tile({
  attention,
  label,
  onClick,
  value,
}: {
  attention?: boolean;
  label: string;
  onClick?: () => void;
  value: string | number;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</p>
        {attention && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />}
      </div>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums text-ink">{value}</p>
    </>
  );
  return onClick ? (
    <button className="metric-card text-left transition hover:-translate-y-0.5" onClick={onClick} type="button">
      {inner}
    </button>
  ) : (
    <div className="metric-card">{inner}</div>
  );
}
