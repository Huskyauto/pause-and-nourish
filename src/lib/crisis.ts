// Crisis signposting — a deterministic keyword rule over the user's
// OWN explicit words (NY GBL §1700 mitigation, adopted by Bob on
// 2026-11-01 together with the AI disclosure).
//
// This is deliberately NOT emotion detection: nothing is inferred
// about anyone's state. The rule matches a short list of explicit
// first-person crisis statements, the same way a smoke alarm matches
// smoke. When it matches, the conversation stops being composed by
// the model and returns one fixed signpost line (CRISIS_SAY) plus a
// crisis flag the client renders as a Get Support affordance. The
// Illinois WOPR fence is untouched: no state is detected, named, or
// stored — the words were the user's, said outright.

// Phrases are written in normalized form (see normalize()): lower
// case, curly apostrophes straightened, punctuation other than
// apostrophes removed, whitespace collapsed.
const CRISIS_PHRASES = [
  "kill myself",
  "killing myself",
  "going to kill myself",
  "want to kill myself",
  "suicidal",
  "suicide",
  "end my life",
  "take my own life",
  "hurt myself",
  "hurting myself",
  "harm myself",
  "self harm",
  "want to die",
  "wish i was dead",
  "wish i were dead",
  "better off dead",
  "don't want to live",
  "dont want to live",
  "no reason to live",
  "no reason to go on",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the text contains an explicit crisis statement. */
export function matchesCrisis(text: string): boolean {
  if (!text || !text.trim()) return false;
  const padded = ` ${normalize(text)} `;
  return CRISIS_PHRASES.some((phrase) => padded.includes(` ${phrase} `) || padded.includes(` ${phrase}`));
}

// The one fixed reply. Plain words, the disclosure inside it, the
// resource named, and the app's own support page pointed to — the
// client adds the tappable link; this text is also what gets spoken.
export const CRISIS_SAY =
  "That sounds bigger than a pause, and it deserves real human support. I'm an AI companion, not a person or a counselor. If you might act on these thoughts, please call or text 988 — the Suicide and Crisis Lifeline, any time, day or night. This app's Get support page has more options, including the eating disorders helpline.";
