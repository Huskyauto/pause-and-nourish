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

// ---------- pipelined speech (latency build, 2026-10-31) ----------
//
// A brain line used to be spoken as ONE /api/speak call: Fish
// generated the whole line, the client downloaded the whole MP3,
// and only then did the first sound play — the full generation time
// of every sentence sat in front of the first word. The pipeline
// below splits a line into sentences, requests the first sentence
// immediately, starts playback the moment ITS audio lands, and
// fetches the next sentence while the current one plays (fetch-
// ahead of one, so a cancelled line wastes at most one extra
// sentence of Fish credit). A new line — or cancel() — supersedes
// the queue cleanly: in-flight fetches are discarded, the playing
// audio stops, and no fallback fires for a cancelled chunk.
//
// The standing rules are unchanged: Fish first for every chunk,
// the phone's voice (the caller's fallback) only for a chunk Fish
// itself failed to speak, and the user's voice selection (founder
// clone / chosen neutral stock voice) passed through on every call.
// Guided-action steps do NOT use this — they pace by design through
// speakLineChecked/speakAloud exactly as before.

// Split a line into pipeline chunks. Chunk boundaries (refined
// 2026-10-31, Fish credit discipline): the FIRST sentence ships
// solo — its audio is the latency win, the first sound the user
// hears — and everything after it is packed greedily at sentence
// boundaries into chunks of at most ~280 chars (the same cap the
// app's other chunking uses), so a three-sentence line costs two
// Fish calls, not three. A sentence is never split mid-way unless
// that single sentence alone exceeds the cap; then it is cut the
// way the old chunker cut it (prefer a ". " boundary, else the cap).
export function splitSentences(text: string): string[] {
  const line = text.trim();
  if (!line) return [];
  const sentences: string[] = [];
  const re = /[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const s = m[0].trim();
    if (s) sentences.push(s);
  }
  if (!sentences.length) sentences.push(line);
  // Break any single over-cap sentence into ≤280-char pieces.
  const pieces: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > 280) {
      const cut = rest.lastIndexOf(". ", 280);
      const idx = cut > 60 ? cut + 1 : 280;
      pieces.push(rest.slice(0, idx).trim());
      rest = rest.slice(idx).trim();
    }
    if (rest) pieces.push(rest);
  }
  if (pieces.length <= 1) return pieces;
  // First piece solo; pack the remainder at piece boundaries.
  const chunks: string[] = [pieces[0]];
  let current = "";
  for (const piece of pieces.slice(1)) {
    if (!current) {
      current = piece;
    } else if (current.length + 1 + piece.length <= 280) {
      current = `${current} ${piece}`;
    } else {
      chunks.push(current);
      current = piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function fetchChunkAudio(text: string, voice?: ProfileVoice): Promise<string | null> {
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voice ? { text, voice } : { text }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export interface SpeechPipeline {
  // Speak one line, pipelined sentence by sentence. Resolves when
  // the line has finished (or was superseded/cancelled).
  speak: (text: string, voice?: ProfileVoice) => Promise<void>;
  // Stop the current line and drop its queue. Never triggers the
  // phone-voice fallback.
  cancel: () => void;
}

export function createSpeechPipeline(opts: {
  fallback: (chunk: string) => Promise<void>;
}): SpeechPipeline {
  let generation = 0;
  let currentAudio: HTMLAudioElement | null = null;
  let interruptPlay: (() => void) | null = null;

  function stopCurrent() {
    if (interruptPlay) {
      const f = interruptPlay;
      interruptPlay = null;
      f();
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        // Already stopped.
      }
      currentAudio = null;
    }
  }

  function playUrl(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      currentAudio = audio;
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        interruptPlay = null;
        if (currentAudio === audio) currentAudio = null;
        URL.revokeObjectURL(url);
        resolve(ok);
      };
      interruptPlay = () => finish(false);
      audio.addEventListener("ended", () => finish(true), { once: true });
      audio.addEventListener("error", () => finish(false), { once: true });
      audio.play().catch(() => finish(false));
      // A generated sentence is seconds long; never hang a caller.
      setTimeout(() => finish(true), 60000);
    });
  }

  async function speak(text: string, voice?: ProfileVoice): Promise<void> {
    const gen = ++generation;
    stopCurrent();
    const chunks = splitSentences(text);
    let pending: Promise<string | null> | null = null;
    for (let i = 0; i < chunks.length; i++) {
      if (gen !== generation) return;
      const thisFetch = pending ?? fetchChunkAudio(chunks[i], voice);
      pending = i + 1 < chunks.length ? fetchChunkAudio(chunks[i + 1], voice) : null;
      if (pending) {
        // If this line is superseded before the ahead-fetch is
        // consumed, don't leak its blob URL.
        const ahead = pending;
        void ahead.then((u) => {
          if (gen !== generation && u) URL.revokeObjectURL(u);
        });
      }
      const url = await thisFetch;
      if (gen !== generation) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (!url) {
        // Fish failed this chunk — the phone voice speaks it, the
        // same per-chunk fallback rule as speakAloud.
        await opts.fallback(chunks[i]);
        continue;
      }
      const ok = await playUrl(url);
      if (gen !== generation) return;
      if (!ok) await opts.fallback(chunks[i]);
    }
  }

  function cancel() {
    generation++;
    stopCurrent();
  }

  return { speak, cancel };
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
