# Pause & Nourish — Android companion

Native Android **1.0.0**, application ID
`net.agenticcorporation.pauseandnourish`. This is the bounded C0 companion,
not AI-BUDDY and not a Health Connect client.

**Status:** APK implementation and automated checks are provided. The five-step
phone acceptance gate has **not** been run. At implementation time on
2026-11-01 UTC (October 31 in America/Chicago), the specified production
`GET /api/mailbox/status` returned HTML **404**, so live pairing could not be
tested. Spark must deploy the mailbox and PWA wiring.

## Scope

Exactly three screens: **Status**, **Pairing**, **Your cue**.

* Deep-link, pasted-link, pasted labeled-text, manual three-field pairing.
  JSON pairing text is also accepted; camera QR scanning is not included.
* Explicit Pair tap, web-owner approval, then single-consume exchange.
* Android Keystore AES-GCM encrypted, atomically saved connection state.
* In-app, app-private AAC cue recording, up to ten seconds; preview/re-record.
  Recording stops when leaving the screen/app. No background microphone.
* Foreground `mediaPlayback` service, framework `MediaSession`, ongoing
  **Second Brain Watch — armed** notification with Stop.
* Headset play/pause or headset hook triggers the cue while armed. A successful
  completed playback reports `cue.played`; failed/interrupted/missing-cue
  playback does not. A preview does not report `cue.played`.
* Events-only mailbox, durable encrypted event cursor and bounded outbox.
* Credential renewal seven days before expiration, preserving identity.
  See the important server-contract limitation below.

No health permissions, accessibility, overlays, continuous microphone,
analytics, SDK trackers, location, contacts, audio uploads, boot receivers,
silent audio loops, or arbitrary network destinations.

## Build

Framework-only Java 17, Android Gradle Plugin **8.12.0**. No production
third-party runtime libraries. Kotlin was not necessary for this small
framework-only implementation.

Requirements:

* JDK 17
* Gradle **9.3.1** (the verified build tool; no wrapper binary is bundled)
* Android SDK platform **36**, build tools **35.0.0** or compatible
* `minSdk 26`, **`targetSdk 35`** as requested

Compile SDK 36 uses the available SDK; it does not change the target SDK.

```sh
export JAVA_HOME=/path/to/jdk17
export ANDROID_HOME=/path/to/android-sdk
export GRADLE_BIN=/path/to/gradle-9.3.1/bin/gradle
bash build.sh
```

This runs contract tests, platform-shaped Robolectric service tests,
Android lint, and the debug APK build. The APK is
`app/build/outputs/apk/debug/app-debug.apk`.
Builds obtain Gradle dependencies from Google/Maven Central. This is not
runtime application network traffic.

Debug signing is intentional for this sideloaded gate. Do not commit the
debug keystore. Keep the same signing key and increment `versionCode` for
subsequent in-place updates. The APK does not contain native ABI libraries.

## Phone setup and gate

1. Install the APK as the **separate Pause & Nourish app**. It does not
   replace AI-BUDDY Health Connect. Android may ask to allow installation
   from the app that opened the download.
2. Open Status and **Allow armed notifications**.
3. Open **Your cue**, grant microphone permission when recording, record
   a short cue and preview it. The recording stays on the phone.
4. In the PWA, Start pairing, open its companion link (or paste the payload
   in Pairing). Check all three fields, then tap **Pair**.
5. Approve in the PWA, then return to the companion. It polls for approval
   while visible. Paired status includes the original pairing date.
6. Keep the companion visible while arming in the PWA. Same-phone option:
   tap Arm in the browser, then immediately return to the companion;
   alternatively use split-screen or an owner session on another device.
7. Wait for the companion to show **Armed — notification is running**.
   Turn off the screen and press headset play/pause.
8. Confirm the recorded cue plays and the PWA status card receives
   `cue.played`. Notification Stop must end the local session.

If a different music app owns the headset button, stop its playback and
preview the cue once in this app **after arming**, then retry with the screen
off. This uses real playback to establish media routing, not fake playback.
Samsung battery management and the specific headset must be checked on-device.

### Acceptance — all five in one unbroken real-phone run

1. Pairing completes via the ceremony (payload → approval in the PWA → exchange → Paired).
2. The PWA's **Arm a session** reaches the companion (it shows armed).
3. The companion shows its **armed notification**.
4. An **earbud press with the screen off** plays the cue.
5. **`cue.played` appears on the PWA's status card.**

Building the APK or passing automated tests is **not** a pass of this gate.

