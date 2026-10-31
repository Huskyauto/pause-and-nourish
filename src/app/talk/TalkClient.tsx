"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addEntry,
  EMPTY_SHIELD_PLAN,
  getCue,
  getShieldPlan,
  getUserProfile,
  hasUserProfile,
  listEntries,
  saveShieldPlan,
  updateEntry,
  type JournalEntry,
  type ShieldPlan,
  type ProfileVoice,
  type UserProfile,
} from "@/lib/journal";
import {
  assemblePlan,
  dealtSwap,
  EMPTY_ANSWERS,
  parseChoice,
  parseContext,
  parseHunger,
  parseNeed,
  parseUrge,
  type FinalChoice,
  type PartOfDay,
  type PlanElement,
  type TalkAnswers,
} from "@/lib/spine";
import { createSpeechPipeline, speakLineChecked, type SpeechPipeline } from "@/lib/speak";
import { recognizeOnce, speechRecognitionAvailable } from "@/lib/recognize";
import { computeRiskWindowState } from "@/lib/riskWindows";
import { getPlaceLabel } from "@/lib/places";
import SecondBrain, { type SecondBrainState } from "@/components/SecondBrain";
import {
  NEED_SPOKEN,
  OUTCOME_QUESTION,
  actionLabel,
  actionSteps,
  isGuidedActionKind,
  parseActionResponse,
  parseOutcome,
  type ConverseEvent,
  type GuidedActionKind,
  type SessionOutcomeItem,
} from "@/lib/actions";
import { applyDueDirectness } from "../shield/ShieldDay4";

// Talk It Through (Day 5; free-form revision, 2026-10-30): the
// conversation SOS. There is no script anymore: Muse Spark (via
// /api/converse) holds a real back-and-forth — it asks its own
// questions on the cuff, the user answers out loud, the browser's
// own recognition turns each answer into words where the platform
// offers it (Muse Voice Transcribe via /api/transcribe is the
// fallback), brain lines are spoken sentence-by-sentence as their
// audio lands, the mic re-opens on its own after each question,
// and
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
// only the last-resort fallback when Fish itself fails.
//
// ALL-CANNED-OUT (Bob's ruling, 2026-10-31): nothing pre-recorded or
// pre-scripted speaks in this flow, ever. The old offline scripted
// spine flow — questions asked by the user's recorded prompt-pack
// clips, by the baked Fish clips in public/voice/, or by
// deterministic phrasing — is GONE: a line recorded or written at
// calm time is not the fact of this moment, so the LLM composes
// every spoken line in the moment, from the live situation plus the
// user's database. When the brain can't be reached (no key, Meta
// down, a reply the output filter rejected), the app does not fake
// a conversation: it shows an honest can't-reach-the-brain state —
// one spoken status line via Fish when Fish answers (a status is
// not a conversation), the plan card, and a door to the pause tools,
// which work without the brain. The session always opens with the
// brain's live greeting — the /api/converse opener — never with a
// recording. Zero menus during the conversation; the only screen
// after it is the plan card plus optional "for later" links.
//
// Personable layer (Bob's directive, 2026-10-30): every converse call
// also carries the moment — local time + part of day, weekday vs
// weekend, declared-risk-window state, and today's journal slice —
// so the brain greets Bob like someone who knows him, checks on
// today's urges, and can walk the day with him.
//
// Talk with me + guided actions (Day 6 "big push", Bob's directive
// 2026-10-31): the talk entry is "Talk with me" — the second brain —
// and the conversation is no longer talk-only. When the brain judges
// the moment is ready, /api/converse returns a guided-action
// directive (a kind from the modality repertoire in src/lib/actions
// .ts, validated server-side); its "say" line proposes the action out
// loud, Bob answers out loud, and on a yes the client LEADS the
// action step by step — speaking each step Fish-first, then waiting
// the step's paced seconds — with an "End exercise" escape on screen
// the whole time. A pass simply continues the conversation. When the
// session closes, the app asks in plain words how it landed and
// writes his mark (good outcome / one to work on / unmarked) to the
// same talk journal entry, alongside which action ran; the last five
// sessions' actions + marks ride along with every converse call so
// the brain can cite his own record. SOS is untouched.

type UiPhase = "ready" | "conversing" | "finished" | "unavailable";
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

