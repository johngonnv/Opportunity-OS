// Org Intelligence Engine — V1 (rules-based, no AI)
// Pure functions; all DB fetching happens in the calling route handler.

const INACTIVITY_RISK_DAYS = 30;
const OVERDUE_TASK_RISK_DAYS = 14;
const ACTIVE_ACTIVITY_DAYS = 14;
const EXPANDING_ACTIVITY_DAYS = 14;
const WARMING_ACTIVITY_DAYS = 30;
const STALE_STAGE_DAYS = 14;

export type AccountState = "COLD" | "WARMING" | "ACTIVE" | "AT_RISK" | "EXPANDING";

export interface ContactData {
  id: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  stakeholderRole: string | null;
  influenceLevel: string | null;
  relationshipStrength: number | null;
  relationshipStrengthLabel: string | null;
  isPrimaryRelationship: boolean;
  roleNotes: string | null;
  activityCount: number;
  lastEngagementAt: Date | null;
  isOnOpenOpp: boolean;
  hasOverdueTask: boolean;
}

export interface OpenOpportunity {
  id: string;
  title: string;
  stage: string;
  stageName: string;
  probability: number;
  valueEstimate: number | null;
  daysInStage: number;
}

export interface ActivityData {
  occurredAt: Date;
  contactId: string | null;
}

export interface TaskData {
  dueDate: Date | null;
  status: string;
  title: string;
  contactId: string | null;
}

export interface CoverageGap {
  role: string;
  message: string;
  cta: string;
}

export interface PrimaryAction {
  title: string;
  whyNow: string;
  type: "FOLLOW_UP" | "SCHEDULE_MEETING" | "CLOSE_DEAL" | "ENGAGE_STAKEHOLDER" | "REACTIVATE" | "CAPTURE_CONTACT" | "ADVANCE_STAGE";
}

export interface OrgIntelligenceResult {
  accountState: AccountState;
  health: number;
  risk: number;
  coverageGaps: CoverageGap[];
  primaryAction: PrimaryAction;
  openOpportunities: OpenOpportunity[];
  contacts: (ContactData & { computedStrength: number; computedStrengthLabel: string })[];
}

