// The PWA-side store for the companion protocol (Component A,
// connector slice §2). The protocol module (companion-protocol/) is
// storage-agnostic; this adapter persists its state through the
// journal's on-device storage, under the companion record key, so it
// lives and dies with everything else on the device — including
// deleteEverything(), which clears that store wholesale.
//
// The state that crosses this adapter is the module's own record:
// pairing digests, credential digests, session state, and the small
// event log. Raw secrets and tokens never appear in it — that is the
// module's promise, proven by its test suite.

import {
  clearCompanionRecord,
  getCompanionRecord,
  saveCompanionRecord,
} from "./journal";
import type { CompanionState, CompanionStore } from "../../companion-protocol";

export const companionStore: CompanionStore = {
  async load(): Promise<CompanionState | null> {
    const raw = await getCompanionRecord();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CompanionState;
    } catch {
      return null;
    }
  },
  async save(state: CompanionState): Promise<void> {
    await saveCompanionRecord(JSON.stringify(state));
  },
  async clear(): Promise<void> {
    await clearCompanionRecord();
  },
};
