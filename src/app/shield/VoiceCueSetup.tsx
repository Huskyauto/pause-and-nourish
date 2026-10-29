"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  deleteCue,
  getCue,
  saveCue,
  syncVoiceChoiceAfterCueDelete,
  syncVoiceChoiceAfterCueSave,
  type CueKind,
} from "@/lib/journal";

// The locked cue scripts (Second Brain + Voice Brief, adopted 2026-10-27,
// Bob's lock 2026-10-28). A is the editable default suggestion — every
// user's scene differs, so the words are theirs to change before recording.
export const SCRIPT_A =
  "Okay — couch, TV on. I want to feel good tomorrow morning — that's my why. Is this hunger, or the movie?";
const SCRIPT_C = "I'm in it right now. I want to be kind to myself tomorrow. Hunger, or habit?";

// Day 4: the reset line's editable default script (Day 4 spec v2.0 §2.4).
const RESET_DEFAULT = "Okay, that happened. I'm okay. Next meal as normal.";

function scriptB(whyLine: string): string {
  const why = whyLine.trim() || "I want to feel good tomorrow morning";
  return `This is one of my tricky times. My why is: ${why}. What do I actually need right now?`;
}

const MAX_SECONDS = 15;

type CueState = "loading" | "empty" | "recording" | "saved" | "unsupported" | "denied";

interface SlotCopy {
  intro: string;
  scriptLabel: string;
  recordLabel: string;
  recordHint: string;
  savedMessage: string;
  savedFootnote: string;
  deleteLabel: string;
}

