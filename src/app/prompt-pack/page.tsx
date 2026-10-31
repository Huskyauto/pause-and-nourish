"use client";

import Link from "next/link";
import { SPINE_QUESTIONS, type QuestionId } from "@/lib/spine";
import { RecordingSlot } from "../shield/VoiceCueSetup";

// The prompt pack (Day 5): the five Talk It Through questions, recorded
// once at calm time in the user's own voice. When a clip exists, the
// conversation asks in their voice — zero generated voice, zero Fish
// credits. Every question is skippable; a missing clip just means the
// phone's voice asks that one. All recordings stay on this device.

const SLOT_NOTES: Record<QuestionId, string> = {
  q1: "The opener — where you are when the pull shows up.",
  q2: "Body hunger, the pull, or both. Both can be true.",
  q3: "The urge number, one to five — said out loud, it gets smaller.",
  q4: "What the moment is actually asking for underneath.",
  q5: "Only asked when the pull is strong — the ninety seconds, your reset line, or the long pause.",
};

export default function PromptPackPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/shield" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back to your words and swaps
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">
        The questions, in your voice
      </h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        Talk It Through asks five questions. Record any of them here, in your own voice, and
        that&apos;s the voice that asks next time. Skip any of them — the phone&apos;s voice
        covers the ones you leave. Nothing here leaves this device.
      </p>

      {SPINE_QUESTIONS.map((q, i) => (
        <section key={q.id} className="mt-10">
          <h2 className="text-xl font-semibold text-stone-900">
            Question {i + 1}
          </h2>
          <p className="mt-1 text-sm text-stone-600">{SLOT_NOTES[q.id]}</p>
          <RecordingSlot
            kind={q.id}
            initialScript={q.text}
            copy={{
              intro: "Read the question out loud, the way you'd want to hear it in a hard moment.",
              scriptLabel: "The question — edit the words first if you like.",
              recordLabel: "● Record this question",
              recordHint: "A few seconds — just the question, in a normal voice.",
              savedMessage: "Saved. This question now sounds like you.",
              savedFootnote:
                "Re-recording replaces it when you stop. It plays only inside Talk It Through.",
              deleteLabel: "Delete recording",
            }}
          />
        </section>
      ))}

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
