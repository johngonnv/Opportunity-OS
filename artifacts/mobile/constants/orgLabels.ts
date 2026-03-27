import { COLORS } from "./colors";

export const ACCOUNT_STRUCTURE_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  parent: "Parent",
  regional: "Regional",
  local_entity: "Local Entity",
};

export const ACCOUNT_STRUCTURE_COLORS: Record<string, string> = {
  enterprise: COLORS.emerald,
  parent: COLORS.blue,
  regional: COLORS.amber,
  local_entity: COLORS.textMuted,
};

export const VERTICAL_LABELS: Record<string, string> = {
  healthcare: "Healthcare",
  govcon: "GovCon",
  general_business: "General Business",
  government: "Government",
  nonprofit: "Nonprofit",
  vendor: "Vendor",
  other: "Other",
};

export const VERTICAL_COLORS: Record<string, string> = {
  healthcare: COLORS.emerald,
  govcon: COLORS.blue,
  general_business: COLORS.amber,
  government: COLORS.purple,
  nonprofit: COLORS.cyan,
  vendor: COLORS.textMuted,
  other: COLORS.textDim,
};

export const ORG_TYPE_COLORS: Record<string, string> = {
  HOSPITAL: COLORS.red,
  HEALTH_SYSTEM: COLORS.emerald,
  HOSPICE: COLORS.purple,
  HOME_HEALTH: COLORS.cyan,
  GOVERNMENT_AGENCY: COLORS.blue,
  PRIME_CONTRACTOR: COLORS.amber,
  SUBCONTRACTOR: COLORS.amber,
  CONSULTANT: COLORS.textMuted,
  VENDOR: COLORS.textDim,
  OTHER: COLORS.textDim,
};

export const ORG_TYPE_LABELS: Record<string, string> = {
  HOSPITAL: "Hospital",
  HEALTH_SYSTEM: "Health System",
  HOSPICE: "Hospice",
  HOME_HEALTH: "Home Health",
  GOVERNMENT_AGENCY: "Gov Agency",
  PRIME_CONTRACTOR: "Prime Contractor",
  SUBCONTRACTOR: "Subcontractor",
  CONSULTANT: "Consultant",
  VENDOR: "Vendor",
  OTHER: "Other",
};

export const DECISION_LEVEL_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  parent: "Parent",
  regional: "Regional",
  local: "Local",
};

export function getVerticalChildLabel(vertical?: string | null): string {
  switch (vertical) {
    case "healthcare": return "Hospitals";
    case "govcon": return "Business Units";
    default: return "Child Organizations";
  }
}

export function getVerticalParentLabel(vertical?: string | null): string {
  switch (vertical) {
    case "healthcare": return "Parent Health System";
    case "govcon": return "Parent Contractor";
    default: return "Parent Organization";
  }
}

export function getVerticalEntityLabel(vertical?: string | null): string {
  switch (vertical) {
    case "healthcare": return "Hospitals";
    case "govcon": return "Subsidiaries";
    default: return "Locations";
  }
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
