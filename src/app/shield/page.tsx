"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getShieldPlan, saveShieldPlan, type ShieldPlan } from "@/lib/journal";

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none";
const addBtnClass =
  "shrink-0 rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-40";
const removeBtnClass = "text-sm font-medium text-stone-400 underline underline-offset-4 hover:text-stone-600";

export default function ShieldPage() {
  const [plan, setPlan] = useState<ShieldPlan | null>(null);
  const [newTrigger, setNewTrigger] = useState("");
  const [optionDrafts, setOptionDrafts] = useState<Record<number, string>>({});
  const [newPlace, setNewPlace] = useState("");
  const [newNegative, setNewNegative] = useState("");
  const [newPositive, setNewPositive] = useState("");

  useEffect(() => {
    let live = true;
    getShieldPlan()
      .then((p) => {
        if (live) setPlan(p);
      })
      .catch(() => {
        if (live) setPlan({ triggerOptions: [], dangerPlaces: [], thoughtPairs: [] });
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

  if (!plan) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
        <p className="text-stone-500">Loading your Shield Plan…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">Your Shield Plan</h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        Set this up at a calm time. When a hard moment comes, the app hands you your own words and your own options —
        nothing generic, nothing scored. Saved only on this device.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">When this pulls at me… here&apos;s what I can do instead</h2>
        <p className="mt-1 text-sm text-stone-500">
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
        <p className="mt-1 text-sm text-stone-500">
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
        <h2 className="text-xl font-semibold text-stone-900">The thought that pops up — and what I can tell myself instead</h2>
        <p className="mt-1 text-sm text-stone-500">
          In your own words. These come back to you in hard moments.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {plan.thoughtPairs.map((pair, i) => (
            <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-stone-500 italic">&ldquo;{pair.negative}&rdquo;</p>
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

      <footer className="mt-auto pt-10 text-center text-sm text-stone-500">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
