"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addEntry,
  getShieldPlan,
  listEntries,
  matchPlannedResponse,
  updateEntry,
  type HungerType,
  type Need,
  type SleepQuality,
  type TriggerCategory,
} from "@/lib/journal";
import { pickReframe } from "@/lib/reframes";

const moods = ["Calm", "Stressed", "Tired", "Bored", "Sad", "Anxious", "Happy", "Restless"];
const contexts = ["Home", "Work", "Driving", "Watching TV", "After a meal", "Social", "Alone", "Kitchen"];
const sensations = ["Jaw tight", "Restless", "Tired / heavy", "Wired", "Stomach tight", "Shoulders tense"];
const needs: { value: Need; label: string }[] = [
  { value: "comfort", label: "Comfort" },
  { value: "escape", label: "Escape" },
  { value: "soothe", label: "Soothe" },
  { value: "numb", label: "Numb" },
  { value: "reward", label: "Reward" },
  { value: "relief", label: "Relief" },
  { value: "fuel", label: "Fuel" },
  { value: "tired", label: "Tired / need rest" },
  { value: "stressed", label: "Stressed / wound up" },
  { value: "bored", label: "Bored" },
  { value: "lonely", label: "Lonely" },
];
const triggerCategories: { value: TriggerCategory; label: string }[] = [
  { value: "environmental", label: "Something around me" },
  { value: "emotional", label: "A feeling" },
  { value: "physical", label: "My body" },
  { value: "social", label: "Other people" },
];

const TOTAL_STEPS = 6;

function chipClass(selected: boolean) {
  return `rounded-full border px-4 py-3 text-base font-medium transition ${
    selected
      ? "border-[#2f5d3a] bg-[#2f5d3a] text-white"
      : "border-stone-300 bg-white text-stone-700 hover:border-[#2f5d3a]"
  }`;
}

