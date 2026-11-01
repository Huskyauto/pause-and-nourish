// The mailbox ceremony, end to end against the wire contract the
// companion app was built to (APK build spec §5): register → poll →
// approve → exchange → arm → events both ways → status → renew,
// plus the failure paths the spec names. The mailbox runs the
// companion-protocol module itself, so these tests also re-prove
// its guarantees on the server side: single-consume exchange,
// approval gating, digest-only storage, the payload guard.

import { beforeEach, describe, expect, it } from "vitest";
import {
  __mailboxStateForTests,
  __resetMailboxForTests,
  approveRegisteredPairing,
  companionMailboxStatus,
  exchangeRegisteredPairing,
  mailboxErrorResponse,
  ownerMailboxStatus,
  pollPairing,
  postOwnerEvent,
  pushCompanionEvent,
  readCompanionEvents,
  readOwnerEvents,
  registerPairing,
  renewCompanionCredential,
} from "./mailbox";
import {
  generateExchangeCode,
  generateSecret,
  normalizeExchangeCode,
  sha256Hex,
} from "../../companion-protocol";

const SCOPES = ["session:arm", "event:push", "status:read"];

async function freshPairing(expiresInMs = 15 * 60 * 1000) {
  const secret = generateSecret("pn_pair_");
  const code = generateExchangeCode();
  const ownerKey = generateSecret("pn_own_");
  const pairingId = "pairing-test-0001";
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
  await registerPairing({
    pairingId,
    secretDigest: await sha256Hex(secret),
    codeDigest: await sha256Hex(normalizeExchangeCode(code)),
    requestedScopes: SCOPES,
    expiresAt,
    ownerDigest: await sha256Hex(ownerKey),
  });
  return { secret, code, ownerKey, pairingId };
}

async function paired() {
  const p = await freshPairing();
  await approveRegisteredPairing(p.ownerKey);
  const issued = await exchangeRegisteredPairing(p.pairingId, {
    secret: p.secret,
    code: p.code,
  });
  return { ...p, token: issued.rawToken, credential: issued.credential };
}

beforeEach(() => {
  __resetMailboxForTests();
});

describe("pairing over the mailbox", () => {
  it("polls waiting, then approved; wrong secret reads as not found", async () => {
    const p = await freshPairing();
    await expect(pollPairing(p.pairingId, "pn_pair_wrong")).rejects.toMatchObject({
      code: "pairing_not_found",
    });
    await expect(pollPairing(p.pairingId, p.secret)).resolves.toEqual({ status: "waiting" });
    await approveRegisteredPairing(p.ownerKey);
    await expect(pollPairing(p.pairingId, p.secret)).resolves.toEqual({ status: "approved" });
  });

  it("refuses exchange before approval (409) and changes nothing", async () => {
    const p = await freshPairing();
    const err = await exchangeRegisteredPairing(p.pairingId, {
      secret: p.secret,
      code: p.code,
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "pairing_not_approved" });
    expect(mailboxErrorResponse(err)).toEqual({
      status: 409,
      body: { error: "pairing_not_approved" },
    });
    await expect(pollPairing(p.pairingId, p.secret)).resolves.toEqual({ status: "waiting" });
  });

  it("gates approval behind the owner key", async () => {
    const p = await freshPairing();
    await expect(approveRegisteredPairing("pn_own_wrong")).rejects.toMatchObject({
      code: "invalid_owner",
    });
    await expect(pollPairing(p.pairingId, p.secret)).resolves.toEqual({ status: "waiting" });
    void p;
  });

  it("rejects a wrong code without consuming the pairing, then exchanges once", async () => {
    const p = await freshPairing();
    await approveRegisteredPairing(p.ownerKey);
    await expect(
      exchangeRegisteredPairing(p.pairingId, { secret: p.secret, code: "ZZZZ-ZZZZ" }),
    ).rejects.toMatchObject({ code: "invalid_exchange_code" });
    const issued = await exchangeRegisteredPairing(p.pairingId, {
      secret: p.secret,
      code: p.code,
    });
    expect(issued.rawToken.startsWith("pn_comp_")).toBe(true);
    expect(issued.credential.scopes).toEqual(SCOPES);
    await expect(
      exchangeRegisteredPairing(p.pairingId, { secret: p.secret, code: p.code }),
    ).rejects.toMatchObject({ code: "pairing_not_found" });
  });

  it("stores digests only — raw secret, code, and token never appear in state", async () => {
    const { secret, code, token } = await paired();
    const serialized = JSON.stringify(await __mailboxStateForTests());
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(normalizeExchangeCode(code));
  });

  it("reports an expired pairing on poll and refuses its exchange", async () => {
    const p = await freshPairing(1000);
    const later = new Date(Date.now() + 60_000);
    await expect(pollPairing(p.pairingId, p.secret, later)).resolves.toEqual({
      status: "expired",
    });
    await approveRegisteredPairing(p.ownerKey);
    await expect(
      exchangeRegisteredPairing(p.pairingId, { secret: p.secret, code: p.code }, later),
    ).rejects.toMatchObject({ code: "pairing_expired" });
  });
});

