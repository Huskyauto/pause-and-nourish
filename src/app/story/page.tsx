"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  EMPTY_SHIELD_PLAN,
  EMPTY_USER_PROFILE,
  getShieldPlan,
  getUserProfile,
  saveShieldPlan,
  saveUserProfile,
  type ShieldPlan,
  type UserProfile,
} from "@/lib/journal";
import { transcribeBlob } from "@/lib/wav";
import { applyDueDirectness } from "../shield/ShieldDay4";

// Your story — the review/edit surface for the new-user intake
// (Bob's directive, 2026-10-31; conversational form locked the same
// day). The intake itself is a spoken interview (/story/interview):
// the brain asks, the user answers out loud, and the captured items
// land in these same stores. This page is where what was captured
// gets read and fixed in the user's own words — and it doubles as
// the type-it-instead path when speaking isn't possible.
//
// The founder's second brain was built from his own history, mined
// over years. A new user has none of that in the app — their story
// becomes the material the brain deals back: who they are, where
// they're starting from, the moments that get them, their why, their
// first swaps — all in their own words, all saved only on this
// device. Only the name is needed; everything else is optional, now
// or later or never, and nothing here gates anything — SOS and Talk
// with me work with zero of this filled in. The why line, swaps, and
// word-for-today write to the same Shield Plan fields the setup page
// uses, so the two surfaces can never disagree.

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none";
const addBtnClass =
  "shrink-0 rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-40";
const removeBtnClass = "text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700";

// A story dictation can run longer than a spoken answer in the
// moment, but the same upload bound applies — two minutes of 16 kHz
// WAV stays under the serverless body limit.
const DICTATION_MAX_MS = 120000;

