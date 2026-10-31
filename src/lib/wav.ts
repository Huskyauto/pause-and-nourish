// Recorded-audio → WAV conversion for the /api/transcribe path.
//
// Meta's batch ASR endpoint only accepts mono 16-bit PCM WAV, so a
// recorded blob (webm/opus from MediaRecorder) is decoded, downmixed,
// resampled to 16 kHz, and re-encoded as WAV in the browser before
// upload. This is the same conversion the talk flow runs (its copy
// lives in TalkClient); it is factored here for calm-time dictation —
// the story intake's "say it instead" capture — where a recording is
// longer and manually started/stopped rather than endpointed.

export async function blobToWav(blob: Blob): Promise<Blob | null> {
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    void ctx.close();
    const targetRate = 16000;
    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frames, targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    out.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true); // PCM
    out.setUint16(22, 1, true); // mono
    out.setUint32(24, targetRate, true);
    out.setUint32(28, targetRate * 2, true);
    out.setUint16(32, 2, true);
    out.setUint16(34, 16, true);
    writeStr(36, "data");
    out.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      out.setInt16(44 + i * 2, s * (s < 0 ? 0x8000 : 0x7fff), true);
    }
    return new Blob([out.buffer], { type: "audio/wav" });
  } catch {
    return null;
  }
}

// Transcribe one recorded blob via /api/transcribe. Returns the heard
// words, or null when nothing usable came back (no key yet, upstream
// failure, empty transcript) — the caller keeps typing as the floor
// and says so in plain words.
export async function transcribeBlob(blob: Blob): Promise<string | null> {
  const wav = await blobToWav(blob);
  if (!wav) return null;
  try {
    const form = new FormData();
    form.append("audio", wav, "dictation.wav");
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: unknown };
    return typeof data.text === "string" && data.text.trim() ? data.text.trim() : null;
  } catch {
    return null;
  }
}