## Protocol and privacy

Production origin is fixed to `https://pause-and-nourish.vercel.app`.
Only `/api/mailbox/…` is used by app networking. HTTPS validation is standard;
redirects and cleartext traffic are disabled. Requests and credentials are
not logged. Pairing query secrets must also be redacted by Spark's server logs.

The receiving parser mirrors `companion-protocol/pairing.ts` in the parent
repository, additionally enforcing the advertised `pair` host and input
length limits. Manual entry requires ID + secret + code: the server contract
does not offer code-only discovery.

Credential scopes are exactly `session:arm`, `event:push`, `status:read`.
The raw `pn_comp_…` token exists only in process memory and the encrypted
Keystore-backed vault, never plain preferences. The cursor, credential
metadata, and queued events share the encrypted atomic vault. No automatic
identity wipe occurs on a 401. Expired/revoked/missing-scope states stop the
local service and retain stored state with plain-language explanations.
An explicit new pairing replaces the old identity/outbox after a warning.

All outgoing bridge payloads are fixed local scalar fields, not user-entered
audio/text/location. The shared validator enforces the five event types,
flat scalar payloads, eight keys, 64 UTF-16 units per string (matching the
TypeScript rule), and 512 UTF-8 bytes per complete event. Only playback
completion sends `cue.played`, with `via: media-button` or `via: request`.
Preview is local-only. Typed events queue while offline and are removed
only after `202 {"accepted":true}`; maximum queue size is 128.
The current mailbox contract lacks event idempotency keys, so a lost receipt
may cause a duplicate status event; exactly-once delivery is not claimed.

The vault uses `noBackupFilesDir`, cues use app-private `filesDir`, and backup
and device transfer are excluded. The UI disables screenshots and automatic
form-state/autofill storage of pairing secrets. Do not uninstall or clear
app data to troubleshoot: that removes the local cue and encrypted connection.

## Honest deviations and server questions

1. **Internet permission:** added `INTERNET` to the four listed permissions.
   It is required to talk to the mailbox. No other permissions are requested.
2. **Unarmed/background:** no push channel is defined. Therefore unarmed
   discovery runs only with the activity visible. While armed, the foreground
   service checks the mailbox approximately every five seconds, including
   after the screen turns off (Android may delay network timers). No service
   is silently started from an unarmed, closed app. No boot/force-stop
   recovery or remote wake-up is claimed.
3. **First cursor:** the API has no explicit "now" cursor. The first event
   response after pairing is discarded and its final ID saved; current
   session state is obtained separately from `/status`. Old cue requests
   are never replayed at initial pairing. Spark must retain valid cursors
   or define how they recover after the 24-hour feed retention window.
4. **Session state:** `/status.session` is authoritative for armed state and
   expiration. Spark must populate `armedAt` and `expiresAt` and update state
   on `session.armed`/`session.stopped`. A local Stop suppresses the same old
   arm command even while offline. If expired, the service ends and queues
   `session.stopped`.
5. **One-shot exchange:** the contract cannot recover a successful exchange
   whose response was lost. An encrypted in-flight marker blocks unsafe
   blind retries; a fresh owner pairing is needed unless Spark adds recovery.
6. **One-step renewal:** the provided endpoint invalidates the old token
   before the client can save the response. The app marks the operation
   durably before requesting it, validates the unchanged identity/scopes,
   and atomically stores a successful response. If that response is lost or
   cannot be saved, it retains all existing state and warns about interrupted
   renewal rather than pretending it succeeded. **Spark needs a recoverable
   rotation protocol** (e.g. prepare/persist/commit or idempotent recovery).
   The server must also specify whether/how expired credentials may renew;
   no 14-day grace period is invented here.
7. **Hardware routing:** framework `MediaSession` is used as requested.
   A paused active session may not outrank another app's recently playing
   session on every headset/Samsung build. Actual screen-off hardware
   routing is deliberately an on-phone acceptance condition.

These are documented limitations, not additional features or silent
substitutes for the gate. Spark owns the mailbox and PWA; this source does
not modify either.

## Source delivery

The distributable ZIP contains this directory only, under `companion/`,
excluding build outputs, caches, local SDK paths, keystores, APKs, credentials,
and all AI-BUDDY code/data. It can be extracted into the parent repository.
GitHub publication uses an atomic commit based on the current parent tree,
with a non-force reference update, so unrelated PWA work is preserved.
The actual remote commit/verification outcome is recorded in the delivery
note, not assumed by this README.
