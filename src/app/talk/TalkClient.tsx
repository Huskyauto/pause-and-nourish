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
  listEntries,
  updateEntry,
  type CueKind,
  type JournalEntry,
  type ShieldPlan,
} from "@/lib/journal";
import {
  assemblePlan,
  CHOICE_QUESTION,
  dealtSwap,
  DEFERRED_LINE,
  EMPTY_ANSWERS,
  nextStage,
  openerLine,
  parseBranch,
  parseChoice,
  parseContext,
  parseHunger,
  parseNeed,
  parseUrge,
  phrasePlan,
  phraseStage,
  questionText,
  type FinalChoice,
  type PartOfDay,
  type PlanElement,
  type QuestionId,
  type TalkAnswers,
  type TalkStage,
} from "@/lib/spine";
import { speakLineChecked } from "@/lib/speak";
import { applyDueDirectness } from "../shield/ShieldDay4";

// Talk It Through (Day 5; free-form revision, 2026-10-30): the
// conversation SOS. There is no script anymore: Muse Spark (via
// /api/converse) holds a real back-and-forth — it asks its own
// questions on the cuff, the user answers out loud, Muse Voice
// Transcribe (via /api/transcribe) turns each answer into words, and
// the brain offers its thoughts on what to do next drawn only from
// the user's own saved playbook and declared journal patterns. The
// deterministic spine parsers now run in the BACKGROUND over each
// transcript, filling journal fields (and standing guard on the
// driving gate) — they no longer steer the flow. The journal entry
// (source "talk") carries the parsed fields plus the transcript.
//
// Voice (Bob's directive, 2026-10-30: the automatic voice is the Fish
// voice): every brain line is spoken by Fish — the user's cloned
// voice via /api/speak (speakLineChecked) — and the phone's voice is
// only the last-resort fallback when Fish itself fails. If the Meta
// key is unreachable, the client falls back to the original scripted
// spine flow, where a question is asked by (a) the user's recorded
// prompt-pack clip, else (b) the baked Fish clip in public/voice/,
// else (c) the deterministic line spoken Fish-first. The session
// itself always opens with the brain's live greeting — the
// /api/converse opener in the free-form flow, openerLine in the
// scripted one — never with a recording: the recorded moment cue
// opens SOS only (Bob's directive, 2026-10-31). Zero menus during
// the conversation; the only screen after it is the plan card plus
// optional "for later" links. The tap-based SOS/pause flow is
// untouched.
//
// Personable layer (Bob's directive, 2026-10-30): every converse call
// also carries the moment — local time + part of day, weekday vs
// weekend, declared-risk-window state, and today's journal slice —
// so the brain greets Bob like someone who knows him, checks on
// today's urges, and can walk the day with him; and the scripted
// offline flow opens with the same warm greeting (spine openerLine).

type UiPhase = "ready" | "conversing" | "finished";
type CaptureMode = "idle" | "recording" | "sr" | "text";
type FinishKind = "swap" | "delay" | "deferred" | "ended" | null;

// One turn of the free-form conversation, as sent to /api/converse and
// as written into the journal entry's note at the end.
interface ConversationTurn {
  role: "brain" | "user";
  text: string;
}

// Compact declared-history summary the client builds from its own
// journal and sends with every /api/converse call — the brain recalls
// the user's patterns from this, never from inference.
interface RecentJournalItem {
  date: string;
  context: string | null;
  hungerType: string | null;
  need: string | null;
  urge: number | null;
  choice: string | null;
  coping: string | null;
  learning: string | null;
}

// Today's slice of the journal (oldest first) — the brain greets him
// with his day already in view and can walk it with him at calm time.
interface TodayJournalItem {
  time: string;
  context: string | null;
  need: string | null;
  urge: number | null;
  urgeAfter: number | null;
  choice: string | null;
  learning: string | null;
}

// Whether he is inside a risk window he declared at calm time,
// computed on-device at send time from the plan's declared windows.
interface RiskWindowContext {
  inWindow: boolean;
  label?: string;
  nextLabel?: string;
  nextStartsAt?: string;
}

