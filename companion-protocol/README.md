# Companion protocol — Component A (connector slice C0)

Pure TypeScript, WebCrypto only, no device dependency. This is the
protocol a Pause & Nourish companion app (Component B, a later gated
step) and the PWA speak to share a guarded session. It implements §2
of `pause-and-nourish-connector-slice-spec-v1.0-2026-10-29.md`.

## Layout

- `crypto.ts` — SHA-256 digests, secret/code generation (WebCrypto).
- `events.ts` — the events-only bridge contracts and their runtime guard.
- `protocol.ts` — pairing ceremony, credentials, sessions, status.
- `pairing.ts` — the pairing payload and its carriers (deep link, QR,
  copied text) over one shared field builder.
- `*.test.ts` — the Vitest suite (`npm test`).

## The guarantees, and where they live

- **Digest-only storage.** Pairing secrets, exchange codes, and
  credential tokens are hashed in `createPairing` / `exchangePairing`
  and only the digest is written to the store. The raw token is
  returned exactly once — at exchange and at renew. Tests serialize
  the store after each ceremony step and grep for the raw values.
- **Single-consume, atomic exchange.** `exchangePairing` runs every
  check (code digest, secret digest, owner approval, expiry) before
  the single state write that consumes the pairing and issues the
  credential together. A wrong code changes nothing at all; an
  expired pairing issues nothing.
- **Owner approval.** `pendingPairing.approved` is written only by
  `approvePairing` — the explicit approval step in the PWA. Exchange
  refuses an unapproved pairing.
- **Scopes are exactly** `session:arm`, `event:push`, `status:read`
  (Guarded Session spec v1.1), enforced by `verifyToken` inside every
  token-gated call (`armSession`, `stopSession`, `pushEvent`,
  `readStatus`).
- **No expiry cliff.** An expired credential is a state
  (`credentialStatus` → `"expired"`), never a deletion: identity,
  scopes, and paired-at stay intact, and `renewCredential` rotates in
  a fresh token on that same record. The only wipe is
  `revokeCredential`, an explicit owner action.
- **Events only.** The bridge carries `session.armed`,
  `session.stopped`, `cue.requested`, `cue.played`, `moment.answered`
  — type, ISO timestamp, and a small flat payload of scalars. The
  `BridgeEvent` types refuse anything else at compile time;
  `validateEvent` refuses it again at runtime (blob-like, nested,
  oversized, or unknown-type input never reaches the log).
- **Reads stay pure.** `verifyToken`, `readStatus`, and
  `getLocalStatus` perform no writes and trigger nothing — there is
  no refresh-on-read anywhere in the module.

## Pairing carriers

The pairing payload is **carrier-agnostic**: three fields —
`pairingId`, `secret`, `code` — built once by
`pairingPayloadFields()` in `pairing.ts`. Every carrier is a rendering
of those same fields, and `parsePairingPayload()` reads any rendering
back to the identical fields (the tests pin this). The carriers, in
the order the PWA presents them:

- **Deep link — `pauseandnourish://pair?…` (primary).** The PWA and
  the companion live on the *same phone*, so the handoff is a link
  tap, not a camera. The companion registers the `pauseandnourish://`
  scheme (or an Android App Link) to receive the payload on tap.
- **Copied text.** A plain labeled rendering for the clipboard —
  paste it into the companion or anywhere the payload needs to go.
- **The exchange code, typed by hand.** Unchanged; always available.
- **QR code — cross-device only.** For when the companion is on
  *another* device whose camera can see this screen. (A QR shown on a
  phone can't be scanned by that same phone, which is why it is no
  longer the presented path.)

The pairing ceremony, scopes, and module APIs are unaffected — only
the presentation of the payload changed.

## Owner-side calls

The PWA is the record's owner, so it also has direct local calls that
need no token: `approvePairing` / `denyPairing`, `renewCredential`,
`revokeCredential`, `armLocalSession` / `stopLocalSession` (the
spec's PWA `session:arm` action), and `getLocalStatus`. Arming
locally records the armed state and the `session.armed` event in the
local record only — it never claims a companion received or
confirmed anything; that transport is Component B and does not exist
yet.
