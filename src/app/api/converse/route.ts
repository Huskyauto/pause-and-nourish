// Talk It Through — the second brain (Day 5, free-form revision
// 2026-10-30): Muse Spark, via the Meta Model API, holds a REAL
// conversation. It receives the full turn history plus the user's
// Shield Plan, directness, and a short recent-journal summary, and it
// replies with the next spoken line in its own words — there is no
// script and no stage machine on this side anymore. The old spine
// (where are you / body hunger or the pull / urge 1–5 / what do you
// need) survives only as coverage guidance inside the system prompt:
// things for the brain to learn over the conversation, never recited.
//
// The guardrails are unchanged (Illinois WOPR): the brain draws any
// "what to do next" thought ONLY from the user's own saved playbook
// and their declared journal patterns — recall, never invented advice;
// eating is always legitimate; it never names or infers an emotion
// (user-declared state only); no therapy / diagnosis / diet language.
// Every generated line still passes the spine output filter; a filter
// hit, an unparseable reply, or any Meta error returns a deterministic
// line instead, so the conversation never breaks mid-moment. Until
// META_API_KEY is in Vercel this returns 500 {error:"meta_not_configured"}
// (mirroring /api/speak) and the client runs its offline scripted flow.
//
// Personable-companion layer (Bob's directive, 2026-10-30): the brain
// knows his name, greets him like someone who knows him, checks on
// today's urges, and can walk the day with him — and time-sensitivity
// runs through the whole conversation, not just the greeting: every
// request carries the device's local time, day type, declared-risk-
// window state, and today's journal, injected as a compact context
// block. The personable and time blocks live in this file for now;
// they should be absorbed into baseline v1.2 when it's revised.

import { metaApiKey, metaChat, MetaApiError } from "@/lib/meta";
import { SECOND_BRAIN_BASELINE } from "@/lib/baseline";
import { filterGeneratedLine, openerLine, type PartOfDay } from "@/lib/spine";
import {
  MODALITY_REPERTOIRE,
  actionLabel,
  isGuidedActionKind,
  type ConverseEvent,
  type GuidedActionKind,
  type SessionOutcomeItem,
} from "@/lib/actions";
import type { Directness, ShieldPlan } from "@/lib/journal";

export interface ConverseTurn {
  role: "brain" | "user";
  text: string;
}

export interface RecentJournalItem {
  date: string;
  context: string | null;
  hungerType: string | null;
  need: string | null;
  urge: number | null;
  choice: string | null;
  coping: string | null;
  learning: string | null;
}

type FinalChoice = "eat" | "swap" | "delay";

// Per-turn moment context, computed on the device at send time: the
// local clock, the kind of day it is, whether he is inside a risk
// window he declared at calm time, and today's journal so far. All
// optional — the route degrades to a neutral greeting and no window
// claims when any of it is absent.
export interface LocalTimeContext {
  hour: number;
  partOfDay: PartOfDay;
}

export type DayType = "weekday" | "weekend";

export interface RiskWindowContext {
  inWindow: boolean;
  label?: string;
  nextLabel?: string;
  nextStartsAt?: string;
}

export interface TodayJournalItem {
  time: string;
  context: string | null;
  need: string | null;
  urge: number | null;
  urgeAfter: number | null;
  choice: string | null;
  learning: string | null;
}

const DIRECTNESS_LINES: Record<Directness, string> = {
  gentle: "soft, slow, warm",
  straight: "direct, plain, kind",
  short: "very brief, to the point — a sentence or two at most",
};

