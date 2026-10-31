"use client";

// Calm-time setup for saved places and declared risk windows
// (Place Shield spec v1.1 §3 setup half; the armed-session trigger
// half belongs to the future native companion and is not here).
//
// Places: the user stands at a place, taps "Save this place," and
// the app keeps the coordinates ON THIS DEVICE ONLY — they are
// never sent anywhere. What travels later is just a matched place's
// name, into the conversation context (src/lib/places.ts).
//
// Risk windows: the user's own declared times. They ride the Shield
// Plan's riskWindows field (days added Day 7) and drive the talk
// context and the home plan card via src/lib/riskWindows.ts.

import { useEffect, useState } from "react";
import {
  getPlaces,
  savePlaces,
  type SavedPlace,
  type ShieldPlan,
} from "@/lib/journal";
import {
  accuracyWords,
  capturePosition,
  noteGeoPermissionGranted,
  DEFAULT_RADIUS_M,
  PLACE_RADII_M,
  type PositionFix,
} from "@/lib/places";
import { formatHourOfDay, type RiskWindowEntry } from "@/lib/riskWindows";

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none";
const addBtnClass =
  "shrink-0 rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-40";
const removeBtnClass =
  "text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------- Places ----------------

type CaptureState =
  | { kind: "idle" }
  | { kind: "capturing" }
  | { kind: "captured"; fix: PositionFix }
  | { kind: "error"; message: string };

function captureErrorMessage(err: unknown): string {
  switch (err) {
    case "denied":
      return "Location is off for this app, so no place was saved. You can turn it on in your browser or site settings — nothing else in the app changes either way.";
    case "unsupported":
      return "This browser doesn't offer location, so places can't be saved here. Everything else works the same.";
    case "timeout":
      return "Finding your location took too long — no place was saved. Try again, ideally with a view of the sky.";
    default:
      return "Your location couldn't be read just now — no place was saved. Try again in a moment.";
  }
}