function daysSince(date: Date | null): number {
  if (!date) return Infinity;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function latestDate(activities: ActivityData[]): Date | null {
  return activities.reduce<Date | null>(
    (latest, a) => (!latest || a.occurredAt > latest ? a.occurredAt : latest),
    null
  );
}

export function computeRelationshipStrength(
  contact: Pick<ContactData, "activityCount" | "lastEngagementAt" | "isOnOpenOpp" | "hasOverdueTask" | "relationshipStrength">
): number {
  if (contact.relationshipStrength !== null) return contact.relationshipStrength;

  let score = 0;

  const recency = daysSince(contact.lastEngagementAt);
  if (recency <= 7) score += 40;
  else if (recency <= 14) score += 30;
  else if (recency <= 30) score += 20;
  else if (recency <= 90) score += 10;

  if (contact.activityCount >= 10) score += 25;
  else if (contact.activityCount >= 5) score += 15;
  else if (contact.activityCount >= 1) score += 8;

  if (contact.isOnOpenOpp) score += 20;

  if (contact.hasOverdueTask) score = Math.max(0, score - 15);

  return Math.min(100, score);
}

export function strengthToLabel(score: number): string {
  if (score >= 75) return "STRATEGIC";
  if (score >= 50) return "STRONG";
  if (score >= 25) return "DEVELOPING";
  return "COLD";
}

function findOverdueTask(openTasks: TaskData[]): TaskData | undefined {
  return openTasks.find(
    t =>
      t.dueDate &&
      daysSince(t.dueDate) >= OVERDUE_TASK_RISK_DAYS &&
      (t.status === "OPEN" || t.status === "IN_PROGRESS")
  );
}

export function computeAccountState(
  openOpps: OpenOpportunity[],
  recentActivities: ActivityData[],
  openTasks: TaskData[],
  contacts: ContactData[]
): AccountState {
  const hasOpenOpp = openOpps.length > 0;
  const daysSinceActivity = daysSince(latestDate(recentActivities));
  const overdueTask = findOverdueTask(openTasks);
  const hasDecisionMaker = contacts.some(c => c.stakeholderRole === "DECISION_MAKER");

  // AT_RISK: open opp with 30+ day inactivity OR any overdue task older than 14 days
  if ((hasOpenOpp && daysSinceActivity >= INACTIVITY_RISK_DAYS) || overdueTask) {
    return "AT_RISK";
  }

  if (openOpps.length >= 2 && hasDecisionMaker && daysSinceActivity <= EXPANDING_ACTIVITY_DAYS) {
    return "EXPANDING";
  }

  if (hasOpenOpp && daysSinceActivity <= ACTIVE_ACTIVITY_DAYS) {
    return "ACTIVE";
  }

  if (!hasOpenOpp && daysSinceActivity <= WARMING_ACTIVITY_DAYS) {
    return "WARMING";
  }

  return "COLD";
}

export function computeHealthRisk(
  _accountState: AccountState,
  openOpps: OpenOpportunity[],
  recentActivities: ActivityData[],
  openTasks: TaskData[],
  contacts: ContactData[]
): { health: number; risk: number } {
  let health = 0;
  let risk = 0;

  const hasOpenOpp = openOpps.length > 0;
  const daysSinceAct = daysSince(latestDate(recentActivities));

  if (hasOpenOpp) health += 25;
  if (daysSinceAct <= 7) health += 30;
  else if (daysSinceAct <= 14) health += 20;
  else if (daysSinceAct <= 30) health += 10;

  const hasDM = contacts.some(c => c.stakeholderRole === "DECISION_MAKER");
  const hasChampion = contacts.some(c => c.stakeholderRole === "CHAMPION");
  if (hasDM) health += 15;
  if (hasChampion) health += 10;

  const activeContactCount = contacts.filter(c => c.activityCount > 0).length;
  if (activeContactCount >= 3) health += 10;
  else if (activeContactCount >= 1) health += 5;

  const staleOpp = openOpps.find(o => o.daysInStage > 30);
  if (staleOpp) risk += 30;

  const overdueTask = findOverdueTask(openTasks);
  if (overdueTask) risk += 25;

  if (daysSinceAct >= INACTIVITY_RISK_DAYS) risk += 25;
  else if (daysSinceAct >= 14) risk += 10;

  if (!hasDM && !hasChampion) risk += 15;

  return {
    health: Math.min(100, Math.round(health)),
    risk: Math.min(100, Math.round(risk)),
  };
}

export function buildCoverageGaps(
  contacts: ContactData[],
  openOpps: OpenOpportunity[]
): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  if (contacts.length === 0) {
    gaps.push({
      role: "ANY",
      message: "No contacts mapped to this account",
      cta: "Add a contact to start tracking relationships",
    });
    return gaps;
  }

  const hasDM = contacts.some(c => c.stakeholderRole === "DECISION_MAKER");
  const hasChampion = contacts.some(c => c.stakeholderRole === "CHAMPION");

  if (!hasDM) {
    gaps.push({
      role: "DECISION_MAKER",
      message: "No Decision Maker identified",
      cta: "Tag a contact as Decision Maker to track authority coverage",
    });
  }

  if (!hasChampion) {
    gaps.push({
      role: "CHAMPION",
      message: "No internal Champion identified",
      cta: "Identify an advocate who will promote your solution internally",
    });
  }

  if (openOpps.length > 0 && contacts.every(c => !c.isOnOpenOpp)) {
    gaps.push({
      role: "OPP_CONTACT",
      message: "Open opportunity has no linked contacts",
      cta: "Link contacts to your open opportunities for accurate pipeline coverage",
    });
  }

  const allCold = contacts.every(c => computeRelationshipStrength(c) < 25);
  if (allCold) {
    gaps.push({
      role: "ENGAGEMENT",
      message: "All contacts have cold relationship strength",
      cta: "Log an activity or schedule a meeting to warm up key relationships",
    });
  }

  return gaps;
}