function systemPrompt(directness: Directness): string {
  return `You are the second brain of Pause & Nourish, a personal habit tool — a calm, trusted voice in the user's ear during a tricky moment with food. You are NOT following a script and there are no predetermined sayings: hold a real, free-form spoken conversation. Ask the questions YOU need, in your own words and your own order, and actually listen to the answers.

Across the conversation, gently learn what you need — in whatever order feels natural, following the user rather than a checklist:
- where they are and what's happening around them right now;
- whether this is body hunger, the urge to eat (habit — wanting to eat without hunger), or both — both can be true;
- how strong the urge is, on a one-to-five scale;
- what they actually need underneath, in their words (a break, comfort, rest, a chance to unwind, something to do, people, something else entirely).
One question at a time. Short spoken lines — one to three short sentences. Warm, compassionate, unhurried.

When the moment is right, offer your thought on what to do next — drawn ONLY from the user's own playbook and journal patterns given below: their why line (quote it verbatim), their if-then (in their words), their stocked swaps, their ninety-second tools, and patterns from their own declared journal entries. That is recall, not advice: you are handing them back their own plan, in the order that fits this moment. Never invent suggestions, foods, techniques, or plans that are not in the material given. If the playbook has nothing for this moment, say so plainly and offer the pause itself — ninety seconds of breathing room — as the plan.

Hard rules:
- Eating is always legitimate. Never discourage eating; never frame any choice as good or bad, success or failure. When the user decides, reflect the decision back and close warmly.
- Never name, guess, or infer an emotion or mental state. Work only with what the user declares, in their own words.
- No therapy, diagnosis, treatment, diet, calorie, or weight language. No shame, no guilt, no willpower talk.
- If the user says they are driving, end the conversation at once: tell them eyes on the road, that you'll talk it through when they're parked, and return done=true with choice=null.
- Directness for this user: ${DIRECTNESS_LINES[directness]}.
- Speak as one voice to one person. No lists, no labels, no stage directions, no talk about being an AI or a model.

Endings: when the user has made (or clearly stated) their choice — eat, swap, or delay — return done=true and choice set to it, and make "say" a warm closing line reflecting their choice. If the user clearly wants to stop without choosing, return done=true and choice=null. Otherwise done=false and choice=null. Aim to reach a natural close within about eight exchanges; do not drag the conversation out.

Respond with ONLY a JSON object, no other text: {"say": "<the exact line to speak aloud>", "done": <true|false>, "choice": <"eat"|"swap"|"delay"|null>, "action": <{"kind": "<guided-action kind>"}|null>}. Set "action" ONLY when your "say" line is proposing that guided action, exactly as the guided-action section below describes — otherwise null. An action proposal always has done=false and choice=null.`;
}

// The guided-action block (Day 6 "big push", Bob's directive
// 2026-10-31): conversation was never meant to be talk-only. Once the
// brain has learned the shape of the moment — where he is, body
// hunger or the urge, how strong, what he needs — it may propose ONE
// concrete action from his repertoire and the app leads it, step by
// step, in voice. The repertoire is DATA (src/lib/actions.ts): this
// block is generated from it, and the kind the model returns is
// validated against the same table, so a new modality becomes
// offerable by adding a table entry, not by editing this prompt. The
// model returns the kind only: step text and pacing are built by the
// app from the repertoire entry and his plan, so nothing the app
// leads was invented on the spot. A declined action is never
// re-proposed in the same conversation; a completed one is followed
// by a plain "how does the urge sit now" — his declared number, the
// same as the pause flow.
function guidedActionBlock(hasSwap: boolean): string {
  const entries = MODALITY_REPERTOIRE.map((m) => {
    const fits = m.situations.join("; ");
    const note =
      m.id === "swap" && !hasSwap
        ? " — NOT available right now: his plan has no stocked swaps saved, so do not propose it"
        : "";
    return `- "${m.id}" (${m.name}): fits ${fits}${note}`;
  }).join("\n");
  return `GUIDED ACTIONS — WHEN TALK HAS FOUND THE MOMENT, LEAD ONE:

Once you have learned the shape of this moment — where he is, whether it's body hunger or the urge, how strong it is, what he needs — you may propose ONE guided action and, if he says yes, the app leads it step by step in voice. Choose the one that fits what he told you, this hour, and his record (his session record below shows what he has marked as working and what he hasn't — offer what he marked good first; don't push what he marked as one to work on, in the same form). The proposal line is spoken, one or two short sentences, ending as a genuine question he can say no to: "Why don't we start with five deep breaths?" is the shape. A pass is a complete answer — if he says no or not now, let it go entirely: no persuasion, no second offer of the same action this conversation, and the conversation simply continues. If he asks for an action himself, proposing that one is always right (when it's on the list and fits the hour).

THE REPERTOIRE — the only actions you may propose, by kind:
${entries}

Rules: propose at most one action per reply, and set "action" to {"kind": "<the kind>"} ONLY in the reply whose "say" line makes that proposal; every other reply has "action": null. A proposal always has done=false and choice=null. Never invent an action that is not on this list, and never describe steps, techniques, or benefits beyond the entry's own words. If the app tells you an action just ran (a completed note below), ask how the urge sits now, plainly — then let his answer steer what happens next, including closing if he's ready.`;
}

