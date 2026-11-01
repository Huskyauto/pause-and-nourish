// The mailbox — the server half of the companion link (Component B,
// companion APK build spec §5, 2026-10-31). The Android companion was
// built against this contract; this module is the contract kept.
//
// Shape: the mailbox runs the SAME companion-protocol module the PWA
// runs (companion-protocol/), over a server-side memory store. Every
// guarantee of Component A therefore holds here by construction:
// digest-only storage (the raw secret, code, and token are never
// stored — they cross the wire and are hashed), single-consume atomic
// exchange, owner approval as the only path to a credential, exactly
// the three scopes, renewable expiry with identity intact, revoke as
// the only wipe, events-only traffic behind the payload guard, and
// pure reads.
//
// State lives in a module singleton (globalThis) on the server
// instance: pairings live 15 minutes, events are in-flight notes.
// That is the spec's storage model ("stored in-flight only"); a warm
// instance serves a whole pairing + session, and the companion's
// polling keeps it warm. A cold start loses in-flight state — the
// honest consequence is that a pairing interrupted by one is simply
// started over; nothing durable exists to corrupt.
//
// Owner auth: when the PWA registers a pairing it also registers the
// digest of an owner key it generates and keeps on the device. Owner
// calls (approve, arm, read the feed) present the raw key; only its
// digest is kept here. The companion never sees the owner key — it is
// not part of the pairing payload.

import {
  CompanionError,
  EMPTY_STATE,
  NoCredentialError,
  PairingNotFoundError,
  TokenRevokedError,
  UnknownTokenError,
  approvePairing,
  armLocalSession,
  createMemoryStore,
  credentialStatus,
  denyPairing,
  digestsEqual,
  exchangePairing,
  isCompanionScope,
  makeEvent,
  pushEvent,
  readStatus,
  renewCredential,
  sha256Hex,
  stopLocalSession,
  validateEvent,
  verifyToken,
  type CompanionScope,
  type CompanionState,
  type CompanionStore,
  type CredentialRecord,
} from "../../companion-protocol";
import { EventValidationError, type BridgeEvent } from "../../companion-protocol/events";

export interface FeedEntry {
  id: string;
  type: BridgeEvent["type"];
  at: string;
  payload: BridgeEvent["payload"];
}

interface MailboxCore {
  store: CompanionStore;
  feed: FeedEntry[];
  seq: number;
  ownerDigest: string | null;
  pairingId: string | null;
}

const globalSlot = globalThis as unknown as { __pnMailbox?: MailboxCore };

function core(): MailboxCore {
  if (!globalSlot.__pnMailbox) {
    globalSlot.__pnMailbox = {
      store: createMemoryStore(),
      feed: [],
      seq: 0,
      ownerDigest: null,
      pairingId: null,
    };
  }
  return globalSlot.__pnMailbox;
}

/** Test hook: the serialized server state (digest-only evidence). */
export async function __mailboxStateForTests(): Promise<CompanionState> {
  return loadState();
}

/** Test hook: reset the whole mailbox to a fresh state. */
export function __resetMailboxForTests(): void {
  globalSlot.__pnMailbox = {
    store: createMemoryStore(),
    feed: [],
    seq: 0,
    ownerDigest: null,
    pairingId: null,
  };
}

async function loadState(): Promise<CompanionState> {
  const m = core();
  return (await m.store.load()) ?? structuredClone(EMPTY_STATE);
}

function appendFeed(event: BridgeEvent): FeedEntry {
  const m = core();
  m.seq += 1;
  const entry: FeedEntry = {
    id: String(m.seq),
    type: event.type,
    at: event.at,
    payload: event.payload,
  };
  m.feed = [...m.feed, entry].slice(-200);
  return entry;
}

function feedAfter(after: string | null): FeedEntry[] {
  const m = core();
  const cursor = after ? Number.parseInt(after, 10) : 0;
  const from = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
  return m.feed.filter((e) => Number(e.id) > from);
}

function publicCredential(credential: CredentialRecord) {
  return {
    id: credential.id,
    scopes: [...credential.scopes],
    pairedAt: credential.pairedAt,
    expiresAt: credential.expiresAt,
  };
}

async function requireOwner(ownerKey: unknown): Promise<void> {
  const m = core();
  if (!m.ownerDigest || typeof ownerKey !== "string" || ownerKey.length === 0) {
    throw new CompanionError("invalid_owner", "That owner key is not recognized.");
  }
  const digest = await sha256Hex(ownerKey);
  if (!digestsEqual(digest, m.ownerDigest)) {
    throw new CompanionError("invalid_owner", "That owner key is not recognized.");
  }
}

function bearerToken(authorization: string | null): string {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new UnknownTokenError();
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new UnknownTokenError();
  return token;
}

const HEX64 = /^[0-9a-f]{64}$/;

// ---------- Owner: registration & approval ----------

export interface RegisterPairingInput {
  pairingId: unknown;
  secretDigest: unknown;
  codeDigest: unknown;
  requestedScopes: unknown;
  expiresAt: unknown;
  ownerDigest: unknown;
}

