// Browser speech recognition for spoken answers (latency build,
// 2026-10-31). Where the platform offers the Web Speech API
// (SpeechRecognition / webkitSpeechRecognition), it is the primary
// answer path: the transcript arrives with the platform's own
// endpointing instead of after a record → convert → upload → batch
// ASR round trip. The WAV → /api/transcribe path stays as the
// fallback wherever recognition is unavailable or errors.
//
// Discipline: interimResults is always off and only FINAL results
// are ever returned — an interim hypothesis can never leak into a
// stored transcript. Outcomes are kept distinct because callers
// treat them differently: "heard" (a usable final transcript),
// "no-speech" (the recognizer ended, or timed out, with nothing
// heard — on an auto-opened mic this closes quietly instead of
// hanging), "error" (the platform refused or failed — callers fall
// back to the recorder path), and "aborted" (the caller stopped it
// on purpose, e.g. the type-instead escape).

export type RecognitionOutcome =
  | { status: "heard"; text: string }
  | { status: "no-speech" }
  | { status: "error" }
  | { status: "aborted" };

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  isFinal?: boolean;
  [index: number]: SpeechRecognitionAlternativeLike | boolean | undefined;
}

interface SpeechRecognitionResultListLike {
  length?: number;
  [index: number]: SpeechRecognitionResultLike | undefined;
}

interface SpeechRecognitionEventLike {
  results?: SpeechRecognitionResultListLike;
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionAvailable(): boolean {
  return typeof window !== "undefined" && speechRecognitionCtor() !== null;
}

// Hear one answer via the browser's recognizer. registerAbort hands
// the caller a stop function (the type-instead escape); aborting
// resolves with { status: "aborted" } once the recognizer stops.
export function recognizeOnce(opts?: {
  timeoutMs?: number;
  registerAbort?: (abort: () => void) => void;
}): Promise<RecognitionOutcome> {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return Promise.resolve({ status: "error" });
  return new Promise((resolve) => {
    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      resolve({ status: "error" });
      return;
    }
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let settled = false;
    let timer: number | null = null;
    const finish = (outcome: RecognitionOutcome) => {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      try {
        rec.stop();
      } catch {
        // Already stopped.
      }
      resolve(outcome);
    };
    opts?.registerAbort?.(() => finish({ status: "aborted" }));
    rec.onresult = (e) => {
      const results = e.results;
      if (!results) return;
      let text = "";
      const count = results.length ?? 0;
      for (let i = 0; i < count; i++) {
        const result = results[i];
        if (!result) continue;
        // Finals only — an interim result is never a transcript.
        if (result.isFinal === false) continue;
        const alt = result[0] as SpeechRecognitionAlternativeLike | undefined;
        if (alt?.transcript) text += alt.transcript;
      }
      const trimmed = text.trim();
      if (trimmed) finish({ status: "heard", text: trimmed });
    };
    rec.onerror = (e) => {
      // Chrome reports silence as a "no-speech" error — that is a
      // quiet outcome, not a platform failure.
      if (e.error === "no-speech" || e.error === "aborted") {
        finish({ status: "no-speech" });
      } else {
        finish({ status: "error" });
      }
    };
    rec.onend = () => finish({ status: "no-speech" });
    timer = window.setTimeout(
      () => finish({ status: "no-speech" }),
      opts?.timeoutMs ?? 20000,
    );
    try {
      rec.start();
    } catch {
      finish({ status: "error" });
    }
  });
}
