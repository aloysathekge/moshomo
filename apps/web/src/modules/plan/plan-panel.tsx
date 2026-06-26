"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { moshomoApi } from "@/lib/api";

type PlanApp = {
  key: string;
  name: string;
  description: string;
  price_cents: number;
  unit: string;
  enabled: boolean;
  monthly_cents: number;
};
type Plan = {
  currency: string;
  active_employees: number;
  monthly_total_cents: number;
  apps: PlanApp[];
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(
    cents / 100,
  );

export function PlanPanel({
  companyId,
  onChanged,
  session,
}: {
  companyId: string;
  onChanged: () => void | Promise<void>;
  session: Session;
}) {
  const [plan, setPlan] = useState<Plan>();
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setPlan(await moshomoApi<Plan>(`/companies/${companyId}/plan`, { session, companyId }));
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, [companyId, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state set after async load
    void load();
  }, [load]);

  async function toggle(key: string, enabled: boolean) {
    setRowBusy((prev) => ({ ...prev, [key]: true }));
    try {
      await moshomoApi(`/companies/${companyId}/apps/${key}`, {
        method: "PATCH",
        session,
        companyId,
        body: { enabled },
      });
      setNotice(enabled ? "App added to your plan." : "App removed from your plan.");
      await load();
      await onChanged(); // refresh the sidebar/nav so the change shows immediately
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update your plan.");
    } finally {
      setRowBusy((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl animate-rise">
      <div className="mb-6">
        <p className="eyebrow">Billing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Apps &amp; plan</h1>
        <p className="mt-2 text-ink-muted">Choose the apps your organization uses. You only pay for what you switch on.</p>
      </div>

      {unavailable && (
        <p className="notice mb-6 px-4 py-3 text-sm font-medium">
          Plan details aren&rsquo;t available yet. Apply the app-entitlements migration to enable this.
        </p>
      )}
      {notice && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-sm font-medium text-ink-soft">
          <span>{notice}</span>
          <button aria-label="Dismiss" className="text-ink-muted hover:text-ink" onClick={() => setNotice(undefined)}>✕</button>
        </div>
      )}

      {!plan && !unavailable && (
        <div className="premium-card text-sm text-ink-muted">Loading your plan…</div>
      )}

      {plan && (
        <>
          <div className="premium-card mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-ink-muted">
                Estimated monthly total · {plan.active_employees} active employee{plan.active_employees === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">
                {money(plan.monthly_total_cents)}
                <span className="ml-1 text-sm font-normal text-ink-faint">/mo</span>
              </p>
            </div>
            <span className="badge">Billing coming soon</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {plan.apps.map((app) => {
              const busy = Boolean(rowBusy[app.key]);
              return (
                <div className="premium-card flex flex-col gap-3" key={app.key}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold">{app.name}</h3>
                      <p className="mt-1 text-sm leading-6 text-ink-muted">{app.description}</p>
                    </div>
                    <button
                      aria-checked={app.enabled}
                      aria-label={`${app.enabled ? "Disable" : "Enable"} ${app.name}`}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                        app.enabled ? "bg-ink" : "bg-surface-sunken"
                      } ${busy ? "opacity-50" : ""}`}
                      disabled={busy}
                      onClick={() => toggle(app.key, !app.enabled)}
                      role="switch"
                      type="button"
                    >
                      <span
                        className={`inline-block size-5 rounded-full bg-white shadow-sm transition ${
                          app.enabled ? "translate-x-[1.375rem]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                    <span className="text-sm text-ink-soft">
                      {money(app.price_cents)} <span className="text-ink-faint">/ employee / mo</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      {app.enabled ? `${money(app.monthly_cents)} /mo` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-ink-faint">
            Prices are per active employee per month. Disabling an app keeps its data — re-enable any time.
          </p>
        </>
      )}
    </div>
  );
}
