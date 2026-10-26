# Pause & Nourish

**A pause button for a habit.**

When the urge to eat shows up, you don't need more willpower — you need ninety seconds and a kinder question.

Pause & Nourish is a small, private, installable web app (PWA) built for the **Meta Global AI Developer Hackathon** (Oct 26 – Nov 4, 2026), theme **Build for Your World**. It distills what worked for its builder — 242 lb lost over 2 years 10 months by fixing *why* he ate, not just counting what he ate — into a three-step loop:

1. **Notice** (30 seconds) — name your mood, your context, and how hungry your body actually is. No judgment, just information.
2. **Pause** (90 seconds) — breathing and grounding while the urge crests and passes, like a wave.
3. **Choose** — eat, swap, or delay. Every choice counts; nothing is scored or shamed.

> Wellness info only, not medical advice. Pause & Nourish is a personal habit tool. It does not diagnose, treat, or prescribe.

## How Meta AI is used

| Service | Job in the app |
|---|---|
| **Muse Spark** (Meta Model API) | The everyday companion: reflects your own check-ins back to you, spots patterns in your own words, offers reframes — never advice, never a meal plan |
| **Muse Wonder** (Meta Model API) | The weekly deep review: reads 7 days of your journal and writes your 7-day insight summary |
| **Muse Image** | Generates the calming visual for the 90-second pause, and a visualized swap at Choose |
| **SAM 3.1** | Meal-photo segmentation used for *variety reflection* (colors and food groups on the plate) — never calories, never a score |
| **Muse Voice Transcribe** | Voice journal entries at check-in, for people who'd rather talk than type |
| **Meta open-weights models** (Muse Glimmer / Muse Spark Open) | Instant on-the-spot auto-tagging of check-ins via a partner endpoint — the fast, cheap job the big models shouldn't do |
| **Muse Code** | Used to build a defined slice of this app (documented in the submission) |

## Privacy

Local-first by design. Your check-ins and journal live **on your device** (IndexedDB). There is no account, no hosted database, and nothing to leak. Text you send to the companion goes to the Meta Model API through a thin serverless function (the key never ships to the browser) and is not stored server-side. Delete everything, any time, from inside the app.

## Run it

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```

Set `META_MODEL_API_KEY` in the environment (Vercel project settings in production) to enable the companion features; the loop itself works fully offline without it.

## Built during the event

All code in this repository was written during the hackathon window, Oct 26 – Nov 4, 2026. See the commit history — it is the build log.

## License

MIT
