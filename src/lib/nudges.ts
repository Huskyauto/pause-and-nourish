// Nudge governance-lite (Day 7, from the Day 4 spec §2): the rules
// that keep the app's unprompted voice rare, answerable, and easy
// to stop. Max 2–3 unprompted nudges a day, quiet hours, minimum
// courtesy built in — and automatic back-off when ignored: after
// two unanswered heads-ups the app goes quiet for a week. Fewer,
// not louder. Every nudge carries one-tap controls (Helpful /
// Wrong time / Less often / Pause today / Stop this type) and a
// "why am I seeing this" line that states what was used and what
// was NOT used.
//
// The one nudge type that exists today is the morning heads-up,
// built ONLY from confirmed patterns and the user's declared risk
// windows — never from location, never from any sensor, and with
// no prediction language. It is an in-app card: this app has no
// push channel, so it appears when the app is opened in the
// morning, and says nothing it can't stand behind.

import type { ShieldPlan } from "./journal";
import { confirmedPatterns, type PatternRecord } from "./patterns";
import { activeRiskWindow, formatHourOfDay } from "./riskWindows";

export const MORNING_HEADS_UP = "morning-heads-up";

export interface NudgePolicy {
  enabled: boolean;
  maxPerDay: number; // 1–3
  quietStart: string; // "HH:MM" local
  quietEnd: string; // "HH:MM" local
  stoppedTypes: string[];
}

export const DEFAULT_NUDGE_POLICY: NudgePolicy = {
  enabled: true,
  maxPerDay: 2,
  quietStart: "21:30",
  quietEnd: "07:00",
  stoppedTypes: [],
};

export type NudgeResponse = "helpful" | "wrong-time" | "less-often" | "pause-today" | "stop-type";

export interface NudgeState {
  /** dateStr (local YYYY-MM-DD) → nudge types shown that day. */
  shownByDate: Record<string, string[]>;
  responses: { date: string; type: string; response: NudgeResponse }[];
  ignoredStreak: number;
  /** ISO date (local) the back-off runs until, or null. */
  backoffUntil: string | null;
  lastSettledDate: string | null;
  pausedDate: string | null;
}

export const EMPTY_NUDGE_STATE: NudgeState = {
  shownByDate: {},
  responses: [],
  ignoredStreak: 0,
  backoffUntil: null,
  lastSettledDate: null,
  pausedDate: null,
};

