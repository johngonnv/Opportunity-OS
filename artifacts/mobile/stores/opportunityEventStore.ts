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

// On web, use sessionStorage so the value survives same-tab route navigations.
// On native, fall back to a module-level variable (modules persist in-process).
let _nativePending: PendingEvent | null = null;

const isWeb = Platform.OS === "web";

export function setPendingEvent(ev: PendingEvent) {
  if (isWeb) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(ev));
    } catch {
      _nativePending = ev;
    }
  } else {
    _nativePending = ev;
  }
}

export function getPendingEvent(): PendingEvent | null {
  if (isWeb) {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as PendingEvent) : null;
    } catch {
      return _nativePending;
    }
  }
  return _nativePending;
}

export function clearPendingEvent() {
  if (isWeb) {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
  _nativePending = null;
}
