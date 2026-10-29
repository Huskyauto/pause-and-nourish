"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  addEntry,
  getCue,
  getEntry,
  getShieldPlan,
  updateEntry,
  type JournalEntry,
  type Need,
  type ShieldPlan,
} from "@/lib/journal";
import { PAUSE_TOOLS, toolById, toolForNeed, type PauseTool } from "@/lib/tools";

// Day 3 pause flow, voice-first:
//   notice path: check-in hands off (?entry=<id>) → tool picker (need-matched
//   tool first) → run → outcome capture (urge before → after).
//   SOS path: ?sos=1 → entry created on tap, recorded cue plays, plain SOS
//   screen (why line large + three locked taps) → Urge Surfing runs →
//   outcome capture. No form stands in front of the pause.
//   open path: plain /pause — the toolkit on its own, nothing logged.

type Phase =
  | "loading"
  | "sos"
  | "sos-exit"
  | "pick"
  | "run"
  | "outcome"
  | "choose"
  | "nourish"
  | "midpoint"
  | "respawn"
  | "learning"
  | "closed"
  | "done";
type Mode = "sos" | "notice" | "open";
type CueAnswer = "me" | "not-me" | "good";
type Choice = "eat" | "swap" | "delay";

// SOS entry creation must be idempotent across remount/refresh: the
// in-flight entry id is kept in sessionStorage, so a refresh of the SOS
// screen reuses the same journal entry instead of adding a second one.
// The guard is cleared when the flow reaches an exit, so a later, genuine
// SOS tap starts a fresh entry.
const SOS_GUARD_KEY = "pn.sosEntry";

async function getOrCreateSosEntry(): Promise<JournalEntry> {
  try {
    const raw = sessionStorage.getItem(SOS_GUARD_KEY);
    if (raw) {
      const guard = JSON.parse(raw) as { id: string; at: number };
      if (Date.now() - guard.at < 6 * 60 * 60 * 1000) {
        const found = await getEntry(guard.id).catch(() => null);
        if (found) return found;
      }
    }
  } catch {
    // No usable guard — create below.
  }
  const created = await addEntry({ source: "sos" });
  try {
    sessionStorage.setItem(SOS_GUARD_KEY, JSON.stringify({ id: created.id, at: Date.now() }));
  } catch {
    // sessionStorage unavailable — the entry still exists, just unguarded.
  }
  return created;
}

function clearSosGuard() {
  try {
    sessionStorage.removeItem(SOS_GUARD_KEY);
  } catch {
    // Nothing to clear.
  }
}

const SOS_CONTEXTS = [
  "Watching TV / shows",
  "Kitchen",
  "Driving / commute",
  "Work",
  "Out with people",
  "Alone at home",
  "Phone / scrolling",
  "Other",
];

const NEED_LABELS: { value: Need; label: string }[] = [
  { value: "comfort", label: "Comfort" },
  { value: "escape", label: "A break / escape" },
  { value: "soothe", label: "To soothe" },
  { value: "numb", label: "To go numb" },
  { value: "reward", label: "A reward" },
  { value: "relief", label: "Relief" },
  { value: "fuel", label: "Actual fuel" },
];

const chipBase =
  "rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2f5d3a]/30";
const chipIdle = "border-stone-300 bg-white text-stone-700 hover:border-[#2f5d3a]";
const chipActive = "border-[#2f5d3a] bg-[#2f5d3a] text-white";

