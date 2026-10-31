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

import { metaApiKey, metaChat, MetaApiError } from "@/lib/meta";
import { filterGeneratedLine, questionText } from "@/lib/spine";
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

const DIRECTNESS_LINES: Record<Directness, string> = {
  gentle: "soft, slow, warm",
  straight: "direct, plain, kind",
  short: "very brief, to the point — a sentence or two at most",
};

function systemPrompt(directness: Directness): string {
  return `You are the second brain of Pause & Nourish, a personal habit tool — a calm, trusted voice in the user's ear during a tricky moment with food. You are NOT following a script and there are no predetermined sayings: hold a real, free-form spoken conversation. Ask the questions YOU need, in your own words and your own order, and actually listen to the answers.

Across the conversation, gently learn what you need — in whatever order feels natural, following the user rather than a checklist:
- where they are and what's happening around them right now;
- whether this is body hunger, the pull (habit, the urge to eat without hunger), or both — both can be true;
- how strong the pull is, on a one-to-five scale;
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

Respond with ONLY a JSON object, no other text: {"say": "<the exact line to speak aloud>", "done": <true|false>, "choice": <"eat"|"swap"|"delay"|null>}`;
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

// The deterministic line for when the model can't be reached or its
// reply can't be used: the opening question if nothing has been said,
// a plain reflective prompt after that. Never a dead end.
function fallbackLine(history: ConverseTurn[]): string {
  return history.length === 0
    ? questionText("q1")
    : "I'm right here. Tell me what's happening right now.";
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

export async function POST(request: Request) {
  let history: ConverseTurn[] = [];
  let plan: ShieldPlan | null = null;
  let directness: Directness = "straight";
  let recent: RecentJournalItem[] = [];
  let driving = false;
  try {
    const body = (await request.json()) as {
      history?: unknown;
      shieldPlan?: ShieldPlan;
      directness?: unknown;
      recentJournal?: unknown;
      driving?: unknown;
    };
    history = coerceHistory(body?.history);
    plan = body?.shieldPlan ?? null;
    if (body?.directness === "gentle" || body?.directness === "straight" || body?.directness === "short") {
      directness = body.directness;
    }
    recent = coerceRecent(body?.recentJournal);
    driving = body?.driving === true;
  } catch {
    // Malformed body falls through to the guards below.
  }

  if (!plan) {
    return Response.json({ error: "conversation_state_required" }, { status: 400 });
  }

  const fallback = fallbackLine(history);

  if (!metaApiKey()) {
    return Response.json({ error: "meta_not_configured" }, { status: 500 });
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt(directness) },
    { role: "user", content: playbookContext(plan, recent) },
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
        "(I just opened Talk It Through — this moment is why I'm here. Open the conversation in your own words, one short line.)",
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
    const jsonText = generated.replace(/```(?:json)?/gi, "").trim();
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(jsonText.slice(start, end + 1)) as {
          say?: unknown;
          done?: unknown;
          choice?: unknown;
        };
        if (typeof parsed.say === "string" && parsed.say.trim()) {
          say = parsed.say.trim();
          done = parsed.done === true;
          if (parsed.choice === "eat" || parsed.choice === "swap" || parsed.choice === "delay") {
            choice = parsed.choice;
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
      return Response.json({ say: fallback, done: false, choice: null, source: "fallback" });
    }
    // The output filter is the last line of defense: a line it rejects
    // is replaced wholesale, and a replaced line never closes the
    // conversation on the model's say-so.
    const filtered = filterGeneratedLine(say, fallback);
    if (filtered === fallback && say !== fallback) {
      return Response.json({ say: fallback, done: false, choice: null, source: "fallback" });
    }
    return Response.json({ say: filtered, done, choice, source: "meta" });
  } catch (err) {
    if (err instanceof MetaApiError && err.message === "meta_not_configured") {
      return Response.json({ error: "meta_not_configured" }, { status: 500 });
    }
    // Any other Meta failure: the conversation continues on a
    // deterministic line rather than breaking mid-moment. The upstream
    // detail rides along for live diagnosis.
    return Response.json({
      say: fallback,
      done: false,
      choice: null,
      source: "fallback",
      detail: err instanceof MetaApiError ? err.detail : undefined,
    });
  }
}
