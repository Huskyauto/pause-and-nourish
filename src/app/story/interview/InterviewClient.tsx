"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getShieldPlan,
  saveShieldPlan,
  saveUserProfile,
  type ProfileVoice,
  type ShieldPlan,
  type UserProfile,
} from "@/lib/journal";
import { speakLineChecked } from "@/lib/speak";
import { transcribeBlob } from "@/lib/wav";

// "Your story" as a conversation (Bob's ruling, 2026-10-31): the
// brain asks one question at a time out loud, the user answers out
// loud, follow-ups adapt to what they said, and the brain closes
// when its coverage is met — name, voice choice, story, why line,
// a trigger, a swap (or their "none yet"). On close, the captured
// items land in the same profile/plan stores the typed review
// surface (/story) edits. There is no scripted fallback here: if
// the brain can't be reached, this page says so plainly and points
// at the typing surface — it never fakes an interview.
//
// The recorder below mirrors TalkClient's spoken-answer endpointing
// (silence after speech ends the turn; ■ Done is the manual
// override; the ceiling only bounds a turn that never goes quiet).
// Keep the constants in step with TalkClient's — same tuning.
const ANSWER_SILENCE_MS = 1800;
const ANSWER_MAX_MS = 120000;
const SPEECH_RMS_THRESHOLD = 0.02;

interface Turn {
  role: "brain" | "user";
  text: string;
}

interface Captured {
  name: string;
  story: string;
  whyLine: string;
  triggers: string[];
  swaps: { situation: string; option: string }[];
  voice: ProfileVoice;
}

interface IntakeResponse {
  say?: unknown;
  done?: unknown;
  voice?: unknown;
  captured?: unknown;
}

type Phase = "ready" | "busy" | "listening" | "unavailable" | "done";

function chunkForSpeak(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > 240) {
    const slice = rest.slice(0, 240);
    const idx = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
    if (idx < 60) break;
    chunks.push(rest.slice(0, idx + 1).trim());
    rest = rest.slice(idx + 1).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function phoneSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      const utter = new SpeechSynthesisUtterance(text);
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      synth.speak(utter);
      setTimeout(resolve, 30000);
    } catch {
      resolve();
    }
  });
}

