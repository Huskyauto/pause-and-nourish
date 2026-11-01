// Pattern candidates: deterministic derivation, the user's
// verdicts as the durable memory, and the locked template lines.
import { describe, expect, it } from "vitest";
import {
  confirmedPatterns,
  deriveCandidates,
  reconcilePatterns,
  templateLines,
  type PatternRecord,
} from "./patterns";
import type { JournalEntry } from "./journal";

let seq = 0;
function entry(overrides: Partial<JournalEntry>): JournalEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    createdAt: new Date(2026, 9, 30, 20, 0).toISOString(),
    mood: null,
    context: null,
    hunger: 2,
    note: "",
    pauseCompleted: true,
    choice: null,
    energy: null,
    stress: null,
    sleepQuality: null,
    urgeIntensity: null,
    hungerType: null,
    bodySensations: [],
    need: null,
    triggerCategory: null,
    plannedResponse: null,
    copingUsed: null,
    copingEffectiveness: null,
    source: "talk",
    urgeAfter: null,
    cueAnswer: null,
    learning: null,
    ...overrides,
  };
}

const NOW = new Date(2026, 10, 1, 9, 0);

describe("deriveCandidates", () => {
  it("finds a what-helps candidate from repeated urge drops", () => {
    const entries = [
      entry({ copingUsed: "A walk around the block", urgeIntensity: 4, urgeAfter: 2, need: "comfort" }),
      entry({ copingUsed: "A walk around the block", urgeIntensity: 4, urgeAfter: 2, need: "comfort" }),
      entry({ copingUsed: "Tea", urgeIntensity: 3, urgeAfter: 3, need: "tired" }),
    ];
    const found = deriveCandidates(entries, NOW);
    const helps = found.find((c) => c.kind === "what-helps");
    expect(helps?.text).toContain("A walk around the block");
    expect(helps?.evidence).toBe("Helped 2 times — urge 4 → 2");
  });

  it("finds the risk window when moments cluster", () => {
    const at = (h: number) => new Date(2026, 9, 30, h, 15).toISOString();
    const entries = [
      entry({ createdAt: at(20) }),
      entry({ createdAt: at(21) }),
      entry({ createdAt: at(20) }),
      entry({ createdAt: at(9) }),
    ];
    const found = deriveCandidates(entries, NOW);
    expect(found.some((c) => c.kind === "risk-window")).toBe(true);
  });

  it("stays silent on thin data", () => {
    expect(deriveCandidates([entry({})], NOW)).toEqual([]);
    expect(deriveCandidates([], NOW)).toEqual([]);
  });
});

describe("templateLines", () => {
  it("renders the locked template in the user's own words and numbers", () => {
    const entries = [
      entry({ need: "comfort", copingUsed: "a walk", urgeIntensity: 4, urgeAfter: 2 }),
      entry({ need: "comfort", copingUsed: "a walk", urgeIntensity: 5, urgeAfter: 3 }),
    ];
    expect(templateLines(entries)).toEqual([
      "When you wanted comfort, a walk helped 2 times — urge 4.5 → 2.5.",
    ]);
  });

  it("skips pairs that did not move the urge", () => {
    const entries = [
      entry({ need: "comfort", copingUsed: "a walk", urgeIntensity: 2, urgeAfter: 4 }),
    ];
    expect(templateLines(entries)).toEqual([]);
  });
});

describe("reconcilePatterns", () => {
  const candidate = {
    id: "helps-a-walk",
    kind: "what-helps" as const,
    text: "a walk helps",
    evidence: "Helped 2 times — urge 4 → 2",
  };

  it("keeps a confirmed verdict and refreshes its evidence", () => {
    const stored: PatternRecord[] = [
      { ...candidate, evidence: "old", status: "confirmed", updatedAt: "2026-10-01T00:00:00.000Z" },
    ];
    const out = reconcilePatterns(stored, [candidate], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("confirmed");
    expect(out[0].evidence).toBe(candidate.evidence);
    expect(confirmedPatterns(out)).toHaveLength(1);
  });

  it("drops a faded candidate but keeps a judged pattern", () => {
    const stored: PatternRecord[] = [
      { ...candidate, status: "candidate", updatedAt: "2026-10-01T00:00:00.000Z" },
      { ...candidate, id: "need-comfort", kind: "top-need", status: "no", updatedAt: "2026-10-01T00:00:00.000Z" },
    ];
    const out = reconcilePatterns(stored, [], NOW);
    expect(out.map((p) => p.id)).toEqual(["need-comfort"]);
  });

  it("never resurrects a dont-track pattern as a candidate", () => {
    const stored: PatternRecord[] = [
      { ...candidate, status: "dont-track", updatedAt: "2026-10-01T00:00:00.000Z" },
    ];
    const out = reconcilePatterns(stored, [candidate], NOW);
    expect(out[0].status).toBe("dont-track");
  });
});
