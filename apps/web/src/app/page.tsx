import Link from "next/link";

type Feature = {
  title: string;
  detail: string;
  icon: React.ReactNode;
};

const features: Feature[] = [
  {
    title: "Employees",
    detail: "One source of truth for people, departments, roles, and status.",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    title: "Leave",
    detail: "Requests, balances, and approvals that never get lost in chat.",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01" />
      </>
    ),
  },
  {
    title: "Smart shifts",
    detail: "Coverage at a glance with schedules managers can publish fast.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    title: "Moshomo AI",
    detail: "A workforce copilot that answers from your own permitted data.",
    icon: (
      <>
        <path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3Z" />
        <path d="m5 15-.7 2.3L2 18l2.3.7L5 21l.7-2.3L8 18l-2.3-.7L5 15Z" />
      </>
    ),
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-7 sm:px-8">
        <nav className="flex items-center justify-between">
          <Link className="flex items-center gap-2.5" href="/">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-900 text-sm font-black text-brand-100">
              M
            </span>
            <span className="text-base font-semibold tracking-tight">Moshomo</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm font-medium text-ink-muted sm:inline">
              Workforce OS
            </span>
            <Link className="primary-button px-5 py-2.5" href="/auth">
              Get started
            </Link>
          </div>
        </nav>

        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="animate-rise">
            <span className="badge">
              <span className="size-1.5 rounded-full bg-brand-500" />
              AI-native workforce operations
            </span>
            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
              Run your people,{" "}
              <span className="bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent">
                leave, and shifts
              </span>{" "}
              from one calm workspace.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-soft">
              Moshomo brings employee management, leave approvals, and smart
              scheduling together — with an assistant that understands your
              workforce context and respects every permission.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link className="primary-button px-7 py-3.5 text-[15px]" href="/auth">
                Start your company
                <span aria-hidden>→</span>
              </Link>
              <Link className="secondary-button px-7 py-3.5 text-[15px]" href="/auth">
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-sm text-ink-muted">
              Built for admins, managers, and employees — on web and mobile.
            </p>
          </div>

          <div className="animate-rise [animation-delay:120ms]">
            <div className="hero-panel">
              <span className="hero-pill">Today at Moshomo</span>
              <p className="mt-5 text-2xl font-semibold leading-snug text-white">
                Your team is ready for the day.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { value: "24", label: "Employees" },
                  { value: "0", label: "On leave" },
                  { value: "3", label: "Open shifts" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl bg-white/[0.07] p-4"
                  >
                    <p className="text-2xl font-semibold text-white">{stat.value}</p>
                    <p className="mt-1 text-xs text-emerald-100/70">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/[0.07] p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-300/20 text-brand-300">
                  <FeatureIcon>
                    <path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3Z" />
                  </FeatureIcon>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Ask Moshomo AI</p>
                  <p className="text-xs text-emerald-100/70">
                    “Who is absent today?” · “Show pending leave.”
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              {features.map((feature) => (
                <div key={feature.title} className="surface-card p-5">
                  <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <FeatureIcon>{feature.icon}</FeatureIcon>
                  </span>
                  <p className="mt-4 text-sm font-semibold">{feature.title}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">{feature.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 pt-6 text-sm text-ink-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Moshomo</span>
          <span>Employees · Leave · Smart shifts · Moshomo AI</span>
        </footer>
      </div>
    </main>
  );
}

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}
