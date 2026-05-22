import { Platform } from "react-native";

export interface AnalyzeResult {
  summary: string;
  contacts: Array<{ name: string; title: string; action: "new" | "update"; detail: string }>;
  pipeline: Array<{ title: string; action: "new" | "update"; change: string; valueEstimate: number | null }>;
  actionItems: Array<{ text: string; dueInDays: number }>;
  marketingResources: Array<{ text: string }>;
}

export interface PendingEvent {
  orgId: string;
  orgName: string;
  source: string;
  notes: string;
  occurredAt: string;
  result: AnalyzeResult;
}

const KEY = "__opp_event_pending__";

// Module-level fallback for native (and web when storage unavailable)
let _nativePending: PendingEvent | null = null;

function isWebEnv(): boolean {
  return typeof window !== "undefined" && Platform.OS === "web";
}

function tryWrite(ev: PendingEvent) {
  const json = JSON.stringify(ev);
  // Try both localStorage and sessionStorage so we cover all iframe/context scenarios
  try { localStorage.setItem(KEY, json); } catch { /* quota or security */ }
  try { sessionStorage.setItem(KEY, json); } catch { /* quota or security */ }
}

function tryRead(): PendingEvent | null {
  // Prefer localStorage (survives tab-close), fall back to sessionStorage
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(KEY);
      if (raw) return JSON.parse(raw) as PendingEvent;
    } catch { /* parse error or unavailable */ }
  }
  return null;
}

function tryRemove() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function setPendingEvent(ev: PendingEvent) {
  _nativePending = ev;
  if (isWebEnv()) tryWrite(ev);
}

export function getPendingEvent(): PendingEvent | null {
  if (isWebEnv()) {
    const fromStorage = tryRead();
    if (fromStorage) return fromStorage;
  }
  return _nativePending;
}

export function clearPendingEvent() {
  _nativePending = null;
  if (isWebEnv()) tryRemove();
}