export default function InterviewClient() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [status, setStatus] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [voice, setVoice] = useState<ProfileVoice>("female");
  const [captured, setCaptured] = useState<Captured | null>(null);

  const historyRef = useRef<Turn[]>([]);
  const voiceRef = useRef<ProfileVoice>("female");
  const aliveRef = useRef(true);
  const stopRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopRef.current?.();
    };
  }, []);

  async function speak(text: string): Promise<void> {
    for (const chunk of chunkForSpeak(text)) {
      if (!aliveRef.current) return;
      if (!(await speakLineChecked(chunk, voiceRef.current))) {
        await phoneSpeak(chunk);
      }
    }
  }

  function recordAnswerAudio(): Promise<Blob | null> {
    return new Promise((resolve) => {
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream);
          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          let settled = false;
          let meterTimer: number | null = null;
          let audioCtx: AudioContext | null = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            stopRef.current = null;
            if (meterTimer !== null) window.clearInterval(meterTimer);
            if (audioCtx) audioCtx.close().catch(() => {});
            stream.getTracks().forEach((t) => t.stop());
            resolve(
              chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null,
            );
          };
          recorder.onstop = finish;
          stopRef.current = () => {
            if (recorder.state !== "inactive") recorder.stop();
          };
          try {
            const AC: typeof AudioContext | undefined =
              window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;
            if (AC) {
              audioCtx = new AC();
              void audioCtx.resume().catch(() => {});
              const source = audioCtx.createMediaStreamSource(stream);
              const analyser = audioCtx.createAnalyser();
              analyser.fftSize = 512;
              source.connect(analyser);
              const samples = new Float32Array(analyser.fftSize);
              let heardSpeech = false;
              let lastSpeechAt = performance.now();
              meterTimer = window.setInterval(() => {
                if (recorder.state === "inactive") return;
                analyser.getFloatTimeDomainData(samples);
                let sum = 0;
                for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
                const rms = Math.sqrt(sum / samples.length);
                const now = performance.now();
                if (rms >= SPEECH_RMS_THRESHOLD) {
                  heardSpeech = true;
                  lastSpeechAt = now;
                } else if (heardSpeech && now - lastSpeechAt >= ANSWER_SILENCE_MS) {
                  stopRef.current?.();
                }
              }, 100);
            }
          } catch {
            // No metering on this device — the ceiling and the
            // ■ Done button still bound the turn.
          }
          recorder.start();
          setTimeout(() => stopRef.current?.(), ANSWER_MAX_MS);
        } catch {
          resolve(null);
        }
      })();
    });
  }

  async function finishInterview(done: Captured): Promise<void> {
    const profile: UserProfile = {
      name: done.name,
      story: done.story,
      triggers: Array.from(
        new Set([...done.triggers, ...done.swaps.map((s) => s.situation)]),
      ).slice(0, 16),
      voice: done.voice,
    };
    await saveUserProfile(profile).catch(() => {});
    const plan: ShieldPlan = await getShieldPlan();
    if (done.whyLine) plan.whyLine = done.whyLine;
    for (const swap of done.swaps) {
      const existing = plan.triggerOptions.find(
        (entry) => entry.trigger.trim().toLowerCase() === swap.situation.trim().toLowerCase(),
      );
      if (existing) {
        if (!existing.options.some((o) => o.trim().toLowerCase() === swap.option.trim().toLowerCase())) {
          existing.options.push(swap.option);
        }
      } else {
        plan.triggerOptions.push({ trigger: swap.situation, options: [swap.option] });
      }
    }
    await saveShieldPlan(plan).catch(() => {});
    setCaptured(done);
    setPhase("done");
    setStatus("");
  }

  async function listen(): Promise<void> {
    if (!aliveRef.current) return;
    setPhase("listening");
    setStatus("Listening — I'll send it when you finish talking. Tap Done to send it right away.");
    const blob = await recordAnswerAudio();
    if (!aliveRef.current) return;
    if (!blob) {
      setPhase("busy");
      setStatus("I didn't catch that. Tap Answer and say it again.");
      busyRef.current = false;
      return;
    }
    setPhase("busy");
    setStatus("One moment…");
    const text = await transcribeBlob(blob);
    if (!aliveRef.current) return;
    if (!text) {
      setStatus("I didn't catch that. Tap Answer and say it again.");
      busyRef.current = false;
      return;
    }
    historyRef.current = [...historyRef.current, { role: "user", text }];
    setTurns(historyRef.current);
    await askBrain();
  }

  async function askBrain(): Promise<void> {
    if (!aliveRef.current) return;
    busyRef.current = true;
    setPhase("busy");
    setStatus("One moment…");
    let data: IntakeResponse | null = null;
    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "intake", history: historyRef.current }),
      });
      if (res.ok) data = (await res.json()) as IntakeResponse;
    } catch {
      data = null;
    }
    if (!aliveRef.current) return;
    if (!data || typeof data.say !== "string" || !data.say.trim()) {
      // Honest unavailability — no fabricated interview line, ever.
      busyRef.current = false;
      setPhase("unavailable");
      setStatus("");
      return;
    }
    if (data.voice === "female" || data.voice === "male") {
      voiceRef.current = data.voice;
      setVoice(data.voice);
    }
    const say = data.say.trim();
    historyRef.current = [...historyRef.current, { role: "brain", text: say }];
    setTurns(historyRef.current);
    setStatus("");
    await speak(say);
    if (!aliveRef.current) return;
    if (data.done === true && data.captured && typeof data.captured === "object") {
      await finishInterview(data.captured as Captured);
      busyRef.current = false;
      return;
    }
    busyRef.current = false;
    await listen();
  }

  function begin(): void {
    if (busyRef.current) return;
    historyRef.current = [];
    setTurns([]);
    setCaptured(null);
    void askBrain();
  }

  function answerAgain(): void {
    if (busyRef.current) return;
    busyRef.current = true;
    void listen().finally(() => {
      busyRef.current = false;
    });
  }

  return (
    <div className="mt-8">
      {turns.length > 0 && (
        <div className="space-y-3">
          {turns.map((turn, i) => (
            <div
              key={i}
              className={
                turn.role === "brain"
                  ? "rounded-2xl bg-[#eef4ec] px-4 py-3 text-stone-800"
                  : "rounded-2xl bg-stone-100 px-4 py-3 text-stone-800"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {turn.role === "brain" ? "Your second brain" : "You"}
              </p>
              <p className="mt-1 leading-relaxed">{turn.text}</p>
            </div>
          ))}
        </div>
      )}

      {status && <p className="mt-5 text-center text-stone-600">{status}</p>}

      {phase === "ready" && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={begin}
            className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white"
          >
            Start — I&apos;ll ask, you answer out loud
          </button>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-stone-600">
            A few questions, one at a time. It takes a couple of minutes, and you can stop any
            time — nothing here is required to use the app.
          </p>
        </div>
      )}

      {phase === "listening" && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => stopRef.current?.()}
            className="rounded-full bg-stone-800 px-8 py-4 text-lg font-semibold text-white"
          >
            ■ Done
          </button>
        </div>
      )}

      {phase === "busy" && status.includes("didn't catch") && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={answerAgain}
            className="rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white"
          >
            Answer
          </button>
        </div>
      )}

      {phase === "unavailable" && (
        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-4 text-center">
          <p className="leading-relaxed text-stone-800">
            I can&apos;t reach the brain right now, so the spoken questions can&apos;t run. Your
            story still counts — you can type it instead, and it works the same.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void askBrain()}
              className="rounded-full bg-[#2f5d3a] px-6 py-3 font-semibold text-white"
            >
              Try again
            </button>
            <Link
              href="/story"
              className="rounded-full bg-stone-800 px-6 py-3 font-semibold text-white"
            >
              Type your story instead
            </Link>
          </div>
        </div>
      )}

      {phase === "done" && captured && (
        <div className="mt-6 rounded-2xl bg-[#eef4ec] px-5 py-5">
          <h2 className="text-lg font-semibold text-stone-900">Here&apos;s what I heard</h2>
          <dl className="mt-3 space-y-3 text-stone-800">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Name</dt>
              <dd className="mt-0.5">{captured.name}</dd>
            </div>
            {captured.story && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Your story
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{captured.story}</dd>
              </div>
            )}
            {captured.whyLine && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Your why line
                </dt>
                <dd className="mt-0.5">{captured.whyLine}</dd>
              </div>
            )}
            {captured.triggers.length > 0 && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  The moments that get you
                </dt>
                <dd className="mt-0.5">{captured.triggers.join(" · ")}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Your first swaps
              </dt>
              <dd className="mt-0.5">
                {captured.swaps.length > 0
                  ? captured.swaps.map((s) => `${s.situation} → ${s.option}`).join(" · ")
                  : "None yet — that's a fine place to start."}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Voice</dt>
              <dd className="mt-0.5">
                {captured.voice === "male" ? "A man's voice" : "A woman's voice"} — change it any
                time in Your story.
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/talk"
              className="rounded-full bg-[#2f5d3a] px-6 py-3 font-semibold text-white"
            >
              Talk with your second brain
            </Link>
            <Link
              href="/story"
              className="rounded-full bg-stone-800 px-6 py-3 font-semibold text-white"
            >
              Fix anything in your words
            </Link>
          </div>
        </div>
      )}

      {phase !== "done" && (
        <p className="mt-8 text-center text-sm text-stone-600">
          Voice so far: {voice === "male" ? "a man's voice" : "a woman's voice"}. Rather type?{" "}
          <Link href="/story" className="font-medium text-[#2f5d3a] underline underline-offset-4">
            The same story, typed
          </Link>{" "}
          ·{" "}
          <Link href="/" className="font-medium text-[#2f5d3a] underline underline-offset-4">
            Skip for now
          </Link>
        </p>
      )}
    </div>
  );
}
