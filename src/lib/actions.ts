// Guided actions — the modality REPERTOIRE (Day 6 "big push",
// Bob's directive 2026-10-31; repertoire steer, same day).
//
// Talk It Through stops being talk-only: when the second brain has
// learned the shape of the moment, it may propose ONE concrete action
// and the app LEADS it, step by step, in voice — Bob's example: "Why
// don't we start with 5 deep breaths? Okay Bob — first breath…", a
// couple of seconds pass, "second breath…", through completion.
//
// THE REGISTRY IS DATA, NOT CODE. MODALITY_REPERTOIRE below is the
// repertoire: one entry per modality with its id, plain name, the
// situations it fits, its paced step templates, and its source.
// Both consumers read from it and nothing else:
//   - /api/converse validates a proposed kind against these ids and
//     builds its guided-action prompt section from these entries;
//   - the TalkClient paces a run from these step templates.
// A fuller catalog (pause-and-nourish-modality-repertoire JSON,
// built from Bob's mined apps + journey knowledge base) drops into
// this table later without touching conversation logic. Entries
// backed by a shipped pause tool carry `toolId` and materialize
// their steps from that tool's script in src/lib/tools.ts, so the
// toolkit stays the single source for those scripts.
//
// Step templates are patterns, not prose the model wrote: `{swap}`
// and `{why}` are filled from the user's own Shield Plan at run
// time, `{ordinal}` / `{n}` from the repeat count. The model only
// ever returns an entry's id — it never authors step text, pacing,
// or new modalities (the WOPR fence: recall and lead his own kit,
// never invented advice, never therapy content).
//
// He can decline in plain words ("not now", "no") and the
// conversation simply continues — parseActionResponse decides,
// deterministically, from his explicit words only. At the close of
// a session the app asks, in plain words, how it landed;
// parseOutcome maps his spoken answer to his mark — "good" or
// "work-on" — or leaves it unmarked when his words are ambiguous.
// Nothing is inferred; no emotion is detected.

import { toolById, type PauseTool } from "./tools";

// ---------- The repertoire (data) ----------

export interface RepertoireStep {
  // The line to speak at this step, as a template — or null for a
  // silent wait (the quiet inside a pause is a step too).
  say: string | null;
  // Quiet seconds AFTER the line finishes speaking.
  seconds: number;
  // Play his recorded reset line instead of speaking; `say` is the
  // fallback text when no recording exists.
  playReset?: boolean;
}

export interface ModalityDef {
  id: string;
  name: string; // plain label — journal record + dashboard
  situations: string[]; // when this fits, in plain words (prompt fuel)
  steps: RepertoireStep[];
  // Repeat the step group this many times, substituting {ordinal}
  // (First, Second, …) and {n} (1, 2, …) per pass.
  repeat?: number;
  // Seed entries backed by a shipped pause tool: steps materialize
  // from the tool's script instead of the literal `steps` array.
  toolId?: string;
  // Placement gate (catalog ruling): "calm" entries are calm-time,
  // for-later items. They stay in the registry data, but the converse
  // prompt excludes them from the offerable repertoire and the route
  // strips the kind if one is ever returned — in the moment is
  // conversation + led moves only. Absent means "moment".
  placement?: "moment" | "calm";
  source: string;
}

