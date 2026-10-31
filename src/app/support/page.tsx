import Link from "next/link";

// Get Support (Day 5): plain, static, always reachable. If a moment is
// bigger than a pause, real people are on the other end of these
// numbers. No forms, no accounts — just the numbers, in the open.

export default function SupportPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">Get support</h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        Pause &amp; Nourish is a small habit tool. Some moments are bigger than a pause — and
        for those, talking to a person beats any app. These lines are free and confidential.
      </p>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">988 Suicide and Crisis Lifeline</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Call or text <strong className="text-stone-900">988</strong> any time, day or night,
          anywhere in the US. If you ever feel unsafe, or like you might act on harming
          yourself, this is the number.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="tel:988"
            className="rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30]"
          >
            Call 988
          </a>
          <a
            href="sms:988"
            className="rounded-full border border-stone-300 bg-white px-5 py-3 font-semibold text-stone-800 transition hover:border-[#2f5d3a]"
          >
            Text 988
          </a>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">
          ANAD — National Association of Anorexia Nervosa and Associated Disorders
        </h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          A free helpline for anyone whose eating feels out of control or distressing, staffed
          by people who understand eating struggles firsthand.{" "}
          <strong className="text-stone-900">1-888-375-7767</strong>, Monday–Friday, 9 AM–9 PM
          Central.
        </p>
        <div className="mt-4">
          <a
            href="tel:+18883757767"
            className="inline-block rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30]"
          >
            Call 1-888-375-7767
          </a>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-stone-900">And the people already in your corner</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          A clinician you trust, a friend, a family member — reaching out is not a last resort.
          It&apos;s a normal move, and it&apos;s always allowed, on any day, for any size of
          moment.
        </p>
      </section>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
