# Pause & Nourish companion — build note

**Build:** 1.0.0 / version code 1, 2026-11-01 UTC (October 31, America/Chicago).
**Application ID:** `net.agenticcorporation.pauseandnourish`.

## Delivered

* A sideloadable, debug-signed APK for Android 8.0+ (`minSdk 26`).
* The complete independent native source under `companion/`, including
  tests, Gradle configuration, build script, and setup/limitations README.
* No AI-BUDDY files, credentials, health data, keystores, generated caches,
  or build outputs are included in the public source package.

**Stack chosen:** framework-only Android/Java 17. Framework `MediaSession`
plus a `mediaPlayback` foreground service provides the required media-key
path without accessibility or background recording. AGP 8.12.0 / Gradle
9.3.1, compile SDK 36, **target SDK 35**. No third-party runtime libraries.

## Verification performed

* Native APK compilation and packaging successful.
* **15 automated tests passed:** 11 pairing/event/credential contract tests
  and 4 Robolectric Android API 28 foreground/media-service tests.
* Android lint passed with non-blocking warnings (principally fixed-English
  UI copy and the explicitly requested target SDK).
* APK signature verified; package ID, version, minimum/target SDK and exact
  five-permission manifest checked.
* APK has no native ABI libraries and contains compiled DEX application code.

**APK SHA-256:**
`73a69f05ddc4f0afe4ab2b1e70a9f32bda7cc9dcd06db9ba0bdf400aec0f487b`

**Not verified:** real Samsung/earbud routing, Android 15/16 manufacturer
battery behavior, hardware-backed Keystore execution, physical microphone
recording, live pairing, or the five-condition phone gate. Robolectric is not
a substitute for those checks. **The acceptance gate is not marked passed.**

## Requirements not fully achievable as written

1. Added `INTERNET`, required for the mailbox, to the four listed permissions.
2. Without a server push channel, an unarmed closed app cannot reliably
   discover a new arm command or start an Android foreground service.
   Keep the companion visible when arming; once genuinely armed, its
   foreground service and hardware media session remain active screen-off.
   There is no boot/force-stop recovery or silent background workaround.
3. No explicit initial "now" cursor is defined. The first event list is
   discarded to establish a baseline, and current armed state comes from
   `/status`. Historical cue commands are not replayed after initial pairing.
4. Exchange and renewal are one-shot operations with no response-loss recovery
   in the server contract. The client durably marks an attempt and saves
   successful responses atomically. An uncertain result retains state and
   warns rather than clearing identity or claiming success. Spark must add
   recoverable rotation and specify expired-token renewal rules for long-term
   stability. The app does not invent alternate endpoints.
5. Event delivery is retryable, not exactly-once: the mailbox does not define
   idempotency keys, so an accepted event with a lost receipt can be repeated.
6. Android/headset media-key selection depends on real device state.
   If another app owns the button, stop it and preview the cue once while
   this companion is armed; there is no fake or silent playback loop.

## Spark's server gate

At the implementation check, production
`https://pause-and-nourish.vercel.app/api/mailbox/status` returned HTML
**404**, not the expected JSON auth response. No real secrets were used.

Before the phone test, Spark must deploy the exact pairing approval/exchange,
credential-authenticated event feed, status and renewal endpoints from §5,
plus the owner-facing PWA approval, Arm and status-card wiring. Status must
carry authoritative `session.armed`, `armedAt`, and `expiresAt`; event feeds
must be scoped to the correct credential. Pairing secrets in query strings
must be omitted from server/access logs.

Follow `README.md` for the short phone setup sequence and the five-condition
acceptance test, unchanged. No unrelated feature work was added.

## Public repository delivery status

The configured GitHub integration can read
`https://github.com/Huskyauto/pause-and-nourish`, but creation of the source
tree was rejected with **HTTP 403: Resource not accessible by integration**.
The existing alternate authorization also failed its access check.
**No public source commit was made by this build session.**

Per the specification's fallback, the complete source ZIP is delivered
alongside the APK. Spark should extract its top-level `companion/` into the
public repository, review and commit that directory, and push during the
hackathon window. Preserve the existing PWA source and history; do not
force-push or backdate commits. The ZIP contains source, not a replacement
repository or private AI-BUDDY material.
