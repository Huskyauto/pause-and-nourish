// Tell-your-brain (Day 9): the guided run speaks the user's own
// daily lines — one step per line between the entry's opening and
// closing steps — and with no lines saved it does not run at all.
import { describe, expect, it } from "vitest";
import {
  actionSteps,
  isGuidedActionKind,
  modalityById,
  modalityPlacement,
  type ActionContext,
} from "./actions";

const baseCtx: ActionContext = {
  swapText: null,
  whyLine: null,
  replacementText: null,
  placeText: null,
  needText: null,
  wordText: null,
  sceneText: null,
  linesText: null,
};

describe("tell-your-brain", () => {
  it("is a registered, moment-placement repertoire entry", () => {
    expect(modalityById("tell-your-brain")?.name).toBe("Tell your brain");
    expect(isGuidedActionKind("tell-your-brain")).toBe(true);
    expect(modalityPlacement("tell-your-brain")).toBe("moment");
  });

  it("speaks each saved line as its own step, in his words", () => {
    const steps = actionSteps("tell-your-brain", {
      ...baseCtx,
      linesText: ["One meal at a time.", "I know what to do."],
    });
    const says = steps.map((s) => s.say ?? null);
    expect(says).toEqual([
      "Your lines — the ones you chose to tell your brain. Here they are, in your words.",
      "One meal at a time.",
      "I know what to do.",
      "That's today's feed. Say one of them back to me, out loud.",
    ]);
  });

  it("does not run when no lines are saved", () => {
    expect(actionSteps("tell-your-brain", baseCtx)).toEqual([]);
    expect(actionSteps("tell-your-brain", { ...baseCtx, linesText: [] })).toEqual([]);
  });

  it("strips braces so a line can never read as a template slot", () => {
    const steps = actionSteps("tell-your-brain", {
      ...baseCtx,
      linesText: ["I remember {why} I started."],
    });
    const says = steps.map((s) => s.say ?? "");
    expect(says.some((s) => s.includes("I remember why I started."))).toBe(true);
    expect(says.some((s) => s.includes("{"))).toBe(false);
  });
});
