// On-device journal + Shield Plan storage for Pause & Nourish.
//
// Local-first by design: everything lives in IndexedDB on the user's own
// device (database "pause-and-nourish"). Nothing is sent anywhere. If
// IndexedDB is unavailable (e.g. iOS private browsing), the same API falls
// back to localStorage so the check-in loop never breaks.
//
// Field names are stable on purpose — the Day 5 companion analytics read
// mood, context, hunger, createdAt, urgeIntensity, triggerCategory,
// copingUsed and copingEffectiveness. Renaming any of them costs a migration.

export type Need =
  | "comfort"
  | "escape"
  | "soothe"
  | "numb"
  | "reward"
  | "relief"
  | "fuel"
  // Day 5 (Talk It Through taxonomy pass): the underneath-states the
  // spoken need question now names — rest, stress, boredom, people.
  // "Something sweet" is a target food, not a need; "end of day" is a
  // risk window, not a need — the talk parser keeps both out of here.
  | "tired"
  | "stressed"
  | "bored"
  | "lonely";

// "both" (Day 5): body hunger AND the pull at once — "both can be true"
// is a valid spoken answer to the hunger question, stored as declared.
export type HungerType = "physical" | "emotional" | "unsure" | "both";
export type TriggerCategory = "environmental" | "emotional" | "physical" | "social";
export type SleepQuality = "poor" | "okay" | "good";

export interface JournalEntry {
  id: string;
  createdAt: string; // ISO timestamp, device local time
  mood: string | null;
  context: string | null;
  hunger: number; // 0–5 body hunger
  note: string; // optional, trimmed, max 500 chars
  pauseCompleted: boolean;
  choice: string | null; // Day 4 fills: eat / swap / delay
  energy: number | null; // 1–5
  stress: number | null; // 1–5
  sleepQuality: SleepQuality | null;
  urgeIntensity: number | null; // 0–5
  hungerType: HungerType | null;
  bodySensations: string[]; // user-tapped tags, never inferred
  need: Need | null; // user-declared, never inferred
  triggerCategory: TriggerCategory | null;
  plannedResponse: string | null;
  copingUsed: string | null;
  copingEffectiveness: number | null; // 1–5
  source: "notice" | "sos" | "talk";
  urgeAfter: number | null; // 0–5, captured on the outcome screen (Day 3)
  cueAnswer: "me" | "not-me" | "good" | null; // SOS cue answer tap (Day 3)
  learning: string | null; // Day 4: save-one-learning — a tier-1 user statement, verbatim
}

// Day 5: the prompt pack joins the two moment recordings — q1..q5 are
// the Talk It Through spine questions, recorded once at calm time in the
// user's own voice so the conversation asks in their voice at zero
// generated-voice cost. All kinds share the one voiceCue store, keyed by
// kind; the Day 3 "cue" and Day 4 "reset" keys are unchanged.
export type CueKind = "cue" | "reset" | "q1" | "q2" | "q3" | "q4" | "q5";

export const CUE_KINDS: CueKind[] = ["cue", "reset", "q1", "q2", "q3", "q4", "q5"];
export type VoiceChoice = "own" | "phone" | "later";
export type Directness = "gentle" | "straight" | "short";

export interface ShieldPlan {
  triggerOptions: { trigger: string; options: string[] }[];
  dangerPlaces: string[];
  thoughtPairs: { negative: string; positive: string }[];
  whyLine: string; // the user's own "why", shown large on the SOS screen
  // Day 4 additions — all optional; pre-Day-4 plans simply lack them.
  ifThen?: { when: string; then: string } | null; // approach-worded plan, user's words
  voiceChoice?: VoiceChoice | null; // second-brain voice: own / phone / later
  // Declared risk windows (local hours, end may wrap past midnight).
  // Optional: no setup surface collects them yet, so plans normally
  // lack them — the talk context reads them only when present.
  riskWindows?: { label: string; startHour: number; endHour: number }[];
  directness?: Directness | null; // currently effective buddy directness
  directnessPending?: { level: Directness; effectiveFrom: string } | null; // §2.6: weakening lands next day
}

