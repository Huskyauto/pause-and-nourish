import Link from "next/link";

// About this app — please read (Day 8, at Bob's direction): every
// disclosure the app makes, gathered on one page instead of spread
// across footers, the support page, and the README. Plain words,
// nothing buried: the AI disclosure (New York GBL §1700), the crisis
// signpost, the not-therapy posture (Illinois WOPR Act), the
// on-device data promise, and the voice disclosure.

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">
        About this app — please read
      </h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        Pause &amp; Nourish is a small habit tool: it helps you notice an urge to eat, pause
        for ninety seconds, and choose what happens next — using your own words, your own
        plan, and your own voice. Everything it is, and everything it is not, is on this page.
      </p>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">You are talking with an AI</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Your second brain is an <strong className="text-stone-900">AI companion</strong> —
          not a person. It is a Meta AI model (Muse Spark) that reflects your own story,
          plan, and words back to you. It will never claim to be human, and if it ever comes
          up, it will say plainly that it is an AI. We state this up front, here and on the
          conversation screens themselves — it is also what New York&apos;s AI companion law
          (General Business Law §1700) requires, and we would say it anyway.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">
          If a moment is bigger than a pause
        </h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          This app does not guess how you feel, and it never tries to detect your emotional
          state. But if you say — in your own words, plainly — that you might harm yourself,
          the conversation stops being about eating. It answers with one fixed message
          pointing you to real human help: call or text{" "}
          <strong className="text-stone-900">988</strong>, the Suicide and Crisis Lifeline,
          any time, day or night. The{" "}
          <Link href="/support" className="font-medium text-[#2f5d3a] underline underline-offset-4">
            Get support page
          </Link>{" "}
          carries that number and an eating-disorders helpline, and it is always one tap
          away.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">This app is not therapy</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Pause &amp; Nourish is a self-help and habit tool. It is not therapy, counseling,
          or medical care, and it does not diagnose, treat, or prescribe anything. It gives
          no treatment recommendations and no outside advice — it works only with the plan
          and words you gave it. That line is deliberate: Illinois law (the Wellness and
          Oversight for Psychological Resources Act) reserves therapy to licensed
          professionals, and this app is built to stay on the self-help side of it. If
          eating ever feels out of control or distressing, please reach out to a clinician
          you trust.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">
          Your journal lives on this phone — here is what travels
        </h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Your journal, your plan, your patterns, and your voice recordings are stored on
          this phone. There is no account, and no copy of your diary sits on a server
          waiting for you to log in. To work at all, some things do travel when you use
          them:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 leading-relaxed text-stone-600">
          <li>
            When you talk, the words of the conversation — plus the plan and story
            details a reply needs — go to Meta&apos;s AI service, which composes the
            reply. Your spoken answers also go there to be turned into words. What
            happens on Meta&apos;s side is governed by Meta&apos;s terms for its
            developer services.
          </li>
          <li>
            The replies the app speaks aloud are spoken by your device&apos;s own
            built-in voice, right on the device — no text is sent anywhere for
            speech.
          </li>
          <li>
            If you ask for the weekly review, it is composed from counts, pattern
            summaries, and up to five of the learnings you saved, in your own words —
            those learnings travel with the request.
          </li>
          <li>
            If you pair the optional companion app, pairing digests (scrambled codes,
            never the codes themselves) and small event notes — &ldquo;cue
            played&rdquo;, &ldquo;session armed&rdquo; — pass through a relay store so
            the two devices can find each other. Your journal never does.
          </li>
          <li>
            During the hackathon, this app runs on free Meta developer credits; the
            terms for those services may allow content sent to the API to be used to
            improve Meta&apos;s products.
          </li>
        </ul>
        <p className="mt-2 leading-relaxed text-stone-600">
          If you save a place, its coordinates never leave this phone; only its name can
          be mentioned. You can erase everything on this device, any time, from the
          Delete everything section on the Statistics page.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">About the voice you hear</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Every line the second brain speaks is composed live, in the moment, by the AI —
          nothing conversational is a recording played by rule. The lines are spoken aloud
          by your device&apos;s own built-in voice (the operating system&apos;s
          text-to-speech — not an AI model), rendered entirely on this device. When you
          set the app up, you choose a neutral voice — a woman&apos;s voice or a
          man&apos;s voice — and when your device offers a matching voice, that one
          speaks. You can also record your own lines in your own voice. One deliberate
          exception: a single short recorded line the founder made for the guided reset
          exercise plays inside that exercise, as part of the exercise itself.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">Who made this</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Pause &amp; Nourish was built by Bob Washburn of Gurnee, Illinois, from his own
          weight-loss journey — 504 pounds down to the 260s — and the exact moment this app
          exists for: the ninety seconds when a decision gets made. It was built during the
          Meta Global AI Developer Hackathon, October 26 – November 4, 2026.
        </p>
      </section>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
