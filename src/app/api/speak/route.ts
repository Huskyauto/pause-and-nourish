// Fish Audio voice-out (Bob's call, 2026-10-29): the app sends a line of
// text; this route — server-side only — hands it to Fish with Bob's API
// key and returns his own cloned narrator voice as audio. The key never
// reaches the browser, and the speaking voice lives behind this single
// endpoint, so a future Meta voice-out could replace Fish in one change.

const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
// Bob's Fish voice, "Experienced Male Narrator" — a public model ID, not
// a secret. FISH_VOICE_ID in the environment overrides it when set.
const DEFAULT_VOICE_ID = "675fecd02fcc4ad28cd84ca61501ca3e";
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
  // voice. No voice pick = the founder path, unchanged.
  const voiceId = voice ? STOCK_VOICE_IDS[voice] : process.env.FISH_VOICE_ID || DEFAULT_VOICE_ID;

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

  const audio = await fish.arrayBuffer();
  return new Response(audio, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}
