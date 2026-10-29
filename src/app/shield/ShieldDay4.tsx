"use client";

import { useEffect, useRef, useState } from "react";
import {
  getCue,
  listEntries,
  matchPlannedResponse,
  type Directness,
  type ShieldPlan,
  type VoiceChoice,
} from "@/lib/journal";

// Day 4 Shield sections: the approach-worded if-then, the three-way
// second-brain voice choice, and the directness picker under the §2.6
// firmness rules (weaken next day / strengthen instant). All calm-time
// setup; nothing here is asked during a craving.

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

// ---------- Second-brain voice choice ----------

const VOICE_OPTIONS: { value: VoiceChoice; title: string; body: string }[] = [
  {
    value: "own",
    title: "Record your own",
    body: "The voice that reaches you is yours — recorded here, on this device. The recommended way in.",
  },
  {
    value: "phone",
    title: "Use phone voice",
    body: "Your device's built-in voice reads your words out loud — a generated voice, not yours.",
  },
  {
    value: "later",
    title: "Decide later",
    body: "The app stays quiet until you pick. Everything else works the same.",
  },
];

export function VoiceChoiceSection({
  plan,
  onUpdate,
  cueVersion = 0,
}: {
  plan: ShieldPlan;
  onUpdate: (next: ShieldPlan) => void;
  // Bumped by the page whenever the cue is saved or deleted, so the
  // preview below re-checks what recording actually exists.
  cueVersion?: number;
}) {
  const [previewNote, setPreviewNote] = useState("");
  const [cueUrl, setCueUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // The preview must play what the moment will actually play — and the
  // moment (the SOS screen) plays the recording whenever one exists.
  // So: a saved recording always wins here, whatever the stored choice
  // says. TTS is used only when phone voice is the picked channel and
  // no recording exists, and it is labeled as the phone's voice.
  useEffect(() => {
    let live = true;
    getCue("cue")
      .then((cue) => {
        if (!live) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = cue ? URL.createObjectURL(cue.blob) : null;
        setCueUrl(urlRef.current);
      })
      .catch(() => {
        if (live) setCueUrl(null);
      });
    return () => {
      live = false;
    };
  }, [cueVersion]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // Nothing speaking.
      }
    },
    [],
  );

  function stopPreviewSounds() {
    audioRef.current?.pause();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Nothing speaking.
    }
  }

  function preview() {
    stopPreviewSounds();
    if (cueUrl) {
      const audio = new Audio(cueUrl);
      audioRef.current = audio;
      audio.play().catch(() => {});
      setPreviewNote("That was your recording — your own voice, the one that plays in the moment.");
      return;
    }
    if (plan.voiceChoice === "phone") {
      const text = plan.whyLine.trim() || "I'm in a moment. I want to feel good tomorrow.";
      try {
        const synth = window.speechSynthesis;
        if (!synth) {
          setPreviewNote("This device has no built-in voice to preview with.");
          return;
        }
        synth.speak(new SpeechSynthesisUtterance(text));
        setPreviewNote(
          plan.whyLine.trim()
            ? "That was your phone's built-in voice reading your why — not a recording of you. Phone voice is the channel you picked."
            : "That was your phone's built-in voice reading a sample line — not a recording of you. Once your why is set, the preview reads that instead.",
        );
      } catch {
        setPreviewNote("Preview isn't available on this device.");
      }
      return;
    }
    setPreviewNote(
      "Nothing of yours to play yet. In the moment, your why shows on screen in words — record your voice just below, and the preview will play you.",
    );
  }

  const previewHelp = cueUrl
    ? "Preview plays your recording — your own voice."
    : plan.voiceChoice === "phone"
      ? "Preview uses your phone's built-in voice — it won't sound like you."
      : "No recording yet — preview has nothing of yours to play.";

  return (
    <div>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        Pick at a calm time; change it any time, right here. Nothing is recorded or sent anywhere by
        this choice itself.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {VOICE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={plan.voiceChoice === o.value}
            onClick={() => onUpdate({ ...plan, voiceChoice: o.value })}
            className={`${optionBase} ${plan.voiceChoice === o.value ? optionActive : optionIdle}`}
          >
            <span className="block font-semibold text-stone-900">{o.title}</span>
            <span className="mt-1 block text-sm leading-relaxed text-stone-600">{o.body}</span>
          </button>
        ))}
      </div>
      {cueUrl && plan.voiceChoice !== "own" && (
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          You have a recording saved — that&apos;s what plays in the moment, whatever is picked here.
        </p>
      )}
      <button
        type="button"
        onClick={preview}
        className="mt-4 rounded-full border border-stone-300 bg-white px-5 py-3 font-semibold text-stone-800 transition hover:border-[#2f5d3a]"
      >
        ▶ Preview what you&apos;ll hear
      </button>
      <p className="mt-2 text-sm text-stone-600">{previewHelp}</p>
      {previewNote && <p className="mt-2 text-sm text-stone-600">{previewNote}</p>}
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