export function PlacesSection() {
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  const [capture, setCapture] = useState<CaptureState>({ kind: "idle" });
  const [name, setName] = useState("");
  const [radiusM, setRadiusM] = useState<number>(DEFAULT_RADIUS_M);

  useEffect(() => {
    let live = true;
    getPlaces()
      .then((p) => {
        if (live) setPlaces(p);
      })
      .catch(() => {
        if (live) setPlaces([]);
      });
    return () => {
      live = false;
    };
  }, []);

  async function persist(nextPlaces: SavedPlace[]) {
    setPlaces(nextPlaces);
    try {
      await savePlaces(nextPlaces);
    } catch {
      // Saved in state; storage failure must not break setup.
    }
  }

  async function captureHere() {
    setCapture({ kind: "capturing" });
    try {
      const fix = await capturePosition();
      noteGeoPermissionGranted();
      setCapture({ kind: "captured", fix });
    } catch (err) {
      setCapture({ kind: "error", message: captureErrorMessage(err) });
    }
  }

  async function saveCapturedPlace() {
    if (capture.kind !== "captured" || !places) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const place: SavedPlace = {
      id: crypto.randomUUID(),
      name: trimmed.slice(0, 60),
      lat: capture.fix.lat,
      lng: capture.fix.lng,
      radiusM,
      createdAt: new Date().toISOString(),
    };
    await persist([...places, place]);
    setName("");
    setRadiusM(DEFAULT_RADIUS_M);
    setCapture({ kind: "idle" });
  }

  if (!places) {
    return <p className="mt-3 text-stone-600">Loading…</p>;
  }

  return (
    <div>
      <p className="mt-1 text-sm text-stone-600">
        Stand at a place where you want your plan close at hand — a drive-thru, a grocery
        store, your kitchen — and save it here, in your own words. The spot itself stays on
        this phone: its coordinates are never sent anywhere. Later, when you talk with your
        second brain near a saved place, only the place&apos;s name goes along — never the
        coordinates.
      </p>

      {places.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {places.map((place) => (
            <li
              key={place.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <input
                  value={place.name}
                  aria-label="Place name"
                  maxLength={60}
                  onChange={(e) =>
                    setPlaces(
                      places.map((p) => (p.id === place.id ? { ...p, name: e.target.value } : p)),
                    )
                  }
                  onBlur={() => persist(places)}
                  className="w-full rounded-lg border border-transparent p-1 font-semibold text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
                />
                <button
                  type="button"
                  className={removeBtnClass}
                  onClick={() => persist(places.filter((p) => p.id !== place.id))}
                >
                  Delete
                </button>
              </div>
              <p className="mt-1 text-sm text-stone-600">
                Saved on this device · matches within about {place.radiusM} m · stand there and
                save it again to fix a bad reading
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        {capture.kind === "captured" ? (
          <div>
            <p className="text-stone-700">
              Got your location — {accuracyWords(capture.fix.accuracyM)} (within about{" "}
              {Math.round(capture.fix.accuracyM)} m).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Home", "Shop"].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setName(suggestion)}
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-[#2f5d3a]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClass} mt-3`}
              placeholder="Name this place in your words — e.g. the Cane's on Grand"
              maxLength={60}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-stone-600">Match within:</span>
              {PLACE_RADII_M.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadiusM(r)}
                  className={
                    radiusM === r
                      ? "rounded-full bg-[#2f5d3a] px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-[#2f5d3a]"
                  }
                >
                  {r} m
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={addBtnClass}
                disabled={!name.trim()}
                onClick={saveCapturedPlace}
              >
                Save this place
              </button>
              <button
                type="button"
                className="rounded-full border border-stone-300 px-5 py-3 font-semibold text-stone-700 transition hover:border-[#2f5d3a]"
                onClick={captureHere}
              >
                Re-capture
              </button>
              <button
                type="button"
                className="rounded-full px-5 py-3 font-semibold text-stone-500 underline underline-offset-4"
                onClick={() => setCapture({ kind: "idle" })}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className={addBtnClass}
              disabled={capture.kind === "capturing"}
              onClick={captureHere}
            >
              {capture.kind === "capturing" ? "Finding where you are…" : "Save this place"}
            </button>
            <p className="mt-2 text-sm text-stone-600">
              Tap it standing at the place. Your browser will ask about location — that
              permission is what lets a saved place mean anything later.
            </p>
            {capture.kind === "error" && (
              <p className="mt-2 text-sm font-medium text-[#9a3b26]">{capture.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Risk windows ----------------

function timeToFractional(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h + m / 60;
}

function daysSummary(w: RiskWindowEntry): string {
  if (!w.days || w.days.length === 0 || w.days.length === 7) return "Every day";
  return [...w.days]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(" · ");
}

export function RiskWindowsSection({
  plan,
  onUpdate,
}: {
  plan: ShieldPlan;
  onUpdate: (plan: ShieldPlan) => void;
}) {
  const windows = plan.riskWindows ?? [];
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("21:00");

  const startHour = timeToFractional(start);
  const endHour = timeToFractional(end);
  const timesValid = startHour !== null && endHour !== null && startHour !== endHour;
  const wraps = timesValid && endHour < startHour;

  function addWindow() {
    if (!timesValid) return;
    const entry: RiskWindowEntry = {
      label: label.trim().slice(0, 60) || "Risk window",
      startHour,
      endHour,
      // Every day selected = the field stays absent (the standing
      // meaning of a missing days list).
      days: days.length === 7 ? undefined : [...days].sort((a, b) => a - b),
    };
    onUpdate({ ...plan, riskWindows: [...windows, entry] });
    setLabel("");
    setDays([0, 1, 2, 3, 4, 5, 6]);
  }

  return (
    <div>
      <p className="mt-1 text-sm text-stone-600">
        Times of day when the urge tends to show up for you — declared by you, at calm time.
        During a window, your plan comes forward on the home screen and your second brain
        knows the hour for what it is. Nothing is detected; these are your words about your
        day.
      </p>

      {windows.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {windows.map((w, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
            >
              <div>
                <p className="font-semibold text-stone-900">{w.label}</p>
                <p className="text-sm text-stone-600">
                  {daysSummary(w)} · {formatHourOfDay(w.startHour)} – {formatHourOfDay(w.endHour)}
                  {w.endHour < w.startHour ? " (past midnight)" : ""}
                </p>
              </div>
              <button
                type="button"
                className={removeBtnClass}
                onClick={() =>
                  onUpdate({ ...plan, riskWindows: windows.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
          placeholder="Name the window in your words — e.g. Evenings after work"
          maxLength={60}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {DAY_LETTERS.map((letter, d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={DAY_NAMES[d]}
                onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                className={
                  on
                    ? "h-10 w-10 rounded-full bg-[#2f5d3a] text-sm font-semibold text-white"
                    : "h-10 w-10 rounded-full border border-stone-300 text-sm font-medium text-stone-700 transition hover:border-[#2f5d3a]"
                }
              >
                {letter}
              </button>
            );
          })}
          <button
            type="button"
            className="ml-1 text-sm font-medium text-[#2f5d3a] underline underline-offset-4"
            onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
          >
            Every day
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            From
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white p-2 text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            To
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white p-2 text-stone-900 focus:border-[#2f5d3a] focus:outline-none"
            />
          </label>
          {wraps && <span className="text-sm text-stone-600">Runs past midnight.</span>}
        </div>
        <button
          type="button"
          className={`${addBtnClass} mt-4`}
          disabled={!timesValid || days.length === 0}
          onClick={addWindow}
        >
          Add window
        </button>
        {days.length === 0 && (
          <p className="mt-2 text-sm text-stone-600">Pick at least one day.</p>
        )}
      </div>
    </div>
  );
}
