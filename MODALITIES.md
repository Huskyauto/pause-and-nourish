# Pause & Nourish — Modality & Intervention Catalog

**Version:** v1.1 — 2026-11-03
**Status:** Submission document. Describes the shipped system at SW v47 (commit `ee2143c`). Every entry below is generated from the live repertoire data in `src/lib/actions.ts` — names, fits, and gates are the app's own, not marketing copy.

## Changelog
- v1.1 (2026-11-03): Selection note added (why 47 of the 56 catalog entries shipped), from Meta AI's final review; only the verified reasons are stated.
- v1.0 (2026-11-03): Initial catalog, extracted from the shipped v47 repertoire (47 moves), the situation-ranking table (25 moment types), and the intervention surfaces around them.

## How the system works

- In a live conversation, the second brain (Muse Spark 1.2) learns the shape of the moment from what the user declares — where they are, body hunger or the urge, how strong, what they need — and may propose **one** guided move. If the user says yes, the app leads it step by step, out loud.
- **A move's steps and pacing are fixed data — an exercise is an instrument.** The model chooses *which* move and composes everything said around it; it never writes step text, never invents a technique, and never offers a move that isn't in this catalog.
- **Several moves speak the user's own words back** — their why line, their written reframe pairs, their kind sentence, their word for today, their daily lines. A move like that doesn't exist until the user writes the words at calm time; the route enforces this (no words saved → the move is not offerable).
- The user's own session record outranks the moment map below: a move they marked "good" rises to the front for that kind of moment; one marked "to work on" drops below its alternates.
- A pass is a complete answer. A declined move is never re-proposed in the same conversation, and **eating is always a legitimate outcome** — the moves serve the pause, not compliance.
- Two moves are gated to calm time: they are never offered inside a moment, only afterwards, as for-later action items.

## 1. The moment map — what the brain reaches for, by kind of moment

Preference order, from the shipped situation-ranking table. The user's session record (above) can reorder it.

| The moment | Moves, in preference order |
|---|---|
| Live urge, nothing named yet | Name the job → Five deep breaths → The ten-second hunger check |
| Strong urge (4–5), wants to ride it out | Urge surfing → The long pause (ten minutes) → A short walk → Run the whole movie |
| Moment moving too fast / autopilot starting | STOP → Five deep breaths → Grounding, sense by sense |
| Wound up / stressed (declared) | 4-7-8 breathing → Box breathing → Body scan settle |
| Numb / bored / flat, head elsewhere | Grounding, sense by sense → Get absorbed → Five quiet minutes |
| Tired / broken night (declared) | Rest is the move → Water first, then decide → The ten-minute version |
| Justification script running ("I've earned it") | Your replacement line → Your why, in your words → Name the job → Run the whole movie |
| Need declared: comfort | Box breathing → Something stocked to have instead → Body scan settle |
| Need declared: escape | A short walk → Get absorbed → STOP |
| Need declared: soothe / relief | 4-7-8 breathing → Body scan settle → Five quiet minutes |
| Need declared: reward | Something stocked to have instead → Your why, in your words → The long pause |
| Need declared: lonely | Something stocked to have instead → Get absorbed → Five quiet minutes → Send the text first |
| Evening at home (recliner / TV / kitchen terrain) | Catch what's happening first → A short walk → Urge surfing |
| Arriving at a named danger place | Arriving at a named place → The ten-second hunger check → STOP → Something stocked to have instead |
| Body hunger confirmed by the check | Eat it slowly, on purpose → The flavor-peak check → Two dials at the end |
| Mid-eating, a meal he chose | The flavor-peak check → Eat it slowly, on purpose → Close the meal — step away |
| Plate one finished, seconds calling | Wait for the signal → The flavor-peak check → Two dials at the end |
| Social event / family table | At the event: pick what you can portion → The flavor-peak check → Close the meal — step away → Photo before the first bite |
| Just ate / a slip happened | Reset line + quiet pause → The twenty-minute look → Your replacement line → One kind sentence |
| Grazing / all-day drift | Catch what's happening first → The hunger scale check → Get absorbed |
| Something stirring, unnamed | Catch what's happening first → Name the job → Five deep breaths |
| Now-or-never panic over one specific food | Put it on tomorrow's plan → Picture tomorrow morning → Run the whole movie |
| Eating just ended, evening grazing starting | The mouth reset → Close the kitchen → Close the meal — step away |
| Calm time, a repeated place/food trigger | Set up the room → Your why, in your words |
| Plateau / flat stretch (calm time) | Your why, in your words → The ten-minute version |

