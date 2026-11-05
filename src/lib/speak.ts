// Device voice-out, client side (switched 2026-11-04, Bob's call for
// the hackathon submission): every line the second brain speaks is
// spoken by the device's own built-in text-to-speech — the operating
// system / browser voice. That voice is not an AI model and nothing
// leaves the device to render speech; every word is still composed
// live by Muse Spark, exactly as before — only the renderer changed
// (a hosted voice service spoke the lines before this switch).
//
// An intake user picks a neutral voice ("female" | "male") at setup;
// when the device offers a matching voice, that one speaks, otherwise
// the device default does. The founder passes no preference and hears
// the device default. Failures are silent by design — no speech
// support, a blocked utterance, an error: the words are always
// already on screen as text.
//
// The single recorded exception stands: the user's own recorded
// reset line, played by the Talk flow inside the guided reset step,
// is a recording, not synthesized speech.

import type { ProfileVoice } from "./journal";

// Name hints for matching a device voice to the user's neutral-voice
// pick. Device voice catalogs vary widely; this is best-effort and
// the device default is always an acceptable answer.
const FEMALE_HINTS = [
  "female", "zira", "samantha", "victoria", "karen", "moira", "tessa",
  "fiona", "serena", "allison", "ava", "susan", "catherine", "jenny",
  "aria", "emma", "joanna", "salli", "kimberly", "amy", "nicky",
];
const MALE_HINTS = [
  "male", "david", "daniel", "alex", "fred", "george", "arthur",
  "brian", "christopher", "eric", "guy", "matthew", "justin", "joey",
  "ryan", "brandon",
];

function pickDeviceVoice(pref?: ProfileVoice): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis?.getVoices() ?? [];
    if (!voices.length) return null;
    const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
    const pool = en.length ? en : voices;
    if (pref) {
      const hints = pref === "female" ? FEMALE_HINTS : MALE_HINTS;
      const match = pool.find((v) =>
        hints.some((h) => v.name.toLowerCase().includes(h)),
      );
      if (match) return match;
    }
    return pool.find((v) => v.default) ?? pool[0] ?? null;
  } catch {
    return null;
  }
}

// Device voices often load after the first getVoices() call; warming
// the catalog when it changes keeps the pick accurate later.
try {
  window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
    try {
      window.speechSynthesis.getVoices();
    } catch {
      // Catalog stays whatever it was.
    }
  });
} catch {
  // No speech support — every call below fails silent.
}

// Speak one chunk of text with the device voice. Resolves true when
// the chunk was spoken (or a safety timeout let a stuck utterance
// go), false when speech is unavailable or the utterance errored —
// callers use the boolean only to decide whether THEIR fallback
// should cover the chunk.
function speakWithDevice(text: string, pref?: ProfileVoice): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve(false);
      const line = text.trim();
      if (!line) return resolve(false);
      const u = new SpeechSynthesisUtterance(line);
      const voice = pickDeviceVoice(pref);
      if (voice) u.voice = voice;
      u.rate = 0.98;
      let done = false;
      const finish = (ok: boolean) => {
        if (!done) {
          done = true;
          resolve(ok);
        }
      };
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      synth.speak(u);
      // Never let a stuck utterance hang a caller.
      setTimeout(() => finish(true), Math.max(3000, line.length * 95));
    } catch {
      resolve(false);
    }
  });
}

export async function speakLine(text: string, voice?: ProfileVoice): Promise<void> {
  await speakWithDevice(text, voice);
}

// The same device speech as speakLine, but it reports whether the
// line was actually spoken. Talk It Through uses this for every
// dynamic line: it needs to know the question is done before it
// starts listening for the answer, and its fallback chain may drop
// to its own phone-voice path only when this spoke nothing.
export async function speakLineChecked(
  text: string,
  voice?: ProfileVoice,
): Promise<boolean> {
  return speakWithDevice(text, voice);
}

// ---------- chunked speech ----------
//
// A brain line is split into sentence chunks (first sentence solo,
// the rest packed at sentence boundaries up to ~280 chars) and the
// chunks are spoken in order, so a long reply starts talking with
// its first sentence instead of after the whole line. A new line —
// or cancel() — supersedes the queue cleanly: the device speech is
// cancelled and no fallback fires for a cancelled chunk. Guided-
// action steps do NOT use this — they pace by design through
// speakLineChecked/speakAloud exactly as before.

// Split a line into chunks at sentence boundaries. A sentence is
// never split mid-way unless that single sentence alone exceeds the
// cap; then it is cut at a ". " boundary where possible, else the cap.
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

export interface SpeechPipeline {
  // Speak one line, chunk by chunk in order. Resolves when the line
  // has finished (or was superseded/cancelled).
  speak: (text: string, voice?: ProfileVoice) => Promise<void>;
  // Stop the current line and drop its queue. Never triggers the
  // fallback.
  cancel: () => void;
}

export function createSpeechPipeline(opts: {
  fallback: (chunk: string) => Promise<void>;
}): SpeechPipeline {
  let generation = 0;

  function stopDeviceSpeech() {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Nothing to stop.
    }
  }

  async function speak(text: string, voice?: ProfileVoice): Promise<void> {
    const gen = ++generation;
    stopDeviceSpeech();
    const chunks = splitSentences(text);
    for (const chunk of chunks) {
      if (gen !== generation) return;
      const ok = await speakWithDevice(chunk, voice);
      if (gen !== generation) return;
      if (!ok) {
        // The device voice spoke nothing for this chunk — the
        // caller's fallback covers it, the same per-chunk rule as
        // speakAloud.
        await opts.fallback(chunk);
        if (gen !== generation) return;
      }
    }
  }

  function cancel() {
    generation++;
    stopDeviceSpeech();
  }

  return { speak, cancel };
}
