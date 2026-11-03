// The PWA's client for the mailbox (src/lib/mailbox.ts, spec §5.1).
// When the PWA creates a pairing locally, it also registers the
// pairing's digests here so the companion app — on this same phone —
// can poll for approval and exchange over the wire. The PWA keeps
// one extra secret the companion never sees: an owner key, generated
// per pairing and kept in localStorage; only its digest is
// registered. Owner calls (approve, arm, read the feed) present it.

import {
  generateSecret,
  normalizeExchangeCode,
  sha256Hex,
  type PairingOffer,
} from "../../companion-protocol";

const STORAGE_KEY = "pn_mailbox_owner_v1";

export interface OwnerBinding {
  pairingId: string;
  ownerKey: string;
}

export function loadOwnerBinding(): OwnerBinding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OwnerBinding>;
    if (typeof parsed.pairingId === "string" && typeof parsed.ownerKey === "string") {
      return { pairingId: parsed.pairingId, ownerKey: parsed.ownerKey };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearOwnerBinding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing persisted, nothing to clear.
  }
}

export async function registerWithMailbox(offer: PairingOffer): Promise<OwnerBinding> {
  const ownerKey = generateSecret("pn_own_");
  const [secretDigest, codeDigest, ownerDigest] = await Promise.all([
    sha256Hex(offer.pairingSecret),
    sha256Hex(normalizeExchangeCode(offer.exchangeCode)),
    sha256Hex(ownerKey),
  ]);
  const res = await fetch("/api/mailbox/pairings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pairingId: offer.pairingId,
      secretDigest,
      codeDigest,
      requestedScopes: offer.requestedScopes,
      expiresAt: offer.expiresAt,
      ownerDigest,
    }),
  });
  if (!res.ok) throw new Error(`The companion link didn't answer (register ${res.status}).`);
  const binding: OwnerBinding = { pairingId: offer.pairingId, ownerKey };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binding));
  } catch {
    // The binding still works for this session via component state.
  }
  return binding;
}

export async function approveMailbox(binding: OwnerBinding): Promise<void> {
  const res = await fetch(`/api/mailbox/pairings/${binding.pairingId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerKey: binding.ownerKey }),
  });
  if (!res.ok) throw new Error(`The companion link didn't take the approval (${res.status}).`);
}

/** Wipe the SERVER mailbox (2026-11-02) — the revoke that counts. */
export async function revokeMailboxOnServer(binding: OwnerBinding): Promise<void> {
  const res = await fetch("/api/mailbox/owner/revoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerKey: binding.ownerKey }),
  });
  if (!res.ok) throw new Error(`The companion link didn't take the revoke (${res.status}).`);
}

export async function denyMailbox(binding: OwnerBinding): Promise<void> {
  try {
    await fetch(`/api/mailbox/pairings/${binding.pairingId}/deny`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerKey: binding.ownerKey }),
    });
  } catch {
    // Denial is also enforced locally; a missed server deny leaves a
    // pairing that expires in minutes and was never approved.
  }
}

export interface MailboxFeedEntry {
  id: string;
  type: string;
  at: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface MailboxOwnerStatus {
  paired: boolean;
  credentialStatus: string | null;
  scopes: string[];
  pairedAt: string | null;
  session: { armed: boolean; armedAt: string | null; expiresAt: string | null };
  lastEvent: MailboxFeedEntry | null;
  pendingPairing: { pairingId: string; approved: boolean; expiresAt: string } | null;
}

export async function fetchOwnerStatus(binding: OwnerBinding): Promise<MailboxOwnerStatus> {
  const res = await fetch("/api/mailbox/owner/status", {
    headers: { "x-owner-key": binding.ownerKey },
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as MailboxOwnerStatus;
}

export async function fetchOwnerEvents(
  binding: OwnerBinding,
  after: string | null,
): Promise<MailboxFeedEntry[]> {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const res = await fetch(`/api/mailbox/owner/events${query}`, {
    headers: { "x-owner-key": binding.ownerKey },
  });
  if (!res.ok) throw new Error(`events ${res.status}`);
  const data = (await res.json()) as { events: MailboxFeedEntry[] };
  return data.events;
}

export async function postMailboxOwnerEvent(
  binding: OwnerBinding,
  type: "session.armed" | "session.stopped" | "cue.requested",
): Promise<void> {
  const res = await fetch("/api/mailbox/owner/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerKey: binding.ownerKey, type }),
  });
  if (!res.ok) throw new Error(`The companion link didn't take that (${res.status}).`);
}
