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

let _pending: PendingEvent | null = null;

export function setPendingEvent(ev: PendingEvent) {
  _pending = ev;
}

export function getPendingEvent(): PendingEvent | null {
  return _pending;
}

export function clearPendingEvent() {
  _pending = null;
}
