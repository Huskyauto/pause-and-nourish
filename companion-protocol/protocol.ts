// The companion protocol (connector slice spec §2, Component A).
//
// Pairing ceremony, scoped digest-only credentials, and the session /
// status surface the PWA and a future companion speak. Pure
// TypeScript over a tiny async store interface — the PWA persists the
// state through journal.ts storage; the tests use an in-memory store.
//
// Design rules carried from the AI-BUDDY connector review (2026-10-29),
// fixed here by construction:
// - Only digests are stored. Pairing secrets, exchange codes, and
//   tokens are hashed on creation; raw values exist in memory and are
//   returned exactly once (issue / exchange / renew).
// - The exchange code is single-consume and the exchange is atomic:
//   every check runs before the single state write, so a failed or
//   expired exchange issues nothing and corrupts nothing.
// - NO expiry cliff: an expired credential is a state, not a deletion.
//   Its record (identity, scopes, history) stays intact and an
//   explicit renew rotates in a fresh token. Identity is wiped only
//   by an explicit revoke.
// - Reads stay pure: verifyToken / readStatus / getLocalStatus never
//   write. A status check triggers nothing and refreshes nothing.

import {
  digestsEqual,
  generateExchangeCode,
  generateSecret,
  normalizeExchangeCode,
  sha256Hex,
} from "./crypto";
import { makeEvent, validateEvent, type BridgeEvent } from "./events";

// The connector scopes (Guarded Session spec v1.1). These exact
// strings are the contract vocabulary — do not rename them.
export const COMPANION_SCOPES = ["session:arm", "event:push", "status:read"] as const;
export type CompanionScope = (typeof COMPANION_SCOPES)[number];

export function isCompanionScope(value: string): value is CompanionScope {
  return (COMPANION_SCOPES as readonly string[]).includes(value);
}

export const PAIRING_TTL_MS = 15 * 60 * 1000; // a pairing attempt lives 15 minutes
// A credential's working lifetime. Expiry is renewable state (see the
// header), so the number is a rotation cadence, not a cliff.
export const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_STORED_EVENTS = 50;

// ---------- Errors ----------

export class CompanionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class PairingNotFoundError extends CompanionError {
  constructor() {
    super("pairing_not_found", "There is no pairing waiting to be exchanged.");
  }
}
export class InvalidExchangeCodeError extends CompanionError {
  constructor() {
    super("invalid_exchange_code", "That pairing code does not match the waiting pairing.");
  }
}
export class PairingNotApprovedError extends CompanionError {
  constructor() {
    super("pairing_not_approved", "The owner has not approved this pairing yet.");
  }
}
export class PairingExpiredError extends CompanionError {
  constructor() {
    super("pairing_expired", "This pairing expired before it was exchanged.");
  }
}
export class PairingMismatchError extends CompanionError {
  constructor() {
    super("pairing_mismatch", "That pairing secret does not match the waiting pairing.");
  }
}
export class UnknownTokenError extends CompanionError {
  constructor() {
    super("unknown_token", "That credential is not recognized.");
  }
}
export class TokenRevokedError extends CompanionError {
  constructor() {
    super("token_revoked", "That credential has been revoked.");
  }
}
export class TokenExpiredError extends CompanionError {
  constructor() {
    super("token_expired", "That credential has expired; it can be renewed, not used.");
  }
}
export class ScopeError extends CompanionError {
  constructor(scope: CompanionScope) {
    super("missing_scope", `This credential does not carry the ${scope} scope.`);
  }
}
export class NoCredentialError extends CompanionError {
  constructor() {
    super("no_credential", "There is no paired credential.");
  }
}

// ---------- Stored state (digests only — see header) ----------