function ScaleRow({
  label,
  min,
  max,
  value,
  onPick,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  value: number | null;
  onPick: (n: number) => void;
  hint?: string;
}) {
  const nums = [];
  for (let n = min; n <= max; n++) nums.push(n);
  return (
    <div>
      <p className="font-semibold text-stone-900">
        {label} {hint && <span className="font-normal text-stone-600">{hint}</span>}
      </p>
      <div className="mt-2 flex gap-2">
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            aria-pressed={value === n}
            className={`h-12 flex-1 rounded-xl border text-lg font-semibold transition ${
              value === n
                ? "border-[#2f5d3a] bg-[#2f5d3a] text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-[#2f5d3a]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CheckInPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"steps" | "eat" | "done">("steps");
  const [endKind, setEndKind] = useState<"pause" | "eat">("pause");
  const [saving, setSaving] = useState(false);

  const [hungerType, setHungerType] = useState<HungerType | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [triggerCategory, setTriggerCategory] = useState<TriggerCategory | null>(null);
  const [bodySensations, setBodySensations] = useState<string[]>([]);
  const [hunger, setHunger] = useState(2);
  const [urgeIntensity, setUrgeIntensity] = useState<number | null>(null);
  const [need, setNeed] = useState<Need | null>(null);

  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [reframe, setReframe] = useState("");

  // Optional detail, offered only after the check-in has saved — it never
  // lengthens the check-in itself.
  const [showExtras, setShowExtras] = useState(false);
  const [energy, setEnergy] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<SleepQuality | null>(null);
  const [note, setNote] = useState("");
  const [extrasSaved, setExtrasSaved] = useState(false);
  const [extrasSaving, setExtrasSaving] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  function toggleSensation(s: string) {
    setBodySensations((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function save(kind: "pause" | "eat", needOverride?: Need | null) {
    if (saving) return;
    setSaving(true);
    setEndKind(kind);
    const finalNeed = needOverride !== undefined ? needOverride : need;
    let id: string | null = null;
    let failed = false;
    try {
      const [plan, existing] = await Promise.all([getShieldPlan(), listEntries()]);
      const entry = await addEntry({
        mood,
        context,
        hunger,
        urgeIntensity,
        hungerType,
        bodySensations,
        need: finalNeed,
        triggerCategory,
        plannedResponse: matchPlannedResponse(plan, context),
        source: "notice",
      });
      id = entry.id;
      setReframe(pickReframe(finalNeed, existing.length));
    } catch {
      failed = true;
    }
    setSavedId(id);
    setSaveFailed(failed);
    setSaving(false);
    setPhase("done");
  }

  async function saveExtras() {
    if (!savedId || extrasSaving) return;
    setExtrasSaving(true);
    try {
      await updateEntry(savedId, { energy, stress, sleepQuality, note });
      setExtrasSaved(true);
    } catch {
      // The check-in itself is already saved; extras are a bonus.
    }
    setExtrasSaving(false);
  }

  const progress = phase === "done" ? 100 : Math.round(((step + 1) / TOTAL_STEPS) * 100);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">
        Notice <span className="text-base font-normal text-stone-600">— about 30 seconds</span>
      </h1>

      <div className="mt-4" aria-hidden="true">
        <div className="h-2 w-full rounded-full bg-[#e7efe3]">
          <div className="h-2 rounded-full bg-[#2f5d3a] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-sm text-stone-600">
          {phase === "done" ? "Done" : `Step ${step + 1} of ${TOTAL_STEPS}`}
        </p>
      </div>

      {phase === "steps" && step === 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-stone-900">First — is this body hunger, or head hunger?</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            Body hunger comes on gradually, sits in your stomach, and any food sounds fine. Head hunger shows up
            suddenly, lives in your head, and wants one specific thing.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <button type="button" className={chipClass(hungerType === "physical")} onClick={() => { setHungerType("physical"); setPhase("eat"); }}>
              Body hunger
            </button>
            <button type="button" className={chipClass(hungerType === "emotional")} onClick={() => { setHungerType("emotional"); next(); }}>
              Head hunger
            </button>
            <button type="button" className={chipClass(hungerType === "unsure")} onClick={() => { setHungerType("unsure"); next(); }}>
              Not sure
            </button>
          </div>
        </section>
      )}

      {phase === "eat" && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-stone-900">Then eat — that&apos;s the right call.</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            Body hunger is real, and food is the answer to it. This tool is for the other kind of moment. No pause
            needed, nothing to fix.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => save("eat")}
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30] disabled:opacity-60"
            >
              Save this check-in &amp; eat
            </button>
            <button
              type="button"
              onClick={() => { setPhase("steps"); next(); }}
              className="rounded-full border border-stone-300 bg-white px-8 py-3 font-medium text-stone-700"
            >
              Keep checking in anyway
            </button>
          </div>
        </section>
      )}

      {phase === "steps" && step === 1 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-stone-900">How do you feel right now?</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {moods.map((m) => (
              <button key={m} type="button" aria-pressed={mood === m} className={chipClass(mood === m)} onClick={() => { setMood(m); next(); }}>
                {m}
              </button>
            ))}
          </div>
        </section>
      )}

      {phase === "steps" && step === 2 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-stone-900">What&apos;s drawing you right now?</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {contexts.map((c) => (
              <button key={c} type="button" aria-pressed={context === c} className={chipClass(context === c)} onClick={() => setContext(c)}>
                {c}
              </button>
            ))}
          </div>
          <p className="mt-6 font-semibold text-stone-900">
            The urge is mostly… <span className="font-normal text-stone-600">(optional)</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {triggerCategories.map((t) => (
              <button key={t.value} type="button" aria-pressed={triggerCategory === t.value} className={chipClass(triggerCategory === t.value)} onClick={() => setTriggerCategory(triggerCategory === t.value ? null : t.value)}>
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!context}
            onClick={next}
            className="mt-8 w-full rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30] disabled:opacity-40"
          >
            Continue
          </button>
        </section>
      )}

      {phase === "steps" && step === 3 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-stone-900">What do you notice in your body?</h2>
          <p className="mt-2 text-stone-600">Tap any that fit. Not sure is a fine answer.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {sensations.map((s) => (
              <button key={s} type="button" aria-pressed={bodySensations.includes(s)} className={chipClass(bodySensations.includes(s))} onClick={() => toggleSensation(s)}>
                {s}
              </button>
            ))}
            <button type="button" className={chipClass(false)} onClick={() => { setBodySensations([]); next(); }}>
              Not sure
            </button>
          </div>
          <button type="button" onClick={next} className="mt-8 w-full rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]">
            Continue
          </button>
        </section>
      )}

      {phase === "steps" && step === 4 && (
        <section className="mt-8 flex flex-col gap-8">
          <p className="leading-relaxed text-stone-600">
            You named the <em>kind</em> of hunger in step 1 — these two are just the <em>amount</em>.
          </p>
          <ScaleRow label="How hungry is your body?" hint="(0 = stuffed, 5 = truly hungry)" min={0} max={5} value={hunger} onPick={setHunger} />
          <ScaleRow label="How strong is the urge?" hint="(0 = barely there, 5 = very strong)" min={0} max={5} value={urgeIntensity} onPick={setUrgeIntensity} />
          <button type="button" onClick={next} className="w-full rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]">
            Continue
          </button>
        </section>
      )}

      {phase === "steps" && step === 5 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-stone-900">What would food do for you right now?</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {needs.map((n) => (
              <button key={n.value} type="button" disabled={saving} aria-pressed={need === n.value} className={chipClass(need === n.value)} onClick={() => { setNeed(n.value); void save("pause", n.value); }}>
                {n.label}
              </button>
            ))}
            <button type="button" disabled={saving} className={chipClass(false)} onClick={() => { setNeed(null); void save("pause", null); }}>
              Not sure
            </button>
          </div>
          {saving && <p className="mt-4 text-sm text-stone-600">Saving…</p>}
        </section>
      )}

      {phase === "done" && endKind === "eat" && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-stone-900">Saved. Go eat.</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            Body hunger, answered with food — that&apos;s the system working.
          </p>
          <p className="mt-6 text-sm text-stone-600">
            {saveFailed ? "Couldn't save on this device." : "Check-in saved on this device."}
          </p>
          <div className="mt-6">
            <Link href="/" className="block rounded-full border border-stone-300 bg-white px-8 py-3 text-center font-medium text-stone-700">
              Done
            </Link>
          </div>
        </section>
      )}

      {phase === "done" && endKind === "pause" && (
        <section className="mt-8">
          <p className="text-sm font-medium tracking-wide text-stone-600 uppercase">A line for this moment</p>
          <p className="mt-3 text-2xl leading-snug font-semibold text-stone-900">{reframe}</p>
          <p className="mt-4 text-stone-600">
            From your starter library — later, your own words replace these.
          </p>
          <p className="mt-6 text-sm text-stone-600">
            {saveFailed ? "Couldn't save on this device — the pause still works." : "Check-in saved on this device."}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push(saveFailed || !savedId ? "/pause?save=failed" : `/pause?entry=${savedId}`)}
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              Continue to the pause →
            </button>
            <Link href="/" className="rounded-full border border-stone-300 bg-white px-8 py-3 text-center font-medium text-stone-700">
              Done
            </Link>
          </div>

          {!saveFailed && savedId && (
            <div className="mt-10 border-t border-stone-200 pt-6">
              {showExtras ? (
                <div className="flex flex-col gap-7">
                  <p className="leading-relaxed text-stone-600">
                    Optional — these help your pattern view learn what tends to come before a hard moment.
                  </p>
                  <ScaleRow label="Energy" hint="(1 = empty, 5 = full)" min={1} max={5} value={energy} onPick={setEnergy} />
                  <ScaleRow label="Stress" hint="(1 = calm, 5 = maxed)" min={1} max={5} value={stress} onPick={setStress} />
                  <div>
                    <p className="font-semibold text-stone-900">Sleep last night</p>
                    <div className="mt-2 flex gap-2">
                      {(["poor", "okay", "good"] as SleepQuality[]).map((q) => (
                        <button key={q} type="button" aria-pressed={sleepQuality === q} className={`${chipClass(sleepQuality === q)} flex-1 capitalize`} onClick={() => setSleepQuality(sleepQuality === q ? null : q)}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
                    placeholder="Anything in your own words… (optional)"
                  />
                  <button
                    type="button"
                    disabled={extrasSaving || extrasSaved}
                    onClick={() => void saveExtras()}
                    className="self-start rounded-full bg-[#2f5d3a] px-6 py-3 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-50"
                  >
                    {extrasSaved ? "Saved ✓" : extrasSaving ? "Saving…" : "Save these too"}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowExtras(true)} className="font-medium text-[#2f5d3a] underline decoration-[#2f5d3a]/40 underline-offset-4">
                  Add more for your pattern view? (optional)
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {phase === "steps" && step > 0 && (
        <button type="button" onClick={back} className="mt-10 self-start text-sm font-medium text-stone-600 underline underline-offset-4">
          ← Previous step
        </button>
      )}

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>
          Saved only on this device. When you talk with your second brain, it sees a short summary of
          recent entries so it can deal your own plan back to you — the journal itself stays here.
        </p>
        <p className="mt-2">Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