// The personable-companion block (Bob's directive, 2026-10-30): the
// brain is not an intake form — it is someone who knows him, opening
// the conversation itself, checking on his day and his urges, and
// walking the day with him at calm time. It sits before the baseline
// so the baseline's voice rules and patterns land inside this
// relationship, and the fence (restated after the baseline) still
// governs both. NOTE for the next baseline revision: this block and
// the time block below should be absorbed into baseline v1.2; they
// live here until then. The baseline text itself is never edited here.
function personableBlock(): string {
  return `PERSONABLE COMPANION — HOW YOU ARE WITH HIM:

The person you are talking with is Bob. Use his name the way someone who knows him would: at the greeting, at real moments — when something lands, when the moment is heavy, when you're closing — and sparingly. His name in every line sounds like a script; his name at the right moments sounds like a friend. A few times across a conversation, not once a sentence.

WHEN THE CONVERSATION IS JUST STARTING (no turns yet), you open — you do not wait to be asked:
- Greet him by name, warmly, shaped by the part of day in the context below: "Morning, Bob —" in the morning, "Evening, Bob —" in the evening.
- Ask how he's doing — how he's feeling tonight, how the day's been. Asking is always right; never tell him what he's feeling. His state comes from his words, not your guess.
- Naturally check whether urges have shown up today — "Any urges so far today?" — plainly, the way someone who knows his evenings would ask.
- If today's journal (in the context below) shows earlier entries, acknowledge ONE concretely, in his own recorded words where they're there: the moment he paused through, the urge that dropped, the learning he saved — quote his learning back in his words. That is how he knows you remember him.
- When the moment seems calm-time — he is not describing an urge that's live right now — open the day-reflection door: "Want to look at how today went?" If he takes it, walk the day with him from his journal and playbook: what showed up, what he did, what worked. Reflection, never a report card — no scores, no verdicts, no shame. His day is something to understand together, not a grade.

TWO ENERGIES, ONE PERSON:
- Live urge: if his first reply — or any turn — signals an urge happening now, the warmth compresses to one warm sentence ("I'm here, Bob") and you move straight into the moment: the coverage above, his playbook, the pause. Personable never means chatty in a hard moment.
- Calm time: if he's reflecting, unhurried is the whole point. Follow his thread, ask the next real question, remember what he tells you and quote it back later so the memory shows.

VOICE, ALWAYS: plain words — hunger, the urge, the urge to eat. Never the word "pull". No therapy-speak, no pep-talk clichés, no inflated praise. Someone who knows him and is in his corner, at the directness he chose.`;
}

