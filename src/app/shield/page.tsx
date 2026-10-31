"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EMPTY_SHIELD_PLAN, getShieldPlan, saveShieldPlan, type ShieldPlan } from "@/lib/journal";
import { ResetLineSetup } from "./VoiceCueSetup";
import {
  applyDueDirectness,
  DirectnessSection,
  IfThenSection,
  VoiceChoiceSection,
} from "./ShieldDay4";
import { PlacesSection, RiskWindowsSection } from "./PlacesWindows";

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none";
const addBtnClass =
  "shrink-0 rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-40";
const removeBtnClass = "text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700";

export default function ShieldPage() {
  const [plan, setPlan] = useState<ShieldPlan | null>(null);
  const [newTrigger, setNewTrigger] = useState("");
  const [optionDrafts, setOptionDrafts] = useState<Record<number, string>>({});
  const [newPlace, setNewPlace] = useState("");
  const [newNegative, setNewNegative] = useState("");
  const [newPositive, setNewPositive] = useState("");
  // Fish voice-out test ("Hear my voice say it", under Your voice below):
  // one fixed line through /api/speak, played in the browser.
  const [speakState, setSpeakState] = useState<"idle" | "loading" | "error">("idle");
  const [speakNote, setSpeakNote] = useState("");
  const speakAudioRef = useRef<HTMLAudioElement | null>(null);
  const speakUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    getShieldPlan()
      .then((p) => {
        if (!live) return;
        // A pending directness change that has come due takes effect (§2.6).
        const { plan: resolved, changed } = applyDueDirectness(p);
        setPlan(resolved);
        if (changed) saveShieldPlan(resolved).catch(() => {});
      })
      .catch(() => {
        if (live) setPlan({ ...EMPTY_SHIELD_PLAN });
      });
    return () => {
      live = false;
    };
  }, []);

  async function update(nextPlan: ShieldPlan) {
    setPlan(nextPlan);
    try {
      await saveShieldPlan(nextPlan);
    } catch {
      // Saved in state; storage failure must not break setup.
    }
  }

  async function hearMyVoice() {
    setSpeakState("loading");
    setSpeakNote("");
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "This is your voice, on demand. Same voice that talks you through the moment.",
        }),
      });
      if (!res.ok) {
        let code = "";
        try {
          code = ((await res.json()) as { error?: string }).error ?? "";
        } catch {
          // Non-JSON error body — the generic note below covers it.
        }
        setSpeakNote(
          code === "voice_not_configured"
            ? "Your Fish key isn't in Vercel yet — once it's pasted in, this button speaks."
            : "Your voice couldn't speak just now — try again in a moment.",
        );
        setSpeakState("error");
        return;
      }
      const blob = await res.blob();
      if (speakUrlRef.current) URL.revokeObjectURL(speakUrlRef.current);
      speakUrlRef.current = URL.createObjectURL(blob);
      if (!speakAudioRef.current) speakAudioRef.current = new Audio();
      speakAudioRef.current.src = speakUrlRef.current;
      await speakAudioRef.current.play();
      setSpeakState("idle");
    } catch {
      setSpeakNote("Your voice couldn't speak just now — try again in a moment.");
      setSpeakState("error");
    }
  }

  if (!plan) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
        <p className="text-stone-600">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">Your words — and what you&apos;ll have instead</h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        All of this is optional. Your voice is the main thing.
      </p>
      <p className="mt-2 leading-relaxed text-stone-600">
        Anything you add here — your why, what you&apos;ll have instead, your plan — waits for you in a hard moment, in
        your words. Nothing generic, nothing scored. Saved only on this device.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">How your second brain reaches you</h2>
        <VoiceChoiceSection plan={plan} onUpdate={update} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Your voice</h2>
        <div className="mt-5">
          <button
            type="button"
            onClick={hearMyVoice}
            disabled={speakState === "loading"}
            className="rounded-full border border-stone-300 bg-white px-5 py-3 font-semibold text-stone-800 transition hover:border-[#2f5d3a] disabled:opacity-50"
          >
            {speakState === "loading" ? "Getting your voice…" : "Hear my voice say it"}
          </button>
          <p className="mt-2 text-sm text-stone-600">
            Your cloned voice, on demand — the one that will talk you through a moment.
          </p>
          {speakNote && <p className="mt-2 text-sm text-stone-600">{speakNote}</p>}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Your reset line</h2>
        <ResetLineSetup />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">My why</h2>
        <p className="mt-1 text-sm text-stone-600">
          One line, in your words — the reason that matters at 8 PM, not just at setup time. It shows up
          large on the SOS screen.
        </p>
        <input
          value={plan.whyLine}
          onChange={(e) => setPlan({ ...plan, whyLine: e.target.value })}
          onBlur={() => {
            saveShieldPlan(plan).catch(() => {
              // Saved in state; storage failure must not break setup.
            });
          }}
          className={`${inputClass} mt-3`}
          placeholder="e.g. I want to feel good tomorrow morning"
          maxLength={140}
        />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">When the urge hits me… here&apos;s what I can do instead</h2>
        <p className="mt-1 text-sm text-stone-600">
          Name a moment (like &ldquo;Watching TV&rdquo; or &ldquo;Kitchen&rdquo;), then add what you can do instead.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {plan.triggerOptions.map((to, i) => (
            <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-stone-900">{to.trigger}</p>
                <button
                  type="button"
                  className={removeBtnClass}
                  onClick={() => update({ ...plan, triggerOptions: plan.triggerOptions.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {to.options.map((opt, j) => (
                  <li key={j} className="flex items-center justify-between gap-3 text-stone-700">
                    <span>• {opt}</span>
                    <button
                      type="button"
                      className={removeBtnClass}
                      onClick={() => {
                        const copy = [...plan.triggerOptions];
                        copy[i] = { ...copy[i], options: copy[i].options.filter((_, k) => k !== j) };
                        update({ ...plan, triggerOptions: copy });
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <input
                  value={optionDrafts[i] ?? ""}
                  onChange={(e) => setOptionDrafts((d) => ({ ...d, [i]: e.target.value }))}
                  className={inputClass}
                  placeholder="Add an option in your own words…"
                />
                <button
                  type="button"
                  className={addBtnClass}
                  disabled={!(optionDrafts[i] ?? "").trim()}
                  onClick={() => {
                    const copy = [...plan.triggerOptions];
                    copy[i] = { ...copy[i], options: [...copy[i].options, (optionDrafts[i] ?? "").trim()] };
                    setOptionDrafts((d) => ({ ...d, [i]: "" }));
                    update({ ...plan, triggerOptions: copy });
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={newTrigger}
            onChange={(e) => setNewTrigger(e.target.value)}
            className={inputClass}
            placeholder="A moment — e.g. Watching TV"
          />
          <button
            type="button"
            className={addBtnClass}
            disabled={!newTrigger.trim()}
            onClick={() => {
              update({ ...plan, triggerOptions: [...plan.triggerOptions, { trigger: newTrigger.trim(), options: [] }] });
              setNewTrigger("");
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Places where I want to be ready</h2>
        <p className="mt-1 text-sm text-stone-600">
          Places you name yourself. The app doesn&apos;t track your location — you just tell it where to be extra
          ready with your own words.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {plan.dangerPlaces.map((place, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-700">
              <span>{place}</span>
              <button type="button" className={removeBtnClass} onClick={() => update({ ...plan, dangerPlaces: plan.dangerPlaces.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input value={newPlace} onChange={(e) => setNewPlace(e.target.value)} className={inputClass} placeholder="A place — e.g. the gas station on the way home" />
          <button
            type="button"
            className={addBtnClass}
            disabled={!newPlace.trim()}
            onClick={() => {
              update({ ...plan, dangerPlaces: [...plan.dangerPlaces, newPlace.trim()] });
              setNewPlace("");
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Your places — saved by standing there</h2>
        <PlacesSection />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">My risk windows</h2>
        <RiskWindowsSection plan={plan} onUpdate={update} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">The thought that pops up — and what I can tell myself instead</h2>
        <p className="mt-1 text-sm text-stone-600">
          In your own words. These come back to you in hard moments.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {plan.thoughtPairs.map((pair, i) => (
            <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-stone-600 italic">&ldquo;{pair.negative}&rdquo;</p>
                  <p className="mt-1 font-medium text-stone-900">&ldquo;{pair.positive}&rdquo;</p>
                </div>
                <button type="button" className={removeBtnClass} onClick={() => update({ ...plan, thoughtPairs: plan.thoughtPairs.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <input value={newNegative} onChange={(e) => setNewNegative(e.target.value)} className={inputClass} placeholder="The thought that pops up — e.g. One little snack won't matter" />
          <input value={newPositive} onChange={(e) => setNewPositive(e.target.value)} className={inputClass} placeholder="What I can tell myself instead — e.g. It mattered every time I said that" />
          <button
            type="button"
            className={`${addBtnClass} self-start`}
            disabled={!newNegative.trim() || !newPositive.trim()}
            onClick={() => {
              update({ ...plan, thoughtPairs: [...plan.thoughtPairs, { negative: newNegative.trim(), positive: newPositive.trim() }] });
              setNewNegative("");
              setNewPositive("");
            }}
          >
            Add pair
          </button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">My plan, in one line</h2>
        <IfThenSection plan={plan} onUpdate={update} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">How should your second brain talk to you?</h2>
        <DirectnessSection plan={plan} onUpdate={update} />
      </section>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