// The repertoire of record: the modality catalog v1.2 (2026-10-31) —
// 46 PORT/ADAPT entries: mined from Bob's own apps (AI-BUDDY,
// MetaBalance), the distilled method layer, his journey knowledge
// base, and the bounded gap-check he locked the same day, spliced in
// verbatim from the catalog JSON. The nine seed ids from Bob's
// directive are entries 1–9, unchanged; entries 31–37 are the v1.1
// delta — seven ADAPT entries fetched from AI-BUDDY's self_care.py
// in the GitHub backup; entries 38–46 are the v1.2 delta — the nine
// gap-check candidates (run-the-movie … kind-sentence).
// EXCLUDE entries from the catalog never appear here. The table
// grows by data, never by new conversation code.
export const MODALITY_REPERTOIRE: ModalityDef[] = [
  {
    "id": "breathing",
    "name": "Five deep breaths",
    "situations": ["any declared need", "a live urge with nothing else named yet", "the first offer when a moment needs a lead"],
    "steps": [{ "say": "{ordinal} breath — breathe in, slow.", "seconds": 4 }, { "say": "And let it out, slow.", "seconds": 6 }],
    "repeat": 5,
    "source": "Bob's directive, 2026-10-31 (his example lead)",
  },
  {
    "id": "urge-surfing",
    "name": "Urge surfing",
    "situations": ["relief", "soothe", "a strong urge he wants to ride out rather than act on", "urge 3-5"],
    "steps": [{ "say": "Okay, let's pause here for a minute and a half.", "seconds": 12 }, { "say": "Notice what's here — urge, tightness, thoughts. Just notice.", "seconds": 13 }, { "say": "It's okay that it feels strong. That's what urges do.", "seconds": 15 }, { "say": "Watch it — does it get bigger, smaller, move?", "seconds": 7 }, { "say": "This is a thought, not an order.", "seconds": 8 }, { "say": "You don't have to do anything about it right now.", "seconds": 15 }, { "say": "Urges come up, hang around, then come back down. Let's ride this one.", "seconds": 15 }, { "say": "You're still here. That's a lot. See what feels next.", "seconds": 5 }],
    "toolId": "urge-surfing",
    "source": "MetaBalance mindfulness library (Urge Surfing), via Pause toolkit (tools.ts)",
  },
  {
    "id": "stop",
    "name": "STOP",
    "situations": ["escape", "a moment moving too fast — he wants to stop and choose on purpose", "autopilot starting"],
    "steps": [{ "say": "Stop. Whatever you're doing, pause it right here.", "seconds": 22 }, { "say": "Take a breath. One slow breath in… and let it go.", "seconds": 23 }, { "say": "Observe. What set this off? Is this body hunger, or head hunger? Just notice — no fixing.", "seconds": 22 }, { "say": "Proceed mindfully. The next move is yours to choose — that's the difference.", "seconds": 23 }],
    "toolId": "stop",
    "source": "MetaBalance mindfulness library (STOP Technique), via Pause toolkit (tools.ts)",
  },
  {
    "id": "grounding",
    "name": "Grounding, sense by sense",
    "situations": ["numb", "bored", "feeling numb or flat, head somewhere else — come back to the room", "empty evening"],
    "steps": [{ "say": "Look around. Name 5 things you can see — say them slowly, one by one.", "seconds": 18 }, { "say": "Now 4 things you can touch. The chair, your sleeve, the counter — feel each one.", "seconds": 18 }, { "say": "3 things you can hear. Near or far, quiet counts.", "seconds": 18 }, { "say": "2 things you can smell. Breathe in and look for them.", "seconds": 18 }, { "say": "1 thing you can taste. Even just the taste of your own mouth right now.", "seconds": 18 }],
    "toolId": "grounding",
    "source": "MetaBalance mindfulness library (5-4-3-2-1 Grounding), via Pause toolkit (tools.ts)",
  },
  {
    "id": "box-breathing",
    "name": "Box breathing",
    "situations": ["comfort", "tired", "wound up and wanting a steady rhythm to follow"],
    "steps": [{ "say": "Breathe in", "seconds": 4 }, { "say": "Hold", "seconds": 4 }, { "say": "Breathe out", "seconds": 4 }, { "say": "Hold", "seconds": 4 }],
    "repeat": 5,
    "toolId": "box-breathing",
    "source": "MetaBalance mindfulness library (Box Breathing) + AI-BUDDY wellness_toolbox.py timed voice guidance (16-second cycle)",
  },
  {
    "id": "breath-478",
    "name": "4-7-8 breathing",
    "situations": ["stressed", "soothe", "relief", "needing to settle — the longer, slower breathing", "before sleep"],
    "steps": [{ "say": "Breathe in", "seconds": 4 }, { "say": "Hold", "seconds": 7 }, { "say": "Breathe out", "seconds": 8 }],
    "repeat": 4,
    "toolId": "breath-478",
    "source": "MetaBalance mindfulness library (4-7-8 Relaxation Breath) + AI-BUDDY wellness_toolbox.py timed voice guidance (19-second cycle)",
  },
  {
    "id": "reset",
    "name": "Reset line + quiet pause",
    "situations": ["after a wobble — his own reset line, then quiet, nothing reset", "just ate", "slip"],
    "steps": [{ "say": "{why}", "seconds": 3, "playReset": true }, { "say": null, "seconds": 45 }],
    "source": "His recorded reset line (Day 4 Shield) + journey knowledge base setback-respawn pattern",
  },
  {
    "id": "swap",
    "name": "Something stocked to have instead",
    "situations": ["real hunger or a named target food, with something stocked to have instead for this moment", "comfort", "reward", "lonely — the call-a-person option from his own list"],
    "steps": [{ "say": "Here's what you stocked for this moment: {swap}. It's here, and it's yours.", "seconds": 4 }],
    "source": "His Shield Plan stocked swaps — Crackthecode Trigger-to-Options table + Lisa layer (internal only — never surfaced in app copy): pre-decided Plan-B alternatives + journey KB function-matching (same job: crunch for crunch, rest for tiredness, company for loneliness)",
  },
  {
    "id": "walk",
    "name": "A short walk",
    "situations": ["escape", "relief", "stressed", "restless, able to move — a walk fits the hour and the place", "evening at home"],
    "steps": [{ "say": "Let's take a short walk — out the door, or just a loop around the room. I'll check in as we go.", "seconds": 45 }, { "say": "Still walking — notice the air, your feet, the sounds around you.", "seconds": 45 }, { "say": "Last stretch. When we stop, tell me how the urge sits now.", "seconds": 30 }],
    "source": "His playbook pattern — the walk is his anchor move (journey knowledge base, 218 videos; Weightlossapp checklist)",
  },
  {
    "id": "why-line",
    "name": "Your why, in your words",
    "situations": ["any declared need", "a justification thought is running", "risk window", "plateau or flat stretch at calm time"],
    "steps": [{ "say": "{why}", "seconds": 20 }, { "say": "What would the steadier version of you do with this moment?", "seconds": 15 }],
    "source": "Crackthecode Day 5 user-authored supporting messages / story line + Lisa layer (internal only — never surfaced in app copy): identity-first framing, reworded as Pause & Nourish's own",
  },
  {
    "id": "replacement-line",
    "name": "Your replacement line",
    "situations": ["he names the exact self-talk that is running", "justification thought", "a post-slip spiral starting"],
    "steps": [{ "say": "There's the line you wrote for this one. Here it is, in your words.", "seconds": 3 }, { "say": "{replacement}", "seconds": 8 }, { "say": "{replacement}", "seconds": 8 }, { "say": "Say it back to me once, out loud.", "seconds": 10 }],
    "source": "Crackthecode Day 3 user-authored negative-to-positive thought pairs (SOS reframe library) — his written pairs only; the coached belief-testing protocol is excluded (see Markdown catalog entry 37). NOTE: steps use {why} as the spoken slot; at drop-in, fill it with the matched pair's replacement line (one new {replacement} fill from his Shield Plan thought pairs)",
  },
  {
    "id": "hunger-check",
    "name": "The ten-second hunger check",
    "situations": ["the gate at the top of any moment", "an urge just arrived", "after dinner", "arriving at a named place"],
    "steps": [{ "say": "Quick check first. Did this come on all of a sudden, or did it build slow?", "seconds": 8 }, { "say": "Is it one specific food — or would a real meal sound good?", "seconds": 8 }],
    "source": "Crackthecode science page (physical vs emotional hunger test) + Lisa layer (internal only — never surfaced in app copy): the hunger-or-something-else gate, in Pause & Nourish's own words + AI-BUDDY Location Wellness spoken hunger check",
  },
  {
    "id": "name-the-job",
    "name": "Name the job",
    "situations": ["an urge is present but the need is not named yet", "any live moment", "he does not know why he wants this"],
    "steps": [{ "say": "If food could do one job for you right now, what job would it be — comfort, a break, calming down, zoning out, a reward, or relief?", "seconds": 15 }, { "say": "The job is {need}. Then let's get that job done.", "seconds": 3 }],
    "source": "Lisa layer (internal only — never surfaced in app copy): food is doing a job + journey KB method (ask what job the food is doing; the answer names the need a response has to match) + Crackthecode need taxonomy (comfort / escape / soothe / numb / reward / relief)",
  },
  {
    "id": "long-pause",
    "name": "The long pause — ten minutes",
    "situations": ["any declared need", "urge 4-5 — a 90-second pause is too short", "evening at home"],
    "steps": [{ "say": "We're taking ten minutes. Not a no — a pause. I'll stay with you.", "seconds": 115 }, { "say": "Still here. How's the number now?", "seconds": 170 }, { "say": "Halfway. Waves crest and come down — where is this one?", "seconds": 170 }, { "say": "Two minutes left. What's the need saying now?", "seconds": 115 }, { "say": "Ten minutes. Eat it, have something else instead, or let it wait — your call, on purpose.", "seconds": 10 }],
    "source": "Lisa layer (internal only — never surfaced in app copy): the concept that some urges need a longer pause — her protocol's steps are not in any source; this sequence is Pause & Nourish's own design",
  },
  {
    "id": "flavor-peak",
    "name": "The flavor-peak check",
    "situations": ["mid-eating", "intentional eating midpoint", "restaurant or event food", "clean-plate pattern"],
    "steps": [{ "say": "Quick check — is this bite as good as the first one was?", "seconds": 10 }],
    "source": "Lisa layer (internal only — never surfaced in app copy): stop at the flavor peak + journey KB move (when the current bite is clearly worse than the first, the food has finished its best work)",
  },
  {
    "id": "step-away",
    "name": "Close the meal — step away",
    "situations": ["end of eating", "buffet or family table", "kitchen lingering", "clean-plate pattern", "night eating"],
    "steps": [{ "say": "When you're done, let's close it: fork down.", "seconds": 5 }, { "say": "Stand up and step away from the table — a different room, the porch, anywhere that isn't the food.", "seconds": 20 }, { "say": "Closed. How does that sit?", "seconds": 10 }],
    "source": "Lisa layer (internal only — never surfaced in app copy): talk-or-eat and physically disconnect when done + journey KB evening terrain and clean-plate pattern situations",
  },
  {
    "id": "get-absorbed",
    "name": "Get absorbed",
    "situations": ["escape", "numb", "bored", "an unoccupied stressed mind", "caretaking strain", "evening at home"],
    "steps": [{ "say": "Get into the thing that absorbs you — building, making, learning. Give it ten minutes and let it take the whole room.", "seconds": 290 }, { "say": "Still with it? How's the urge riding now?", "seconds": 290 }, { "say": "That's ten. Where does the urge sit?", "seconds": 10 }],
    "source": "Journey knowledge base pattern P3 (absorption displaces food thoughts — stated unprompted three times) + KB move (keep an absorbing pursuit fed as standing anti-urge equipment)",
  },
  {
    "id": "water-first",
    "name": "Water first, then decide",
    "situations": ["fuel", "relief", "physical triggers — thirst misread as hunger", "work day in the heat", "nothing eaten or drank in hours"],
    "steps": [{ "say": "Before we decide anything — a full glass of water, all of it.", "seconds": 30 }, { "say": null, "seconds": 60 }, { "say": "Now — where does the urge sit?", "seconds": 10 }],
    "source": "Journey knowledge base (front-load water on physical work days; thirst among the physical triggers) + MetaBalance episode model (physical trigger category)",
  },
  {
    "id": "rest",
    "name": "Rest is the move",
    "situations": ["tired", "relief", "the broken-night next day", "caretaking load", "end of a long day"],
    "steps": [{ "say": "What you're calling hunger might be a tired brain asking for the fastest fuel it knows. The move here is rest — lie down, eyes closed, twenty minutes. I'll close this out; when you wake, tell me how it sits.", "seconds": 900 }, { "say": "That's the rest. How does everything sit now?", "seconds": 10 }],
    "source": "Journey knowledge base (rest written into the program; the broken night — the next day's urge is a tired brain asking for fast energy) + Lisa layer (internal only — never surfaced in app copy): tired/rest as a named underneath need",
  },
  {
    "id": "walk-short",
    "name": "The ten-minute version",
    "situations": ["escape", "relief", "the day the full move does not fit — injury, broken night, no time, bad weather", "a backup route: rain place, dark place, ten-minute place, hurt place"],
    "steps": [{ "say": "Ten minutes counts. Slow is fine — around the block, the yard, the hallway. The streak is the daily fact, not the speed.", "seconds": 60 }, { "say": "Halfway. Turn when you're ready.", "seconds": 60 }, { "say": "That's the rep. Done, and it counts.", "seconds": 5 }],
    "source": "Journey knowledge base move (downgrade the intensity, keep the streak — after the July bike crash) + KB move (keep a backup route for every condition)",
  },
  {
    "id": "hunger-scale",
    "name": "The hunger scale check",
    "situations": ["fuel vs the urge is unclear", "check-in time, before choosing"],
    "steps": [{ "say": "On a scale of one to ten, where's your stomach hunger right now — one is empty, ten is stuffed?", "seconds": 10 }, { "say": "Got it. That number tells us which door this is.", "seconds": 3 }],
    "source": "MetaBalance mindfulness library (Hunger-Fullness Check) — ADAPTED: the source's prescriptive closing line is cut; the answer routes to his declared need and his playbook",
  },
  {
    "id": "body-scan",
    "name": "Body scan settle",
    "situations": ["soothe", "relief", "tired", "wound up in the body", "before sleep", "end of day"],
    "steps": [{ "say": "Settle in. We're just going to walk through the body, slow.", "seconds": 10 }, { "say": "Feet and legs. Let them be heavy.", "seconds": 30 }, { "say": "Hands and arms. Unclench what you can.", "seconds": 30 }, { "say": "Shoulders and jaw — your two tension spots. Let them drop.", "seconds": 30 }, { "say": "One slow breath out.", "seconds": 15 }, { "say": "Where does the urge sit now?", "seconds": 10 }],
    "source": "MetaBalance mindfulness library (Progressive Body Scan) — ADAPTED: framing and benefit claims stripped, cut to about 3 minutes, tension spots personalized from his declared precursor sensations",
  },
  {
    "id": "quiet-minutes",
    "name": "Five quiet minutes",
    "situations": ["escape", "soothe", "overwhelmed, needing stillness", "after a hard call"],
    "steps": [{ "say": "Five quiet minutes. Sit down, breathe natural.", "seconds": 60 }, { "say": "Notice the breath. Nothing to fix.", "seconds": 60 }, { "say": "Mind wandering is fine. Come back to the breath.", "seconds": 120 }, { "say": "Almost done. One more minute of quiet.", "seconds": 55 }, { "say": "That's five. How does the urge sit now?", "seconds": 5 }],
    "source": "MetaBalance mindfulness library (5-Minute Meditation) + AI-BUDDY wellness_toolbox.py timed-cue meditation guidance — ADAPTED: tradition name and benefit language dropped; timed spoken cues only",
  },
  {
    "id": "mindful-eating",
    "name": "Eat it slowly, on purpose",
    "situations": ["mid-eating, a meal he chose", "intentional eating", "restaurant", "food he wants to actually enjoy"],
    "steps": [{ "say": "First three bites — slow. Actually taste them.", "seconds": 60 }, { "say": "Fork down between bites. It'll wait.", "seconds": 120 }],
    "source": "MetaBalance mindfulness library (Mindful Eating Practice) — ADAPTED: prescriptive practice script cut to two spoken beats inside a meal he chose; hands off to the flavor-peak check at the midpoint",
  },
  {
    "id": "body-check-first",
    "name": "Catch what's happening first",
    "situations": ["the opening of a session when something is already stirring", "precursor sensations", "risk window", "grazing or all-day drift"],
    "steps": [{ "say": "What's your body doing right now — jaw, shoulders, stomach, hands?", "seconds": 20 }, { "say": "What thought is running with it?", "seconds": 15 }, { "say": "Give the urge a number, one to five.", "seconds": 10 }],
    "source": "Crackthecode pre-workshop precursor inventory + Lisa layer (internal only — never surfaced in app copy): the pre-feel snapshot — ADAPTED: no chain analysis, no coaching; he declares, the app reflects his words",
  },
  {
    "id": "place-check-in",
    "name": "Arriving at a named place",
    "situations": ["at a named danger place", "driving arrival", "place shield armed session"],
    "steps": [{ "say": "You're at {place}. Quick check before anything else — hunger, or the urge?", "seconds": 10 }],
    "source": "AI-BUDDY Location Wellness (location_wellness.py) arrival pattern and spoken check — ADAPTED: user-armed place shield trigger instead of background GPS, his playbook answers instead of the fixed generic suggestion list, errors stay silent (never fail open)",
  },
  {
    "id": "twenty-minute-look",
    "name": "The twenty-minute look",
    "situations": ["after eating, at respawn or the next check-in — never mid-moment", "learning capture"],
    "steps": [{ "say": "Twenty minutes on — how did that actually land? Body, head, the lot.", "seconds": 20 }],
    "source": "Lisa layer (internal only — never surfaced in app copy): reward honesty, twenty minutes later + journey KB method (the honest twenty-minute look) — ADAPTED: a reflection question at the close only; nobody scores it",
  },
  {
    "id": "two-dials",
    "name": "Two dials at the end",
    "situations": ["end of a chosen meal", "intentional eating close", "event food"],
    "steps": [{ "say": "Two quick numbers. Fullness — one to ten?", "seconds": 10 }, { "say": "And satisfaction — how good was it, really — one to ten?", "seconds": 10 }],
    "source": "Lisa layer (internal only — never surfaced in app copy): fullness and satisfaction rated separately + journey KB move (the missing dial tells you what would actually finish the meal) — ADAPTED: outcome capture he declares, never a grade",
  },
  {
    "id": "event-plan",
    "name": "At the event: pick what you can portion",
    "situations": ["family celebration", "buffet", "the food you cannot portion", "everyone else having some"],
    "steps": [{ "say": "Here's the event plan, in your words: pick the thing you can portion — the sandwich over the pizza you can't stop at. One small piece of the good stuff is the plan, not a slip. Limit the quantity; nothing is denied.", "seconds": 10 }],
    "source": "Journey knowledge base moves + pattern P10 (moderation at events, denial nowhere) — ADAPTED: a spoken game plan for one event from his own recorded rules, not a paced exercise or a standing food rule",
  },
  {
    "id": "room-setup",
    "name": "Set up the room",
    "situations": ["calm time only — offered after a conversation ends, as a for-later action item", "a repeated place trigger", "trigger food in the house"],
    "placement": "calm",
    "steps": [{ "say": "One calm-time rep to consider: move the thing that keeps showing up in your moments out of sight — high shelf, or out of the house. Want it on your list?", "seconds": 10 }],
    "source": "Lisa layer (internal only — never surfaced in app copy): environment over willpower, reduce friction at calm time — ADAPTED: a post-conversation action item from his own words, never an in-the-moment lead",
  },
  {
    "id": "tense-and-let-go",
    "name": "Tense and let go",
    "situations": ["evening wind-down", "wound up in the body", "before sleep", "end of a long day"],
    "steps": [{ "say": "Lie down or settle back. We're going to tense and let go, one part at a time.", "seconds": 10 }, { "say": "Feet and legs — squeeze them tight.", "seconds": 5 }, { "say": "And let go. Feel the difference.", "seconds": 15 }, { "say": "Hands and arms — make fists, squeeze.", "seconds": 5 }, { "say": "Let go. Let them be heavy.", "seconds": 15 }, { "say": "Shoulders up to your ears — tight.", "seconds": 5 }, { "say": "Drop them. Done holding.", "seconds": 15 }, { "say": "One slow breath out. Where does the urge sit now?", "seconds": 10 }],
    "source": "AI-BUDDY self_care.py (Progressive Relaxation recommendation, fetched from the GitHub backup in v1.1) — ADAPTED: benefit claims stripped; the tense-release sweep is led at wind-down length",
  },
  {
    "id": "stretch-break",
    "name": "Stretch break",
    "situations": ["work day", "caretaking strain", "body tension he names", "morning — the wake-up variant", "sitting too long"],
    "steps": [{ "say": "Stand up if you can. We're just loosening what's tight.", "seconds": 10 }, { "say": "Shoulders back — roll them, five slow ones.", "seconds": 20 }, { "say": "Now forward, five more.", "seconds": 20 }, { "say": "Head tilts — ear toward one shoulder, then the other. Gentle.", "seconds": 20 }, { "say": "Reach up tall, then bend a little to each side.", "seconds": 20 }, { "say": "That's the break. How does the body sit now?", "seconds": 10 }],
    "source": "AI-BUDDY self_care.py (Tension Release Stretches + Morning Stretch Routine, fetched from the GitHub backup in v1.1) — ADAPTED: treatment framing and claims stripped; the led moves only",
  },
  {
    "id": "step-outside",
    "name": "Step outside",
    "situations": ["escape", "relief", "stuck indoors all day", "evening at home", "after a hard call"],
    "steps": [{ "say": "Step outside — porch, yard, doorway, anywhere with open air.", "seconds": 25 }, { "say": "Feel the air on your face. Just stand in it.", "seconds": 30 }, { "say": "Listen — what's the farthest sound you can hear?", "seconds": 30 }, { "say": "Look at the sky for one slow breath.", "seconds": 20 }, { "say": "That's the rep. How does the urge sit, out here?", "seconds": 10 }],
    "source": "AI-BUDDY self_care.py (Brief Nature Connection, fetched from the GitHub backup in v1.1) — ADAPTED: cortisol and mood claims stripped; a stationary outdoor pause, no walk required",
  },
  {
    "id": "pen-moving",
    "name": "Pen moving — five minutes",
    "situations": ["numb", "bored", "seated with paper nearby — waiting room, kitchen table", "an unoccupied mind, no project at hand"],
    "steps": [{ "say": "Grab paper and a pen — anything that writes.", "seconds": 20 }, { "say": "Let the pen move. Lines, loops, scribbles — nothing to make, nowhere to get to.", "seconds": 140 }, { "say": "Still going. No judging it — just movement.", "seconds": 130 }, { "say": "That's five minutes. Where does the urge sit?", "seconds": 10 }],
    "source": "AI-BUDDY self_care.py (Quick Doodle Session, fetched from the GitHub backup in v1.1) — ADAPTED: brain-region claims stripped; the seated absorption rep for when his standing pursuit is not at hand",
  },
  {
    "id": "one-thank-you",
    "name": "Send one thank-you",
    "situations": ["lonely", "calm time only — offered after a conversation ends, as a for-later action item"],
    "placement": "calm",
    "steps": [{ "say": "One for-later rep: send one short thank-you to somebody who's earned it — a text is plenty. Want it on your list?", "seconds": 10 }],
    "source": "AI-BUDDY self_care.py (Gratitude Message, fetched from the GitHub backup in v1.1) — ADAPTED: a for-later action item after the conversation (his locked interaction model), never an in-the-moment lead; benefit claims stripped",
  },
  {
    "id": "three-good-things",
    "name": "Three good things",
    "situations": ["end of day", "calm time", "respawn close — the day gets closed honest"],
    "steps": [{ "say": "Close the day honest. Three things that went well today — small counts. First one?", "seconds": 20 }, { "say": "Second?", "seconds": 15 }, { "say": "Third?", "seconds": 15 }, { "say": "And the best moment of the day — the one worth keeping?", "seconds": 15 }, { "say": "Saved, in your words. That's the day, closed.", "seconds": 5 }],
    "source": "AI-BUDDY self_care.py (Quick Journal Check-in + Daily Highlight Reflection, fetched from the GitHub backup in v1.1) — ADAPTED: spoken at day close, his answers saved verbatim, nobody scores them",
  },
  {
    "id": "one-word",
    "name": "One word for today",
    "situations": ["morning arming", "calm time only — a setup rep, never an in-the-moment lead"],
    "steps": [{ "say": "One word for today — the word you want steering. Say it out loud.", "seconds": 15 }, { "say": "{word} — locked in. That word rides the day, and I'll speak it back when a moment needs it.", "seconds": 5 }],
    "source": "AI-BUDDY self_care.py (Intention Setting, fetched from the GitHub backup in v1.1) — ADAPTED: a calm-time morning arming rep; the word he declares becomes a spoken fill the brain can deal back, like his why line",
  },
  {
    "id": "run-the-movie",
    "name": "Run the whole movie",
    "situations": ["a live urge with a named food", "a justification script running — 'just this once'", "urge 3-5", "evening at home", "right after what he stocked to have instead was declined"],
    "steps": [{ "say": "The urge is only showing you the first bite. Let's run the whole movie — your version, the way it usually goes.", "seconds": 10 }, { "say": "First scene: the eating itself. See it? That's the part the urge keeps replaying.", "seconds": 15 }, { "say": "Now twenty minutes later. The food's done. How does that version of the evening feel — body, head, the lot?", "seconds": 20 }, { "say": "Now the end of the night. Getting ready for bed with that evening behind you.", "seconds": 15 }, { "say": "And tomorrow morning. First coffee, new day. Which morning do you want to wake up inside?", "seconds": 20 }, { "say": "That's the whole movie — not just the first bite. Which ending are we choosing?", "seconds": 10 }],
    "source": "Gap-check candidates v1.0, candidate 1 (Pass B — first-person recovery accounts and recovery-community tool collections across independent communities; grade: emerging — strong convergence, no direct trials) — the prospective mirror of entry 27's retrospective look; the movie is built entirely from his own past pattern",
  },
  {
    "id": "tomorrows-plan",
    "name": "Put it on tomorrow's plan",
    "situations": ["a strong craving for one specific food", "scarcity panic — 'if I don't have it now, I lose it'", "evening", "a plateau stretch where rigid striving is wearing thin"],
    "steps": [{ "say": "We're not fighting this one tonight — we're putting it on tomorrow's plan. On purpose, on the books.", "seconds": 8 }, { "say": "Name it out loud: the food, and tomorrow's time and place for it. Say the whole plan.", "seconds": 20 }, { "say": "Hear what that is: a promise to yourself, not a new rule. Tomorrow it is yours — planned and legit, no guilt attached, nothing to sneak.", "seconds": 10 }, { "say": "And if it happens tonight anyway, that's data, not a failure — we log it, and the plan still stands. Now: what's tonight's move while tomorrow holds that one?", "seconds": 10 }],
    "source": "Gap-check candidates v1.0, candidate 2 (Pass A — Coelho do Vale, Pieters & Zeelenberg, 'planned hedonic deviations,' Journal of Consumer Psychology 2016; grade: moderate) — GUARDRAIL carried from the ruling, in the step wording: the plan is a promise to himself, never a new restriction; eating it tomorrow is legitimate, and eating it early is data for the respawn flow, not a failure",
  },
  {
    "id": "picture-tomorrow",
    "name": "Picture tomorrow morning",
    "situations": ["a live urge", "an impulsive grab moment", "grocery store and other buying moments", "evening kitchen terrain"],
    "steps": [{ "say": "Close your eyes if you can. We're going to tomorrow morning — not a lecture, a picture.", "seconds": 8 }, { "say": "First light. You're up. See where you are — the kitchen, the coffee starting.", "seconds": 20 }, { "say": "Feel how you want to feel in that moment — clear, steady, glad about how last night went.", "seconds": 20 }, { "say": "Stay in it a breath longer. That morning is real — and tonight is how you get there.", "seconds": 15 }, { "say": "Open your eyes. The urge is here, and so is that morning. What's the move that keeps both?", "seconds": 10 }],
    "source": "Gap-check candidates v1.0, candidate 3 (Pass A — episodic future thinking: Daniel, Stanton & Epstein, Psychological Science 2013; Eating Behaviors 2015; Hollis-Hansen et al., Appetite 2019; grade: moderate — lab settings, acute outcomes) — shipped in the led-live form; the calm-time recorded/written personal scene, dealt back like his why line, is the setup residual. Kept distinct from entry 10 (why-line) on purpose: a scene, not a sentence — RESIDUAL CLOSED (material-slots build): the scene now has its calm-time slot (ShieldPlan.tomorrowScene); with one saved, a run leads his scene between the opening and closing steps, and the scene also rides the brain's conversation context as material, dealt back while he is deciding",
  },
  {
    "id": "mouth-reset",
    "name": "The mouth reset",
    "situations": ["eating is done — after a chosen meal", "evening grazing", "post-meal lingering", "the 'one more bite' drift", "kitchen terrain after step away"],
    "steps": [{ "say": "Eating's done — let's put the full stop on it. Brush your teeth. Or a strong mint rinse — gum for a stretch if that's what's at hand.", "seconds": 30 }, { "say": "Mouth's clean, the taste of food gone. That's eating, closed.", "seconds": 8 }],
    "source": "Gap-check candidates v1.0, candidate 4 (Pass B — convergent first-person and practitioner accounts; gum variant: Hetherington & Boyland 2007 and the Nutrients 2025 gum-trial review; grade: emerging) — the sensory close: entry 16 moves the body away from the table, this takes the mouth out of eating mode, anywhere",
  },
  {
    "id": "text-first",
    "name": "Send the text first",
    "situations": ["alone", "evening", "a live urge of any named need — strongest for lonely", "any moment where being unseen is part of the urge"],
    "steps": [{ "say": "Before any eating — the text. The one you set up with your witness for exactly this: the urge is up, you're staying with your plan, you just needed somebody to know.", "seconds": 10 }, { "say": "Send it now. I'll wait.", "seconds": 30 }, { "say": "Sent. Somebody knows — and they knew before the choice. That's the whole move.", "seconds": 8 }, { "say": "Now we stay here a minute. How does the urge sit, with a witness on it?", "seconds": 45 }],
    "source": "Gap-check candidates v1.0, candidate 5 (Pass B — first-person recovery accounts and peer-support program practice; grade: emerging) — the witness and the pre-written text are his calm-time arrangement (the text lives in his messages, written by him in advance); the in-app setup surface — name the witness, hold the text on his plan — is the residual. The clinical texting-program version is a therapy adjunct and does not port; the standalone peer move is what ships",
  },
  {
    "id": "photo-first",
    "name": "Photo before the first bite",
    "situations": ["unplanned food appearing — somebody offers, a spread, a drive-through stop", "a mid-drift moment", "social events, alongside the event plan"],
    "steps": [{ "say": "Before the first bite — take its picture.", "seconds": 12 }, { "say": "Now look at it. Really look. Still the plan?", "seconds": 12 }, { "say": "Decide looking, not drifting — eat it on purpose or let it pass, your call. Either way the picture's done its job; it isn't a log, and it doesn't need keeping.", "seconds": 10 }],
    "source": "Gap-check candidates v1.0, candidate 6 (Pass A/B — Zepeda & Deal 2008, 43-person photo-diary pilot, effect at the decision point, plus photo-journal field studies; grade: emerging) — BUILD FLAG honored in the step wording: a pause device, never a log — the photo is looked at and done; it must never grow a gallery, a history, or a review screen",
  },
  {
    "id": "wait-for-signal",
    "name": "Wait for the signal",
    "situations": ["plate one finished and seconds are calling", "mid-meal, at the table", "family table and buffet settings", "clean-plate pattern"],
    "steps": [{ "say": "Plate one is done. Before seconds get a vote, we wait for the signal — fullness takes about twenty minutes to report in. This isn't a test; it's just letting the message arrive.", "seconds": 10 }, { "say": null, "seconds": 570 }, { "say": "Halfway. Still sitting with it — how's the body feeling so far?", "seconds": 15 }, { "say": null, "seconds": 540 }, { "say": "Twenty minutes. The signal's had its chance to land. Two quick numbers: how full — and how satisfied?", "seconds": 15 }, { "say": "Seconds now are your call, made on purpose, with the real information in. Either answer is fine.", "seconds": 8 }],
    "source": "Gap-check candidates v1.0, candidate 7 (Pass A/B — standard satiety-lag guidance; slow-eating trials, e.g. Andrade, Greene & Melanson 2008; grade: emerging — the premise is textbook, the standalone rule untested, the twenty minutes a design-choice number) — the wait is for information, letting the signal arrive; never a test he can fail",
  },
  {
    "id": "close-the-kitchen",
    "name": "Close the kitchen",
    "situations": ["evening at home", "night eating", "grazing terrain", "a kitchen that stays 'open' all night"],
    "steps": [{ "say": "Time to close the kitchen for the night. We'll do it the same way every night — that's what makes it work.", "seconds": 8 }, { "say": "Dishes away first. Clear the counters as you go.", "seconds": 45 }, { "say": "Last look around — nothing left out, nothing calling.", "seconds": 20 }, { "say": "Now say it out loud, like you mean it: Kitchen's closed — see you at breakfast.", "seconds": 10 }, { "say": "Lights off, out of the room. The eating day is over — declared by you, in your kitchen.", "seconds": 10 }],
    "source": "Gap-check candidates v1.0, candidate 8 (Pass B — convergent published routines: a national support organization's chapter library, a food-diary service's expert column, first-person evening routines; grade: emerging) — FLAGGED near-dup at ruling: adjacent to entry 30 (room-setup, a one-off calm-time surroundings change) and entry 16 (step-away, leaving one meal's table); the new content is the fixed nightly ritual shape — a spoken declaration that closes the whole eating day",
  },
  {
    "id": "kind-sentence",
    "name": "One kind sentence",
    "situations": ["just ate / a slip happened", "shame risk", "the spiral that turns one episode into a lost day"],
    "steps": [{ "say": "Before anything else — the sentence you wrote at calm time, for exactly this moment. Say it now, out loud, in your own words.", "seconds": 20 }, { "say": "Hear whose side that puts you on. Yours. That's the whole rep — one sentence, yours, once.", "seconds": 10 }, { "say": "That's it — the way you wrote it to work. Nothing reset; next meal as normal.", "seconds": 5 }],
    "source": "Gap-check candidates v1.0, candidate 9 (Pass A — Journal of Human Nutrition and Dietetics 2025 systematic review/meta-analysis: self-compassion techniques among those with the greatest emotional-eating improvements; grade: emerging) — NARROWNESS CONDITIONS, carried from the ruling: his own calm-time-authored sentence ONLY, spoken once at the post-slip moment, then the conversation routes to the reset as usual; the app authors no comfort language of its own, runs no meditation and no compassion protocol, and uses no therapy framing — the therapy built on this territory (compassion-focused therapy) stays out, and this entry lives nearest the fence, next to EXCLUDE entry 35. SHIPPED FORM: the app holds no sentence of its own — the steps lead him to speak his written sentence aloud himself; the dealt-back form (the brain speaking his stored sentence, like the {replacement} fill) awaits a calm-time storage slot for it — SLOT BUILT (material-slots build): ShieldPlan.kindSentence now holds his sentence, and the dealt-back form rides the brain's context — drawn on once, composed around (never recited as a script), in the respawn moment. This action still leads him to say it himself: his saying it is the rep",
  },
];

