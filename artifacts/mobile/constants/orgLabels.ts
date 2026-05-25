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

// Healthcare facility-type → spec color group.
// Spec: Hospital→Red, Rehab/SNF→Purple, Clinic→Blue,
// Senior Living→Teal, Gov/VA→Navy, Mental Health→Orange, Other→Gray.
export const FACILITY_TYPE_COLORS: Record<string, string> = {
  ACUTE_CARE_HOSPITAL:       COLORS.red,
  CRITICAL_ACCESS_HOSPITAL:  COLORS.red,
  CHILDRENS_HOSPITAL:        COLORS.red,
  SPECIALTY_HOSPITAL:        COLORS.red,
  LONG_TERM_ACUTE_CARE:      COLORS.red,
  HEALTH_SYSTEM:             COLORS.red,
  REHABILITATION_HOSPITAL:   COLORS.purple,
  SKILLED_NURSING_FACILITY:  COLORS.purple,
  PHYSICIAN_PRACTICE:        COLORS.blue,
  FQHC:                      COLORS.blue,
  RURAL_HEALTH_CLINIC:       COLORS.blue,
  URGENT_CARE:               COLORS.blue,
  AMBULATORY_SURGERY_CENTER: COLORS.blue,
  DIALYSIS_CENTER:           COLORS.blue,
  IMAGING_CENTER:            COLORS.blue,
  ASSISTED_LIVING:           COLORS.teal,
  HOSPICE:                   COLORS.teal,
  HOME_HEALTH_AGENCY:        COLORS.teal,
  PSYCHIATRIC_HOSPITAL:      COLORS.orange,
  BEHAVIORAL_HEALTH:         COLORS.orange,
  VA_MEDICAL_CENTER:         COLORS.navyBadge,
  GOVERNMENT_FACILITY:       COLORS.navyBadge,
  EMS_AGENCY:                COLORS.gray,
  LABORATORY:                COLORS.gray,
  PHARMACY:                  COLORS.gray,
  PAYER:                     COLORS.gray,
  OTHER:                     COLORS.gray,
};

export const FACILITY_TYPE_LABELS: Record<string, string> = {
  ACUTE_CARE_HOSPITAL:       "Acute Care",
  CRITICAL_ACCESS_HOSPITAL:  "Critical Access",
  CHILDRENS_HOSPITAL:        "Children's",
  SPECIALTY_HOSPITAL:        "Specialty Hospital",
  LONG_TERM_ACUTE_CARE:      "LTAC",
  HEALTH_SYSTEM:             "Health System",
  REHABILITATION_HOSPITAL:   "Rehab Hospital",
  SKILLED_NURSING_FACILITY:  "SNF",
  PHYSICIAN_PRACTICE:        "Physician Practice",
  FQHC:                      "FQHC",
  RURAL_HEALTH_CLINIC:       "Rural Clinic",
  URGENT_CARE:               "Urgent Care",
  AMBULATORY_SURGERY_CENTER: "Surgery Center",
  DIALYSIS_CENTER:           "Dialysis",
  IMAGING_CENTER:            "Imaging",
  ASSISTED_LIVING:           "Assisted Living",
  HOSPICE:                   "Hospice",
  HOME_HEALTH_AGENCY:        "Home Health",
  PSYCHIATRIC_HOSPITAL:      "Psychiatric",
  BEHAVIORAL_HEALTH:         "Behavioral Health",
  VA_MEDICAL_CENTER:         "VA Medical",
  GOVERNMENT_FACILITY:       "Gov Facility",
  EMS_AGENCY:                "EMS",
  LABORATORY:                "Lab",
  PHARMACY:                  "Pharmacy",
  PAYER:                     "Payer",
};

export const HOSPITAL_FACILITY_TYPES = [
  "ACUTE_CARE_HOSPITAL",
  "CRITICAL_ACCESS_HOSPITAL",
  "CHILDRENS_HOSPITAL",
  "SPECIALTY_HOSPITAL",
  "LONG_TERM_ACUTE_CARE",
];

export const REHAB_SNF_FACILITY_TYPES = [
  "REHABILITATION_HOSPITAL",
  "SKILLED_NURSING_FACILITY",
];

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
