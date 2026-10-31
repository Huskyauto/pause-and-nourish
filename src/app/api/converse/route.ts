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
// Every generated line still passes the spine output filter. A filter
// hit, an unparseable reply, or any Meta error returns a typed
// {error:"brain_unavailable"} instead — never a canned line (Bob's
// ruling, 2026-10-31: nothing pre-recorded or pre-scripted speaks;
// the LLM composes every spoken line in the moment, or the app
// honestly says it can't reach the brain). Until META_API_KEY is in
// Vercel this returns 500 {error:"meta_not_configured"} (mirroring
// /api/speak) and the client shows the same honest state.
//
// Personable-companion layer (Bob's directive, 2026-10-30): the brain
// knows his name, greets him like someone who knows him, checks on
// today's urges, and can walk the day with him — and time-sensitivity
// runs through the whole conversation, not just the greeting: every
// request carries the device's local time, day type, declared-risk-
// window state, and today's journal, injected as a compact context
// block. The personable and time blocks live in this file for now;
// they should be absorbed into baseline v1.2 when it's revised.
//
// Story-intake layer (2026-10-31): when the client sends a profile
// (a new user's "Your story" intake — name, story, triggers), the
// prompt is rebuilt around THAT user: their story is the ground
// truth about them, and the founder baseline rides as a worked
// example / template with explicit precedence language. No profile
// in the request = the founder path, byte-for-byte what it was.

import { metaApiKey, metaChat, MetaApiError } from "@/lib/meta";
import { SECOND_BRAIN_BASELINE } from "@/lib/baseline";
import { filterGeneratedLine, type PartOfDay } from "@/lib/spine";
import {
  MODALITY_REPERTOIRE,
  SITUATION_RANKING,
  actionLabel,
  isGuidedActionKind,
  modalityPlacement,
  type ConverseEvent,
  type GuidedActionKind,
  type SessionOutcomeItem,
} from "@/lib/actions";
import type { Directness, ShieldPlan, UserProfile } from "@/lib/journal";

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

When the moment is right, offer your thought on what to do next — drawn ONLY from the user's own playbook and journal patterns given below: their why line (quote it verbatim), their if-then (in their words), what they've stocked to have instead, their ninety-second tools, and patterns from their own declared journal entries. That is recall, not advice: you are handing them back their own plan, in the order that fits this moment. Never invent suggestions, foods, techniques, or plans that are not in the material given. If the playbook has nothing for this moment, say so plainly and offer the pause itself — ninety seconds of breathing room — as the plan.

ELICIT, DON'T PRESCRIBE: where what they would do instead comes up, your job is to draw THEIR answer out of them — ask what they would do differently, how they would change this moment, and follow up on what they say. What they answer, in their words, is their plan material; in the moment you deal that same stated approach back to them, because that's how you know how they think. Never hand them a list of options of your own.

Hard rules:
- Never use the word "swap" with the user. When the choice comes up, say it plainly — eat it, have something else instead, or wait a bit — and phrase it fresh each time, in words that fit what they just said; never the same set sentence twice. The same goes for asking what they would have or do instead: ask it your own way, following their words — that question is never a script.
- Eating is always legitimate. Never discourage eating; never frame any choice as good or bad, success or failure. When the user decides, reflect the decision back and close warmly.
- Never name, guess, or infer an emotion or mental state. Work only with what the user declares, in their own words.
- No therapy, diagnosis, treatment, diet, calorie, or weight language. No shame, no guilt, no willpower talk.
- If the user says they are driving, end the conversation at once: tell them eyes on the road, that you'll talk it through when they're parked, and return done=true with choice=null.
- Directness for this user: ${DIRECTNESS_LINES[directness]}.
- Speak as one voice to one person. No lists, no labels, no stage directions, no talk about being an AI or a model.