export type GuidedActionKind = string;

export function modalityById(id: string): ModalityDef | null {
  return MODALITY_REPERTOIRE.find((m) => m.id === id) ?? null;
}

// Where an entry may surface: "moment" (offerable as an in-the-moment
// guided action) or "calm" (calm-time, for-later only). Absent field
// means "moment" — only the catalog's calm-time rulings carry "calm".
export function modalityPlacement(id: string): "moment" | "calm" {
  return modalityById(id)?.placement ?? "moment";
}

export function isGuidedActionKind(value: unknown): value is GuidedActionKind {
  return typeof value === "string" && modalityById(value) !== null;
}

export function actionLabel(kind: GuidedActionKind): string {
  return modalityById(kind)?.name ?? kind;
}

// ---------- Paced steps, materialized from the data ----------

// One paced step as the client runs it: speak `say` (Fish first), or
// play his recorded reset line for a playReset step (its `say` is
// the spoken fallback), then wait `waitSeconds` of quiet. The waits
// are the pacing — an exercise led too fast is just a list read aloud.
export interface ActionStep {
  say?: string;
  playReset?: boolean;
  waitSeconds: number;
}

export interface ActionContext {
  // The swap dealt from his plan for this moment (or his first
  // stocked option) — his own words. Null when nothing is stocked;
  // a "swap" run then materializes to no steps and does not run.
  swapText: string | null;
  // His why line, verbatim — fills `{why}` (the reset step's spoken
  // fallback when no reset recording exists).
  whyLine: string | null;
  // The replacement line from his Shield Plan thought pairs (the
  // positive side of a pair he wrote) — fills `{replacement}`.
  replacementText: string | null;
  // The place he just named in this conversation — fills `{place}`.
  placeText: string | null;
  // The need he just declared, as a spoken phrase — fills `{need}`.
  needText: string | null;
  // The word he declared for today (the one-word arming), verbatim —
  // fills `{word}` so a later run speaks his word back to him, the
  // way `{why}` speaks his why line. Null when no word is set today.
  wordText: string | null;
  // His stored tomorrow-morning scene (the material slot on his
  // plan), verbatim — when set, the picture-tomorrow run leads HIS
  // picture between its opening and closing steps instead of the
  // generic scene steps (see actionSteps). Null when he has saved
  // no scene; the action then leads its generic form, unchanged.
  sceneText: string | null;
}

