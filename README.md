# Pause & Nourish

**A second brain in your ear for the moment the urge to eat shows up.**

Pause & Nourish is a voice-first, local-first progressive web app (PWA) that helps a person pause inside a tricky eating moment — not with willpower lectures, streaks, or scores, but with a short spoken conversation with a "second brain" that knows *their own* story, *their own* plan, and *their own* words, and deals those words back at the moment they matter.

There are no menus in the moment, no forms, and no scripts. Every line the app speaks is composed live, for that situation, by the model — the way a good friend who knows you well would talk, not the way a decision tree would.

Built for the **Meta Global AI Developer Hackathon** (October 26 – November 4, 2026), **Indie Dev Track**.

**Live demo:** https://pause-and-nourish.vercel.app

---

## The loop

1. **Notice** — something's happening: a craving, a kitchen walk-by, the end of a long day. One tap (or the SOS button) opens the moment.
2. **Pause** — a guided 90 seconds: breathing, grounding, a move from the user's own plan, led out loud, paced in voice. The pause is never gated behind a form.
3. **Choose** — eat it, have something else instead, or wait. Every choice is legitimate. The app asks what *they* would do differently and follows up on *their* answer; it elicits, it does not prescribe.
4. **Learn** — one learning, in the user's own words, saved to the journal. A lapse is logged as a rep, not a failure — the warmest screen in the app is the one after eating.

## The founder story

Pause & Nourish was built by **Bob Washburn**, a licensed HVAC contractor in Gurnee, Illinois, who lost **243 lb — from 504 lb to 261 lb** — over about two and a half years, including a four-month plateau that broke through hundreds of small decisions, not one heroic week.

The app distills what actually worked for him, drawn from **218 of his own recorded daily videos** mined into a structured knowledge base of his quotes, moves, patterns, and setback recoveries. The strongest pattern in that record: absorption displaces food thoughts — food had been an emotional calming crutch, and what replaced it was engagement, his own voice in his ear, and a plan made at calm time and dealt back at hard time.

His statement of what this product is for: *it gives a person the opportunity to stop and think before acting.*

The app is also built to **work on the phone people already have**. Everything heavy — the brain, the ears, the voice — runs server-side; the phone is a microphone, a speaker, and a notebook. Any build choice that would raise the device floor is treated as a product decision, not a technical detail.

## How it works — the surfaces

- **Talk with me** — the front door. A free-form spoken conversation: the brain greets you, asks its own questions in its own words and order, and listens. Turns end on silence (about 1.8 seconds of quiet after you stop talking), listening re-opens on its own for your next answer, and replies are spoken sentence-by-sentence — the first sentence starts while the rest is still being prepared, so the conversation doesn't stall. Structured facts inside your answers (the urge number, the eat / instead / wait choice, how a guided move landed) are captured in the background by plain rules on your own words — they fill the journal; they never steer the conversation.
- **SOS** — one tap from the home screen. The brain composes an opening line for *this* moment — the time, where you are, what your plan says — then the 90-second pause toolkit and guided moves are there immediately. If the brain can't be reached, SOS doesn't fake it: the toolkit opens in silence.
- **Story intake** — new users are not handed a form. The brain interviews them out loud, one question at a time: their name, their story in their words, what tends to trigger the urge, what they would have instead — then plays back *"here's what I heard"* and lets them fix anything, in their words, on a quiet review page. During intake they also choose the voice that will speak to them.
- **Setup — "Your words, and what you'll have instead"** — the calm-time page where the playbook is authored: *my why* in one line; what you'll have instead, per trigger moment, in your own words; **places saved by standing there** (you stand in the spot, the app remembers it, and later it knows "you're at the shop" — as a name, never as coordinates); **risk windows** (times of day, optionally on specific days, when the home screen surfaces your plan card on its own); and **material slots** — a picture of tomorrow morning, a text-first arrangement with a person who has your back, a kind sentence for after a wobble — your words, saved for the moment, which the brain later brings back in its own way.
- **Dashboard** — a reflection, not a report: sessions, choices, urge before-and-after, and your learnings quoted back in your words. Numbers first, prose cut.
- **Guided moves** — a repertoire of **46 moves** the brain can offer and lead out loud when it fits: breathing and grounding, urge surfing, "run the movie" to tomorrow morning, a mouth reset, texting a person before eating, taking a photo first and keeping nothing, closing the kitchen for the night, a kind sentence to yourself, and more. Steps and pacing are fixed data — an exercise is an instrument, and the model never invents step text. Which move fits, and everything said around it, is the brain's live judgment.
- **The Friendly Brain** — a small on-screen companion on the conversing surfaces: quiet while idle, attentive while listening, thought bubble while thinking, a brief spark when the reply lands. It respects reduced-motion settings.
- **Get Support** — a standing page with the 988 Suicide and Crisis Lifeline (call or text, 24/7) and ANAD's eating-disorder helpline. The conversation surfaces it too: a deterministic keyword rule watches only for a user's own explicit crisis statements (never inferred states) and answers with one fixed signpost line pointing to 988 and that page. The app also discloses itself plainly — on the conversation screens and in the companion's own rules, the second brain is an AI companion, never a person (New York GBL §1700 duties, adopted deliberately).
- **Delete everything** — one action that clears the journal, the plan, recordings, places, profile, and companion records from the device (see Privacy).

