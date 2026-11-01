// The weekly review (Day 7): Muse Wonder — the slower, heavier
// reasoning tier — reads a 7-day digest the CLIENT computed from
// the on-device journal and composes the review. Two-tier model
// use is deliberate architecture (Spark in the moment, Wonder over
// the week), not a sticker.
//
// The digest is facts, not raw journal: counts, the locked-template
// lines computed verbatim from the user's own entries ("When you
// wanted [need], [instead] helped N times — urge A → B"), their
// saved learnings in their words, and the patterns they CONFIRMED.
// Wonder's job is arrangement and one careful focus — drawn only
// from the user's own playbook, learnings, and confirmed patterns.
// The fences are the converse fences: reflect, never advise; no
// therapy / diagnosis / diet language; no inferred feelings —
// declared things only. Every paragraph of the output passes the
// same spine filter as the moment brain; a paragraph that trips
// it is dropped, and if too little survives, the review honestly
// reports itself unavailable instead of shipping a thinned text.
import { NextResponse } from "next/server";
import { META_WONDER_MODEL, MetaApiError, metaApiKey, metaChat } from "@/lib/meta";
import { filterGeneratedLine } from "@/lib/spine";

interface WeekDigest {
  weekLabel: string;
  moments: number;
  pauses: number;
  templateLines: string[];
  learnings: string[];
  confirmedPatterns: string[];
  needsNamed: string[];
  choicesSummary: string;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => cleanText(v, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(999, Math.round(value)))
    : 0;
}

function coerceDigest(body: Record<string, unknown> | null): WeekDigest | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { digest?: unknown }).digest;
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const digest: WeekDigest = {
    weekLabel: cleanText(d.weekLabel, 80),
    moments: cleanCount(d.moments),
    pauses: cleanCount(d.pauses),
    templateLines: cleanList(d.templateLines, 5, 300),
    learnings: cleanList(d.learnings, 5, 300),
    confirmedPatterns: cleanList(d.confirmedPatterns, 5, 200),
    needsNamed: cleanList(d.needsNamed, 5, 60),
    choicesSummary: cleanText(d.choicesSummary, 200),
  };
  if (digest.moments === 0) return null;
  return digest;
}

const REVIEW_SYSTEM = `You are the weekly review voice of Pause & Nourish, a habit-interruption companion. Once a week you look back over the user's own record with them. You are not a therapist, coach, or clinician, and this is not advice: you arrange what THEY recorded, in THEIR words, and hand it back clearly.

Write the review in exactly three short sections, each starting with its heading on its own line:
What showed up
What helped
One focus for next week

Rules:
- Use only the facts in the digest. Never invent an event, a number, a feeling, or a pattern. Feelings and needs appear only where the user declared them.
- Quote their learnings and their template lines closely — their wording is the substance. Prefer their words over your paraphrase.
- "What helped" must be built from the template lines and learnings: what they did that moved their own urge numbers.
- "One focus for next week" is ONE sentence, and it must be drawn from their own playbook: a learning they saved, a template line that worked, or a pattern they confirmed. Phrase it as their own material offered back ("You wrote: ...", "Your record says ..."), never as an instruction from you. Never tell them what to eat, avoid, or do with their body.
- Plain, warm, brief. No diet, calorie, weight, therapy, diagnosis, or shame language. Do not use the word "pull" — say "the urge" or "hunger".
- Each section is one to three sentences. The whole review is under 180 words.`;

function digestPrompt(d: WeekDigest): string {
  const lines: string[] = [`Week: ${d.weekLabel}`, `Moments recorded: ${d.moments}. Pauses taken: ${d.pauses}.`];
  if (d.templateLines.length) {
    lines.push("", "Their record, in the template (their words and numbers):");
    for (const t of d.templateLines) lines.push(`- ${t}`);
  }
  if (d.learnings.length) {
    lines.push("", "Learnings they saved, verbatim:");
    for (const l of d.learnings) lines.push(`- "${l}"`);
  }
  if (d.confirmedPatterns.length) {
    lines.push("", "Patterns they reviewed and confirmed about themselves:");
    for (const p of d.confirmedPatterns) lines.push(`- ${p}`);
  }
  if (d.needsNamed.length) {
    lines.push("", `What they said they needed, most often: ${d.needsNamed.join(", ")}.`);
  }
  if (d.choicesSummary) {
    lines.push(`After pausing, they chose: ${d.choicesSummary}.`);
  }
  return lines.join("\n");
}

export async function POST(request: Request) {
  if (!metaApiKey()) {
    return NextResponse.json({ error: "meta_not_configured" }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const digest = coerceDigest(body);
  if (!digest) {
    return NextResponse.json({ error: "invalid_digest" }, { status: 400 });
  }
  let raw: string;
  try {
    raw = await metaChat(
      [
        { role: "system", content: REVIEW_SYSTEM },
        { role: "user", content: digestPrompt(digest) },
      ],
      META_WONDER_MODEL,
    );
  } catch (err) {
    if (err instanceof MetaApiError) {
      return NextResponse.json({ error: "review_unavailable" }, { status: 502 });
    }
    return NextResponse.json({ error: "review_unavailable" }, { status: 502 });
  }
  // The spine filter is per-line by design (600-char cap); the
  // review is filtered paragraph by paragraph, and a review that
  // loses its substance to the filter is not shipped.
  const paragraphs = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const p of paragraphs) {
    const lines = p.split("\n").map((l) => filterGeneratedLine(l, "")).filter(Boolean);
    if (lines.length) kept.push(lines.join("\n"));
  }
  const review = kept.join("\n\n");
  if (review.length < 80 || kept.length < Math.ceil(paragraphs.length / 2)) {
    return NextResponse.json({ error: "review_unavailable" }, { status: 502 });
  }
  return NextResponse.json({ review, model: META_WONDER_MODEL });
}
