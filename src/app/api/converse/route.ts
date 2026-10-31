// The companion's phrasing step (Day 5): Muse Spark, via the Meta
// Model API, phrases the next line of the Talk It Through conversation
// — the next spine question, or the spoken game plan. The FLOW is not
// the model's: the stage comes from the deterministic spine
// (src/lib/spine.ts), structured answers were parsed deterministically
// on the client, and the plan elements sent here were assembled from
// the user's own saved playbook. The model only phrases, in the user's
// chosen directness, using the words it is given — reflect-only, never
// advice (Illinois WOPR: no emotion detection, no therapy vocabulary).
//
// Every generated line passes the output filter; a filter hit, an
// empty reply, or any Meta error returns the deterministic phrasing
// instead, so the conversation never breaks on a bad generation. Until
// Bob pastes META_API_KEY into Vercel, this returns
// 500 {error:"meta_not_configured"} (mirroring /api/speak) and the
// client speaks the deterministic lines itself.

import { metaApiKey, metaChat, MetaApiError } from "@/lib/meta";
import {
  assemblePlan,
  filterGeneratedLine,
  phraseStage,
  type TalkAnswers,
  type TalkStage,
} from "@/lib/spine";
import type { Directness, ShieldPlan } from "@/lib/journal";

const STAGES: TalkStage[] = [
  "q1",
  "q2",
  "q3",
  "q4",
  "q5",
  "plan",
  "choice",
  "exit-eat",
  "deferred",
];

const SYSTEM_PROMPT = `You are the spoken voice of Pause & Nourish, a personal habit tool. Your only job is to phrase ONE line the app will speak aloud, using ONLY the material you are given.

Hard rules:
- Reflect, never advise. No recommendations, no instructions about what to eat or do, no diet, calorie, weight, therapy, diagnosis, or treatment language, no shame, no guilt.
- Never name or infer an emotion or mental state. The user declares their own answers; you only echo declared words and the user's saved playbook lines, which you must keep verbatim where given.
- The choice to eat is always legitimate. Never discourage eating.
- Apply the requested directness: "gentle" = soft, slow, warm; "straight" = direct, plain, kind; "short" = very brief, to the point.
- Return ONLY the line to speak: one or two short sentences, no quotes, no labels, no explanation.`;

export async function POST(request: Request) {
  let stage: TalkStage = "q1";
  let answers: TalkAnswers | null = null;
  let plan: ShieldPlan | null = null;
  let directness: Directness | null = null;
  try {
    const body = (await request.json()) as {
      stage?: unknown;
      answers?: TalkAnswers;
      shieldPlan?: ShieldPlan;
      directness?: unknown;
    };
    if (typeof body?.stage === "string" && STAGES.includes(body.stage as TalkStage)) {
      stage = body.stage as TalkStage;
    }
    answers = body?.answers ?? null;
    plan = body?.shieldPlan ?? null;
    if (body?.directness === "gentle" || body?.directness === "straight" || body?.directness === "short") {
      directness = body.directness;
    }
  } catch {
    // Malformed body falls through to the guards below.
  }

  if (!answers || !plan) {
    return Response.json({ error: "conversation_state_required" }, { status: 400 });
  }

  // The deterministic line for this stage — the fallback for every
  // failure mode, and the exact wording when the key is absent.
  const fallback = phraseStage(stage, answers, plan, directness);

  if (!metaApiKey()) {
    return Response.json({ error: "meta_not_configured" }, { status: 500 });
  }

  const elements = stage === "plan" ? assemblePlan(answers, plan) : [];
  const userMessage = JSON.stringify({
    stage,
    directness: directness ?? "straight",
    line_to_phrase: fallback,
    answers_so_far: answers,
    playbook_elements: elements,
  });

  try {
    const generated = await metaChat([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Phrase this conversation step for speaking aloud. Keep every playbook line verbatim; do not add content.\n${userMessage}`,
      },
    ]);
    const say = filterGeneratedLine(generated, fallback);
    return Response.json({ say, stage, source: say === fallback ? "fallback" : "meta" });
  } catch (err) {
    if (err instanceof MetaApiError && err.message === "meta_not_configured") {
      return Response.json({ error: "meta_not_configured" }, { status: 500 });
    }
    // Any other Meta failure: the conversation continues on the
    // deterministic phrasing rather than breaking mid-moment. The
    // upstream detail rides along for live diagnosis (Day 5 fix).
    return Response.json({
      say: fallback,
      stage,
      source: "fallback",
      detail: err instanceof MetaApiError ? err.detail : undefined,
    });
  }
}