export async function registerPairing(
  input: RegisterPairingInput,
  now: Date = new Date(),
): Promise<{ registered: true; pairingId: string }> {
  const { pairingId, secretDigest, codeDigest, requestedScopes, expiresAt, ownerDigest } = input;
  if (
    typeof pairingId !== "string" ||
    pairingId.length < 8 ||
    pairingId.length > 64 ||
    typeof secretDigest !== "string" ||
    !HEX64.test(secretDigest) ||
    typeof codeDigest !== "string" ||
    !HEX64.test(codeDigest) ||
    typeof ownerDigest !== "string" ||
    !HEX64.test(ownerDigest) ||
    !Array.isArray(requestedScopes) ||
    requestedScopes.length === 0 ||
    !requestedScopes.every((s): s is CompanionScope => typeof s === "string" && isCompanionScope(s)) ||
    typeof expiresAt !== "string"
  ) {
    throw new CompanionError("invalid_request", "That pairing registration is not well-formed.");
  }
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs) || expiryMs <= now.getTime() || expiryMs > now.getTime() + 31 * 60 * 1000) {
    throw new CompanionError("invalid_request", "That pairing expiry is out of range.");
  }
  const m = core();
  const state = await loadState();
  state.pendingPairing = {
    pairingId,
    secretDigest,
    codeDigest,
    requestedScopes: [...requestedScopes],
    approved: false,
    createdAt: now.toISOString(),
    expiresAt,
  };
  await m.store.save(state);
  m.feed = [];
  m.seq = 0;
  m.ownerDigest = ownerDigest;
  m.pairingId = pairingId;
  return { registered: true, pairingId };
}

export async function approveRegisteredPairing(ownerKey: unknown): Promise<{ approved: true }> {
  await requireOwner(ownerKey);
  await approvePairing(core().store);
  return { approved: true };
}

export async function denyRegisteredPairing(ownerKey: unknown): Promise<{ denied: true }> {
  await requireOwner(ownerKey);
  await denyPairing(core().store);
  return { denied: true };
}

// ---------- Companion: poll & exchange ----------

export async function pollPairing(
  pairingId: string,
  secret: string | null,
  now: Date = new Date(),
): Promise<{ status: "waiting" | "approved" | "expired" }> {
  const state = await loadState();
  const pending = state.pendingPairing;
  if (!pending || pending.pairingId !== pairingId || !secret) throw new PairingNotFoundError();
  const digest = await sha256Hex(secret);
  if (!digestsEqual(digest, pending.secretDigest)) throw new PairingNotFoundError();
  if (now.getTime() > Date.parse(pending.expiresAt)) return { status: "expired" };
  return { status: pending.approved ? "approved" : "waiting" };
}

export async function exchangeRegisteredPairing(
  pairingId: string,
  presented: { secret: unknown; code: unknown },
  now: Date = new Date(),
): Promise<{ rawToken: string; credential: ReturnType<typeof publicCredential> }> {
  const state = await loadState();
  if (!state.pendingPairing || state.pendingPairing.pairingId !== pairingId) {
    throw new PairingNotFoundError();
  }
  if (typeof presented.secret !== "string" || typeof presented.code !== "string") {
    throw new CompanionError("invalid_request", "The exchange needs the pairing secret and code.");
  }
  const issued = await exchangePairing(
    core().store,
    { pairingSecret: presented.secret, exchangeCode: presented.code },
    now,
  );
  return { rawToken: issued.rawToken, credential: publicCredential(issued.credential) };
}

// ---------- Events (companion side, Bearer) ----------

export async function pushCompanionEvent(
  authorization: string | null,
  event: unknown,
  now: Date = new Date(),
): Promise<{ accepted: true }> {
  const token = bearerToken(authorization);
  const checked = await pushEvent(core().store, token, event, now);
  appendFeed(checked);
  // Keep the shared session state in step with what the companion
  // reports: its Stop (or an arm it was told about) is the truth on
  // the ground. The protocol's own log keeps its copy; the feed above
  // carries the companion's event exactly once.
  try {
    if (checked.type === "session.stopped") await stopLocalSession(core().store, now);
    if (checked.type === "session.armed") await armLocalSession(core().store, {}, now);
  } catch {
    // Session sync is best-effort beside an accepted event; the
    // event itself is already recorded.
  }
  return { accepted: true };
}

export async function readCompanionEvents(
  authorization: string | null,
  after: string | null,
): Promise<{ events: FeedEntry[] }> {
  const token = bearerToken(authorization);
  await verifyToken(core().store, token, "status:read");
  return { events: feedAfter(after) };
}

export async function companionMailboxStatus(authorization: string | null) {
  const token = bearerToken(authorization);
  const view = await readStatus(core().store, token);
  return {
    paired: view.paired,
    credentialStatus: view.credentialStatus,
    scopes: view.scopes,
    pairedAt: view.pairedAt,
    session: view.session,
    lastEvent: view.lastEvent,
  };
}

