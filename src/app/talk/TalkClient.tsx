"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addEntry,
  EMPTY_SHIELD_PLAN,
  getCue,
  getShieldPlan,
  hasCue,
  updateEntry,
  type CueKind,
  type JournalEntry,
  type ShieldPlan,
} from "@/lib/journal";
import {
  assemblePlan,
  CHOICE_QUESTION,
  dealtSwap,
  EMPTY_ANSWERS,
  nextStage,
  parseBranch,
  parseChoice,
  parseContext,
  parseHunger,
  parseNeed,
  parseUrge,
  phrasePlan,
  phraseStage,
  questionText,
  type PlanElement,
  type QuestionId,
  type TalkAnswers,
  type TalkStage,
} from "@/lib/spine";
import { applyDueDirectness } from "../shield/ShieldDay4";

// Talk It Through (Day 5): the conversation SOS. The app asks one
// question at a time out loud — the user's recorded prompt-pack clip
// when one exists, the phone's voice otherwise — the user answers out
// loud, Muse Voice Transcribe (via /api/transcribe) turns the answer
// into words, deterministic parsing (src/lib/spine.ts) reads the
// explicit values, and the game plan is dealt strictly from the user's
// own saved playbook and spoken back (Fish via /api/speak for that one
// dynamic line; phone voice as fallback). Zero menus during the
// conversation; the only screen after it is the plan card plus optional
// "for later" links. The tap-based SOS/pause flow is untouched.

type UiPhase = "ready" | "conversing" | "finished";
type CaptureMode = "idle" | "recording" | "sr" | "text";
type FinishKind = "swap" | "delay" | "deferred" | "ended" | null;

const QUESTION_KINDS: CueKind[] = ["q1", "q2", "q3", "q4", "q5"];

// Minimal typing for the browser's speech recognition fallback (used
// only when the Meta key isn't in yet — never the primary path).
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results?: { [i: number]: { [j: number]: { transcript?: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Meta's batch ASR endpoint only accepts mono 16-bit PCM WAV, so the
// recorded answer (webm/opus) is decoded, downmixed, resampled to
// 24 kHz, and re-encoded as WAV here in the browser before upload.
async function blobToWav(blob: Blob): Promise<Blob | null> {
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    void ctx.close();
    const targetRate = 24000;
    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frames, targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    out.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true); // PCM
    out.setUint16(22, 1, true); // mono
    out.setUint32(24, targetRate, true);
    out.setUint32(28, targetRate * 2, true);
    out.setUint16(32, 2, true);
    out.setUint16(34, 16, true);
    writeStr(36, "data");
    out.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      out.setInt16(44 + i * 2, s * (s < 0 ? 0x8000 : 0x7fff), true);
    }
    return new Blob([out.buffer], { type: "audio/wav" });
  } catch {
    return null;
  }
}

