// Guided actions — the modality REPERTOIRE (Day 6 "big push",
// Bob's directive 2026-10-31; repertoire steer, same day).
//
// Talk It Through stops being talk-only: when the second brain has
// learned the shape of the moment, it may propose ONE concrete action
// and the app LEADS it, step by step, in voice — Bob's example: "Why
// don't we start with 5 deep breaths? Okay Bob — first breath…", a
// couple of seconds pass, "second breath…", through completion.
//
// THE REGISTRY IS DATA, NOT CODE. MODALITY_REPERTOIRE below is the
// repertoire: one entry per modality with its id, plain name, the
// situations it fits, its paced step templates, and its source.
// Both consumers read from it and nothing else:
//   - /api/converse validates a proposed kind against these ids and
//     builds its guided-action prompt section from these entries;
//   - the TalkClient paces a run from these step templates.
// A fuller catalog (pause-and-nourish-modality-repertoire JSON,
// built from Bob's mined apps + journey knowledge base) drops into
// this table later without touching conversation logic. Entries
// backed by a shipped pause tool carry `toolId` and materialize
// their steps from that tool's script in src/lib/tools.ts, so the
// toolkit stays the single source for those scripts.
//
// Step templates are patterns, not prose the model wrote: `{swap}`
// and `{why}` are filled from the user's own Shield Plan at run
// time, `{ordinal}` / `{n}` from the repeat count. The model only
// ever returns an entry's id — it never authors step text, pacing,
// or new modalities (the WOPR fence: recall and lead his own kit,
// never invented advice, never therapy content).
//
// He can decline in plain words ("not now", "no") and the
// conversation simply continues — parseActionResponse decides,
// deterministically, from his explicit words only. At the close of
// a session the app asks, in plain words, how it landed;
// parseOutcome maps his spoken answer to his mark — "good" or
// "work-on" — or leaves it unmarked when his words are ambiguous.
// Nothing is inferred; no emotion is detected.

import { toolById, type PauseTool } from "./tools";

// ---------- The repertoire (data) ----------

export interface RepertoireStep {
  // The line to speak at this step, as a template — or null for a
  // silent wait (the quiet inside a pause is a step too).
  say: string | null;
  // Quiet seconds AFTER the line finishes speaking.
  seconds: number;
  // Play his recorded reset line instead of speaking; `say` is the
  // fallback text when no recording exists.
  playReset?: boolean;
}

export interface ModalityDef {
  id: string;
  name: string; // plain label — journal record + dashboard
  situations: string[]; // when this fits, in plain words (prompt fuel)
  steps: RepertoireStep[];
  // Repeat the step group this many times, substituting {ordinal}
  // (First, Second, …) and {n} (1, 2, …) per pass.
  repeat?: number;
  // Seed entries backed by a shipped pause tool: steps materialize
  // from the tool's script instead of the literal `steps` array.
  toolId?: string;
  source: string;
}