export const EMPTY_SHIELD_PLAN: ShieldPlan = {
  triggerOptions: [],
  dangerPlaces: [],
  thoughtPairs: [],
  whyLine: "",
};

const DB_NAME = "pause-and-nourish";
// v4 (Day 5): no schema change — the prompt-pack kinds are new KEYS in
// the existing voiceCue store, not new stores. The bump exists so the
// upgrade path is explicit; onupgradeneeded only creates missing stores,
// so every existing recording and entry carries over untouched.
const DB_VERSION = 4;
const JOURNAL_STORE = "journal";
const SHIELD_STORE = "shieldPlan";
const SHIELD_KEY = "plan";
const CUE_STORE = "voiceCue";

const LS_JOURNAL = "pn.journal";
const LS_SHIELD = "pn.shieldPlan";
const LS_CUE = "pn.voiceCue";
const LS_RESET_CUE = "pn.voiceResetCue";

// Cue records are keyed by kind. The Day 3 cue already lives under key
// "cue", so the kind key IS the Day 3 key — no migration. The legacy
// localStorage keys for "cue" and "reset" stay exactly as they were; the
// prompt-pack kinds get their own per-kind keys.
function lsCueKey(kind: CueKind): string {
  if (kind === "cue") return LS_CUE;
  if (kind === "reset") return LS_RESET_CUE;
  return `pn.voiceCue.${kind}`;
}

// ---------- IndexedDB backend ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
        const store = db.createObjectStore(JOURNAL_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(SHIELD_STORE)) {
        db.createObjectStore(SHIELD_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(CUE_STORE)) {
        db.createObjectStore(CUE_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAddEntry(entry: JournalEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, "readwrite");
  await idbRequest(tx.objectStore(JOURNAL_STORE).put(entry));
  db.close();
}

async function idbListEntries(): Promise<JournalEntry[]> {
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, "readonly");
  const all = await idbRequest(tx.objectStore(JOURNAL_STORE).getAll());
  db.close();
  return (all as JournalEntry[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function idbGetEntry(id: string): Promise<JournalEntry | null> {
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, "readonly");
  const found = await idbRequest(tx.objectStore(JOURNAL_STORE).get(id));
  db.close();
  return (found as JournalEntry | undefined) ?? null;
}

async function idbClearJournal(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, "readwrite");
  await idbRequest(tx.objectStore(JOURNAL_STORE).clear());
  db.close();
}

async function idbGetShieldPlan(): Promise<ShieldPlan> {
  const db = await openDb();
  const tx = db.transaction(SHIELD_STORE, "readonly");
  const rec = await idbRequest(tx.objectStore(SHIELD_STORE).get(SHIELD_KEY));
  db.close();
  const plan = (rec as { plan?: ShieldPlan } | undefined)?.plan;
  return plan ? { ...EMPTY_SHIELD_PLAN, ...plan } : { ...EMPTY_SHIELD_PLAN };
}

async function idbSaveShieldPlan(plan: ShieldPlan): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SHIELD_STORE, "readwrite");
  await idbRequest(
    tx.objectStore(SHIELD_STORE).put({ key: SHIELD_KEY, plan, updatedAt: new Date().toISOString() }),
  );
  db.close();
}

// ---------- Voice cue (the user's own recording, on-device only) ----------

interface CueRecord {
  blob: Blob;
  mimeType: string;
  recordedAt: string;
}

async function idbSaveCue(rec: CueRecord, kind: CueKind): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CUE_STORE, "readwrite");
  await idbRequest(tx.objectStore(CUE_STORE).put({ key: kind, kind, ...rec }));
  db.close();
}

async function idbGetCue(kind: CueKind): Promise<CueRecord | null> {
  const db = await openDb();
  const tx = db.transaction(CUE_STORE, "readonly");
  const rec = await idbRequest(tx.objectStore(CUE_STORE).get(kind));
  db.close();
  const found = rec as (CueRecord & { key: string }) | undefined;
  return found?.blob ? { blob: found.blob, mimeType: found.mimeType, recordedAt: found.recordedAt } : null;
}

async function idbDeleteCue(kind: CueKind): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CUE_STORE, "readwrite");
  await idbRequest(tx.objectStore(CUE_STORE).delete(kind));
  db.close();
}