describe("the bridge feed", () => {
  it("carries owner arm → companion read, and companion cue.played → owner read", async () => {
    const { token, ownerKey } = await paired();
    const auth = `Bearer ${token}`;

    await postOwnerEvent(ownerKey, { type: "session.armed" });
    const seen = await readCompanionEvents(auth, null);
    expect(seen.events.map((e) => e.type)).toEqual(["session.armed"]);

    const status = await companionMailboxStatus(auth);
    expect(status.paired).toBe(true);
    expect(status.session.armed).toBe(true);

    await pushCompanionEvent(auth, {
      type: "cue.played",
      at: new Date().toISOString(),
      payload: { via: "media-button" },
    });
    const ownerSeen = await readOwnerEvents(ownerKey, seen.events[0].id);
    expect(ownerSeen.events.map((e) => e.type)).toEqual(["cue.played"]);
    expect(ownerSeen.events[0].payload).toEqual({ via: "media-button" });

    const ownerStatus = await ownerMailboxStatus(ownerKey);
    expect(ownerStatus.lastEvent?.type).toBe("cue.played");

    await pushCompanionEvent(auth, {
      type: "session.stopped",
      at: new Date().toISOString(),
      payload: {},
    });
    const after = await companionMailboxStatus(auth);
    expect(after.session.armed).toBe(false);
  });

  it("lets the owner request the cue", async () => {
    const { token, ownerKey } = await paired();
    await postOwnerEvent(ownerKey, { type: "cue.requested" });
    const seen = await readCompanionEvents(`Bearer ${token}`, null);
    expect(seen.events.map((e) => e.type)).toEqual(["cue.requested"]);
  });

  it("refuses guard-breaking events and unknown tokens", async () => {
    const { token } = await paired();
    const err = await pushCompanionEvent(`Bearer ${token}`, {
      type: "cue.played",
      at: new Date().toISOString(),
      payload: { blob: { nested: true } },
    }).catch((e: unknown) => e);
    expect(mailboxErrorResponse(err)).toEqual({ status: 400, body: { error: "invalid_event" } });

    await expect(companionMailboxStatus("Bearer pn_comp_nope")).rejects.toMatchObject({
      code: "unknown_token",
    });
    await expect(companionMailboxStatus(null)).rejects.toMatchObject({
      code: "unknown_token",
    });
  });
});

describe("renewal", () => {
  it("rotates the token on the same identity; the old token dies", async () => {
    const { token, credential } = await paired();
    const renewed = await renewCompanionCredential(token);
    expect(renewed.rawToken).not.toEqual(token);
    expect(renewed.credential.id).toEqual(credential.id);
    expect(renewed.credential.pairedAt).toEqual(credential.pairedAt);
    await expect(companionMailboxStatus(`Bearer ${token}`)).rejects.toMatchObject({
      code: "unknown_token",
    });
    await expect(companionMailboxStatus(`Bearer ${renewed.rawToken}`)).resolves.toMatchObject({
      paired: true,
    });
    await expect(renewCompanionCredential("pn_comp_nope")).rejects.toMatchObject({
      code: "unknown_token",
    });
  });
});
