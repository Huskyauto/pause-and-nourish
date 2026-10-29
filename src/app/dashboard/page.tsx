"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listEntries, type JournalEntry, type Need } from "@/lib/journal";
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
};

const CHOICE_LABELS: Record<string, string> = {
  eat: "Eat",
  swap: "Swap",
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
        `Your swap helped ${helpedSwaps.length} ${helpedSwaps.length === 1 ? "time" : "times"} — like the time the pull went ${latest.urgeIntensity} → ${latest.urgeAfter}.`,
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
        Patterns, not grades. This page fills in from the check-ins saved on
        your device — nothing leaves your phone.
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
            This page reads your own check-ins from this device. After your first check-in and
            pause, your counts show up here — and once a few land, your patterns start reflecting
            back, in your words.
          </p>
        </section>
      )}

      {entries && all.length > 0 && all.length < 3 && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="leading-relaxed text-stone-600">
            Early days — the counts above are real, from your device. Once a few more check-ins
            land, this page starts reflecting your patterns back: the hour your entries cluster
            around, the need you name most, and what has actually helped, in your numbers.
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
          <p className="mt-1 text-sm text-stone-600">The needs you named yourself, at check-in.</p>
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

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-stone-900">Your companion</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Once you&apos;ve checked in a few times, a companion powered by
          Meta&apos;s models will reflect your own patterns back to you —
          in your words, not advice. It arrives with the Day 5 build.
        </p>
      </section>

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