// One recording slot (Day 3 cue / Day 4 reset line). Same mechanics and
// storage discipline for both; only the words and the `kind` differ.
export function RecordingSlot({
  kind,
  initialScript,
  copy,
  scriptExtras,
  variant = "full",
  onSavedChange,
}: {
  kind: CueKind;
  initialScript: string;
  copy: SlotCopy;
  scriptExtras?: (setScript: (s: string) => void) => ReactNode;
  // "simple" = the voice-first home variant: no script editing — the words
  // show as a read-along example and the one record button is the page.
  variant?: "full" | "simple";
  // Fires when the stored state becomes known ("load"), after a
  // successful save ("save"), and after a delete ("delete"). Never on a
  // bare re-record tap — the old recording still exists in storage until
  // a new one replaces it.
  onSavedChange?: (has: boolean, reason: "load" | "save" | "delete") => void;
}) {
  // The simple variant starts at "empty" so the one-button first-run state
  // is the page from first paint; the load below still corrects it to
  // "saved" / "unsupported" the moment storage answers.
  const [state, setState] = useState<CueState>(variant === "simple" ? "empty" : "loading");
  const [script, setScript] = useState(initialScript);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const savedChangeRef = useRef(onSavedChange);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);

  function setUrl(url: string | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    setPreviewUrl(url);
  }

  useEffect(() => {
    savedChangeRef.current = onSavedChange;
  }, [onSavedChange]);

  useEffect(() => {
    let live = true;
    getCue(kind)
      .then((cue) => {
        if (!live) return;
        savedChangeRef.current?.(!!cue, "load");
        if (cue) {
          setUrl(URL.createObjectURL(cue.blob));
          setState("saved");
        } else {
          const canRecord =
            typeof MediaRecorder !== "undefined" &&
            !!navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === "function";
          setState(canRecord ? "empty" : "unsupported");
        }
      })
      .catch(() => {
        if (live) {
          savedChangeRef.current?.(false, "load");
          setState("empty");
        }
      });
    return () => {
      live = false;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) {
          let stored = false;
          try {
            await saveCue(blob, kind);
            stored = true;
          } catch {
            // Preview still works this session even if storage failed.
          }
          // Saving the moment cue is choosing your own voice — keep the
          // stored choice in step, wherever the recording happened.
          if (stored && kind === "cue") await syncVoiceChoiceAfterCueSave();
          setUrl(URL.createObjectURL(blob));
          setState("saved");
          if (stored) savedChangeRef.current?.(true, "save");
        } else {
          setState("empty");
        }
      };
      recorder.start();
      setElapsed(0);
      setState("recording");
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const secs = (Date.now() - startedAt) / 1000;
        setElapsed(secs);
        if (secs >= MAX_SECONDS) stopRecording();
      }, 200);
    } catch {
      setState("denied");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  async function removeCue() {
    try {
      await deleteCue(kind);
    } catch {
      // Already gone is fine.
    }
    // No recording left — an "own voice" choice must not dangle.
    if (kind === "cue") await syncVoiceChoiceAfterCueDelete();
    setUrl(null);
    setState("empty");
    savedChangeRef.current?.(false, "delete");
  }

  const chipClass =
    "rounded-full border border-stone-300 bg-white px-3 py-1 text-sm font-medium text-stone-700 transition hover:border-[#2f5d3a] hover:text-[#2f5d3a]";
  const scriptId = `script-${kind}`;
  const recordBtnClass =
    variant === "simple"
      ? "w-full rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
      : "rounded-full bg-[#2f5d3a] px-6 py-3 font-semibold text-white transition hover:bg-[#274c30]";
  const stopBtnClass =
    variant === "simple"
      ? "w-full rounded-full bg-[#9a3b26] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#7f3120]"
      : "rounded-full bg-[#9a3b26] px-6 py-3 font-semibold text-white transition hover:bg-[#7f3120]";

  return (
    <div>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">{copy.intro}</p>

      {state === "loading" && <p className="mt-4 text-stone-600">Checking for a saved recording…</p>}

      {state === "unsupported" && (
        <p className="mt-4 leading-relaxed text-stone-600">
          This browser can&apos;t record audio, so this can&apos;t be set up here. The app works fine
          without one — recording is calm-time setup, and you can add it later from a browser that
          supports it.
        </p>
      )}

      {state === "denied" && (
        <div className="mt-4">
          <p className="leading-relaxed text-stone-600">
            The microphone is off for this site, so nothing was recorded. You can allow it in your
            browser&apos;s site settings and try again — or skip this entirely. The app works fine
            without one.
          </p>
          <button type="button" className={`${chipClass} mt-3`} onClick={() => setState("empty")}>
            Try again
          </button>
        </div>
      )}

      {(state === "empty" || state === "recording" || state === "saved") && (
        <>
          {variant === "full" && (
            <>
              <label className="mt-4 block text-sm font-medium text-stone-700" htmlFor={scriptId}>
                {copy.scriptLabel}
              </label>
              <textarea
                id={scriptId}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={3}
                maxLength={300}
                className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
              />
              {scriptExtras && <div className="mt-2 flex flex-wrap gap-2">{scriptExtras(setScript)}</div>}
            </>
          )}
          {variant === "simple" && (
            <figure className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <figcaption className="text-sm font-medium text-stone-600">
                You can read this, word for word:
              </figcaption>
              <blockquote className="mt-2 leading-relaxed text-stone-900">
                &ldquo;{script}&rdquo;
              </blockquote>
            </figure>
          )}

          {state === "empty" && (
            <div className="mt-5">
              <button type="button" onClick={startRecording} className={recordBtnClass}>
                {copy.recordLabel}
              </button>
              <p className="mt-2 text-sm text-stone-600">{copy.recordHint}</p>
            </div>
          )}

          {state === "recording" && (
            <div className="mt-5">
              <button type="button" onClick={stopRecording} className={stopBtnClass}>
                ■ Stop — {Math.min(Math.floor(elapsed), MAX_SECONDS)}s
              </button>
              <p className="mt-2 text-sm text-stone-600" aria-live="polite">
                Recording… read your words out loud. Stops on its own at {MAX_SECONDS} seconds.
              </p>
            </div>
          )}

          {state === "saved" && previewUrl && (
            <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="font-medium text-stone-900">{copy.savedMessage}</p>
              <audio controls src={previewUrl} className="mt-3 w-full">
                Your browser can&apos;t play this back here.
              </audio>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={chipClass} onClick={() => setState("empty")}>
                  Re-record
                </button>
                <button type="button" className={chipClass} onClick={removeCue}>
                  {copy.deleteLabel}
                </button>
              </div>
              <p className="mt-2 text-sm text-stone-600">{copy.savedFootnote}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const chipClass =
  "rounded-full border border-stone-300 bg-white px-3 py-1 text-sm font-medium text-stone-700 transition hover:border-[#2f5d3a] hover:text-[#2f5d3a]";

export default function VoiceCueSetup({
  whyLine,
  onSavedChange,
}: {
  whyLine: string;
  onSavedChange?: (has: boolean, reason: "load" | "save" | "delete") => void;
}) {
  return (
    <RecordingSlot
      kind="cue"
      onSavedChange={onSavedChange}
      initialScript={SCRIPT_A}
      copy={{
        intro:
          "This is the voice that reaches you in a moment. Pick what sounds most like you on a good day. On this device only — it never leaves your phone.",
        scriptLabel: "Words to say — edit them first. Your scene is yours.",
        recordLabel: "● Record my cue",
        recordHint: "About 10 seconds, in a normal voice, like you're talking yourself through it.",
        savedMessage: "Your cue is saved on this device.",
        savedFootnote:
          "Re-recording replaces the saved cue when you stop. This is the voice that plays when you tap SOS.",
        deleteLabel: "Delete cue",
      }}
      scriptExtras={(setScript) => (
        <>
          <button type="button" className={chipClass} onClick={() => setScript(SCRIPT_A)}>
            Starter words
          </button>
          <button type="button" className={chipClass} onClick={() => setScript(scriptB(whyLine))}>
            Say it with my why
          </button>
          <button type="button" className={chipClass} onClick={() => setScript(SCRIPT_C)}>
            Softer version
          </button>
        </>
      )}
    />
  );
}

export function ResetLineSetup() {
  return (
    <RecordingSlot
      kind="reset"
      initialScript={RESET_DEFAULT}
      copy={{
        intro:
          "A second, shorter recording — for right after you eat. It plays on the checkpoint screen, in your own voice. On this device only.",
        scriptLabel: "Words to say — edit them first.",
        recordLabel: "● Record my reset line",
        recordHint: "About 5 seconds is plenty — short is the point here.",
        savedMessage: "Your reset line is saved on this device.",
        savedFootnote:
          "Re-recording replaces the saved reset line when you stop. It plays after you choose to eat.",
        deleteLabel: "Delete reset line",
      }}
    />
  );
}
