import { describe, expect, it } from "vitest";
import {
  InvalidExchangeCodeError,
  PairingExpiredError,
  PairingNotApprovedError,
  ScopeError,
  TokenExpiredError,
  TokenRevokedError,
  UnknownTokenError,
  approvePairing,
  armLocalSession,
  armSession,
  createMemoryStore,
  createPairing,
  credentialStatus,
  denyPairing,
  exchangePairing,
  getLocalStatus,
  pushEvent,
  readStatus,
  renewCredential,
  revokeCredential,
  stopSession,
  verifyToken,
  type CompanionScope,
  type CompanionState,
  type CompanionStore,
  type PairingOffer,
} from "./protocol";

const ALL_SCOPES: CompanionScope[] = ["session:arm", "event:push", "status:read"];
const T0 = new Date("2026-10-31T12:00:00.000Z");

async function storedJson(store: CompanionStore): Promise<string> {
  return JSON.stringify((await store.load()) ?? null);
}

async function pairedStore(scopes: CompanionScope[] = ALL_SCOPES) {
  const store = createMemoryStore();
  const offer = await createPairing(store, scopes, T0);
  await approvePairing(store);
  const issued = await exchangePairing(
    store,
    { pairingSecret: offer.pairingSecret, exchangeCode: offer.exchangeCode },
    T0,
  );
  return { store, offer, issued };
}