// His declared needs as spoken phrases, for the `{need}` fill — the
// same plain words the catalog's own steps use ("comfort, a break,
// calming down, zoning out, a reward, or relief").
export const NEED_SPOKEN: Record<string, string> = {
  comfort: "comfort",
  escape: "a break",
  soothe: "calming down",
  numb: "zoning out",
  reward: "a reward",
  relief: "relief",
  fuel: "real fuel",
  tired: "rest",
  stressed: "winding down",
  bored: "something to do",
  lonely: "people",
};

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];

// A beats-script tool: speak each beat's line at its offset; the
// wait after a beat is the distance to the next, and the last beat's
// wait runs out the tool's duration.
function beatSteps(tool: PauseTool): ActionStep[] {
  if (tool.script.kind !== "beats") return [];
  const beats = tool.script.beats;
  return beats.map((beat, i) => {
    const next = beats[i + 1];
    const wait = next ? next.at - beat.at : Math.max(3, tool.durationSeconds - beat.at);
    return { say: beat.text, waitSeconds: wait };
  });
}

// A breath-phase tool: speak the phase label, wait the phase length,
// repeat the cycle until the tool's ~90 seconds are used — the same
// loop the pause timer runs, in voice.
function breathSteps(tool: PauseTool): ActionStep[] {
  if (tool.script.kind !== "breath") return [];
  const phases = tool.script.phases;
  const cycle = phases.reduce((sum, p) => sum + p.seconds, 0);
  const cycles = Math.max(1, Math.round(80 / cycle));
  const steps: ActionStep[] = [];
  for (let c = 0; c < cycles; c++) {
    for (const phase of phases) {
      steps.push({ say: phase.label, waitSeconds: phase.seconds });
    }
  }
  return steps;
}

