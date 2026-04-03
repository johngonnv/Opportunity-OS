// ─── Master Org Completeness + Health Stage + Next Best Action ───────────────

export interface CompletenessField {
  key: string;
  label: string;
  weight: number;
  present: boolean;
  critical: boolean;
  verticalOnly?: "HEALTHCARE" | "GOVCON";
}

export interface CompletenessResult {
  score: number;
  maxScore: number;
  percentage: number;
  healthStage: "INCOMPLETE" | "IDENTIFIED" | "STRUCTURED" | "STRATEGIC";
  fields: CompletenessField[];
  missingCritical: string[];
}

export interface NextBestAction {
  action: string;
  label: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  field?: string;
}

interface OrgData {
  canonicalName: string | null;
  normalizedName: string | null;
  websiteDomain: string | null;
  industry: string | null;
  subVertical: string | null;
  accountStructureType: string | null;
  validationStatus: string;
  confidenceScore: number;
  isStandalone: boolean;
  aliases: string[];
  adminFlags: string[];
  city: string | null;
  state: string | null;
  structureLastScannedAt: Date | null;
  hasParent: boolean;
  hasUltimateParent: boolean;
  hasHealthcareOverlay: boolean;
  hasFacilityType: boolean;
  hasGovconOverlay: boolean;
  hasUei: boolean;
  aliasCount: number;
}

export function computeCompleteness(org: OrgData): CompletenessResult {
  const isHealthcare = org.industry === "HEALTHCARE";
  const isGovcon = org.industry === "GOVCON";
  const flags = org.adminFlags ?? [];

  const fields: CompletenessField[] = [
    {
      key: "canonicalName",
      label: "Canonical Name",
      weight: 15,
      present: !!org.canonicalName,
      critical: true,
    },
    {
      key: "normalizedName",
      label: "Normalized Name",
      weight: 5,
      present: !!org.normalizedName,
      critical: false,
    },
    {
      key: "websiteDomain",
      label: "Website Domain",
      weight: 15,
      present: !!org.websiteDomain,
      critical: true,
    },
    {
      key: "industry",
      label: "Industry",
      weight: 10,
      present: !!org.industry,
      critical: true,
    },
    {
      key: "accountStructureType",
      label: "Account Structure Type",
      weight: 10,
      present: !!org.accountStructureType,
      critical: true,
    },
    {
      key: "validationStatus",
      label: "Validation Status (not Unvalidated)",
      weight: 10,
      present: org.validationStatus !== "UNVALIDATED",
      critical: false,
    },
    {
      key: "confidenceScore",
      label: "Confidence Score ≥ 0.6",
      weight: 5,
      present: org.confidenceScore >= 0.6,
      critical: false,
    },
    {
      key: "parentRelationship",
      label: "Parent Relationship",
      weight: 10,
      present: org.isStandalone || org.hasParent,
      critical: false,
    },
    {
      key: "ultimateParent",
      label: "Ultimate Parent Mapped",
      weight: 5,
      present: org.isStandalone || org.hasUltimateParent,
      critical: false,
    },
    {
      key: "location",
      label: "Location (City/State)",
      weight: 5,
      present: !!(org.city || org.state),
      critical: false,
    },
    {
      key: "aliases",
      label: "Has Aliases",
      weight: 5,
      present: org.aliasCount > 0,
      critical: false,
    },
    // Healthcare-specific
    {
      key: "healthcareFacilityType",
      label: "Facility Type (Healthcare)",
      weight: 5,
      present: !isHealthcare || org.hasFacilityType,
      critical: false,
      verticalOnly: "HEALTHCARE",
    },
    // GovCon-specific
    {
      key: "govconUei",
      label: "UEI (GovCon)",
      weight: 5,
      present: !isGovcon || org.hasUei,
      critical: false,
      verticalOnly: "GOVCON",
    },
  ];

  // Filter out vertical fields that don't apply
  const applicableFields = fields.filter(f => {
    if (f.verticalOnly === "HEALTHCARE" && !isHealthcare) return false;
    if (f.verticalOnly === "GOVCON" && !isGovcon) return false;
    return true;
  });

  const maxScore = applicableFields.reduce((acc, f) => acc + f.weight, 0);
  const score = applicableFields.reduce((acc, f) => acc + (f.present ? f.weight : 0), 0);
  const percentage = Math.round((score / maxScore) * 100);

  const healthStage: CompletenessResult["healthStage"] =
    percentage < 30 ? "INCOMPLETE" :
    percentage < 60 ? "IDENTIFIED" :
    percentage < 80 ? "STRUCTURED" :
    "STRATEGIC";

  const missingCritical = applicableFields
    .filter(f => f.critical && !f.present)
    .map(f => f.label);

  return {
    score,
    maxScore,
    percentage,
    healthStage,
    fields: applicableFields,
    missingCritical,
  };
}

