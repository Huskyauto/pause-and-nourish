// The Pause toolkit — five tools inside the 90-second pause.
// Scripts port from Bob's MetaBalance mindfulness library (techniques only;
// the library's efficacy claims do not port — no unverified numbers here).
// The Urge Surfing beats are the adopted copy (Meta AI Day 2 copy job,
// locked 2026-10-27): 7 beats at 0 / 12 / 25 / 40 / 55 / 70 / 85 seconds.
// Day 4 adds one defusion beat at 47s — "This is a thought, not an order"
// (dashboard v2.1, via the adopted Grok review package).

import type { Need } from "./journal";

export interface BeatTool {
  kind: "beats";
  beats: { at: number; text: string }[];
}

export interface BreathTool {
  kind: "breath";
  phases: { label: string; seconds: number }[];
}

export interface PauseTool {
  id: string;
  name: string;
  tagline: string;
  durationSeconds: number;
  script: BeatTool | BreathTool;
}

export const PAUSE_TOOLS: PauseTool[] = [
  {
    id: "urge-surfing",
    name: "Urge Surfing",
    tagline: "Ride the urge like a wave — it crests, then it comes down.",
    durationSeconds: 90,
    script: {
      kind: "beats",
      beats: [
        { at: 0, text: "Okay, let's pause here for a minute and a half." },
        { at: 12, text: "Notice what's here — urge, tightness, thoughts. Just notice." },
        { at: 25, text: "It's okay that it feels strong. That's what urges do." },
        { at: 40, text: "Watch it — does it get bigger, smaller, move?" },
        { at: 47, text: "This is a thought, not an order." },
        { at: 55, text: "You don't have to do anything about it right now." },
        { at: 70, text: "Urges come up, hang around, then come back down. Let's ride this one." },
        { at: 85, text: "You're still here. That's a lot. See what feels next." },
      ],
    },
  },
  {
    id: "stop",
    name: "STOP",
    tagline: "Stop. Take a breath. Observe. Proceed — on purpose.",
    durationSeconds: 90,
    script: {
      kind: "beats",
      beats: [
        { at: 0, text: "Stop. Whatever you're doing, pause it right here." },
        { at: 22, text: "Take a breath. One slow breath in… and let it go." },
        { at: 45, text: "Observe. What set this off? Is this body hunger, or head hunger? Just notice — no fixing." },
        { at: 67, text: "Proceed mindfully. The next move is yours to choose — that's the difference." },
      ],
    },
  },
  {
    id: "grounding",
    name: "5-4-3-2-1 Grounding",
    tagline: "Come back to the room you're actually in, one sense at a time.",
    durationSeconds: 90,
    script: {
      kind: "beats",
      beats: [
        { at: 0, text: "Look around. Name 5 things you can see — say them slowly, one by one." },
        { at: 18, text: "Now 4 things you can touch. The chair, your sleeve, the counter — feel each one." },
        { at: 36, text: "3 things you can hear. Near or far, quiet counts." },
        { at: 54, text: "2 things you can smell. Breathe in and look for them." },
        { at: 72, text: "1 thing you can taste. Even just the taste of your own mouth right now." },
      ],
    },
  },
  {
    id: "box-breathing",
    name: "Box Breathing",
    tagline: "Four counts in, hold, out, hold — a square of breath.",
    durationSeconds: 90,
    script: {
      kind: "breath",
      phases: [
        { label: "Breathe in", seconds: 4 },
        { label: "Hold", seconds: 4 },
        { label: "Breathe out", seconds: 4 },
        { label: "Hold", seconds: 4 },
      ],
    },
  },
  {
    id: "breath-478",
    name: "4-7-8 Breathing",
    tagline: "The longer, slower option. In for 4, hold for 7, out for 8.",
    durationSeconds: 90,
    script: {
      kind: "breath",
      phases: [
        { label: "Breathe in", seconds: 4 },
        { label: "Hold", seconds: 7 },
        { label: "Breathe out", seconds: 8 },
      ],
    },
  },
];

export function toolById(id: string | null | undefined): PauseTool {
  return PAUSE_TOOLS.find((t) => t.id === id) ?? PAUSE_TOOLS[0];
}

// Which tool to offer first for a declared need (full list stays one tap
// away). The need is always user-declared at check-in, never inferred.
export function toolForNeed(need: Need | null): PauseTool {
  switch (need) {
    case "numb":
    case "bored":
      return toolById("grounding");
    case "escape":
      return toolById("stop");
    case "soothe":
    case "relief":
    case "stressed":
      return toolById("breath-478");
    case "comfort":
    case "tired":
      return toolById("box-breathing");
    default:
      return toolById("urge-surfing");
  }
}
