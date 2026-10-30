// Fish Audio voice-out (Bob's call, 2026-10-29): the app sends a line of
// text; this route — server-side only — hands it to Fish with Bob's API
// key and returns his own cloned narrator voice as audio. The key never
// reaches the browser, and the speaking voice lives behind this single
// endpoint, so a future Meta voice-out could replace Fish in one change.

const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
// Bob's Fish voice, "Experienced Male Narrator" — a public model ID, not
// a secret. FISH_VOICE_ID in the environment overrides it when set.
const DEFAULT_VOICE_ID = "675fecd02fcc4ad28cd84ca61501ca3e";
const MAX_TEXT = 300;

export async function POST(request: Request) {
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    if (typeof body?.text === "string") {
      text = body.text.trim().slice(0, MAX_TEXT);
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
  const voiceId = process.env.FISH_VOICE_ID || DEFAULT_VOICE_ID;

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
