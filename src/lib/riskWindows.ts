// Declared risk windows — the one shared computation.
//
// A risk window is calm-time declared data on the Shield Plan: a
// label in the user's words, days of the week, and a start–end time
// (stored as fractional local hours; an end earlier than the start
// wraps past midnight). This module is the single source of truth
// for "are we inside one right now, and if not, when is the next" —
// Talk, the SOS moment, and the home plan card all read it, so the
// three can never disagree. `days` absent or empty means every day
// (the pre-Day-7 window shape). Pure functions of (plan, now) —
// nothing here touches storage or the network.

import type { ShieldPlan } from "./journal";

export type RiskWindowEntry = NonNullable<ShieldPlan["riskWindows"]>[number];

// The context shape the converse route consumes (unchanged).
export interface RiskWindowState {
  inWindow: boolean;
  label?: string;
  nextLabel?: string;
  nextStartsAt?: string;
}

function appliesOn(w: RiskWindowEntry, day: number): boolean {
  return !w.days || w.days.length === 0 || w.days.includes(day);
}

// Is `now` inside this window? For a wrapping window (start after
// end), the after-midnight portion belongs to the day the window
// STARTED — a Friday 10 PM–2 AM window is active at Saturday 1 AM
// because it began on Friday.
export function windowActiveAt(w: RiskWindowEntry, now: Date): boolean {
  const { startHour: s, endHour: e } = w;
  if (s === e) return false;
  const hour = now.getHours() + now.getMinutes() / 60;
  if (s < e) {
    return appliesOn(w, now.getDay()) && hour >= s && hour < e;
  }
  if (hour >= s) return appliesOn(w, now.getDay());
  if (hour < e) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return appliesOn(w, yesterday.getDay());
  }
  return false;
}

// The window the user is inside right now, or null.
export function activeRiskWindow(plan: ShieldPlan, now: Date): RiskWindowEntry | null {
  for (const w of plan.riskWindows ?? []) {
    if (windowActiveAt(w, now)) return w;
  }
  return null;
}

function formatStart(start: Date, now: Date): string {
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((startDay - today) / 86400000);
  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `tomorrow at ${time}`;
  return `${start.toLocaleDateString("en-US", { weekday: "long" })} at ${time}`;
}

// Full context state: inside a window (with its label), or the next
// window's start across the coming week.
export function computeRiskWindowState(plan: ShieldPlan, now: Date): RiskWindowState {
  const windows = plan.riskWindows ?? [];
  if (!windows.length) return { inWindow: false };
  const active = activeRiskWindow(plan, now);
  if (active) return { inWindow: true, label: active.label };
  let next: { label: string; start: Date } | null = null;
  for (const w of windows) {
    if (w.startHour === w.endHour) continue;
    for (let d = 0; d <= 7; d++) {
      const start = new Date(now);
      start.setDate(start.getDate() + d);
      start.setHours(Math.floor(w.startHour), Math.round((w.startHour % 1) * 60), 0, 0);
      if (start.getTime() <= now.getTime()) continue;
      if (!appliesOn(w, start.getDay())) continue;
      if (!next || start.getTime() < next.start.getTime()) {
        next = { label: w.label, start };
      }
      break; // earliest start for this window found
    }
  }
  return next
    ? { inWindow: false, nextLabel: next.label, nextStartsAt: formatStart(next.start, now) }
    : { inWindow: false };
}

// "5:00 PM" for a fractional hour — setup/list display.
export function formatHourOfDay(fractionalHour: number): string {
  const d = new Date();
  d.setHours(Math.floor(fractionalHour) % 24, Math.round((fractionalHour % 1) * 60), 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