function partOfDayFor(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function formatHour(hour: number): string {
  const d = new Date();
  d.setHours(Math.floor(hour) % 24, Math.round((hour % 1) * 60), 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

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
  // Free-form conversation state: the running transcript (also the
  // /api/converse payload), the declared-history summary, and the
  // background parsers' captures (note bits + a parsed choice kept as
  // a backup to the brain's own closing signal).
  const historyRef = useRef<ConversationTurn[]>([]);
  const recentRef = useRef<RecentJournalItem[]>([]);
  const todayRef = useRef<TodayJournalItem[]>([]);
  const bitsRef = useRef("");
  const backgroundChoiceRef = useRef<FinalChoice | null>(null);
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

  // Play a same-origin audio file (a baked Fish clip from
  // public/voice/). Resolves true when the clip actually played to
  // the end, false when it couldn't be loaded or played — the caller
  // falls through the voice chain.
  function playUrl(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(url);
        audioRef.current = audio;
        let done = false;
        const finish = (ok: boolean) => {
          if (!done) {
            done = true;
            resolve(ok);
          }
        };
        audio.addEventListener("ended", () => finish(true), { once: true });
        audio.addEventListener("error", () => finish(false), { once: true });
        audio.play().catch(() => finish(false));
        // A question clip is seconds long; never hang the conversation.
        setTimeout(() => finish(true), 30000);
      } catch {
        resolve(false);
      }
    });
  }

  // Fish caps a spoken line at 300 chars — longer lines are split at
  // sentence boundaries so every part can go to Fish first.
  function chunkForSpeak(text: string): string[] {
    const chunks: string[] = [];
    let rest = text.trim();
    while (rest.length > 280) {
      const cut = rest.lastIndexOf(". ", 280);
      const idx = cut > 60 ? cut + 1 : 280;
      chunks.push(rest.slice(0, idx).trim());
      rest = rest.slice(idx).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  // The conversation's automatic voice (Bob's directive, 2026-10-30):
  // Fish — the user's cloned voice, via speakLineChecked → /api/speak —
  // speaks every dynamic line. The phone's voice is used only for a
  // part Fish itself failed to speak.
  async function speakAloud(text: string): Promise<void> {
    for (const chunk of chunkForSpeak(text)) {
      if (!aliveRef.current) return;
      if (!(await speakLineChecked(chunk))) {
        await phoneSpeak(chunk);
      }
    }
  }

  // ---------- the free-form brain ----------

  // The recent-journal summary from the device's own journal: the
  // last few entries before this conversation, declared fields only.
  function buildRecentJournal(entries: JournalEntry[], excludeId: string | null): RecentJournalItem[] {
    return entries
      .filter((e) => e.id !== excludeId)
      .slice(0, 5)
      .map((e) => ({
        date: e.createdAt.slice(0, 10),
        context: e.context,
        hungerType: e.hungerType,
        need: e.need,
        urge: e.urgeIntensity,
        choice: e.choice,
        coping: e.copingUsed,
        learning: e.learning,
      }));
  }

  // Today's entries only, oldest first — built once at begin() from
  // the same listEntries() read as the recent summary.
  function buildTodayJournal(entries: JournalEntry[], excludeId: string | null): TodayJournalItem[] {
    const todayStr = new Date().toDateString();
    return entries
      .filter((e) => e.id !== excludeId && new Date(e.createdAt).toDateString() === todayStr)
      .slice(0, 8)
      .reverse()
      .map((e) => ({
        time: new Date(e.createdAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
        context: e.context,
        need: e.need,
        urge: e.urgeIntensity,
        urgeAfter: e.urgeAfter,
        choice: e.choice,
        learning: e.learning,
      }));
  }

  // Risk-window state from the plan's declared windows, if it carries
  // any (no setup surface collects them yet — normally none, and the
  // route treats absence as "no window claims"). Windows may wrap
  // past midnight (start after end).
  function computeRiskWindow(plan: ShieldPlan, now: Date): RiskWindowContext {
    const windows = plan.riskWindows ?? [];
    if (!windows.length) return { inWindow: false };
    const hour = now.getHours() + now.getMinutes() / 60;
    const active = windows.find((w) =>
      w.startHour <= w.endHour
        ? hour >= w.startHour && hour < w.endHour
        : hour >= w.startHour || hour < w.endHour,
    );
    if (active) return { inWindow: true, label: active.label };
    let next: { label: string; startHour: number; delta: number } | null = null;
    for (const w of windows) {
      let delta = w.startHour - hour;
      if (delta <= 0) delta += 24;
      if (!next || delta < next.delta) next = { label: w.label, startHour: w.startHour, delta };
    }
    return next
      ? { inWindow: false, nextLabel: next.label, nextStartsAt: formatHour(next.startHour) }
      : { inWindow: false };
  }

  interface BrainReply {
    say: string;
    done: boolean;
    choice: FinalChoice | null;
  }

  // One conversational turn: the whole transcript goes up, the brain's
  // next line (and its closing signal, when it has one) comes back.
  // "not-configured" is distinguished from a plain failure because it
  // switches the whole conversation to the offline scripted flow.
  async function converseTurn(): Promise<BrainReply | "not-configured" | null> {
    const plan = planRef.current;
    if (!plan) return null;
    // Time context is computed fresh and sent on EVERY turn, not just
    // the first: the brain reasons with the clock, the day type, and
    // the declared-window state all the way through the conversation.
    const now = new Date();
    const hour = now.getHours();
    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: historyRef.current.slice(-24),
          shieldPlan: plan,
          directness: plan.directness ?? null,
          recentJournal: recentRef.current,
          driving: answersRef.current.driving,
          localTime: { hour, partOfDay: partOfDayFor(hour) },
          dayType: now.getDay() === 0 || now.getDay() === 6 ? "weekend" : "weekday",
          riskWindow: computeRiskWindow(plan, now),
          todayJournal: todayRef.current,
        }),
      });
      if (!res.ok) {
        let code = "";
        try {
          code = ((await res.json()) as { error?: string }).error ?? "";
        } catch {
          // Non-JSON body — a plain failure.
        }
        return code === "meta_not_configured" ? "not-configured" : null;
      }
      const data = (await res.json()) as { say?: unknown; done?: unknown; choice?: unknown };
      if (typeof data.say !== "string" || !data.say.trim()) return null;
      return {
        say: data.say,
        done: data.done === true,
        choice:
          data.choice === "eat" || data.choice === "swap" || data.choice === "delay"
            ? data.choice
            : null,
      };
    } catch {
      return null;
    }
  }

  // Background data capture: the spine parsers read each user turn and
  // fill the journal fields, exactly as they did when they steered —
  // but now nothing waits on them and they decide nothing. The one
  // exception is the driving gate, enforced in runFreeform below.
  function captureInBackground(text: string) {
    const answers = answersRef.current;
    const entry = entryRef.current;
    const ctx = parseContext(text);
    if (ctx.driving) answers.driving = true;
    if (!answers.context && ctx.context) {
      answers.context = ctx.context;
      if (entry) updateEntry(entry.id, { context: ctx.context }).catch(() => {});
    }
    const hunger = parseHunger(text);
    if (hunger) {
      answers.hungerKind = hunger;
      if (entry) {
        updateEntry(entry.id, {
          hungerType: hunger === "body" ? "physical" : hunger === "pull" ? "emotional" : "both",
        }).catch(() => {});
      }
    }
    const urge = parseUrge(text);
    if (urge !== null) {
      answers.urge = urge;
      if (entry) updateEntry(entry.id, { urgeIntensity: urge }).catch(() => {});
    }
    const need = parseNeed(text);
    if (need.need || need.targetFood || need.window) {
      if (need.need) answers.need = need.need;
      if (need.targetFood) answers.targetFood = need.targetFood;
      if (need.window) answers.window = need.window;
      answers.needRaw = text;
      const bits: string[] = [];
      if (need.targetFood) bits.push(`Wanted: ${need.targetFood}`);
      if (need.window) bits.push(`Window: ${need.window}`);
      if (bits.length) bitsRef.current = bits.join(" · ");
      if (entry && need.need) updateEntry(entry.id, { need: need.need }).catch(() => {});
    }
    const choice = parseChoice(text);
    if (choice) backgroundChoiceRef.current = choice;
  }

  // The transcript as stored on the entry. journal.ts caps note at
  // 500 chars, so this is the conversation's opening, compactly
  // rendered — the structured fields carry the rest of the capture.
  function transcriptNote(): string {
    const turns = historyRef.current
      .map((t) => `${t.role === "brain" ? "Brain" : "You"}: ${t.text}`)
      .join(" / ");
    const full = bitsRef.current ? `${turns} [${bitsRef.current}]` : turns;
    return full.slice(0, 500);
  }

  function persistTranscriptNote() {
    const entry = entryRef.current;
    if (entry && historyRef.current.length) {
      updateEntry(entry.id, { note: transcriptNote() }).catch(() => {});
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
    historyRef.current.push({ role: "brain", text });
    // Offline-fallback voice priority: (a) the user's recorded
    // prompt-pack clip, (b) the baked Fish clip of this exact question,
    // (c) the deterministic line spoken Fish-first (phone last resort).
    const clip = await getCue(qid).catch(() => null);
    if (!aliveRef.current) return;
    if (clip) {
      await playBlob(clip.blob);
    } else if (await playUrl(`/voice/${qid}.mp3`)) {
      // The baked clip asked it — Bob's cloned voice, generated once
      // at build time from this exact question text.
    } else {
      await speakAloud(text);
    }
    if (!aliveRef.current) return;
    const heardText = await captureAnswerText();
    if (!aliveRef.current) return;
    await handleAnswer(qid, heardText);
  }

  async function handleAnswer(qid: QuestionId, raw: string | null) {
    const answers = answersRef.current;
    const entry = entryRef.current;
    if (raw) {
      setHeard(raw);
      historyRef.current.push({ role: "user", text: raw });
      persistTranscriptNote();
    }

    const retry = async (): Promise<boolean> => {
      const used = retriesRef.current[qid] ?? 0;
      if (used >= 1) return false;
      retriesRef.current[qid] = used + 1;
      await speakAloud("I didn't catch that.");
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
      const say = phraseStage(
        "deferred",
        answersRef.current,
        planRef.current ?? { ...EMPTY_SHIELD_PLAN },
        planRef.current?.directness ?? null,
      );
      setCurrentLine(say);
      historyRef.current.push({ role: "brain", text: say });
      await speakAloud(say);
      setFinishKind("deferred");
      setClosingLine("We'll talk it through when you're parked. Your plan is here when you stop.");
      setPhase("finished");
      return;
    }
    if (stage === "exit-eat") {
      const say = phraseStage(
        "exit-eat",
        answersRef.current,
        planRef.current ?? { ...EMPTY_SHIELD_PLAN },
        planRef.current?.directness ?? null,
      );
      setCurrentLine(say);
      historyRef.current.push({ role: "brain", text: say });
      await speakAloud(say);
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
    // The plan is the user's own words, unadorned — spoken in the
    // deterministic phrasing, Fish-first. With a choice to capture,
    // the choice question rides along in the same spoken line; on the
    // pause handoff the choice belongs to the pause flow, so the plan
    // body goes alone.
    const display = withChoice
      ? `${phrasePlan(elements, plan.directness ?? null)} ${CHOICE_QUESTION}`
      : phrasePlan(elements, plan.directness ?? null);
    setCurrentLine(display);
    historyRef.current.push({ role: "brain", text: display });
    persistTranscriptNote();
    await speakAloud(display);
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
      await speakAloud("I didn't catch that. Eat it, swap it, or delay ten minutes?");
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
      await speakAloud("Eat it, and enjoy it. Checkpoint in a moment.");
      router.push(`/pause?entry=${entry.id}&respawn=1`);
      return;
    }
    if (choice === "swap") {
      const swapEl = planElements.find((e) => e.kind === "swap");
      const line = swapEl
        ? `Swap it is. Your swap: ${swapEl.text}. It's stocked, and it's yours.`
        : "Swap it is — your stocked swaps are on the plan card below.";
      setClosingLine(line);
      await speakAloud(line);
      setFinishKind("swap");
    } else {
      const line = "Ten minutes. Nothing to decide until then — the plan stays right here.";
      setClosingLine(line);
      await speakAloud(line);
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
    // The declared-history summary rides along with every brain call.
    try {
      const entries = await listEntries();
      recentRef.current = buildRecentJournal(entries, entry?.id ?? null);
      todayRef.current = buildTodayJournal(entries, entry?.id ?? null);
    } catch {
      recentRef.current = [];
      todayRef.current = [];
    }
    // The conversation opens with the brain's own live greeting —
    // the /api/converse opener on empty history, spoken Fish-first
    // (Bob's directive, 2026-10-31). The recorded moment cue belongs
    // to SOS; it never starts Talk It Through.
    await runFreeform();
  }

  // The free-form conversation loop: brain speaks (Fish-first), user
  // answers out loud, background parsers quietly fill the journal,
  // repeat — until the brain closes, the user goes quiet, the turn
  // cap hits, or the driving gate fires. If the Meta key is not
  // configured, the whole conversation hands off to the scripted
  // spine flow (askQuestion and everything below it).
  async function runFreeform() {
    let failures = 0;
    for (let turn = 0; turn < 14; turn++) {
      const res = await converseTurn();
      if (!aliveRef.current) return;
      if (res === "not-configured") {
        // The scripted flow opens personably too: a warm, plain
        // greeting shaped by the part of day, then the spine's first
        // question as before.
        const greet = openerLine(partOfDayFor(new Date().getHours()));
        setCurrentLine(greet);
        setStatus("");
        historyRef.current.push({ role: "brain", text: greet });
        persistTranscriptNote();
        await speakAloud(greet);
        if (!aliveRef.current) return;
        await askQuestion("q1");
        return;
      }
      if (res === null) {
        failures += 1;
        if (failures >= 2 || turn > 0) {
          finishFreeform(null, "");
          return;
        }
        continue;
      }
      failures = 0;
      setCurrentLine(res.say);
      setStatus("");
      historyRef.current.push({ role: "brain", text: res.say });
      persistTranscriptNote();
      await speakAloud(res.say);
      if (!aliveRef.current) return;
      if (res.done) {
        finishFreeform(res.choice, res.say);
        return;
      }
      let raw = await captureAnswerText();
      if (!aliveRef.current) return;
      if (!raw) {
        await speakAloud("I didn't catch that.");
        if (!aliveRef.current) return;
        raw = await captureAnswerText();
        if (!aliveRef.current) return;
      }
      if (!raw) {
        // The user has gone quiet — close gracefully with the plan.
        finishFreeform(null, "");
        return;
      }
      setHeard(raw);
      historyRef.current.push({ role: "user", text: raw });
      captureInBackground(raw);
      persistTranscriptNote();
      if (answersRef.current.driving) {
        // The driving gate, enforced here as well as in the prompt:
        // the conversation stops, full stop.
        setCurrentLine(DEFERRED_LINE);
        historyRef.current.push({ role: "brain", text: DEFERRED_LINE });
        persistTranscriptNote();
        await speakAloud(DEFERRED_LINE);
        if (!aliveRef.current) return;
        setFinishKind("deferred");
        setClosingLine("We'll talk it through when you're parked. Your plan is here when you stop.");
        setPhase("finished");
        return;
      }
    }
    finishFreeform(null, "");
  }

  // Free-form write-back and close: the entry gets the final choice
  // (the brain's signal, with the background-parsed choice as backup),
  // the dealt swap, and the transcript note; the plan card is dealt
  // from the background captures for the finished screen. Eat routes
  // to the respawn handoff, exactly as the scripted flow does.
  function finishFreeform(choice: FinalChoice | null, say: string) {
    const plan = planRef.current;
    const entry = entryRef.current;
    const finalChoice = choice ?? backgroundChoiceRef.current;
    if (plan) setPlanElements(assemblePlan(answersRef.current, plan));
    if (entry) {
      const swap = plan ? dealtSwap(answersRef.current, plan) : null;
      updateEntry(entry.id, {
        ...(finalChoice ? { choice: finalChoice } : {}),
        ...(swap ? { plannedResponse: swap } : {}),
        note: transcriptNote(),
      }).catch(() => {});
    }
    if (finalChoice === "eat" && entry) {
      router.push(`/pause?entry=${entry.id}&respawn=1`);
      return;
    }
    setClosingLine(say || "That's the conversation. Your plan is below, for whenever you want it.");
    setFinishKind(finalChoice === "swap" ? "swap" : finalChoice === "delay" ? "delay" : "ended");
    setPhase("finished");
  }

  function endConversation() {
    stopRecordingRef.current?.();
    textResolverRef.current?.("");
    persistTranscriptNote();
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