// ---------- Renew (companion side) ----------

export async function renewCompanionCredential(
  presentedToken: unknown,
  now: Date = new Date(),
): Promise<{ rawToken: string; credential: ReturnType<typeof publicCredential> }> {
  if (typeof presentedToken !== "string" || !presentedToken) throw new UnknownTokenError();
  const state = await loadState();
  const credential = state.credential;
  if (!credential) throw new UnknownTokenError();
  const digest = await sha256Hex(presentedToken);
  if (!digestsEqual(digest, credential.tokenDigest)) throw new UnknownTokenError();
  if (credential.revokedAt) throw new TokenRevokedError();
  // Expiry is NOT checked here on purpose: renewing an expired
  // credential on the same identity is the anti-cliff rule.
  const issued = await renewCredential(core().store, now);
  return { rawToken: issued.rawToken, credential: publicCredential(issued.credential) };
}

// ---------- Owner: session control & feed ----------

const OWNER_EVENT_TYPES = ["session.armed", "session.stopped", "cue.requested"] as const;

export async function postOwnerEvent(
  ownerKey: unknown,
  input: { type: unknown; payload?: unknown; durationMs?: unknown },
  now: Date = new Date(),
): Promise<{ accepted: true; event: FeedEntry }> {
  await requireOwner(ownerKey);
  const m = core();
  if (typeof input.type !== "string" || !(OWNER_EVENT_TYPES as readonly string[]).includes(input.type)) {
    throw new CompanionError("invalid_request", "Owners post session.armed, session.stopped, or cue.requested.");
  }
  const state = await loadState();
  if (!state.credential || state.credential.revokedAt) throw new NoCredentialError();

  if (input.type === "session.armed") {
    const durationMs =
      typeof input.durationMs === "number" && input.durationMs > 0 ? input.durationMs : undefined;
    const label =
      input.payload && typeof input.payload === "object" && "label" in input.payload
        ? String((input.payload as Record<string, unknown>).label ?? "").slice(0, 64)
        : "";
    await armLocalSession(m.store, { durationMs, contextLabel: label || undefined }, now);
    const after = await loadState();
    if (!after.lastEvent) throw new CompanionError("invalid_request", "Arming recorded nothing.");
    return { accepted: true, event: appendFeed(after.lastEvent) };
  }
  if (input.type === "session.stopped") {
    await stopLocalSession(m.store, now);
    const after = await loadState();
    if (!after.lastEvent) throw new CompanionError("invalid_request", "Stopping recorded nothing.");
    return { accepted: true, event: appendFeed(after.lastEvent) };
  }
  // cue.requested — validated by the same events-only guard as
  // everything else on the bridge before it reaches the feed.
  const payload =
    input.payload && typeof input.payload === "object" ? (input.payload as Record<string, unknown>) : {};
  const checked = validateEvent(makeEvent("cue.requested", payload as BridgeEvent["payload"], now.toISOString()));
  const fresh = await loadState();
  fresh.events = [...fresh.events, checked].slice(-50);
  fresh.lastEvent = checked;
  await m.store.save(fresh);
  return { accepted: true, event: appendFeed(checked) };
}

export async function readOwnerEvents(
  ownerKey: unknown,
  after: string | null,
): Promise<{ events: FeedEntry[] }> {
  await requireOwner(ownerKey);
  return { events: feedAfter(after) };
}

export async function ownerMailboxStatus(ownerKey: unknown, now: Date = new Date()) {
  await requireOwner(ownerKey);
  const m = core();
  const state = await loadState();
  const credential = state.credential;
  const status = credential ? credentialStatus(credential, now) : null;
  return {
    paired: !!credential && status !== "revoked",
    credentialStatus: status,
    scopes: credential ? [...credential.scopes] : [],
    pairedAt: credential?.pairedAt ?? null,
    session: { ...state.session },
    lastEvent: m.feed.length > 0 ? m.feed[m.feed.length - 1] : null,
    pendingPairing: state.pendingPairing
      ? {
          pairingId: state.pendingPairing.pairingId,
          approved: state.pendingPairing.approved,
          expiresAt: state.pendingPairing.expiresAt,
        }
      : null,
  };
}

// ---------- HTTP mapping ----------

const HTTP_BY_CODE: Record<string, number> = {
  pairing_not_found: 404,
  invalid_exchange_code: 400,
  pairing_mismatch: 400,
  pairing_not_approved: 409,
  pairing_expired: 410,
  unknown_token: 401,
  token_revoked: 401,
  token_expired: 401,
  missing_scope: 403,
  no_credential: 401,
  invalid_owner: 403,
  invalid_request: 400,
};

export function mailboxErrorResponse(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof EventValidationError) {
    return { status: 400, body: { error: "invalid_event" } };
  }
  if (err instanceof CompanionError) {
    return { status: HTTP_BY_CODE[err.code] ?? 400, body: { error: err.code } };
  }
  return { status: 500, body: { error: "mailbox_error" } };
}
