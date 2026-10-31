// Muse Voice Transcribe (Day 5): one recorded spoken answer in, its
// words out. The audio goes to the Meta Model API through this
// server-side route only — the key (process.env.META_API_KEY) never
// reaches the browser, and nothing is stored server-side. Mirrors
// /api/speak's contract: until Bob pastes the key into Vercel, this
// returns 500 {error:"meta_not_configured"} and the client falls back
// (browser speech recognition, then a one-time type-in escape hatch).

import { metaApiKey, metaTranscribe, MetaApiError } from "@/lib/meta";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // a 12-second answer is ~200 KB

export async function POST(request: Request) {
  if (!metaApiKey()) {
    return Response.json({ error: "meta_not_configured" }, { status: 500 });
  }

  let audio: ArrayBuffer | null = null;
  let mimeType = "audio/webm";
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("audio");
      if (file instanceof Blob) {
        mimeType = file.type || mimeType;
        audio = await file.arrayBuffer();
      }
    } else {
      // JSON fallback: { audioBase64, mimeType }
      const body = (await request.json()) as {
        audioBase64?: unknown;
        mimeType?: unknown;
      };
      if (typeof body?.audioBase64 === "string") {
        const buf = Buffer.from(body.audioBase64, "base64");
        audio = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        if (typeof body.mimeType === "string") mimeType = body.mimeType;
      }
    }
  } catch {
    // Malformed body falls through to the 400 below.
  }

  if (!audio || audio.byteLength === 0) {
    return Response.json({ error: "audio_required" }, { status: 400 });
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return Response.json({ error: "audio_too_large" }, { status: 413 });
  }

  try {
    const text = await metaTranscribe(audio, mimeType);
    return Response.json({ text });
  } catch (err) {
    if (err instanceof MetaApiError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "transcribe_failed" }, { status: 502 });
  }
}
