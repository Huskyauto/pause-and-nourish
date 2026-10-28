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
  | "fuel";

export type HungerType = "physical" | "emotional" | "unsure";
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
  source: "notice" | "sos";
}

export interface ShieldPlan {
  triggerOptions: { trigger: string; options: string[] }[];
  dangerPlaces: string[];
  thoughtPairs: { negative: string; positive: string }[];
}

export const EMPTY_SHIELD_PLAN: ShieldPlan = {
  triggerOptions: [],
  dangerPlaces: [],
  thoughtPairs: [],
};

const DB_NAME = "pause-and-nourish";
const DB_VERSION = 2;
const JOURNAL_STORE = "journal";
const SHIELD_STORE = "shieldPlan";
const SHIELD_KEY = "plan";

const LS_JOURNAL = "pn.journal";
const LS_SHIELD = "pn.shieldPlan";

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
  return withFallback(idbGetShieldPlan, () =>
    lsRead<ShieldPlan>(LS_SHIELD, { ...EMPTY_SHIELD_PLAN }),
  );
}

export async function saveShieldPlan(plan: ShieldPlan): Promise<void> {
  await withFallback(
    () => idbSaveShieldPlan(plan),
    () => lsWrite(LS_SHIELD, plan),
  );
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
