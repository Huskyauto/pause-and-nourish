"use client";

import { useState } from "react";
import Link from "next/link";

const moods = ["Calm", "Stressed", "Tired", "Bored", "Sad", "Anxious", "Happy", "Restless"];
const contexts = ["Home", "Work", "Driving", "Watching TV", "After a meal", "Social", "Alone", "Kitchen"];

export default function CheckInPage() {
  const [mood, setMood] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [hunger, setHunger] = useState(2);
  const [note, setNote] = useState("");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">
        Notice <span className="text-base font-normal text-stone-500">— 30 seconds</span>
      </h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        Before anything else, just name what&apos;s here. There are no wrong
        answers and nothing is scored.
      </p>

      <section className="mt-8">
        <h2 className="font-semibold text-stone-900">How do you feel right now?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {moods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(m)}
              aria-pressed={mood === m}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                mood === m
                  ? "border-[#2f5d3a] bg-[#2f5d3a] text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-[#2f5d3a]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-stone-900">Where are you / what&apos;s around you?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {contexts.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setContext(c)}
              aria-pressed={context === c}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                context === c
                  ? "border-[#2f5d3a] bg-[#2f5d3a] text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-[#2f5d3a]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-stone-900">
          How hungry is your body? <span className="font-normal text-stone-500">(0 = stuffed, 5 = truly hungry)</span>
        </h2>
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={hunger}
          onChange={(e) => setHunger(Number(e.target.value))}
          className="mt-3 w-full accent-[#2f5d3a]"
          aria-label="Body hunger level from 0 to 5"
        />
        <p className="mt-1 text-sm text-stone-600">Right now: {hunger} of 5</p>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-stone-900">Anything you want to say about this moment? <span className="font-normal text-stone-500">(optional)</span></h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
          placeholder="In your own words…"
        />
      </section>

      <div className="mt-10 text-center">
        <Link
          href="/pause"
          className="inline-block rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
        >
          Continue to the pause →
        </Link>
        <p className="mt-3 text-sm text-stone-500">
          Day 1 build: this form holds your answers on this screen. Saving to
          your on-device journal arrives with the Notice build (Day 2).
        </p>
      </div>
    </main>
  );
}
