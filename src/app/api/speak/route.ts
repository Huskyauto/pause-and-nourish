// Fish Audio voice-out (Bob's call, 2026-10-29): the app sends a line of
// text; this route — server-side only — hands it to Fish with the API
// key and returns the founder's own cloned narrator voice as audio.
// The key never reaches the browser, and the speaking voice lives
// behind this single endpoint, so a future Meta voice-out could
// replace Fish in one change.

import { guardPublicRoute } from "@/lib/rateLimit";

const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
// The founder's Fish voice ID lives ONLY in the FISH_VOICE_ID
// environment variable (2026-11-02: it used to be a constant in this
// file, which put a personal identifier in the public repo). With
// no env var set, the founder path honestly reports itself
// unconfigured instead of falling back to a hard-coded voice.
// Neutral stock voices for story-intake users (Bob's ruling,
// 2026-10-31): a new user has no clone of their own, so they pick one
// of these at intake — broadly neutral Fish public-library voices,
// matched to nothing but the user's own pick. Picked from the public
// library listing and verified with one short spoken line each.
// The founder's clone is NEVER the default for another user.
const STOCK_VOICE_IDS = {
  // "Calm Storyteller" — clear, calm, measured, neutral-tone.
  female: "678b18d4c1834e3d850126fe4541afc1",
  // "Calm Narrator" — calm, measured, clear, neutral-tone.
  male: "638893dc81e241c79356f02ea1ed28f6",
} as const;
const MAX_TEXT = 300;

export async function POST(request: Request) {
  // Public-route guard (2026-11-02): same-origin browsers only,
  // per-IP minute cap — this endpoint spends Fish credit per call.
  const blocked = await guardPublicRoute(request, "speak", 60);
  if (blocked) return blocked;
  let text = "";
  let voice: "female" | "male" | null = null;
  try {
    const body = (await request.json()) as { text?: unknown; voice?: unknown };
    if (typeof body?.text === "string") {
      text = body.text.trim().slice(0, MAX_TEXT);
    }
    if (body?.voice === "female" || body?.voice === "male") {
      voice = body.voice;
    }
  } catch {
    // Malformed JSON falls through to the empty-text 400 below.
  }
  if (!text) {
    return Response.json({ error: "text_required" }, { status: 400 });
  }

  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) {
    // Expected until Bob pastes the key into the Vercel env vars.
    return Response.json({ error: "voice_not_configured" }, { status: 500 });
  }
  // A voice pick means an intake user: speak in their neutral stock
  // voice. No voice pick = the founder path, whose voice ID comes
  // from the environment only.
  const voiceId = voice ? STOCK_VOICE_IDS[voice] : process.env.FISH_VOICE_ID;
  if (!voiceId) {
    return Response.json({ error: "voice_not_configured" }, { status: 500 });
  }

  let fish: Response;
  try {
    fish = await fetch(FISH_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: "drama-3",
      },
      body: JSON.stringify({ text, reference_id: voiceId, format: "mp3" }),
    });
  } catch {
    return Response.json({ error: "voice_service_unreachable" }, { status: 502 });
  }
  if (!fish.ok) {
    // Never forward Fish's raw body or anything that could carry the key.
    return Response.json(
      { error: "voice_service_error", status: fish.status },
      { status: 502 },
    );
  }

  let audio: ArrayBuffer;
  try {
    audio = await fish.arrayBuffer();
  } catch {
    // The body read itself failed (connection dropped mid-stream) —
    // a typed 502, not an unhandled 500 (code review, 2026-10-31).
    return Response.json({ error: "voice_service_error" }, { status: 502 });
  }
  return new Response(audio, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}
