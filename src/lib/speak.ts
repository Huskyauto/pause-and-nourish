// Fish voice-out, client side (2026-10-29): the one shared way to ask
// /api/speak to say a line in the user's own cloned voice and play what
// comes back. Deliberately quiet in both directions — Fish credits are
// metered, so callers fire this at most once per flow, and every failure
// (network, key not configured yet, Fish error, blocked autoplay) is
// silent. The words are always already on screen as text; the generated
// voice is a supplement to the user's own recordings, never the only
// channel and never a replacement for them.

export async function speakLine(text: string): Promise<void> {
  const line = text.trim();
  if (!line) return;
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: line }),
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