export function localDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map((x) => Number.parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function inQuietHours(policy: NudgePolicy, now: Date): boolean {
  const start = parseHHMM(policy.quietStart);
  const end = parseHHMM(policy.quietEnd);
  const t = minutesOfDay(now);
  if (start === end) return false;
  if (start < end) return t >= start && t < end;
  return t >= start || t < end; // wraps past midnight
}

/**
 * Settle the ignored bookkeeping for days that have closed. A
 * heads-up that was shown and never answered counts once as
 * ignored; two in a row start a 7-day back-off (and reset the
 * streak — the back-off IS the response, not a punishment).
 */
export function settleNudgeState(state: NudgeState, now: Date): NudgeState {
  const today = localDateStr(now);
  if (state.lastSettledDate === today) return state;
  const next: NudgeState = {
    ...state,
    shownByDate: { ...state.shownByDate },
    responses: [...state.responses],
    lastSettledDate: today,
  };
  const pastDates = Object.keys(next.shownByDate)
    .filter((d) => d < today)
    .sort();
  for (const date of pastDates) {
    const shown = next.shownByDate[date] ?? [];
    if (!shown.includes(MORNING_HEADS_UP)) continue;
    const answered = next.responses.some((r) => r.date === date && r.type === MORNING_HEADS_UP);
    // Settled days leave the ledger below, so a day counts once.
    if (!answered) {
      next.ignoredStreak += 1;
    }
    delete next.shownByDate[date]; // settled days leave the ledger
  }
  if (next.ignoredStreak >= 2 && (!next.backoffUntil || next.backoffUntil < today)) {
    const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    next.backoffUntil = localDateStr(until);
    next.ignoredStreak = 0;
  }
  return next;
}

export type HeadsUpBlock =
  | "disabled"
  | "stopped"
  | "quiet-hours"
  | "not-morning"
  | "paused-today"
  | "backed-off"
  | "already-shown"
  | "daily-cap";

export function headsUpBlock(
  policy: NudgePolicy,
  state: NudgeState,
  now: Date,
): HeadsUpBlock | null {
  const today = localDateStr(now);
  if (!policy.enabled) return "disabled";
  if (policy.stoppedTypes.includes(MORNING_HEADS_UP)) return "stopped";
  if (inQuietHours(policy, now)) return "quiet-hours";
  if (now.getHours() >= 11) return "not-morning";
  if (state.pausedDate === today) return "paused-today";
  if (state.backoffUntil && state.backoffUntil >= today) return "backed-off";
  const shownToday = state.shownByDate[today] ?? [];
  if (shownToday.includes(MORNING_HEADS_UP)) return "already-shown";
  if (shownToday.length >= policy.maxPerDay) return "daily-cap";
  return null;
}

export function recordShown(state: NudgeState, type: string, now: Date): NudgeState {
  const today = localDateStr(now);
  const shown = state.shownByDate[today] ?? [];
  if (shown.includes(type)) return state;
  return {
    ...state,
    shownByDate: { ...state.shownByDate, [today]: [...shown, type] },
  };
}

export function recordResponse(
  policy: NudgePolicy,
  state: NudgeState,
  type: string,
  response: NudgeResponse,
  now: Date,
): { policy: NudgePolicy; state: NudgeState } {
  const today = localDateStr(now);
  const nextState: NudgeState = {
    ...state,
    responses: [...state.responses, { date: today, type, response }].slice(-60),
  };
  let nextPolicy = policy;
  switch (response) {
    case "helpful":
      nextState.ignoredStreak = 0;
      break;
    case "wrong-time":
    case "pause-today":
      nextState.pausedDate = today;
      break;
    case "less-often": {
      const until = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      nextState.backoffUntil = localDateStr(until);
      break;
    }
    case "stop-type":
      if (!policy.stoppedTypes.includes(type)) {
        nextPolicy = { ...policy, stoppedTypes: [...policy.stoppedTypes, type] };
      }
      break;
  }
  return { policy: nextPolicy, state: nextState };
}

export interface HeadsUp {
  headline: string;
  body: string;
  why: string;
}

/**
 * Build the morning heads-up from confirmed patterns and declared
 * risk windows ONLY. Returns null when there is nothing confirmed
 * or declared to stand on — silence is a valid output of
 * governance, not a gap to fill with invention.
 */
export function buildHeadsUp(
  plan: ShieldPlan,
  patterns: PatternRecord[],
  now: Date,
): HeadsUp | null {
  const confirmed = confirmedPatterns(patterns);
  const todayWindow =
    activeRiskWindow(plan, now) ??
    (plan.riskWindows ?? []).find((w) => {
      const days = w.days ?? [];
      return days.length === 0 || days.includes(now.getDay());
    }) ??
    null;

  if (todayWindow) {
    const when = `${formatHourOfDay(todayWindow.startHour)}–${formatHourOfDay(todayWindow.endHour)}`;
    const planLine = plan.ifThen
      ? `Your plan, in your words: when ${plan.ifThen.when}, ${plan.ifThen.then}.`
      : plan.whyLine
        ? `Your why: “${plan.whyLine}”`
        : null;
    return {
      headline: `Today's harder stretch: ${todayWindow.label || when}`,
      body: [`The window you named runs ${when}.`, ...(planLine ? [planLine] : [])].join(" "),
      why: `You're seeing this because you declared this window yourself in your plan. Built from what you've recorded on this phone — location and microphone were not used.`,
    };
  }

  const riskPattern = confirmed.find((p) => p.kind === "risk-window");
  if (riskPattern) {
    const helps = confirmed.find((p) => p.kind === "what-helps");
    return {
      headline: riskPattern.text,
      body: helps
        ? `${helps.text} — ${helps.evidence.charAt(0).toLowerCase()}${helps.evidence.slice(1)}.`
        : riskPattern.evidence + ".",
      why: `You're seeing this because you confirmed it: “${riskPattern.text}”. Built from what you've recorded on this phone — location and microphone were not used.`,
    };
  }

  const helps = confirmed.find((p) => p.kind === "what-helps");
  if (helps) {
    return {
      headline: "What helps you, in your record",
      body: `${helps.text} — ${helps.evidence.charAt(0).toLowerCase()}${helps.evidence.slice(1)}.`,
      why: `You're seeing this because you confirmed it: “${helps.text}”. Built from what you've recorded on this phone — location and microphone were not used.`,
    };
  }

  return null;
}