Endings: when the user has made (or clearly stated) their choice — eat, have something else instead, or delay — return done=true and choice set to it, and make "say" a warm closing line reflecting their choice. If the user clearly wants to stop without choosing, return done=true and choice=null. Otherwise done=false and choice=null. Aim to reach a natural close within about eight exchanges; do not drag the conversation out.

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
function guidedActionBlock(hasSwap: boolean, hasReplacement: boolean): string {
  // Placement gate: calm-time entries (placement "calm" — the
  // for-later items) are NOT part of the offerable repertoire. They
  // never appear in this block, and validation below strips the kind
  // if one is returned anyway. In the moment is conversation + led
  // moves only; for-later items surface after the session, not in it.
  const entries = MODALITY_REPERTOIRE.filter((m) => m.placement !== "calm").map((m) => {
    const fits = m.situations.join("; ");
    let note = "";
    if (m.id === "swap" && !hasSwap) {
      note = " — NOT available right now: his plan has nothing stocked to have instead, so do not propose it";
    }
    if (m.id === "replacement-line" && !hasReplacement) {
      note = " — NOT available right now: he has no thought pairs saved, so do not propose it";
    }
    return `- "${m.id}" (${m.name}): fits ${fits}${note}`;
  }).join("\n");
  const rankings = SITUATION_RANKING.map((r) => {
    // Calm-time moves are stripped from the rankings too — a ranking
    // must never point the model at an action it may not propose.
    const momentMoves = r.moves.filter((id) => modalityPlacement(id) === "moment");
    if (!momentMoves.length) return null;
    const moves = momentMoves.map((id) => `"${id}"`).join(" → ");
    return `- ${r.situation}: ${moves}${r.note ? ` (${r.note})` : ""}`;
  })
    .filter((line): line is string => line !== null)
    .join("\n");
  return `GUIDED ACTIONS — WHEN TALK HAS FOUND THE MOMENT, LEAD ONE:

Once you have learned the shape of this moment — where he is, whether it's body hunger or the urge, how strong it is, what he needs — you may propose ONE guided action and, if he says yes, the app leads it step by step in voice. The proposal line is spoken, one or two short sentences, ending as a genuine question he can say no to: "Why don't we start with five deep breaths?" is the shape. A pass is a complete answer — if he says no or not now, let it go entirely: no persuasion, no second offer of the same action this conversation, and the conversation simply continues. If he asks for an action himself, proposing that one is always right (when it's on the list and fits the hour).

HOW TO CHOOSE — IN THIS ORDER:
1. HIS OWN SESSION RECORD (below) outranks everything: a move he has marked as a good outcome is the first offer for a moment like that one, and you may say so in his own terms ("the breathing was a good one Tuesday"); a move he marked as one to work on drops below its alternates — don't push it in the same form.
2. THE SITUATION RANKINGS below: when this moment matches a situation, prefer its moves in the order given.
Then fit: this hour, this place, what he just told you.

SITUATION RANKINGS (his catalog's map — situation → moves in preference order):
${rankings}

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

What you offer must FIT the hour and the setting. His playbook is the only material — but which card fits is a time question: a walk is a morning or early-evening card, not an 11:30 PM one; late at night, the cards that fit are the in-home ones — what he's stocked to have instead, a ninety-second tool, his reset line. If he's inside a declared risk window, you know it, and you can say so plainly, the way he planned it at calm time: "We're in your evening window — this is the one you planned for." If a window is coming later today, that can shape a calm-time conversation ("your evening window's ahead — anything you want stocked?") — only from his playbook, never invented prep.`;
}

// ---------- The story-intake path (new users) ----------
//
// Everything above this section is the founder's path, unchanged:
// Bob's phone runs no intake (his baseline WAS his intake, mined
// from his own history), so with no profile in the request the
// prompt is exactly what it has always been. When a user HAS run
// the "Your story" intake, the client sends their profile and the
// prompt changes in kind, not just in name: their own story becomes
// the ground truth about them, and the founder baseline is demoted
// to what it is for them — a worked example, a template for the
// SHAPE of a filled-in second brain, never a source of facts about
// them. The precedence is stated in the prompt itself, twice.

function personableProfileBlock(profile: UserProfile): string {
  const name = profile.name.trim();
  return `PERSONABLE COMPANION — HOW YOU ARE WITH THEM:

The person you are talking with is ${name}. Use their name the way someone who knows them would: at the greeting, at real moments — when something lands, when the moment is heavy, when you're closing — and sparingly. Their name in every line sounds like a script; their name at the right moments sounds like a friend. A few times across a conversation, not once a sentence.

WHEN THE CONVERSATION IS JUST STARTING (no turns yet), you open — you do not wait to be asked:
- Greet them by name, warmly, shaped by the part of day in the context below: "Morning, ${name} —" in the morning, "Evening, ${name} —" in the evening.
- Ask how they're doing — how the day's been. Asking is always right; never tell them what they're feeling. Their state comes from their words, not your guess.
- Naturally check whether urges have shown up today — "Any urges so far today?" — plainly, the way someone who knows their patterns would ask.
- If today's journal (in the context below) shows earlier entries, acknowledge ONE concretely, in their own recorded words where they're there: the moment they paused through, the urge that dropped, the learning they saved — quote their learning back in their words. That is how they know you remember them.

TWO ENERGIES, ONE PERSON:
- Live urge: if their first reply — or any turn — signals an urge happening now, the warmth compresses to one warm sentence ("I'm here, ${name}") and you move straight into the moment: the coverage above, their playbook, the pause. Personable never means chatty in a hard moment.
- Calm time: if they're reflecting, unhurried is the whole point. Follow their thread, ask the next real question, remember what they tell you and quote it back later so the memory shows.

VOICE, ALWAYS: plain words — hunger, the urge, the urge to eat. Never the word "pull". No therapy-speak, no pep-talk clichés, no inflated praise. Someone who knows them and is in their corner, at the directness they chose.`;
}

function timeProfileBlock(): string {
  return `TIME & ENVIRONMENT — THE CLOCK IS PART OF THE CONVERSATION:

Every turn, the context below tells you the local time, the part of day, whether it's a weekday or a weekend, and whether they are inside a risk window they declared at calm time. Reason with it — woven in naturally, never announced robotically, and never narrate your own reasoning about it.

Their rhythm — when their hard moments tend to come, what their days look like — comes from THEIR story (below) and their journal, never from anyone else's pattern. A weekend day has a different shape from a workday — different pressures, different openings.

What you offer must FIT the hour and the setting. Their playbook is the only material — but which card fits is a time question: a walk is a morning or early-evening card, not an 11:30 PM one; late at night, the cards that fit are the in-home ones — what they've stocked to have instead, a ninety-second tool, their reset line. If they're inside a declared risk window, you know it, and you can say so plainly, the way they planned it at calm time: "We're in your evening window — this is the one you planned for." If a window is coming later today, that can shape a calm-time conversation ("your evening window's ahead — anything you want stocked?") — only from their playbook, never invented prep.`;
}

