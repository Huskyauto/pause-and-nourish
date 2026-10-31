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
//
// The grace window (graceMs, passed by auto-listen callers): the
// platform recognizer has its OWN no-speech timeout — a few seconds
// of silence and it ends the session with a "no-speech" error, long
// before any caller-side bound. Bob's run-through (2026-10-31)
// showed what that feels like: the mic opened, he didn't start
// talking instantly, the recognizer gave up, and the turn parked on
// tap-to-answer. So inside a grace window a quiet attempt end — a
// "no-speech" error, an "aborted" error the caller didn't cause,
// or a bare onend — is not an outcome: recognition calmly restarts
// and the wait continues. Only the grace deadline itself settles
// "no-speech". Genuine platform errors settle "error" at once,
// inside or outside the window; no-speech never marks recognition
// broken, here or in the callers.

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

// Pause between recognition attempts inside a grace window — long
// enough to not spin against a platform that ends attempts fast,
// short enough that the user never notices a gap in listening.
const GRACE_RESTART_DELAY_MS = 200;

// Hear one answer via the browser's recognizer. registerAbort hands
// the caller a stop function (the type-instead escape); aborting
// resolves with { status: "aborted" } once the recognizer stops.
// With graceMs set, quiet attempt ends restart recognition until
// the grace deadline (see the header note); without it, the first
// attempt end settles the outcome, bounded by timeoutMs.
export function recognizeOnce(opts?: {
  timeoutMs?: number;
  graceMs?: number;
  registerAbort?: (abort: () => void) => void;
}): Promise<RecognitionOutcome> {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return Promise.resolve({ status: "error" });
  const RecognitionCtor: new () => SpeechRecognitionLike = Ctor;
  return new Promise((resolve) => {
    const graceMs = opts?.graceMs;
    const deadline = Date.now() + (graceMs ?? opts?.timeoutMs ?? 20000);
    let settled = false;
    let callerAborted = false;
    let rec: SpeechRecognitionLike | null = null;
    let masterTimer: number | null = null;
    let restartTimer: number | null = null;
    const finish = (outcome: RecognitionOutcome) => {
      if (settled) return;
      settled = true;
      if (masterTimer !== null) window.clearTimeout(masterTimer);
      if (restartTimer !== null) window.clearTimeout(restartTimer);
      if (rec) {
        try {
          rec.stop();
        } catch {
          // Already stopped.
        }
      }
      resolve(outcome);
    };
    opts?.registerAbort?.(() => {
      callerAborted = true;
      finish({ status: "aborted" });
    });
    // One attempt ended without hearing anything and without a
    // genuine failure. Inside a grace window that is not an outcome
    // yet — recognition restarts and the wait goes on. Outside one
    // (or once the deadline has passed) it settles "no-speech".
    const attemptEndedQuietly = () => {
      if (settled || callerAborted) return;
      if (graceMs === undefined || Date.now() >= deadline) {
        finish({ status: "no-speech" });
        return;
      }
      restartTimer = window.setTimeout(() => {
        restartTimer = null;
        startAttempt();
      }, GRACE_RESTART_DELAY_MS);
    };
    function startAttempt() {
      if (settled || callerAborted) return;
      let attempt: SpeechRecognitionLike;
      try {
        attempt = new RecognitionCtor();
      } catch {
        finish({ status: "error" });
        return;
      }
      rec = attempt;
      attempt.lang = "en-US";
      attempt.interimResults = false;
      attempt.continuous = false;
      attempt.maxAlternatives = 1;
      // Chrome fires onerror AND onend for a single quiet end; only
      // the first of the pair may count it.
      let attemptOver = false;
      const quietEnd = () => {
        if (attemptOver) return;
        attemptOver = true;
        attemptEndedQuietly();
      };
      attempt.onresult = (e) => {
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
      attempt.onerror = (e) => {
        // Chrome reports silence as a "no-speech" error, and an
        // "aborted" error can arrive from the platform ending an
        // attempt on its own — both are quiet ends, not platform
        // failures. (The caller's own abort resolves "aborted" via
        // registerAbort above, before any of this runs.)
        if (e.error === "no-speech" || e.error === "aborted") {
          quietEnd();
        } else {
          finish({ status: "error" });
        }
      };
      attempt.onend = () => quietEnd();
      try {
        attempt.start();
      } catch {
        finish({ status: "error" });
      }
    }
    masterTimer = window.setTimeout(
      () => finish({ status: "no-speech" }),
      Math.max(0, deadline - Date.now()),
    );
    startAttempt();
  });
}