// The seed repertoire: the allow-list from Bob's directive. Grows by
// data (the mined-modality catalog), never by new conversation code.
export const MODALITY_REPERTOIRE: ModalityDef[] = [
  {
    id: "breathing",
    name: "Five deep breaths",
    situations: ["a live urge with nothing else named yet", "the first offer when a moment needs a lead"],
    steps: [
      { say: "{ordinal} breath — breathe in, slow.", seconds: 4 },
      { say: "And let it out, slow.", seconds: 6 },
    ],
    repeat: 5,
    source: "Bob's directive, 2026-10-31 (his example lead)",
  },
  {
    id: "urge-surfing",
    name: "Urge surfing",
    situations: ["a strong urge he wants to ride out rather than act on"],
    steps: [],
    toolId: "urge-surfing",
    source: "Pause toolkit (tools.ts)",
  },
  {
    id: "stop",
    name: "STOP",
    situations: ["a moment moving too fast — he wants to stop and choose on purpose"],
    steps: [],
    toolId: "stop",
    source: "Pause toolkit (tools.ts)",
  },
  {
    id: "grounding",
    name: "Grounding, sense by sense",
    situations: ["feeling numb or bored, head somewhere else — come back to the room"],
    steps: [],
    toolId: "grounding",
    source: "Pause toolkit (tools.ts)",
  },
  {
    id: "box-breathing",
    name: "Box breathing",
    situations: ["wound up and wanting a steady rhythm to follow"],
    steps: [],
    toolId: "box-breathing",
    source: "Pause toolkit (tools.ts)",
  },
  {
    id: "breath-478",
    name: "4-7-8 breathing",
    situations: ["stressed or needing to settle — the longer, slower breathing"],
    steps: [],
    toolId: "breath-478",
    source: "Pause toolkit (tools.ts)",
  },
  {
    id: "reset",
    name: "Reset line + quiet pause",
    situations: ["after a wobble — his own reset line, then quiet, nothing reset"],
    steps: [
      { say: "{why}", seconds: 3, playReset: true },
      { say: null, seconds: 45 },
    ],
    source: "His recorded reset line (Day 4 Shield) + the pause itself",
  },
  {
    id: "swap",
    name: "A stocked swap",
    situations: ["real hunger or a named target food, with a swap stocked for this moment"],
    steps: [{ say: "Your swap for this: {swap}. It's stocked, and it's yours.", seconds: 4 }],
    source: "His Shield Plan stocked swaps",
  },
  {
    id: "walk",
    name: "A short walk",
    situations: ["restless, able to move — a walk fits the hour and the place"],
    steps: [
      {
        say: "Let's take a short walk — out the door, or just a loop around the room. I'll check in as we go.",
        seconds: 45,
      },
      { say: "Still walking — notice the air, your feet, the sounds around you.", seconds: 45 },
      { say: "Last stretch. When we stop, tell me how the urge sits now.", seconds: 30 },
    ],
    source: "His playbook pattern — the walk is his anchor move",
  },
];

export type GuidedActionKind = string;

export function modalityById(id: string): ModalityDef | null {
  return MODALITY_REPERTOIRE.find((m) => m.id === id) ?? null;
}

export function isGuidedActionKind(value: unknown): value is GuidedActionKind {
  return typeof value === "string" && modalityById(value) !== null;
}

export function actionLabel(kind: GuidedActionKind): string {
  return modalityById(kind)?.name ?? kind;
}

// ---------- Paced steps, materialized from the data ----------

// One paced step as the client runs it: speak `say` (Fish first), or
// play his recorded reset line for a playReset step (its `say` is
// the spoken fallback), then wait `waitSeconds` of quiet. The waits
// are the pacing — an exercise led too fast is just a list read aloud.
export interface ActionStep {
  say?: string;
  playReset?: boolean;
  waitSeconds: number;
}

export interface ActionContext {
  // The swap dealt from his plan for this moment (or his first
  // stocked option) — his own words. Null when nothing is stocked;
  // a "swap" run then materializes to no steps and does not run.
  swapText: string | null;
  // His why line, verbatim — fills `{why}` (the reset step's spoken
  // fallback when no reset recording exists).
  whyLine: string | null;
}

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];

// A beats-script tool: speak each beat's line at its offset; the
// wait after a beat is the distance to the next, and the last beat's
// wait runs out the tool's duration.
function beatSteps(tool: PauseTool): ActionStep[] {
  if (tool.script.kind !== "beats") return [];
  const beats = tool.script.beats;
  return beats.map((beat, i) => {
    const next = beats[i + 1];
    const wait = next ? next.at - beat.at : Math.max(3, tool.durationSeconds - beat.at);
    return { say: beat.text, waitSeconds: wait };
  });
}

// A breath-phase tool: speak the phase label, wait the phase length,
// repeat the cycle until the tool's ~90 seconds are used — the same
// loop the pause timer runs, in voice.
function breathSteps(tool: PauseTool): ActionStep[] {
  if (tool.script.kind !== "breath") return [];
  const phases = tool.script.phases;
  const cycle = phases.reduce((sum, p) => sum + p.seconds, 0);
  const cycles = Math.max(1, Math.round(80 / cycle));
  const steps: ActionStep[] = [];
  for (let c = 0; c < cycles; c++) {
    for (const phase of phases) {
      steps.push({ say: phase.label, waitSeconds: phase.seconds });
    }
  }
  return steps;
}

