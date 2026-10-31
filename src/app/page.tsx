"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CheckInCount from "@/components/CheckInCount";
import { getCue, getUserProfile, hasUserProfile } from "@/lib/journal";
import { RecordingSlot, SCRIPT_A } from "./shield/VoiceCueSetup";

// Voice-first home (Oct 29 revamp, Bob's direction after using the app):
// no cue saved → the whole page is one button, "Add your voice", with the
// words to say shown as a read-along example. Cue saved → home leads with
// the SOS button; everything else is a quiet secondary link. The full
// setup lives one tap away under "More options" and is optional.

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
  // First paint assumes no cue (the first-run state); the recorder slot
  // reports the real stored state as soon as it loads, and on every
  // save/delete after that.
  const [hasCue, setHasCue] = useState(false);
  // The story intake's first-run state: no profile saved → home
  // surfaces "Start with your story". It never gates anything — SOS
  // and Talk with me work with zero intake, profile or not.
  const [hasProfile, setHasProfile] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [editingVoice, setEditingVoice] = useState(false);
  const [cueUrl, setCueUrl] = useState<string | null>(null);
  const [playNote, setPlayNote] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function handleSavedChange(has: boolean, reason: "load" | "save" | "delete") {
    if (reason === "load") {
      // A slot reporting what it found in storage — layout follows, but
      // nothing was "just saved" and an open editor stays open.
      setHasCue(has);
      return;
    }
    if (reason === "save") {
      setHasCue(true);
      setJustSaved(true);
      setEditingVoice(false);
      return;
    }
    // delete
    setHasCue(false);
    setJustSaved(false);
    setEditingVoice(false);
  }

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

  // Load the saved cue for the "Play my voice" button.
  useEffect(() => {
    if (!hasCue) {
      setCueUrl(null);
      return;
    }
    let live = true;
    let url: string | null = null;
    getCue()
      .then((cue) => {
        if (live && cue) {
          url = URL.createObjectURL(cue.blob);
          setCueUrl(url);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasCue, editingVoice]);

  function playCue() {
    if (!cueUrl) return;
    if (!audioRef.current || audioRef.current.src !== cueUrl) {
      audioRef.current = new Audio(cueUrl);
    }
    audioRef.current.currentTime = 0;
    // Honest playback: if play() is rejected, say so in words instead
    // of letting the tap land in silence.
    setPlayNote("");
    audioRef.current.play().catch(() => {
      setPlayNote(
        "Your voice didn't play just now — it's saved on this phone. Check the volume and tap play again.",
      );
    });
  }

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

      {!hasCue && (
        <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-stone-900">Start with your voice.</h2>
          <RecordingSlot
            kind="cue"
            variant="simple"
            initialScript={SCRIPT_A}
            onSavedChange={handleSavedChange}
            copy={{
              intro:
                "Record one short line — your why, in your own words. When a hard moment hits, you tap one button and hear yourself say it. It never leaves this phone.",
              scriptLabel: "",
              recordLabel: "Add your voice",
              recordHint: "Tap, read the words out loud (or say your own), tap stop. About 10 seconds.",
              savedMessage: "That's your voice. It's saved on this phone.",
              savedFootnote: "This is the voice that plays when you tap “I'm in it.”",
              deleteLabel: "Delete voice",
            }}
          />
        </section>
      )}

      {hasCue && (
        <>
          {justSaved && (
            <p className="mt-8 rounded-2xl border border-[#2f5d3a]/30 bg-[#e7efe3] px-5 py-4 text-center font-medium text-stone-900">
              ✓ That&apos;s your voice. It&apos;s saved on this phone.
            </p>
          )}

          <section className="mt-10 rounded-2xl border border-[#9a3b26]/25 bg-[#fdf1ec] p-6 text-center">
            <p className="font-semibold text-stone-900">Already in it?</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-stone-600">
              Skip the form. Go straight to the pause — your own voice first, questions after.
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

          <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-stone-900">Your voice</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={playCue}
                  disabled={!cueUrl}
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-[#2f5d3a] hover:text-[#2f5d3a] disabled:opacity-40"
                >
                  ▶ Play my voice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingVoice((v) => !v);
                    setJustSaved(false);
                  }}
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-[#2f5d3a] hover:text-[#2f5d3a]"
                >
                  {editingVoice ? "Close" : "Re-record"}
                </button>
              </div>
            </div>
            {playNote && <p className="mt-3 text-sm text-stone-600">{playNote}</p>}
            {editingVoice && (
              <div className="mt-2 border-t border-stone-100 pt-2">
                <RecordingSlot
                  kind="cue"
                  variant="simple"
                  initialScript={SCRIPT_A}
                  onSavedChange={handleSavedChange}
                  copy={{
                    intro: "Record it again whenever you like — the new one replaces the old when you stop.",
                    scriptLabel: "",
                    recordLabel: "Add your voice",
                    recordHint: "Tap, read the words out loud (or say your own), tap stop. About 10 seconds.",
                    savedMessage: "That's your voice. It's saved on this phone.",
                    savedFootnote: "This is the voice that plays when you tap “I'm in it.”",
                    deleteLabel: "Delete voice",
                  }}
                />
              </div>
            )}
          </section>
        </>
      )}

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
