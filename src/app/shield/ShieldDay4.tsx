"use client";

import { useEffect, useState } from "react";
import {
  listEntries,
  matchPlannedResponse,
  type Directness,
  type ShieldPlan,
} from "@/lib/journal";

// Day 4 Shield sections: the approach-worded if-then and the directness
// picker under the §2.6 firmness rules (weaken next day / strengthen
// instant). All calm-time setup; nothing here is asked during a craving.
// (The three-way second-brain voice-choice picker that used to live here
// was retired 2026-10-31: it no longer steered anything — conversation
// voice is the set-up voice regardless, and the reset recording plays
// whenever one exists. The shield page now carries a plain "Your voice"
// panel instead. The stored `voiceChoice` field is untouched.)

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none";
const saveBtnClass =
  "rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-40";
const optionBase =
  "w-full rounded-2xl border p-4 text-left shadow-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2f5d3a]/30";
const optionIdle = "border-stone-200 bg-white hover:border-[#2f5d3a]";
const optionActive = "border-[#2f5d3a] bg-[#e7efe3]";

function hourLabel(iso: string): string {
  const h = new Date(iso).getHours();
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12} ${h < 12 ? "AM" : "PM"}`;
}

function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

// ---------- If-then (approach-worded, from the user's own pattern) ----------

export function IfThenSection({
  plan,
  onUpdate,
}: {
  plan: ShieldPlan;
  onUpdate: (next: ShieldPlan) => void;
}) {
  const [when, setWhen] = useState(plan.ifThen?.when ?? "");
  const [then, setThen] = useState(plan.ifThen?.then ?? "");
  const [suggested, setSuggested] = useState(false);

  useEffect(() => {
    if (plan.ifThen) return;
    let live = true;
    listEntries()
      .then((entries) => {
        if (!live || entries.length === 0) return;
        const context = mode(entries.map((e) => e.context).filter((c): c is string => !!c));
        const hour = mode(entries.map((e) => hourLabel(e.createdAt)));
        const whenText = context
          ? `it's ${context.toLowerCase()}`
          : hour
            ? `it's ${hour}`
            : "";
        const response = context ? matchPlannedResponse(plan, context) : null;
        if (whenText) setWhen((w) => w || whenText);
        if (response) setThen((t) => t || response);
        if (whenText || response) setSuggested(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        One plan, in your words, aimed at what you <em>will</em> do — never at what you won&apos;t.
        Like: &ldquo;If it&apos;s 9pm and I want something sweet, then I make the tea and take the
        walk I chose.&rdquo;
        {suggested && !plan.ifThen ? " The draft below is filled in from your own check-ins — edit it freely." : ""}
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="block">
          <span className="text-sm font-medium text-stone-700">If…</span>
          <input
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={`${inputClass} mt-1`}
            placeholder="it's 9pm and I want something sweet"
            maxLength={120}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Then I…</span>
          <input
            value={then}
            onChange={(e) => setThen(e.target.value)}
            className={`${inputClass} mt-1`}
            placeholder="make the tea and take the walk I chose"
            maxLength={160}
          />
        </label>
        <button
          type="button"
          className={`${saveBtnClass} self-start`}
          disabled={!when.trim() || !then.trim()}
          onClick={() => onUpdate({ ...plan, ifThen: { when: when.trim(), then: then.trim() } })}
        >
          Arm this plan
        </button>
      </div>
      {plan.ifThen && (
        <p className="mt-4 rounded-2xl border border-[#2f5d3a]/30 bg-[#e7efe3] p-4 leading-relaxed text-stone-900">
          <span className="font-semibold">Armed:</span> If {plan.ifThen.when}, then I {plan.ifThen.then}.
        </p>
      )}
    </div>
  );
}

// ---------- Directness picker (§2.6 firmness rules) ----------

export const DIRECTNESS_LEVELS: { value: Directness; label: string; descriptor: string; firmness: number }[] = [
  { value: "gentle", label: "Gentle", descriptor: "Soft, slow, curious", firmness: 0 },
  { value: "straight", label: "Straight", descriptor: "Direct, plain, kind", firmness: 1 },
  { value: "short", label: "Short-and-straight", descriptor: "Very brief, to the point", firmness: 2 },
];

function levelOf(value: Directness) {
  return DIRECTNESS_LEVELS.find((l) => l.value === value) ?? DIRECTNESS_LEVELS[1];
}

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, device local
}

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

// If a pending (weakening) change has come due, it becomes effective.
export function applyDueDirectness(plan: ShieldPlan): { plan: ShieldPlan; changed: boolean } {
  const pending = plan.directnessPending;
  if (pending && todayKey() >= pending.effectiveFrom) {
    return {
      plan: { ...plan, directness: pending.level, directnessPending: null },
      changed: true,
    };
  }
  return { plan, changed: false };
}

export function DirectnessSection({
  plan,
  onUpdate,
}: {
  plan: ShieldPlan;
  onUpdate: (next: ShieldPlan) => void;
}) {
  const current = plan.directness ?? null;
  const pending = plan.directnessPending ?? null;

  function pick(level: Directness) {
    if (!current) {
      onUpdate({ ...plan, directness: level, directnessPending: null });
      return;
    }
    if (level === current) {
      // Re-affirming the current level cancels any pending change.
      if (pending) onUpdate({ ...plan, directnessPending: null });
      return;
    }
    if (levelOf(level).firmness > levelOf(current).firmness) {
      // Strengthening is instant (§2.6).
      onUpdate({ ...plan, directness: level, directnessPending: null });
    } else {
      // Weakening takes effect tomorrow (§2.6).
      onUpdate({ ...plan, directnessPending: { level, effectiveFrom: tomorrowKey() } });
    }
  }

  return (
    <div>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        Set at a calm time. You can&apos;t renegotiate during the craving — you can renegotiate
        freely tomorrow morning: softening lands the next day, firming up lands right away.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {DIRECTNESS_LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            aria-pressed={current === l.value}
            onClick={() => pick(l.value)}
            className={`${optionBase} ${current === l.value ? optionActive : optionIdle}`}
          >
            <span className="block font-semibold text-stone-900">{l.label}</span>
            <span className="mt-1 block text-sm leading-relaxed text-stone-600">{l.descriptor}</span>
          </button>
        ))}
      </div>
      {current && (
        <p className="mt-3 text-sm text-stone-600">
          Right now your second brain talks to you: <strong>{levelOf(current).label}</strong> —{" "}
          {levelOf(current).descriptor.toLowerCase()}.
        </p>
      )}
      {pending && (
        <p className="mt-2 text-sm text-stone-600">
          From tomorrow ({pending.effectiveFrom}): <strong>{levelOf(pending.level).label}</strong>.
          Softening takes a day to land — that pause is the point.
        </p>
      )}
      {!current && (
        <p className="mt-3 text-sm text-stone-600">Not set yet — tap one and it starts there.</p>
      )}
    </div>
  );
}
