"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteEverything, listEntries, type JournalEntry, type Need } from "@/lib/journal";
import { PAUSE_TOOLS } from "@/lib/tools";

// Day 4: the dashboard runs on the real on-device journal. Everything here
// is computed on this device from the user's own entries — nothing leaves
// the phone, nothing is inferred. Reflection sentences cite confirmed
// patterns and recorded outcomes only, in the user's words (spec §2.2).

const NEED_LABELS: Record<Need, string> = {
  comfort: "Comfort",
  escape: "A break / escape",
  soothe: "To soothe",
  numb: "To go numb",
  reward: "A reward",
  relief: "Relief",
  fuel: "Actual fuel",
  tired: "Rest / tired",
  stressed: "Stressed / wound up",
  bored: "Bored",
  lonely: "People / lonely",
};

const CHOICE_LABELS: Record<string, string> = {
  eat: "Eat",
  swap: "Had something else instead",
  delay: "Delay",
};

function hourLabel(iso: string): string {
  const h = new Date(iso).getHours();
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12} ${h < 12 ? "AM" : "PM"}`;
}

function mode<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export default function DashboardPage() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [nowMs, setNowMs] = useState(0);
  // Delete-everything: two-step confirm, then all three on-device
  // stores (journal, Shield Plan, voice recordings) are cleared.
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "done">("idle");

  async function handleDeleteEverything() {
    await deleteEverything().catch(() => {});
    setEntries([]);
    setDeleteStep("done");
  }

  useEffect(() => {
    let live = true;
    setNowMs(Date.now());
    listEntries()
      .then((all) => {
        if (live) setEntries(all);
      })
      .catch(() => {
        if (live) setEntries([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const weekCutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
  const all = entries ?? [];
  const thisWeek = all.filter((e) => new Date(e.createdAt).getTime() >= weekCutoff);
  const pausesTaken = all.filter((e) => e.pauseCompleted).length;

  const commonContext = mode(all.map((e) => e.context).filter((c): c is string => !!c));
  const commonHour = mode(all.map((e) => hourLabel(e.createdAt)));
  const momentValue = commonContext ?? (commonHour ? `Around ${commonHour}` : "—");

  const choiceCounts = new Map<string, number>();
  for (const e of all) {
    if (e.choice) choiceCounts.set(e.choice, (choiceCounts.get(e.choice) ?? 0) + 1);
  }
  const choicesValue =
    choiceCounts.size > 0
      ? [...choiceCounts.entries()]
          .map(([c, n]) => `${CHOICE_LABELS[c] ?? c} ×${n}`)
          .join(" · ")
      : "—";

  const stats = [
    { label: "Check-ins this week", value: entries ? String(thisWeek.length) : "…" },
    { label: "Pauses taken", value: entries ? String(pausesTaken) : "…" },
    { label: "Most common moment", value: entries ? momentValue : "…" },
    { label: "Choices after pausing", value: entries ? choicesValue : "…" },
  ];

  // Your sessions (Day 6): the talk record, newest first — when it
  // happened, what kind of session it was (talk only, or talk plus
  // the guided action that ran), the urge before and after where he
  // gave both, what he chose, and the outcome HE marked at the close.
  // His words and numbers only; an unmarked session shows no mark.
  const sessions = all
    .filter((e) => e.source === "talk")
    .slice(0, 8)
    .map((e) => {
      const d = new Date(e.createdAt);
      const when = `${d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      const type = e.sessionAction
        ? `Talk + ${e.sessionAction.charAt(0).toLowerCase()}${e.sessionAction.slice(1)}`
        : "Talk only";
      const urge =
        e.urgeIntensity !== null && e.urgeAfter !== null
          ? `Urge ${e.urgeIntensity} → ${e.urgeAfter}`
          : e.urgeIntensity !== null
            ? `Urge ${e.urgeIntensity}/5`
            : null;
      return {
        id: e.id,
        when,
        type,
        urge,
        choice: e.choice ? (CHOICE_LABELS[e.choice] ?? e.choice) : null,
        outcome: e.sessionOutcome ?? null,
      };
    });

  // Need histogram — user-declared needs only, never inferred.
  const needCounts = new Map<Need, number>();
  for (const e of all) {
    if (e.need) needCounts.set(e.need, (needCounts.get(e.need) ?? 0) + 1);
  }
  const needRows = [...needCounts.entries()].sort((a, b) => b[1] - a[1]);
  const needMax = needRows.length ? needRows[0][1] : 0;

  // Coping effectiveness per tool: average of recorded 1–5 ratings.
  const toolStats = new Map<string, { total: number; count: number }>();
  for (const e of all) {
    if (e.copingUsed && e.copingEffectiveness !== null) {
      const s = toolStats.get(e.copingUsed) ?? { total: 0, count: 0 };
      s.total += e.copingEffectiveness;
      s.count += 1;
      toolStats.set(e.copingUsed, s);
    }
  }
  const ratedTools = [...toolStats.entries()]
    .map(([name, s]) => ({ name, avg: s.total / s.count, count: s.count }))
    .sort((a, b) => b.avg - a.avg);
  const untestedTools = PAUSE_TOOLS.filter((t) => !toolStats.has(t.name)).map((t) => t.name);

  // Reflection sentences — confirmed patterns + recorded outcomes only.
  const reflections: string[] = [];
  if (entries && all.length >= 3) {
    const commonNeed = mode(all.map((e) => e.need).filter((n): n is Need => !!n));
    if (commonHour && commonNeed) {
      reflections.push(
        `Your entries cluster around ${commonHour}, and ${NEED_LABELS[commonNeed].toLowerCase()} is the need you name most.`,
      );
    } else if (commonHour) {
      reflections.push(`Your entries cluster around ${commonHour}.`);
    }
    const helpedSwaps = all.filter(
      (e) =>
        e.choice === "swap" &&
        e.urgeIntensity !== null &&
        e.urgeAfter !== null &&
        e.urgeAfter < e.urgeIntensity,
    );
    if (helpedSwaps.length > 0) {
      const latest = helpedSwaps[0];
      reflections.push(
        `Having something else instead helped ${helpedSwaps.length} ${helpedSwaps.length === 1 ? "time" : "times"} — like the time the urge went ${latest.urgeIntensity} → ${latest.urgeAfter}.`,
      );
    }
    const delays = all.filter((e) => e.choice === "delay").length;
    if (delays > 0) {
      reflections.push(
        `You chose to delay ${delays} ${delays === 1 ? "time" : "times"} — each one a pause that held.`,
      );
    }
    const bestTool = ratedTools.find((t) => t.count >= 2);
    if (bestTool) {
      reflections.push(
        `${bestTool.name} is working for you — you rated it ${bestTool.avg.toFixed(1)} out of 5 across ${bestTool.count} pauses.`,
      );
    }
    const withLearning = all.find((e) => e.learning);
    if (withLearning?.learning) {
      reflections.push(`You asked me to remember: “${withLearning.learning}”`);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">Your week, gently</h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        Patterns, not grades — all from this device. Nothing leaves your phone.
      </p>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Weekly summary">
        {stats.map((s) => (
          <article key={s.label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-3xl font-bold break-words text-[#2f5d3a]">{s.value}</p>
            <p className="mt-1 text-sm text-stone-600">{s.label}</p>
          </article>
        ))}
      </section>

      {entries && all.length === 0 && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-stone-900">Nothing here yet</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            After your first check-in and pause, your counts show up here.
          </p>
        </section>
      )}

      {entries && all.length > 0 && all.length < 3 && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="leading-relaxed text-stone-600">
            Early days — these counts are real, from your device. A few more check-ins and your
            patterns start showing up here.
          </p>
        </section>
      )}

      {reflections.length > 0 && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Your patterns, in your words">
          <h2 className="font-semibold text-stone-900">Your patterns, in your words</h2>
          <ul className="mt-2 flex flex-col gap-2 leading-relaxed text-stone-700">
            {reflections.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {entries && needRows.length > 0 && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Needs you have named">
          <h2 className="font-semibold text-stone-900">What you were reaching for</h2>
          <div className="mt-4 flex flex-col gap-3">
            {needRows.map(([need, count]) => (
              <div key={need}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-stone-900">{NEED_LABELS[need]}</span>
                  <span className="text-stone-600">{count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-[#e7efe3]">
                  <div
                    className="h-2 rounded-full bg-[#2f5d3a]"
                    style={{ width: `${Math.round((count / needMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {entries && (ratedTools.length > 0 || untestedTools.length > 0) && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="What helps">
          <h2 className="font-semibold text-stone-900">What helps</h2>
          <ul className="mt-3 flex flex-col gap-2 text-stone-700">
            {ratedTools.map((t) => (
              <li key={t.name} className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-stone-900">{t.name}</span>
                <span className="text-sm text-stone-600">
                  {t.avg.toFixed(1)} / 5 · {t.count} {t.count === 1 ? "rating" : "ratings"}
                </span>
              </li>
            ))}
            {untestedTools.map((name) => (
              <li key={name} className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-stone-900">{name}</span>
                <span className="text-sm text-stone-600">not tried yet</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries && sessions.length > 0 && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Your sessions">
          <h2 className="font-semibold text-stone-900">Your sessions</h2>
          <ul className="mt-3 flex flex-col gap-4">
            {sessions.map((s) => (
              <li key={s.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-stone-900">{s.when}</span>
                  {s.outcome === "good" && (
                    <span className="rounded-full bg-[#e7efe3] px-3 py-1 text-sm font-medium text-[#2f5d3a]">
                      Good outcome
                    </span>
                  )}
                  {s.outcome === "work-on" && (
                    <span className="rounded-full bg-[#fdf1ec] px-3 py-1 text-sm font-medium text-[#9a3b26]">
                      To work on
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-stone-600">
                  {[s.type, s.urge, s.choice ? `Chose: ${s.choice}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-stone-900">Your companion</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Talk with me is live: your second brain asks the questions out loud, you answer out
          loud, and it deals your own plan back — in your words, not advice. When the moment
          is ready it can lead one of your moves out loud, and at the end it asks how it
          landed — your mark goes on the record above.
        </p>
        <Link
          href="/talk"
          className="mt-3 inline-block font-medium text-[#2f5d3a] underline underline-offset-4"
        >
          Talk with me →
        </Link>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-stone-900">Delete everything</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Everything lives on this device — your journal, your plan, and your voice recordings.
          Deleting removes all of it from this phone, for good. There is no copy anywhere else.
        </p>
        {deleteStep === "idle" && (
          <button
            type="button"
            onClick={() => setDeleteStep("confirm")}
            className="mt-4 rounded-full border border-[#9a3b26]/40 bg-white px-5 py-3 font-semibold text-[#9a3b26] transition hover:border-[#9a3b26]"
          >
            Delete everything on this device
          </button>
        )}
        {deleteStep === "confirm" && (
          <div className="mt-4">
            <p className="font-medium text-stone-900">
              Are you sure? This deletes your journal, your plan, and your voice recordings.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleDeleteEverything()}
                className="rounded-full bg-[#9a3b26] px-5 py-3 font-semibold text-white transition hover:bg-[#7f3120]"
              >
                Yes, delete everything
              </button>
              <button
                type="button"
                onClick={() => setDeleteStep("idle")}
                className="rounded-full border border-stone-300 bg-white px-5 py-3 font-semibold text-stone-800 transition hover:border-[#2f5d3a]"
              >
                Keep my data
              </button>
            </div>
          </div>
        )}
        {deleteStep === "done" && (
          <p className="mt-4 font-medium text-stone-900">
            Done — this device is clear. Fresh start whenever you&apos;re ready.
          </p>
        )}
      </section>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