describe("pairing ceremony", () => {
  it("stores only digests — raw secret and code never reach the store", async () => {
    const store = createMemoryStore();
    const offer: PairingOffer = await createPairing(store, ALL_SCOPES, T0);
    const json = await storedJson(store);
    expect(json).not.toContain(offer.pairingSecret);
    expect(json).not.toContain(offer.exchangeCode);
    expect(json).not.toContain(offer.exchangeCode.replace("-", ""));
    const state = (await store.load()) as CompanionState;
    expect(state.pendingPairing?.secretDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(state.pendingPairing?.codeDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(state.pendingPairing?.approved).toBe(false);
  });

  it("requires owner approval before exchange", async () => {
    const store = createMemoryStore();
    const offer = await createPairing(store, ALL_SCOPES, T0);
    await expect(
      exchangePairing(
        store,
        { pairingSecret: offer.pairingSecret, exchangeCode: offer.exchangeCode },
        T0,
      ),
    ).rejects.toBeInstanceOf(PairingNotApprovedError);
    expect((await store.load())?.credential).toBeNull();
    // The failed attempt consumed nothing — approval then exchange works.
    expect((await store.load())?.pendingPairing).not.toBeNull();
    await approvePairing(store);
    const issued = await exchangePairing(
      store,
      { pairingSecret: offer.pairingSecret, exchangeCode: offer.exchangeCode },
      T0,
    );
    expect(issued.rawToken).toMatch(/^pn_comp_/);
  });

  it("is single-consume: a second exchange with the same code fails", async () => {
    const { store, offer } = await pairedStore();
    await expect(
      exchangePairing(
        store,
        { pairingSecret: offer.pairingSecret, exchangeCode: offer.exchangeCode },
        T0,
      ),
    ).rejects.toThrow();
    const state = (await store.load()) as CompanionState;
    expect(state.pendingPairing).toBeNull();
    expect(state.credential).not.toBeNull(); // exactly the one issued credential
  });

  it("a wrong code leaves no partial state — the store is untouched", async () => {
    const store = createMemoryStore();
    const offer = await createPairing(store, ALL_SCOPES, T0);
    await approvePairing(store);
    const before = await storedJson(store);
    await expect(
      exchangePairing(
        store,
        { pairingSecret: offer.pairingSecret, exchangeCode: "ZZZZ-ZZZZ" },
        T0,
      ),
    ).rejects.toBeInstanceOf(InvalidExchangeCodeError);
    expect(await storedJson(store)).toBe(before);
    expect((await store.load())?.credential).toBeNull();
  });

  it("an expired exchange issues nothing and leaves no partial credential", async () => {
    const store = createMemoryStore();
    const offer = await createPairing(store, ALL_SCOPES, T0);
    await approvePairing(store);
    const afterExpiry = new Date(T0.getTime() + 16 * 60 * 1000);
    await expect(
      exchangePairing(
        store,
        { pairingSecret: offer.pairingSecret, exchangeCode: offer.exchangeCode },
        afterExpiry,
      ),
    ).rejects.toBeInstanceOf(PairingExpiredError);
    const state = (await store.load()) as CompanionState;
    expect(state.credential).toBeNull();
    expect(state.pendingPairing).toBeNull(); // terminal cleanup, not a half-state
  });

  it("denial removes the waiting pairing", async () => {
    const store = createMemoryStore();
    await createPairing(store, ALL_SCOPES, T0);
    await denyPairing(store);
    expect((await store.load())?.pendingPairing).toBeNull();
  });
});

describe("digest-only credentials", () => {
  it("the raw token never appears in any stored record, across the whole lifecycle", async () => {
    const { store, issued } = await pairedStore();
    await armSession(store, issued.rawToken, { contextLabel: "evening" }, T0);
    await pushEvent(
      store,
      issued.rawToken,
      { type: "cue.played", at: T0.toISOString(), payload: { source: "earbud" } },
      T0,
    );
    await readStatus(store, issued.rawToken, T0);
    const json = await storedJson(store);
    expect(json).not.toContain(issued.rawToken);
    const state = (await store.load()) as CompanionState;
    expect(state.credential?.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies the right token and rejects wrong or tampered ones", async () => {
    const { store, issued } = await pairedStore();
    const record = await verifyToken(store, issued.rawToken, "session:arm", T0);
    expect(record.id).toBe(issued.credential.id);
    await expect(verifyToken(store, "pn_comp_wrong", "session:arm", T0)).rejects.toBeInstanceOf(
      UnknownTokenError,
    );
    await expect(
      verifyToken(store, `${issued.rawToken}x`, "session:arm", T0),
    ).rejects.toBeInstanceOf(UnknownTokenError);
  });
});

describe("scope enforcement", () => {
  it("a token without event:push cannot authorize a push, but can arm", async () => {
    const { store, issued } = await pairedStore(["session:arm", "status:read"]);
    await expect(
      pushEvent(
        store,
        issued.rawToken,
        { type: "cue.played", at: T0.toISOString(), payload: {} },
        T0,
      ),
    ).rejects.toBeInstanceOf(ScopeError);
    const session = await armSession(store, issued.rawToken, {}, T0);
    expect(session.armed).toBe(true);
    // And status:read IS carried, so the scoped read works.
    const status = await readStatus(store, issued.rawToken, T0);
    expect(status.paired).toBe(true);
  });

  it("a token without status:read cannot read status", async () => {
    const { store, issued } = await pairedStore(["session:arm", "event:push"]);
    await expect(readStatus(store, issued.rawToken, T0)).rejects.toBeInstanceOf(ScopeError);
  });

  it("a token without session:arm cannot arm or stop", async () => {
    const { store, issued } = await pairedStore(["event:push", "status:read"]);
    await expect(armSession(store, issued.rawToken, {}, T0)).rejects.toBeInstanceOf(ScopeError);
    await expect(stopSession(store, issued.rawToken, T0)).rejects.toBeInstanceOf(ScopeError);
  });
});

describe("no expiry cliff", () => {
  it("expiry is a renewable state: the record stays intact and renew rotates the token", async () => {
    const { store, issued } = await pairedStore();
    const later = new Date(T0.getTime() + 91 * 24 * 60 * 60 * 1000);
    // Expired in use…
    await expect(verifyToken(store, issued.rawToken, "status:read", later)).rejects.toBeInstanceOf(
      TokenExpiredError,
    );
    // …but the identity is intact, not wiped.
    const local = await getLocalStatus(store, later);
    expect(local.paired).toBe(true);
    expect(local.credentialStatus).toBe("expired");
    expect(local.renewable).toBe(true);
    expect(local.pairedAt).toBe(issued.credential.pairedAt);
    // Renew: same identity, new token, active again; the old token dies.
    const renewed = await renewCredential(store, later);
    expect(renewed.credential.id).toBe(issued.credential.id);
    expect(renewed.credential.pairedAt).toBe(issued.credential.pairedAt);
    expect(renewed.rawToken).not.toBe(issued.rawToken);
    expect(credentialStatus(renewed.credential, later)).toBe("active");
    await expect(
      verifyToken(store, issued.rawToken, "status:read", later),
    ).rejects.toBeInstanceOf(UnknownTokenError);
    const record = await verifyToken(store, renewed.rawToken, "status:read", later);
    expect(record.id).toBe(issued.credential.id);
    // The renewed raw token is digest-only too.
    expect(await storedJson(store)).not.toContain(renewed.rawToken);
  });

  it("revoke wipes the identity — and is the only thing that does", async () => {
    const { store, issued } = await pairedStore();
    await armLocalSession(store, {}, T0);
    await revokeCredential(store);
    const local = await getLocalStatus(store, T0);
    expect(local.paired).toBe(false);
    expect(local.credentialStatus).toBeNull();
    const state = (await store.load()) as CompanionState;
    expect(state.credential).toBeNull();
    expect(state.session.armed).toBe(false);
    expect(state.events).toEqual([]);
    expect(await storedJson(store)).not.toContain(issued.credential.tokenDigest);
    await expect(
      verifyToken(store, issued.rawToken, "status:read", T0),
    ).rejects.toBeInstanceOf(UnknownTokenError);
    // A revoked credential cannot be renewed back to life.
    await expect(renewCredential(store, T0)).rejects.toThrow();
  });

  it("a credential record marked revoked reports revoked, not expired", async () => {
    const record = {
      id: "x",
      tokenDigest: "0".repeat(64),
      scopes: ALL_SCOPES,
      pairedAt: T0.toISOString(),
      issuedAt: T0.toISOString(),
      expiresAt: new Date(T0.getTime() - 1000).toISOString(),
      revokedAt: T0.toISOString(),
    };
    expect(credentialStatus(record, T0)).toBe("revoked");
    void TokenRevokedError;
  });
});

describe("pure reads", () => {
  it("status reads and verifies mutate nothing and trigger nothing", async () => {
    const { store, issued } = await pairedStore();
    await armLocalSession(store, {}, T0);
    const before = await storedJson(store);
    await readStatus(store, issued.rawToken, T0);
    await verifyToken(store, issued.rawToken, "event:push", T0);
    await getLocalStatus(store, T0);
    expect(await storedJson(store)).toBe(before);
  });
});

describe("events and sessions", () => {
  it("arm records session.armed; pushes append and set lastEvent", async () => {
    const { store, issued } = await pairedStore();
    await armSession(store, issued.rawToken, { contextLabel: "evening kitchen" }, T0);
    let status = await readStatus(store, issued.rawToken, T0);
    expect(status.session.armed).toBe(true);
    expect(status.lastEvent?.type).toBe("session.armed");
    expect(status.lastEvent?.payload.label).toBe("evening kitchen");
    const played = await pushEvent(
      store,
      issued.rawToken,
      { type: "cue.played", at: T0.toISOString(), payload: { source: "earbud" } },
      T0,
    );
    expect(played.type).toBe("cue.played");
    status = await readStatus(store, issued.rawToken, T0);
    expect(status.lastEvent?.type).toBe("cue.played");
    const stopped = await stopSession(store, issued.rawToken, T0);
    expect(stopped.armed).toBe(false);
    status = await readStatus(store, issued.rawToken, T0);
    expect(status.lastEvent?.type).toBe("session.stopped");
  });

  it("a blob-like pushed event is refused before it reaches the log", async () => {
    const { store, issued } = await pairedStore();
    await expect(
      pushEvent(
        store,
        issued.rawToken,
        { type: "cue.played", at: T0.toISOString(), payload: { audio: new Blob(["x"]) } },
        T0,
      ),
    ).rejects.toThrow();
    const state = (await store.load()) as CompanionState;
    expect(state.events).toEqual([]);
    expect(state.lastEvent).toBeNull();
  });
});
