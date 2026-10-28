// Reframe seed library — the starter lines the app hands back right after a
// check-in saves, matched to the need the user just declared.
//
// Voice rules (adopted Oct 27, 2026): first person, the user's own voice,
// reflective past tense ("Food was how I got there"), no advice, no therapy
// or medical language, no shame, plain words. Seeds serve new users until
// they author their own lines (their Shield Plan thought pairs join this
// pool in a later build). Lines for the seven needs are Meta AI's adopted
// Day 2 copy, reviewed by Spark and approved by Bob on 2026-10-27.

import type { Need } from "./journal";

export const SEED_REFRAMES: Record<Need, [string, string]> = {
  comfort: [
    "Comfort makes sense — I want to feel warm and safe. Food was how I got there.",
    "I'm wanting comfort right now. Eating gave me that okay-for-a-minute feeling.",
  ],
  escape: [
    "Escape makes sense — I want a break from all this. Food was my break.",
    "I get why I want to escape — today was a lot. Food helped me step away for a minute.",
  ],
  soothe: [
    "Soothe makes sense — I'm wound up and want to settle. Food was how I turned the volume down.",
    "I'm looking to soothe myself. Tasting and chewing was my way to calm down.",
  ],
  numb: [
    "Numb makes sense — I don't want to feel this right now. Food helped me go quiet for a bit.",
    "I want to numb out. Eating let me not think about it for a while.",
  ],
  reward: [
    "Reward makes sense — I got through something and want to mark it. Food was my treat for getting through.",
    "I want a reward. I did the hard thing, and food was how I told myself good job.",
  ],
  relief: [
    "Relief makes sense — I've been holding tension all day. Food was how I let go for a second.",
    "I'm chasing relief. That tight, pressured feeling — food made it loosen up for a bit.",
  ],
  fuel: [
    "Fuel makes sense — I feel wiped and empty. Food was my quick fill-up.",
    "I'm running on empty. Eating was how I tried to get my energy back.",
  ],
};

// Used when the user skipped the need step or tapped "Not sure" — same
// voice, no need named. (Written by Meta AI in its Day 2 review,
// 2026-10-27, replacing Spark's placeholders; adopted by Spark, via Bob.)
export const GENERAL_REFRAMES: [string, string] = [
  "Whatever this is, it makes sense — food was how I got through moments like this.",
  "I'm in it right now. I don't have to name it perfectly — food was how I paused before.",
];

// Rotate by how many entries exist so the same moment doesn't always get
// the same line.
export function pickReframe(need: Need | null, entryCount: number): string {
  const lines = need ? SEED_REFRAMES[need] : GENERAL_REFRAMES;
  return lines[Math.abs(entryCount) % lines.length];
}
