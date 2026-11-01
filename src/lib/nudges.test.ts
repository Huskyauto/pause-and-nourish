// Nudge governance-lite: quiet hours, eligibility order, the
// ignored back-off, one-tap responses, and the heads-up builder's
// confirmed-only rule.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUDGE_POLICY,
  EMPTY_NUDGE_STATE,
  MORNING_HEADS_UP,
  buildHeadsUp,
  headsUpBlock,
  inQuietHours,
  localDateStr,
  recordResponse,
  recordShown,
  settleNudgeState,
  type NudgeState,
} from "./nudges";
import { EMPTY_SHIELD_PLAN, type ShieldPlan } from "./journal";
import type { PatternRecord } from "./patterns";

const policy = { ...DEFAULT_NUDGE_POLICY };
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);

describe("quiet hours", () => {
  it("wraps past midnight", () => {
    expect(inQuietHours(policy, at(1, 22))).toBe(true);
    expect(inQuietHours(policy, at(1, 6))).toBe(true);
    expect(inQuietHours(policy, at(1, 12))).toBe(false);
    expect(inQuietHours(policy, at(1, 7))).toBe(false); // end exclusive
    expect(inQuietHours(policy, at(1, 21, 29))).toBe(false);
  });
});

describe("headsUpBlock", () => {
  it("allows a fresh morning and blocks repeats, afternoons, and stops", () => {
    const fresh = { ...EMPTY_NUDGE_STATE };
    expect(headsUpBlock(policy, fresh, at(1, 8, 30))).toBeNull();
    expect(headsUpBlock(policy, fresh, at(1, 12))).toBe("not-morning");
    const shown = recordShown(fresh, MORNING_HEADS_UP, at(1, 8, 30));
    expect(headsUpBlock(policy, shown, at(1, 9))).toBe("already-shown");
    expect(headsUpBlock({ ...policy, enabled: false }, fresh, at(1, 8))).toBe("disabled");
    expect(
      headsUpBlock({ ...policy, stoppedTypes: [MORNING_HEADS_UP] }, fresh, at(1, 8)),
    ).toBe("stopped");
  });
});

describe("the ignored back-off", () => {
  it("backs off for a week after two unanswered heads-ups", () => {
    let s: NudgeState = { ...EMPTY_NUDGE_STATE, lastSettledDate: localDateStr(at(1, 8)) };
    s = recordShown(s, MORNING_HEADS_UP, at(1, 8, 30));
    s = settleNudgeState(s, at(2, 8)); // day 1 unanswered
    expect(s.ignoredStreak).toBe(1);
    expect(s.backoffUntil).toBeNull();
    s = recordShown(s, MORNING_HEADS_UP, at(2, 8, 30));
    s = settleNudgeState(s, at(3, 8)); // day 2 unanswered
    expect(s.backoffUntil).toBe(localDateStr(at(10, 8)));
    expect(s.ignoredStreak).toBe(0);
    expect(headsUpBlock(policy, s, at(4, 8, 30))).toBe("backed-off");
  });

  it("an answered heads-up never counts as ignored", () => {
    let s: NudgeState = { ...EMPTY_NUDGE_STATE, lastSettledDate: localDateStr(at(1, 8)) };
    s = recordShown(s, MORNING_HEADS_UP, at(1, 8, 30));
    s = recordResponse(policy, s, MORNING_HEADS_UP, "helpful", at(1, 8, 35)).state;
    s = settleNudgeState(s, at(2, 8));
    expect(s.ignoredStreak).toBe(0);
  });
});

describe("recordResponse", () => {
  it("stop-type lands on the policy; less-often backs off three days", () => {
    const stopped = recordResponse(policy, { ...EMPTY_NUDGE_STATE }, MORNING_HEADS_UP, "stop-type", at(1, 8));
    expect(stopped.policy.stoppedTypes).toContain(MORNING_HEADS_UP);
    const less = recordResponse(policy, { ...EMPTY_NUDGE_STATE }, MORNING_HEADS_UP, "less-often", at(1, 8));
    expect(less.state.backoffUntil).toBe(localDateStr(at(4, 8)));
    const paused = recordResponse(policy, { ...EMPTY_NUDGE_STATE }, MORNING_HEADS_UP, "pause-today", at(1, 8));
    expect(headsUpBlock(policy, paused.state, at(1, 9))).toBe("paused-today");
  });
});

describe("buildHeadsUp", () => {
  it("is silent with nothing confirmed or declared", () => {
    expect(buildHeadsUp(EMPTY_SHIELD_PLAN, [], at(1, 8, 30))).toBeNull();
  });

  it("uses a declared window and says what was NOT used", () => {
    const plan: ShieldPlan = {
      ...EMPTY_SHIELD_PLAN,
      whyLine: "I want to be there for my grandkids",
      riskWindows: [{ label: "After dinner", startHour: 19, endHour: 21 }],
    };
    const up = buildHeadsUp(plan, [], at(1, 8, 30));
    expect(up?.headline).toContain("After dinner");
    expect(up?.body).toContain("I want to be there for my grandkids");
    expect(up?.why).toContain("location and microphone were not used");
  });

  it("uses only CONFIRMED patterns", () => {
    const candidate: PatternRecord = {
      id: "risk-window-20",
      kind: "risk-window",
      text: "Your harder moments cluster between 8 PM and 10 PM",
      evidence: "3 of 4 moments",
      status: "candidate",
      updatedAt: at(1, 8).toISOString(),
    };
    expect(buildHeadsUp(EMPTY_SHIELD_PLAN, [candidate], at(1, 8, 30))).toBeNull();
    const confirmed = { ...candidate, status: "confirmed" as const };
    expect(buildHeadsUp(EMPTY_SHIELD_PLAN, [confirmed], at(1, 8, 30))?.headline).toContain(
      "cluster between 8 PM and 10 PM",
    );
  });
});
