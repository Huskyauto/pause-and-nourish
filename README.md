# Pause & Nourish

**A pause button for a habit.**

When the urge to eat shows up, you don't need more willpower — you need ninety seconds and a kinder question.

Pause & Nourish is a small, private, installable web app (PWA) built for the **Meta Global AI Developer Hackathon** (Oct 26 – Nov 4, 2026), theme **Build for Your World**. It distills what worked for its builder — 242 lb lost over 2 years 10 months by fixing *why* he ate, not just counting what he ate — into a three-step loop:

1. **Notice** (30 seconds) — name your mood, your context, and how hungry your body actually is. No judgment, just information.
2. **Pause** (90 seconds) — breathing and grounding while the urge crests and passes, like a wave.
3. **Choose** — eat, have something else instead, or delay. Every choice counts; nothing is scored or shamed.

Its centerpiece is **Talk It Through**: a two-way spoken conversation. The app asks one question at a time out loud, composing every line in the moment — nothing is pre-recorded or scripted — you answer out loud, and from your answers it assembles a spoken game plan dealt strictly from your own saved playbook: your why, your if-then, what you've stocked to have instead, your 90 seconds. It never invents advice.

> Wellness info only, not medical advice. Pause & Nourish is a personal habit tool. It does not diagnose, treat, or prescribe.

## How Meta AI is used — what the code actually calls

| Service | Endpoint in this repo | Job in the app |
|---|---|---|
| **Muse Voice Transcribe** (Meta Model API) | `POST /api/transcribe` | Turns each spoken answer in Talk It Through into text. Structured answers (the urge number, eat/swap/delay) are then parsed deterministically on-device — the model never infers them |
| **Muse Spark** (Meta Model API) | `POST /api/converse` | Composes the companion's next question, and the spoken game plan, live in the moment, in the user's chosen directness. Reflect-only by system prompt, and every generated line passes an output filter — a line the filter rejects is never spoken (the app shows an honest can't-reach-the-brain state rather than faking a conversation); the plan itself is assembled from the user's own saved words, not generated |
| **Muse Code** | — (build tool) | Used to build this app during the event |

**Voice-out disclosure:** the Meta Model API offers no text-to-speech endpoint, so every spoken line is composed live by the brain and spoken via **Fish Audio** (`POST /api/speak`, server-side key) — in the builder's *own cloned voice* for his build, or in a neutral stock voice a new user picks during their story intake. Nothing pre-recorded speaks in any live flow: no recorded cue opens a session, and no recorded questions are ever played. The single exception is deliberate and narrow: a user's own recorded reset line, recorded at calm time, plays inside the guided reset step after they choose to eat. The brain's lines are composed from the live situation plus the user's own saved words — their story, their why, their plan.

Not in the code (roadmap, not shipped): Muse Wonder weekly review, Muse Image, SAM 3.1 variety reflection, open-weights auto-tagging. Earlier drafts of this README listed them as features; they are not called by any code in this repository today.

## Privacy

Local-first by design. Your check-ins and journal live **on your device** (IndexedDB). There is no account, no hosted database, and nothing to leak. Spoken answers and conversation state go to the Meta Model API through thin serverless functions (keys never ship to the browser) and are not stored server-side. Delete everything, any time, from inside the app (Your week → Delete everything — it clears the journal, your plan, and every voice recording on the device).

## Run it

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```

Set `META_API_KEY` in the environment (Vercel project settings in production) to enable the companion features, and `FISH_API_KEY` to enable the spoken lines (when a Fish call itself fails, the phone's voice covers that line); the Notice → Pause → Choose loop itself works fully without either key — without the Meta key, Talk It Through shows an honest can't-reach-the-brain state instead of faking a conversation.

## Built during the event

All code in this repository was written during the hackathon window, Oct 26 – Nov 4, 2026. See the commit history — it is the build log.

## License

MIT