export default function StoryPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plan, setPlan] = useState<ShieldPlan | null>(null);
  const [newSituation, setNewSituation] = useState("");
  const [newSwapSituation, setNewSwapSituation] = useState("");
  const [newSwapInstead, setNewSwapInstead] = useState("");
  const [wordDraft, setWordDraft] = useState("");
  // Dictation state for the story field: idle → recording → working.
  const [dictation, setDictation] = useState<"idle" | "recording" | "working">("idle");
  const [dictationNote, setDictationNote] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const storyRef = useRef("");
  // The dictation's transcribe finishes asynchronously — it must merge
  // the heard words into the LATEST profile, not the render-scope one
  // from when the recording started.
  const profileRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      getUserProfile().catch(() => ({ ...EMPTY_USER_PROFILE })),
      getShieldPlan().catch(() => ({ ...EMPTY_SHIELD_PLAN })),
    ]).then(([p, storedPlan]) => {
      if (!live) return;
      setProfile(p);
      profileRef.current = p;
      storyRef.current = p.story;
      // Same directness housekeeping the setup page does on load.
      const { plan: resolved, changed } = applyDueDirectness(storedPlan);
      setPlan(resolved);
      if (changed) saveShieldPlan(resolved).catch(() => {});
      if (resolved.todayWord && resolved.todayWordDate === new Date().toDateString()) {
        setWordDraft(resolved.todayWord);
      }
    });
    return () => {
      live = false;
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        // Already stopped.
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function updateProfile(next: UserProfile) {
    setProfile(next);
    profileRef.current = next;
    storyRef.current = next.story;
    try {
      await saveUserProfile(next);
    } catch {
      // Saved in state; storage failure must not break setup.
    }
  }

  async function updatePlan(next: ShieldPlan) {
    setPlan(next);
    try {
      await saveShieldPlan(next);
    } catch {
      // Saved in state; storage failure must not break setup.
    }
  }

  // ---------- story dictation ----------

  async function toggleDictation() {
    if (dictation === "working") return;
    if (dictation === "recording") {
      stopDictation();
      return;
    }
    setDictationNote("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (stopTimerRef.current !== null) {
          window.clearTimeout(stopTimerRef.current);
          stopTimerRef.current = null;
        }
        const blob = chunks.length
          ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
          : null;
        if (!blob) {
          setDictation("idle");
          setDictationNote("Nothing was recorded — typing works fine too.");
          return;
        }
        setDictation("working");
        void (async () => {
          const text = await transcribeBlob(blob);
          setDictation("idle");
          if (!text) {
            setDictationNote(
              "Your words didn't come through just now — the text box works fine, or try saying it again.",
            );
            return;
          }
          const current = profileRef.current;
          if (!current) return;
          const joined = storyRef.current.trim()
            ? `${storyRef.current.trim()} ${text}`
            : text;
          await updateProfile({ ...current, story: joined.slice(0, 4000) });
          setDictationNote("Added to your story, in your words. Edit anything that isn't quite right.");
        })();
      };
      recorder.start();
      setDictation("recording");
      stopTimerRef.current = window.setTimeout(() => stopDictation(), DICTATION_MAX_MS);
    } catch {
      setDictation("idle");
      setDictationNote("The microphone didn't open — typing works fine too.");
    }
  }

  function stopDictation() {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {
      setDictation("idle");
    }
  }

  if (!profile || !plan) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
        <p className="text-stone-600">Loading…</p>
      </main>
    );
  }

  const todayStr = new Date().toDateString();
  const wordIsTodays = !!plan.todayWord && plan.todayWordDate === todayStr;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">Your story</h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        What your story captured — fix anything in your words. This is what your second brain
        deals back to you when you talk with it, so it should sound like you.
      </p>
      <p className="mt-2 leading-relaxed text-stone-600">
        Only your name is needed. Everything else is optional — a little now, more later, or none
        at all. Nothing here is a gate: the pause and the conversation work with none of this
        filled in. Saved only on this device.
      </p>
      <div className="mt-5 rounded-2xl bg-[#eef4ec] px-5 py-4">
        <p className="leading-relaxed text-stone-800">
          Rather talk it through? Your second brain can ask you a few questions out loud and fill
          this in from your answers.
        </p>
        <Link
          href="/story/interview"
          className="mt-3 inline-block rounded-full bg-[#2f5d3a] px-6 py-3 font-semibold text-white"
        >
          Start the conversation
        </Link>
      </div>
      {profile.name.trim() && (
        <p className="mt-4 rounded-2xl border border-[#2f5d3a]/30 bg-[#e7efe3] px-5 py-4 font-medium text-stone-900">
          Saved{profile.name.trim() ? `, ${profile.name.trim()}` : ""}. This is your story — change
          any of it any time.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Your name</h2>
        <p className="mt-1 text-sm text-stone-600">
          The name your second brain should use for you.
        </p>
        <input
          value={profile.name}
          onChange={(e) => {
            const next = { ...profile, name: e.target.value };
            setProfile(next);
            profileRef.current = next;
          }}
          onBlur={() => {
            saveUserProfile(profile).catch(() => {});
          }}
          className={`${inputClass} mt-3`}
          placeholder="Your name"
          maxLength={60}
        />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Your second brain&apos;s voice</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          Pick the voice that sounds right for your second brain. These are neutral voices — your
          own recordings, once you make them, always come first, and this voice only speaks when
          there&apos;s no recording of you. Change it any time.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {(
            [
              { value: "female", label: "A woman's voice" },
              { value: "male", label: "A man's voice" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateProfile({ ...profile, voice: option.value })}
              className={
                profile.voice === option.value
                  ? "rounded-full bg-[#2f5d3a] px-6 py-3 font-semibold text-white"
                  : "rounded-full border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-800 transition hover:border-[#2f5d3a]"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Where you&apos;re starting from</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          Your story, in your words: where you are with food and habits right now, and what
          you&apos;re working on. A few sentences is plenty — this is what your second brain
          remembers about you, so it talks with you, not at you.
        </p>
        <textarea
          value={profile.story}
          onChange={(e) => {
            const next = { ...profile, story: e.target.value };
            setProfile(next);
            profileRef.current = next;
            storyRef.current = e.target.value;
          }}
          onBlur={() => saveUserProfile(profile).catch(() => {})}
          className={`${inputClass} mt-3 min-h-36`}
          placeholder="e.g. Evenings are my hard time. I do fine all day, then I get home from work and the kitchen calls. I'm working on pausing before I eat at night."
          maxLength={4000}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleDictation}
            disabled={dictation === "working"}
            className={
              dictation === "recording"
                ? "rounded-full bg-[#9a3b26] px-5 py-3 font-semibold text-white transition hover:bg-[#7f3120] disabled:opacity-50"
                : "rounded-full border border-stone-300 bg-white px-5 py-3 font-semibold text-stone-800 transition hover:border-[#2f5d3a] disabled:opacity-50"
            }
          >
            {dictation === "recording"
              ? "■ Stop — I'm done talking"
              : dictation === "working"
                ? "Turning your words into text…"
                : "🎙 Say it instead"}
          </button>
          <p className="text-sm text-stone-600">
            {dictation === "recording"
              ? "Listening — take your time. Tap stop when you're done."
              : "Talk it out and it lands in the box, in your words."}
          </p>
        </div>
        {dictationNote && <p className="mt-2 text-sm text-stone-600">{dictationNote}</p>}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">My why</h2>
        <p className="mt-1 text-sm text-stone-600">
          One line, in your words — the reason that matters in the hard moment, not just at setup
          time. It shows up large on the SOS screen. (Same line as on the setup page.)
        </p>
        <input
          value={plan.whyLine}
          onChange={(e) => setPlan({ ...plan, whyLine: e.target.value })}
          onBlur={() => saveShieldPlan(plan).catch(() => {})}
          className={`${inputClass} mt-3`}
          placeholder="e.g. I want to feel good tomorrow morning"
          maxLength={140}
        />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">The moments that get me</h2>
        <p className="mt-1 text-sm text-stone-600">
          The situations where the urge tends to show up for you — named by you, in your words.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {profile.triggers.map((situation, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-700"
            >
              <span>{situation}</span>
              <button
                type="button"
                className={removeBtnClass}
                onClick={() =>
                  updateProfile({ ...profile, triggers: profile.triggers.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            value={newSituation}
            onChange={(e) => setNewSituation(e.target.value)}
            className={inputClass}
            placeholder="A moment — e.g. On the couch after dinner"
          />
          <button
            type="button"
            className={addBtnClass}
            disabled={!newSituation.trim()}
            onClick={() => {
              updateProfile({ ...profile, triggers: [...profile.triggers, newSituation.trim()] });
              setNewSituation("");
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">What I can do instead</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          For a moment that gets you, name what you can do instead — stocked and decided now, at
          calm time, so the moment doesn&apos;t have to invent it. Add more anytime in{" "}
          <Link href="/shield" className="font-medium text-[#2f5d3a] underline underline-offset-4">
            Your words — and what you'll have instead
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {plan.triggerOptions.map((to, i) => (
            <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-stone-900">{to.trigger}</p>
                <button
                  type="button"
                  className={removeBtnClass}
                  onClick={() =>
                    updatePlan({ ...plan, triggerOptions: plan.triggerOptions.filter((_, j) => j !== i) })
                  }
                >
                  Remove
                </button>
              </div>
              <input
                value={to.options[0] ?? ""}
                onChange={(e) => {
                  const copy = [...plan.triggerOptions];
                  const rest = copy[i].options.slice(1);
                  copy[i] = {
                    ...copy[i],
                    options: e.target.value.trim() ? [e.target.value, ...rest] : rest,
                  };
                  setPlan({ ...plan, triggerOptions: copy });
                }}
                onBlur={() => saveShieldPlan(plan).catch(() => {})}
                className={`${inputClass} mt-3`}
                placeholder="What I can do instead — in your own words…"
              />
              {to.options.length > 1 && (
                <p className="mt-2 text-sm text-stone-600">
                  Also saved for this moment: {to.options.slice(1).join("; ")}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <input
            value={newSwapSituation}
            onChange={(e) => setNewSwapSituation(e.target.value)}
            className={inputClass}
            placeholder="A moment — e.g. Watching TV"
          />
          <input
            value={newSwapInstead}
            onChange={(e) => setNewSwapInstead(e.target.value)}
            className={inputClass}
            placeholder="What I can do instead — e.g. Make tea and take it to the porch"
          />
          <button
            type="button"
            className={`${addBtnClass} self-start`}
            disabled={!newSwapSituation.trim()}
            onClick={() => {
              const situation = newSwapSituation.trim();
              const instead = newSwapInstead.trim();
              updatePlan({
                ...plan,
                triggerOptions: [
                  ...plan.triggerOptions,
                  { trigger: situation, options: instead ? [instead] : [] },
                ],
              });
              // A swap's moment is also one of "the moments that get
              // me" — keep the story's list honest without a second
              // typing of the same words.
              if (!profile.triggers.some((t) => t.toLowerCase() === situation.toLowerCase())) {
                updateProfile({ ...profile, triggers: [...profile.triggers, situation] });
              }
              setNewSwapSituation("");
              setNewSwapInstead("");
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Your word for today (optional)</h2>
        <p className="mt-1 text-sm text-stone-600">
          One word you want steering today. The one-word move speaks it back to you later today.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={wordDraft}
            onChange={(e) => setWordDraft(e.target.value)}
            className={inputClass}
            placeholder="e.g. Steady"
            maxLength={40}
          />
          <button
            type="button"
            className={addBtnClass}
            disabled={!wordDraft.trim()}
            onClick={() =>
              updatePlan({ ...plan, todayWord: wordDraft.trim(), todayWordDate: todayStr })
            }
          >
            Save
          </button>
        </div>
        {wordIsTodays && (
          <p className="mt-2 text-sm text-stone-600">Today&apos;s word is set: “{plan.todayWord}”.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-stone-900">Thoughts that pop up</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          The thought that pops up in a hard moment — and what you can tell yourself instead, in
          your own words — lives in{" "}
          <Link href="/shield" className="font-medium text-[#2f5d3a] underline underline-offset-4">
            Your words — and what you'll have instead
          </Link>
          , along with your voice recordings and how direct you want your second brain to be.
        </p>
      </section>

      <div className="mt-12 text-center">
        <Link
          href="/talk"
          className="inline-block rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
        >
          Talk with me
        </Link>
        <p className="mt-3 text-sm text-stone-600">
          That&apos;s it — everything saves as you go. Your story is ready when you are.
        </p>
      </div>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