// ---------- localStorage fallback ----------

function lsRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — the loop must not break over a save.
  }
}

// ---------- Public API (IndexedDB first, fallback behind the same calls) ----------

async function withFallback<T>(idbFn: () => Promise<T>, lsFn: () => T): Promise<T> {
  if (typeof indexedDB !== "undefined") {
    try {
      return await idbFn();
    } catch {
      return lsFn();
    }
  }
  return lsFn();
}

export async function addEntry(input: Partial<JournalEntry>): Promise<JournalEntry> {
  const entry: JournalEntry = {
    id: input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    mood: input.mood ?? null,
    context: input.context ?? null,
    hunger: input.hunger ?? 2,
    note: (input.note ?? "").trim().slice(0, 500),
    pauseCompleted: input.pauseCompleted ?? false,
    choice: input.choice ?? null,
    energy: input.energy ?? null,
    stress: input.stress ?? null,
    sleepQuality: input.sleepQuality ?? null,
    urgeIntensity: input.urgeIntensity ?? null,
    hungerType: input.hungerType ?? null,
    bodySensations: input.bodySensations ?? [],
    need: input.need ?? null,
    triggerCategory: input.triggerCategory ?? null,
    plannedResponse: input.plannedResponse ?? null,
    copingUsed: input.copingUsed ?? null,
    copingEffectiveness: input.copingEffectiveness ?? null,
    source: input.source ?? "notice",
    urgeAfter: input.urgeAfter ?? null,
    cueAnswer: input.cueAnswer ?? null,
    learning: input.learning ?? null,
  };
  await withFallback(
    () => idbAddEntry(entry),
    () => {
      const all = lsRead<JournalEntry[]>(LS_JOURNAL, []);
      all.push(entry);
      lsWrite(LS_JOURNAL, all);
    },
  );
  return entry;
}

