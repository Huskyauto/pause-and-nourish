// Meta Model API access — SERVER-SIDE ONLY (imported by the /api routes,
// never by client code). The API key lives in process.env.META_API_KEY
// and never reaches the browser, mirroring the other routes' pattern.
//
// *** LIVE-VERIFIED (Day 5, Oct 30) ***
// Constants corrected against GET https://api.meta.ai/v1/models with
// the production key. The key's model list: muse-wonder-1.0, sam-3.1,
// muse-spark-1.3-contributor, muse-voice-transcribe-1.0,
// muse-spark-1.3, muse-image-1.0, muse-spark-1.2-contributor,
// muse-spark-1.2, muse-spark-1.1.
//   - META_CHAT_MODEL: "muse-spark-1.3" — Bob's decision (Oct 30):
//     Spark is the in-the-moment brain. The flow, parsing, and plan
//     assembly are all deterministic; the model only phrases one
//     fenced line (output filter + deterministic fallback), so Spark
//     is strong enough and faster to first sound. Muse Wonder
//     ("muse-wonder-1.0" — the only Wonder ID the key lists; no
//     Contributor variant, and Wonder Full is NOT covered by the
//     hackathon credits) is reserved for the Day 7 weekly review.
//     A "muse-spark-1.3-contributor" ID is also listed if credit
//     coverage of the plain 1.3 ID ever becomes a question.
//   - META_TRANSCRIBE_MODEL: "muse-voice-transcribe-1.0" (the bare
//     product name 404'd — the versioned ID is the real one).
//   - Chat: POST /chat/completions, response read
//     choices[0].message.content. Transcription: POST /asr/transcribe
//     (NOT /audio/transcriptions — that path 404s; the batch ASR wire
//     shape is documented on metaTranscribe below).
//   - LATENCY A/B (2026-11-03, Bob's directive): the in-moment default
//     below was switched 1.3 -> "muse-spark-1.2" after live timing
//     showed the 1.3 converse call at ~18-19s (its hidden reasoning
//     dominates the Talk round trip). META_CHAT_MODEL env, when set,
//     still wins over this constant. Revert = restore "muse-spark-1.3".

export const META_API_BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
export const META_CHAT_MODEL = "muse-spark-1.2";
/** Muse Wonder — the weekly deep review only (Day 7). The daily
 * brain stays on Spark; Wonder is the slower, heavier pass over a
 * week's entries. Two-tier model use is deliberate architecture. */
export const META_WONDER_MODEL = "muse-wonder-1.0";
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

// Muse chat completion (Spark by default; Wonder for the weekly
// review). Returns the reply text (possibly empty). The in-moment
// model can be overridden with the META_CHAT_MODEL env var (an
// explicit model argument — the weekly review's Wonder — always
// wins over the env var). Callers may pass a maxTokens cap, but the
// converse routes deliberately do NOT (2026-11-02): Muse Spark
// spends completion tokens on hidden reasoning before any content,
// and a capped call can burn the whole budget reasoning and return
// content: null (finish_reason "length") — the moment route failed
// exactly that way at a 300- and even a 1000-token cap. Uncapped is
// the known-good setting; latency is the model's reasoning time,
// addressed by model choice, not by caps.
export async function metaChat(
  messages: ChatMessage[],
  model?: string,
  opts?: { maxTokens?: number },
): Promise<string> {
  const resolvedModel = model ?? (process.env.META_CHAT_MODEL || META_CHAT_MODEL);
  const send = () =>
    metaFetch("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        temperature: 0.4,
        ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });
  // One retry on a transient upstream failure (2026-11-02): Meta's
  // API intermittently answers 502/503/429 on the hackathon tier,
  // and a single retry after a short pause turns most of those into
  // a slow success instead of a dead turn. Configuration errors
  // (meta_not_configured) and other 4xx are not retried.
  let res: Response;
  try {
    res = await send();
  } catch (err) {
    if (
      err instanceof MetaApiError &&
      (err.status === 429 || err.status >= 500) &&
      err.message !== "meta_not_configured"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      res = await send();
    } else {
      throw err;
    }
  }
  const raw = await res.text();
  let data: { choices?: { message?: { content?: unknown } }[] } = {};
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    // Non-JSON success body — fall through to the bad-response error.
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    // Content-parts shape: join the text parts.
    const joined = content
      .map((p) =>
        p && typeof p === "object" && "text" in p
          ? String((p as { text?: unknown }).text ?? "")
          : "",
      )
      .join("")
      .trim();
    if (joined) return joined;
  }
  // Surface the raw body so a shape mismatch is diagnosable from the
  // /api/converse fallback response instead of failing silently.
  throw new MetaApiError(502, "meta_bad_response", raw.slice(0, 500));
}

// Muse Voice Transcribe, batch endpoint (POST /v1/asr/transcribe).
// Wire shape verified against Meta's API (Day 5 live fix): multipart
// with a `request` JSON part ({mode, model, audioEncoding}) and an
// `audio` part holding MONO 16-bit PCM WAV (16/24 kHz, ≤10 min). The
// browser records webm/opus, so the client converts to WAV before
// upload (TalkClient); this function just forwards. The transcript
// comes back in the response's `transcript` field.
export async function metaTranscribe(
  audio: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    "request",
    JSON.stringify({
      mode: "PUSH_TO_TALK",
      model: META_TRANSCRIBE_MODEL,
      audioEncoding: "WAV",
    }),
  );
  form.append(
    "audio",
    new Blob([audio], { type: mimeType || "audio/wav" }),
    "answer.wav",
  );
  const res = await metaFetch("/asr/transcribe", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { transcript?: unknown };
  return typeof data.transcript === "string" ? data.transcript.trim() : "";
}
