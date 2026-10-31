// Talk It Through — background capture + the output filter
// (Day 5 build note v1.0, 2026-10-30; pruned in the code review,
// 2026-10-31).
//
// Pure module, no I/O. What lives here now, after the free-form
// revision and the all-canned-out purge:
//   - The deterministic parsers. The brain holds the conversation;
//     these read each user turn in the BACKGROUND and fill the
//     journal's structured fields (context + the driving gate, hunger
//     kind, urge number, need, choice) from the user's explicit words
//     only. The LLM never infers them, and nothing here detects or
//     infers an emotion — every answer is user-declared (Illinois
//     WOPR boundary).
//   - Plan assembly (assemblePlan / dealtSwap): the finished screen's
//     plan card, dealt ONLY from the user's own saved playbook. A
//     missing playbook item skips its element — never invented.
//   - The output filter (filterGeneratedLine), applied by
//     /api/converse to every model line before it can be spoken.
// The scripted spine that used to steer the flow from here — the
// fixed questions, the stage machine, the deterministic phrasing and
// openers — was removed with the flows that used it; nothing canned
// speaks anymore. Taxonomy rules kept from the Day 5 pass:
// "something sweet" is a target food, not a need; "end of day" is a
// risk window, not a need.

import { matchPlannedResponse, type Need, type ShieldPlan } from "./journal";
import { toolForNeed } from "./tools";

export type PartOfDay = "morning" | "afternoon" | "evening" | "night";
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

export function parseChoice(text: string): FinalChoice | null {
  const t = words(text);
  if (/\b(delay|wait|later|ten minutes|10 minutes)\b/.test(t)) return "delay";
  if (/\b(swap|instead|something else|other thing)\b/.test(t)) return "swap";
  if (/\b(eat|have it|yes|go ahead)\b/.test(t)) return "eat";
  return null;
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

// ---------- Output filter ----------
//
// Any model-phrased line is scanned before it can be spoken. A hit on
// advice / therapy / diet vocabulary rejects the line: the function
// returns the caller's fallback, and every caller in /api/converse
// passes "" — so a rejected line means no brain line at all that
// turn (a typed brain_unavailable), never a canned substitute. The
// companion reflects the user's own words; it never advises,
// diagnoses, or prescribes. The user's own verbatim playbook words
// are never filtered — this only ever runs on generated text.

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