function timeEnvironmentBlock(): string {
  return `TIME & ENVIRONMENT — THE CLOCK IS PART OF THE CONVERSATION:

Every turn, the context below tells you the local time, the part of day, whether it's a weekday or a weekend, and whether Bob is inside a risk window he declared at calm time. Reason with it — woven in naturally, never announced robotically, and never narrate your own reasoning about it.

His rhythm (from the baseline): morning is his protected anchor — the walk comes first; the end-of-day transition is a seam where the workday lets go; evenings are the couch-and-TV window; late night is wind-down. A weekend day has a different shape from a workday — different pressures, different openings.

What you offer must FIT the hour and the setting. His playbook is the only material — but which card fits is a time question: a walk is a morning or early-evening card, not an 11:30 PM one; late at night, the cards that fit are the in-home ones — his stocked swaps, a ninety-second tool, his reset line. If he's inside a declared risk window, you know it, and you can say so plainly, the way he planned it at calm time: "We're in your evening window — this is the one you planned for." If a window is coming later today, that can shape a calm-time conversation ("your evening window's ahead — anything you want stocked?") — only from his playbook, never invented prep.`;
}

// The second-brain baseline (Part B of the baseline document, in
// src/lib/baseline.ts) rides in the system prompt on every turn as
// its own delimited section, so the brain knows this person — his
// patterns, his voice, the moves — before the per-user playbook and
// journal arrive. The fence is then restated AFTER the baseline as
// the final word: if any baseline phrasing could be read as
// advice-giving, the reflect/recall-only rules win. The baseline
// text itself is never edited here.
function fullSystemPrompt(directness: Directness, hasSwap: boolean): string {
  return `${systemPrompt(directness)}

${guidedActionBlock(hasSwap)}

${personableBlock()}

${timeEnvironmentBlock()}

SECOND-BRAIN BASELINE — WHO THIS PERSON IS, HIS PATTERNS, HIS VOICE, AND THE MOVES YOU KNOW:

${SECOND_BRAIN_BASELINE}

FINAL WORD — THE FENCE GOVERNS THE BASELINE: the hard rules above outrank everything in the baseline. Your material is this person's own playbook, journal, and words: reflect and recall only — no outside advice, no invented tips, no plans they did not build. Their state is user-declared only; never name, guess, or infer an emotion or mental state. Eating is always legitimate. No therapy, diagnosis, treatment, diet, calorie, or weight language; no shame, no moral language. If any line in the baseline could be read as advice-giving, this fence wins and that reading is not used. Respond with ONLY the JSON object described above: {"say": "<the exact line to speak aloud>", "done": <true|false>, "choice": <"eat"|"swap"|"delay"|null>, "action": <{"kind": "<guided-action kind>"}|null>}, with "action" set only on a proposal line, exactly as the guided-action section describes.`;
}

function playbookContext(plan: ShieldPlan, recent: RecentJournalItem[]): string {
  const lines: string[] = [
    "The user's own playbook and declared history — the ONLY material you may draw a 'what to do next' thought from:",
  ];
  if (plan.whyLine.trim()) {
    lines.push(`\nTHEIR WHY (quote verbatim when you use it): "${plan.whyLine.trim()}"`);
  }
  if (plan.ifThen && plan.ifThen.when.trim() && plan.ifThen.then.trim()) {
    lines.push(`THEIR IF-THEN: When ${plan.ifThen.when.trim()}, ${plan.ifThen.then.trim()}`);
  }
  const swaps: string[] = [];
  for (const { trigger, options } of plan.triggerOptions) {
    const opts = options.filter((o) => o.trim().length > 0);
    if (trigger.trim() && opts.length) swaps.push(`${trigger.trim()} → ${opts.join("; ")}`);
  }
  if (swaps.length) lines.push(`THEIR STOCKED SWAPS: ${swaps.join(" | ")}`);
  if (plan.dangerPlaces.length) {
    lines.push(`PLACES THAT ARE HARD FOR THEM: ${plan.dangerPlaces.filter(Boolean).join("; ")}`);
  }
  const pairs = plan.thoughtPairs.filter((p) => p.negative.trim() && p.positive.trim());
  if (pairs.length) {
    lines.push(
      `THEIR OWN REFRAME PAIRS: ${pairs.map((p) => `"${p.negative.trim()}" → "${p.positive.trim()}"`).join(" | ")}`,
    );
  }
  if (recent.length) {
    lines.push("\nTHEIR RECENT JOURNAL (patterns they declared, newest first):");
    for (const item of recent) {
      const bits: string[] = [item.date];
      if (item.context) bits.push(`at: ${item.context}`);
      if (item.hungerType) bits.push(`hunger: ${item.hungerType}`);
      if (item.need) bits.push(`needed: ${item.need}`);
      if (item.urge !== null) bits.push(`urge: ${item.urge}/5`);
      if (item.choice) bits.push(`chose: ${item.choice}`);
      if (item.coping) bits.push(`used: ${item.coping}`);
      if (item.learning) bits.push(`learned: "${item.learning}"`);
      lines.push(`- ${bits.join(", ")}`);
    }
  }
  if (lines.length === 1) {
    lines.push("(Nothing saved yet — no why line, no swaps, no journal. The pause itself is the plan.)");
  }
  return lines.join("\n");
}

