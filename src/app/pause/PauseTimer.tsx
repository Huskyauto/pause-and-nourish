"use client";

import { useEffect, useRef, useState } from "react";

const TOTAL_SECONDS = 90;

const phases = [
  { until: 75, text: "Breathe in slowly… and let it go. The urge is a wave — it rises, and it will fall." },
  { until: 45, text: "Notice five things you can see. Four you can touch. Three you can hear. Let your shoulders drop." },
  { until: 15, text: "Ask the kinder question: what do I actually need right now — food, rest, a break, a walk, a glass of water?" },
  { until: 0, text: "Ninety seconds, done. Whatever you choose next is a real choice — that's the whole point of the pause." },
];

export default function PauseTimer() {
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setRunning(false);
          setDone(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const phase = phases.find((p) => remaining > p.until) ?? phases[phases.length - 1];
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = ((TOTAL_SECONDS - remaining) / TOTAL_SECONDS) * 100;

  function reset() {
    setRemaining(TOTAL_SECONDS);
    setRunning(false);
    setDone(false);
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex h-56 w-56 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(#2f5d3a ${progress}%, #e7efe3 ${progress}%)`,
        }}
        role="timer"
        aria-live="polite"
        aria-label={`${remaining} seconds remaining in the pause`}
      >
        <div className="flex h-44 w-44 flex-col items-center justify-center rounded-full bg-[#faf7f0]">
          <span className="text-5xl font-bold tabular-nums text-stone-900">
            {minutes}:{String(seconds).padStart(2, "0")}
          </span>
          <span className="mt-1 text-sm text-stone-500">
            {done ? "pause complete" : running ? "pausing…" : "ready when you are"}
          </span>
        </div>
      </div>

      <p className="mt-6 min-h-16 max-w-md text-center leading-relaxed text-stone-700">
        {done ? phases[phases.length - 1].text : phase.text}
      </p>

      <div className="mt-4 flex gap-3">
        {!running && !done && (
          <button
            type="button"
            onClick={() => setRunning(true)}
            className="rounded-full bg-[#2f5d3a] px-8 py-3 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
          >
            {remaining === TOTAL_SECONDS ? "Start the 90 seconds" : "Resume"}
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={() => setRunning(false)}
            className="rounded-full border border-stone-300 bg-white px-8 py-3 text-lg font-semibold text-stone-800"
          >
            Pause the timer
          </button>
        )}
        {(remaining < TOTAL_SECONDS || done) && (
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-stone-300 bg-white px-6 py-3 font-medium text-stone-700"
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}