function fillTemplate(text: string, ctx: ActionContext, pass: number): string {
  return text
    .replaceAll("{swap}", ctx.swapText ?? "")
    .replaceAll("{why}", ctx.whyLine ?? "")
    .replaceAll("{replacement}", ctx.replacementText ?? "")
    .replaceAll("{place}", ctx.placeText ?? "")
    .replaceAll("{need}", ctx.needText ?? "")
    .replaceAll("{word}", ctx.wordText ?? "")
    .replaceAll("{scene}", ctx.sceneText ?? "")
    .replaceAll("{ordinal}", ORDINALS[pass] ?? String(pass + 1))
    .replaceAll("{n}", String(pass + 1))
    .replace(/\s+/g, " ")
    .trim();
}

export function actionSteps(kind: GuidedActionKind, ctx: ActionContext): ActionStep[] {
  const def = modalityById(kind);
  if (!def) return [];
  if (def.toolId) {
    const tool = toolById(def.toolId);
    return tool.script.kind === "beats" ? beatSteps(tool) : breathSteps(tool);
  }
  // A swap with nothing stocked is not an action — no steps, no run.
  if (def.id === "swap" && !ctx.swapText) return [];
  // picture-tomorrow with his scene saved: the run leads HIS
  // picture — the catalog's opening step, then his scene as one
  // step (the {scene} fill), then the closing step. The generic
  // middle steps stand down. With no scene saved, the entry's own
  // steps run exactly as cataloged.
  const defSteps =
    def.id === "picture-tomorrow" && ctx.sceneText
      ? [def.steps[0], { say: "{scene}", seconds: 30 }, def.steps[def.steps.length - 1]]
      : def.steps;
  const passes = Math.max(1, def.repeat ?? 1);
  const steps: ActionStep[] = [];
  for (let pass = 0; pass < passes; pass++) {
    for (const step of defSteps) {
      const say = step.say ? fillTemplate(step.say, ctx, pass) : "";
      // A step whose spoken slot couldn't be filled from his plan or
      // his declared words (a {placeholder} survived) makes the whole
      // action unavailable — the app never speaks a raw placeholder
      // and never leads a hollow step. The one exception is a
      // playReset step: his recording carries it, so an unfilled
      // spoken fallback is simply dropped.
      if (say && /\{[a-z]+\}/.test(say)) {
        if (!step.playReset) return [];
        steps.push({ playReset: true, waitSeconds: step.seconds });
        continue;
      }
      steps.push({
        ...(say ? { say } : {}),
        ...(step.playReset ? { playReset: true } : {}),
        waitSeconds: step.seconds,
      });
    }
  }
  return steps;
}

