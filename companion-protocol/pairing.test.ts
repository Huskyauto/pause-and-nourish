// Pairing carrier tests: ONE payload, several carriers. Every
// rendering of a pairing offer must decode back to the identical
// fields — deep link, QR JSON, and copied text can never diverge,
// because they all render from pairingPayloadFields().

import { describe, expect, it } from "vitest";
import {
  PAIRING_DEEP_LINK_SCHEME,
  pairingCopyText,
  pairingDeepLink,
  pairingPayloadFields,
  pairingQrPayload,
  parsePairingPayload,
  type PairingPayloadFields,
} from "./pairing";
import { createMemoryStore, createPairing, type PairingOffer } from "./protocol";

// Deliberately hostile field values — spaces, '+', '/', '=', '&',
// and non-ASCII — so the deep-link round trip has to prove its
// URL-safe encoding rather than getting lucky with tame inputs.
const hostileOffer: PairingOffer = {
  pairingId: "id with spaces/&=",
  pairingSecret: "pn_pair_a+b/c=& dësïgn",
  exchangeCode: "K7QX-4MZD",
  requestedScopes: ["session:arm", "event:push", "status:read"],
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
};

describe("pairing carriers", () => {
  it("builds every carrier from the same fields", () => {
    const fields = pairingPayloadFields(hostileOffer);
    expect(fields).toEqual({
      pairingId: hostileOffer.pairingId,
      secret: hostileOffer.pairingSecret,
      code: hostileOffer.exchangeCode,
    });
  });

  it("deep link, QR payload, and copied text decode to identical fields", () => {
    const expected: PairingPayloadFields = pairingPayloadFields(hostileOffer);
    const fromLink = parsePairingPayload(pairingDeepLink(hostileOffer));
    const fromQr = parsePairingPayload(pairingQrPayload(hostileOffer));
    const fromText = parsePairingPayload(pairingCopyText(hostileOffer));
    expect(fromLink).toEqual(expected);
    expect(fromQr).toEqual(expected);
    expect(fromText).toEqual(expected);
    expect(fromLink).toEqual(fromQr);
    expect(fromQr).toEqual(fromText);
  });

  it("deep link uses the pauseandnourish scheme and round-trips hostile characters", () => {
    const link = pairingDeepLink(hostileOffer);
    expect(link.startsWith(`${PAIRING_DEEP_LINK_SCHEME}://pair?`)).toBe(true);
    // Nothing unencoded leaks into the link: no raw spaces, no raw '&'
    // beyond the parameter separators (4 params after the first).
    expect(link.includes(" ")).toBe(false);
    expect(link.split("&")).toHaveLength(5);
    expect(parsePairingPayload(link).secret).toBe(hostileOffer.pairingSecret);
  });

  it("carriers round-trip a real ceremony offer", async () => {
    const store = createMemoryStore();
    const offer = await createPairing(store, ["session:arm", "event:push", "status:read"]);
    const expected = pairingPayloadFields(offer);
    expect(parsePairingPayload(pairingDeepLink(offer))).toEqual(expected);
    expect(parsePairingPayload(pairingQrPayload(offer))).toEqual(expected);
    expect(parsePairingPayload(pairingCopyText(offer))).toEqual(expected);
  });

  it("rejects garbage, incomplete payloads, and foreign kinds", () => {
    expect(() => parsePairingPayload("hello there")).toThrowError(/missing a field/);
    expect(() => parsePairingPayload("{not json")).toThrowError(/could not be read/);
    expect(() =>
      parsePairingPayload(
        JSON.stringify({ v: 1, kind: "pause-and-nourish-pairing", pairingId: "x" }),
      ),
    ).toThrowError(/missing a field/);
    expect(() =>
      parsePairingPayload(
        JSON.stringify({ v: 1, kind: "something-else", pairingId: "x", secret: "y", code: "z" }),
      ),
    ).toThrowError(/not a Pause & Nourish pairing/);
    expect(() =>
      parsePairingPayload(`${PAIRING_DEEP_LINK_SCHEME}://pair?pairingId=x&secret=y`),
    ).toThrowError(/missing a field/);
  });
});