## 2. The full repertoire — all 47 guided moves

★ = backed by a paced script in the 90-second pause toolkit. "Calm-gated" = never offered inside a moment (see above).

| # | Move | When it fits |
|---|---|---|
| 1 | Five deep breaths | Any declared need; a live urge with nothing else named yet; the first offer when a moment needs a lead |
| 2 | Urge surfing ★ | A strong urge the user wants to ride out rather than act on; relief, soothe; urge 3–5 |
| 3 | STOP ★ | A moment moving too fast — the user wants to stop and choose on purpose; autopilot starting; escape |
| 4 | Grounding, sense by sense ★ | Feeling numb or flat, head somewhere else — come back to the room; bored; empty evening |
| 5 | Box breathing ★ | Wound up and wanting a steady rhythm to follow; comfort; tired |
| 6 | 4-7-8 breathing ★ | Stressed; needing to settle — the longer, slower breathing; before sleep |
| 7 | Reset line + quiet pause | After a wobble: the user's own recorded reset line, then quiet — nothing reset; just ate; a slip |
| 8 | Something stocked to have instead | Real hunger or a named target food, with something stocked for this moment; comfort; reward; lonely (including the call-a-person option from their own list) |
| 9 | A short walk | Escape; relief; stressed; restless and able to move; evening at home |
| 10 | Your why, in your words | Any declared need; a justification thought running; inside a declared risk window; a plateau at calm time |
| 11 | Your replacement line | The user names the exact self-talk that is running; justification thought; a post-slip spiral starting — speaks their written reframe pair |
| 12 | The ten-second hunger check | The gate at the top of any moment; an urge just arrived; after dinner; arriving at a named place |
| 13 | Name the job | An urge is present but the need is not named yet; "I don't know why I want this" |
| 14 | The long pause — ten minutes | Any declared need; urge 4–5, when a 90-second pause is too short; evening at home |
| 15 | The flavor-peak check | Mid-eating; an intentional-eating midpoint; restaurant or event food; the clean-plate pattern |
| 16 | Close the meal — step away | End of eating; buffet or family table; kitchen lingering; night eating |
| 17 | Get absorbed | Escape; numb; bored; an unoccupied stressed mind; caretaking strain; evening at home |
| 18 | Water first, then decide | Thirst misread as hunger; a work day in the heat; nothing eaten or drunk in hours |
| 19 | Rest is the move | Tired; the broken-night next day; caretaking load; end of a long day |
| 20 | The ten-minute version | The day the full walk doesn't fit — injury, broken night, no time, bad weather; backup routes (rain place, dark place, hurt place) |
| 21 | The hunger scale check | Body hunger vs. the urge is unclear; check-in time, before choosing |
| 22 | Body scan settle | Wound up in the body; soothe; tired; before sleep; end of day |
| 23 | Five quiet minutes | Overwhelmed, needing stillness; escape; soothe; after a hard call |
| 24 | Eat it slowly, on purpose | Mid-eating, a meal the user chose; food they want to actually enjoy; restaurant |
| 25 | Catch what's happening first | The opening of a session when something is already stirring; precursor sensations; risk windows; grazing drift |
| 26 | Arriving at a named place | At a saved hard place; driving arrival; a place-armed session |
| 27 | The twenty-minute look | After eating, at respawn or the next check-in — never mid-moment; learning capture |
| 28 | Two dials at the end | End of a chosen meal; an intentional-eating close; event food |
| 29 | At the event: pick what you can portion | Family celebration; buffet; food the user cannot portion; everyone else having some |
| 30 | Set up the room *(calm-gated)* | Calm time only, offered after a conversation as a for-later item; a repeated place trigger; trigger food in the house |
| 31 | Tense and let go | Evening wind-down; wound up in the body; before sleep; end of a long day |
| 32 | Stretch break | Work day; caretaking strain; body tension the user names; the morning wake-up variant; sitting too long |
| 33 | Step outside | Stuck indoors all day; escape; relief; evening at home; after a hard call |
| 34 | Pen moving — five minutes | Numb or bored, seated with paper nearby — waiting room, kitchen table; an unoccupied mind |
| 35 | Send one thank-you *(calm-gated)* | Loneliness at calm time; offered after a conversation as a for-later item |
| 36 | Three good things | End of day; calm time; the respawn close — the day gets closed honest |
| 37 | One word for today | Morning arming — a calm-time setup rep; the declared word is spoken back later when a moment needs it |
| 38 | Tell your brain | Morning arming; calm time; starting the day on purpose — speaks the user's own saved daily lines, one step per line (added Day 9) |
| 39 | Run the whole movie | A live urge with a named food; a "just this once" justification script; urge 3–5; right after a stocked instead-option was declined |
| 40 | Put it on tomorrow's plan | A strong craving for one specific food; scarcity panic — "if I don't have it now, I lose it"; a plateau where rigid striving is wearing thin |
| 41 | Picture tomorrow morning | A live urge; an impulsive grab; grocery store and other buying moments; evening kitchen terrain — leads the user's saved picture when they've written one |
| 42 | The mouth reset | Eating is done — after a chosen meal; post-meal lingering; the "one more bite" drift; evening grazing |
| 43 | Send the text first | Alone; evening; a live urge — strongest for lonely; moments where being unseen is part of the urge. Reminds the user of their own arrangement; the app never sends anything |
| 44 | Photo before the first bite | Unplanned food appearing — somebody offers, a spread, a drive-through stop; social events, alongside the event plan |
| 45 | Wait for the signal | Plate one finished and seconds are calling; mid-meal, at the table; family table and buffet settings |
| 46 | Close the kitchen | Evening at home; night eating; grazing terrain; a kitchen that stays "open" all night |
| 47 | One kind sentence | Just ate / a slip happened; shame risk; the spiral that turns one episode into a lost day — the user's own calm-time sentence, spoken once, then the reset |