export default function PauseClient() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [mode, setMode] = useState<Mode>("open");
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [whyLine, setWhyLine] = useState("");
  const [tool, setTool] = useState<PauseTool>(PAUSE_TOOLS[0]);
  const [recommended, setRecommended] = useState<PauseTool>(PAUSE_TOOLS[0]);

  // SOS cue playback
  const [cueUrl, setCueUrl] = useState<string | null>(null);
  const [cueNeedsTap, setCueNeedsTap] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [exitKind, setExitKind] = useState<"not-me" | "good">("good");

  // Runner
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startStampRef = useRef<number>(0);
  const pausedTotalRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);
  const completedRef = useRef(false);

  // Outcome capture
  const [urgeAfter, setUrgeAfter] = useState<number | null>(null);
  const [coping, setCoping] = useState<string>(PAUSE_TOOLS[0].name);
  const [effectiveness, setEffectiveness] = useState<number | null>(null);
  const [sosContext, setSosContext] = useState<string | null>(null);
  const [sosNeed, setSosNeed] = useState<Need | null>(null);

  // Day 4: Choose → (Nourish Menu | midpoint) → respawn → learning
  const [shieldPlan, setShieldPlan] = useState<ShieldPlan | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const resetAudioRef = useRef<HTMLAudioElement | null>(null);
  const [learningText, setLearningText] = useState("");
  const [learningSaved, setLearningSaved] = useState<string | null>(null);

  const initRef = useRef(false);

  // ---------- init ----------
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const entryId = searchParams.get("entry");
    const isSos = searchParams.get("sos") === "1";

    (async () => {
      if (isSos) {
        setMode("sos");
        const created = await getOrCreateSosEntry();
        setEntry(created);
        setTool(toolById("urge-surfing"));
        setCoping("Urge Surfing");
        try {
          const plan = await getShieldPlan();
          setWhyLine(plan.whyLine);
        } catch {
          // Fallback line covers it.
        }
        try {
          const cue = await getCue();
          if (cue) setCueUrl(URL.createObjectURL(cue.blob));
        } catch {
          // No cue — the hook stays silent and invisible (spec §2.2).
        }
        setPhase("sos");
        return;
      }
      if (entryId) {
        const found = await getEntry(entryId).catch(() => null);
        if (found) {
          setEntry(found);
          setMode("notice");
          const rec = toolForNeed(found.need);
          setRecommended(rec);
          setTool(rec);
          setCoping(rec.name);
          setPhase("pick");
          return;
        }
      }
      setMode("open");
      setPhase("pick");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- SOS: play the cue once when the screen opens ----------
  useEffect(() => {
    if (phase !== "sos" || !cueUrl) return;
    const audio = new Audio(cueUrl);
    audioRef.current = audio;
    audio.play().catch(() => setCueNeedsTap(true));
    return () => {
      audio.pause();
    };
  }, [phase, cueUrl]);

  // ---------- SOS: auto-start Urge Surfing if no tap in 12s ----------
  useEffect(() => {
    if (phase !== "sos") return;
    const t = setTimeout(() => startRun(toolById("urge-surfing")), 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function answerSos(answer: CueAnswer) {
    if (entry) {
      updateEntry(entry.id, { cueAnswer: answer }).catch(() => {});
      setEntry((e) => (e ? { ...e, cueAnswer: answer } : e));
    }
    if (answer === "me") {
      startRun(toolById("urge-surfing"));
    } else {
      clearSosGuard();
      setExitKind(answer);
      setPhase("sos-exit");
    }
  }

  // ---------- runner ----------
  function startRun(t: PauseTool) {
    setTool(t);
    setCoping(t.name);
    setElapsed(0);
    completedRef.current = false;
    pausedTotalRef.current = 0;
    startStampRef.current = Date.now();
    setRunning(true);
    setPhase("run");
  }

  useEffect(() => {
    if (phase !== "run" || !running) return;
    const iv = setInterval(() => {
      const secs = (Date.now() - startStampRef.current - pausedTotalRef.current) / 1000;
      setElapsed(secs);
      if (secs >= tool.durationSeconds && !completedRef.current) {
        completedRef.current = true;
        finishRun(true);
      }
    }, 200);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, running, tool]);

  function togglePause() {
    if (running) {
      pauseStartRef.current = Date.now();
      setRunning(false);
    } else {
      pausedTotalRef.current += Date.now() - pauseStartRef.current;
      setRunning(true);
    }
  }

  async function finishRun(completed: boolean) {
    setRunning(false);
    if (entry) {
      const updated = await updateEntry(entry.id, {
        pauseCompleted: completed,
        copingUsed: tool.name,
      }).catch(() => null);
      if (updated) setEntry(updated);
    }
    setPhase("outcome");
  }

  async function saveOutcome() {
    if (entry) {
      const patch: Partial<JournalEntry> = {
        urgeAfter,
        copingUsed: coping,
        copingEffectiveness: effectiveness,
      };
      if (entry.source === "sos") {
        // SOS entries start blank — the optional after-the-fact context and
        // need land here, and urge-after stands on its own (no delta).
        if (sosContext) patch.context = sosContext;
        if (sosNeed) patch.need = sosNeed;
      }
      const updated = await updateEntry(entry.id, patch).catch(() => null);
      if (updated) setEntry(updated);
      setPhase("choose");
      return;
    }
    setPhase("done");
  }

  // ---------- Day 4: Choose ----------

  // Load the Shield Plan when the Choose step opens (Nourish Menu source).
  useEffect(() => {
    if (phase !== "choose" || shieldPlan) return;
    getShieldPlan()
      .then(setShieldPlan)
      .catch(() => setShieldPlan(null));
  }, [phase, shieldPlan]);

  async function choose(choice: Choice) {
    if (entry) {
      const updated = await updateEntry(entry.id, { choice }).catch(() => null);
      if (updated) setEntry(updated);
    }
    if (choice === "eat") {
      setPhase("midpoint");
    } else if (choice === "swap") {
      setPhase("nourish");
    } else {
      void enterRespawn();
    }
  }

  async function enterRespawn() {
    try {
      const reset = await getCue("reset");
      if (reset) setResetUrl(URL.createObjectURL(reset.blob));
    } catch {
      // No reset line — the respawn screen is complete in text.
    }
    setPhase("respawn");
  }

  // Respawn: play the reset line once when the screen opens (falls back to
  // the "Hear my reset line" exit if the browser wants a tap first).
  useEffect(() => {
    if (phase !== "respawn" || !resetUrl) return;
    const audio = new Audio(resetUrl);
    resetAudioRef.current = audio;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
    };
  }, [phase, resetUrl]);

  async function saveLearning() {
    const text = learningText.trim();
    if (entry && text) {
      const updated = await updateEntry(entry.id, { learning: text }).catch(() => null);
      if (updated) setEntry(updated);
      setLearningSaved(text);
    }
    clearSosGuard();
    setPhase("closed");
  }

  // ---------- derived runner display ----------
  const remaining = Math.max(0, tool.durationSeconds - Math.floor(elapsed));
  const progress = Math.min(100, (elapsed / tool.durationSeconds) * 100);
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  let beatText = "";
  if (tool.script.kind === "beats") {
    for (const b of tool.script.beats) {
      if (elapsed >= b.at) beatText = b.text;
    }
  }

  let breathLabel = "";
  let breathCount = 0;
  if (tool.script.kind === "breath") {
    const phases = tool.script.phases;
    const cycle = phases.reduce((s, p) => s + p.seconds, 0);
    let pos = elapsed % cycle;
    for (const p of phases) {
      if (pos < p.seconds) {
        breathLabel = p.label;
        breathCount = Math.ceil(p.seconds - pos);
        break;
      }
      pos -= p.seconds;
    }
  }

  const urgeBefore = entry?.urgeIntensity ?? null;
  const deltaKnown = urgeBefore !== null && urgeAfter !== null;

  // ---------- render ----------
  if (phase === "loading") {
    return <p className="mt-10 text-center text-stone-600">Loading the pause…</p>;
  }

  return (
    <div>
      {phase === "sos" && (
        <div className="mt-6 flex flex-col items-center text-center">
          <div
            aria-hidden="true"
            className="h-3 w-3 animate-pulse rounded-full bg-[#9a3b26]/50"
          />
          <p className="mt-8 max-w-lg text-3xl font-bold leading-snug text-stone-900">
            {whyLine.trim() || "I want to feel good tomorrow morning."}
          </p>
          <p className="mt-3 max-w-md leading-relaxed text-stone-600">
            That&apos;s your why. This is a tricky moment — it&apos;s already moving.
          </p>
          {cueNeedsTap && cueUrl && (
            <button
              type="button"
              className="mt-5 rounded-full border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-800"
              onClick={() => audioRef.current?.play().catch(() => {})}
            >
              ▶ Hear your cue
            </button>
          )}
          <div className="mt-10 flex w-full max-w-md flex-col gap-3">
            <button
              type="button"
              onClick={() => answerSos("me")}
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              That was me
            </button>
            <button
              type="button"
              onClick={() => answerSos("not-me")}
              className="rounded-full border border-stone-300 bg-white px-8 py-4 text-lg font-semibold text-stone-800"
            >
              Not me this time
            </button>
            <button
              type="button"
              onClick={() => answerSos("good")}
              className="rounded-full border border-stone-300 bg-white px-8 py-4 text-lg font-semibold text-stone-800"
            >
              I&apos;m good for now
            </button>
          </div>
          <p className="mt-6 text-sm text-stone-600">
            No tap needed — the pause starts on its own in a few seconds.
          </p>
        </div>
      )}

      {phase === "sos-exit" && (
        <div className="mt-10 text-center">
          {exitKind === "not-me" ? (
            <>
              <h2 className="text-3xl font-bold text-stone-900">Got it.</h2>
              <p className="mx-auto mt-3 max-w-md leading-relaxed text-stone-600">
                Logged as not-this-time. Answers like this are how your pattern view learns what
                isn&apos;t a moment.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-stone-900">Good — it passed.</h2>
              <p className="mx-auto mt-3 max-w-md leading-relaxed text-stone-600">
                And you still logged it. That&apos;s the rep most people skip.
              </p>
            </>
          )}
          <Link
            href="/"
            className="mt-8 inline-block rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
          >
            Back home
          </Link>
        </div>
      )}

      {phase === "pick" && (
        <div className="mt-8">
          {mode === "notice" && entry && (
            <p className="text-center font-medium text-[#2f5d3a]">✓ Check-in saved on this device.</p>
          )}
          {mode === "notice" && entry?.plannedResponse && (
            <p className="mx-auto mt-2 max-w-md text-center leading-relaxed text-stone-600">
              Your Shield Plan for this: <span className="font-medium text-stone-900">{entry.plannedResponse}</span>
            </p>
          )}
          <h2 className="mt-6 text-center text-2xl font-bold text-stone-900">
            {mode === "notice" ? "Ninety seconds. Pick your tool." : "The toolkit — pick what fits."}
          </h2>
          {mode === "notice" && (
            <button
              type="button"
              onClick={() => startRun(recommended)}
              className="mt-6 w-full rounded-2xl border-2 border-[#2f5d3a] bg-[#e7efe3] p-5 text-left shadow-sm transition hover:bg-[#dfe9da]"
            >
              <span className="text-sm font-semibold tracking-wide text-[#2f5d3a] uppercase">
                Start here
              </span>
              <span className="mt-1 block text-xl font-bold text-stone-900">{recommended.name}</span>
              <span className="mt-1 block leading-relaxed text-stone-600">{recommended.tagline}</span>
            </button>
          )}
          <div className="mt-4 flex flex-col gap-3">
            {PAUSE_TOOLS.filter((t) => mode !== "notice" || t.id !== recommended.id).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => startRun(t)}
                className="w-full rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:border-[#2f5d3a]"
              >
                <span className="block text-lg font-semibold text-stone-900">{t.name}</span>
                <span className="mt-1 block leading-relaxed text-stone-600">{t.tagline}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "run" && (
        <div className="mt-8 flex flex-col items-center">
          <h2 className="text-2xl font-bold text-stone-900">{tool.name}</h2>
          <div
            className="relative mt-8 flex h-56 w-56 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#2f5d3a ${progress}%, #e7efe3 ${progress}%)`,
            }}
            role="timer"
            aria-live="polite"
            aria-label={`${remaining} seconds remaining`}
          >
            <div className="flex h-44 w-44 flex-col items-center justify-center rounded-full bg-[#faf7f0] px-4 text-center">
              {tool.script.kind === "breath" ? (
                <>
                  <span className="text-2xl font-bold text-stone-900">{breathLabel}</span>
                  <span className="mt-1 text-5xl font-bold tabular-nums text-stone-900">{breathCount}</span>
                  <span className="mt-1 text-sm text-stone-600">
                    {mm}:{ss} left in the pause
                  </span>
                </>
              ) : (
                <>
                  <span className="text-5xl font-bold tabular-nums text-stone-900">
                    {mm}:{ss}
                  </span>
                  <span className="mt-1 text-sm text-stone-600">
                    {running ? "pausing…" : "paused"}
                  </span>
                </>
              )}
            </div>
          </div>

          {tool.script.kind === "beats" && (
            <p className="mt-8 min-h-16 max-w-md text-center text-lg leading-relaxed text-stone-800">
              {beatText}
            </p>
          )}
          {tool.script.kind === "breath" && (
            <p className="mt-8 max-w-md text-center leading-relaxed text-stone-600">{tool.tagline}</p>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={togglePause}
              className="rounded-full border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-800"
            >
              {running ? "Pause the timer" : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => finishRun(false)}
              className="rounded-full border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-800"
            >
              End the pause here
            </button>
          </div>
          <p className="mt-4 max-w-md text-center text-sm text-stone-600">
            Leaving early is fine — it still counts, and you&apos;ll get the same quick check after.
          </p>
        </div>
      )}

      {phase === "outcome" && (
        <div className="mt-8">
          <h2 className="text-center text-2xl font-bold text-stone-900">Quick check — how is it now?</h2>

          <p className="mt-8 text-center font-medium text-stone-900">
            {urgeBefore !== null
              ? `The pull was ${urgeBefore} when you started. Where is it now?`
              : "How strong is the pull right now?"}
          </p>
          <div className="mt-3 flex justify-center gap-2" role="group" aria-label="Urge now, 0 to 5">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={urgeAfter === n}
                onClick={() => setUrgeAfter(n)}
                className={`${chipBase} px-4 py-3 text-base ${urgeAfter === n ? chipActive : chipIdle}`}
              >
                {n}
              </button>
            ))}
          </div>
          {deltaKnown && (
            <p className="mt-4 text-center text-lg font-semibold text-stone-900" aria-live="polite">
              {urgeBefore} → {urgeAfter}
              {urgeAfter! < urgeBefore!
                ? " — it dropped. That's your proof this works."
                : urgeAfter === urgeBefore
                  ? " — it held. You still did the rep."
                  : " — it climbed this time. Noted, no judgment — that's pattern data."}
            </p>
          )}

          <p className="mt-8 text-center font-medium text-stone-900">What did you use?</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {PAUSE_TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={coping === t.name}
                onClick={() => setCoping(t.name)}
                className={`${chipBase} ${coping === t.name ? chipActive : chipIdle}`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <p className="mt-8 text-center font-medium text-stone-900">How well did it work?</p>
          <div className="mt-3 flex justify-center gap-2" role="group" aria-label="Effectiveness, 1 to 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={effectiveness === n}
                onClick={() => setEffectiveness(n)}
                className={`${chipBase} px-4 py-3 text-base ${effectiveness === n ? chipActive : chipIdle}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-sm text-stone-600">1 = barely · 5 = it carried me through</p>

          {entry?.source === "sos" && (
            <>
              <p className="mt-10 text-center font-medium text-stone-900">
                Want to note what was pulling you? <span className="font-normal text-stone-600">(optional — skip anything)</span>
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SOS_CONTEXTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={sosContext === c}
                    onClick={() => setSosContext(sosContext === c ? null : c)}
                    className={`${chipBase} ${sosContext === c ? chipActive : chipIdle}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {NEED_LABELS.map((n) => (
                  <button
                    key={n.value}
                    type="button"
                    aria-pressed={sosNeed === n.value}
                    onClick={() => setSosNeed(sosNeed === n.value ? null : n.value)}
                    className={`${chipBase} ${sosNeed === n.value ? chipActive : chipIdle}`}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={saveOutcome}
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              Save &amp; finish
            </button>
            <p className="mt-3">
              <button
                type="button"
                onClick={() => setPhase(entry ? "choose" : "done")}
                className="text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
              >
                Skip — just finish
              </button>
            </p>
          </div>
        </div>
      )}

      {phase === "choose" && (
        <div className="mt-8">
          <h2 className="text-center text-2xl font-bold text-stone-900">You paused. Now it&apos;s your call.</h2>
          {deltaKnown && (
            <p className="mt-3 text-center text-lg font-semibold text-stone-900">
              {urgeBefore} → {urgeAfter} — the pause did its part. The choice is yours.
            </p>
          )}
          <p className="mx-auto mt-3 max-w-md text-center leading-relaxed text-stone-600">
            Eat it, swap it, or delay it a few minutes. All three count. Nothing here is scored.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => choose("eat")}
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              Eat it
            </button>
            <button
              type="button"
              onClick={() => choose("swap")}
              className="rounded-full border border-stone-300 bg-white px-8 py-4 text-lg font-semibold text-stone-800"
            >
              Swap
            </button>
            <button
              type="button"
              onClick={() => choose("delay")}
              className="rounded-full border border-stone-300 bg-white px-8 py-4 text-lg font-semibold text-stone-800"
            >
              Delay
            </button>
          </div>
        </div>
      )}

      {phase === "nourish" && (
        <div className="mt-8">
          <h2 className="text-center text-2xl font-bold text-stone-900">Your Nourish Menu</h2>
          <p className="mx-auto mt-3 max-w-md text-center leading-relaxed text-stone-600">
            The swaps you stocked for moments like this — yours, chosen at a calm time.
          </p>
          {entry?.plannedResponse && (
            <div className="mt-6 rounded-2xl border-2 border-[#2f5d3a] bg-[#e7efe3] p-5 shadow-sm">
              <p className="text-sm font-semibold tracking-wide text-[#2f5d3a] uppercase">
                Your plan for this moment
              </p>
              <p className="mt-1 text-lg font-semibold text-stone-900">{entry.plannedResponse}</p>
            </div>
          )}
          {shieldPlan && shieldPlan.triggerOptions.some((t) => t.options.length > 0) ? (
            <div className="mt-4 flex flex-col gap-3">
              {shieldPlan.triggerOptions
                .filter((t) => t.options.length > 0)
                .map((t) => (
                  <div key={t.trigger} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <p className="font-semibold text-stone-900">{t.trigger}</p>
                    <ul className="mt-2 flex flex-col gap-1 text-stone-700">
                      {t.options.map((o) => (
                        <li key={o}>• {o}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : (
            !entry?.plannedResponse && (
              <p className="mx-auto mt-6 max-w-md text-center leading-relaxed text-stone-600">
                Nothing is stocked yet. You can add your own swaps in your{" "}
                <Link href="/shield" className="font-medium text-[#2f5d3a] underline underline-offset-4">
                  Shield Plan
                </Link>{" "}
                at a calm time — they will be waiting here.
              </p>
            )
          )}
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => void enterRespawn()}
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              That&apos;s my swap
            </button>
          </div>
        </div>
      )}

      {phase === "midpoint" && (
        <div className="mt-8 text-center">
          <h2 className="text-2xl font-bold text-stone-900">Eating it — on purpose.</h2>
          <p className="mx-auto mt-3 max-w-md leading-relaxed text-stone-600">
            That&apos;s a real choice, and it counts. One optional check, partway through:
          </p>
          <p className="mt-8 text-lg font-medium text-stone-900">
            Still hungry, still enjoying it, both, or neither?
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {["Still hungry", "Still enjoying it", "Both", "Neither"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => void enterRespawn()}
                className={`${chipBase} px-5 py-3 text-base ${chipIdle}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-5">
            <button
              type="button"
              onClick={() => void enterRespawn()}
              className="text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
            >
              Skip this check
            </button>
          </p>
        </div>
      )}

      {phase === "respawn" && (
        <div className="mt-10 text-center">
          <h2 className="text-3xl font-bold text-stone-900">Checkpoint saved. Nothing reset.</h2>
          <p className="mx-auto mt-4 max-w-md leading-relaxed text-stone-600">
            You paused before you chose — that&apos;s the rep. One miss doesn&apos;t change the pattern.
          </p>
          {resetUrl && (
            <p className="mt-3 text-sm text-stone-600">Your reset line, in your own voice.</p>
          )}
          <div className="mt-8 flex flex-col items-center gap-3">
            {resetUrl && (
              <button
                type="button"
                onClick={() => resetAudioRef.current?.play().catch(() => {})}
                className="w-full max-w-md rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
              >
                ▶ Hear my reset line
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhase("learning")}
              className={`w-full max-w-md rounded-full px-8 py-4 text-lg font-semibold ${
                resetUrl
                  ? "border border-stone-300 bg-white text-stone-800"
                  : "bg-[#2f5d3a] text-white shadow-sm transition hover:bg-[#274c30]"
              }`}
            >
              Log one line in my words
            </button>
            <Link
              href="/"
              onClick={clearSosGuard}
              className="w-full max-w-md rounded-full border border-stone-300 bg-white px-8 py-4 text-lg font-semibold text-stone-800"
            >
              Just close
            </Link>
          </div>
        </div>
      )}

      {phase === "learning" && (
        <div className="mt-8">
          <h2 className="text-center text-2xl font-bold text-stone-900">
            Is there one thing you&apos;d like Pause &amp; Nourish to remember?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center leading-relaxed text-stone-600">
            One line, in your words. It stays on this device, attached to this moment.
          </p>
          <textarea
            value={learningText}
            onChange={(e) => setLearningText(e.target.value)}
            rows={3}
            maxLength={300}
            className="mt-6 w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
            placeholder="In my words…"
            aria-label="One thing to remember"
          />
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={saveLearning}
              disabled={!learningText.trim()}
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30] disabled:opacity-40"
            >
              Remember this
            </button>
            <p className="mt-3">
              <button
                type="button"
                onClick={() => {
                  clearSosGuard();
                  setPhase("closed");
                }}
                className="text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
              >
                Skip
              </button>
            </p>
          </div>
        </div>
      )}

      {phase === "closed" && (
        <div className="mt-10 text-center">
          <h2 className="text-3xl font-bold text-stone-900">Saved.</h2>
          {learningSaved && (
            <p className="mx-auto mt-3 max-w-md leading-relaxed text-stone-600">
              Remembered, in your words: <span className="font-medium text-stone-900">&ldquo;{learningSaved}&rdquo;</span>
            </p>
          )}
          <p className="mx-auto mt-3 max-w-md leading-relaxed text-stone-600">
            Whatever you chose, you chose it on purpose — after a pause. That&apos;s the pattern
            you&apos;re building.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              Back home
            </Link>
            <button
              type="button"
              onClick={() => setPhase("pick")}
              className="rounded-full border border-stone-300 bg-white px-8 py-4 text-lg font-semibold text-stone-800"
            >
              Another pause
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-10 text-center">
          {deltaKnown ? (
            <>
              <p className="text-5xl font-bold tabular-nums text-stone-900">
                {urgeBefore} → {urgeAfter}
              </p>
              <p className="mx-auto mt-4 max-w-md leading-relaxed text-stone-600">
                {urgeAfter! < urgeBefore!
                  ? "Ninety seconds, and the pull moved. That's the whole idea — and now it's in your pattern, in your own numbers."
                  : "The number is what it is — you paused, you noticed, you chose on purpose. That's the rep."}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-stone-900">You paused. That&apos;s the rep.</h2>
              <p className="mx-auto mt-3 max-w-md leading-relaxed text-stone-600">
                Whatever you choose next is a real choice — that&apos;s the whole point of the pause.
              </p>
            </>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              Back home
            </Link>
            <button
              type="button"
              onClick={() => setPhase("pick")}
              className="rounded-full border border-stone-300 bg-white px-8 py-4 text-lg font-semibold text-stone-800"
            >
              Another pause
            </button>
          </div>
          <p className="mt-6 text-sm text-stone-600">
            Eat, swap, or delay — all three are fine, and all three count.
          </p>
        </div>
      )}
    </div>
  );
}
