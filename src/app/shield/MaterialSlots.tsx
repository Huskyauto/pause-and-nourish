"use client";

import { useState } from "react";
import type { ShieldPlan } from "@/lib/journal";

// Material slots (repertoire v1.2 residuals): three calm-time
// texts in the user's own words, saved for the moments they're
// for — the picture of tomorrow morning, the text-first
// arrangement, and the kind sentence for after a wobble. They are
// MATERIAL for the second brain, never scripts: the brain brings
// them back inside responses it composes live for the moment, in
// its own way. Nothing here plays by rule, and the app never sends
// the text-first text — that is always the user's to send. All
// optional, all editable anytime; blank means the slot is off and
// nothing changes.

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900 focus:border-[#2f5d3a] focus:outline-none";
const saveBtnClass =
  "rounded-full bg-[#2f5d3a] px-5 py-2.5 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-40";
const clearBtnClass =
  "text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700 disabled:opacity-40";

type SlotFieldName = "tomorrowScene" | "witnessPlan" | "kindSentence";

function SlotField({
  plan,
  onUpdate,
  field,
  heading,
  help,
  placeholder,
  maxLength,
  rows,
}: {
  plan: ShieldPlan;
  onUpdate: (next: ShieldPlan) => void;
  field: SlotFieldName;
  heading: string;
  help: string;
  placeholder: string;
  maxLength: number;
  rows: number;
}) {
  const saved = plan[field] ?? "";
  const [draft, setDraft] = useState(saved);
  const dirty = draft.trim() !== saved.trim();

  return (
    <div className="mt-8 first:mt-5">
      <h3 className="text-lg font-semibold text-stone-900">{heading}</h3>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">{help}</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className={`${inputClass} mt-3`}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
      />
      <div className="mt-2 flex items-center gap-4">
        <button
          type="button"
          className={saveBtnClass}
          disabled={!dirty}
          onClick={() => {
            const value = draft.trim();
            onUpdate({ ...plan, [field]: value ? value : null });
          }}
        >
          Save
        </button>
        <button
          type="button"
          className={clearBtnClass}
          disabled={!draft && !saved}
          onClick={() => {
            setDraft("");
            if (saved) onUpdate({ ...plan, [field]: null });
          }}
        >
          Clear
        </button>
        {saved.trim() && !dirty && <span className="text-sm text-stone-500">Saved — it&apos;s waiting for its moment.</span>}
      </div>
    </div>
  );
}

export function MaterialSlotsSection({
  plan,
  onUpdate,
}: {
  plan: ShieldPlan;
  onUpdate: (next: ShieldPlan) => void;
}) {
  return (
    <div>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        Three things you can write now, while it&apos;s calm, in your own words. Each one waits for the
        moment it&apos;s for — your second brain will bring it back in its own way, inside what it&apos;s
        already saying to you. All optional. Leave any of them blank and nothing changes.
      </p>
      <SlotField
        plan={plan}
        onUpdate={onUpdate}
        field="tomorrowScene"
        heading="Picture tomorrow morning"
        help="A few sentences, in your words: tomorrow morning going right. How you wake up, how the morning feels. When you're deciding in a hard moment, your second brain brings this picture back to you."
        placeholder="e.g. I wake up clear. Coffee's on, the day starts clean, and I'm glad about how last night went."
        maxLength={600}
        rows={4}
      />
      <SlotField
        plan={plan}
        onUpdate={onUpdate}
        field="witnessPlan"
        heading="Your text-first arrangement"
        help="Who you text before you eat, and what you'll say — your arrangement, in your words. When eating is close, your second brain can remind you of it. The app never sends anything; the text is always yours to send."
        placeholder="e.g. Before I eat, I text my brother: “Urge is up. Staying with my plan — just needed you to know.”"
        maxLength={400}
        rows={3}
      />
      <SlotField
        plan={plan}
        onUpdate={onUpdate}
        field="kindSentence"
        heading="A kind sentence for after a wobble"
        help="One sentence, written kindly now, for the moment right after you've eaten something you wish you hadn't. Your second brain will bring it back then — your words, once — and then it's on to the next meal as normal."
        placeholder="e.g. That was one meal. I'm still the person doing this."
        maxLength={300}
        rows={2}
      />
    </div>
  );
}