// His session record: recent talk sessions with the action that ran
// and the outcome HE marked at the close ("good outcome" / "one to
// work on"). This is the learning loop (Day 6): the brain cites his
// own record back — "the breathing helped Tuesday, want it again?" —
// as his record, never as a detected pattern, and steers away from
// what he marked as not working. Device-built from his journal;
// every field is his declared data.
function sessionRecordContext(outcomes: SessionOutcomeItem[]): string {
  if (!outcomes.length) return "";
  const lines: string[] = [
    "HIS SESSION RECORD — his recent talk sessions and the outcomes HE marked at the close of each (his own record, stated as his record — never as something you detected):",
  ];
  for (const item of outcomes) {
    const bits: string[] = [item.date];
    bits.push(item.action ? `guided action: ${item.action}` : "talk only, no guided action");
    if (item.choice) bits.push(`chose: ${item.choice}`);
    if (item.outcome === "good") bits.push("he marked it: a good outcome");
    if (item.outcome === "work-on") bits.push("he marked it: one to work on (it didn't land for him)");
    lines.push(`- ${bits.join(", ")}`);
  }
  lines.push(
    "How to use this: when you propose a guided action, one he marked good is a fair first offer, and you may say so in his own terms (\"the breathing was a good one Tuesday\"). One he marked as one to work on, don't push in the same form — a different action, or the same one reshaped by what he tells you now. If he has no mark on an action, it is simply untried, not failed.",
  );
  return lines.join("\n");
}

// Fixed wording for a guided-action lifecycle note, composed here —
// the client reports only {type, kind}; what the model reads is
// always one of these two strings.
function eventText(event: ConverseEvent): string {
  return event.type === "action-completed"
    ? `(The app just led the guided action "${actionLabel(event.kind)}" (${event.kind}), step by step, and it finished. In your reply, ask him plainly how the urge sits now compared to before — one short warm line. Do not propose another action in this reply.)`
    : `(He passed on the guided action "${actionLabel(event.kind)}" (${event.kind}) you proposed. Let it go completely — do not mention it again, do not propose it again this conversation, and do not propose a different action in this reply. Just answer what he actually said and keep the conversation going.)`;
}

