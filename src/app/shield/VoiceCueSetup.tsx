"use client";

import { useEffect, useRef, useState } from "react";
import { deleteCue, getCue, saveCue } from "@/lib/journal";

// The locked cue scripts (Second Brain + Voice Brief, adopted 2026-10-27,
// Bob's lock 2026-10-28). A is the editable default suggestion — every
// user's scene differs, so the words are theirs to change before recording.
const SCRIPT_A =
  "Okay — couch, TV on. I want to feel good tomorrow morning — that's my why. Is this hunger, or the movie?";
const SCRIPT_C = "I'm in it right now. I want to be kind to myself tomorrow. Hunger, or habit?";

function scriptB(whyLine: string): string {
  const why = whyLine.trim() || "I want to feel good tomorrow morning";
  return `This is one of my tricky times. My why is: ${why}. What do I actually need right now?`;
}

const MAX_SECONDS = 15;

type CueState = "loading" | "empty" | "recording" | "saved" | "unsupported" | "denied";

export default function VoiceCueSetup({ whyLine }: { whyLine: string }) {
  const [state, setState] = useState<CueState>("loading");
  const [script, setScript] = useState(SCRIPT_A);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

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
    let live = true;
    getCue()
      .then((cue) => {
        if (!live) return;
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
        if (live) setState("empty");
      });
    return () => {
      live = false;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          try {
            await saveCue(blob);
          } catch {
            // Preview still works this session even if storage failed.
          }
          setUrl(URL.createObjectURL(blob));
          setState("saved");
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
      await deleteCue();
    } catch {
      // Already gone is fine.
    }
    setUrl(null);
    setState("empty");
  }

  const chipClass =
    "rounded-full border border-stone-300 bg-white px-3 py-1 text-sm font-medium text-stone-700 transition hover:border-[#2f5d3a] hover:text-[#2f5d3a]";

  return (
    <div>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        This is the voice that reaches you in a moment. Pick what sounds most like you on a good day.
        On this device only — it never leaves your phone.
      </p>

      {state === "loading" && <p className="mt-4 text-stone-600">Checking for a saved cue…</p>}

      {state === "unsupported" && (
        <p className="mt-4 leading-relaxed text-stone-600">
          This browser can&apos;t record audio, so the cue can&apos;t be set up here. The app works fine
          without one — recording is calm-time setup, and you can add it later from a browser that
          supports it.
        </p>
      )}

      {state === "denied" && (
        <div className="mt-4">
          <p className="leading-relaxed text-stone-600">
            The microphone is off for this site, so nothing was recorded. You can allow it in your
            browser&apos;s site settings and try again — or skip the cue entirely. The app works fine
            without one.
          </p>
          <button type="button" className={`${chipClass} mt-3`} onClick={() => setState("empty")}>
            Try again
          </button>
        </div>
      )}

      {(state === "empty" || state === "recording" || state === "saved") && (
        <>
          <label className="mt-4 block text-sm font-medium text-stone-700" htmlFor="cue-script">
            Words to say — edit them first. Your scene is yours.
          </label>
          <textarea
            id="cue-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={3}
            maxLength={300}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={chipClass} onClick={() => setScript(SCRIPT_A)}>
              Starter words
            </button>
            <button type="button" className={chipClass} onClick={() => setScript(scriptB(whyLine))}>
              Say it with my why
            </button>
            <button type="button" className={chipClass} onClick={() => setScript(SCRIPT_C)}>
              Softer version
            </button>
          </div>

          {state === "empty" && (
            <div className="mt-5">
              <button
                type="button"
                onClick={startRecording}
                className="rounded-full bg-[#2f5d3a] px-6 py-3 font-semibold text-white transition hover:bg-[#274c30]"
              >
                ● Record my cue
              </button>
              <p className="mt-2 text-sm text-stone-600">
                About 10 seconds, in a normal voice, like you&apos;re talking yourself through it.
              </p>
            </div>
          )}

          {state === "recording" && (
            <div className="mt-5">
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-full bg-[#9a3b26] px-6 py-3 font-semibold text-white transition hover:bg-[#7f3120]"
              >
                ■ Stop — {Math.min(Math.floor(elapsed), MAX_SECONDS)}s
              </button>
              <p className="mt-2 text-sm text-stone-600" aria-live="polite">
                Recording… read your words out loud. Stops on its own at {MAX_SECONDS} seconds.
              </p>
            </div>
          )}

          {state === "saved" && previewUrl && (
            <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="font-medium text-stone-900">Your cue is saved on this device.</p>
              <audio controls src={previewUrl} className="mt-3 w-full">
                Your browser can&apos;t play the cue back here.
              </audio>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={chipClass} onClick={() => setState("empty")}>
                  Re-record
                </button>
                <button type="button" className={chipClass} onClick={removeCue}>
                  Delete cue
                </button>
              </div>
              <p className="mt-2 text-sm text-stone-600">
                Re-recording replaces the saved cue when you stop. This is the voice that plays when
                you tap SOS.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