export function buildPrimaryAction(
  accountState: AccountState,
  openOpps: OpenOpportunity[],
  openTasks: TaskData[],
  contacts: ContactData[],
  recentActivities: ActivityData[]
): PrimaryAction {
  const daysSinceAct = daysSince(latestDate(recentActivities));
  const overdueTask = findOverdueTask(openTasks);
  const staleOpp = openOpps.find(o => o.daysInStage > STALE_STAGE_DAYS);
  const hasDM = contacts.some(c => c.stakeholderRole === "DECISION_MAKER");
  const primaryContact = contacts.find(c => c.isPrimaryRelationship) ?? contacts[0] ?? null;
  const primaryContactName = primaryContact?.fullName ?? "a key stakeholder";

  if (accountState === "AT_RISK") {
    if (overdueTask) {
      const daysOverdue = overdueTask.dueDate ? daysSince(overdueTask.dueDate) : 0;
      return {
        type: "FOLLOW_UP",
        title: "Clear overdue task",
        whyNow: `You have a task overdue by ${daysOverdue} days — resolve it now to keep momentum alive.`,
      };
    }
    if (staleOpp) {
      return {
        type: "FOLLOW_UP",
        title: "Re-engage stalled opportunity",
        whyNow: `"${staleOpp.title}" has been in ${staleOpp.stageName} for ${staleOpp.daysInStage} days — follow up with ${primaryContactName} to move it forward.`,
      };
    }
    return {
      type: "FOLLOW_UP",
      title: "Reconnect with account",
      whyNow: `No activity logged in ${daysSinceAct} days — reach out to ${primaryContactName} before this account goes cold.`,
    };
  }

  if (accountState === "EXPANDING") {
    const highValueOpp = openOpps.reduce(
      (best, o) => ((o.valueEstimate ?? 0) > (best.valueEstimate ?? 0) ? o : best),
      openOpps[0]
    );
    return {
      type: "ADVANCE_STAGE",
      title: "Accelerate pipeline",
      whyNow: `Account is expanding with ${openOpps.length} open opportunities. Push "${highValueOpp.title}" to the next stage.`,
    };
  }

  if (accountState === "ACTIVE") {
    if (staleOpp) {
      return {
        type: "ADVANCE_STAGE",
        title: "Advance stalled opportunity",
        whyNow: `"${staleOpp.title}" has been in ${staleOpp.stageName} for ${staleOpp.daysInStage} days — schedule a meeting to move it forward.`,
      };
    }
    if (!hasDM) {
      return {
        type: "ENGAGE_STAKEHOLDER",
        title: "Identify decision maker",
        whyNow: "You have an active opportunity but no Decision Maker mapped — find and engage the buying authority to close faster.",
      };
    }
    return {
      type: "SCHEDULE_MEETING",
      title: "Schedule next touchpoint",
      whyNow: `Active account with open pipeline. Stay top of mind by scheduling a meeting with ${primaryContactName}.`,
    };
  }

  if (accountState === "WARMING") {
    if (contacts.every(c => !c.isOnOpenOpp)) {
      return {
        type: "CLOSE_DEAL",
        title: "Convert activity into opportunity",
        whyNow: "You've had recent engagement with this account but no open opportunities. Strike while the iron is hot.",
      };
    }
    return {
      type: "SCHEDULE_MEETING",
      title: "Deepen the relationship",
      whyNow: `Recent engagement shows interest — schedule a strategic conversation with ${primaryContactName} to explore opportunities.`,
    };
  }

  if (contacts.length === 0) {
    return {
      type: "CAPTURE_CONTACT",
      title: "Add a contact",
      whyNow: "No contacts are mapped to this account. Start by adding a contact to begin building the relationship.",
    };
  }

  return {
    type: "REACTIVATE",
    title: "Re-engage this account",
    whyNow: `No recent activity or open opportunities. Reach out to ${primaryContactName} to restart the conversation and assess current needs.`,
  };
}

export function runOrgIntelligence(
  contacts: ContactData[],
  openOpps: OpenOpportunity[],
  recentActivities: ActivityData[],
  openTasks: TaskData[]
): OrgIntelligenceResult {
  const accountState = computeAccountState(openOpps, recentActivities, openTasks, contacts);
  const { health, risk } = computeHealthRisk(accountState, openOpps, recentActivities, openTasks, contacts);
  const coverageGaps = buildCoverageGaps(contacts, openOpps);
  const primaryAction = buildPrimaryAction(accountState, openOpps, openTasks, contacts, recentActivities);

  const enrichedContacts = contacts.map(c => {
    const computedStrength = computeRelationshipStrength(c);
    return {
      ...c,
      computedStrength,
      computedStrengthLabel: strengthToLabel(computedStrength),
    };
  });

  return {
    accountState,
    health,
    risk,
    coverageGaps,
    primaryAction,
    openOpportunities: openOpps,
    contacts: enrichedContacts,
  };
}
