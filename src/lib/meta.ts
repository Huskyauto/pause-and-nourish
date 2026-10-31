// Meta Model API access — SERVER-SIDE ONLY (imported by the /api routes,
// never by client code). The API key lives in process.env.META_API_KEY
// and never reaches the browser, mirroring /api/speak's Fish pattern.
//
// *** LIVE-VERIFIED (Day 5, Oct 30) ***
// Constants corrected against GET https://api.meta.ai/v1/models with
// the production key. The key's model list: muse-wonder-1.0, sam-3.1,
// muse-spark-1.3-contributor, muse-voice-transcribe-1.0,
// muse-spark-1.3, muse-image-1.0, muse-spark-1.2-contributor,
// muse-spark-1.2, muse-spark-1.1.
//   - META_CHAT_MODEL: "muse-wonder-1.0" — Bob's direction (Oct 30):
//     the conversation brain runs on Muse Wonder. NOTE: the key lists
//     NO Wonder Contributor variant — only this Full ID — while the
//     hackathon credits were said to cover standard Contributor
//     variants only, so Wonder calls may bill the card on file.
//   - META_TRANSCRIBE_MODEL: "muse-voice-transcribe-1.0" (the bare
//     product name 404'd — the versioned ID is the real one).
//   - Endpoint paths "/chat/completions" and "/audio/transcriptions"
//     and the multipart field names ("file", "model") follow the
//     OpenAI-style surface; response reads (choices[0].message.content,
//     .text) likewise.

export const META_API_BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
export const META_CHAT_MODEL = "muse-wonder-1.0";
export const META_TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";

export function metaApiKey(): string | null {
  const key = process.env.META_API_KEY;
  return key && key.trim() ? key : null;
}

export class MetaApiError extends Error {
  status: number;
  // Upstream response body (truncated), surfaced for live diagnosis of
  // model-ID / path mismatches. Bodies are error payloads from Meta;
  // the key is never in them (it travels in the Authorization header).
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function metaFetch(path: string, init: RequestInit): Promise<Response> {
  const key = metaApiKey();
  if (!key) throw new MetaApiError(500, "meta_not_configured");
  let res: Response;
  try {
    res = await fetch(`${META_API_BASE_URL}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${key}` },
    });
  } catch {
    throw new MetaApiError(502, "meta_service_unreachable");
  }
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = (await res.text()).slice(0, 500) || undefined;
    } catch {
      detail = undefined;
    }
    throw new MetaApiError(502, `meta_service_error:${res.status}`, detail);
  }
  return res;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Muse Spark chat completion. Returns the reply text (possibly empty).
export async function metaChat(messages: ChatMessage[]): Promise<string> {
  const res = await metaFetch("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: META_CHAT_MODEL,
      messages,
      temperature: 0.4,
    }),
  });
  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

// Muse Voice Transcribe: one recorded answer in, its words out.
export async function metaTranscribe(
  audio: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const ext = mimeType.includes("mp4")
    ? "m4a"
    : mimeType.includes("mpeg")
      ? "mp3"
      : mimeType.includes("ogg")
        ? "ogg"
        : "webm";
  const form = new FormData();
  form.append(
    "file",
    new Blob([audio], { type: mimeType || "audio/webm" }),
    `answer.${ext}`,
  );
  form.append("model", META_TRANSCRIBE_MODEL);
  const res = await metaFetch("/audio/transcriptions", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text.trim() : "";
}