// The user's own story, as a prompt section. This is the intake's
// payload: the material their brain deals back. The precedence
// language here (and again in the final word) is the load-bearing
// part — their words about themselves outrank the template below.
function userStorySection(profile: UserProfile): string {
  const lines: string[] = [
    "THE USER'S OWN STORY — THE GROUND TRUTH ABOUT THIS PERSON:",
    "",
    `Their name: ${profile.name.trim()}`,
  ];
  if (profile.story.trim()) {
    lines.push(`Their story, in their own words (told at calm time, when they set the app up):`);
    lines.push(`"${profile.story.trim()}"`);
  }
  if (profile.triggers.length) {
    lines.push(
      `The moments they say get them (their words): ${profile.triggers.map((t) => t.trim()).filter(Boolean).join("; ")}`,
    );
  }
  lines.push(
    "",
    "PRECEDENCE: this story outranks the worked example below, everywhere the two could differ. Their words about themselves are what is true about them. Never attribute the example person's name, history, numbers, places, job, people, or patterns to this user — and where this user has not said a thing about themselves, it is simply unknown: ask, don't borrow.",
  );
  return lines.join("\n");
}

// The founder baseline, framed for a profile user: a worked example
// of a filled-in second brain — the shape to work in, never facts
// about the person in front of the brain.
const BASELINE_TEMPLATE_FRAMING = `A WORKED EXAMPLE — ONE PERSON'S FILLED-IN SECOND BRAIN, KEPT ONLY AS A TEMPLATE:

What follows is the second-brain baseline of the person who built this app — one complete worked example of what a person's story, patterns, voice rules, and playbook look like once they're filled in. Use it ONLY for the shape: how a story becomes patterns to recognize and a playbook to deal back; the tone rules (plain words, quote their own words back to them, no shame, no moral language); the playbook order (their why first, their if-then, what they've stocked to have instead matched to the job the food was going to do, a ninety-second tool, then eat / have something else instead / delay — all legitimate); and the respawn shape after someone eats (checkpoint saved, nothing reset, on to the next meal). It is NOT about the user you are talking with. Its name, history, numbers, places, job, and people belong to someone else — never greet this user by that name, never use its facts as theirs, and never treat its patterns as this user's patterns. Where the user's own story (above) covers the same kind of ground in their words, use THEIR version, always.`;

// The second-brain baseline (Part B of the baseline document, in
// src/lib/baseline.ts) rides in the system prompt on every turn as
// its own delimited section, so the brain knows this person — his
// patterns, his voice, the moves — before the per-user playbook and
// journal arrive. The fence is then restated AFTER the baseline as
// the final word: if any baseline phrasing could be read as
// advice-giving, the reflect/recall-only rules win. The baseline
// text itself is never edited here.
function fullSystemPrompt(
  directness: Directness,
  hasSwap: boolean,
  hasReplacement: boolean,
  profile: UserProfile | null,
): string {
  if (!profile) {
    // The founder's path — this composition is byte-for-byte what it
    // has always been. Do not "improve" it here; Bob's prompt is a
    // tuned artifact.
    return `${systemPrompt(directness)}

${guidedActionBlock(hasSwap, hasReplacement)}

${personableBlock()}

${timeEnvironmentBlock()}

SECOND-BRAIN BASELINE — WHO THIS PERSON IS, HIS PATTERNS, HIS VOICE, AND THE MOVES YOU KNOW:

${SECOND_BRAIN_BASELINE}

FINAL WORD — THE FENCE GOVERNS THE BASELINE: the hard rules above outrank everything in the baseline. Your material is this person's own playbook, journal, and words: reflect and recall only — no outside advice, no invented tips, no plans they did not build. Their state is user-declared only; never name, guess, or infer an emotion or mental state. Eating is always legitimate. No therapy, diagnosis, treatment, diet, calorie, or weight language; no shame, no moral language. If any line in the baseline could be read as advice-giving, this fence wins and that reading is not used. Respond with ONLY the JSON object described above: {"say": "<the exact line to speak aloud>", "done": <true|false>, "choice": <"eat"|"swap"|"delay"|null>, "action": <{"kind": "<guided-action kind>"}|null>}, with "action" set only on a proposal line, exactly as the guided-action section describes.`;
  }
  // The intake path: same fence, same repertoire, same playbook
  // mechanics — but the person is THIS user, their story is the
  // ground truth, and the founder baseline rides as a template.
  return `${systemPrompt(directness)}

${guidedActionBlock(hasSwap, hasReplacement)}

${personableProfileBlock(profile)}

${timeProfileBlock()}

${userStorySection(profile)}

${BASELINE_TEMPLATE_FRAMING}

${SECOND_BRAIN_BASELINE}

FINAL WORD — THE FENCE GOVERNS, AND THE USER'S OWN STORY GOVERNS THE EXAMPLE: the hard rules above outrank everything below them. Your material is this person's own story, playbook, journal, and words: reflect and recall only — no outside advice, no invented tips, no plans they did not build. Their state is user-declared only; never name, guess, or infer an emotion or mental state. Eating is always legitimate. No therapy, diagnosis, treatment, diet, calorie, or weight language; no shame, no moral language. If any line in the worked example could be read as advice-giving, this fence wins and that reading is not used. And the precedence, one last time: the user's own story outranks the worked example everywhere they could conflict — where they differ, the example is simply not used. Respond with ONLY the JSON object described above: {"say": "<the exact line to speak aloud>", "done": <true|false>, "choice": <"eat"|"swap"|"delay"|null>, "action": <{"kind": "<guided-action kind>"}|null>}, with "action" set only on a proposal line, exactly as the guided-action section describes.`;
}