export async function listEntries(): Promise<JournalEntry[]> {
  return withFallback(idbListEntries, () =>
    lsRead<JournalEntry[]>(LS_JOURNAL, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

// Merge a patch into an existing entry (same id and createdAt). Used by
// the post-save "add more" panel so optional detail never lengthens the
// check-in itself.
export async function updateEntry(
  id: string,
  patch: Partial<JournalEntry>,
): Promise<JournalEntry | null> {
  const existing = await getEntry(id);
  if (!existing) return null;
  const merged: JournalEntry = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    note: (patch.note ?? existing.note).trim().slice(0, 500),
  };
  await withFallback(
    () => idbAddEntry(merged),
    () => {
      const all = lsRead<JournalEntry[]>(LS_JOURNAL, []);
      lsWrite(LS_JOURNAL, all.map((e) => (e.id === id ? merged : e)));
    },
  );
  return merged;
}

export async function getEntry(id: string): Promise<JournalEntry | null> {
  return withFallback(
    () => idbGetEntry(id),
    () => lsRead<JournalEntry[]>(LS_JOURNAL, []).find((e) => e.id === id) ?? null,
  );
}

export async function clearAll(): Promise<void> {
  await withFallback(idbClearJournal, () => lsWrite(LS_JOURNAL, []));
}

export async function getShieldPlan(): Promise<ShieldPlan> {
  return withFallback(idbGetShieldPlan, () => ({
    ...EMPTY_SHIELD_PLAN,
    ...lsRead<ShieldPlan>(LS_SHIELD, { ...EMPTY_SHIELD_PLAN }),
  }));
}

// ---------- Voice cue public API ----------

export async function saveCue(blob: Blob, kind: CueKind = "cue"): Promise<void> {
  const rec: CueRecord = {
    blob,
    mimeType: blob.type || "audio/webm",
    recordedAt: new Date().toISOString(),
  };
  await withFallback(
    () => idbSaveCue(rec, kind),
    () => {
      // localStorage cannot hold a Blob — store a data URL instead.
      const reader = new FileReader();
      reader.onload = () =>
        lsWrite(lsCueKey(kind), { dataUrl: String(reader.result), recordedAt: rec.recordedAt });
      reader.readAsDataURL(blob);
    },
  );
}

export async function getCue(kind: CueKind = "cue"): Promise<CueRecord | null> {
  if (typeof indexedDB !== "undefined") {
    try {
      return await idbGetCue(kind);
    } catch {
      // Fall through to the localStorage copy.
    }
  }
  const stored = lsRead<{ dataUrl?: string; recordedAt?: string }>(lsCueKey(kind), {});
  if (!stored.dataUrl) return null;
  try {
    // fetch() on a data URL resolves to a Blob of the recorded audio.
    const res = await fetch(stored.dataUrl);
    const blob = await res.blob();
    return { blob, mimeType: blob.type, recordedAt: stored.recordedAt ?? "" };
  } catch {
    return null;
  }
}

export async function hasCue(kind: CueKind = "cue"): Promise<boolean> {
  return (await getCue(kind)) !== null;
}

export async function deleteCue(kind: CueKind = "cue"): Promise<void> {
  await withFallback(
    () => idbDeleteCue(kind),
    () => {
      try {
        localStorage.removeItem(lsCueKey(kind));
      } catch {
        // Nothing to delete.
      }
    },
  );
}

export async function saveShieldPlan(plan: ShieldPlan): Promise<void> {
  await withFallback(
    () => idbSaveShieldPlan(plan),
    () => lsWrite(LS_SHIELD, plan),
  );
}

// Delete EVERYTHING on this device (README promise, wired Day 5): the
// journal, the Shield Plan, and every voice recording — cue, reset line,
// and the whole prompt pack. Clears both backends unconditionally (not
// via withFallback): a store cleared in IndexedDB must not leave a
// localStorage copy behind from an earlier fallback period, or vice
// versa. Best-effort per store — one failing clear never blocks the rest.
export async function deleteEverything(): Promise<void> {
  if (typeof indexedDB !== "undefined") {
    try {
      const db = await openDb();
      const tx = db.transaction([JOURNAL_STORE, SHIELD_STORE, CUE_STORE], "readwrite");
      await idbRequest(tx.objectStore(JOURNAL_STORE).clear());
      await idbRequest(tx.objectStore(SHIELD_STORE).clear());
      await idbRequest(tx.objectStore(CUE_STORE).clear());
      db.close();
    } catch {
      // Fall through to the localStorage sweep below.
    }
  }
  try {
    lsWrite(LS_JOURNAL, []);
    localStorage.removeItem(LS_SHIELD);
    for (const kind of CUE_KINDS) {
      localStorage.removeItem(lsCueKey(kind));
    }
  } catch {
    // Storage blocked entirely — nothing more this device lets us do.
  }
}

// Recording the moment cue IS choosing your own voice (Bob's rule,
// 2026-10-29): saving the cue anywhere — home or setup — sets the plan's
// voiceChoice to "own" so the stored choice can never lag the reality.
// An explicit later pick in the choice section still wins, because it
// writes the plan after the recording does. Deleting the cue clears a
// now-dangling "own" back to "later" (the app stays quiet) instead of
// pointing at a recording that no longer exists. Bookkeeping only — a
// failure here must never break the recording flow.
export async function syncVoiceChoiceAfterCueSave(): Promise<void> {
  try {
    const plan = await getShieldPlan();
    if (plan.voiceChoice !== "own") {
      await saveShieldPlan({ ...plan, voiceChoice: "own" });
    }
  } catch {
    // The cue itself is saved; the choice catches up next save.
  }
}

export async function syncVoiceChoiceAfterCueDelete(): Promise<void> {
  try {
    const plan = await getShieldPlan();
    if (plan.voiceChoice === "own") {
      await saveShieldPlan({ ...plan, voiceChoice: "later" });
    }
  } catch {
    // Nothing dangling that a later save can't fix.
  }
}

// The Shield Plan option the user wrote for a trigger, if one matches the
// context they just tapped. Populates plannedResponse on new entries.
export function matchPlannedResponse(plan: ShieldPlan, context: string | null): string | null {
  if (!context) return null;
  const c = context.toLowerCase();
  for (const { trigger, options } of plan.triggerOptions) {
    const t = trigger.trim().toLowerCase();
    if (t && (c === t || c.includes(t) || t.includes(c))) {
      return options.find((o) => o.trim().length > 0) ?? null;
    }
  }
  return null;
}
