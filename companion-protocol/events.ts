// Events-only bridge contracts (connector slice spec §2).
//
// The bridge carries five typed events and nothing else. Every event
// is { type, at, payload } where the payload is a small flat record of
// SCALARS (string / number / boolean / null). Audio, journal content,
// and location can never cross: the TypeScript types refuse them at
// compile time, and validateEvent() refuses them again at runtime for
// anything arriving as untyped data (a test proves both).

export const BRIDGE_EVENT_TYPES = [
  "session.armed",
  "session.stopped",
  "cue.requested",
  "cue.played",
  "moment.answered",
] as const;

export type BridgeEventType = (typeof BRIDGE_EVENT_TYPES)[number];

/** The only values an event payload may hold. */
export type EventScalar = string | number | boolean | null;

export type EventPayload = Record<string, EventScalar>;

export interface BridgeEvent {
  type: BridgeEventType;
  /** ISO timestamp of when the event happened. */
  at: string;
  payload: EventPayload;
}

// Guard limits — a bridge event is a note, not a container.
export const MAX_PAYLOAD_KEYS = 8;
export const MAX_PAYLOAD_STRING = 64;
export const MAX_EVENT_BYTES = 512;

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function assertScalar(value: unknown, key: string): asserts value is EventScalar {
  if (value === null) return;
  switch (typeof value) {
    case "string":
      if (value.length > MAX_PAYLOAD_STRING) {
        throw new EventValidationError(
          `payload.${key} is ${value.length} chars; the limit is ${MAX_PAYLOAD_STRING}`,
        );
      }
      return;
    case "number":
      if (!Number.isFinite(value)) {
        throw new EventValidationError(`payload.${key} must be a finite number`);
      }
      return;
    case "boolean":
      return;
    default:
      // objects, arrays, Blob/File/ArrayBuffer, functions, undefined,
      // symbols, bigints — anything blob-like or structured is refused.
      throw new EventValidationError(
        `payload.${key} is ${Array.isArray(value) ? "an array" : typeof value}; ` +
          "bridge payloads carry small scalars only",
      );
  }
}

/** Validate an untyped value as a payload record. Returns it typed. */
export function validateEventPayload(payload: unknown): EventPayload {
  if (!isPlainRecord(payload)) {
    throw new EventValidationError("event payload must be a plain object of scalars");
  }
  const keys = Object.keys(payload);
  if (keys.length > MAX_PAYLOAD_KEYS) {
    throw new EventValidationError(
      `event payload has ${keys.length} keys; the limit is ${MAX_PAYLOAD_KEYS}`,
    );
  }
  for (const key of keys) assertScalar(payload[key], key);
  return payload as EventPayload;
}

/**
 * Validate an untyped value as a bridge event. This is the runtime
 * half of the events-only promise; the type half is BridgeEvent
 * itself. Throws EventValidationError on anything that is not a
 * small, scalar, known-type event.
 */
export function validateEvent(value: unknown): BridgeEvent {
  if (!isPlainRecord(value)) {
    throw new EventValidationError("a bridge event must be a plain object");
  }
  const { type, at, payload } = value as {
    type?: unknown;
    at?: unknown;
    payload?: unknown;
  };
  if (
    typeof type !== "string" ||
    !(BRIDGE_EVENT_TYPES as readonly string[]).includes(type)
  ) {
    throw new EventValidationError(`unknown bridge event type: ${String(type)}`);
  }
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) {
    throw new EventValidationError("event.at must be an ISO timestamp string");
  }
  const checkedPayload = validateEventPayload(payload ?? {});
  const event: BridgeEvent = {
    type: type as BridgeEventType,
    at,
    payload: checkedPayload,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(event)).length;
  if (bytes > MAX_EVENT_BYTES) {
    throw new EventValidationError(
      `event serializes to ${bytes} bytes; the limit is ${MAX_EVENT_BYTES}`,
    );
  }
  return event;
}

/** Build a validated event with the current time. */
export function makeEvent(
  type: BridgeEventType,
  payload: EventPayload = {},
  at: string = new Date().toISOString(),
): BridgeEvent {
  return validateEvent({ type, at, payload });
}