export function computeNextBestAction(org: OrgData, completeness: CompletenessResult): NextBestAction {
  const flags = org.adminFlags ?? [];

  // Priority order: blockers → structural → enrichment → polish
  if (flags.includes("duplicate_suspect")) {
    return { action: "RESOLVE_DUPLICATE", label: "Resolve Duplicate", description: "This record may be a duplicate. Review and merge or dismiss.", priority: "HIGH" };
  }
  if (!org.canonicalName) {
    return { action: "ADD_NAME", label: "Add Canonical Name", description: "This record is missing its canonical name.", priority: "HIGH", field: "canonicalName" };
  }
  if (!org.websiteDomain) {
    return { action: "ADD_DOMAIN", label: "Add Website Domain", description: "Add the organization's primary website domain.", priority: "HIGH", field: "websiteDomain" };
  }
  if (!org.industry) {
    return { action: "SET_INDUSTRY", label: "Set Industry", description: "Classify this organization into Healthcare, GovCon, or General Business.", priority: "HIGH", field: "industry" };
  }
  if (!org.accountStructureType) {
    return { action: "SET_STRUCTURE_TYPE", label: "Set Account Structure Type", description: "Identify whether this is an Enterprise, Facility, Regional, or other structure.", priority: "HIGH", field: "accountStructureType" };
  }
  if (flags.includes("structure_not_run")) {
    return { action: "RUN_STRUCTURE_SCAN", label: "Run Structure Scan", description: "No structure scan has been run. Scan to discover parent/child relationships.", priority: "HIGH" };
  }
  if (!org.isStandalone && !org.hasParent) {
    return { action: "CONFIRM_PARENT", label: "Confirm Parent", description: "This record has no confirmed parent relationship.", priority: "MEDIUM" };
  }
  if (org.validationStatus === "UNVALIDATED") {
    return { action: "VALIDATE", label: "Validate Record", description: "Review and set the validation status for this record.", priority: "MEDIUM" };
  }
  if (org.validationStatus === "REQUIRES_REVIEW") {
    return { action: "REVIEW_VALIDATION", label: "Review Validation", description: "This record has been flagged for re-validation.", priority: "MEDIUM" };
  }
  if (!org.isStandalone && !org.hasUltimateParent) {
    return { action: "MAP_ULTIMATE_PARENT", label: "Map Ultimate Parent", description: "Identify the top-level parent enterprise for this organization.", priority: "MEDIUM" };
  }
  if (org.industry === "HEALTHCARE" && !org.hasFacilityType) {
    return { action: "SET_FACILITY_TYPE", label: "Set Facility Type", description: "Add the healthcare facility type (hospital, clinic, system, etc.).", priority: "MEDIUM", field: "facilityType" };
  }
  if (org.industry === "GOVCON" && !org.hasUei) {
    return { action: "ADD_UEI", label: "Add UEI", description: "Add the SAM.gov Unique Entity Identifier for this government contractor.", priority: "MEDIUM", field: "uei" };
  }
  if (org.aliasCount === 0) {
    return { action: "ADD_ALIAS", label: "Add Alias", description: "Add known alternate names, DBAs, or abbreviations.", priority: "LOW" };
  }
  if (org.confidenceScore < 0.6) {
    return { action: "REVIEW_CONFIDENCE", label: "Review Confidence", description: "This record has a low confidence score. Review and update source signals.", priority: "LOW" };
  }

  return { action: "COMPLETE", label: "Record Complete", description: "This record meets all completeness criteria.", priority: "LOW" };
}
