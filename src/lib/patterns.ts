// Pattern candidates (Day 7, three-tier memory): tier 3 of the
// memory model from the Day 4 spec — POSSIBLE patterns, computed
// deterministically on-device from the user's own journal, held
// TENTATIVE until the user answers Yes / Partly / No / Don't track.
// Nothing here infers a feeling or a state: every candidate is a
// count over things the user themselves recorded (the hour a moment
// happened, the need they named, the response they used, the urge
// numbers they gave). Only "confirmed" patterns are ever used by
// the brain or the morning heads-up; "dont-track" is forever.
//
// The locked sentence template for the weekly review also lives
// here: "When you wanted [your need], [your instead] helped N
// times — urge A → B" — slot-filled with the user's own words and
// numbers, computed, never composed.

import type { JournalEntry, Need } from "./journal";
import { formatHourOfDay } from "./riskWindows";

export type PatternStatus = "candidate" | "confirmed" | "partly" | "no" | "dont-track";
export type PatternKind = "risk-window" | "what-helps" | "top-need";

export interface PatternRecord {
  id: string;
  kind: PatternKind;
  /** The pattern stated plainly, in words the user can judge. */
  text: string;
  /** The count behind it — the exhibit, shown with the pattern. */
  evidence: string;
  status: PatternStatus;
  updatedAt: string;
}

