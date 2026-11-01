import { describe, expect, it } from "vitest";
import { CRISIS_SAY, matchesCrisis } from "./crisis";

describe("matchesCrisis", () => {
  it("matches explicit first-person crisis statements", () => {
    for (const text of [
      "I want to kill myself",
      "I've been feeling suicidal lately",
      "Sometimes I think about suicide",
      "I just want to end my life",
      "I could hurt myself tonight",
      "I'm better off dead",
      "I don't want to live like this",
      "I wish I was dead",
      "thoughts of self harm again",
      "I want to die",
    ]) {
      expect(matchesCrisis(text), text).toBe(true);
    }
  });

  it("does not match craving talk, hyperbole, or ordinary answers", () => {
    for (const text of [
      "I'm dying for a burger",
      "This craving is killing me",
      "I could eat a whole cake right now",
      "Just killing time until dinner",
      "The urge is about a four",
      "Kill the lights, I'm going to bed",
      "I feel stressed and I want ice cream",
      "",
      "   ",
    ]) {
      expect(matchesCrisis(text), text).toBe(false);
    }
  });

  it("the signpost names the resource and the disclosure", () => {
    expect(CRISIS_SAY).toContain("988");
    expect(CRISIS_SAY).toContain("AI companion");
  });
});