export interface PendingPairing {
  pairingId: string;
  secretDigest: string;
  codeDigest: string;
  requestedScopes: CompanionScope[];
  /** Set ONLY by the owner's explicit approval in the PWA. */
  approved: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface CredentialRecord {
  id: string;
  /** SHA-256 of the raw token. The raw token is never stored. */
  tokenDigest: string;
  scopes: CompanionScope[];
  /** When the pairing completed — the credential's identity anchor. */
  pairedAt: string;
  issuedAt: string;
  expiresAt: string;
  /** Set only by an explicit owner revoke; null while the identity lives. */
  revokedAt: string | null;
}

export interface SessionState {
  armed: boolean;
  armedAt: string | null;
  /** The armed window's end (session bound), when one was set. */
  expiresAt: string | null;
}

export interface CompanionState {
  version: 1;
  pendingPairing: PendingPairing | null;
  credential: CredentialRecord | null;
  session: SessionState;
  events: BridgeEvent[];
  lastEvent: BridgeEvent | null;
}

export const EMPTY_STATE: CompanionState = {
  version: 1,
  pendingPairing: null,
  credential: null,
  session: { armed: false, armedAt: null, expiresAt: null },
  events: [],
  lastEvent: null,
};

// ---------- Store ----------

export interface CompanionStore {
  load(): Promise<CompanionState | null>;
  save(state: CompanionState): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory store for tests and non-persistent callers. */
export function createMemoryStore(initial: CompanionState | null = null): CompanionStore {
  let state = initial ? structuredClone(initial) : null;
  return {
    async load() {
      return state ? structuredClone(state) : null;
    },
    async save(next) {
      state = structuredClone(next);
    },
    async clear() {
      state = null;
    },
  };
}

async function loadState(store: CompanionStore): Promise<CompanionState> {
  return (await store.load()) ?? structuredClone(EMPTY_STATE);
}

// ---------- Pairing ceremony ----------

export interface PairingOffer {
  pairingId: string;
  /** Shown once, as text and QR, for the companion to pick up. */
  pairingSecret: string;
  /** The human-readable single-consume code. */
  exchangeCode: string;
  requestedScopes: CompanionScope[];
  expiresAt: string;
}

/**
 * Start a pairing. In the full design the companion generates the
 * secret; in this slice the PWA plays that generating role (the
 * companion app is Component B). Either way, only digests are stored.
 * Starting a new pairing replaces any waiting one.
 */
export async function createPairing(
  store: CompanionStore,
  scopes: CompanionScope[],
  now: Date = new Date(),
): Promise<PairingOffer> {
  if (scopes.length === 0) {
    throw new CompanionError("no_scopes", "A pairing must request at least one scope.");
  }
  for (const scope of scopes) {
    if (!isCompanionScope(scope)) {
      throw new CompanionError("unknown_scope", `Unknown companion scope: ${scope}`);
    }
  }
  const pairingSecret = generateSecret("pn_pair_");
  const exchangeCode = generateExchangeCode();
  const pairingId = generateSecret("").slice(0, 22);
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
  const state = await loadState(store);
  state.pendingPairing = {
    pairingId,
    secretDigest: await sha256Hex(pairingSecret),
    codeDigest: await sha256Hex(normalizeExchangeCode(exchangeCode)),
    requestedScopes: [...scopes],
    approved: false,
    createdAt: now.toISOString(),
    expiresAt,
  };
  await store.save(state);
  return { pairingId, pairingSecret, exchangeCode, requestedScopes: [...scopes], expiresAt };
}

/** The QR payload a companion would scan to learn the pairing. */
export function pairingQrPayload(offer: PairingOffer): string {
  return JSON.stringify({
    v: 1,
    kind: "pause-and-nourish-pairing",
    pairingId: offer.pairingId,
    secret: offer.pairingSecret,
    code: offer.exchangeCode,
  });
}

/** Owner approval — the only writer of the approved flag. */
export async function approvePairing(store: CompanionStore): Promise<void> {
  const state = await loadState(store);
  if (!state.pendingPairing) throw new PairingNotFoundError();
  state.pendingPairing = { ...state.pendingPairing, approved: true };
  await store.save(state);
}

/** Owner denial (or abandoning the attempt): the waiting pairing goes away. */
export async function denyPairing(store: CompanionStore): Promise<void> {
  const state = await loadState(store);
  if (!state.pendingPairing) return;
  state.pendingPairing = null;
  await store.save(state);
}

export interface IssuedCredential {
  /** The raw token — returned ONCE here; only its digest is stored. */
  rawToken: string;
  credential: CredentialRecord;
}

/**
 * Exchange a pairing for a credential. Single-consume and atomic:
 * code + secret digests, approval, and expiry are all checked before
 * the one state write that consumes the pairing and issues the
 * credential together. A wrong code or an unapproved pairing changes
 * nothing at all; an expired pairing is cleaned up (it can never be
 * exchanged) and still issues nothing.
 */
export async function exchangePairing(
  store: CompanionStore,
  presented: { pairingSecret: string; exchangeCode: string },
  now: Date = new Date(),
): Promise<IssuedCredential> {
  const state = await loadState(store);
  const pending = state.pendingPairing;
  if (!pending) throw new PairingNotFoundError();
  if (now.getTime() > Date.parse(pending.expiresAt)) {
    state.pendingPairing = null;
    await store.save(state);
    throw new PairingExpiredError();
  }
  const codeDigest = await sha256Hex(normalizeExchangeCode(presented.exchangeCode));
  if (!digestsEqual(codeDigest, pending.codeDigest)) throw new InvalidExchangeCodeError();
  const secretDigest = await sha256Hex(presented.pairingSecret);
  if (!digestsEqual(secretDigest, pending.secretDigest)) throw new PairingMismatchError();
  if (!pending.approved) throw new PairingNotApprovedError();

  const rawToken = generateSecret("pn_comp_");
  const credential: CredentialRecord = {
    id: generateSecret("").slice(0, 22),
    tokenDigest: await sha256Hex(rawToken),
    scopes: [...pending.requestedScopes],
    pairedAt: now.toISOString(),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
    revokedAt: null,
  };
  state.pendingPairing = null;
  state.credential = credential;
  await store.save(state);
  return { rawToken, credential };
}

// ---------- Credential lifecycle ----------

export type CredentialStatus = "active" | "expired" | "revoked";

export function credentialStatus(
  credential: CredentialRecord,
  now: Date = new Date(),
): CredentialStatus {
  if (credential.revokedAt) return "revoked";
  if (now.getTime() > Date.parse(credential.expiresAt)) return "expired";
  return "active";
}

/**
 * Renew an expired (or active) credential: the record — identity,
 * scopes, paired-at — stays exactly as it was; only the token rotates
 * and the expiry extends. Returns the new raw token, once. This is
 * the anti-cliff: expiry never reaches the identity.
 */
export async function renewCredential(
  store: CompanionStore,
  now: Date = new Date(),
): Promise<IssuedCredential> {
  const state = await loadState(store);
  const credential = state.credential;
  if (!credential) throw new NoCredentialError();
  if (credential.revokedAt) throw new TokenRevokedError();
  const rawToken = generateSecret("pn_comp_");
  const renewed: CredentialRecord = {
    ...credential,
    tokenDigest: await sha256Hex(rawToken),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
  };
  state.credential = renewed;
  await store.save(state);
  return { rawToken, credential: renewed };
}

/**
 * Revoke — the ONLY operation that wipes a credential identity.
 * Explicit owner action. Also disarms any session and clears the
 * local event record: a revoked pairing leaves nothing behind.
 */
export async function revokeCredential(store: CompanionStore): Promise<void> {
  const state = await loadState(store);
  state.credential = null;
  state.pendingPairing = null;
  state.session = { armed: false, armedAt: null, expiresAt: null };
  state.events = [];
  state.lastEvent = null;
  await store.save(state);
}

// ---------- Verification & pure reads ----------

/**
 * Verify a presented raw token for a scope. Pure: writes nothing.
 * Throws a specific error per failure (unknown / revoked / expired /
 * missing scope) so callers never guess.
 */
export async function verifyToken(
  store: CompanionStore,
  rawToken: string,
  requiredScope: CompanionScope,
  now: Date = new Date(),
): Promise<CredentialRecord> {
  const state = await loadState(store);
  const credential = state.credential;
  if (!credential) throw new UnknownTokenError();
  const digest = await sha256Hex(rawToken);
  if (!digestsEqual(digest, credential.tokenDigest)) throw new UnknownTokenError();
  if (credential.revokedAt) throw new TokenRevokedError();
  if (now.getTime() > Date.parse(credential.expiresAt)) throw new TokenExpiredError();
  if (!credential.scopes.includes(requiredScope)) throw new ScopeError(requiredScope);
  return credential;
}

export interface CompanionStatusView {
  paired: boolean;
  credentialStatus: CredentialStatus | null;
  scopes: CompanionScope[];
  pairedAt: string | null;
  session: SessionState;
  lastEvent: BridgeEvent | null;
}

/**
 * The scoped status read (status:read). Pure by design — the
 * AI-BUDDY refresh-on-read behavior is explicitly not copied: this
 * function performs no writes and triggers nothing.
 */
export async function readStatus(
  store: CompanionStore,
  rawToken: string,
  now: Date = new Date(),
): Promise<CompanionStatusView> {
  const credential = await verifyToken(store, rawToken, "status:read", now);
  const state = await loadState(store);
  return {
    paired: true,
    credentialStatus: credentialStatus(credential, now),
    scopes: [...credential.scopes],
    pairedAt: credential.pairedAt,
    session: { ...state.session },
    lastEvent: state.lastEvent,
  };
}

/**
 * The owner's own view, for the PWA status card — reads the local
 * record directly (the owner needs no token to look at their own
 * phone). Pure, like every read here.
 */
export async function getLocalStatus(
  store: CompanionStore,
  now: Date = new Date(),
): Promise<
  CompanionStatusView & {
    hasPendingPairing: boolean;
    pendingApproved: boolean;
    renewable: boolean;
  }
> {
  const state = await loadState(store);
  const credential = state.credential;
  const status = credential ? credentialStatus(credential, now) : null;
  return {
    paired: !!credential && status !== "revoked",
    credentialStatus: status,
    scopes: credential ? [...credential.scopes] : [],
    pairedAt: credential?.pairedAt ?? null,
    session: { ...state.session },
    lastEvent: state.lastEvent,
    hasPendingPairing: !!state.pendingPairing,
    pendingApproved: state.pendingPairing?.approved ?? false,
    renewable: !!credential && status === "expired",
  };
}

// ---------- Events & sessions ----------

function appendEvent(state: CompanionState, event: BridgeEvent): void {
  state.events = [...state.events, event].slice(-MAX_STORED_EVENTS);
  state.lastEvent = event;
}

/**
 * Push an event across the bridge (event:push). The event is
 * validated by the events-only guard before anything is recorded —
 * a blob-like payload never reaches the log.
 */
export async function pushEvent(
  store: CompanionStore,
  rawToken: string,
  event: unknown,
  now: Date = new Date(),
): Promise<BridgeEvent> {
  await verifyToken(store, rawToken, "event:push", now);
  const checked = validateEvent(event);
  const state = await loadState(store);
  appendEvent(state, checked);
  await store.save(state);
  return checked;
}

export interface ArmOptions {
  /** Session length; omit for an open-ended session. */
  durationMs?: number;
  /** A plain label for where/what the session is for (scalar note). */
  contextLabel?: string;
}

function armState(
  state: CompanionState,
  opts: ArmOptions,
  now: Date,
): CompanionState {
  const expiresAt =
    opts.durationMs && opts.durationMs > 0
      ? new Date(now.getTime() + opts.durationMs).toISOString()
      : null;
  state.session = { armed: true, armedAt: now.toISOString(), expiresAt };
  appendEvent(
    state,
    makeEvent(
      "session.armed",
      opts.contextLabel ? { label: opts.contextLabel.slice(0, 64) } : {},
      now.toISOString(),
    ),
  );
  return state;
}

/** Arm a session with a scoped credential (session:arm). */
export async function armSession(
  store: CompanionStore,
  rawToken: string,
  opts: ArmOptions = {},
  now: Date = new Date(),
): Promise<SessionState> {
  await verifyToken(store, rawToken, "session:arm", now);
  const state = armState(await loadState(store), opts, now);
  await store.save(state);
  return { ...state.session };
}

/**
 * Arm from the PWA itself — the owner arming their own record (the
 * spec's "session:arm action that starts the demo flow"). Records the
 * same armed state and the same event locally. It does NOT claim any
 * companion received or confirmed anything: with no companion the
 * status card says so, honestly.
 */
export async function armLocalSession(
  store: CompanionStore,
  opts: ArmOptions = {},
  now: Date = new Date(),
): Promise<SessionState> {
  const state = await loadState(store);
  if (!state.credential || state.credential.revokedAt) throw new NoCredentialError();
  armState(state, opts, now);
  await store.save(state);
  return { ...state.session };
}

function stopState(state: CompanionState, now: Date): CompanionState {
  state.session = { armed: false, armedAt: null, expiresAt: null };
  appendEvent(state, makeEvent("session.stopped", {}, now.toISOString()));
  return state;
}

/** Stop a session with a scoped credential (session:arm). */
export async function stopSession(
  store: CompanionStore,
  rawToken: string,
  now: Date = new Date(),
): Promise<SessionState> {
  await verifyToken(store, rawToken, "session:arm", now);
  const state = stopState(await loadState(store), now);
  await store.save(state);
  return { ...state.session };
}

/** Stop from the PWA (owner action, mirrors armLocalSession). */
export async function stopLocalSession(
  store: CompanionStore,
  now: Date = new Date(),
): Promise<SessionState> {
  const state = stopState(await loadState(store), now);
  await store.save(state);
  return { ...state.session };
}