export const NEED_WORDS: Record<Need, string> = {
  comfort: "comfort",
  escape: "a break",
  soothe: "to soothe",
  numb: "to go numb",
  reward: "a reward",
  relief: "relief",
  fuel: "actual fuel",
  tired: "rest",
  stressed: "to unwind",
  bored: "something to do",
  lonely: "people",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function insteadKey(e: JournalEntry): string | null {
  const raw = e.copingUsed ?? e.sessionAction ?? e.plannedResponse;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed ? trimmed : null;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

interface HelpsGroup {
  key: string;
  count: number;
  beforeAvg: number;
  afterAvg: number;
  modalNeed: Need | null;
}

function helpsGroups(entries: JournalEntry[]): HelpsGroup[] {
  const groups = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = insteadKey(e);
    if (!key) continue;
    if (e.urgeIntensity == null || e.urgeAfter == null) continue;
    if (e.urgeAfter >= e.urgeIntensity) continue;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const needs = list.map((e) => e.need).filter((n): n is Need => !!n);
      const counts = new Map<Need, number>();
      for (const n of needs) counts.set(n, (counts.get(n) ?? 0) + 1);
      let modalNeed: Need | null = null;
      let best = 0;
      for (const [n, c] of counts) {
        if (c > best) {
          modalNeed = n;
          best = c;
        }
      }
      return {
        key,
        count: list.length,
        beforeAvg: avg(list.map((e) => e.urgeIntensity as number)),
        afterAvg: avg(list.map((e) => e.urgeAfter as number)),
        modalNeed,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Derive the current candidates from the journal. Pure and
 * explainable: the same entries always produce the same candidates,
 * and each carries its evidence.
 */
export function deriveCandidates(
  entries: JournalEntry[],
  now: Date = new Date(),
): Omit<PatternRecord, "status" | "updatedAt">[] {
  const recent = entries.filter(
    (e) => now.getTime() - new Date(e.createdAt).getTime() <= 28 * DAY_MS,
  );
  const pool = recent.length >= 3 ? recent : entries;
  const out: Omit<PatternRecord, "status" | "updatedAt">[] = [];
  if (pool.length === 0) return out;

  // What helps — the strongest signal first (it is also the weekly
  // review's template material).
  for (const g of helpsGroups(pool).slice(0, 2)) {
    if (g.count < 2) continue;
    out.push({
      id: `helps-${slug(g.key)}`,
      kind: "what-helps",
      text: g.modalNeed
        ? `When you want ${NEED_WORDS[g.modalNeed]}, ${g.key} helps`
        : `${g.key} helps when the urge comes`,
      evidence: `Helped ${g.count} times — urge ${fmtNum(g.beforeAvg)} → ${fmtNum(g.afterAvg)}`,
    });
  }

  // Risk window — a 2-hour stretch holding a real share of moments.
  const buckets = new Map<number, number>();
  for (const e of pool) {
    const start = Math.floor(new Date(e.createdAt).getHours() / 2) * 2;
    buckets.set(start, (buckets.get(start) ?? 0) + 1);
  }
  let topStart = -1;
  let topCount = 0;
  for (const [start, count] of buckets) {
    if (count > topCount) {
      topStart = start;
      topCount = count;
    }
  }
  if (topStart >= 0 && topCount >= 3 && topCount / pool.length >= 0.35) {
    out.push({
      id: `risk-window-${topStart}`,
      kind: "risk-window",
      text: `Your harder moments cluster between ${formatHourOfDay(topStart)} and ${formatHourOfDay((topStart + 2) % 24)}`,
      evidence: `${topCount} of your last ${pool.length} moments landed in that stretch`,
    });
  }

  // Top declared need.
  const needCounts = new Map<Need, number>();
  for (const e of pool) {
    if (e.need) needCounts.set(e.need, (needCounts.get(e.need) ?? 0) + 1);
  }
  let topNeed: Need | null = null;
  let topNeedCount = 0;
  for (const [n, c] of needCounts) {
    if (c > topNeedCount) {
      topNeed = n;
      topNeedCount = c;
    }
  }
  if (topNeed && topNeedCount >= 3) {
    out.push({
      id: `need-${topNeed}`,
      kind: "top-need",
      text: `When the urge comes, what you most often say you need is ${NEED_WORDS[topNeed]}`,
      evidence: `You named it in ${topNeedCount} of ${pool.length} moments`,
    });
  }

  return out.slice(0, 3);
}

/**
 * Merge fresh derivations with the stored records. The user's
 * verdicts are the memory: a judged pattern keeps its verdict (and
 * its refreshed wording/evidence while it still derives); an
 * unjudged candidate that stops deriving goes away; "dont-track"
 * never comes back as a candidate.
 */
export function reconcilePatterns(
  stored: PatternRecord[],
  candidates: Omit<PatternRecord, "status" | "updatedAt">[],
  now: Date = new Date(),
): PatternRecord[] {
  const byId = new Map(stored.map((p) => [p.id, p]));
  const out: PatternRecord[] = [];
  const candidateIds = new Set(candidates.map((c) => c.id));

  for (const c of candidates) {
    const prev = byId.get(c.id);
    if (prev && prev.status === "dont-track") {
      out.push(prev);
      continue;
    }
    if (prev && prev.status !== "candidate") {
      out.push({ ...prev, text: c.text, evidence: c.evidence, updatedAt: now.toISOString() });
      continue;
    }
    out.push({ ...c, status: "candidate", updatedAt: now.toISOString() });
  }
  // Judged patterns whose derivation faded stay on the record —
  // the user decided about them; only they remove them.
  for (const p of stored) {
    if (!candidateIds.has(p.id) && p.status !== "candidate") out.push(p);
  }
  return out;
}

export function confirmedPatterns(patterns: PatternRecord[]): PatternRecord[] {
  return patterns.filter((p) => p.status === "confirmed");
}

/**
 * The locked sentence template, computed from the week: one line
 * per (need, instead) pair that actually moved an urge number.
 * "When you wanted [need], [instead] helped N times — urge A → B."
 */
export function templateLines(entries: JournalEntry[]): string[] {
  const groups = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = insteadKey(e);
    if (!key || !e.need) continue;
    if (e.urgeIntensity == null || e.urgeAfter == null) continue;
    if (e.urgeAfter >= e.urgeIntensity) continue;
    const gk = `${e.need}::${key}`;
    groups.set(gk, [...(groups.get(gk) ?? []), e]);
  }
  return [...groups.entries()]
    .map(([gk, list]) => {
      const [need, key] = gk.split("::") as [Need, string];
      const before = avg(list.map((e) => e.urgeIntensity as number));
      const after = avg(list.map((e) => e.urgeAfter as number));
      return {
        count: list.length,
        line: `When you wanted ${NEED_WORDS[need]}, ${key} helped ${list.length} ${list.length === 1 ? "time" : "times"} — urge ${fmtNum(before)} → ${fmtNum(after)}.`,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((g) => g.line);
}
