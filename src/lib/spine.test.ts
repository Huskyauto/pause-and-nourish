// Parser guards — the sample table from the 2026-11-02 external
// review, locked in as tests. The parsers read a user's spoken
// answers into journal fields; a wrong read stores a record the
// user never made. The standing rule these tests enforce: ambiguous
// stays unmarked, a negation is never a yes, and the closing answer
// to "how did that land?" is an outcome mark, never new data.
import { describe, expect, it } from "vitest";
import { filterGeneratedLine, parseChoice, parseNeed, parseUrge } from "./spine";
import { parseActionResponse, parseOutcome } from "./actions";

describe("parseChoice", () => {
  it("does not read a bare yes as eating", () => {
    expect(parseChoice("Yes, that was a good outcome")).toBeNull();
    expect(parseChoice("Yes")).toBeNull();
  });
  it("does not read a negated eat as eating", () => {
    expect(parseChoice("I'm not going to eat it")).toBeNull();
    expect(parseChoice("I won't eat it tonight")).toBeNull();
  });
  it("still reads a plainly stated choice", () => {
    expect(parseChoice("I'm going to eat it")).toBe("eat");
    expect(parseChoice("I'll have something else instead")).toBe("swap");
    expect(parseChoice("I'll wait ten minutes")).toBe("delay");
  });
});

describe("parseUrge", () => {
  it("does not harvest numbers from ordinary sentences", () => {
    expect(parseUrge("It's one to work on")).toBeNull();
    expect(parseUrge("I have one dog waiting at home")).toBeNull();
  });
  it("reads a short rating answer", () => {
    expect(parseUrge("a four")).toBe(4);
    expect(parseUrge("like a 3")).toBe(3);
    expect(parseUrge("my urge is a 4")).toBe(4);
  });
});

describe("parseNeed", () => {
  it("records the end-of-day window without inventing a need", () => {
    const parsed = parseNeed("It's evening");
    expect(parsed.window).toBe("end of day");
    expect(parsed.need).toBeNull();
  });
  it("still reads a named need", () => {
    expect(parseNeed("I'm just tired").need).toBe("tired");
  });
});

describe("parseOutcome", () => {
  it("reads windowed negations as work-on", () => {
    expect(parseOutcome("Not a good outcome")).toBe("work-on");
    expect(parseOutcome("It wasn't good")).toBe("work-on");
  });
  it("reads plain marks as spoken", () => {
    expect(parseOutcome("That was a good outcome")).toBe("good");
    expect(parseOutcome("It's one to work on")).toBe("work-on");
    expect(parseOutcome("It helped")).toBe("good");
  });
});

describe("parseActionResponse", () => {
  it("does not accept through a negation or a but", () => {
    expect(parseActionResponse("I'm not a fan of breathing exercises")).toBe("decline");
    expect(parseActionResponse("Sure, but not right now")).toBe("decline");
  });
  it("still accepts a plain yes", () => {
    expect(parseActionResponse("Yes, let's do it")).toBe("accept");
    expect(parseActionResponse("Sounds good")).toBe("accept");
  });
});

describe("filterGeneratedLine own-words exemption", () => {
  it("blocks fenced vocabulary the user never used", () => {
    expect(filterGeneratedLine("You should start a diet this week.", "")).toBe("");
    expect(filterGeneratedLine("You told me you feel guilty after a binge.", "")).toBe("");
  });
  it("lets the brain quote the user's own words back", () => {
    const own = "my why is i don't want to diet anymore and feel guilty after a binge";
    expect(filterGeneratedLine("Your why: I don't want to diet anymore.", "", own)).toContain("diet");
    expect(
      filterGeneratedLine("You told me you feel guilty after a binge at night.", "", own),
    ).toContain("guilty");
  });
  it("an exemption for one word does not open the gate to others", () => {
    const own = "i don't want to diet anymore";
    expect(filterGeneratedLine("Skip the diet and never feel shame again.", "", own)).toBe("");
  });
});
