// Fish voice-out, client side (2026-10-29): the one shared way to ask
// /api/speak to say a line and play what comes back. For the founder
// that's his own cloned voice; an intake user passes their chosen
// neutral voice ("female" | "male") and the server speaks in that
// stock voice instead (Bob's ruling, 2026-10-31) — the founder's clone
// is never lent to another user. Omitting the voice = the founder
// path, exactly as before. Deliberately quiet in both directions — Fish credits are
// metered, so the SOS and pause flows fire this at most once per flow,
// and every failure (network, key not configured yet, Fish error,
// blocked autoplay) is silent. The words are always already on screen
// as text; the generated voice is a supplement to the user's own
// recordings, never the only channel and never a replacement for them.
// The Talk It Through conversation is the exception to the once-per-
// flow discipline: by Bob's directive (2026-10-30) its automatic voice
// IS the Fish voice, spoken line by line via speakLineChecked below —
// the user's recordings still outrank it there too.

import type { ProfileVoice } from "./journal";

export async function speakLine(text: string, voice?: ProfileVoice): Promise<void> {
  const line = text.trim();
  if (!line) return;
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voice ? { text: line, voice } : { text: line }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    await audio.play().catch(() => URL.revokeObjectURL(url));
  } catch {
    // Silent by design — see header.
  }
}

// The same Fish call as speakLine, but it waits until the line has
// actually finished playing and reports whether Fish spoke it. Talk
// It Through uses this for every dynamic line: it needs to know the
// question is done before it starts listening for the answer, and its
// fallback chain may drop to the phone voice only when Fish itself
// failed. Failures are still silent — the boolean is the only signal.
export async function speakLineChecked(text: string, voice?: ProfileVoice): Promise<boolean> {
  const line = text.trim();
  if (!line) return false;
  let res: Response;
  try {
    res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voice ? { text: line, voice } : { text: line }),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  try {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return await new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      let done = false;
      const finish = (ok: boolean) => {
        if (!done) {
          done = true;
          URL.revokeObjectURL(url);
          resolve(ok);
        }
      };
      audio.addEventListener("ended", () => finish(true), { once: true });
      audio.addEventListener("error", () => finish(false), { once: true });
      audio.play().catch(() => finish(false));
      // A generated line is well under a minute; never hang a caller.
      setTimeout(() => finish(true), 60000);
    });
  } catch {
    return false;
  }
}