## Architecture

Local-first. There is no hosted database, no account system, and no analytics.

```
┌───────────────────────────── the phone ─────────────────────────────┐
│  PWA (Next.js, installable, service-worker cached shell)            │
│  IndexedDB: journal · plan · places · profile · voice · companion   │
│  (localStorage fallback when IndexedDB is unavailable)              │
│  mic → device speech recognition first, recorder as fallback        │
└──────────────┬──────────────────────────────────────────────────────┘
               │  words and small JSON only — never coordinates,
               │  never stored audio
┌──────────────▼────────────── three thin API routes ─────────────────┐
│  /api/converse    → Muse Spark 1.3        (the brain)               │
│  /api/transcribe  → Muse Voice Transcribe (fallback ears)           │
│  /api/speak       → Fish Audio            (the voice — see below)   │
│  API keys live only in these server routes, never in the browser.   │
└─────────────────────────────────────────────────────────────────────┘
```

- **On-device storage.** The journal, Shield plan, saved places, story profile, the recorded reset line, and companion records live in IndexedDB on the user's device, with a localStorage fallback. Nothing about a user exists on a server.
- **The conversation** (`/api/converse`) receives the conversation so far, the user's plan and profile as material, recent journal context, the time of day, and — only if the user has saved places and already granted permission — a place *name* computed on the device. The model's reply passes an output filter before anything speaks it; if the model can't be reached, the app says so honestly rather than faking a conversation.
- **`companion-protocol/`** — a standalone, pure-TypeScript module (WebCrypto only) specifying how a future native companion app will pair with this PWA: a pairing ceremony where the PWA stores only a SHA-256 digest of the secret, owner approval of exactly three scopes (`session:arm`, `event:push`, `status:read`), single-use exchange codes, credentials that expire into a *renewable* state instead of wiping identity, and an events-only bridge — five typed events (`session.armed`, `session.stopped`, `cue.requested`, `cue.played`, `moment.answered`) carrying small scalar payloads only, enforced at runtime and at compile time. It ships with a **22-test suite** that proves these properties, including a test that serializes the store and searches it to prove the raw token is never in it. The PWA's companion page pairs, shows status honestly — with no companion answering, arming a session reads **"Waiting for companion"** — and never fakes a confirmation.

## Meta AI tooling — what the code actually calls

| Tool | Where | Job in the shipped build |
|---|---|---|
| **Muse Spark 1.3** (Meta Model API) | `/api/converse` | The in-the-moment brain: every conversational line, SOS opening, respawn line, and intake question is composed live by Muse Spark from the live situation plus the user's own material. |
| **Muse Voice Transcribe** (Meta Model API) | `/api/transcribe` | The fallback ears: when the device offers no speech recognition of its own, an answer is recorded (mono WAV) and transcribed here. Most answers never touch it — device recognition serves first. |
| **Muse Code** | build tool | This app was built with Muse Code during the hackathon window. |
| **Muse Wonder** | — | **Not wired in the shipped build.** Reserved as the deeper tier for the weekly review (see Roadmap). No code in this repository calls it today. |
| **SAM 3.1** | — | **Not in the shipped build.** Roadmap only: food-variety reflection. No code in this repository calls it today. |
| **Muse Image** | — | Not used. |

## Voice disclosure — read this one

Meta's Model API offers **no text-to-speech endpoint**, so the app's spoken voice is provided by **Fish Audio** (`/api/speak`, server-side key). This is stated plainly rather than buried:

- **Every spoken line is composed live by Muse Spark. Fish only gives it a voice.** There are no canned responses and no scripted question lists anywhere in the live flows.
- For the founder's build, that voice is **his own cloned voice** — "Experienced Male Narrator" by Robert Washburn — used with his consent. A new user instead picks a neutral stock voice (female or male) during story intake; the founder's clone is never used for anyone else.
- **The one recorded element in the app** is the user's own **reset line**: a sentence the user records at calm time, in their own voice, played back inside the guided reset step after they choose to eat. It is an exercise instrument — pacing and wording must be exact and repeatable — and it is the deliberate, single exception to "nothing pre-recorded."
- Speech is delivered sentence-first with the rest prepared behind it, so a long reply starts talking quickly. If a Fish call fails for a chunk, the phone's own voice covers that chunk.

## Privacy

- **Your data stays on your device.** Journal, plan, places, profile, recordings, and companion records are stored locally (IndexedDB, localStorage fallback). There are no accounts, no hosted database, no analytics, and no trackers.
- **Coordinates never leave the device.** Saved places are matched on the phone; the only thing that can travel is a place *name* (like "the shop"), and only inside a conversation you started, only if you saved places and granted location permission. Talk and SOS never trigger a permission prompt — setup is the only place one can appear.
- **Audio is not kept. Words are.** Your spoken answers become text for the journal; the recordings themselves are discarded. One honest caveat: when your device offers speech recognition, that service does the listening — on Android Chrome it is generally run by Google — and the app says so on its own screens. When the device offers none, the app's fallback transcription (Muse Voice Transcribe) hears the answer instead.
- **Conversation content** goes to the Meta Model API (and spoken text to Fish Audio) through the server routes so the brain can think and speak; it is not stored server-side by this app.
- **Delete everything** — available in the app — clears the journal store, the plan store, and the voice store in IndexedDB; the journal, plan, profile, places, companion, and recording fallbacks in localStorage; the location-permission flag; and the SOS session guards. It leaves no app state behind.