// ---------- Situation rankings (catalog correlation map, as data) ----------

// The catalog's situation → ranked-moves correlation map (repertoire
// v1.0, Markdown companion; v1.2 additions appended conservatively —
// new moves at the END of existing rows, never displacing the order
// his record ranks by, plus new rows for the time-axis wing and the
// between-helpings seat), as data: when a moment matches a
// situation, these are the moves in preference order. The converse
// prompt renders this table under one ranking rule that outranks
// the table itself: HIS OWN SESSION RECORD first — a move he marked
// "good" goes first, one he marked "to work on" drops below its
// alternates. Needs in the situation lines are always his declared
// words.
export interface SituationRanking {
  situation: string;
  moves: GuidedActionKind[];
  note?: string;
}

export const SITUATION_RANKING: SituationRanking[] = [
  { situation: "Live urge, nothing named yet", moves: ["name-the-job", "breathing", "hunger-check"] },
  { situation: "Strong urge (4–5), he wants to ride it out", moves: ["urge-surfing", "long-pause", "walk", "run-the-movie"] },
  { situation: "Moment moving too fast / autopilot starting", moves: ["stop", "breathing", "grounding"] },
  { situation: "Wound up / stressed (declared)", moves: ["breath-478", "box-breathing", "body-scan"] },
  { situation: "Numb / bored / flat, head elsewhere", moves: ["grounding", "get-absorbed", "quiet-minutes"] },
  { situation: "Tired / broken night (declared)", moves: ["rest", "water-first", "walk-short"] },
  {
    situation: "Justification script running (e.g. 'I've earned it')",
    moves: ["replacement-line", "why-line", "name-the-job", "run-the-movie"],
  },
  { situation: "Need declared: comfort", moves: ["box-breathing", "swap", "body-scan"], note: "what he stocked to have instead, function-matched" },
  { situation: "Need declared: escape", moves: ["walk", "get-absorbed", "stop"] },
  { situation: "Need declared: soothe / relief", moves: ["breath-478", "body-scan", "quiet-minutes"] },
  { situation: "Need declared: reward", moves: ["swap", "why-line", "long-pause"], note: "what he stocked to have instead is his pre-chosen reward" },
  {
    situation: "Need declared: lonely",
    moves: ["swap", "get-absorbed", "quiet-minutes", "text-first"],
    note: "what he has instead here is the call-a-person option from his own list; the witness text is strongest for lonely",
  },
  { situation: "Evening at home (recliner / TV / kitchen terrain)", moves: ["body-check-first", "walk", "urge-surfing"] },
  {
    situation: "Arriving at a named danger place",
    moves: ["place-check-in", "hunger-check", "stop", "swap"],
    note: "the place check-in first, the hunger check right after",
  },
  {
    situation: "Body hunger confirmed by the check",
    moves: ["mindful-eating", "flavor-peak", "two-dials"],
    note: "eating is the plan — eat it on purpose",
  },
  { situation: "Mid-eating, a meal he chose", moves: ["flavor-peak", "mindful-eating", "step-away"] },
  {
    situation: "Plate one finished, seconds calling",
    moves: ["wait-for-signal", "flavor-peak", "two-dials"],
    note: "the wait is for information, not a test he can fail",
  },
  { situation: "Social event / family table", moves: ["event-plan", "flavor-peak", "step-away", "photo-first"] },
  {
    situation: "Just ate / a slip happened",
    moves: ["reset", "twenty-minute-look", "replacement-line", "kind-sentence"],
    note: "the twenty-minute look belongs at the close, never mid-moment; the kind sentence — his own, spoken once — belongs first when the slip just happened, then the reset; it is listed last so the table never displaces his record order",
  },
  { situation: "Grazing / all-day drift", moves: ["body-check-first", "hunger-scale", "get-absorbed"] },
  { situation: "Something stirring, unnamed", moves: ["body-check-first", "name-the-job", "breathing"] },
  {
    situation: "The urge is really about later — now-or-never panic over one specific food",
    moves: ["tomorrows-plan", "picture-tomorrow", "run-the-movie"],
    note: "the time-axis wing (catalog v1.2): tomorrow is part of the plan, never a denial",
  },
  {
    situation: "Eating just ended, evening grazing starting",
    moves: ["mouth-reset", "close-the-kitchen", "step-away"],
    note: "the mouth reset is the sensory close; close the kitchen is the nightly ritual that ends the eating day",
  },
  {
    situation: "Calm time, a repeated place/food trigger",
    moves: ["room-setup", "why-line"],
    note: "room setup is a for-later item, offered after the conversation, not led in the moment",
  },
  {
    situation: "Plateau / flat stretch (calm time)",
    moves: ["why-line", "walk-short"],
    note: "the streak is the fact",
  },
];