function partOfDayFor(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

// The one status line of the can't-reach-the-brain state. It is a
// status, not a conversation line: spoken once via Fish when Fish
// answers (speakLineChecked — no phone-voice fallback), otherwise
// it lives on the unavailable screen as text.
const UNAVAILABLE_LINE = "I can't reach the brain right now.";

// Spoken-answer endpointing (Bob's live-test fix, 2026-10-31): a
// recording turn ends when HE stops talking — after speech has been
// heard, ~1.8 s of continuous quiet ends the turn automatically —
// never on a fixed short clock while he is mid-sentence (the old
// 12-second cap cut him off mid-conversation). The hard ceiling only
// bounds a turn that never goes quiet, and what was recorded by then
// is transcribed like any other turn end, never discarded. The
// ■ Done button stays as his manual override at all times.
const ANSWER_SILENCE_MS = 1800;
const ANSWER_MAX_MS = 120000;
// Auto-listen (latency build, 2026-10-31): when the mic opens on
// its own after a brain line, a user who says nothing must not hang
// the conversation — if no speech has been heard within this window
// the capture closes quietly and the turn waits for a tap instead.
// Deliberate answers (a tap, a retry) are never cut by it.
const AUTO_NO_SPEECH_MS = 9000;
// Browser-recognition listen bounds: the recognizer endpoints on
// its own, these only bound a recognizer that never does. The
// auto-open gets the shorter bound — it is the one that must close
// quietly when nobody answers.
const SR_AUTO_TIMEOUT_MS = 12000;
const SR_MANUAL_TIMEOUT_MS = 20000;
// Mic level (RMS over the analyser's float time-domain samples) that
// counts as speech. Kept low on purpose: missing quiet speech would
// end turns early — the exact failure this fix removes — while
// ordinary room noise sits below it.
const SPEECH_RMS_THRESHOLD = 0.02;

// Meta's batch ASR endpoint only accepts mono 16-bit PCM WAV, so the
// recorded answer (webm/opus) is decoded, downmixed, resampled to
// 16 kHz, and re-encoded as WAV here in the browser before upload.
// 16 kHz (the endpoint accepts 16 or 24 kHz) keeps a full-length
// 120-second answer at ≈3.8 MB — under the serverless request-body
// limit that 24 kHz (≈5.8 MB) would break.
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
    const targetRate = 16000;
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
  // Auto-listen state: an auto-opened capture is in flight (the
  // type-instead escape shows), or the auto-open heard nothing and
  // the turn is parked on tap-to-answer.
  const [autoListen, setAutoListen] = useState(false);
  const [awaitingTap, setAwaitingTap] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [planElements, setPlanElements] = useState<PlanElement[]>([]);
  const [finishKind, setFinishKind] = useState<FinishKind>(null);
  const [closingLine, setClosingLine] = useState("");
  // Guided-action run state: while an action is being led, the screen
  // shows its name and the "End exercise" escape.
  const [actionRunning, setActionRunning] = useState(false);
  const [runningActionLabel, setRunningActionLabel] = useState("");
  // The Friendly Brain mascot (2026-10-31): its state mirrors what
  // the brain is doing this second — thinking while a reply (or a
  // transcription) is in flight, a ready spark-flash the moment a
  // reply lands, listening while the user answers, idle otherwise.
  const [brainState, setBrainState] = useState<SecondBrainState>("idle");
  const brainReadyTimerRef = useRef<number | null>(null);

  function brainThink() {
    if (brainReadyTimerRef.current !== null) {
      window.clearTimeout(brainReadyTimerRef.current);
      brainReadyTimerRef.current = null;
    }
    setBrainState("thinking");
  }

  function brainReady() {
    setBrainState("ready");
    if (brainReadyTimerRef.current !== null) {
      window.clearTimeout(brainReadyTimerRef.current);
    }
    brainReadyTimerRef.current = window.setTimeout(() => {
      brainReadyTimerRef.current = null;
      setBrainState("idle");
    }, 900);
  }

  function brainListen() {
    setBrainState("listening");
  }

  function brainIdle() {
    if (brainReadyTimerRef.current !== null) {
      window.clearTimeout(brainReadyTimerRef.current);
      brainReadyTimerRef.current = null;
    }
    setBrainState("idle");
  }

  const aliveRef = useRef(true);
  const entryRef = useRef<JournalEntry | null>(null);
  const answersRef = useRef<TalkAnswers>({ ...EMPTY_ANSWERS });
  const planRef = useRef<ShieldPlan | null>(null);
  // The user's story intake, when one has run (a saved name). Sent
  // with every converse call so the brain greets THIS user by name
  // and works from their story; null on the founder's phone, where
  // the route's behavior is exactly what it has always been.
  const profileRef = useRef<UserProfile | null>(null);
  // Free-form conversation state: the running transcript (also the
  // /api/converse payload), the declared-history summary, and the
  // background parsers' captures (note bits + a parsed choice kept as
  // a backup to the brain's own closing signal).
  const historyRef = useRef<ConversationTurn[]>([]);
  const recentRef = useRef<RecentJournalItem[]>([]);
  const todayRef = useRef<TodayJournalItem[]>([]);
  const bitsRef = useRef("");
  const backgroundChoiceRef = useRef<FinalChoice | null>(null);
  // Answer capture path: "api" (spoken answers — browser
  // recognition first where the platform offers it, the recorder +
  // /api/transcribe behind it) until the transcribe route reports
  // the key is missing with no recognition to lean on; then "text"
  // (one-answer type-in) for the rest of the conversation.
  const capturePathRef = useRef<"api" | "text">("api");
  // Latency build (2026-10-31): the pipelined sentence-by-sentence
  // speaker for conversational brain lines (guided-action steps
  // keep speakAloud — their pacing is by design); whether browser
  // recognition has failed this session (then answers go straight
  // to the recorder path); the in-flight recognition's abort (the
  // type-instead escape); whether the current capture was aborted
  // on purpose; and the parked tap-to-answer waiter.
  const pipelineRef = useRef<SpeechPipeline | null>(null);
  const srBrokenRef = useRef(false);
  const captureAbortRef = useRef<(() => void) | null>(null);
  const captureAbortedRef = useRef(false);
  const tapWaiterRef = useRef<((action: "answer" | "type" | "end") => void) | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const textResolverRef = useRef<((text: string) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Guided-action + session-record state (Day 6): whether this
  // conversation is the free-form one (only it runs actions and
  // asks the outcome question), the recent
  // session outcomes sent with every converse call, the lifecycle
  // note owed to the brain on the next turn, and the run/close
  // guards — an action runs at most once per conversation, the
  // outcome is asked at most once, and the first close caller wins.
  const freeformRef = useRef(false);
  const sessionOutcomesRef = useRef<SessionOutcomeItem[]>([]);
  const pendingEventRef = useRef<ConverseEvent | null>(null);
  const actionRanRef = useRef(false);
  const outcomeAskedRef = useRef(false);
  const actionAbortRef = useRef(false);
  const closingRef = useRef(false);
  const sessionOverRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (brainReadyTimerRef.current !== null) {
        window.clearTimeout(brainReadyTimerRef.current);
        brainReadyTimerRef.current = null;
      }
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // Nothing to cancel.
      }
      pipelineRef.current?.cancel();
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

  // Which generated voice speaks for this user (Bob's ruling,
  // 2026-10-31): an intake user hears the neutral stock voice they
  // picked at intake — an unchosen pick defaults to the female stock
  // voice — and NEVER the founder's clone. No profile = the founder:
  // no voice field is sent and /api/speak uses his clone, as always.
  function speechVoice(): ProfileVoice | undefined {
    const profile = profileRef.current;
    if (!profile) return undefined;
    return profile.voice ?? "female";
  }

  // The conversation's automatic voice (Bob's directive, 2026-10-30):
  // Fish, via speakLineChecked → /api/speak, speaks every dynamic
  // line — the founder's clone for him, an intake user's chosen
  // neutral stock voice for them. The phone's voice is used only for
  // a part Fish itself failed to speak.
  async function speakAloud(text: string): Promise<void> {
    for (const chunk of chunkForSpeak(text)) {
      if (!aliveRef.current) return;
      if (!(await speakLineChecked(chunk, speechVoice()))) {
        await phoneSpeak(chunk);
      }
    }
  }

  // Conversational brain lines go through the pipelined speaker
  // (latency build, 2026-10-31): sentence by sentence, the first
  // sentence's audio plays as soon as it lands instead of after the
  // whole line has been generated. Fish-first per chunk and the
  // phone voice only for a chunk Fish failed — the same rules as
  // speakAloud, which still serves guided-action steps, the outcome
  // question, and the fixed capture prompts (their pacing/wording
  // is by design and is not pipelined).
  function speakBrainLine(text: string): Promise<void> {
    if (!pipelineRef.current) {
      pipelineRef.current = createSpeechPipeline({
        fallback: (chunk) => phoneSpeak(chunk),
      });
    }
    return pipelineRef.current.speak(text, speechVoice());
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

  // His session record: the last few TALK sessions before this one,
  // newest first — the action that ran (or none) and the outcome he
  // marked at the close. Sent with every converse call so the brain
  // can cite his own record when it proposes an action. His declared
  // data only; an unmarked session is simply unmarked.
  function buildSessionOutcomes(entries: JournalEntry[], excludeId: string | null): SessionOutcomeItem[] {
    return entries
      .filter((e) => e.id !== excludeId && e.source === "talk")
      .slice(0, 5)
      .map((e) => ({
        date: new Date(e.createdAt).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        action: e.sessionAction ?? null,
        outcome: e.sessionOutcome ?? null,
        choice: e.choice,
      }));
  }

  interface BrainReply {
    say: string;
    done: boolean;
    choice: FinalChoice | null;
    // A guided-action directive, when this reply's line proposes one
    // (validated against the repertoire server-side; re-checked here
    // before anything runs).
    action: GuidedActionKind | null;
  }

  // One conversational turn: the whole transcript goes up, the brain's
  // next line (and its closing signal, when it has one) comes back.
  // The two sentinels are distinguished only for the record: both mean
  // the brain can't be reached — "not-configured" (no Meta key yet)
  // and "unavailable" (Meta down, or a reply the output filter
  // rejected) — and both land on the honest can't-reach-the-brain
  // state. There is no scripted flow to fall back to anymore.
  async function converseTurn(): Promise<BrainReply | "not-configured" | "unavailable" | null> {
    const plan = planRef.current;
    if (!plan) return null;
    // Time context is computed fresh and sent on EVERY turn, not just
    // the first: the brain reasons with the clock, the day type, and
    // the declared-window state all the way through the conversation.
    const now = new Date();
    const hour = now.getHours();
    // The place label: a saved place's name (or "away") when the
    // user has saved places and permission is already granted on
    // this device — otherwise null and the field is omitted, so a
    // user with no places gets exactly the old request. Only the
    // label travels; coordinates never leave the device.
    const placeLabel = await getPlaceLabel().catch(() => null);
    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: historyRef.current.slice(-24),
          shieldPlan: plan,
          profile: hasUserProfile(profileRef.current) ? profileRef.current : null,
          directness: plan.directness ?? null,
          recentJournal: recentRef.current,
          driving: answersRef.current.driving,
          localTime: { hour, partOfDay: partOfDayFor(hour) },
          dayType: now.getDay() === 0 || now.getDay() === 6 ? "weekend" : "weekday",
          riskWindow: computeRiskWindowState(plan, now),
          ...(placeLabel ? { placeLabel } : {}),
          todayJournal: todayRef.current,
          sessionOutcomes: sessionOutcomesRef.current,
          event: pendingEventRef.current,
        }),
      });
      if (!res.ok) {
        let code = "";
        try {
          code = ((await res.json()) as { error?: string }).error ?? "";
        } catch {
          // Non-JSON body — a plain failure.
        }
        if (code === "meta_not_configured") return "not-configured";
        if (code === "brain_unavailable") return "unavailable";
        return null;
      }
      const data = (await res.json()) as {
        say?: unknown;
        done?: unknown;
        choice?: unknown;
        action?: unknown;
      };
      if (typeof data.say !== "string" || !data.say.trim()) return null;
      // The turn went through — the lifecycle note was delivered.
      pendingEventRef.current = null;
      const rawKind = (data.action as { kind?: unknown } | null)?.kind;
      return {
        say: data.say,
        done: data.done === true,
        choice:
          data.choice === "eat" || data.choice === "swap" || data.choice === "delay"
            ? data.choice
            : null,
        action: isGuidedActionKind(rawKind) ? rawKind : null,
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

  // One heard answer, fully ingested: shown, added to the running
  // transcript, background-parsed into the journal, note persisted.
  // Shared by the conversation loop and the action-proposal answer,
  // so both paths capture identically.
  function ingestAnswer(raw: string) {
    setHeard(raw);
    historyRef.current.push({ role: "user", text: raw });
    captureInBackground(raw);
    persistTranscriptNote();
  }

  // The driving gate's close: the same deferred ending wherever
  // driving surfaces — mid-conversation or in an action-proposal
  // answer. The conversation stops, full stop. The spoken line is
  // composed by the brain for this moment, not canned
  // (all-canned-out, 2026-10-31): the driving flag rides with this
  // converse request and the brain's own driving rules close at once
  // with a short composed line. If the brain can't be reached, the
  // close is the parked text on screen and silence — no fallback
  // line speaks, and nothing is captured further either way.
  async function drivingClose(): Promise<void> {
    sessionOverRef.current = true;
    brainThink();
    const res = await converseTurn();
    if (res && res !== "not-configured" && res !== "unavailable") {
      brainReady();
      setCurrentLine(res.say);
      historyRef.current.push({ role: "brain", text: res.say });
      persistTranscriptNote();
      await speakBrainLine(res.say);
    }
    if (!aliveRef.current) return;
    setFinishKind("deferred");
    setClosingLine("We'll talk it through when you're parked. Your plan is here when you stop.");
    setPhase("finished");
  }

  // The honest can't-reach-the-brain state (Bob's ruling, 2026-10-31).
  // The status line is spoken once via Fish when Fish answers — a
  // status is not a fake conversation — and otherwise the screen
  // carries it. The plan card is assembled from whatever was captured
  // so the moment still ends with the user's own words in front of
  // them, and the pause tools are one tap away.
  async function showUnavailable(): Promise<void> {
    sessionOverRef.current = true;
    brainIdle();
    const plan = planRef.current;
    if (plan) setPlanElements(assemblePlan(answersRef.current, plan));
    setStatus("");
    setCurrentLine(UNAVAILABLE_LINE);
    await speakLineChecked(UNAVAILABLE_LINE, speechVoice());
    if (!aliveRef.current) return;
    setPhase("unavailable");
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

  // The ONE recorder behind every spoken answer in the talk flow —
  // conversation turns, the action-proposal answer, the outcome
  // reply, and the one-word capture all come through captureAnswerText
  // into here, so the endpointing below applies everywhere from
  // this single place. The turn ends three ways, all equivalent —
  // each delivers whatever was recorded for transcription:
  //   1. silence endpointing: once speech has been heard on the mic,
  //      ANSWER_SILENCE_MS of continuous quiet stops the recording;
  //   2. his tap on ■ Done (stopRecordingRef) — the manual override;
  //   3. the ANSWER_MAX_MS ceiling, for a turn that never goes quiet.
  // The level watch is best-effort: if an AudioContext can't run,
  // ways 2 and 3 still bound the turn exactly as before.
  function recordAnswerAudio(
    noSpeechMs?: number,
  ): Promise<{ blob: Blob | null; noSpeech: boolean }> {
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
          let noSpeech = false;
          let heardSpeech = false;
          let meterTimer: number | null = null;
          let audioCtx: AudioContext | null = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            stopRecordingRef.current = null;
            if (meterTimer !== null) window.clearInterval(meterTimer);
            if (audioCtx) audioCtx.close().catch(() => {});
            stream.getTracks().forEach((t) => t.stop());
            const blob = chunks.length
              ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
              : null;
            resolve({ blob, noSpeech });
          };
          recorder.onstop = finish;
          stopRecordingRef.current = () => {
            if (recorder.state !== "inactive") recorder.stop();
          };
          // The level watch: an analyser on the same mic stream,
          // sampled ten times a second. Quiet BEFORE he starts never
          // ends the turn — only quiet after speech does.
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
              let lastSpeechAt = performance.now();
              const startedAt = performance.now();
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
                  stopRecordingRef.current?.();
                } else if (
                  noSpeechMs !== undefined &&
                  !heardSpeech &&
                  now - startedAt >= noSpeechMs
                ) {
                  // Auto-listen watchdog: the mic opened on its own
                  // and nobody is answering — close quietly (the
                  // caller parks the turn on tap-to-answer) instead
                  // of recording silence to the ceiling.
                  noSpeech = true;
                  stopRecordingRef.current?.();
                }
              }, 100);
            }
          } catch {
            // No metering on this device — the ceiling and the
            // ■ Done button still bound the turn.
          }
          recorder.start();
          setTimeout(() => stopRecordingRef.current?.(), ANSWER_MAX_MS);
          if (noSpeechMs !== undefined) {
            // The same watchdog on a plain timer, for devices where
            // the level meter can't run: no speech heard at all by
            // the deadline still closes the auto-open quietly.
            setTimeout(() => {
              if (!settled && !heardSpeech) {
                noSpeech = true;
                stopRecordingRef.current?.();
              }
            }, noSpeechMs);
          }
        } catch {
          resolve({ blob: null, noSpeech: false });
        }
      })();
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

  // The type-instead escape, live during any auto-opened capture:
  // stop whatever is hearing (recognizer or recorder) and mark the
  // stop as deliberate, so the capture routes this answer to the
  // type-in instead of treating it as a miss.
  function requestTypeInstead() {
    captureAbortedRef.current = true;
    captureAbortRef.current?.();
    stopRecordingRef.current?.();
  }

  type CaptureOutcome =
    | { kind: "heard"; text: string }
    | { kind: "none" }
    | { kind: "no-speech" }
    | { kind: "to-text" };

  // One capture attempt. Order (latency build, 2026-10-31): where
  // the platform offers browser recognition it hears the answer —
  // its transcript lands with the platform's own endpointing, no
  // upload, no batch ASR wait. A recognition ERROR (refused,
  // unsupported, service failure) marks recognition broken for the
  // session and this same answer falls through to the recorder +
  // Muse Voice Transcribe path, which remains the fallback
  // wherever recognition is unavailable. "no-speech" is only
  // produced on an auto-open (auto = true): silence there closes
  // quietly rather than hanging.
  async function captureOnce(auto: boolean): Promise<CaptureOutcome> {
    if (capturePathRef.current === "text") {
      setStatus("Type this one answer.");
      const text = await captureViaText();
      return text ? { kind: "heard", text } : { kind: "none" };
    }
    if (!srBrokenRef.current && speechRecognitionAvailable()) {
      setCaptureMode("sr");
      setStatus("Listening — just talk.");
      captureAbortedRef.current = false;
      const heard = await recognizeOnce({
        timeoutMs: auto ? SR_AUTO_TIMEOUT_MS : SR_MANUAL_TIMEOUT_MS,
        registerAbort: (fn) => {
          captureAbortRef.current = fn;
        },
      });
      captureAbortRef.current = null;
      setCaptureMode("idle");
      if (captureAbortedRef.current) return { kind: "to-text" };
      if (heard.status === "heard") return { kind: "heard", text: heard.text };
      if (heard.status === "error") {
        srBrokenRef.current = true;
        // Fall through — the recorder path hears this answer.
      } else {
        return auto ? { kind: "no-speech" } : { kind: "none" };
      }
    }
    // Recorder path: record, then Muse Voice Transcribe via the
    // server.
    setCaptureMode("recording");
    setStatus("Listening — I'll send it when you finish talking. Tap Done to send it right away.");
    captureAbortedRef.current = false;
    const { blob, noSpeech } = await recordAnswerAudio(auto ? AUTO_NO_SPEECH_MS : undefined);
    setCaptureMode("idle");
    if (captureAbortedRef.current) return { kind: "to-text" };
    if (noSpeech) return { kind: "no-speech" };
    if (!blob) return { kind: "none" };
    setStatus("One moment…");
    brainThink();
    // Meta's ASR endpoint takes mono PCM WAV only — convert first.
    const wav = await blobToWav(blob);
    if (!wav) return { kind: "none" };
    try {
      const form = new FormData();
      form.append("audio", wav, "answer.wav");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (res.ok) {
        const data = (await res.json()) as { text?: unknown };
        return typeof data.text === "string" && data.text.trim()
          ? { kind: "heard", text: data.text }
          : { kind: "none" };
      }
      let code = "";
      try {
        code = ((await res.json()) as { error?: string }).error ?? "";
      } catch {
        // Non-JSON body — treated as a plain failure below.
      }
      if (code === "meta_not_configured") {
        // The key isn't in yet and recognition already had its
        // chance above: this conversation types its answers.
        capturePathRef.current = "text";
        return captureOnce(auto);
      }
      return { kind: "none" };
    } catch {
      return { kind: "none" };
    }
  }

  // One spoken answer, end to end. Returns the transcript (or null when
  // nothing usable was heard — the caller re-asks once, then moves on).
  //
  // Auto-listen (the conversation loop passes autoListen): the mic
  // opens on its own the moment the brain's line ends — no tap —
  // exactly once per brain turn. If nobody answers, the capture
  // closes quietly and the turn PARKS on tap-to-answer (a "Tap to
  // answer" button and a type-instead escape, both on screen)
  // instead of re-asking or looping. Deliberate captures — the
  // outcome question, the one-word capture, a tap after a park —
  // run without the flag and behave exactly as they always have.
  async function captureAnswerText(opts?: {
    autoListen?: boolean;
  }): Promise<string | null> {
    brainListen();
    const auto = opts?.autoListen === true;
    if (auto) setAutoListen(true);
    try {
      let outcome = await captureOnce(auto);
      if (outcome.kind === "to-text") return await captureViaText();
      if (outcome.kind === "heard") return outcome.text;
      if (outcome.kind === "none") return null;
      // no-speech on an auto-open: park the turn — unless the
      // session is already closing (End conversation aborts a
      // capture the same way, and its no-speech must not park).
      if (sessionOverRef.current) return null;
      brainIdle();
      setStatus("I'm here when you're ready — tap to answer, or type it instead.");
      setAwaitingTap(true);
      const action = await new Promise<"answer" | "type" | "end">((resolve) => {
        tapWaiterRef.current = resolve;
      });
      tapWaiterRef.current = null;
      setAwaitingTap(false);
      if (!aliveRef.current || action === "end") return null;
      if (action === "type") return await captureViaText();
      brainListen();
      outcome = await captureOnce(false);
      if (outcome.kind === "to-text") return await captureViaText();
      return outcome.kind === "heard" ? outcome.text : null;
    } finally {
      if (auto) setAutoListen(false);
    }
  }

  // ---------- the flow ----------
  //
  // There is exactly one flow: the free-form conversation below
  // (begin -> runFreeform). The scripted spine flow that used to
  // live here — fixed questions asked by recorded prompt-pack
  // clips, baked Fish clips, or deterministic phrasing — was
  // removed under Bob's all-canned-out ruling (2026-10-31).

  async function begin() {
    setPhase("conversing");
    setStatus("One moment…");
    brainThink();
    try {
      const stored = await getShieldPlan();
      const { plan } = applyDueDirectness(stored);
      planRef.current = plan;
    } catch {
      planRef.current = { ...EMPTY_SHIELD_PLAN };
    }
    try {
      const profile = await getUserProfile();
      profileRef.current = hasUserProfile(profile) ? profile : null;
    } catch {
      profileRef.current = null;
    }
    const entry = await addEntry({ source: "talk" }).catch(() => null);
    entryRef.current = entry;
    // The declared-history summary rides along with every brain call.
    try {
      const entries = await listEntries();
      recentRef.current = buildRecentJournal(entries, entry?.id ?? null);
      todayRef.current = buildTodayJournal(entries, entry?.id ?? null);
      sessionOutcomesRef.current = buildSessionOutcomes(entries, entry?.id ?? null);
    } catch {
      recentRef.current = [];
      todayRef.current = [];
      sessionOutcomesRef.current = [];
    }
    // The conversation opens with the brain's own live greeting —
    // the /api/converse opener on empty history, spoken Fish-first
    // (Bob's directive, 2026-10-31). The recorded moment cue belongs
    // to SOS; it never starts Talk It Through.
    await runFreeform();
  }

  // A paced wait that the "End exercise" escape can cut short: ticks
  // in quarter seconds and stops early when the abort flag is set.
  async function waitAbortable(seconds: number): Promise<void> {
    const ticks = Math.max(1, Math.round(seconds * 4));
    for (let i = 0; i < ticks; i++) {
      if (!aliveRef.current || actionAbortRef.current) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // Lead one guided action, step by step, in voice (Day 6): the steps
  // and their pacing come from the repertoire data (src/lib/actions
  // .ts), with his plan filling the templates — the swap dealt for
  // this moment, his why line. Each step is spoken Fish-first, then
  // its paced quiet runs; a playReset step plays his own recorded
  // reset line (his voice leads) and only speaks when there is none.
  // The abort flag (the on-screen "End exercise", or ending the
  // conversation) stops the run after the current line finishes —
  // speech can't be hard-cancelled mid-line. On completion the
  // session's journal entry gains which action ran, and the brain is
  // told on the next turn so it can ask how the urge sits now.
  async function runGuidedAction(kind: GuidedActionKind): Promise<void> {
    const plan = planRef.current;
    const entry = entryRef.current;
    if (!plan || !entry) return;
    const swapEl = assemblePlan(answersRef.current, plan).find((e) => e.kind === "swap");
    const stocked: string[] = [];
    for (const { options } of plan.triggerOptions) {
      for (const option of options) if (option.trim()) stocked.push(option.trim());
    }
    const pair = plan.thoughtPairs.find((p) => p.negative.trim() && p.positive.trim());
    const steps = actionSteps(kind, {
      swapText: swapEl?.text ?? stocked[0] ?? null,
      whyLine: plan.whyLine.trim() || null,
      replacementText: pair ? pair.positive.trim() : null,
      placeText: answersRef.current.context,
      needText: answersRef.current.need ? (NEED_SPOKEN[answersRef.current.need] ?? null) : null,
      // His word for today, if he set one today — the closing step
      // speaks it back via the {word} fill. A word from an earlier
      // day does not count.
      wordText:
        plan.todayWordDate === new Date().toDateString() ? plan.todayWord?.trim() || null : null,
      // His stored tomorrow-morning scene, if he saved one — the
      // picture-tomorrow run leads his scene (the {scene} fill)
      // instead of its generic middle steps.
      sceneText: plan.tomorrowScene?.trim() || null,
    });
    if (!steps.length) return;
    actionRanRef.current = true;
    actionAbortRef.current = false;
    setRunningActionLabel(actionLabel(kind));
    setActionRunning(true);
    setStatus("I'll lead — just follow along. End the exercise any time.");
    let completed = true;
    for (const step of steps) {
      if (!aliveRef.current || actionAbortRef.current) {
        completed = false;
        break;
      }
      if (step.playReset) {
        const reset = await getCue("reset").catch(() => null);
        if (!aliveRef.current) break;
        if (reset) {
          await playBlob(reset.blob);
        } else if (step.say) {
          setCurrentLine(step.say);
          await speakAloud(step.say);
        }
      } else if (step.say) {
        setCurrentLine(step.say);
        await speakAloud(step.say);
      }
      if (!aliveRef.current || actionAbortRef.current) {
        completed = false;
        break;
      }
      if (step.waitSeconds > 0) await waitAbortable(step.waitSeconds);
      if (actionAbortRef.current) completed = false;
    }
    setActionRunning(false);
    setStatus("");
    if (!aliveRef.current) return;
    if (completed) {
      updateEntry(entry.id, { sessionAction: actionLabel(kind) }).catch(() => {});
      const marker = `(You led us through: ${actionLabel(kind)}.)`;
      historyRef.current.push({ role: "brain", text: marker });
      persistTranscriptNote();
      pendingEventRef.current = { type: "action-completed", kind };
    }
    if (completed && kind === "one-word") {
      await captureTodayWord();
      if (!aliveRef.current) return;
    }
    // An aborted run writes nothing and tells the brain nothing: the
    // conversation just continues, and the record stays honest.
  }

  // The one-word capture (placement/catalog follow-on): when a
  // one-word run completes and he has no word set for today, the app
  // asks for it directly — "What's your word for today?" — the same
  // ask-and-capture shape as the closing outcome question, and his
  // spoken reply is stored verbatim (trimmed) as his todayWord when
  // it is a word-sized answer (four words at most; anything longer
  // is a sentence, not a word, and is not stored). A dedicated ask —
  // rather than reading the word off the next conversation turn —
  // because the action's own steps never open the mic (the word he
  // says into the opening step's quiet is not recorded), and the
  // first turn after a run answers the brain's follow-up line, so
  // taking his word from it would mis-attribute that reply. The
  // stored word rides the plan and fills {word} on later runs.
  async function captureTodayWord(): Promise<void> {
    const plan = planRef.current;
    if (!plan) return;
    const todayStr = new Date().toDateString();
    if (plan.todayWord?.trim() && plan.todayWordDate === todayStr) return;
    const ask = "What's your word for today?";
    setCurrentLine(ask);
    setStatus("");
    historyRef.current.push({ role: "brain", text: ask });
    persistTranscriptNote();
    await speakAloud(ask);
    if (!aliveRef.current) return;
    const raw = await captureAnswerText();
    if (!aliveRef.current || !raw) return;
    ingestAnswer(raw);
    const word = raw.trim().replace(/\s+/g, " ");
    if (!word || word.split(" ").length > 4) return;
    const updated: ShieldPlan = {
      ...(planRef.current ?? plan),
      todayWord: word,
      todayWordDate: todayStr,
    };
    planRef.current = updated;
    await saveShieldPlan(updated).catch(() => {});
  }

  // The free-form conversation loop: brain speaks (Fish-first), user
  // answers out loud, background parsers quietly fill the journal,
  // repeat — until the brain closes, the user goes quiet, the turn
  // cap hits, or the driving gate fires. A reply carrying a
  // guided-action directive is a proposal: its line is spoken, the
  // answer is heard, and a spoken yes runs the action (led by
  // runGuidedAction) before the loop continues. If the brain can't
  // be reached — no key, Meta down, a filtered reply, a failed
  // request — the loop hands off to the honest unavailable state.
  // There is no scripted flow to fall back to anymore
  // (all-canned-out, 2026-10-31).
  async function runFreeform() {
    freeformRef.current = true;
    for (let turn = 0; turn < 14; turn++) {
      brainThink();
      const res = await converseTurn();
      if (!aliveRef.current) return;
      if (res === "not-configured" || res === "unavailable" || res === null) {
        await showUnavailable();
        return;
      }
      brainReady();
      setCurrentLine(res.say);
      setStatus("");
      historyRef.current.push({ role: "brain", text: res.say });
      persistTranscriptNote();
      await speakBrainLine(res.say);
      if (!aliveRef.current) return;
      if (res.done) {
        await closeSession(res.choice, res.say);
        return;
      }
      // Auto-listen: the brain just asked out loud, so the mic
      // opens on its own for the answer — one auto-open per turn.
      let raw = await captureAnswerText({ autoListen: true });
      if (!aliveRef.current || sessionOverRef.current) return;
      if (!raw) {
        await speakAloud("I didn't catch that.");
        if (!aliveRef.current) return;
        raw = await captureAnswerText({ autoListen: true });
        if (!aliveRef.current || sessionOverRef.current) return;
      }
      if (!raw) {
        // The user has gone quiet — close gracefully with the plan.
        await closeSession(null, "");
        return;
      }
      ingestAnswer(raw);
      if (answersRef.current.driving) {
        await drivingClose();
        return;
      }
      if (res.action && !actionRanRef.current) {
        // That reply proposed a guided action, and the answer just
        // ingested was his answer to the proposal. A spoken yes runs
        // it now; a pass — or anything else — lets it go and the
        // loop answers what he actually said (the brain is told he
        // passed, so it never re-offers it).
        const verdict = parseActionResponse(raw);
        if (verdict === "accept") {
          brainIdle();
          await runGuidedAction(res.action);
          if (!aliveRef.current || sessionOverRef.current) return;
        } else {
          pendingEventRef.current = { type: "action-declined", kind: res.action };
        }
      }
    }
    await closeSession(null, "");
  }

  // The one close path for the free-form conversation (Day 6):
  // every free-form ending — the brain's done, the turn cap, going
  // quiet, the user ending it — funnels through here, and the first
  // caller wins. Before the finish, the session record gets its
  // outcome: the app asks out loud, in plain words, whether that was
  // a good outcome or one to work on, and his spoken answer is parsed
  // deterministically into his mark — ambiguous stays unmarked,
  // nothing is inferred. The ask belongs to the free-form
  // conversation only, and only when he actually took part.
  async function closeSession(choice: FinalChoice | null, say: string): Promise<void> {
    if (closingRef.current) return;
    closingRef.current = true;
    sessionOverRef.current = true;
    const entry = entryRef.current;
    const tookPart = historyRef.current.some((t) => t.role === "user");
    if (freeformRef.current && entry && tookPart && !outcomeAskedRef.current) {
      outcomeAskedRef.current = true;
      setCurrentLine(OUTCOME_QUESTION);
      setStatus("");
      historyRef.current.push({ role: "brain", text: OUTCOME_QUESTION });
      persistTranscriptNote();
      await speakAloud(OUTCOME_QUESTION);
      if (aliveRef.current) {
        const raw = await captureAnswerText();
        if (!aliveRef.current) return;
        if (raw) {
          ingestAnswer(raw);
          const outcome = parseOutcome(raw);
          if (outcome) {
            updateEntry(entry.id, { sessionOutcome: outcome }).catch(() => {});
          }
        }
      }
    }
    finishFreeform(choice ?? backgroundChoiceRef.current, say);
  }

  // Free-form write-back and close: the entry gets the final choice
  // (the brain's signal, with the background-parsed choice as backup),
  // the dealt swap, and the transcript note; the plan card is dealt
  // from the background captures for the finished screen. Eat routes
  // to the respawn handoff.
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

  // The user's own end: stop any capture, cut any guided action
  // short, then close through the same path as every other ending —
  // which includes the outcome question, so his record gets its mark.
  async function endConversation(): Promise<void> {
    actionAbortRef.current = true;
    stopRecordingRef.current?.();
    captureAbortRef.current?.();
    tapWaiterRef.current?.("end");
    textResolverRef.current?.("");
    pipelineRef.current?.cancel();
    persistTranscriptNote();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Nothing to cancel.
    }
    await closeSession(null, "");
  }

  if (phase === "ready") {
    return (
      <div className="mt-10">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-stone-900">Talk with me.</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            Your second brain asks one question at a time, out loud. You answer out loud. From
            your answers it deals your own plan back — your why, your if-then, what you'll have instead — in
            your words. No menus, nothing to tap through.
          </p>
          <p className="mt-3 leading-relaxed text-stone-600">
            When the moment is ready, it may offer to lead one of your own moves — five deep
            breaths, something you stocked to have instead, a short walk — step by step, out loud. Say yes, or say not
            now; either way the conversation just carries on.
          </p>
          <p className="mt-3 leading-relaxed text-stone-600">
            Your answers are turned into words by your phone&apos;s speech service when it offers
            one, and by the app&apos;s own transcription when it doesn&apos;t. It&apos;s the words
            that get kept, here in your journal — the audio itself is not kept. Nothing is scored.
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
                          ? "Instead: "
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
            <li>
              <Link href="/shield" className="font-medium text-[#2f5d3a] underline underline-offset-4">
                Add or change what you'll have instead
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

  if (phase === "unavailable") {
    return (
      <div className="mt-10 flex flex-col gap-6">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-stone-900">I can&apos;t reach the brain right now.</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            The conversation runs on the brain, and it isn&apos;t answering. Nothing here is
            faked in its place — your plan is below, in your own words, and the pause tools
            work without the brain.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                sessionOverRef.current = false;
                setPhase("conversing");
                void runFreeform();
              }}
              className="w-full rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              Try again
            </button>
            <Link
              href="/pause"
              className="w-full rounded-full border border-[#2f5d3a] px-8 py-4 text-center text-lg font-semibold text-[#2f5d3a]"
            >
              Open the pause tools
            </Link>
          </div>
        </section>
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
                          ? "Instead: "
                          : "Your ninety seconds: "}
                  </span>
                  {el.text}
                </li>
              ))}
            </ul>
          </section>
        )}
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
        <div className="mb-3 flex justify-center">
          <SecondBrain state={brainState} />
        </div>
        <p className="text-2xl font-semibold leading-snug text-stone-900" aria-live="polite">
          {currentLine || "…"}
        </p>
        {status && (
          <p className="mt-3 text-stone-600" aria-live="polite">
            {status}
          </p>
        )}
        {heard && <p className="mt-3 text-sm text-stone-500">Heard: “{heard}”</p>}

        {actionRunning && (
          <div className="mt-6">
            <p className="text-lg font-medium text-stone-700">{runningActionLabel} — I'm leading.</p>
            <button
              type="button"
              onClick={() => {
                actionAbortRef.current = true;
              }}
              className="mt-4 w-full rounded-full bg-stone-700 px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-stone-800"
            >
              End exercise
            </button>
          </div>
        )}
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
        {autoListen && (captureMode === "recording" || captureMode === "sr") && (
          <button
            type="button"
            onClick={requestTypeInstead}
            className="mt-3 text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
          >
            Type instead
          </button>
        )}
        {awaitingTap && (
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => tapWaiterRef.current?.("answer")}
              className="w-full rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
            >
              Tap to answer
            </button>
            <button
              type="button"
              onClick={() => tapWaiterRef.current?.("type")}
              className="text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
            >
              Type it instead
            </button>
          </div>
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
          onClick={() => void endConversation()}
          className="text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
        >
          End conversation
        </button>
      </div>
    </div>
  );
}