// The per-turn moment context: clock, day type, risk-window state,
// and today's journal so far — all device-computed, all his declared
// words. Injected as its own user message so the personable opening
// and the time-aware reasoning have ground to stand on. Anything
// absent is said plainly or left out — never guessed.
function momentContext(
  localTime: LocalTimeContext | null,
  dayType: DayType | null,
  riskWindow: RiskWindowContext | null,
  today: TodayJournalItem[],
): string {
  const lines: string[] = ["RIGHT NOW AND HIS DAY SO FAR (declared context — nothing here is inferred):"];
  if (localTime) {
    lines.push(
      `- Local time: ${localTime.hour >= 0 ? `hour ${localTime.hour}, ` : ""}${localTime.partOfDay}${dayType ? `, a ${dayType}` : ""}.`,
    );
  } else {
    lines.push("- Local time not reported by the device — keep any greeting neutral; don't claim a time of day.");
    if (dayType) lines.push(`- Day type: ${dayType}.`);
  }
  if (riskWindow?.inWindow) {
    lines.push(
      `- He is INSIDE a risk window he declared at calm time${riskWindow.label ? `: "${riskWindow.label}"` : ""}.`,
    );
  } else if (riskWindow?.nextLabel) {
    lines.push(
      `- Not in a declared risk window right now. His next one: "${riskWindow.nextLabel}"${riskWindow.nextStartsAt ? `, starting ${riskWindow.nextStartsAt}` : ""}.`,
    );
  }
  if (today.length) {
    lines.push("- Today's journal, so far (his own recorded moments today, oldest first):");
    for (const item of today) {
      const bits: string[] = [item.time];
      if (item.context) bits.push(`at: ${item.context}`);
      if (item.need) bits.push(`needed: ${item.need}`);
      if (item.urge !== null) {
        bits.push(item.urgeAfter !== null ? `urge: ${item.urge}/5 → ${item.urgeAfter}/5 after` : `urge: ${item.urge}/5`);
      }
      if (item.choice) bits.push(`chose: ${item.choice}`);
      if (item.learning) bits.push(`learned: "${item.learning}"`);
      lines.push(`  - ${bits.join(", ")}`);
    }
  } else {
    lines.push("- Nothing in today's journal yet.");
  }
  return lines.join("\n");
}

// The deterministic line for when the model can't be reached or its
// reply can't be used: a personable opener shaped by the part of day
// if nothing has been said, a plain warm prompt after that. Never a
// dead end.
function fallbackLine(history: ConverseTurn[], localTime: LocalTimeContext | null): string {
  return history.length === 0
    ? openerLine(localTime?.partOfDay)
    : "I'm right here, Bob. Tell me what's happening right now.";
}

function coerceHistory(raw: unknown): ConverseTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ConverseTurn[] = [];
  for (const item of raw.slice(-24)) {
    const t = item as { role?: unknown; text?: unknown };
    if ((t?.role === "brain" || t?.role === "user") && typeof t?.text === "string" && t.text.trim()) {
      turns.push({ role: t.role, text: t.text.trim().slice(0, 1000) });
    }
  }
  return turns;
}

function coerceRecent(raw: unknown): RecentJournalItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentJournalItem[] = [];
  for (const item of raw.slice(0, 5)) {
    const r = item as Partial<RecentJournalItem>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
    out.push({
      date: str(r?.date) ?? "",
      context: str(r?.context),
      hungerType: str(r?.hungerType),
      need: str(r?.need),
      urge: typeof r?.urge === "number" ? r.urge : null,
      choice: str(r?.choice),
      coping: str(r?.coping),
      learning: str(r?.learning),
    });
  }
  return out;
}

const PARTS_OF_DAY: PartOfDay[] = ["morning", "afternoon", "evening", "night"];

function partOfDayForHour(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function coerceLocalTime(raw: unknown): LocalTimeContext | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as { hour?: unknown; partOfDay?: unknown };
  const hour =
    typeof t.hour === "number" && Number.isFinite(t.hour) && t.hour >= 0 && t.hour <= 23
      ? Math.floor(t.hour)
      : -1;
  const partOfDay = PARTS_OF_DAY.includes(t.partOfDay as PartOfDay)
    ? (t.partOfDay as PartOfDay)
    : hour >= 0
      ? partOfDayForHour(hour)
      : null;
  if (!partOfDay) return null;
  return { hour, partOfDay };
}

