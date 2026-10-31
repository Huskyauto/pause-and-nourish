# Pause & Nourish

**A pause button for a habit.**

When the urge to eat shows up, you don't need more willpower — you need ninety seconds and a kinder question.

Pause & Nourish is a small, private, installable web app (PWA) built for the **Meta Global AI Developer Hackathon** (Oct 26 – Nov 4, 2026), theme **Build for Your World**. It distills what worked for its builder — 242 lb lost over 2 years 10 months by fixing *why* he ate, not just counting what he ate — into a three-step loop:

1. **Notice** (30 seconds) — name your mood, your context, and how hungry your body actually is. No judgment, just information.
2. **Pause** (90 seconds) — breathing and grounding while the urge crests and passes, like a wave.
3. **Choose** — eat, swap, or delay. Every choice counts; nothing is scored or shamed.

Its centerpiece is **Talk It Through**: a two-way spoken conversation. The app asks one question at a time out loud — in *your own recorded voice* when you've recorded the questions — you answer out loud, and from your answers it assembles a spoken game plan dealt strictly from your own saved playbook: your why, your if-then, your pre-stocked swap, your 90 seconds. It never invents advice.

> Wellness info only, not medical advice. Pause & Nourish is a personal habit tool. It does not diagnose, treat, or prescribe.

## How Meta AI is used — what the code actually calls

| Service | Endpoint in this repo | Job in the app |
|---|---|---|
| **Muse Voice Transcribe** (Meta Model API) | `POST /api/transcribe` | Turns each spoken answer in Talk It Through into text. Structured answers (the urge number, eat/swap/delay) are then parsed deterministically on-device — the model never infers them |
| **Muse Spark** (Meta Model API) | `POST /api/converse` | Phrases the companion's next question, and the spoken game plan, in the user's chosen directness. Reflect-only by system prompt, and every generated line passes an output filter (advice/therapy/diet vocabulary is replaced by the deterministic line); the plan itself is assembled from the user's own saved words, not generated |
| **Muse Code** | — (build tool) | Used to build this app during the event |

**Voice-out disclosure:** the Meta Model API offers no text-to-speech endpoint, so dynamic lines (the assembled game plan) are spoken in the user's *own cloned voice* via **Fish Audio** (`POST /api/speak`, server-side key). The user's own recordings are always the primary voice: their recorded cue opens every session, their recorded reset line plays after eating, and the five conversation questions are recorded in their voice at calm time wherever they've recorded them. Fish speaks only lines built from the user's own words.

Not in the code (roadmap, not shipped): Muse Wonder weekly review, Muse Image, SAM 3.1 variety reflection, open-weights auto-tagging. Earlier drafts of this README listed them as features; they are not called by any code in this repository today.

## Privacy

Local-first by design. Your check-ins and journal live **on your device** (IndexedDB). There is no account, no hosted database, and nothing to leak. Spoken answers and conversation state go to the Meta Model API through thin serverless functions (keys never ship to the browser) and are not stored server-side. Delete everything, any time, from inside the app (Your week → Delete everything — it clears the journal, your plan, and every voice recording on the device).

## Run it

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```

Set `META_API_KEY` in the environment (Vercel project settings in production) to enable the companion features, and `FISH_API_KEY` to enable the cloned-voice lines; the loop itself works fully without either key — Talk It Through falls back to deterministic lines spoken by the phone's voice, and answers fall back to the browser's speech recognition.

## Built during the event

All code in this repository was written during the hackathon window, Oct 26 – Nov 4, 2026. See the commit history — it is the build log.

## License

MIT
