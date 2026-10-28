import Link from "next/link";
import CheckInCount from "@/components/CheckInCount";

const steps = [
  {
    number: "1",
    title: "Notice",
    time: "30 seconds",
    body: "Name what's happening right now — your mood, where you are, and how hungry your body actually is. No judgment, just information.",
    href: "/check-in",
    cta: "Start a check-in",
  },
  {
    number: "2",
    title: "Pause",
    time: "90 seconds",
    body: "Give the urge a little room to breathe. Slow breathing, a grounding exercise, or a short walk — urges often crest and pass like a wave.",
    href: "/pause",
    cta: "Open the pause toolkit",
  },
  {
    number: "3",
    title: "Choose",
    time: "your call",
    body: "Eat, swap for something else, or delay a few minutes. Every choice counts, and every choice is okay. Nothing here is scored or shamed.",
    href: "/dashboard",
    cta: "See your dashboard",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <header className="text-center">
        <p className="text-4xl" aria-hidden="true">
          🌿
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#2f5d3a]">
          Pause &amp; Nourish
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-stone-600">
          A pause button for a habit. When the urge to eat shows up, you
          don&apos;t need more willpower — you need ninety seconds and a
          kinder question.
        </p>
      </header>

      <div className="mt-8 text-center">
        <Link
          href="/check-in"
          className="inline-block rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2f5d3a]/40"
        >
          Start a check-in
        </Link>
        <p className="mt-2 text-sm text-stone-600">
          Takes about two minutes, start to finish.
        </p>
        <CheckInCount />
        <p className="mt-2 text-sm">
          <Link href="/shield" className="font-medium text-[#2f5d3a] underline decoration-[#2f5d3a]/40 underline-offset-4 hover:decoration-[#2f5d3a]">
            Your Shield Plan →
          </Link>
        </p>
      </div>

      <section
        aria-label="How Pause and Nourish works"
        className="mt-10 flex flex-col gap-4"
      >
        {steps.map((step) => (
          <article
            key={step.number}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 translate-y-1 items-center justify-center rounded-full bg-[#e7efe3] font-bold text-[#2f5d3a]"
              >
                {step.number}
              </span>
              <h2 className="text-xl font-semibold text-stone-900">
                {step.title}
                <span className="ml-2 text-sm font-normal text-stone-600">
                  {step.time}
                </span>
              </h2>
            </div>
            <p className="mt-2 leading-relaxed text-stone-600">{step.body}</p>
            <Link
              href={step.href}
              className="mt-3 inline-block font-medium text-[#2f5d3a] underline decoration-[#2f5d3a]/40 underline-offset-4 hover:decoration-[#2f5d3a]"
            >
              {step.cta} →
            </Link>
          </article>
        ))}
      </section>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
        <p className="mx-auto mt-2 max-w-md leading-relaxed">
          Pause &amp; Nourish is a personal habit tool built from one
          person&apos;s experience. It does not diagnose, treat, or
          prescribe. If eating ever feels out of control or distressing,
          please reach out to a clinician you trust.
        </p>
      </footer>
    </main>
  );
}