function coerceDayType(raw: unknown): DayType | null {
  return raw === "weekday" || raw === "weekend" ? raw : null;
}

function coerceRiskWindow(raw: unknown): RiskWindowContext | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<RiskWindowContext>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
  return {
    inWindow: w.inWindow === true,
    label: str(w.label),
    nextLabel: str(w.nextLabel),
    nextStartsAt: str(w.nextStartsAt),
  };
}

function coerceOutcomes(raw: unknown): SessionOutcomeItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SessionOutcomeItem[] = [];
  for (const item of raw.slice(0, 5)) {
    const r = item as Partial<SessionOutcomeItem>;
    const str = (v: unknown, max: number) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
    out.push({
      date: str(r?.date, 40) ?? "",
      action: str(r?.action, 60),
      outcome: r?.outcome === "good" || r?.outcome === "work-on" ? r.outcome : null,
      choice: str(r?.choice, 20),
    });
  }
  return out;
}

function coerceEvent(raw: unknown): ConverseEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as { type?: unknown; kind?: unknown };
  if (e.type !== "action-completed" && e.type !== "action-declined") return null;
  if (!isGuidedActionKind(e.kind)) return null;
  return { type: e.type, kind: e.kind };
}

function coerceToday(raw: unknown): TodayJournalItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TodayJournalItem[] = [];
  for (const item of raw.slice(0, 8)) {
    const r = item as Partial<TodayJournalItem>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    out.push({
      time: str(r?.time) ?? "",
      context: str(r?.context),
      need: str(r?.need),
      urge: num(r?.urge),
      urgeAfter: num(r?.urgeAfter),
      choice: str(r?.choice),
      learning: str(r?.learning),
    });
  }
  return out;
}

