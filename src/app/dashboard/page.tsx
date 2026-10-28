import Link from "next/link";

const sampleStats = [
  { label: "Check-ins this week", value: "—" },
  { label: "Pauses taken", value: "—" },
  { label: "Most common moment", value: "—" },
  { label: "Choices after pausing", value: "—" },
];

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">Your week, gently</h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        Patterns, not grades. This page fills in from the check-ins saved on
        your device — nothing leaves your phone.
      </p>

      <p className="mt-6 inline-block w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 uppercase">
        Sample layout — your data arrives with the Day 2–4 builds
      </p>

      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Weekly summary (sample)">
        {sampleStats.map((s) => (
          <article key={s.label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-3xl font-bold text-[#2f5d3a]">{s.value}</p>
            <p className="mt-1 text-sm text-stone-600">{s.label}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-stone-900">Your companion</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Once you&apos;ve checked in a few times, a companion powered by
          Meta&apos;s models will reflect your own patterns back to you —
          in your words, not advice. It arrives with the Day 5 build.
        </p>
      </section>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
