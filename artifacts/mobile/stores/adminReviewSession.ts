export interface ReviewSession {
  orgIds: string[];
  filters: {
    search: string;
    sourceFilter: string;
    industryFilter: string;
  };
}

let _session: ReviewSession | null = null;

export function setReviewSession(session: ReviewSession): void {
  _session = session;
}

export function getReviewSession(): ReviewSession | null {
  return _session;
}

export function clearReviewSession(): void {
  _session = null;
}