## Guardrails

- **Wellness info only — not therapy, not medical advice.** Pause & Nourish is a habit-interruption tool. It does not diagnose, treat, or prescribe, and its screens say so.
- **Reflect, don't advise.** The brain deals back the user's own words, plan, and journal history. It does not invent advice, meal plans, or recommendations.
- **Emotions are user-declared only.** The app never detects, infers, or scores how a user feels. If the user says it, the app can reflect it; if they didn't say it, the app doesn't claim it.
- **Illinois WOPR Act posture.** The Wellness and Oversight for Psychological Resources Act (Illinois Public Act 104-0054) bars unlicensed therapy and AI therapeutic decision-making. This app is deliberately built on the self-help side of that line: user-authored material, reflection, and habit support — no therapeutic interaction, no treatment recommendations, no emotion detection.
- **"Eat it" is always a legitimate answer.** The app delays and informs; it never denies, shames, or scores. Ninety seconds is a design choice for the pause, never a promise that an urge will pass in that time.

## Run it

**Prerequisites:** Node.js 20+, npm.

**Environment variables** (names only — set them in your shell locally, or in Vercel project settings in production):

- `META_API_KEY` — enables the brain (`/api/converse`) and fallback transcription (`/api/transcribe`).
- `FISH_API_KEY` — enables the spoken voice (`/api/speak`). Without it, spoken lines fall back to the phone's voice; without the Meta key, Talk shows an honest "can't reach the brain" state instead of faking a conversation. The on-device pause toolkit works without either key.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm test        # the companion-protocol proof suite (22 tests)
```

`npm test` runs the Vitest suite for `companion-protocol/`: pairing secrets stored as digests only, approval required, exchange codes single-use with failed exchanges leaving no partial state, the raw token provably absent from serialized storage, scope enforcement on every gated call, expiry leading to a renewable state with identity intact, revoke wiping identity, event payloads refusing anything non-scalar or oversized, and reads that mutate nothing.

**Deploy:** the production deployment is on Vercel, git-connected — pushes to `main` deploy automatically. The service worker cache name in `public/sw.js` (`pause-and-nourish-v33` at this writing) is the practical deploy marker: when it changes, the new build is live.

**The companion page** (`/companion`) works today for pairing and status against the protocol module. With no native companion built yet, arming a session honestly reports **"Waiting for companion"** — the transport is Roadmap work, and the page will not pretend otherwise.

## Project layout

- `src/app/` — the routes: `page.tsx` (home), `talk/` (the conversation), `pause/` (SOS and the pause toolkit), `story/` + `story/interview/` (the spoken intake and its review page), `shield/` (calm-time setup: plan, places, risk windows, material slots), `dashboard/` (the reflection), `check-in/`, `support/`, `companion/`, and `api/` (`converse`, `transcribe`, `speak`).
- `src/lib/` — the working parts: `journal.ts` (on-device storage), `actions.ts` (the 46-move repertoire), `baseline.ts` (the second-brain baseline the prompts carry), `meta.ts` (Meta API client and model IDs), `speak.ts` / `recognize.ts` (the speech pipeline and recognition-first answers), `places.ts` / `riskWindows.ts` (on-device place labels and window math), `companion.ts` (the protocol module's storage adapter), plus the WAV and prompt helpers.
- `src/components/` — `SecondBrain.tsx` (the Friendly Brain mascot) and small shared pieces.
- `companion-protocol/` — the standalone pairing/credential/events module and its tests; its own `README.md` maps each guarantee to the code that keeps it.
- `public/` — PWA icons and `sw.js`, the service worker (precaches the app shell; never caches `/api/`).

## Roadmap

- **The native companion (Component B).** The protocol is shipped and tested; the transport is not built. A small Android companion would complete the pairing, receive armed sessions ("Second Brain Watch"), and answer an earbud press with the screen off — the one thing a PWA structurally cannot do.
- **Muse Wonder weekly review + three-tier memory.** A weekly, deeper pass over the journal — what the brain has learned, what it should remember, what it should forget — with the memory shown to the user in a "what I remember about you" view they can correct.
- **SAM 3.1 variety reflection.** Reflecting the variety in what a user eats, from their own journal — reflection only, never scoring.
- **Accounts and sync** — post-hackathon, and only together with the consent machinery hosted data requires. The on-device design is the product's privacy foundation, not a placeholder.

## Status

All code in this repository was written during the hackathon window, **October 26 – November 4, 2026** — the commit history is the build log. Live demo: https://pause-and-nourish.vercel.app

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Robert Washburn (Huskyauto).