// The story-intake profile, coerced like everything else the client
// sends: a name is required for the profile to count at all (an
// empty name means no intake has run and the request takes the
// founder path), the story and triggers are capped plain text.
function coerceProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as { name?: unknown; story?: unknown; triggers?: unknown };
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(p.name, 80);
  if (!name) return null;
  const triggers: string[] = [];
  if (Array.isArray(p.triggers)) {
    for (const t of p.triggers.slice(0, 16)) {
      const s = str(t, 160);
      if (s) triggers.push(s);
    }
  }
  return { name, story: str(p.story, 4000), triggers };
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
  if (swaps.length) lines.push(`WHAT THEY'VE STOCKED TO HAVE INSTEAD: ${swaps.join(" | ")}`);
  if (plan.dangerPlaces.length) {
    lines.push(`PLACES THAT ARE HARD FOR THEM: ${plan.dangerPlaces.filter(Boolean).join("; ")}`);
  }
  const pairs = plan.thoughtPairs.filter((p) => p.negative.trim() && p.positive.trim());
  if (pairs.length) {
    lines.push(
      `THEIR OWN REFRAME PAIRS: ${pairs.map((p) => `"${p.negative.trim()}" → "${p.positive.trim()}"`).join(" | ")}`,
    );
  }
  // Material slots: his own calm-time words, saved for the moments
  // they're for. Each block below is labeled material with its use
  // written in — the brain draws on it inside a response it
  // composes for THIS moment (quotes his words where they land,
  // weaves them where that serves better); it never announces it is
  // reading something saved, and never recites a slot as a script.
  // A slot that isn't set contributes nothing — with all three
  // absent this context is byte-for-byte what it was before.
  const scene = (plan.tomorrowScene ?? "").trim().slice(0, 600);
  if (scene) {
    lines.push(
      `\nHIS PICTURE OF TOMORROW MORNING, in his own words — the morning tonight is steering toward: "${scene}"\nWhen he is deciding — weighing whether to eat, standing at the edge of the choice — bring this picture back inside what you say: quote his words where they land and let that morning be present in this moment. Do not announce it as something saved; just let him see it again.`,
    );
  }
  const witness = (plan.witnessPlan ?? "").trim().slice(0, 400);
  if (witness) {
    lines.push(
      `\nHIS TEXT-FIRST ARRANGEMENT, in his own words: "${witness}"\nWhen eating is close and he has not mentioned it, you may remind him of HIS arrangement — his words, his person — the way someone who knows his plan would. The text is his to send; you never send anything, and you never pressure. One reminder is the whole move.`,
    );
  }
  const kind = (plan.kindSentence ?? "").trim().slice(0, 300);
  if (kind) {
    lines.push(
      `\nHIS KIND SENTENCE FOR AFTER A SLIP — his own words, written at calm time for exactly that moment: "${kind}"\nNarrow use, exactly as he set it up: only right after he has eaten, when the moment is about what just happened — draw on it ONCE, inside the response you are already composing (quote it where it lands), then move to the reset: nothing starts over, next meal as normal. Never generate comfort language of your own around it, and never reach for it at any other time.`,
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
    lines.push("(Nothing saved yet — no why line, nothing stocked to have instead, no journal. The pause itself is the plan.)");
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
function sessionRecordContext(outcomes: SessionOutcomeItem[], profile: UserProfile | null): string {
  if (!outcomes.length) return "";
  if (profile) {
    const lines: string[] = [
      "THEIR SESSION RECORD — their recent talk sessions and the outcomes THEY marked at the close of each (their own record, stated as their record — never as something you detected):",
    ];
    for (const item of outcomes) {
      const bits: string[] = [item.date];
      bits.push(item.action ? `guided action: ${item.action}` : "talk only, no guided action");
      if (item.choice) bits.push(`chose: ${item.choice}`);
      if (item.outcome === "good") bits.push("they marked it: a good outcome");
      if (item.outcome === "work-on") bits.push("they marked it: one to work on (it didn't land for them)");
      lines.push(`- ${bits.join(", ")}`);
    }
    lines.push(
      "How to use this: when you propose a guided action, one they marked good is a fair first offer, and you may say so in their own terms (\"the breathing was a good one Tuesday\"). One they marked as one to work on, don't push in the same form — a different action, or the same one reshaped by what they tell you now. If they have no mark on an action, it is simply untried, not failed.",
    );
    return lines.join("\n");
  }
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
  profile: UserProfile | null,
  placeLabel: string | null,
): string {
  const lines: string[] = [
    profile
      ? "RIGHT NOW AND THEIR DAY SO FAR (declared context — nothing here is inferred):"
      : "RIGHT NOW AND HIS DAY SO FAR (declared context — nothing here is inferred):",
  ];
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
      profile
        ? `- They are INSIDE a risk window they declared at calm time${riskWindow.label ? `: "${riskWindow.label}"` : ""}.`
        : `- He is INSIDE a risk window he declared at calm time${riskWindow.label ? `: "${riskWindow.label}"` : ""}.`,
    );
  } else if (riskWindow?.nextLabel) {
    lines.push(
      profile
        ? `- Not in a declared risk window right now. Their next one: "${riskWindow.nextLabel}"${riskWindow.nextStartsAt ? `, starting ${riskWindow.nextStartsAt}` : ""}.`
        : `- Not in a declared risk window right now. His next one: "${riskWindow.nextLabel}"${riskWindow.nextStartsAt ? `, starting ${riskWindow.nextStartsAt}` : ""}.`,
    );
  }
  if (placeLabel === "away") {
    lines.push(
      profile
        ? "- Where they are: not at any of the places they saved at calm time — out and about. (The device matched none of their places; that is all you know — no coordinates ever reach you.)"
        : "- Where he is: not at any of the places he saved at calm time — out and about. (The device matched none of his places; that is all you know — no coordinates ever reach you.)",
    );
  } else if (placeLabel) {
    lines.push(
      profile
        ? `- Where they are: at "${placeLabel}" — a place they named and saved at calm time. You know this the way a person who knows their routine knows it: when where-they-are becomes relevant — they describe their surroundings, a stocked option lives there, the moment is one they tied to this place — name it back as naturally as that person would ("still at the shop, day done"), woven into what you're already saying. Never announce it cold at the start of a reply, and never make it sound like tracking — no "I see you're at…" ever.`
        : `- Where he is: at "${placeLabel}" — a place he named and saved at calm time. You know this the way a person who knows his routine knows it: when where-he-is becomes relevant — he describes his surroundings, a stocked option lives there, the moment is one he tied to this place — name it back as naturally as that person would ("still at the shop, day done"), woven into what you're already saying. Never announce it cold at the start of a reply, and never make it sound like tracking — no "I see you're at…" ever.`,
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

// ------------------------------------------------------------------
// One-line moments (Bob's ruling, 2026-10-31): the SOS opening and
// the respawn line used to be recordings and fixed lines — a
// recorded cue followed by the why line read aloud verbatim; a
// recorded reset line followed by a locked spoken sentence. All of
// that is out: nothing that was true at calm time is the fact of
// this moment. In moment mode the brain composes the ONE spoken
// line for this exact moment — the SOS opening, or the checkpoint
// line after a choice — from the live situation: the clock, today's
// journal, a declared risk window, and the user's plan. The plan's
// texts (the why line above all) are MATERIAL the model may draw on
// and quote — never a script played by rule. Generation failure is
// a typed brain_unavailable; the client then runs the pause toolkit
// in silence. No canned speech as fallback, ever.
// ------------------------------------------------------------------

export type MomentKind = "sos" | "respawn";

// A plan-shaped empty object for a moment request that arrives
// without one (defined locally — the route imports only types from
// the client journal module).
const EMPTY_PLAN: ShieldPlan = {
  triggerOptions: [],
  dangerPlaces: [],
  thoughtPairs: [],
  whyLine: "",
};

function momentSystemPrompt(
  kind: MomentKind,
  name: string,
  directness: Directness,
  hasKindSentence = false,
): string {
  const shared = `You are the second brain of Pause & Nourish, a personal habit tool. Compose ONE short spoken response for this exact moment — in your own words, for this moment only, never a stock line. The material below (the user's own plan, their journal, the moment context) is what you draw on: their why line is theirs to hear back — quote it verbatim when it fits, weave it in when that serves better.

Hard rules:
- Never name, guess, or infer an emotion or mental state. Work only with what the user has declared, in their own words.
- No therapy, diagnosis, treatment, diet, calorie, or weight language. No shame, no guilt, no willpower talk.
- Eating is always legitimate. Never discourage eating; never frame any choice as good or bad, success or failure.
- Plain words — hunger, the urge, the urge to eat. Never the word "pull".
- Never the word "swap" either: if you name what they could do, say it plainly — have something else instead — in words fitted to this moment, not a set phrase.
- Speak as one voice to one person, ${name}. No lists, no labels, no stage directions, no talk about being an AI or a model.
- Directness for this user: ${DIRECTNESS_LINES[directness]}.
- One or two short sentences — this line is spoken aloud in a hard moment.

Respond with ONLY a JSON object, no other text: {"say": "<the exact line to speak aloud>"}`;
  if (kind === "sos") {
    return `${shared}

THE MOMENT: ${name} just tapped SOS — a tricky moment with food is live right now. Your line opens the pause: meet them in this moment (the time of day, where they are if the context names one of their saved places — named back naturally, never announced like tracking, anything today's journal actually shows, a declared risk window they are inside — use only what the context gives you; invent nothing), bring their why into it in their own words, and point them at what is already happening: a ninety-second pause starts on its own in a few seconds, and three plain answers are on the screen — "that was me", "not me this time", "I'm good for now". Warm and steady, not chatty — this is the first sound of the pause, not the start of a conversation.`;
  }
  return `${shared}

THE MOMENT: ${name} just chose — the choice itself is in the context below — and is at the checkpoint screen. Your line is the spoken close of that choice: the checkpoint is saved, nothing is reset, the pattern continues, and the next meal is a normal meal. If their plan carries words of their own for a moment like this (their why line, their reframe pairs), draw on them. No score, no verdict — a steady hand on the shoulder, in words.${hasKindSentence ? `\n\nOne more piece of their material, for exactly this moment: their plan carries a kind sentence they wrote at calm time for after a slip — it is in the playbook context below, labeled as theirs. If the choice just made was eating, draw on it once, inside this line — quote it where it lands — then the reset, as above. Never generate comfort language of your own around it.` : ""}`;
}

async function handleMoment(args: {
  kind: MomentKind;
  choice: FinalChoice | null;
  plan: ShieldPlan;
  profile: UserProfile | null;
  directness: Directness;
  recent: RecentJournalItem[];
  localTime: LocalTimeContext | null;
  dayType: DayType | null;
  riskWindow: RiskWindowContext | null;
  today: TodayJournalItem[];
  placeLabel: string | null;
}): Promise<Response> {
  if (!metaApiKey()) {
    return Response.json({ error: "meta_not_configured" }, { status: 500 });
  }
  const name = args.profile ? args.profile.name.trim() : "Bob";
  const hasKindSentence = (args.plan.kindSentence ?? "").trim().length > 0;
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: momentSystemPrompt(args.kind, name, args.directness, hasKindSentence) },
    {
      role: "user",
      content: momentContext(args.localTime, args.dayType, args.riskWindow, args.today, args.profile, args.placeLabel),
    },
    { role: "user", content: playbookContext(args.plan, args.recent) },
  ];
  if (args.kind === "respawn" && args.choice) {
    messages.push({
      role: "user",
      content: `(The choice they just made: ${args.choice}.)`,
    });
  }
  let generated: string;
  try {
    generated = await metaChat(messages);
  } catch (err) {
    if (err instanceof MetaApiError && err.message === "meta_not_configured") {
      return Response.json({ error: "meta_not_configured" }, { status: 500 });
    }
    // Honest unavailability — the toolkit runs in silence.
    return Response.json(
      { error: "brain_unavailable", detail: err instanceof MetaApiError ? err.detail : undefined },
      { status: 502 },
    );
  }
  let say: string | null = null;
  const jsonText = generated.replace(/```(?:json)?/gi, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(jsonText.slice(start, end + 1)) as { say?: unknown };
      if (typeof parsed.say === "string" && parsed.say.trim()) {
        say = parsed.say.trim();
      }
    } catch {
      // Not JSON — fall through to the plain-line treatment.
    }
  }
  if (say === null && generated.trim()) {
    say = generated.trim();
  }
  if (say === null) {
    return Response.json({ error: "brain_unavailable" }, { status: 502 });
  }
  // The output filter guards this line like every other; a rejected
  // line is NOT replaced by anything canned — the moment goes silent.
  const filtered = filterGeneratedLine(say, "");
  if (!filtered) {
    return Response.json({ error: "brain_unavailable" }, { status: 502 });
  }
  return Response.json({ say: filtered, source: "meta" });
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

// The place label: a saved place's name in the user's own words,
// or "away" when a fix matched none of their places. Only the label
// ever travels — the client resolves it on-device and coordinates
// never leave the phone. Anything else (missing, wrong type, too
// long) is treated as absent, exactly like a user with no places.
function coercePlaceLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const label = raw.trim().slice(0, 60);
  return label ? label : null;
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

// ------------------------------------------------------------------
// Story-intake interview (Bob's ruling, 2026-10-31): "Your story" is
// a CONVERSATION, not a form. In intake mode the brain interviews a
// new user one spoken question at a time, follow-ups adapting to
// what they said, until its coverage checklist is met — then it
// closes and returns the captured items for the client to write to
// the profile/plan stores. Coverage is judged from the exchange
// itself; nothing is inferred about emotions. There is NO scripted
// fallback in this mode: if the brain can't be reached, the route
// returns an honest error and the client says so plainly and offers
// the type-it-instead surface.
// ------------------------------------------------------------------

export interface IntakeSwap {
  situation: string;
  option: string;
}

export interface IntakeCaptured {
  name: string;
  story: string;
  whyLine: string;
  triggers: string[];
  swaps: IntakeSwap[];
  voice: "female" | "male";
}

const INTAKE_SYSTEM_PROMPT = [
  "You are the second brain inside Pause & Nourish, a habit-interruption companion, meeting a brand-new user for the first time. This is a calm-time getting-to-know-you conversation, spoken out loud, one question at a time. There is no form and no paperwork — you ask, they answer out loud, and what they tell you becomes the story their second brain will deal back to them later, in their own words.",
  "",
  "YOUR COVERAGE — the interview is complete only when the exchange itself has given you ALL of these, in the user's own words or by their explicit say-so:",
  "1. Their name — what they want to be called.",
  "2. Their voice choice — the voice you're speaking in right now is a woman's voice. Early (right after the name), ask plainly whether they'd like to keep this voice or switch to a man's voice. Set \"voice\" in your JSON the moment they answer, and keep setting it on every reply after that.",
  "3. Their story — where they're starting from and what they're working on, in their words. A few sentences is plenty; follow up once or twice on what they actually said rather than marching down a list.",
  "4. A why line — the reason that matters to THEM, in their words. When they give you a reason, offer it back as their line (\"want that as your line, in those words?\") and capture their phrasing, not a polished version of it.",
  "5. At least one trigger — a moment, place, or situation that gets them: evenings, a room, a routine, a kind of day.",
  "6. At least one answer, in their own words, to what they would do instead in one of those moments — drawn out of THEM, never suggested by you. Ask what they would reach for instead, what they would do differently, how they would change that moment, and follow up on what they say; their answer is their plan material, self-authored through your questions. (The captured field for these answers is called \"swaps\" in the JSON — that word is data plumbing only; never say it to them.) OR their explicit \"none yet,\" which is a complete and respected answer (capture an empty swaps list then). Eating the thing is always a legitimate choice here; what they'd have instead is an option they stock for themselves, never a rule.",
  "",
  "HOW YOU TALK: one question per reply, one or two short spoken sentences — these lines are read aloud. Warm, plain, unhurried. Follow up on what they said before moving to the next coverage item; adapt the order to the conversation. React to their answers briefly and specifically, in their own terms. Phrase every question fresh, in words that fit what they just said — above all the what-would-you-do-instead question: ask it your own way each time, following their words, and never let it harden into the same sentence twice. It is a real question, not a script. When coverage is complete, close warmly in one or two sentences (name them, tell them their story is saved and they can change any of it any time, and that talking is always one tap away) and return done=true with the full captured object.",
  "",
  "HARD RULES: Never infer or name their emotions or mental state — if it matters, they say it and you may reflect their words back. Never give advice, recommendations, or health guidance; you gather THEIR words, you don't supply your own. No therapy vocabulary. The words \"pull\" and \"swap\" are banned in anything you say to them. Wellness framing only: this is a habit tool, not treatment. Never claim to be human; you are their second brain, an AI companion, and that's fine to say if it's relevant. Keep captured text faithful: the story is their account condensed only as much as needed, the why line is their sentence, triggers and instead-answers are short phrases in their words.",
  "",
  "OUTPUT: reply with ONE JSON object and nothing else:",
  "{\"say\": string, \"done\": boolean, \"voice\": \"female\" | \"male\" | null, \"captured\": null | {\"name\": string, \"story\": string, \"whyLine\": string, \"triggers\": string[], \"swaps\": [{\"situation\": string, \"option\": string}], \"voice\": \"female\" | \"male\"}}",
  "\"say\" is the only part spoken aloud. \"captured\" is null until done=true; on the closing reply it carries everything the exchange established (voice inside captured is their final pick). If they said \"none yet\" to swaps, swaps is [].",
].join("\n");

function coerceCaptured(raw: unknown): IntakeCaptured | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as { name?: unknown; story?: unknown; whyLine?: unknown; triggers?: unknown; swaps?: unknown; voice?: unknown };
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(c.name, 80);
  if (!name) return null;
  const triggers: string[] = [];
  if (Array.isArray(c.triggers)) {
    for (const t of c.triggers.slice(0, 16)) {
      const s = str(t, 160);
      if (s) triggers.push(s);
    }
  }
  const swaps: IntakeSwap[] = [];
  if (Array.isArray(c.swaps)) {
    for (const s of c.swaps.slice(0, 12)) {
      if (!s || typeof s !== "object") continue;
      const item = s as { situation?: unknown; option?: unknown };
      const situation = str(item.situation, 160);
      const option = str(item.option, 160);
      if (situation && option) swaps.push({ situation, option });
    }
  }
  return {
    name,
    story: str(c.story, 4000),
    whyLine: str(c.whyLine, 300),
    triggers,
    swaps,
    voice: c.voice === "male" ? "male" : "female",
  };
}

async function handleIntake(history: ConverseTurn[]): Promise<Response> {
  if (!metaApiKey()) {
    return Response.json({ error: "meta_not_configured" }, { status: 500 });
  }
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: INTAKE_SYSTEM_PROMPT },
  ];
  for (const turn of history) {
    messages.push({
      role: turn.role === "brain" ? "assistant" : "user",
      content: turn.text,
    });
  }
  if (history.length === 0) {
    messages.push({
      role: "user",
      content:
        "(I just opened Your Story for the first time. Open warmly in one or two short sentences: you're glad they're here, this is a few spoken questions so the app can work in their own words, and ask what they'd like to be called.)",
    });
  }
  let generated: string;
  try {
    generated = await metaChat(messages);
  } catch (err) {
    if (err instanceof MetaApiError && err.message === "meta_not_configured") {
      return Response.json({ error: "meta_not_configured" }, { status: 500 });
    }
    // Honest unavailability — never a fabricated interview line.
    return Response.json(
      { error: "brain_unavailable", detail: err instanceof MetaApiError ? err.detail : undefined },
      { status: 502 },
    );
  }
  let say: string | null = null;
  let done = false;
  let voice: "female" | "male" | null = null;
  let captured: IntakeCaptured | null = null;
  const jsonText = generated.replace(/```(?:json)?/gi, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(jsonText.slice(start, end + 1)) as {
        say?: unknown;
        done?: unknown;
        voice?: unknown;
        captured?: unknown;
      };
      if (typeof parsed.say === "string" && parsed.say.trim()) {
        say = parsed.say.trim();
        if (parsed.voice === "female" || parsed.voice === "male") {
          voice = parsed.voice;
        }
        captured = coerceCaptured(parsed.captured);
        // A close only counts when the captured story came with it.
        done = parsed.done === true && captured !== null;
        if (!done) captured = null;
      }
    } catch {
      // Not JSON — fall through to the plain-line treatment.
    }
  }
  if (say === null && generated.trim()) {
    say = generated.trim();
  }
  if (say === null) {
    return Response.json({ error: "brain_unavailable" }, { status: 502 });
  }
  const filtered = filterGeneratedLine(say, "");
  if (!filtered) {
    return Response.json({ error: "brain_unavailable" }, { status: 502 });
  }
  return Response.json({ say: filtered, done, voice, captured, source: "meta" });
}