function fillTemplate(text: string, ctx: ActionContext, pass: number): string {
  return text
    .replaceAll("{swap}", ctx.swapText ?? "")
    .replaceAll("{why}", ctx.whyLine ?? "")
    .replaceAll("{ordinal}", ORDINALS[pass] ?? String(pass + 1))
    .replaceAll("{n}", String(pass + 1))
    .replace(/\s+/g, " ")
    .trim();
}

export function actionSteps(kind: GuidedActionKind, ctx: ActionContext): ActionStep[] {
  const def = modalityById(kind);
  if (!def) return [];
  if (def.toolId) {
    const tool = toolById(def.toolId);
    return tool.script.kind === "beats" ? beatSteps(tool) : breathSteps(tool);
  }
  // A swap with nothing stocked is not an action — no steps, no run.
  if (def.id === "swap" && !ctx.swapText) return [];
  const passes = Math.max(1, def.repeat ?? 1);
  const steps: ActionStep[] = [];
  for (let pass = 0; pass < passes; pass++) {
    for (const step of def.steps) {
      const say = step.say ? fillTemplate(step.say, ctx, pass) : "";
      steps.push({
        ...(say ? { say } : {}),
        ...(step.playReset ? { playReset: true } : {}),
        waitSeconds: step.seconds,
      });
    }
  }
  return steps;
}

// ---------- Deterministic response parsing (explicit words only) ----------

function words(text: string): string {
  return ` ${text.toLowerCase()} `;
}

// His answer to an action proposal: take it, pass on it, or neither
// (he changed the subject — the proposal is let go either way, and
// the conversation answers what he actually said).
export type ActionResponse = "accept" | "decline" | "other";

export function parseActionResponse(text: string): ActionResponse {
  const t = words(text);
  if (
    /\b(not now|no thanks|no thank you|skip( it)?|pass|later|not really|don't want|do not want|nah|nope)\b/.test(t) ||
    /^\s*no\b/.test(t)
  ) {
    return "decline";
  }
  if (
    /\b(yes|yeah|yep|okay|ok|sure|let's|lets|go ahead|sounds good|do it|please|breath\w*|walk)\b/.test(t)
  ) {
    return "accept";
  }
  return "other";
}

// The closing question the app asks out loud when a talk session
// ends — plain words, his framing: a good outcome, or one to work on.
export const OUTCOME_QUESTION =
  "Before we finish — how did that land? Was it a good outcome, or is it one to work on?";

// His mark on a session, from his spoken answer to the closing
// question. Ambiguous answers stay unmarked (null) — a record he
// didn't make is worse than no record.
export type SessionOutcome = "good" | "work-on";

export function parseOutcome(text: string): SessionOutcome | null {
  const t = words(text);
  // "Work on" side first: its phrases contain words ("good", "work")
  // that must not leak into the good side.
  if (
    /\b(didn't help|did not help|doesn't help|not good|no good|needs work|need work|to work on|work on it|still strong|still there|worse|nothing changed|not really)\b/.test(
      t,
    ) ||
    /^\s*no\b/.test(t)
  ) {
    return "work-on";
  }
  if (
    /\b(helped|helpful|worked|good outcome|better|calmer|calm now|great|good)\b/.test(t) ||
    /^\s*(yes|yeah|yep)\b/.test(t)
  ) {
    return "good";
  }
  return null;
}

// A guided-action lifecycle note the client sends with a converse
// turn: a proposed action ran to completion, or he passed on it. The
// route validates the kind against the repertoire and composes the
// wording the model sees itself — the client never injects free text
// into the prompt.
export interface ConverseEvent {
  type: "action-completed" | "action-declined";
  kind: GuidedActionKind;
}

// One past talk session as the brain is told about it: the action
// that ran (label, or null for talk-only) and the outcome HE marked.
// Built by the client from his own journal; the route only ever
// repeats it back as his record.
export interface SessionOutcomeItem {
  date: string;
  action: string | null;
  outcome: SessionOutcome | null;
  choice: string | null;
}
