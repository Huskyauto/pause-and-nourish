// Talk It Through — the spoken spine (Day 5 build note v1.0, 2026-10-30).
//
// Pure module, no I/O: the client state machine and /api/converse share
// it, so the conversation runs identically whether Muse Spark phrases
// the lines or the deterministic fallback does. The rules baked in:
//   - The brain asks; the user answers out loud; structured values
//     (urge number, hunger-vs-pull, eat/swap/delay) are parsed HERE,
//     deterministically, from the user's explicit words. The LLM never
//     infers them, and nothing here detects or infers an emotion —
//     every answer is user-declared (Illinois WOPR boundary).
//   - The game plan is assembled ONLY from the user's own saved
//     playbook. A missing playbook item skips its step — never invented.
//   - "Something sweet" is a target food, not a need; "end of day" is a
//     risk window, not a need (taxonomy pass, 2026-10-30).

import { matchPlannedResponse, type Directness, type Need, type ShieldPlan } from "./journal";
import { toolForNeed } from "./tools";

export type QuestionId = "q1" | "q2" | "q3" | "q4" | "q5";
export type HungerKind = "body" | "pull" | "both";
export type BranchChoice = "pause" | "reset" | "long";
export type FinalChoice = "eat" | "swap" | "delay";

export interface TalkAnswers {
  context: string | null; // Q1, the user's own words
  driving: boolean; // Q1 safety gate
  hungerKind: HungerKind | null; // Q2
  urge: number | null; // Q3, explicit 1–5
  need: Need | null; // Q4, mapped from declared words
  needRaw: string | null; // Q4, the user's own words
  targetFood: string | null; // Q4: "something sweet" — a target, not a need
  window: string | null; // Q4: "end of day" — a risk window, not a need
  branch: BranchChoice | null; // Q5, only asked when urge >= 4
}

export const EMPTY_ANSWERS: TalkAnswers = {
  context: null,
  driving: false,
  hungerKind: null,
  urge: null,
  need: null,
  needRaw: null,
  targetFood: null,
  window: null,
  branch: null,
};

// The fixed spine questions — these exact words are the prompt-pack
// scripts (recorded once at calm time in the user's own voice).
export const SPINE_QUESTIONS: { id: QuestionId; text: string }[] = [
  { id: "q1", text: "Where are you right now?" },
  { id: "q2", text: "Is this body hunger, or the pull — or both? Both can be true." },
  { id: "q3", text: "How strong is the pull — one to five?" },
  {
    id: "q4",
    text: "What do you actually need right now — a break, comfort, rest, a chance to unwind, something to do, or people?",
  },
  {
    id: "q5",
    text: "The pull's strong. Do you want the full ninety seconds, your reset line first, or the long pause — ten quiet minutes?",
  },
];

export function questionText(id: QuestionId): string {
  return SPINE_QUESTIONS.find((q) => q.id === id)?.text ?? "";
}

export const CHOICE_QUESTION = "So — eat it, swap it, or delay ten minutes? All three count.";

export const EXIT_EAT_LINE =
  "That's body hunger — that's what food is for. Eat, and enjoy it. No pause needed, nothing to fix.";

export const DEFERRED_LINE =
  "You're driving — eyes on the road. We'll talk it through when you're parked. Your plan is here when you stop.";

// ---------- Deterministic parsing (explicit words only) ----------

function words(text: string): string {
  return ` ${text.toLowerCase()} `;
}

export function parseContext(text: string): { context: string; driving: boolean } {
  const t = words(text);
  const driving = /\b(driv\w*|car|road|wheel|commut\w*|highway|traffic)\b/.test(t);
  return { context: text.trim().slice(0, 140), driving };
}

export function parseHunger(text: string): HungerKind | null {
  const t = words(text);
  if (/\bboth\b/.test(t)) return "both";
  const body =
    /\b(body|physical|actually hungry|real hunger|really hungry|stomach|empty stomach)\b/.test(t) ||
    t.includes("body hunger");
  const pull =
    /\b(pull|head hunger|habit|just want|craving|crave|not hungry|not really hungry|the pull)\b/.test(t) ||
    t.includes("not hungry");
  if (body && pull) return "both";
  if (body) return "body";
  if (pull) return "pull";
  return null;
}

const URGE_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