export async function POST(request: Request) {
  let history: ConverseTurn[] = [];
  let mode: string | null = null;
  let plan: ShieldPlan | null = null;
  let profile: UserProfile | null = null;
  let directness: Directness = "straight";
  let recent: RecentJournalItem[] = [];
  let driving = false;
  let localTime: LocalTimeContext | null = null;
  let dayType: DayType | null = null;
  let riskWindow: RiskWindowContext | null = null;
  let placeLabel: string | null = null;
  let today: TodayJournalItem[] = [];
  let sessionOutcomes: SessionOutcomeItem[] = [];
  let event: ConverseEvent | null = null;
  let momentKind: MomentKind = "sos";
  let momentChoice: FinalChoice | null = null;
  try {
    const body = (await request.json()) as {
      history?: unknown;
      mode?: unknown;
      kind?: unknown;
      momentChoice?: unknown;
      shieldPlan?: ShieldPlan;
      profile?: unknown;
      directness?: unknown;
      recentJournal?: unknown;
      driving?: unknown;
      localTime?: unknown;
      dayType?: unknown;
      riskWindow?: unknown;
      placeLabel?: unknown;
      todayJournal?: unknown;
      sessionOutcomes?: unknown;
      event?: unknown;
    };
    history = coerceHistory(body?.history);
    mode = typeof body?.mode === "string" ? body.mode : null;
    plan = body?.shieldPlan ?? null;
    profile = coerceProfile(body?.profile);
    if (body?.directness === "gentle" || body?.directness === "straight" || body?.directness === "short") {
      directness = body.directness;
    }
    recent = coerceRecent(body?.recentJournal);
    driving = body?.driving === true;
    localTime = coerceLocalTime(body?.localTime);
    dayType = coerceDayType(body?.dayType);
    riskWindow = coerceRiskWindow(body?.riskWindow);
    placeLabel = coercePlaceLabel(body?.placeLabel);
    today = coerceToday(body?.todayJournal);
    sessionOutcomes = coerceOutcomes(body?.sessionOutcomes);
    event = coerceEvent(body?.event);
    if (body?.kind === "respawn") momentKind = "respawn";
    if (
      body?.momentChoice === "eat" ||
      body?.momentChoice === "swap" ||
      body?.momentChoice === "delay"
    ) {
      momentChoice = body.momentChoice;
    }
  } catch {
    // Malformed body falls through to the guards below.
  }

  // The story-intake interview runs before the plan guard: a new
  // user has no plan yet — the interview is how it gets built.
  if (mode === "intake") {
    return handleIntake(history);
  }

  // One-line moments (SOS opening, respawn checkpoint): composed by
  // the brain for this moment, from the plan as material. A missing
  // plan degrades to an empty one — the moment context still stands.
  if (mode === "moment") {
    return handleMoment({
      kind: momentKind,
      choice: momentChoice,
      plan: plan ?? EMPTY_PLAN,
      profile,
      directness,
      recent,
      localTime,
      dayType,
      riskWindow,
      today,
      placeLabel,
    });
  }

  if (!plan) {
    return Response.json({ error: "conversation_state_required" }, { status: 400 });
  }

  if (!metaApiKey()) {
    return Response.json({ error: "meta_not_configured" }, { status: 500 });
  }

  // Whether any stocked swap exists decides if the model may offer
  // the swap action at all (see guidedActionBlock) and whether a
  // returned swap directive survives validation below.
  const hasSwap = plan.triggerOptions.some((entry) =>
    entry.options.some((option) => option.trim().length > 0),
  );
  // Same gate for the replacement line: it speaks his own written
  // thought pairs, so with none saved it is not offerable.
  const hasReplacement = plan.thoughtPairs.some(
    (pair) => pair.negative.trim().length > 0 && pair.positive.trim().length > 0,
  );

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: fullSystemPrompt(directness, hasSwap, hasReplacement, profile) },
    { role: "user", content: momentContext(localTime, dayType, riskWindow, today, profile, placeLabel) },
    { role: "user", content: playbookContext(plan, recent) },
  ];
  const record = sessionRecordContext(sessionOutcomes, profile);
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
            if (
              isGuidedActionKind(rawKind) &&
              modalityPlacement(rawKind) === "moment" &&
              (rawKind !== "swap" || hasSwap) &&
              (rawKind !== "replacement-line" || hasReplacement)
            ) {
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
      // Nothing usable came back — typed unavailability, never a
      // canned line standing in for the brain (Bob's ruling,
      // 2026-10-31). The client renders the honest state.
      return Response.json({ error: "brain_unavailable" }, { status: 502 });
    }
    // The output filter is the last line of defense: a line it
    // rejects is not replaced by anything — a rejected line means
    // this turn has no brain line at all, so it can never close the
    // conversation on the model's say-so or carry an action the
    // client would run.
    const filtered = filterGeneratedLine(say, "");
    if (!filtered) {
      return Response.json({ error: "brain_unavailable" }, { status: 502 });
    }
    return Response.json({ say: filtered, done, choice, action, source: "meta" });
  } catch (err) {
    if (err instanceof MetaApiError && err.message === "meta_not_configured") {
      return Response.json({ error: "meta_not_configured" }, { status: 500 });
    }
    // Any other Meta failure: typed unavailability. The upstream
    // detail rides along for live diagnosis.
    return Response.json(
      {
        error: "brain_unavailable",
        detail: err instanceof MetaApiError ? err.detail : undefined,
      },
      { status: 502 },
    );
  }
}
