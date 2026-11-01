"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getNudgeRecord,
  getPatterns,
  getShieldPlan,
  getUserProfile,
  listEntries,
  saveNudgeRecord,
  savePatterns,
  type JournalEntry,
  type ShieldPlan,
  type UserProfile,
} from "@/lib/journal";
import {
  confirmedPatterns,
  deriveCandidates,
  reconcilePatterns,
  type PatternRecord,
  type PatternStatus,
} from "@/lib/patterns";
import {
  DEFAULT_NUDGE_POLICY,
  EMPTY_NUDGE_STATE,
  MORNING_HEADS_UP,
  localDateStr,
  settleNudgeState,
  type NudgePolicy,
  type NudgeState,
} from "@/lib/nudges";

// "What I remember about you" (Day 7, Day 4 spec §2): the three
// tiers of memory, on one screen, under the user's control.
//   Tier 1 — what you told me: your story, your plan, and the
//     patterns you have CONFIRMED (only confirmed patterns are
//     ever used — by the brain, or by a morning heads-up).
//   Tier 2 — what happened: your journal, on this phone.
//   Tier 3 — patterns I'm noticing: computed candidates, tentative
//     until you answer Yes / Partly / No / Don't track.
// Nothing here leaves the device, and nothing in tier 3 is used
// for anything until you say yes.

const primaryBtn =
  "rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-40";
const secondaryBtn =
  "rounded-full border border-stone-300 bg-white px-5 py-2.5 font-semibold text-stone-800 transition hover:border-[#2f5d3a] disabled:opacity-40";
const smallBtn =
  "rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[#2f5d3a] disabled:opacity-40";

const STATUS_WORDS: Record<PatternStatus, string> = {
  candidate: "Waiting for your call",
  confirmed: "You confirmed this",
  partly: "You said partly — it stays tentative, and it is never used for reminders",
  no: "You said this isn't you",
  "dont-track": "Not tracked — it won't be raised again",
};

