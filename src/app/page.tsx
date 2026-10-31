"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CheckInCount from "@/components/CheckInCount";
import { getUserProfile, hasUserProfile } from "@/lib/journal";

// Voice-first home (Oct 29 revamp, Bob's direction after using the app;
// cue card retired 2026-10-31 under the all-canned-out ruling): home
// leads with the SOS button and Talk with me for everyone — nothing is
// recorded up front, and nothing is gated. Everything else is a quiet
// secondary link. The full setup lives one tap away under "More
// options" and is optional.

const secondaryLinkClass =
  "font-medium text-[#2f5d3a] underline decoration-[#2f5d3a]/40 underline-offset-4 hover:decoration-[#2f5d3a]";

function SecondaryLinks() {
  return (
    <nav aria-label="More ways in" className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-base">
      <Link href="/check-in" className={secondaryLinkClass}>
        Check in
      </Link>
      <Link href="/talk" className={secondaryLinkClass}>
        Talk with me
      </Link>
      <Link href="/dashboard" className={secondaryLinkClass}>
        Your week
      </Link>
      <Link href="/shield" className={secondaryLinkClass}>
        More options
      </Link>
      <Link href="/support" className={secondaryLinkClass}>
        Get support
      </Link>
    </nav>
  );
}

export default function Home() {
  // The story intake's first-run state: no profile saved → home
  // surfaces "Start with your story". It never gates anything — SOS
  // and Talk with me work with zero intake, profile or not.
  const [hasProfile, setHasProfile] = useState(false);

  // Load the story-intake state (a saved name = the intake has run).
  useEffect(() => {
    let live = true;
    getUserProfile()
      .then((p) => {
        if (live) setHasProfile(hasUserProfile(p));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

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
          A pause button for a habit — in your own voice.
        </p>
      </header>

      <section className="mt-10 rounded-2xl border border-[#9a3b26]/25 bg-[#fdf1ec] p-6 text-center">
        <p className="font-semibold text-stone-900">Already in it?</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-stone-600">
          Skip the form. Go straight to the pause — it opens in your own voice, composed
          for this moment.
        </p>
        <Link
          href="/pause?sos=1"
          className="mt-4 inline-block w-full rounded-full bg-[#9a3b26] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#7f3120] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#9a3b26]/40"
        >
          I&apos;m in it — SOS
        </Link>
      </section>

      <section className="mt-6 rounded-2xl border border-[#2f5d3a]/25 bg-[#f2f6ef] p-6 text-center">
        <p className="font-semibold text-stone-900">Talk with me</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-stone-600">
          Your second brain asks, one question at a time. You answer out loud — it deals
          your own plan back to you, and can lead one of your moves out loud when the
          moment is ready.
        </p>
        <Link
          href="/talk"
          className="mt-4 inline-block w-full rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2f5d3a]/40"
        >
          Talk with me
        </Link>
      </section>

      {!hasProfile && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="font-semibold text-stone-900">New here? Start with your story.</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-stone-600">
            A couple of calm-time minutes of talking: your second brain asks a few questions, you
            answer out loud, and your story — in your words — is what it deals back to you in a
            hard moment. Skip it if you like — nothing is gated, and you can add to it any time.
          </p>
          <Link
            href="/story/interview"
            className="mt-4 inline-block rounded-full border border-[#2f5d3a] px-6 py-3 font-semibold text-[#2f5d3a] transition hover:bg-[#f2f6ef]"
          >
            Start with your story
          </Link>
          <p className="mt-3 text-sm text-stone-600">
            <Link href="/story" className="font-medium text-[#2f5d3a] underline underline-offset-4">
              or type it instead
            </Link>
          </p>
        </section>
      )}

      <SecondaryLinks />
      {hasProfile && (
        <div className="mt-3 text-center">
          <Link href="/story" className={secondaryLinkClass}>
            Your story
          </Link>
        </div>
      )}
      <div className="text-center">
        <CheckInCount />
      </div>

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