export async function POST(request: Request) {
  let history: ConverseTurn[] = [];
  let plan: ShieldPlan | null = null;
  let directness: Directness = "straight";
  let recent: RecentJournalItem[] = [];
  let driving = false;
  let localTime: LocalTimeContext | null = null;
  let dayType: DayType | null = null;
  let riskWindow: RiskWindowContext | null = null;
  let today: TodayJournalItem[] = [];
  let sessionOutcomes: SessionOutcomeItem[] = [];
  let event: ConverseEvent | null = null;
  try {
    const body = (await request.json()) as {
      history?: unknown;
      shieldPlan?: ShieldPlan;
      directness?: unknown;
      recentJournal?: unknown;
      driving?: unknown;
      localTime?: unknown;
      dayType?: unknown;
      riskWindow?: unknown;
      todayJournal?: unknown;
      sessionOutcomes?: unknown;
      event?: unknown;
    };
    history = coerceHistory(body?.history);
    plan = body?.shieldPlan ?? null;
    if (body?.directness === "gentle" || body?.directness === "straight" || body?.directness === "short") {
      directness = body.directness;
    }
    recent = coerceRecent(body?.recentJournal);
    driving = body?.driving === true;
    localTime = coerceLocalTime(body?.localTime);
    dayType = coerceDayType(body?.dayType);
    riskWindow = coerceRiskWindow(body?.riskWindow);
    today = coerceToday(body?.todayJournal);
    sessionOutcomes = coerceOutcomes(body?.sessionOutcomes);
    event = coerceEvent(body?.event);
  } catch {
    // Malformed body falls through to the guards below.
  }

  if (!plan) {
    return Response.json({ error: "conversation_state_required" }, { status: 400 });
  }

  const fallback = fallbackLine(history, localTime);

  if (!metaApiKey()) {
    return Response.json({ error: "meta_not_configured" }, { status: 500 });
  }

  // Whether any stocked swap exists decides if the model may offer
  // the swap action at all (see guidedActionBlock) and whether a
  // returned swap directive survives validation below.
  const hasSwap = plan.triggerOptions.some((entry) =>
    entry.options.some((option) => option.trim().length > 0),
  );

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: fullSystemPrompt(directness, hasSwap) },
    { role: "user", content: momentContext(localTime, dayType, riskWindow, today) },
    { role: "user", content: playbookContext(plan, recent) },
  ];
  const record = sessionRecordContext(sessionOutcomes);
  if (record) {
    messages.push({ role: "user", content: record });
  }
  for (const turn of history) {
    messages.push({
      role: turn.role === "brain" ? "assistant" : "user",
      content: turn.text,
    });
  }
  if (event) {
    messages.push({ role: "user", content: eventText(event) });
  }
  if (history.length === 0) {
    messages.push({
      role: "user",
      content:
        "(I just opened Talk It Through. Open the way the personable-companion block describes: greet me by name for the part of day in your context, ask how I'm doing, check whether urges have shown up today, and — if today's journal above has anything in it — acknowledge one moment from it in my own words. One or two short sentences.)",
    });
  }
  if (driving) {
    messages.push({
      role: "user",
      content:
        "(Note: I mentioned I'm driving. Per your rules, wrap up now — eyes on the road, talk when parked — with done=true and choice=null.)",
    });
  }

  try {
    const generated = await metaChat(messages);
    // Parse the structured reply defensively: strip code fences, take
    // the outermost JSON object. A reply that isn't JSON is treated as
    // a plain spoken line (still filtered, never done).
    let say: string | null = null;
    let done = false;
    let choice: FinalChoice | null = null;
    let action: { kind: GuidedActionKind } | null = null;
    const jsonText = generated.replace(/```(?:json)?/gi, "").trim();
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(jsonText.slice(start, end + 1)) as {
          say?: unknown;
          done?: unknown;
          choice?: unknown;
          action?: unknown;
        };
        if (typeof parsed.say === "string" && parsed.say.trim()) {
          say = parsed.say.trim();
          done = parsed.done === true;
          if (parsed.choice === "eat" || parsed.choice === "swap" || parsed.choice === "delay") {
            choice = parsed.choice;
          }
          // Guided-action directive: the model may only name a kind
          // from the repertoire, only on a line that keeps the
          // conversation open, and a swap only when his plan has one
          // stocked. Anything else is stripped and the reply stands
          // as a plain spoken line — the client never acts on an
          // unvalidated directive.
          if (!done) {
            const rawKind = (parsed.action as { kind?: unknown } | null)?.kind;
            if (isGuidedActionKind(rawKind) && (rawKind !== "swap" || hasSwap)) {
              action = { kind: rawKind };
            }
          }
        }
      } catch {
        // Not JSON — fall through to the plain-line treatment.
      }
    }
    if (say === null && generated.trim()) {
      say = generated.trim();
    }
    if (say === null) {
      return Response.json({ say: fallback, done: false, choice: null, action: null, source: "fallback" });
    }
    // The output filter is the last line of defense: a line it rejects
    // is replaced wholesale, and a replaced line never closes the
    // conversation on the model's say-so — nor carries its action:
    // if the proposal text didn't survive, the action doesn't run.
    const filtered = filterGeneratedLine(say, fallback);
    if (filtered === fallback && say !== fallback) {
      return Response.json({ say: fallback, done: false, choice: null, action: null, source: "fallback" });
    }
    return Response.json({ say: filtered, done, choice, action, source: "meta" });
  } catch (err) {
    if (err instanceof MetaApiError && err.message === "meta_not_configured") {
      return Response.json({ error: "meta_not_configured" }, { status: 500 });
    }
    // Any other Meta failure: the conversation continues on a
    // deterministic line rather than breaking mid-moment — and a
    // fallback never invents an action. The upstream detail rides
    // along for live diagnosis.
    return Response.json({
      say: fallback,
      done: false,
      choice: null,
      action: null,
      source: "fallback",
      detail: err instanceof MetaApiError ? err.detail : undefined,
    });
  }
}