function whenText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [plan, setPlan] = useState<ShieldPlan | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [patterns, setPatterns] = useState<PatternRecord[]>([]);
  const [policy, setPolicy] = useState<NudgePolicy>(DEFAULT_NUDGE_POLICY);
  const [nudgeState, setNudgeState] = useState<NudgeState>(EMPTY_NUDGE_STATE);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [all, p, prof, storedPatterns, nudgeRec] = await Promise.all([
      listEntries().catch(() => [] as JournalEntry[]),
      getShieldPlan().catch(() => null),
      getUserProfile().catch(() => null),
      getPatterns().catch(() => [] as PatternRecord[]),
      getNudgeRecord().catch(() => null),
    ]);
    setEntries(all);
    setPlan(p);
    setProfile(prof);
    const merged = reconcilePatterns(storedPatterns, deriveCandidates(all), new Date());
    setPatterns(merged);
    if (JSON.stringify(merged) !== JSON.stringify(storedPatterns)) {
      void savePatterns(merged).catch(() => {});
    }
    const rec = nudgeRec ?? { policy: DEFAULT_NUDGE_POLICY, state: EMPTY_NUDGE_STATE };
    const settled = settleNudgeState(rec.state, new Date());
    setPolicy(rec.policy);
    setNudgeState(settled);
    if (settled !== rec.state) {
      void saveNudgeRecord({ policy: rec.policy, state: settled }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePatternList(next: PatternRecord[]) {
    setPatterns(next);
    try {
      await savePatterns(next);
    } catch {
      setNote("That didn't save just now — it's still on this screen; try again.");
    }
  }

  async function verdict(pattern: PatternRecord, status: PatternStatus) {
    await savePatternList(
      patterns.map((p) =>
        p.id === pattern.id ? { ...p, status, updatedAt: new Date().toISOString() } : p,
      ),
    );
  }

  async function forget(pattern: PatternRecord) {
    await savePatternList(patterns.filter((p) => p.id !== pattern.id));
  }

  async function saveNudge(nextPolicy: NudgePolicy, nextState: NudgeState) {
    setPolicy(nextPolicy);
    setNudgeState(nextState);
    try {
      await saveNudgeRecord({ policy: nextPolicy, state: nextState });
    } catch {
      setNote("That didn't save just now — it's still on this screen; try again.");
    }
  }

  const confirmed = confirmedPatterns(patterns);
  const candidates = patterns.filter((p) => p.status === "candidate");
  const judged = patterns.filter((p) => p.status !== "candidate" && p.status !== "confirmed");
  const learnings = (entries ?? []).filter((e) => e.learning).slice(0, 6);
  const recent = (entries ?? []).slice(0, 5);
  const insteadOptions = (plan?.triggerOptions ?? []).flatMap((t) => t.options).filter(Boolean);
  const backedOff = !!nudgeState.backoffUntil && nudgeState.backoffUntil >= localDateStr(new Date());

  function patternCard(p: PatternRecord, withVerdicts: boolean) {
    return (
      <li key={p.id} className="rounded-xl border border-stone-200 px-4 py-3">
        <p className="font-medium text-stone-900">{p.text}</p>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">{p.evidence}.</p>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">{STATUS_WORDS[p.status]}.</p>
        {withVerdicts && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={smallBtn} onClick={() => void verdict(p, "confirmed")}>
              Yes, that&apos;s me
            </button>
            <button type="button" className={smallBtn} onClick={() => void verdict(p, "partly")}>
              Partly
            </button>
            <button type="button" className={smallBtn} onClick={() => void verdict(p, "no")}>
              Not really
            </button>
            <button type="button" className={smallBtn} onClick={() => void verdict(p, "dont-track")}>
              Don&apos;t track this
            </button>
          </div>
        )}
        {!withVerdicts && (
          <div className="mt-3 flex flex-wrap gap-2">
            {p.status === "confirmed" && (
              <button type="button" className={smallBtn} onClick={() => void verdict(p, "dont-track")}>
                Stop using this for reminders
              </button>
            )}
            {p.status !== "confirmed" && p.status !== "candidate" && (
              <button type="button" className={smallBtn} onClick={() => void verdict(p, "candidate")}>
                Ask me again
              </button>
            )}
            <button type="button" className={smallBtn} onClick={() => void forget(p)}>
              Forget this
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/dashboard" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back to your week
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">
        What I remember about you
      </h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        Everything on this page lives on this phone, and you control all of it. Nothing here is
        used to remind you of anything until you&apos;ve said yes to it.
      </p>
      {note && (
        <p className="mt-4 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
          {note}
        </p>
      )}

      {/* ---------- Tier 1: what you told me ---------- */}
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">What you&apos;ve told me</h2>
        <div className="mt-3 flex flex-col gap-3 leading-relaxed text-stone-700">
          {profile?.name ? <p>Your name: {profile.name}.</p> : null}
          {profile?.story ? <p>Your story, in your words: “{profile.story}”</p> : null}
          {profile && profile.triggers.length > 0 && (
            <p>The moments you say get you: {profile.triggers.filter(Boolean).join("; ")}.</p>
          )}
          {plan?.whyLine ? <p>Your why: “{plan.whyLine}”</p> : null}
          {plan?.ifThen ? (
            <p>
              Your plan: when {plan.ifThen.when}, {plan.ifThen.then}.
            </p>
          ) : null}
          {insteadOptions.length > 0 && (
            <p>Your instead-options: {insteadOptions.join("; ")}.</p>
          )}
          {!profile?.name && !plan?.whyLine && (
            <p>Nothing yet — your story and your plan land here as you set them up.</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/story" className={`${secondaryBtn} inline-block`}>
            Edit your story
          </Link>
          <Link href="/shield" className={`${secondaryBtn} inline-block`}>
            Edit your plan
          </Link>
        </div>

        {confirmed.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-stone-900">Patterns you&apos;ve confirmed</h3>
            <p className="mt-1 text-sm leading-relaxed text-stone-600">
              These count as settled — the app may stand on them, including for a morning
              heads-up.
            </p>
            <ul className="mt-3 flex flex-col gap-3">
              {confirmed.map((p) => patternCard(p, false))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- Tier 2: what happened ---------- */}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">What happened</h2>
        {!entries ? (
          <p className="mt-2 text-stone-600">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="mt-2 leading-relaxed text-stone-600">
            No moments recorded yet. They&apos;ll collect here, on this phone only.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3 leading-relaxed text-stone-700">
            <p>
              {entries.length} {entries.length === 1 ? "moment" : "moments"} recorded ·{" "}
              {entries.filter((e) => e.pauseCompleted).length} pauses taken.
            </p>
            {learnings.length > 0 && (
              <div>
                <h3 className="font-semibold text-stone-900">Learnings you saved</h3>
                <ul className="mt-2 flex flex-col gap-1">
                  {learnings.map((e) => (
                    <li key={e.id}>“{e.learning}” — {whenText(e.createdAt)}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h3 className="font-semibold text-stone-900">Most recent</h3>
              <ul className="mt-2 flex flex-col gap-1">
                {recent.map((e) => (
                  <li key={e.id}>
                    {whenText(e.createdAt)}
                    {e.urgeIntensity != null
                      ? ` — urge ${e.urgeIntensity}${e.urgeAfter != null ? ` → ${e.urgeAfter}` : ""}`
                      : ""}
                    {e.choice ? ` — you chose ${e.choice === "swap" ? "something else" : e.choice}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* ---------- Tier 3: patterns I'm noticing ---------- */}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">Patterns I&apos;m noticing — your call</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          These are counted from your own record — the hours your moments landed, the needs you
          named, what you used and how the urge moved. They are guesses until you judge them,
          and nothing is done with a guess.
        </p>
        {candidates.length === 0 && judged.length === 0 ? (
          <p className="mt-3 leading-relaxed text-stone-700">
            Nothing yet — patterns need a few recorded moments before there&apos;s anything
            honest to show.
          </p>
        ) : (
          <>
            {candidates.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {candidates.map((p) => patternCard(p, true))}
              </ul>
            )}
            {judged.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {judged.map((p) => patternCard(p, false))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ---------- Nudge governance ---------- */}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">Heads-ups &amp; reminders</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          The only heads-up today is a morning card, shown when you open the app — and only
          when it can stand on something you declared or confirmed. If you don&apos;t answer
          it twice in a row, the app goes quiet for a week on its own. Fewer, not louder.
        </p>
        <div className="mt-4 flex flex-col gap-4 leading-relaxed text-stone-700">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={policy.enabled}
              onChange={(e) => void saveNudge({ ...policy, enabled: e.target.checked }, nudgeState)}
              className="h-5 w-5 accent-[#2f5d3a]"
            />
            Heads-ups on
          </label>
          <label className="flex items-center gap-3">
            At most
            <select
              value={policy.maxPerDay}
              onChange={(e) =>
                void saveNudge({ ...policy, maxPerDay: Number(e.target.value) }, nudgeState)
              }
              className="rounded-lg border border-stone-300 bg-white px-3 py-2"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
            unprompted heads-ups a day
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span>Quiet hours:</span>
            <input
              type="time"
              value={policy.quietStart}
              onChange={(e) => void saveNudge({ ...policy, quietStart: e.target.value }, nudgeState)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2"
            />
            <span>to</span>
            <input
              type="time"
              value={policy.quietEnd}
              onChange={(e) => void saveNudge({ ...policy, quietEnd: e.target.value }, nudgeState)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2"
            />
          </div>
          {backedOff && (
            <div className="rounded-xl border border-stone-200 px-4 py-3">
              <p>
                Heads-ups are paused until {nudgeState.backoffUntil} — the last two went
                unanswered, so the app backed off by itself.
              </p>
              <button
                type="button"
                className={`${smallBtn} mt-2`}
                onClick={() =>
                  void saveNudge(policy, { ...nudgeState, backoffUntil: null, ignoredStreak: 0 })
                }
              >
                Resume heads-ups now
              </button>
            </div>
          )}
          {policy.stoppedTypes.length > 0 && (
            <div>
              <h3 className="font-semibold text-stone-900">Stopped</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {policy.stoppedTypes.map((t) => (
                  <li key={t} className="flex flex-wrap items-center gap-3">
                    <span>{t === MORNING_HEADS_UP ? "Morning heads-up" : t}</span>
                    <button
                      type="button"
                      className={smallBtn}
                      onClick={() =>
                        void saveNudge(
                          { ...policy, stoppedTypes: policy.stoppedTypes.filter((x) => x !== t) },
                          nudgeState,
                        )
                      }
                    >
                      Allow again
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <p className="mt-6 text-sm leading-relaxed text-stone-600">
        To erase all of this — every tier — use Delete everything on{" "}
        <Link href="/dashboard" className="font-medium text-[#2f5d3a] underline underline-offset-4">
          your week page
        </Link>
        .
      </p>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
