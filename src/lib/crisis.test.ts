import { describe, expect, it } from "vitest";
import { CRISIS_SAY, ED_SAY, matchesCrisis, matchesEatingDisorder } from "./crisis";

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

  it("matches the wordings added 2026-11-02 (external review list)", () => {
    for (const text of [
      "I want to be dead",
      "I'd rather be dead than keep doing this",
      "I can't go on",
      "I cannot go on like this",
      "I'm going to end it all",
      "I've been thinking about ending it all",
      "I don't want to be here anymore",
      "I don't want to be alive",
      "kms",
    ]) {
      expect(matchesCrisis(text), text).toBe(true);
    }
  });

  it("the signpost names the resource and the disclosure", () => {
    expect(CRISIS_SAY).toContain("988");
    expect(CRISIS_SAY).toContain("AI companion");
  });
});

describe("matchesEatingDisorder — the eating-disorder signpost (2026-11-02)", () => {
  it("fires on explicit disclosures", () => {
    for (const text of [
      "I have an eating disorder",
      "I'm bulimic and I hate it",
      "honestly I am anorexic",
      "I make myself throw up after I eat",
      "last night I made myself throw up again",
      "I've been starving myself all week",
      "it's the binge and purge cycle again",
      "I keep purging after eating",
    ]) {
      expect(matchesEatingDisorder(text), text).toBe(true);
    }
  });

  it("does not fire on hunger slang, illness, or ordinary talk", () => {
    for (const text of [
      "I'm starving, what's for dinner",
      "I threw up twice, I think it's the flu",
      "I feel sick to my stomach tonight",
      "the urge is a four right now",
      "I ate too much at lunch and I feel gross",
      "purging the junk drawer this weekend",
    ]) {
      expect(matchesEatingDisorder(text), text).toBe(false);
    }
  });

  it("the fixed line names the ANAD helpline and the AI boundary", () => {
    expect(ED_SAY).toContain("1-888-375-7767");
    expect(ED_SAY).toContain("National Alliance for Eating Disorders");
    expect(ED_SAY).toContain("I'm an AI companion, not a counselor");
  });
});