export default function TalkClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<UiPhase>("ready");
  const [currentLine, setCurrentLine] = useState("");
  const [status, setStatus] = useState("");
  const [heard, setHeard] = useState("");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("idle");
  const [textDraft, setTextDraft] = useState("");
  const [planElements, setPlanElements] = useState<PlanElement[]>([]);
  const [finishKind, setFinishKind] = useState<FinishKind>(null);
  const [closingLine, setClosingLine] = useState("");
  const [packIncomplete, setPackIncomplete] = useState(false);

  const aliveRef = useRef(true);
  const entryRef = useRef<JournalEntry | null>(null);
  const answersRef = useRef<TalkAnswers>({ ...EMPTY_ANSWERS });
  const planRef = useRef<ShieldPlan | null>(null);
  const retriesRef = useRef<Record<string, number>>({});
  // Answer capture path: "api" (record + /api/transcribe) until the
  // route reports the key is missing; then "sr" (browser recognition)
  // or "text" (one-answer type-in) for the rest of the conversation.
  const capturePathRef = useRef<"api" | "sr" | "text">("api");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const textResolverRef = useRef<((text: string) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // Nothing to cancel.
      }
      audioRef.current?.pause();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ---------- speech out ----------

  function phoneSpeak(text: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) return resolve();
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.98;
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        u.onend = finish;
        u.onerror = finish;
        synth.speak(u);
        // Never let a stuck utterance hang the conversation.
        setTimeout(finish, Math.max(3000, text.length * 95));
      } catch {
        resolve();
      }
    });
  }

  function playBlob(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            URL.revokeObjectURL(url);
            resolve();
          }
        };
        audio.addEventListener("ended", finish, { once: true });
        audio.addEventListener("error", finish, { once: true });
        audio.play().catch(finish);
        setTimeout(finish, 20000);
      } catch {
        resolve();
      }
    });
  }

  // Fish speaks ONE line; any failure falls back to the phone voice
  // speaking the same words. Used for the game plan only — questions
  // are the user's recordings or the phone voice (credit discipline).
  async function fishSpeak(text: string): Promise<boolean> {
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return false;
      const blob = await res.blob();
      await playBlob(blob);
      return true;
    } catch {
      return false;
    }
  }

  async function speakPlanLine(text: string): Promise<void> {
    if (text.length <= 300) {
      if (await fishSpeak(text)) return;
      await phoneSpeak(text);
      return;
    }
    // Fish caps a line at 300 chars — split at a sentence boundary:
    // Fish takes the first part, the phone voice the remainder.
    const cut = text.lastIndexOf(". ", 280);
    const head = cut > 60 ? text.slice(0, cut + 1) : text.slice(0, 280);
    const tail = text.slice(head.length).trim();
    if (await fishSpeak(head)) {
      if (tail) await phoneSpeak(tail);
    } else {
      await phoneSpeak(text);
    }
  }

  // Muse Spark phrases the line when the key is in; every failure
  // mode lands on the deterministic phrasing of the same stage.
  async function converseSay(stage: TalkStage): Promise<string> {
    const plan = planRef.current;
    const fallback = plan
      ? phraseStage(stage, answersRef.current, plan, plan.directness ?? null)
      : "";
    if (!plan) return fallback;
    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          answers: answersRef.current,
          shieldPlan: plan,
          directness: plan.directness ?? null,
        }),
      });
      if (!res.ok) return fallback;
      const data = (await res.json()) as { say?: unknown };
      return typeof data.say === "string" && data.say.trim() ? data.say : fallback;
    } catch {
      return fallback;
    }
  }

  // ---------- answer capture ----------

  function recordAnswerAudio(): Promise<Blob | null> {
    return new Promise((resolve) => {
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          const recorder = new MediaRecorder(stream);
          recorderRef.current = recorder;
          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            stopRecordingRef.current = null;
            stream.getTracks().forEach((t) => t.stop());
            const blob = chunks.length
              ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
              : null;
            resolve(blob);
          };
          recorder.onstop = finish;
          stopRecordingRef.current = () => {
            if (recorder.state !== "inactive") recorder.stop();
          };
          recorder.start();
          setTimeout(() => stopRecordingRef.current?.(), 12000);
        } catch {
          resolve(null);
        }
      })();
    });
  }

  function speechRecognizeOnce(): Promise<string | null> {
    return new Promise((resolve) => {
      const Ctor = speechRecognitionCtor();
      if (!Ctor) return resolve(null);
      try {
        const rec = new Ctor();
        rec.lang = "en-US";
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        let settled = false;
        const done = (value: string | null) => {
          if (settled) return;
          settled = true;
          try {
            rec.stop();
          } catch {
            // Already stopped.
          }
          resolve(value);
        };
        rec.onresult = (e) => done(e.results?.[0]?.[0]?.transcript ?? null);
        rec.onerror = () => done(null);
        rec.onend = () => done(null);
        rec.start();
        setTimeout(() => done(null), 15000);
      } catch {
        resolve(null);
      }
    });
  }

  function captureViaText(): Promise<string | null> {
    return new Promise((resolve) => {
      setTextDraft("");
      setCaptureMode("text");
      textResolverRef.current = (text: string) => {
        textResolverRef.current = null;
        setCaptureMode("idle");
        resolve(text.trim() ? text : null);
      };
    });
  }

  // One spoken answer, end to end. Returns the transcript (or null when
  // nothing usable was heard — the caller re-asks once, then moves on).
  async function captureAnswerText(): Promise<string | null> {
    if (capturePathRef.current === "sr") {
      setCaptureMode("sr");
      setStatus("Listening — just talk.");
      const text = await speechRecognizeOnce();
      setCaptureMode("idle");
      return text;
    }
    if (capturePathRef.current === "text") {
      setStatus("Type this one answer.");
      return captureViaText();
    }
    // Primary path: record, then Muse Voice Transcribe via the server.
    setCaptureMode("recording");
    setStatus("Listening — tap Done when you've said it.");
    const blob = await recordAnswerAudio();
    setCaptureMode("idle");
    if (!blob) return null;
    setStatus("One moment…");
    // Meta's ASR endpoint takes mono PCM WAV only — convert first.
    const wav = await blobToWav(blob);
    if (!wav) return null;
    try {
      const form = new FormData();
      form.append("audio", wav, "answer.wav");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (res.ok) {
        const data = (await res.json()) as { text?: unknown };
        return typeof data.text === "string" && data.text.trim() ? data.text : null;
      }
      let code = "";
      try {
        code = ((await res.json()) as { error?: string }).error ?? "";
      } catch {
        // Non-JSON body — treated as a plain failure below.
      }
      if (code === "meta_not_configured") {
        // The key isn't in yet: switch this conversation to the
        // browser's own recognition, or a one-answer type-in.
        capturePathRef.current = speechRecognitionCtor() ? "sr" : "text";
        return captureAnswerText();
      }
      return null;
    } catch {
      return null;
    }
  }

  // ---------- the flow ----------

  async function askQuestion(qid: QuestionId) {
    const text = questionText(qid);
    setCurrentLine(text);
    setStatus("");
    // The recorded prompt-pack clip wins over any generated phrasing.
    const clip = await getCue(qid).catch(() => null);
    if (!aliveRef.current) return;
    if (clip) {
      await playBlob(clip.blob);
    } else {
      const say = await converseSay(qid);
      if (!aliveRef.current) return;
      setCurrentLine(say || text);
      await phoneSpeak(say || text);
    }
    if (!aliveRef.current) return;
    const heardText = await captureAnswerText();
    if (!aliveRef.current) return;
    await handleAnswer(qid, heardText);
  }

  async function handleAnswer(qid: QuestionId, raw: string | null) {
    const answers = answersRef.current;
    const entry = entryRef.current;
    if (raw) setHeard(raw);

    const retry = async (): Promise<boolean> => {
      const used = retriesRef.current[qid] ?? 0;
      if (used >= 1) return false;
      retriesRef.current[qid] = used + 1;
      await phoneSpeak("I didn't catch that.");
      if (!aliveRef.current) return true;
      await askQuestion(qid);
      return true;
    };

    if (qid === "q1") {
      if (!raw) {
        if (await retry()) return;
      }
      const parsed = parseContext(raw ?? "");
      answers.context = parsed.context || null;
      answers.driving = parsed.driving;
      if (entry) updateEntry(entry.id, { context: answers.context }).catch(() => {});
    } else if (qid === "q2") {
      const kind = raw ? parseHunger(raw) : null;
      if (!kind && (await retry())) return;
      answers.hungerKind = kind;
      if (entry && kind) {
        updateEntry(entry.id, {
          hungerType: kind === "body" ? "physical" : kind === "pull" ? "emotional" : "both",
        }).catch(() => {});
      }
    } else if (qid === "q3") {
      const urge = raw ? parseUrge(raw) : null;
      if (urge === null && (await retry())) return;
      answers.urge = urge;
      if (entry && urge !== null) {
        updateEntry(entry.id, { urgeIntensity: urge }).catch(() => {});
      }
    } else if (qid === "q4") {
      if (!raw && (await retry())) return;
      answers.needRaw = raw;
      if (raw) {
        const parsed = parseNeed(raw);
        answers.need = parsed.need;
        answers.targetFood = parsed.targetFood;
        answers.window = parsed.window;
        if (entry) {
          const noteBits: string[] = [];
          if (parsed.targetFood) noteBits.push(`Wanted: ${parsed.targetFood}`);
          if (parsed.window) noteBits.push(`Window: ${parsed.window}`);
          updateEntry(entry.id, {
            need: parsed.need,
            ...(noteBits.length ? { note: noteBits.join(" · ") } : {}),
          }).catch(() => {});
        }
      }
    } else if (qid === "q5") {
      const branch = raw ? parseBranch(raw) : null;
      if (!branch && (await retry())) return;
      answers.branch = branch;
    }

    const stage = nextStage(answers, qid);
    await runStage(stage);
  }

  async function runStage(stage: TalkStage) {
    if (!aliveRef.current) return;
    if (stage === "q1" || stage === "q2" || stage === "q3" || stage === "q4" || stage === "q5") {
      await askQuestion(stage);
      return;
    }
    if (stage === "deferred") {
      const say = await converseSay("deferred");
      setCurrentLine(say);
      await phoneSpeak(say);
      setFinishKind("deferred");
      setClosingLine("We'll talk it through when you're parked. Your plan is here when you stop.");
      setPhase("finished");
      return;
    }
    if (stage === "exit-eat") {
      const say = await converseSay("exit-eat");
      setCurrentLine(say);
      await phoneSpeak(say);
      const entry = entryRef.current;
      if (entry) {
        updateEntry(entry.id, { choice: "eat" }).catch(() => {});
        router.push(`/pause?entry=${entry.id}&respawn=1`);
      }
      return;
    }
    if (stage === "pause-handoff") {
      // The plan is dealt first, in the user's words — then the
      // existing pause flow runs the tool and carries the choice.
      await deliverPlan(false);
      const entry = entryRef.current;
      if (entry) router.push(`/pause?entry=${entry.id}`);
      return;
    }
    if (stage === "plan") {
      await deliverPlan(true);
      return;
    }
  }

  async function deliverPlan(withChoice: boolean) {
    const plan = planRef.current;
    if (!plan) return;
    const answers = answersRef.current;
    const elements = assemblePlan(answers, plan);
    setPlanElements(elements);
    const entry = entryRef.current;
    if (entry) {
      const swap = dealtSwap(answers, plan);
      if (swap) updateEntry(entry.id, { plannedResponse: swap }).catch(() => {});
    }
    // A "reset first" branch plays the user's own reset recording
    // before the plan — their voice leads, generated voice follows.
    if (answers.branch === "reset") {
      const reset = await getCue("reset").catch(() => null);
      if (reset) await playBlob(reset.blob);
      if (!aliveRef.current) return;
    }
    setStatus("Your plan, in your words.");
    // With a choice to capture, /api/converse phrases plan + choice
    // question as one spoken line. On the pause handoff, the choice
    // belongs to the pause flow — speak the plan body only, in the
    // deterministic phrasing (the user's own words, unadorned).
    const display = withChoice
      ? (await converseSay("plan")) || phrasePlan(elements, plan.directness ?? null)
      : phrasePlan(elements, plan.directness ?? null);
    setCurrentLine(display);
    await speakPlanLine(display);
    if (!aliveRef.current || !withChoice) return;
    await captureChoice();
  }

  async function captureChoice() {
    setCurrentLine(CHOICE_QUESTION);
    setStatus("");
    const raw = await captureAnswerText();
    if (!aliveRef.current) return;
    if (raw) setHeard(raw);
    let choice = raw ? parseChoice(raw) : null;
    if (!choice) {
      await phoneSpeak("I didn't catch that. Eat it, swap it, or delay ten minutes?");
      if (!aliveRef.current) return;
      const again = await captureAnswerText();
      if (!aliveRef.current) return;
      if (again) setHeard(again);
      choice = again ? parseChoice(again) : null;
    }
    const entry = entryRef.current;
    if (!entry || !choice) {
      setFinishKind("ended");
      setClosingLine("That's the conversation. Your plan is below, for whenever you want it.");
      setPhase("finished");
      return;
    }
    updateEntry(entry.id, { choice }).catch(() => {});
    if (choice === "eat") {
      await phoneSpeak("Eat it, and enjoy it. Checkpoint in a moment.");
      router.push(`/pause?entry=${entry.id}&respawn=1`);
      return;
    }
    if (choice === "swap") {
      const swapEl = planElements.find((e) => e.kind === "swap");
      const line = swapEl
        ? `Swap it is. Your swap: ${swapEl.text}. It's stocked, and it's yours.`
        : "Swap it is — your stocked swaps are on the plan card below.";
      setClosingLine(line);
      await phoneSpeak(line);
      setFinishKind("swap");
    } else {
      const line = "Ten minutes. Nothing to decide until then — the plan stays right here.";
      setClosingLine(line);
      await phoneSpeak(line);
      setFinishKind("delay");
    }
    setPhase("finished");
  }

  async function begin() {
    setPhase("conversing");
    setStatus("One moment…");
    try {
      const stored = await getShieldPlan();
      const { plan } = applyDueDirectness(stored);
      planRef.current = plan;
    } catch {
      planRef.current = { ...EMPTY_SHIELD_PLAN };
    }
    const entry = await addEntry({ source: "talk" }).catch(() => null);
    entryRef.current = entry;
    // The recorded cue still opens the session, exactly as in SOS —
    // Talk It Through runs after it, inside the same session.
    const cue = await getCue("cue").catch(() => null);
    if (cue) await playBlob(cue.blob);
    if (!aliveRef.current) return;
    await runStage("q1");
  }

  function endConversation() {
    stopRecordingRef.current?.();
    textResolverRef.current?.("");
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Nothing to cancel.
    }
    setFinishKind("ended");
    setClosingLine("Conversation ended. Nothing was scored, nothing reset.");
    setPhase("finished");
  }

  // Is the prompt pack complete? Drives the one "for later" prompt.
  useEffect(() => {
    if (phase !== "finished") return;
    let live = true;
    Promise.all(QUESTION_KINDS.map((k) => hasCue(k).catch(() => false)))
      .then((flags) => {
        if (live) setPackIncomplete(flags.some((f) => !f));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [phase]);

  if (phase === "ready") {
    return (
      <div className="mt-10">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-stone-900">Just talk.</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            Your second brain asks one question at a time, out loud. You answer out loud. From
            your answers it deals your own plan back — your why, your if-then, your swap — in
            your words. No menus, nothing to tap through.
          </p>
          <p className="mt-3 leading-relaxed text-stone-600">
            Your answers are heard on this device and written into your journal here. Nothing is
            scored.
          </p>
          <button
            type="button"
            onClick={() => void begin()}
            className="mt-6 w-full rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
          >
            Start talking
          </button>
          <p className="mt-3 text-sm text-stone-600">
            The phone will ask for microphone access — that&apos;s the conversation hearing you.
          </p>
        </section>
      </div>
    );
  }

  if (phase === "finished") {
    return (
      <div className="mt-10 flex flex-col gap-6">
        {closingLine && (
          <section className="rounded-2xl border border-[#2f5d3a]/30 bg-[#e7efe3] px-5 py-4">
            <p className="font-medium text-stone-900">{closingLine}</p>
          </section>
        )}
        {planElements.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-stone-900">Your plan, from your own words</h2>
            <ul className="mt-3 flex flex-col gap-2 leading-relaxed text-stone-700">
              {planElements.map((el, i) => (
                <li key={i}>
                  <span className="font-medium text-stone-900">
                    {el.kind === "why"
                      ? "Your why: "
                      : el.kind === "ifThen"
                        ? "Your if-then: "
                        : el.kind === "swap"
                          ? "Your swap: "
                          : "Your ninety seconds: "}
                  </span>
                  {el.text}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-stone-900">For later — only if you want</h2>
          <ul className="mt-3 flex flex-col gap-3 text-stone-700">
            {packIncomplete && (
              <li>
                <Link href="/prompt-pack" className="font-medium text-[#2f5d3a] underline underline-offset-4">
                  Record the questions in your voice
                </Link>{" "}
                — so next time, the questions sound like you.
              </li>
            )}
            <li>
              <Link href="/shield" className="font-medium text-[#2f5d3a] underline underline-offset-4">
                Add or change your swaps
              </Link>{" "}
              — the plan can only deal what you&apos;ve stocked.
            </li>
            <li>
              <Link href="/support" className="font-medium text-[#2f5d3a] underline underline-offset-4">
                Get support
              </Link>{" "}
              — if a moment ever feels bigger than a pause.
            </li>
          </ul>
        </section>
        <Link href="/" className="text-center font-medium text-[#2f5d3a] underline underline-offset-4">
          Back home
        </Link>
      </div>
    );
  }

  // Conversing: one line on screen, one job for the user's voice.
  return (
    <div className="mt-10">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <p className="text-2xl font-semibold leading-snug text-stone-900" aria-live="polite">
          {currentLine || "…"}
        </p>
        {status && (
          <p className="mt-3 text-stone-600" aria-live="polite">
            {status}
          </p>
        )}
        {heard && <p className="mt-3 text-sm text-stone-500">Heard: “{heard}”</p>}

        {captureMode === "recording" && (
          <button
            type="button"
            onClick={() => stopRecordingRef.current?.()}
            className="mt-6 w-full rounded-full bg-[#9a3b26] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#7f3120]"
          >
            ■ Done
          </button>
        )}
        {captureMode === "sr" && (
          <p className="mt-6 text-lg font-medium text-stone-700">🎙 Listening…</p>
        )}
        {captureMode === "text" && (
          <div className="mt-6 flex gap-2">
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
              placeholder="Type this one answer…"
              aria-label="Type your answer"
            />
            <button
              type="button"
              onClick={() => textResolverRef.current?.(textDraft)}
              className="shrink-0 rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30]"
            >
              Say it
            </button>
          </div>
        )}
      </section>
      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={endConversation}
          className="text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
        >
          End conversation
        </button>
      </div>
    </div>
  );
}