export function parseUrge(text: string): number | null {
  const t = words(text);
  const digit = t.match(/\b([1-5])\b/);
  if (digit) return Number(digit[1]);
  for (const [w, n] of Object.entries(URGE_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  }
  if (/\b(mild|weak|small|barely)\b/.test(t)) return null; // not a number — re-ask
  return null;
}

export interface NeedParse {
  need: Need | null;
  targetFood: string | null;
  window: string | null;
}

// Need mapping order is deliberate: the specific underneath-states win
// over the generic ones, and the two reclassified answers (sweet →
// target food, end of day → window) are captured without becoming needs.
export function parseNeed(text: string): NeedParse {
  const t = words(text);
  let targetFood: string | null = null;
  let riskWindow: string | null = null;
  if (/\b(sweet|chocolate|candy|ice cream|dessert|cookie|cake|sugar)\b/.test(t)) {
    targetFood = text.trim().slice(0, 140);
  }
  if (/\b(end of (the )?day|long day|done for the day|evening|night)\b/.test(t)) {
    riskWindow = "end of day";
  }
  let need: Need | null = null;
  if (/\b(numb|zone out|not feel|don't want to feel)\b/.test(t)) need = "numb";
  else if (/\b(lonely|alone|people|company|someone|miss)\b/.test(t)) need = "lonely";
  else if (/\b(bored|boring|something to do|nothing to do)\b/.test(t)) need = "bored";
  else if (/\b(tired|rest|sleep|exhaust\w*|wiped|drained)\b/.test(t)) need = "tired";
  else if (/\b(stress\w*|wound up|unwind|tense|overwhelm\w*|anxious|on edge)\b/.test(t)) need = "stressed";
  else if (/\b(comfort|cozy|warm|hug)\b/.test(t)) need = "comfort";
  else if (/\b(soothe|calm|settle|soothing)\b/.test(t)) need = "soothe";
  else if (/\b(reward|treat|earned|deserve|deserved)\b/.test(t)) need = "reward";
  else if (/\b(relief|relieve|let go|release)\b/.test(t)) need = "relief";
  else if (/\b(break|escape|get away|step away|away)\b/.test(t)) need = "escape";
  else if (/\b(fuel|energy|food actually|actually food)\b/.test(t)) need = "fuel";
  // End of day with no clearer need named: the need underneath is
  // almost always rest — lead with it (taxonomy note), window kept.
  if (!need && riskWindow) need = "tired";
  return { need, targetFood, window: riskWindow };
}

export function parseBranch(text: string): BranchChoice | null {
  const t = words(text);
  if (/\b(long|ten|10|quiet minutes)\b/.test(t)) return "long";
  if (/\b(reset)\b/.test(t)) return "reset";
  if (/\b(ninety|90|full|surf\w*|tool|pause)\b/.test(t)) return "pause";
  return null;
}

export function parseChoice(text: string): FinalChoice | null {
  const t = words(text);
  if (/\b(delay|wait|later|ten minutes|10 minutes)\b/.test(t)) return "delay";
  if (/\b(swap|instead|something else|other thing)\b/.test(t)) return "swap";
  if (/\b(eat|have it|yes|go ahead)\b/.test(t)) return "eat";
  return null;
}

// ---------- Flow ----------

export type TalkStage =
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "q5"
  | "plan"
  | "choice"
  | "exit-eat"
  | "deferred"
  | "pause-handoff"
  | "done";

// The next stage after a question was answered. Pure flow control —
// the same table drives the client and validates /api/converse calls.
export function nextStage(answers: TalkAnswers, justAnswered: QuestionId | "start"): TalkStage {
  if (justAnswered === "start") return "q1";
  if (justAnswered === "q1") return answers.driving ? "deferred" : "q2";
  if (justAnswered === "q2") return answers.hungerKind === "body" ? "exit-eat" : "q3";
  if (justAnswered === "q3") return "q4";
  if (justAnswered === "q4") {
    if ((answers.urge ?? 0) >= 4) return "q5";
    return "plan";
  }
  // q5: a requested pause runs BEFORE the choice — the plan is dealt,
  // then the existing pause flow carries the choice from there.
  if (answers.branch === "pause" || answers.branch === "long") return "pause-handoff";
  return "plan";
}

// ---------- Game-plan assembly (the user's own playbook only) ----------

export interface PlanElement {
  kind: "why" | "ifThen" | "swap" | "tool";
  text: string; // the user's own words, as saved
}

function ifThenMatches(when: string, answers: TalkAnswers): boolean {
  const haystack = `${answers.context ?? ""} ${answers.needRaw ?? ""} ${answers.need ?? ""}`.toLowerCase();
  const tokens = when
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2);
  return tokens.some((tok) => haystack.includes(tok));
}

function findSwap(answers: TalkAnswers, plan: ShieldPlan): string | null {
  // The established matcher: the option stocked for this context.
  const byContext = matchPlannedResponse(plan, answers.context);
  if (byContext) return byContext;
  // Need-matched: a stocked moment whose name carries the need word.
  if (answers.need) {
    const needle = answers.need;
    for (const { trigger, options } of plan.triggerOptions) {
      if (trigger.toLowerCase().includes(needle)) {
        const found = options.find((o) => o.trim().length > 0);
        if (found) return found;
      }
    }
  }
  return null; // No match — the step is skipped, never fabricated.
}

export function assemblePlan(answers: TalkAnswers, plan: ShieldPlan): PlanElement[] {
  const elements: PlanElement[] = [];
  const why = plan.whyLine.trim();
  if (why) elements.push({ kind: "why", text: why });
  if (plan.ifThen && plan.ifThen.when.trim() && plan.ifThen.then.trim()) {
    if (ifThenMatches(plan.ifThen.when, answers)) {
      elements.push({
        kind: "ifThen",
        text: `When ${plan.ifThen.when.trim()}, ${plan.ifThen.then.trim()}`,
      });
    }
  }
  const swap = findSwap(answers, plan);
  if (swap) elements.push({ kind: "swap", text: swap });
  const tool = toolForNeed(answers.need);
  elements.push({
    kind: "tool",
    text:
      answers.branch === "long"
        ? `${tool.name} — and stay in the long pause as long as you need`
        : tool.name,
  });
  return elements;
}

// The plannedResponse an entry should carry: the swap dealt, if any.
export function dealtSwap(answers: TalkAnswers, plan: ShieldPlan): string | null {
  return findSwap(answers, plan);
}

// ---------- Deterministic phrasing (the fallback voice of the spine) ----------

export function phrasePlan(elements: PlanElement[], directness: Directness | null): string {
  if (elements.length === 0) {
    return "Your plan is the pause itself — ninety seconds, then you choose.";
  }
  const parts: string[] = [];
  for (const el of elements) {
    if (el.kind === "why") parts.push(el.text); // verbatim, no frame
    else if (el.kind === "ifThen") parts.push(`Your if-then: ${el.text}.`);
    else if (el.kind === "swap") parts.push(`Your swap for this: ${el.text}.`);
    else if (el.kind === "tool") parts.push(`Your ninety seconds: ${el.text}.`);
  }
  if (directness === "short") {
    return parts.join(" ");
  }
  if (directness === "straight") {
    return `Here's your plan. ${parts.join(" ")}`;
  }
  return `Here's your plan, in your own words. ${parts.join(" ")}`;
}

// The deterministic line for any stage — what /api/converse falls back
// to, and what the client speaks when the Meta key isn't in yet.
export function phraseStage(
  stage: TalkStage,
  answers: TalkAnswers,
  plan: ShieldPlan,
  directness: Directness | null,
): string {
  switch (stage) {
    case "q1":
    case "q2":
    case "q3":
    case "q4":
    case "q5":
      return questionText(stage);
    case "plan":
      return `${phrasePlan(assemblePlan(answers, plan), directness)} ${CHOICE_QUESTION}`;
    case "choice":
      return CHOICE_QUESTION;
    case "exit-eat":
      return EXIT_EAT_LINE;
    case "deferred":
      return DEFERRED_LINE;
    default:
      return "";
  }
}

// ---------- Output filter ----------
//
// Any model-phrased line is scanned before it can be spoken. A hit on
// advice / therapy / diet vocabulary replaces the whole line with the
// deterministic phrasing (or a written reframe) — the companion reflects
// the user's own words; it never advises, diagnoses, or prescribes.
// The user's own verbatim playbook words are never filtered — this only
// ever runs on generated text.

const BLOCKED_PATTERNS: RegExp[] = [
  /\byou should\b/i,
  /\byou must\b/i,
  /\byou need to (eat|stop|avoid|cut|exercise)\b/i,
  /\bcalorie/i,
  /\bweight loss\b/i,
  /\blose weight\b/i,
  /\bdiet(ing|ary)?\b/i,
  /\btherap/i,
  /\bdiagnos/i,
  /\bdisorder\b/i,
  /\btreatment plan\b/i,
  /\bbinge\b/i,
  /\bwillpower\b/i,
  /\bcheat (day|meal)\b/i,
  /\bguilt(y| trip)?\b/i,
  /\bshame\b/i,
  /\bmeal plan\b/i,
  /\bportion control\b/i,
  /\bdon'?t eat\b/i,
  /\bstop eating\b/i,
  /\bforbidden food\b/i,
  /\bburn (it |them )?off\b/i,
  /\bclinician\b/i,
  /\bprescri(be|ption)\b/i,
];

export function filterGeneratedLine(generated: string, fallback: string): string {
  const line = generated.trim();
  if (!line) return fallback;
  if (line.length > 600) return fallback;
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(line)) return fallback;
  }
  return line;
}
