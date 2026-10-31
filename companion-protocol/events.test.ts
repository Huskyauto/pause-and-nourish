import { describe, expect, it } from "vitest";
import {
  EventValidationError,
  makeEvent,
  validateEvent,
  type BridgeEvent,
} from "./events";

// Compile-time half of the events-only promise: a payload carrying a
// Blob (or any non-scalar) must not type-check as a BridgeEvent. The
// ts-expect-error directives below are verified by `tsc --noEmit`;
// if the types ever loosen, the typecheck fails.
function typeChecks(): void {
  const at = "2026-10-31T12:00:00.000Z";
  // @ts-expect-error — a Blob is not an event scalar; audio can never cross
  const withBlob: BridgeEvent = { type: "cue.played", at, payload: { audio: new Blob(["x"]) } };
  // @ts-expect-error — nested objects are not event scalars either
  const withNested: BridgeEvent = { type: "cue.played", at, payload: { where: { lat: 1 } } };
  // @ts-expect-error — unknown event types are not part of the contract
  const withBadType: BridgeEvent = { type: "journal.read", at, payload: {} };
  void withBlob;
  void withNested;
  void withBadType;
}
void typeChecks;

describe("events-only bridge guard", () => {
  it("accepts a scalar payload", () => {
    const event = makeEvent("moment.answered", { answer: "me", taps: 1, sure: true, note: null });
    expect(event.type).toBe("moment.answered");
    expect(event.payload.answer).toBe("me");
    expect(validateEvent(event)).toEqual(event);
  });

  it("rejects a blob-like payload at runtime", () => {
    expect(() =>
      validateEvent({
        type: "cue.played",
        at: new Date().toISOString(),
        payload: { audio: new Blob(["not-a-note"]) },
      }),
    ).toThrow(EventValidationError);
  });

  it("rejects arrays, nested objects, and undefined values", () => {
    const at = new Date().toISOString();
    for (const payload of [
      { list: [1, 2] },
      { where: { lat: 42 } },
      { missing: undefined },
      { buf: new ArrayBuffer(4) },
    ]) {
      expect(() => validateEvent({ type: "cue.played", at, payload })).toThrow(
        EventValidationError,
      );
    }
  });

  it("rejects unknown types, bad timestamps, and oversized payloads", () => {
    const at = new Date().toISOString();
    expect(() => validateEvent({ type: "journal.read", at, payload: {} })).toThrow(
      EventValidationError,
    );
    expect(() => validateEvent({ type: "cue.played", at: "not-a-time", payload: {} })).toThrow(
      EventValidationError,
    );
    expect(() =>
      validateEvent({ type: "cue.played", at, payload: { note: "x".repeat(65) } }),
    ).toThrow(EventValidationError);
    const tooMany: Record<string, number> = {};
    for (let i = 0; i < 9; i++) tooMany[`k${i}`] = i;
    expect(() => validateEvent({ type: "cue.played", at, payload: tooMany })).toThrow(
      EventValidationError,
    );
  });

  it("accepts every contract event type", () => {
    for (const type of [
      "session.armed",
      "session.stopped",
      "cue.requested",
      "cue.played",
      "moment.answered",
    ] as const) {
      expect(makeEvent(type).type).toBe(type);
    }
  });
});
