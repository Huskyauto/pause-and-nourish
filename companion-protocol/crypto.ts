// WebCrypto-only primitives for the companion protocol.
//
// The module's core promise is digest-only storage: pairing secrets,
// exchange codes, and credential tokens are hashed with SHA-256 the
// moment they exist, and only the hex digest is ever written to a
// store. The raw values live in memory (and, for the token, on the
// companion) — never in a persisted record. The test suite serializes
// the store after every ceremony step and greps for the raw values to
// prove it.

const subtle = globalThis.crypto.subtle;

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

const B64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64URL_ALPHABET[a >> 2];
    out += B64URL_ALPHABET[((a & 0x03) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) out += B64URL_ALPHABET[((b & 0x0f) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) out += B64URL_ALPHABET[c & 0x3f];
  }
  return out;
}

/** A high-entropy random token/secret: prefix + 256 bits, base64url. */
export function generateSecret(prefix: string): string {
  return `${prefix}${base64UrlEncode(randomBytes(32))}`;
}

// Unambiguous alphabet for the human-readable exchange code — no
// 0/O, 1/I/L, so a code read off a screen or spoken aloud survives.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A short single-consume exchange code, e.g. "K7QX-4MZD". */
export function generateExchangeCode(): string {
  const bytes = randomBytes(8);
  let raw = "";
  for (const b of bytes) raw += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Codes compare without the dash and without case. */
export function normalizeExchangeCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison for digests (equal-length hex strings). */
export function digestsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