// ---------- Deterministic response parsing (explicit words only) ----------

function words(text: string): string {
  return ` ${text.toLowerCase()} `;
}

// His answer to an action proposal: take it, pass on it, or neither
// (he changed the subject — the proposal is let go either way, and
// the conversation answers what he actually said).
export type ActionResponse = "accept" | "decline" | "other";

export function parseActionResponse(text: string): ActionResponse {
  const t = words(text);
  if (
    /\b(not now|no thanks|no thank you|skip( it)?|pass|later|not really|don't want|do not want|nah|nope)\b/.test(t) ||
    /^\s*no\b/.test(t)
  ) {
    return "decline";
  }
  if (
    /\b(yes|yeah|yep|okay|ok|sure|let's|lets|go ahead|sounds good|do it|please|breath\w*|walk)\b/.test(t)
  ) {
    return "accept";
  }
  return "other";
}

// The closing question the app asks out loud when a talk session
// ends — plain words, his framing: a good outcome, or one to work on.
export const OUTCOME_QUESTION =
  "Before we finish — how did that land? Was it a good outcome, or is it one to work on?";

// His mark on a session, from his spoken answer to the closing
// question. Ambiguous answers stay unmarked (null) — a record he
// didn't make is worse than no record.
export type SessionOutcome = "good" | "work-on";

export function parseOutcome(text: string): SessionOutcome | null {
  const t = words(text);
  // "Work on" side first: its phrases contain words ("good", "work")
  // that must not leak into the good side.
  if (
    /\b(didn't help|did not help|doesn't help|not good|no good|needs work|need work|to work on|work on it|still strong|still there|worse|nothing changed|not really)\b/.test(
      t,
    ) ||
    /^\s*no\b/.test(t)
  ) {
    return "work-on";
  }
  if (
    /\b(helped|helpful|worked|good outcome|better|calmer|calm now|great|good)\b/.test(t) ||
    /^\s*(yes|yeah|yep)\b/.test(t)
  ) {
    return "good";
  }
  return null;
}

// A guided-action lifecycle note the client sends with a converse
// turn: a proposed action ran to completion, or he passed on it. The
// route validates the kind against the repertoire and composes the
// wording the model sees itself — the client never injects free text
// into the prompt.
export interface ConverseEvent {
  type: "action-completed" | "action-declined";
  kind: GuidedActionKind;
}

// One past talk session as the brain is told about it: the action
// that ran (label, or null for talk-only) and the outcome HE marked.
// Built by the client from his own journal; the route only ever
// repeats it back as his record.
export interface SessionOutcomeItem {
  date: string;
  action: string | null;
  outcome: SessionOutcome | null;
  choice: string | null;
}
