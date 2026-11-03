// Public-route guard for the four model-backed endpoints
// (converse, speak, transcribe, review) — added 2026-11-02 after an
// external review pointed out they were open to anyone with the
// app URL: no origin check, no rate limit, and each call spends
// real Meta/Fish credit.
//
// Two layers, honestly scoped:
// - Origin: a browser call whose Origin host is not this app's own
//   host (or whose Sec-Fetch-Site says cross-site) is refused. This
//   stops OTHER WEBSITES' pages from spending the budget through a
//   visitor's browser. A script can fake these headers, which is
//   what the second layer is for.
// - Rate limit: a per-IP, per-route, per-minute counter. Counters
//   live in the same Upstash KV the companion mailbox uses (one
//   INCR per call, a 70-second expiry set on the first hit); with
//   no KV configured, an in-memory counter stands in — weaker
//   (per-instance), never a hard failure. The companion mailbox
//   routes are deliberately NOT guarded here: the Android app calls
//   them directly and they carry their own credential checks.

const memoryHits = new Map<string, { count: number; resetAt: number }>();

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function kvIncr(key: string): Promise<number | null> {
  const kv = kvConfig();
  if (!kv) return null;
  try {
    const res = await fetch(`${kv.url}/incr/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kv.token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: unknown };
    const n = typeof data.result === "number" ? data.result : null;
    if (n === 1) {
      // First hit in this minute bucket: bound the key's life.
      await fetch(`${kv.url}/expire/${encodeURIComponent(key)}/70`, {
        method: "POST",
        headers: { Authorization: `Bearer ${kv.token}` },
      }).catch(() => {});
    }
    return n;
  } catch {
    return null;
  }
}

async function hitCount(route: string, ip: string): Promise<number> {
  const minute = Math.floor(Date.now() / 60000);
  const key = `pn_rl_v1:${route}:${ip}:${minute}`;
  const kvCount = await kvIncr(key);
  if (kvCount !== null) return kvCount;
  const now = Date.now();
  const entry = memoryHits.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryHits.set(key, { count: 1, resetAt: now + 70000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || "unknown";
}

export function originAllowed(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser callers carry no Origin.
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** Null when the call may proceed; a refusal Response otherwise. */
export async function guardPublicRoute(
  request: Request,
  route: string,
  perMinute: number,
): Promise<Response | null> {
  if (!originAllowed(request)) {
    return Response.json({ error: "forbidden_origin" }, { status: 403 });
  }
  const count = await hitCount(route, clientIp(request));
  if (count > perMinute) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  return null;
}