**Provenance.** Moves 1–46 were selected from a 56-entry modality catalog (v1.2) mined from the founder's own earlier apps (AI-BUDDY, MetaBalance), the distilled method layer of his program research, and his 218-video journey knowledge base, plus a bounded gap-check — each entry in `src/lib/actions.ts` carries its own source line. Move 47 (Tell your brain) was added on Day 9, adapted from a published daily self-statements practice; only the practice was adopted — the lines spoken are always the user's own.

**Selection note.** Not every catalog entry shipped. The protocol regimens — a user's vitamin, mineral, lotion, and detox routines — are held out of the in-the-moment repertoire by design: they belong to the calm-time playbook layer, as each user's own list, and the app never recommends them. The rest of the gap is selection made during distillation — the 47 that shipped are the ones that fit a 90-second, voice-led moment.

## 3. Around the moves — the rest of the intervention system

- **Talk (free-form conversation)** — the front door. The brain asks its own questions, learns the moment's shape, and gives next-step thoughts drawn only from the user's playbook, journal patterns, and this catalog.
- **The 90-second pause (SOS)** — one tap (or a headset press, below) starts a timed pause with the user's why on screen, three plain answers ("that was me" / "not me this time" / "I'm good for now"), and the 5 paced toolkit scripts (★ above). The choice is saved either way; eating lands as a checkpoint, never a failure.
- **Respawn** — after eating, the session closes with the recorded reset line and "Checkpoint saved. Nothing reset." — then the next meal is a normal meal.
- **Calm-time playbook (the Shield)** — authored when calm, dealt back in the moment: the why line; an if-then plan; what to have instead, per trigger; written reframe pairs; saved hard places (named by standing there — a name, never coordinates); declared risk windows; and the material slots — picture of tomorrow morning, text-first arrangement, kind sentence, word for today, daily lines.
- **Check-in** — a daily 1–5 self-report (hunger, stress, and more) that feeds the day picture the brain works from.
- **Journal, patterns, and the garden** — every session is journaled on-device. Pattern candidates are derived deterministically; only patterns the *user* confirms travel into the brain's context. Statistics grows one plant per completed pause.
- **Weekly review (Muse Wonder)** — a once-a-week composed reflection built from digest facts only (counts and the user's own saved learnings), in three headed sections.
- **Nudge governance** — proactive touches are capped (2/day), silenced overnight (21:30–07:00), and back off for a week after two ignored nudges. The morning heads-up is the one standing touch.
- **Deterministic signposts** — crisis and eating-disorder statements, in the user's own explicit words, are matched by a fixed word rule (not a model, not emotion detection) and answered with a fixed signpost to human support (988; the National Alliance for Eating Disorders helpline). The session's food conversation ends there.
- **The native companion (Android)** — a paired app that arms a "Second Brain Watch": a media-button press on a wireless headset, screen off, plays the user's recorded cue and reports the play back to the web app. Pairing is digest-only, single-consume, and owner-gated.
- **Voice, end to end** — every composed line is spoken by the device's own built-in voice (operating-system text-to-speech, not an AI model; an intake user's chosen neutral voice — female or male — picks a matching device voice when the device offers one); answers are heard via Muse Voice Transcribe. The one recorded element is the user's own reset line, played inside the guided reset step.
