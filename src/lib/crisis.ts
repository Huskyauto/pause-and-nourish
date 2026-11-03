// Fixed signposts — deterministic keyword rules over the user's
// OWN explicit words. Two of them live here: the crisis signpost
// (NY GBL §1700 mitigation, adopted by Bob on 2026-11-01 together
// with the AI disclosure) and the eating-disorder signpost (added
// 2026-11-02, concept and wording approved by Bob).
//
// This is deliberately NOT emotion detection: nothing is inferred
// about anyone's state. The rules match short lists of explicit
// first-person statements, the same way a smoke alarm matches
// smoke. When one matches, the conversation stops being composed by
// the model and returns one fixed signpost line plus a flag the
// client renders as a Get Support affordance. The Illinois WOPR
// fence is untouched: no state is detected, named, or stored — the
// words were the user's, said outright.

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
  // Added 2026-11-02 (external review; Bob approved the list):
  // common wordings the first list missed. Same smoke-alarm rule —
  // an over-trigger costs a support card shown to someone who did
  // not need it; a miss costs the signpost not firing at all.
  "want to be dead",
  "rather be dead",
  "can't go on",
  "cant go on",
  "cannot go on",
  "end it all",
  "ending it all",
  "don't want to be here anymore",
  "dont want to be here anymore",
  "don't want to be alive",
  "dont want to be alive",
  "kms",
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

// ---------- The eating-disorder signpost ----------
//
// Same smoke-alarm posture as the crisis rule: explicit disclosures
// of an eating disorder or of purging/starving behavior, in the
// user's own words. Deliberately NOT in the list: "I'm starving"
// (ordinary hunger slang), bare "throw up" (illness reads at least
// as often as behavior), and any inference from eating patterns —
// the journal's contents never trigger this; only stated words do.
// When it fires, the food conversation ends for the session: the
// fixed line below is the whole reply, and no plan moves follow it.

const ED_PHRASES = [
  "eating disorder",
  "anorexia",
  "anorexic",
  "bulimia",
  "bulimic",
  "make myself throw up",
  "made myself throw up",
  "making myself throw up",
  "throw up after i eat",
  "throwing up after i eat",
  "purge after i eat",
  "purge after eating",
  "purging after eating",
  "binge and purge",
  "starving myself",
  "starve myself",
];

/** True when the text carries an explicit eating-disorder disclosure. */
export function matchesEatingDisorder(text: string): boolean {
  if (!text || !text.trim()) return false;
  const padded = ` ${normalize(text)} `;
  return ED_PHRASES.some((phrase) => padded.includes(` ${phrase} `) || padded.includes(` ${phrase}`));
}

// The fixed reply, in the wording Bob approved on 2026-11-02. It
// names the resource (the National Alliance for Eating Disorders
// helpline — the same number the Get Support page carries), states
// the AI boundary plainly, and offers no food guidance at all.
export const ED_SAY =
  "That sounds like more than a tricky moment, and it deserves real human support. I'm an AI companion, not a counselor, and I can't help with that part. The National Alliance for Eating Disorders helpline is 1-888-375-7767, Monday to Friday, 9 to 9 Central — it's also on this app's Get Support page, any time.";
