import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#171717]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-6 py-8">
        <nav className="flex items-center justify-between text-sm font-medium">
          <span>Moshomo</span>
          <div className="flex items-center gap-4">
            <span className="text-[#667085]">Workforce OS</span>
            <Link className="rounded-full bg-[#171717] px-4 py-2 text-white" href="/auth">Get started</Link>
          </div>
        </nav>

        <div className="grid gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#2f6f5e]">
              AI-native workforce operations
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-tight sm:text-6xl">
              Manage people, leave, shifts, and workforce decisions with Moshomo AI.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#475467]">
              Moshomo starts with employee management, leave approvals, smart
              scheduling, and an assistant that understands workforce context.
            </p>
          </div>

          <div className="grid gap-3 text-sm">
            {["Employees", "Leave", "Smart shifts", "Moshomo AI"].map(
              (item) => (
                <div
                  className="border border-[#d7d8ce] bg-white px-4 py-3"
                  key={item}
                >
                  {item}
                </div>
              ),
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
