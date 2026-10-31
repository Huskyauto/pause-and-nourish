// Pairing payload carriers (Component A, pairing-flow fix 2026-10-31).
//
// ONE payload, several carriers. The payload is three fields —
// pairingId, secret, code — built once by pairingPayloadFields() from
// the PairingOffer. Every carrier (deep link, QR, copied text) is a
// rendering of those same fields, so the carriers can never diverge:
// whatever route the payload travels, parsePairingPayload() reads it
// back to the identical fields.
//
// Carriers, in the order the PWA presents them:
// - Deep link (pauseandnourish://pair?...) — the same-device handoff.
//   The companion app and the PWA live on the SAME phone, so this is
//   the primary path: the companion registers the scheme and receives
//   the payload on tap. A QR code on a screen can't be scanned by the
//   phone showing it.
// - Copied text — the clipboard rendering, for pasting into the
//   companion (or anywhere else the payload needs to go).
// - The exchange code itself, typed by hand (rendered by the PWA from
//   the offer, not by this module — it is the code field, unchanged).
// - QR code — cross-device ONLY: for when the companion is on another
//   device whose camera can see this screen.
//
// The payload is carrier-agnostic by design; nothing here knows or
// cares which rendering a companion consumed. The pairing ceremony,
// scopes, and credential lifecycle in protocol.ts are untouched.

import { CompanionError, type PairingOffer } from "./protocol";

export const PAIRING_PAYLOAD_KIND = "pause-and-nourish-pairing";
export const PAIRING_DEEP_LINK_SCHEME = "pauseandnourish";

/** The pairing payload itself — the only thing any carrier carries. */
export interface PairingPayloadFields {
  pairingId: string;
  secret: string;
  code: string;
}

/** The single shared builder every carrier renders from. */
export function pairingPayloadFields(offer: PairingOffer): PairingPayloadFields {
  return {
    pairingId: offer.pairingId,
    secret: offer.pairingSecret,
    code: offer.exchangeCode,
  };
}

/** The deep link a companion on this same phone opens on tap. */
export function pairingDeepLink(offer: PairingOffer): string {
  const fields = pairingPayloadFields(offer);
  const params = new URLSearchParams({
    v: "1",
    kind: PAIRING_PAYLOAD_KIND,
    pairingId: fields.pairingId,
    secret: fields.secret,
    code: fields.code,
  });
  return `${PAIRING_DEEP_LINK_SCHEME}://pair?${params.toString()}`;
}

/** The QR payload a companion on ANOTHER device would scan. */
export function pairingQrPayload(offer: PairingOffer): string {
  const fields = pairingPayloadFields(offer);
  return JSON.stringify({
    v: 1,
    kind: PAIRING_PAYLOAD_KIND,
    pairingId: fields.pairingId,
    secret: fields.secret,
    code: fields.code,
  });
}

/** The plain-text rendering the Copy button puts on the clipboard. */
export function pairingCopyText(offer: PairingOffer): string {
  const fields = pairingPayloadFields(offer);
  return [
    "Pause & Nourish pairing",
    `Pairing ID: ${fields.pairingId}`,
    `Secret: ${fields.secret}`,
    `Code: ${fields.code}`,
  ].join("\n");
}

function checkedFields(raw: {
  pairingId?: unknown;
  secret?: unknown;
  code?: unknown;
}): PairingPayloadFields {
  const { pairingId, secret, code } = raw;
  if (
    typeof pairingId !== "string" ||
    pairingId.length === 0 ||
    typeof secret !== "string" ||
    secret.length === 0 ||
    typeof code !== "string" ||
    code.length === 0
  ) {
    throw new CompanionError(
      "invalid_pairing_payload",
      "That pairing payload is missing a field — it isn't a complete pairing.",
    );
  }
  return { pairingId, secret, code };
}

/**
 * Read a pairing payload back from ANY carrier rendering — deep link,
 * QR JSON, or copied text — to the identical fields. This is the
 * receiving half of the contract the companion implements; the tests
 * pin that all three renderings decode to the same payload.
 */
export function parsePairingPayload(input: string): PairingPayloadFields {
  const text = input.trim();

  if (text.startsWith(`${PAIRING_DEEP_LINK_SCHEME}://`)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw new CompanionError(
        "invalid_pairing_payload",
        "That pairing link could not be read.",
      );
    }
    const params = url.searchParams;
    const kind = params.get("kind");
    if (kind !== null && kind !== PAIRING_PAYLOAD_KIND) {
      throw new CompanionError(
        "invalid_pairing_payload",
        "That link is not a Pause & Nourish pairing link.",
      );
    }
    return checkedFields({
      pairingId: params.get("pairingId") ?? undefined,
      secret: params.get("secret") ?? undefined,
      code: params.get("code") ?? undefined,
    });
  }

  if (text.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new CompanionError(
        "invalid_pairing_payload",
        "That pairing payload could not be read.",
      );
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new CompanionError(
        "invalid_pairing_payload",
        "That pairing payload could not be read.",
      );
    }
    const record = parsed as Record<string, unknown>;
    if (record.kind !== undefined && record.kind !== PAIRING_PAYLOAD_KIND) {
      throw new CompanionError(
        "invalid_pairing_payload",
        "That payload is not a Pause & Nourish pairing.",
      );
    }
    return checkedFields(record);
  }

  // The copied-text rendering: one labeled field per line.
  const grab = (label: string): string | undefined => {
    const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
    return match?.[1]?.trim();
  };
  return checkedFields({
    pairingId: grab("Pairing ID"),
    secret: grab("Secret"),
    code: grab("Code"),
  });
}
