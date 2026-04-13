# Opportunity OS — Full Schema, Logic, Workflow, and Feature Specification

**Version:** 1.0  
**Date:** April 2026  
**Status:** Living Document  
**Audience:** Product, Design, Engineering

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Full Schema](#2-full-schema)
3. [Per-Feature Logic](#3-per-feature-logic)
4. [Full Workflow Map](#4-full-workflow-map)
5. [Per-Feature Specification](#5-per-feature-specification)
6. [Permissions and Control Layers](#6-permissions-and-control-layers)
7. [Master Database Intelligence Model](#7-master-database-intelligence-model)
8. [UX Logic](#8-ux-logic)
9. [Open Gaps / Risks / Needed Decisions](#9-open-gaps--risks--needed-decisions)
10. [Appendices](#10-appendices)

---

# 1. Executive Overview

## What Opportunity OS Is

Opportunity OS is a mobile-first CRM platform designed for relationship-driven sales teams operating in **Healthcare** and **Government Contracting (GovCon)** verticals. Unlike generic CRMs, it is purpose-built around the relationship intelligence and organizational hierarchy patterns specific to these markets.

The app is built as an Expo React Native application (iOS, Android, and Web), backed by an Express API server and a PostgreSQL database managed via Drizzle ORM.

## Core Operating Model

Opportunity OS follows a **dual-tier intelligence model**:

- **Workspace tier**: Each client organization gets a private workspace. All CRM data — contacts, organizations, pipelines, opportunities, notes, tasks — lives here. This is the user's daily working environment.
- **Master Database tier**: Canonical reference data curated and maintained by the Opportunity OS platform team. Includes verified master organizations, master contacts, healthcare CMS overlays, GovCon identifiers, and relationship graph data. Workspace data can be "promoted" to the Master Database after admin review.

This separation ensures that client data remains isolated while the platform accumulates a growing intelligence layer that benefits all workspaces.

## Admin vs Client Workspace Model

| Layer | Who | Access |
|---|---|---|
| **Platform Admin** | Opportunity OS staff | Full system access via `isPlatformAdmin` flag; manages master DB, AI suggestions, promotion queue, onboarding sessions |
| **Workspace Owner/Admin** | Client team leads | Manage their workspace: invite members, configure pipelines, approve business cards, manage organizations |
| **Workspace Member** | Client sales reps | Read/write CRM data within their workspace; cannot manage workspace settings |

The platform admin console is a separate, authenticated section of the same Expo app (route prefix `/admin/`), protected by `platformAdminMiddleware.ts`.

## Master Database vs Workspace Database Relationship

```
Workspace Data (private, per-client)
        │
        │  [User submits org/contact]
        │  [System enqueues to promotion queue]
        ▼
Master Promotion Queue (PENDING)
        │
        │  [Platform admin reviews]
        │  [Approve as NEW / MERGE / LINK / REJECT]
        ▼
Master Database (canonical, cross-workspace)
        │
        │  [AI suggestions generated]
        │  [Admin approves/rejects field suggestions]
        ▼
Master Org AI Suggestions (enrichment overlays)
```

Workspace organizations can be linked to master organizations via `masterOrganizationId`. This link is set by the platform admin after promotion review, not automatically by the system.

---

# 2. Full Schema

## 2.1 Enums Reference

### Identity / Auth Enums

| Enum | Values |
|---|---|
| `workspace_role` | `OWNER`, `ADMIN`, `MEMBER` |

### Organization Enums

| Enum | Values |
|---|---|
| `organization_type` | `HOSPITAL`, `HEALTH_SYSTEM`, `HOSPICE`, `HOME_HEALTH`, `GOVERNMENT_AGENCY`, `PRIME_CONTRACTOR`, `SUBCONTRACTOR`, `CONSULTANT`, `VENDOR`, `OTHER` |
| `organization_level` | `enterprise`, `group`, `facility` |
| `account_structure_type` | `enterprise`, `parent`, `regional`, `local_entity`, `facility` |
| `org_vertical` | `healthcare`, `govcon`, `general_business`, `government`, `nonprofit`, `vendor`, `other` |
| `primary_decision_level` | `enterprise`, `parent`, `regional`, `local` |
| `hierarchy_source_type` | `MASTER_DATABASE`, `EXTERNAL_ENRICHMENT`, `LLM_SYNTHESIS`, `HUMAN_CONFIRMED` |

### Contact Enums

| Enum | Values |
|---|---|
| `contact_status` | `NEW`, `REVIEWED`, `ACTIVE`, `INACTIVE` |
| `stakeholder_role` | `DECISION_MAKER`, `INFLUENCER`, `CHAMPION`, `BLOCKER`, `OTHER` |
| `influence_level` | `LOW`, `MEDIUM`, `HIGH` |
| `relationship_strength_label` | `COLD`, `DEVELOPING`, `STRONG`, `STRATEGIC` |

### Opportunity Enums

| Enum | Values |
|---|---|
| `opportunity_status` | `OPEN`, `WON`, `LOST`, `ON_HOLD` |
| `opportunity_vertical` | `HEALTHCARE`, `GOVCON`, `CONSULTING`, `PARTNERSHIP` |

### Task / Activity Enums

| Enum | Values |
|---|---|
| `task_priority` | `LOW`, `MEDIUM`, `HIGH` |
| `task_status` | `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELED` |
| `activity_type` | `CALL`, `EMAIL`, `MEETING`, `CARD_SCAN`, `NOTE`, `FOLLOW_UP`, `EVENT`, `INTRO`, `LOGO_SCAN`, `ORG_ENRICHMENT`, `STRUCTURE_SCAN_STARTED`, `STRUCTURE_SUGGESTED`, `STRUCTURE_APPROVED`, `STRUCTURE_REJECTED` |

### Business Card Enums

| Enum | Values |
|---|---|
| `card_processing_status` | `UPLOADED`, `PARSING`, `PARSED`, `FAILED` |
| `card_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `MERGED` |

### Organization Scan Enums

| Enum | Values |
|---|---|
| `org_scan_processing_status` | `UPLOADED`, `PARSING`, `PARSED`, `MATCHED`, `FAILED` |
| `org_scan_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `admin_org_scan_processing_status` | `UPLOADED`, `PARSING`, `PARSED`, `MATCHED`, `FAILED` |
| `admin_org_scan_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |

### Pipeline Enums

| Enum | Values |
|---|---|
| `pipeline_view_template_status` | `draft`, `active`, `inactive`, `archived` |

### Master Organization Enums

| Enum | Values |
|---|---|
| `master_relationship_type` | `SUBSIDIARY`, `REGIONAL`, `DBA`, `AFFILIATED` |
| `master_relationship_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `master_org_industry` | `HEALTHCARE`, `GOVCON`, `GENERAL_BUSINESS` |
| `master_account_structure_type` | `ENTERPRISE`, `REGIONAL`, `FACILITY`, `SUB_FACILITY`, `GENERAL_ORG` |
| `master_validation_status` | `UNVALIDATED`, `PARTIALLY_VALIDATED`, `VALIDATED`, `REQUIRES_REVIEW` |
| `master_alias_type` | `DBA`, `ACQUIRED_BRAND`, `ABBREVIATION`, `FORMER_NAME`, `VARIANT` |
| `master_org_ai_suggestion_status` | `PENDING`, `APPROVED`, `REJECTED` |

### Master Contact Enums

| Enum | Values |
|---|---|
| `master_contact_role` | `DECISION_MAKER`, `INFLUENCER`, `CHAMPION`, `BLOCKER`, `OTHER` |
| `master_contact_influence` | `LOW`, `MEDIUM`, `HIGH` |
| `master_contact_validation_status` | `UNVALIDATED`, `VALIDATED`, `REQUIRES_REVIEW` |
| `promotion_entity_type` | `ORG`, `CONTACT`, `NOTE` |
| `promotion_change_type` | `CREATED`, `UPDATED`, `NOTE_ADDED` |
| `promotion_status` | `PENDING`, `APPROVED_NEW`, `APPROVED_MERGE`, `APPROVED_LINK`, `REJECTED` |

### Onboarding Enums

| Enum | Values |
|---|---|
| `onboarding_session_status` | `DRAFT`, `INTAKE`, `AWAITING_RECOMMENDATION`, `NORMALIZING`, `REVIEW`, `LOCKED`, `PROVISIONING`, `PROVISIONED`, `FAILED` |
| `onboarding_client_type` | `SINGLE_USER`, `SMALL_TEAM`, `ENTERPRISE` |
| `provisioning_step_key` | `CREATE_WORKSPACE`, `ASSIGN_PLAN`, `CREATE_MEMBERSHIPS`, `APPLY_VERTICAL_CONFIG`, `ENABLE_SERVICE_LINES`, `ENABLE_ADD_ONS`, `PUBLISH_PIPELINE_TEMPLATES`, `SEED_CONTACT_ROLES`, `SEED_TAGS`, `SEED_SAVED_VIEWS`, `SEED_DEFAULT_TASKS`, `SEED_ALERTS`, `CREATE_LAUNCH_CHECKLIST`, `SEND_INVITE_EMAILS`, `RECORD_AUDIT_ENTRY`, `SNAPSHOT_HEALTH_BASELINE` |
| `provisioning_step_status` | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `SKIPPED` |
| `launch_checklist_item_status` | `PENDING`, `COMPLETED`, `SKIPPED` |
| `workspace_add_on_status` | `ACTIVE`, `SUSPENDED`, `PENDING_CONFIG` |
| `onboarding_review_item_status` | `PENDING`, `APPROVED`, `EDITED`, `REJECTED` |
| `ai_confidence_band` | `HIGH`, `MEDIUM`, `LOW` |

### Structure Scan Enums

| Enum | Values |
|---|---|
| `structure_scan_status` | `PENDING`, `MASTER_MATCHED`, `EXTERNAL_SEARCHED`, `LLM_REVIEWED`, `COMPLETED`, `FAILED` |
| `structure_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |

### Healthcare Intelligence Enums

| Enum | Values |
|---|---|
| `cms_verification_status_enum` | `MATCHED`, `VERIFIED`, `NEEDS_REVIEW`, `REJECTED`, `IMPORT_ERROR` |
| `pain_point_category` | `ED_BOARDING`, `DISCHARGE_BOTTLENECK`, `CARE_TRANSITION_RISK`, `STAFFING_PRESSURE`, `CAPACITY_CONSTRAINT`, `REVENUE_CYCLE`, `DOCUMENTATION_BURDEN`, `PATIENT_EXPERIENCE`, `OTHER` |
| `pain_point_severity` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| `pain_point_frequency` | `CONSTANT`, `FREQUENT`, `OCCASIONAL`, `RARE` |
| `pain_point_source_type` | `CMS_SIGNAL`, `USER_REPORTED`, `ADMIN_CONFIRMED`, `ONBOARDING_EXTRACTED`, `CORROBORATING_SOURCE` |
| `evidence_type` | `QUANTITATIVE`, `QUALITATIVE`, `ANECDOTAL`, `INFERRED` |
| `pain_point_verification_status` | `SUGGESTED`, `PENDING_REVIEW`, `VERIFIED`, `REJECTED` |
| `competitor_type` | `INCUMBENT_VENDOR`, `EMERGING_VENDOR`, `INTERNAL_SOLUTION`, `MANUAL_PROCESS`, `NO_SOLUTION`, `UNKNOWN` |
| `incumbent_status` | `CONFIRMED_INCUMBENT`, `SUSPECTED_INCUMBENT`, `FORMER_INCUMBENT`, `NOT_INCUMBENT` |
| `contract_status` | `ACTIVE_CONTRACT`, `MONTH_TO_MONTH`, `EXPIRED`, `UNKNOWN` |
| `displacement_difficulty` | `VERY_HIGH`, `HIGH`, `MEDIUM`, `LOW` |
| `competitor_pain_point_relationship_type` | `CAUSED_BY`, `EXACERBATED_BY`, `MASKED_BY`, `OPPORTUNITY_ANGLE` |

---

## 2.2 Tables by Domain

### Domain: Identity

#### `users`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | `crypto.randomUUID()` | PK |
| `first_name` | text | No | — | |
| `last_name` | text | No | — | |
| `email` | text | Yes | — | Unique; normalized to lowercase |
| `password_hash` | text | No | — | bcrypt hash |
| `auth_provider_id` | text | No | — | Unique; for OAuth providers |
| `account_type` | text | Yes | `client_user` | |
| `is_platform_admin` | boolean | Yes | `false` | Guards all `/admin/` routes |
| `platform_role` | text | No | — | Future: sub-roles within platform team |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | Auto-updated |

---

### Domain: Workspace

#### `workspaces`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | `crypto.randomUUID()` | PK |
| `name` | text | Yes | — | Workspace/company name |
| `industry_focus` | text | No | — | Free text; default on signup: "Healthcare & Government Contracting" |
| `owner_user_id` | text (FK→users) | Yes | — | ON DELETE CASCADE |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `workspace_members`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `user_id` | text (FK→users) | Yes | — | ON DELETE CASCADE |
| `role` | `workspace_role` | Yes | `MEMBER` | `OWNER`, `ADMIN`, `MEMBER` |
| `created_at` | timestamp | Yes | `now()` | |

#### `workspace_admin_audit_log`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `changed_by_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `changed_at` | timestamp | Yes | `now()` | |
| `action` | text | Yes | — | e.g., `INVITE_SENT`, `ROLE_CHANGED`, `MEMBER_REMOVED` |
| `entity_type` | text | Yes | — | e.g., `workspace_member` |
| `entity_id` | text | Yes | — | |
| `previous_value` | jsonb | No | — | Before state |
| `new_value` | jsonb | No | — | After state |
| `platform_support_action` | boolean | Yes | `false` | True when action taken by platform team |
| `notes` | text | No | — | Admin notes |

---

### Domain: CRM — Organizations

#### `organizations`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `parent_organization_id` | text (FK→organizations) | No | — | Self-referencing; ON DELETE SET NULL |
| `ultimate_parent_organization_id` | text (FK→organizations) | No | — | Denormalized; computed from parent chain |
| `organization_level` | `organization_level` | No | `facility` | `enterprise`, `group`, `facility` |
| `account_structure_type` | `account_structure_type` | No | — | `enterprise`, `parent`, `regional`, `local_entity`, `facility` |
| `vertical` | `org_vertical` | No | — | `healthcare`, `govcon`, `general_business`, etc. |
| `primary_decision_level` | `primary_decision_level` | No | — | Where buying decisions happen |
| `name` | text | Yes | — | Display name |
| `legal_name` | text | No | — | Full legal entity name |
| `website` | text | No | — | |
| `phone` | text | No | — | |
| `email` | text | No | — | |
| `organization_type` | `organization_type` | Yes | `OTHER` | |
| `industry` | text | No | — | Free text industry |
| `sub_industry` | text | No | — | |
| `sub_vertical` | text | No | — | |
| `region_name` | text | No | — | |
| `msa_status` | text | No | — | Master Service Agreement status |
| `system_priority_tier` | text | No | — | |
| `expansion_strategy` | text | No | — | |
| `expansion_maturity` | text | No | — | |
| `strategic_tier` | text | No | — | |
| `address_line1` | text | No | — | |
| `address_line2` | text | No | — | |
| `city` | text | No | — | |
| `state` | text | No | — | |
| `zip` | text | No | — | |
| `country` | text | No | — | |
| `notes_text` | text | No | — | Inline notes (not same as notes table) |
| `owner_user_id` | text (FK→users) | No | — | Account owner |
| `outreach_owner_user_id` | text (FK→users) | No | — | Who handles outreach |
| `google_place_id` | text | No | — | From logo/org scan enrichment |
| `formatted_address` | text | No | — | From Google Places |
| `website_domain` | text | No | — | Normalized domain for dedup |
| `latitude` | double precision | No | — | |
| `longitude` | double precision | No | — | |
| `place_category` | text | No | — | From Google Places |
| `last_enriched_at` | timestamp | No | — | When data was last enriched |
| `enrichment_source` | text | No | — | Which source enriched it |
| `master_organization_id` | text | No | — | Link to master_organizations (no FK constraint; set by admin) |
| `hierarchy_confidence_score` | double precision | No | — | 0–1 score from hierarchy scan |
| `hierarchy_last_scanned_at` | timestamp | No | — | |
| `hierarchy_last_reviewed_at` | timestamp | No | — | |
| `hierarchy_source_type` | `hierarchy_source_type` | No | — | How the hierarchy was determined |
| `suggested_parent_name` | text | No | — | AI-suggested parent before review |
| `suggested_ultimate_parent_name` | text | No | — | AI-suggested root before review |
| `onboarding_vertical_id` | text (FK→verticals) | No | — | From onboarding config |
| `onboarding_sub_vertical_id` | text (FK→sub_verticals) | No | — | |
| `organization_intelligence_summary` | jsonb | No | — | Cached result of compute-intelligence-summary |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

**Hierarchy business rules:**
- `parent_organization_id` must belong to the same workspace
- Cycle detection runs before any parent assignment
- `ultimate_parent_organization_id` is computed by walking the parent chain
- When a parent changes, `ultimate_parent_organization_id` is propagated to all descendants (depth limit: 10)

#### `organization_ems_profiles`

One-to-one overlay for EMS/interfacility transport context on an organization.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `organization_id` | text (FK→organizations) | Yes | — | ON DELETE CASCADE |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `primary_transport_need` | text | No | — | |
| `incumbent_provider` | text | No | — | Current EMS provider |
| `estimated_monthly_transports` | integer | No | — | |
| `payer_mix_summary` | text | No | — | |
| `las_vegas_jurisdiction_eligibility` | text | No | — | City of Las Vegas jurisdiction flag |
| `discharge_workflow_notes` | text | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

---

### Domain: CRM — Contacts

#### `contacts`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `organization_id` | text (FK→organizations) | No | — | ON DELETE SET NULL |
| `first_name` | text | No | — | |
| `last_name` | text | No | — | |
| `full_name` | text | Yes | — | Required; may be synthesized from first+last |
| `title` | text | No | — | Job title |
| `department` | text | No | — | |
| `email` | text | No | — | |
| `phone` | text | No | — | |
| `mobile` | text | No | — | |
| `linkedin_url` | text | No | — | |
| `source` | text | No | — | `business_card`, `manual`, `import`, etc. |
| `source_detail` | text | No | — | Additional provenance info |
| `status` | `contact_status` | Yes | `NEW` | `NEW`, `REVIEWED`, `ACTIVE`, `INACTIVE` |
| `notes_text` | text | No | — | Inline notes |
| `owner_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `stakeholder_role` | `stakeholder_role` | No | — | Buyer role in decision process |
| `influence_level` | `influence_level` | No | — | |
| `relationship_strength` | integer | No | — | 0–100 numeric score |
| `relationship_strength_label` | `relationship_strength_label` | No | — | `COLD`, `DEVELOPING`, `STRONG`, `STRATEGIC` |
| `is_primary_relationship` | boolean | Yes | `false` | Primary contact for org |
| `role_notes` | text | No | — | Notes on their decision-making role |
| `master_contact_id` | text (FK→master_contacts) | No | — | Link to master DB contact |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

---

### Domain: CRM — Opportunities and Pipelines

#### `pipelines`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `name` | text | Yes | — | |
| `category` | text | No | — | e.g., `EMS` for EMS-specific pipelines |
| `created_at` | timestamp | Yes | `now()` | |

#### `pipeline_stages`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `pipeline_id` | text (FK→pipelines) | Yes | — | ON DELETE CASCADE |
| `name` | text | Yes | — | Stage display name |
| `stage_order` | integer | Yes | — | Unique per pipeline |
| `probability_percent` | integer | Yes | `0` | Win probability at this stage (0–100) |
| `created_at` | timestamp | Yes | `now()` | |

**Unique constraint:** `(pipeline_id, stage_order)`

#### `opportunities`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `pipeline_id` | text (FK→pipelines) | Yes | — | ON DELETE CASCADE |
| `pipeline_stage_id` | text (FK→pipeline_stages) | Yes | — | ON DELETE RESTRICT (prevents stage deletion if opps exist) |
| `organization_id` | text (FK→organizations) | No | — | ON DELETE SET NULL |
| `primary_contact_id` | text (FK→contacts) | No | — | ON DELETE SET NULL |
| `title` | text | Yes | — | |
| `description` | text | No | — | |
| `vertical` | `opportunity_vertical` | Yes | `CONSULTING` | |
| `value_estimate` | double precision | No | — | USD deal value |
| `close_date_estimate` | timestamp | No | — | |
| `status` | `opportunity_status` | Yes | `OPEN` | `OPEN`, `WON`, `LOST`, `ON_HOLD` |
| `score` | integer | No | — | Internal score (0–100) |
| `source` | text | No | — | How the opp was sourced |
| `owner_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `stage_entered_at` | timestamp | No | — | When the opp entered current stage |
| `service_line_id` | text (FK→service_lines) | No | — | ON DELETE SET NULL |
| `onboarding_vertical_id` | text (FK→verticals) | No | — | |
| `onboarding_sub_vertical_id` | text (FK→sub_verticals) | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `opportunity_contacts`

Junction table: many contacts can be linked to one opportunity.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `opportunity_id` | text (FK→opportunities) | Yes | — | ON DELETE CASCADE |
| `contact_id` | text (FK→contacts) | Yes | — | ON DELETE CASCADE |
| `relationship_role` | text | No | — | Their role on this specific deal |

**Unique constraint:** `(opportunity_id, contact_id)`

#### `opportunity_ems_interfacility_profiles`

One-to-one overlay for EMS opportunities.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | |
| `opportunity_id` | text (FK→opportunities) | Yes | — | ON DELETE CASCADE; UNIQUE |
| `service_mix_bls` | boolean | Yes | `false` | Basic Life Support |
| `service_mix_als` | boolean | Yes | `false` | Advanced Life Support |
| `service_mix_cct` | boolean | Yes | `false` | Critical Care Transport |
| `current_provider_name` | text | No | — | Who currently holds the contract |
| `estimated_monthly_transports` | integer | No | — | |
| `payer_mix_medicare_percent` | integer | No | — | 0–100 |
| `payer_mix_medicaid_percent` | integer | No | — | 0–100 |
| `payer_mix_private_percent` | integer | No | — | 0–100 |
| `payer_mix_other_percent` | integer | No | — | 0–100 |
| `primary_pain_points` | text | No | — | Free text |
| `agreement_status` | text | No | — | e.g., `PENDING`, `SIGNED` |
| `protocol_go_live_date` | timestamp | No | — | |
| `active_consistency_start_date` | timestamp | No | — | When regular transport started |
| `active_last_qualified_transport_at` | timestamp | No | — | |
| `qualified_transports_last_30_days` | integer | No | — | |
| `avg_qualified_transports_per_week` | numeric | No | — | |
| `jurisdiction_eligibility` | text | No | — | |
| `jurisdiction_notes` | text | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `pipeline_view_templates`

Admin-managed templates for pipeline views. Published to workspaces during provisioning.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `key` | text | Yes | — | Unique slug |
| `name` | text | Yes | — | Display name |
| `vertical` | text | Yes | — | Which vertical this is for |
| `sub_vertical` | text | No | — | |
| `status` | `pipeline_view_template_status` | Yes | `draft` | `draft`, `active`, `inactive`, `archived` |
| `is_locked` | boolean | Yes | `false` | Admin-locked templates cannot be edited by clients |
| `is_client_editable` | boolean | Yes | `true` | Whether client can modify |
| `config_json` | jsonb | Yes | `{}` | Template configuration |
| `created_by_user_id` | text (FK→users) | No | — | |
| `updated_by_user_id` | text (FK→users) | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `workspace_pipeline_views` / `workspace_pipeline_view_permissions`

Workspace-specific instances of pipeline view templates with per-user permission overrides.

---

### Domain: CRM — Tasks, Activities, Notes

#### `tasks`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `contact_id` | text (FK→contacts) | No | — | ON DELETE SET NULL |
| `organization_id` | text (FK→organizations) | No | — | ON DELETE SET NULL |
| `opportunity_id` | text | No | — | No FK constraint (loose reference) |
| `title` | text | Yes | — | |
| `description` | text | No | — | |
| `due_date` | timestamp | No | — | |
| `priority` | `task_priority` | Yes | `MEDIUM` | |
| `status` | `task_status` | Yes | `OPEN` | |
| `assigned_to_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `created_by_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `completed_at` | timestamp | No | — | Set when status → COMPLETED |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `activities`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `contact_id` | text (FK→contacts) | No | — | ON DELETE SET NULL |
| `organization_id` | text (FK→organizations) | No | — | ON DELETE SET NULL |
| `opportunity_id` | text | No | — | Loose reference |
| `type` | `activity_type` | Yes | — | See enum above |
| `subject` | text | Yes | — | |
| `description` | text | No | — | |
| `occurred_at` | timestamp | Yes | `now()` | |
| `created_by_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `created_at` | timestamp | Yes | `now()` | |

#### `notes`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `contact_id` | text (FK→contacts) | No | — | ON DELETE SET NULL |
| `organization_id` | text (FK→organizations) | No | — | ON DELETE SET NULL |
| `opportunity_id` | text | No | — | Loose reference |
| `content` | text | Yes | — | Markdown or plain text |
| `created_by_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `audit_logs`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `entity_type` | text | Yes | — | e.g., `contact`, `organization` |
| `entity_id` | text | Yes | — | |
| `action` | text | Yes | — | e.g., `CREATE`, `UPDATE`, `DELETE` |
| `before_json` | jsonb | No | — | Previous state |
| `after_json` | jsonb | No | — | New state |
| `created_at` | timestamp | Yes | `now()` | |

> **Note:** `audit_logs` is written by the schema but is not yet exposed via any API endpoint. Status: **Planned**.

---

### Domain: CRM — Tags

#### `tags`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `name` | text | Yes | — | Unique per workspace |
| `color` | text | No | — | Hex color |
| `category` | text | No | — | Tag grouping |
| `created_at` | timestamp | Yes | `now()` | |

**Unique constraint:** `(workspace_id, name)`

#### `contact_tags` / `organization_tags`

Junction tables for many-to-many tag assignments. Each has `(contact_id/organization_id, tag_id)` unique constraint.

---

### Domain: Business Card Scanner

#### `business_cards`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `uploaded_by_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `image_url_front` | text | Yes | — | GCS object path |
| `image_url_back` | text | No | — | GCS object path |
| `raw_ocr_text` | text | No | — | Raw text from OCR |
| `parsed_json` | jsonb | No | — | Structured fields from LLM parsing |
| `processing_status` | `card_processing_status` | Yes | `UPLOADED` | `UPLOADED`→`PARSING`→`PARSED`/`FAILED` |
| `review_status` | `card_review_status` | Yes | `PENDING_REVIEW` | `PENDING_REVIEW`→`APPROVED`/`REJECTED`/`MERGED` |
| `linked_contact_id` | text (FK→contacts) | No | — | Set when approved and contact created/linked |
| `linked_organization_id` | text (FK→organizations) | No | — | Set when approved and org linked |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

---

### Domain: Organization Logo Scans

#### `organization_scans`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `uploaded_by_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `organization_id` | text (FK→organizations) | No | — | ON DELETE SET NULL; which org is being identified |
| `image_url` | text | Yes | — | GCS object path |
| `raw_ocr_text` | text | No | — | |
| `parsed_business_name` | text | No | — | Extracted business name |
| `confidence_score` | double precision | No | — | Match confidence (0–1) |
| `matched_place_json` | jsonb | No | — | Array of Google Places matches |
| `selected_match_json` | jsonb | No | — | Which match was selected |
| `processing_status` | `org_scan_processing_status` | Yes | `UPLOADED` | |
| `review_status` | `org_scan_review_status` | Yes | `PENDING_REVIEW` | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `admin_org_scan_attempts`

Admin-side version for enriching master organizations via logo scan.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `uploaded_by_admin_id` | text (FK→users) | No | — | |
| `image_url` | text | Yes | — | |
| `raw_ocr_text` | text | No | — | |
| `parsed_business_name` | text | No | — | |
| `confidence_score` | double precision | No | — | |
| `matched_place_json` | jsonb | No | — | |
| `selected_match_json` | jsonb | No | — | |
| `processing_status` | `admin_org_scan_processing_status` | Yes | `UPLOADED` | |
| `review_status` | `admin_org_scan_review_status` | Yes | `PENDING_REVIEW` | |
| `created_master_org_id` | text (FK→master_organizations) | No | — | Set when approved and master org created |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

---

### Domain: Organization Structure Scans

#### `organization_structure_scans`

Captures hierarchy inference results for a workspace org.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `organization_id` | text (FK→organizations) | Yes | — | ON DELETE CASCADE |
| `initiated_by_user_id` | text (FK→users) | No | — | ON DELETE SET NULL |
| `scan_status` | `structure_scan_status` | Yes | `PENDING` | Full pipeline: `PENDING`→`MASTER_MATCHED`→`EXTERNAL_SEARCHED`→`LLM_REVIEWED`→`COMPLETED`/`FAILED` |
| `review_status` | `structure_review_status` | Yes | `PENDING_REVIEW` | `PENDING_REVIEW`→`APPROVED`/`REJECTED` |
| `suggested_parent_master_organization_id` | text (FK→master_organizations) | No | — | AI-suggested parent |
| `suggested_parent_name` | text | No | — | |
| `suggested_ultimate_parent_name` | text | No | — | |
| `suggested_structure_type` | text | No | — | |
| `confidence_score` | double precision | No | — | |
| `evidence_summary` | text | No | — | |
| `external_source_payload` | jsonb | No | — | Raw external API response |
| `llm_reasoning_summary` | text | No | — | LLM reasoning text |
| `add_to_master_graph` | boolean | Yes | `false` | Whether approved result should be written to master DB |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

---

### Domain: Plans & Subscriptions

#### `plans`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `name` | text | Yes | — | Display name |
| `slug` | text | Yes | — | Unique identifier (e.g., `independent`) |
| `features` | jsonb | No | — | Feature flags per plan |
| `created_at` | timestamp | Yes | `now()` | |

#### `subscriptions`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `plan_id` | text (FK→plans) | Yes | — | No cascade; plan cannot be deleted if subscriptions exist |
| `status` | text | Yes | `active` | `active`, `cancelled`, `past_due` |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

---

### Domain: Master Database

#### `master_organizations`

The canonical organizational reference record.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `canonical_name` | text | Yes | — | Official name |
| `display_name` | text | No | — | Preferred display |
| `normalized_name` | text | Yes | — | Lowercased, punctuation-stripped for dedup |
| `website_domain` | text | No | — | |
| `industry` | `master_org_industry` | No | — | `HEALTHCARE`, `GOVCON`, `GENERAL_BUSINESS` |
| `sub_vertical` | text | No | — | |
| `account_structure_type` | `master_account_structure_type` | No | — | `ENTERPRISE`, `REGIONAL`, `FACILITY`, `SUB_FACILITY`, `GENERAL_ORG` |
| `is_standalone` | boolean | Yes | `false` | No parent; independent entity |
| `confidence_score` | double precision | Yes | `0.5` | Data quality score (0–1) |
| `source_type` | text | Yes | `MANUAL` | How it was created: `MANUAL`, `WORKSPACE_PROMOTED`, `ADMIN_SCAN` |
| `source_confidence` | double precision | Yes | `1.0` | Confidence in source |
| `validation_status` | `master_validation_status` | Yes | `UNVALIDATED` | `UNVALIDATED`, `PARTIALLY_VALIDATED`, `VALIDATED`, `REQUIRES_REVIEW` |
| `headquarters_address` | text | No | — | |
| `city` | text | No | — | |
| `state` | text | No | — | |
| `country` | text | No | — | |
| `notes` | text | No | — | Admin notes |
| `place_ids` | jsonb (string[]) | No | `[]` | Google Place IDs |
| `aliases` | jsonb (string[]) | No | `[]` | Known alternative names |
| `admin_flags` | jsonb (string[]) | No | `[]` | Admin annotation flags |
| `structure_last_scanned_at` | timestamp | No | — | |
| `structure_last_reviewed_at` | timestamp | No | — | |
| `source_workspace_id` | text (FK→workspaces) | No | — | Which workspace promoted this |
| `source_organization_id` | text | No | — | The workspace org ID that was promoted |
| `promoted_by_admin_user_id` | text (FK→users) | No | — | Which platform admin approved promotion |
| `promoted_at` | timestamp | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `master_organization_aliases`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `master_organization_id` | text (FK→master_organizations) | Yes | — | ON DELETE CASCADE |
| `alias_name` | text | Yes | — | |
| `normalized_alias_name` | text | Yes | — | Normalized for dedup |
| `alias_type` | `master_alias_type` | Yes | `VARIANT` | `DBA`, `ACQUIRED_BRAND`, `ABBREVIATION`, `FORMER_NAME`, `VARIANT` |
| `created_at` | timestamp | Yes | `now()` | |

#### `master_organization_relationships`

Parent-child links in the master org hierarchy graph.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `parent_master_organization_id` | text (FK→master_organizations) | Yes | — | ON DELETE CASCADE |
| `child_master_organization_id` | text (FK→master_organizations) | Yes | — | ON DELETE CASCADE |
| `relationship_type` | `master_relationship_type` | Yes | `SUBSIDIARY` | `SUBSIDIARY`, `REGIONAL`, `DBA`, `AFFILIATED` |
| `confidence_score` | double precision | Yes | `1.0` | |
| `evidence_summary` | text | No | — | Why this relationship was established |
| `source_payload` | jsonb | No | — | Raw data used to establish link |
| `approved_by_user_id` | text (FK→users) | No | — | |
| `review_status` | `master_relationship_review_status` | Yes | `APPROVED` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `master_org_healthcare_overlays`

One-to-one healthcare-specific data for a master org.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `master_organization_id` | text (FK→master_organizations) | Yes | — | UNIQUE; ON DELETE CASCADE |
| `facility_type` | text | No | — | e.g., `HOSPITAL`, `ASC`, `SNF` |
| `licensed_beds` | integer | No | — | |
| `trauma_level` | text | No | — | `LEVEL_I`–`LEVEL_IV` |
| `system_type` | text | No | — | e.g., `ACADEMIC_MEDICAL_CENTER`, `COMMUNITY_HOSPITAL` |
| `ownership_model` | text | No | — | `FOR_PROFIT`, `NON_PROFIT`, `GOVERNMENT`, `RELIGIOUS` |
| `care_setting` | text | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `master_org_govcon_overlays`

One-to-one GovCon-specific data for a master org.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `master_organization_id` | text (FK→master_organizations) | Yes | — | UNIQUE; ON DELETE CASCADE |
| `uei` | text | No | — | Unique Entity Identifier (SAM.gov) |
| `cage_code` | text | No | — | |
| `naics_codes` | jsonb (string[]) | No | `[]` | |
| `prime_or_sub` | text | No | — | |
| `contract_vehicles` | jsonb (string[]) | No | `[]` | e.g., GSA Schedule, GWAC |
| `agency_alignment` | text | No | — | Primary federal agency |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `master_org_ai_suggestions`

AI-generated field-level suggestions for master org enrichment.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `master_organization_id` | text (FK→master_organizations) | Yes | — | ON DELETE CASCADE |
| `field` | text | Yes | — | Field name (e.g., `industry`, `accountStructureType`) |
| `current_value` | text | No | — | Current field value |
| `suggested_value` | text | Yes | — | AI suggestion |
| `rationale` | text | No | — | Why the AI suggests this |
| `status` | `master_org_ai_suggestion_status` | Yes | `PENDING` | `PENDING`, `APPROVED`, `REJECTED` |
| `reviewed_by_user_id` | text (FK→users) | No | — | |
| `reviewed_at` | timestamp | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

---

### Domain: Master Contacts and Promotion Queue

#### `master_contacts`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `master_organization_id` | text (FK→master_organizations) | Yes | — | ON DELETE CASCADE |
| `full_name` | text | Yes | — | |
| `first_name` | text | No | — | |
| `last_name` | text | No | — | |
| `title` | text | No | — | |
| `department` | text | No | — | |
| `email` | text | No | — | |
| `phone` | text | No | — | |
| `mobile` | text | No | — | |
| `linkedin_url` | text | No | — | |
| `stakeholder_role` | `master_contact_role` | No | — | |
| `influence_level` | `master_contact_influence` | No | — | |
| `confidence_score` | double precision | Yes | `0.5` | |
| `validation_status` | `master_contact_validation_status` | Yes | `UNVALIDATED` | |
| `notes` | text | No | — | |
| `source_workspace_id` | text (FK→workspaces) | No | — | |
| `source_contact_id` | text | No | — | Workspace contact that was promoted |
| `promoted_by_admin_user_id` | text (FK→users) | No | — | |
| `promoted_at` | timestamp | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

#### `master_promotion_queue`

Holds pending promotion requests for admin review.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `entity_type` | `promotion_entity_type` | Yes | — | `ORG`, `CONTACT`, `NOTE` |
| `entity_id` | text | Yes | — | ID within the workspace |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `change_type` | `promotion_change_type` | Yes | — | `CREATED`, `UPDATED`, `NOTE_ADDED` |
| `status` | `promotion_status` | Yes | `PENDING` | `PENDING`, `APPROVED_NEW`, `APPROVED_MERGE`, `APPROVED_LINK`, `REJECTED` |
| `resolved_master_id` | text | No | — | Master entity ID after resolution |
| `rejection_reason` | text | No | — | |
| `source_snapshot` | jsonb | No | — | Snapshot of workspace entity at time of submission |
| `resolved_by_user_id` | text (FK→users) | No | — | Platform admin who resolved |
| `resolved_at` | timestamp | No | — | |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

---

### Domain: Onboarding and Provisioning

#### `verticals` / `sub_verticals` / `service_lines` / `add_on_types`

Global configuration tables managed by the platform team. Define what verticals, service lines, and add-ons are available system-wide.

| Table | Key Fields | Notes |
|---|---|---|
| `verticals` | `key` (unique), `label`, `is_active`, `sort_order` | e.g., key=`healthcare` |
| `sub_verticals` | `vertical_id`, `key` (unique per vertical), `label` | e.g., key=`ems` under `healthcare` |
| `service_lines` | `vertical_id`, `sub_vertical_id`, `key`, `default_pipeline_template_key` | Links to pipeline templates |
| `add_on_types` | `key` (unique), `label`, `config_schema` | Feature add-ons (e.g., GovCon module) |

#### `workspace_onboarding_config`

Per-workspace vertical/sub-vertical configuration. One row per workspace.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `workspace_id` | text (FK→workspaces) | Yes | — | UNIQUE |
| `vertical_id` | text (FK→verticals) | No | — | Resolved FK |
| `sub_vertical_id` | text (FK→sub_verticals) | No | — | |
| `vertical_text` | text | No | — | Legacy free-text backup |
| `sub_vertical_text` | text | No | — | Legacy |
| `default_contact_roles` | jsonb | Yes | `[]` | List of default contact role strings |

#### `workspace_service_lines`

Which service lines are enabled for a workspace.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `workspace_id` + `service_line_id` | — | Yes | — | Unique pair |
| `is_enabled` | boolean | Yes | `true` | |
| `custom_label` | text | No | — | Client can rename |
| `custom_config` | jsonb | No | — | Per-workspace config overrides |
| `enabled_by_admin_user_id` | text (FK→users) | No | — | |

#### `workspace_add_ons`

Which add-ons are enabled for a workspace.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `workspace_id` + `add_on_type_id` | — | Yes | — | Unique pair |
| `status` | `workspace_add_on_status` | Yes | `ACTIVE` | `ACTIVE`, `SUSPENDED`, `PENDING_CONFIG` |
| `config` | jsonb | Yes | `{}` | |

#### `client_onboarding_sessions`

One session per onboarding engagement (admin-led).

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `status` | `onboarding_session_status` | Yes | `DRAFT` | Full lifecycle: `DRAFT`→`INTAKE`→`AWAITING_RECOMMENDATION`→`NORMALIZING`→`REVIEW`→`LOCKED`→`PROVISIONING`→`PROVISIONED`/`FAILED` |
| `client_type` | `onboarding_client_type` | Yes | `SMALL_TEAM` | `SINGLE_USER`, `SMALL_TEAM`, `ENTERPRISE` |
| `intake_payload` | jsonb | Yes | `{}` | Admin-entered client details |
| `grok_raw_payload` | jsonb | No | — | Raw AI response |
| `grok_model_version` | text | No | — | Which AI model was used |
| `grok_confidence` | double precision | No | — | Overall AI confidence |
| `normalized_recommendation` | jsonb | No | — | Normalized AI output after `grokNormalizer.ts` |
| `admin_decisions` | jsonb | Yes | `{}` | Per-item admin approve/edit/reject |
| `applied_config` | jsonb | No | — | Final config used for provisioning |
| `created_from_preset_id` | text | No | — | If started from a preset |
| `created_workspace_id` | text (FK→workspaces) | No | — | Set after CREATE_WORKSPACE step |
| `created_by_admin_user_id` | text (FK→users) | No | — | |
| `notes` | text | No | — | Admin notes |
| `normalized_at` / `locked_at` / `provisioned_at` / `archived_at` | timestamp | No | — | Lifecycle timestamps |

#### `onboarding_provisioning_steps`

One row per provisioning step per session. Tracks progress.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `session_id` + `step_key` | — | Yes | — | Unique pair |
| `status` | `provisioning_step_status` | Yes | `PENDING` | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `SKIPPED` |
| `attempt_count` | integer | Yes | `0` | Incremented on each retry |
| `last_error` | text | No | — | Error message if FAILED |
| `result_payload` | jsonb | No | — | Output of completed step |
| `started_at` / `completed_at` | timestamp | No | — | |

#### `onboarding_review_items`

Per-item review records within an onboarding session.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `session_id` | text (FK→sessions) | Yes | — | |
| `group_key` | text | Yes | — | Category grouping (e.g., `verticals`) |
| `item_key` | text | Yes | — | Specific item identifier |
| `label` | text | Yes | — | Display label |
| `suggested_value_json` | jsonb | No | — | AI suggestion |
| `final_value_json` | jsonb | No | — | After admin edit/approval |
| `confidence_band` | `ai_confidence_band` | Yes | `MEDIUM` | `HIGH`, `MEDIUM`, `LOW` |
| `confidence_score` | numeric | No | — | 0–100 |
| `status` | `onboarding_review_item_status` | Yes | `PENDING` | `PENDING`, `APPROVED`, `EDITED`, `REJECTED` |
| `is_required` | boolean | Yes | `true` | Session cannot lock until all required items are resolved |
| `reviewed_by_user_id` | text (FK→users) | No | — | |
| `reviewed_at` | timestamp | No | — | |

#### `workspace_launch_checklist`

Per-workspace checklist items (created during provisioning).

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `workspace_id` + `item_key` | — | Yes | — | Unique pair |
| `label` | text | Yes | — | |
| `status` | `launch_checklist_item_status` | Yes | `PENDING` | `PENDING`, `COMPLETED`, `SKIPPED` |
| `required_for_client_types` | jsonb | Yes | `["SINGLE_USER","SMALL_TEAM","ENTERPRISE"]` | |
| `completed_at` / `completed_by_user_id` | — | No | — | Set when marked complete |

#### `workspace_health_snapshots`

Point-in-time health snapshots for a workspace.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `workspace_id` | text (FK→workspaces) | Yes | — | |
| `snapshot_date` | timestamp | Yes | `now()` | |
| `setup_completeness_pct` | integer | Yes | `0` | 0–100 |
| `active_user_count` | integer | Yes | `0` | |
| `contact_count` | integer | Yes | `0` | |
| `org_count` | integer | Yes | `0` | |
| `opportunity_count` | integer | Yes | `0` | |
| `missing_data_flags` | jsonb | Yes | `[]` | List of identified gaps |
| `grok_improvement_suggestions` | jsonb | Yes | `[]` | AI improvement suggestions |

#### `onboarding_presets`

Saved onboarding templates for quick reuse.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | text | Yes | — | |
| `vertical_id` + `sub_vertical_id` | text (FK) | No | — | |
| `is_public` | boolean | Yes | `false` | Available to all admins |
| `preset_payload` | jsonb | Yes | `{}` | Full intake+config payload |
| `usage_count` | integer | Yes | `0` | Auto-incremented |
| `version` | integer | Yes | `1` | |
| `created_from_session_id` | text | No | — | |

#### `workspace_intelligence`

Seeded intelligence records (saved views, alerts, patterns) created during provisioning.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `workspace_id` | text (FK→workspaces) | Yes | — | |
| `kind` | text | Yes | — | e.g., `saved_view`, `alert`, `pattern` |
| `key` | text | Yes | — | Unique per (workspace, kind) |
| `label` | text | Yes | — | |
| `severity` | text | No | — | For alerts |
| `data` | jsonb | Yes | `{}` | Content |
| `source` | text | Yes | `onboarding` | |
| `is_active` | boolean | Yes | `true` | |

**Unique constraint:** `(workspace_id, kind, key)`

---

### Domain: Healthcare Intelligence

#### `organization_healthcare_profile`

One-to-one with `organizations`. Stores CMS data with full traceability.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `organization_id` | text (FK→organizations) | Yes | — | UNIQUE |
| `workspace_id` | text (FK→workspaces) | Yes | — | |
| `cms_ccn` | text | No | — | CMS Certification Number |
| `cms_provider_type` | text | No | — | Free text (enum normalization deferred) |
| `cms_ownership_type` | text | No | — | |
| `cms_bed_count` | integer | No | — | Licensed beds |
| `cms_emergency_services` | boolean | No | — | |
| `cms_overall_star_rating` | integer | No | — | 1–5 |
| `cms_patient_experience_rating` | integer | No | — | 1–5 |
| `cms_ed_total_time_minutes` | integer | No | — | ED door-to-disposition |
| `cms_ed_time_to_admit_minutes` | integer | No | — | ED door-to-inpatient |
| `cms_ed_boarding_time_minutes` | integer | No | — | ED boarding time |
| `cms_ed_lwbs_percent` | integer | No | — | Left Without Being Seen; stored as basis points (450 = 4.50%) |
| `cms_care_transition_rating` | integer | No | — | |
| `cms_patient_experience_subscores_json` | jsonb | No | — | `Record<string, number>` |
| `cms_raw_json` | jsonb | No | — | Full raw CMS response |
| `cms_source` | text | No | — | |
| `cms_verification_status` | `cms_verification_status_enum` | No | — | `MATCHED`, `VERIFIED`, `NEEDS_REVIEW`, `REJECTED`, `IMPORT_ERROR` |
| `cms_last_updated_at` | timestamp | No | — | When CMS data was last refreshed |
| `cms_source_url` | text | No | — | |
| `cms_dataset_name` | text | No | — | e.g., `Hospital Compare` |
| `cms_dataset_version` | text | No | — | |
| `cms_extracted_at` | timestamp | No | — | When extracted from CMS |
| `cms_effective_date` | date | No | — | Data effective date |
| `cms_match_method` | text | No | — | `ccn_exact`, `name_fuzzy`, `manual` |
| `cms_match_confidence_score` | integer | No | — | 0–100 |

**Stale threshold:** CMS data older than 90 days triggers amber warning in UI.

#### `organization_pain_points`

Pain points for healthcare orgs. CMS signals → SUGGESTED only; promotion to VERIFIED requires admin approval.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `organization_id` | text (FK→organizations) | Yes | — | ON DELETE CASCADE |
| `workspace_id` | text (FK→workspaces) | Yes | — | |
| `department` | text | No | — | Affected clinical department |
| `pain_point_category` | `pain_point_category` | Yes | — | |
| `pain_point_statement` | text | No | — | Human-readable description |
| `severity` | `pain_point_severity` | Yes | `MEDIUM` | |
| `frequency` | `pain_point_frequency` | No | — | |
| `source_type` | `pain_point_source_type` | Yes | — | |
| `source_reference` | text | No | — | Which CMS metric or user input |
| `evidence_type` | `evidence_type` | No | — | |
| `linked_cms_signal_key` | text | No | — | e.g., `cms_ed_boarding_time_minutes` |
| `confidence_score` | integer | Yes | `50` | 0–100 |
| `verification_status` | `pain_point_verification_status` | Yes | `SUGGESTED` | **Never auto-VERIFIED; must be approved** |
| `is_active` | boolean | Yes | `true` | Soft delete |
| `reviewed_by_user_id` | text (FK→users) | No | — | |
| `reviewed_at` | timestamp | No | — | |
| `review_note` | text | No | — | |

**Idempotency key** (CMS suggestions): `(org_id, category, linked_cms_signal_key, source_type)` — prevents duplicate suggestions.

#### `organization_competitors`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `organization_id` | text (FK→organizations) | Yes | — | |
| `workspace_id` | text (FK→workspaces) | Yes | — | |
| `competitor_name` | text | Yes | — | |
| `competitor_type` | `competitor_type` | Yes | `UNKNOWN` | |
| `service_line` | text | No | — | |
| `incumbent_status` | `incumbent_status` | Yes | `NOT_INCUMBENT` | |
| `share_of_wallet_estimate` | integer | No | — | 0–100; null = unknown |
| `contract_status` | `contract_status` | No | `UNKNOWN` | |
| `strengths` | jsonb (string[]) | No | `[]` | |
| `weaknesses` | jsonb (string[]) | No | `[]` | |
| `pain_points_caused` | jsonb (string[]) | No | `[]` | **DERIVED/CACHED** — do not write directly; re-aggregated from `competitor_pain_point_links` |
| `displacement_difficulty` | `displacement_difficulty` | No | `MEDIUM` | |
| `source_type` | `pain_point_source_type` | No | — | |
| `source_reference` | text | No | — | |
| `confidence_score` | integer | Yes | `50` | |
| `verification_status` | `pain_point_verification_status` | Yes | `SUGGESTED` | |
| `is_active` | boolean | Yes | `true` | |

#### `competitor_pain_point_links`

**Source of truth** for competitor↔pain-point relationships.

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `organization_competitor_id` | text (FK→organization_competitors) | Yes | — | ON DELETE CASCADE |
| `organization_pain_point_id` | text (FK→organization_pain_points) | Yes | — | ON DELETE CASCADE |
| `relationship_type` | `competitor_pain_point_relationship_type` | Yes | `CAUSED_BY` | `CAUSED_BY`, `EXACERBATED_BY`, `MASKED_BY`, `OPPORTUNITY_ANGLE` |
| `confidence_score` | integer | Yes | `50` | |
| `notes` | text | No | — | |

When any link row is created or deleted, the API layer must call `refreshPainPointsCausedCache(competitorId)` to re-aggregate `organization_competitors.pain_points_caused`.

---

# 3. Per-Feature Logic

## 3.1 Authentication

**Purpose:** Authenticate users and associate them with a workspace.

**Inputs:** `email`, `password`, optional `rememberMe` (login); `email`, `password`, `firstName`, `lastName`, `workspaceName` (signup).

**Outputs:** JWT token containing `{ userId, workspaceId, email }`.

**Business Rules:**
- Emails are normalized to lowercase on creation and lookup
- Passwords must be at least 6 characters
- Login finds workspace by owner lookup first, then falls back to `workspace_members`
- A user without a workspace cannot log in
- On signup: user + workspace + OWNER membership + "independent" plan subscription are created atomically

**Validations:**
- Email uniqueness checked before creation (HTTP 409 on conflict)
- Password length validation (min 6 chars)

**Triggers / Automations:**
- Workspace creation includes default `industryFocus = "Healthcare & Government Contracting"`
- "independent" plan assigned automatically; if plan not found in DB, subscription is skipped silently

**Edge Cases:**
- `forgot-password` endpoint **is a stub** — returns a success message without sending any email. Email delivery is **Planned**.
- OAuth/external auth provider field (`auth_provider_id`) exists in schema but no OAuth provider is wired up.
- A user who was invited (existing user added to workspace) logs in via their own workspace first; they cannot switch workspaces from the UI.

**Role involved:** None (pre-auth). After login: OWNER is assumed for self-signup users.

---

## 3.2 Business Card Scanner (OCR Pipeline)

**Purpose:** Convert a photographed business card into a verified contact + org record.

**Inputs:** Image file (JPEG/PNG, max 20 MB), uploaded via `multipart/form-data`.

**Outputs:** `business_card` record → `contact` record + optional `organization` record on approval.

**Business Rules:**
1. Image is uploaded to Google Cloud Storage (GCS) via `objectStorageClient`
2. OCR is triggered via `parseBusinessCardImage()` (GPT-4o Vision)
3. Raw OCR text → structured JSON (`parsedJson`) via LLM parsing
4. Card enters `PENDING_REVIEW` state; user reviews in the card review screen
5. On `APPROVE`: contact is created from parsed fields; if org name present, org is created or matched; card is marked `APPROVED`; activity log entry created
6. On `REJECT`: card is marked `REJECTED`; no entities created
7. On `MERGE`: card is linked to an existing contact; `MERGED` status

**Validations:**
- File must be present (HTTP 400 if missing)
- OCR availability check via `isOcrAvailable()` — if OCR fails, card stays in `UPLOADED` state

**Side Effects:**
- Contact creation triggers `enqueuePromotion()` to add to master promotion queue (if enabled)
- Activity of type `CARD_SCAN` is created

**Approval Requirements:** The reviewing user must be a workspace member. No admin-only gate on approval.

**PHI Warning:** PHI warning is displayed in the card review form when card contains health-related data.

**Edge Cases:**
- Back-of-card image is optional
- Parsed JSON may have missing fields; review UI shows blanks
- Duplicate contact detection is **not implemented** at approval time — Planned

---

## 3.3 Organization Logo/Brand Scan

**Purpose:** Identify an organization from its logo or signage photograph.

**Inputs:** Image file uploaded via scan interface.

**Outputs:** Organization matched to a Google Places result; org record enriched with place data.

**Business Rules:**
1. Image uploaded to GCS
2. OCR extracts business name text
3. Confidence-scored match against Google Places API
4. User reviews candidate matches and selects correct one
5. On APPROVE: workspace org is updated with `google_place_id`, `formatted_address`, `latitude`, `longitude`, `place_category`; activity of type `LOGO_SCAN` created

**Validations:** Organization must belong to caller's workspace.

**Edge Cases:**
- Multiple candidate matches returned as `matched_place_json`; user picks via `selected_match_json`
- Scan can be done without a pre-existing organization (creates new org if needed)

---

## 3.4 Organization Hierarchy and Structure Scans

**Purpose:** Infer parent/child/ultimate-parent relationships for a workspace organization using the master database, external sources, and LLM reasoning.

**Inputs:** `organization_id` to scan.

**Outputs:** `organization_structure_scans` record with suggested parent hierarchy; activity log entries.

**Pipeline Stages:**
1. `PENDING` → Check master database for known parent
2. `MASTER_MATCHED` (if found) → Suggest from master DB
3. `EXTERNAL_SEARCHED` → Search external APIs for additional evidence
4. `LLM_REVIEWED` → LLM synthesizes evidence and proposes hierarchy
5. `COMPLETED` / `FAILED`

**Approval Flow:**
- Result enters `PENDING_REVIEW` state
- On APPROVE: `parent_organization_id` and `ultimate_parent_organization_id` set on the org; `hierarchy_source_type` = `LLM_SYNTHESIS` or `MASTER_DATABASE`; activities logged as `STRUCTURE_APPROVED`
- On REJECT: activities logged as `STRUCTURE_REJECTED`; org hierarchy unchanged

**If `add_to_master_graph = true`:** Approved hierarchy is also written to `master_organization_relationships` table.

---

## 3.5 Master Database Promotion

**Purpose:** Elevate high-quality workspace org/contact data to the canonical master database.

**Inputs:** Workspace `organization_id` or `contact_id`; optional change type (`CREATED`, `UPDATED`, `NOTE_ADDED`).

**Outputs:** `master_promotion_queue` record; after admin resolution: `master_organizations` or `master_contacts` record.

**Business Rules:**
- Queue is appended to by `enqueuePromotion()` helper — called after org/contact creation or significant updates
- Admin resolves each queue item as:
  - `APPROVED_NEW` → create new master record
  - `APPROVED_MERGE` → merge data into existing master record
  - `APPROVED_LINK` → link workspace record to existing master record without merging data
  - `REJECTED` → discard

**Validations:**
- `source_snapshot` captures the entity state at time of promotion request (not the latest state)
- Admin cannot auto-promote; every promotion requires explicit human decision

**Downstream Effects:**
- On `APPROVED_NEW` or `APPROVED_MERGE`: `master_organization_id` or `master_contact_id` field on workspace entity is updated
- `promoted_by_admin_user_id` and `promoted_at` written to master record
- `source_workspace_id` and `source_organization_id` preserved for provenance

---

## 3.6 Master Org AI Suggestions

**Purpose:** Use AI (Grok/OpenAI) to suggest field-level enrichments for master organization records.

**Inputs:** `master_organization_id`; the AI analyses the org's current data and external signals.

**Outputs:** `master_org_ai_suggestions` records with `PENDING` status.

**Business Rules:**
- AI suggestions are NEVER auto-applied; every suggestion requires admin APPROVE or REJECT
- A normalization safety net (`normalizeFieldValue()`) maps AI output variations to valid enum values before storing
- Per-field suggestions: `industry`, `accountStructureType`, `healthcare.facilityType`, `healthcare.traumaLevel`, `healthcare.systemType`, `healthcare.ownershipModel`, `healthcare.careSetting`, `govcon.primeOrSub`, `govcon.agencyAlignment`, `govcon.naicsCodes`, etc.

**Approval Flow:**
- APPROVE: field value written to `master_organizations` or its overlay tables; suggestion marked `APPROVED`
- REJECT: suggestion marked `REJECTED`; field unchanged

**Edge Cases:**
- AI may produce values outside enum; normalizer maps to nearest valid value or preserves raw value
- Suggestions can be regenerated; new suggestions created but previous ones not overwritten

---

## 3.7 Account Intelligence Pulse (Org Intelligence)

**Purpose:** Compute a real-time relationship health + opportunity status summary for an organization.

**Inputs:** Organization ID and all associated contacts, activities, tasks, opportunities from workspace.

**Outputs:** `OrgIntelligenceResult` with: `accountState`, `health` score (0–100), `risk` score, `coverageGaps`, `primaryAction`, `openOpportunities`, `contacts` with computed strength.

**Business Rules (rules-based, no AI):**

Account state determination:
- `COLD`: no activity in last 30 days AND no open opportunities
- `WARMING`: activity in last 30 days, no open opportunities
- `ACTIVE`: activity in last 14 days, has open opportunities
- `AT_RISK`: has open opportunity with stage not progressed in 14+ days OR overdue task 14+ days old
- `EXPANDING`: multiple open opportunities with recent activity

Health score (0–100) based on:
- Activity recency within 14 days
- Number of primary contacts with relationship strength
- Open opportunity win probability

Risk score:
- Elevated by: overdue tasks, stale pipeline stages, inactive primary contacts

Coverage gaps:
- Missing DECISION_MAKER, CHAMPION, or other key stakeholder roles
- No primary relationship contact

Primary action:
- Computed from account state and most urgent signal (e.g., "Schedule follow-up", "Advance deal to next stage", "Capture missing contact")

**Trigger:** Called on demand via `GET /api/organizations/:id/intelligence`.

---

## 3.8 Healthcare Intelligence (CMS + Pain Points + Competitors)

**Purpose:** Provide healthcare-specific intelligence for accounts in the healthcare vertical.

**Inputs:** `organization_id` (must have `vertical = 'healthcare'`).

**Outputs:** CMS profile data; verified and suggested pain points; competitor landscape; 7-dimension opportunity score; cached intelligence summary.

**CMS Profile Logic:**
- CMS data stored in `organization_healthcare_profile`
- `cms_verification_status` determines display: `MATCHED`/`VERIFIED` = green; `NEEDS_REVIEW` = amber
- Stale threshold: `cms_last_updated_at` > 90 days → amber warning displayed

**Pain Points Logic:**
- CMS signals auto-generate `SUGGESTED` pain points (idempotent by `(org_id, category, cms_signal_key, source_type)`)
- SUGGESTED → PENDING_REVIEW → VERIFIED (requires admin approve) or REJECTED
- VERIFIED pain points shown in "Verified" tab; SUGGESTED shown in "Suggested" tab
- "Needs Review" dot shown to ALL workspace members (not admin-gated) when SUGGESTED items exist

**Competitor Logic:**
- Competitors tracked with incumbent status, strengths, weaknesses, displacement difficulty
- `pain_points_caused` on competitors is DERIVED — re-aggregated from `competitor_pain_point_links` whenever links change (never written directly)
- Strengths displayed as green dot; weaknesses as red dot

**7-Dimension Opportunity Score:**
Dimensions: CMS data completeness, pain point severity, competitor weakness, buyer access, stakeholder coverage, recent activity, entry strategy clarity. Each dimension scored 0–100, weighted, combined into overall score. Thresholds: ≥70 = green, 40–69 = amber, <40 = red.

**Intelligence Summary:**
- Cached in `organizations.organization_intelligence_summary` (jsonb)
- Recomputed via `POST /organizations/:id/compute-intelligence-summary`
- Shape: `{ topPainPoints[], topCompetitors[], buyerPatterns[], entryStrategy, primaryAction, impactStatement, computedAt }`

---

## 3.9 Admin-Led Onboarding and Provisioning

**Purpose:** Allow platform admins to configure and provision a new client workspace with AI-assisted setup.

**Inputs (Intake):** `clientName`, `website`, `industryDescription`, `productsSold`, `customerType`, `salesCycleType`, `teamSize`.

**AI Recommendation (Grok/OpenAI):**
- AI analyzes intake and recommends: vertical, sub-vertical, service lines, pipeline templates, contact roles, add-on modules
- Confidence band (HIGH/MEDIUM/LOW) shown per item
- All items enter `PENDING` status as `onboarding_review_items`

**Review Phase:**
- Admin approves, edits, or rejects each item
- Session cannot lock until all `is_required = true` items are resolved
- Once all resolved, session status → `LOCKED`; `applied_config` generated

**Provisioning Phase (16 sequential steps):**

| Step | Description |
|---|---|
| `CREATE_WORKSPACE` | Create workspace record |
| `ASSIGN_PLAN` | Assign subscription plan |
| `CREATE_MEMBERSHIPS` | Create owner membership |
| `APPLY_VERTICAL_CONFIG` | Set vertical/sub-vertical config |
| `ENABLE_SERVICE_LINES` | Enable selected service lines |
| `ENABLE_ADD_ONS` | Enable selected add-ons |
| `PUBLISH_PIPELINE_TEMPLATES` | Clone pipeline templates → workspace pipelines |
| `SEED_CONTACT_ROLES` | Seed default contact roles |
| `SEED_TAGS` | Seed default tags |
| `SEED_SAVED_VIEWS` | Seed default saved views |
| `SEED_DEFAULT_TASKS` | Seed default onboarding tasks |
| `SEED_ALERTS` | Seed intelligence alerts |
| `CREATE_LAUNCH_CHECKLIST` | Create launch checklist items by client type |
| `SEND_INVITE_EMAILS` | Send invite emails — **STUB: not implemented** |
| `RECORD_AUDIT_ENTRY` | Write audit log |
| `SNAPSHOT_HEALTH_BASELINE` | Take initial workspace health snapshot |

**Launch Checklists by Client Type:**
- `SINGLE_USER`: REVIEW_PIPELINE, ADD_FIRST_CONTACT, CONFIRM_FIRST_TARGET
- `SMALL_TEAM`: + ASSIGN_USERS, CONFIGURE_PERMISSIONS
- `ENTERPRISE`: + CONFIGURE_REPORTING

**Retry Logic:** Failed steps can be retried via `retryFailedOnly = true` flag without re-running completed steps.

---

# 4. Full Workflow Map

## 4.1 Self-Service Signup

1. User visits public landing page
2. User taps "Sign Up" → signup screen
3. User enters: first name, last name, email, password, workspace name
4. Backend validates: email format, password length ≥ 6, email uniqueness
5. Backend creates: `users` record, `workspaces` record (industry_focus = "Healthcare & Government Contracting"), `workspace_members` record (role = OWNER), `subscriptions` record (plan = "independent")
6. JWT token returned; user logged in as OWNER
7. User redirected to dashboard (empty state)
8. **No email verification. No guided first-run. No industry selection.**

## 4.2 Admin-Led Onboarding

1. Platform admin logs in via `/admin/login` (requires `is_platform_admin = true`)
2. Admin navigates to `/admin/onboarding/new`
3. Admin fills intake form (client details, sales cycle type, team size)
4. System creates `client_onboarding_sessions` record in `INTAKE` status
5. Admin triggers AI recommendation → session → `AWAITING_RECOMMENDATION`
6. AI (Grok) analyzes intake → returns recommended config → `normalizedAt` set; session → `REVIEW`
7. Admin reviews each `onboarding_review_items` line: approve / edit / reject
8. All required items resolved → session → `LOCKED`; `appliedConfig` computed
9. Admin triggers provisioning → `PROVISIONING`
10. 16 provisioning steps execute sequentially with retry on failure
11. Session → `PROVISIONED`; `created_workspace_id` set
12. Admin navigates to launch screen
13. Launch screen shows activation summary (pipeline count, view count, task count)
14. Admin taps "Open Priority Dashboard" to enter workspace

## 4.3 Organization Creation and Updates

1. User taps "Add Organization" or "New Organization"
2. User enters: name (required), type, website, phone, address fields, vertical, tags
3. Backend validates: name is non-empty, workspace membership
4. Organization created in workspace
5. If `parent_organization_id` provided: cycle detection runs; `ultimate_parent_organization_id` computed; parent org must be in same workspace
6. If parent changes: `propagateUltimateParent()` updates all descendants
7. `enqueuePromotion()` called with `changeType = CREATED` for master DB review
8. Tags applied via `organization_tags` junction

**Updates:**
1. PATCH request with changed fields
2. If parent changes: cycle check → ultimate parent recomputed → propagated to descendants
3. `enqueuePromotion()` called with `changeType = UPDATED`
4. `updatedAt` auto-updated

## 4.4 Contact Creation and Updates

1. User adds contact manually or via business card approval
2. Required: `full_name` (or derived from first+last)
3. Optional: org link, title, department, email, phone, LinkedIn, status, tags, stakeholder role, relationship strength
4. On creation: `status = NEW`; `source` set to creation method
5. If linked to org: shows on org detail screen's contacts tab
6. `enqueuePromotion()` called for master DB review

**From Business Card Approval:**
1. Card review screen shows parsed fields
2. User can edit any field before confirming
3. On approve: contact created with `source = business_card`; org optionally created/linked; card `review_status = APPROVED`; `linked_contact_id` set

## 4.5 Business Card Intake → OCR → Review → Approval

1. User opens scanner → camera or gallery
2. Image uploaded to GCS via `POST /api/business-cards/upload`
3. Card record created with `processing_status = UPLOADED`
4. OCR triggered: `parseBusinessCardImage()` via GPT-4o Vision
5. `processing_status` → `PARSING` → `PARSED` (or `FAILED`)
6. `parsed_json` contains: `{ name, title, company, email, phone, mobile, linkedin, address, notes }`
7. Card enters `PENDING_REVIEW` queue
8. User sees card in review list; taps to open review screen
9. User reviews/edits extracted fields
10. User approves → contact created → card `review_status = APPROVED`
11. User rejects → card `review_status = REJECTED`
12. User merges → linked to existing contact → card `review_status = MERGED`

## 4.6 Master Database Sync (Promotion Workflow)

1. Workspace org or contact is created/updated
2. `enqueuePromotion()` inserts into `master_promotion_queue` with `status = PENDING` and `source_snapshot` of entity
3. Platform admin views promotion queue at `/admin/master-promotion/queue`
4. Admin sees: entity type, workspace name, change type, snapshot data
5. Admin checks for existing master record match (name/domain similarity)
6. Admin decides:
   - **APPROVED_NEW**: Creates new `master_organizations` or `master_contacts`; sets workspace entity's `master_organization_id` or `master_contact_id`
   - **APPROVED_MERGE**: Merges snapshot data into existing master record; links workspace entity
   - **APPROVED_LINK**: Links workspace entity to existing master without changing master data
   - **REJECTED**: Queue item closed; no action
7. Queue item updated with `status`, `resolved_master_id`, `resolved_by_user_id`, `resolved_at`

## 4.7 Duplicate Detection and Merge Handling

**Current State:** Partial implementation.

- Org dedup: `normalized_name` computed via `normalizeOrgName()` (lowercased, punctuation-stripped); `website_domain` normalized via `normalizeDomain()`
- Contact dedup: Not implemented in workspace layer; email uniqueness not enforced within workspace
- On promotion to master DB: admin manually checks for matches; `master_organization_aliases` used for known variants
- **Automated merge UI:** Planned

## 4.8 Notes Handling

1. User adds note on contact detail, org detail, or opportunity detail screen
2. Note linked to up to three entities via `contact_id`, `organization_id`, `opportunity_id` (all optional/nullable)
3. Notes support plain text (markdown not enforced by backend)
4. Create, Read, Update, Delete all implemented
5. Notes appear in the "Notes" tab on each detail screen
6. Notes with significant intelligence content can be included in promotion queue (`entity_type = NOTE`, `change_type = NOTE_ADDED`)

## 4.9 Pain Point Capture → Suggestion → Approval

1. CMS data is loaded for an org (`organization_healthcare_profile`)
2. CMS signal engine analyzes CMS metrics:
   - `cms_ed_boarding_time_minutes` > threshold → generates `ED_BOARDING` pain point suggestion
   - `cms_ed_lwbs_percent` > threshold → generates `CARE_TRANSITION_RISK` suggestion
   - `cms_overall_star_rating` ≤ 2 → generates `PATIENT_EXPERIENCE` suggestion
   - etc.
3. Suggestion created as `organization_pain_points` with `verification_status = SUGGESTED`, `source_type = CMS_SIGNAL`; `is_active = false`
4. Idempotency check prevents duplicate suggestions for same `(org_id, category, linked_cms_signal_key, source_type)`
5. "Needs Review" dot shown on PainPointsCard for all workspace members
6. Workspace admin reviews: clicks Approve → `verification_status = VERIFIED`, `is_active = true`
7. Or Reject → `verification_status = REJECTED`
8. Verified pain points shown in "Verified" tab; used in opportunity scoring and intelligence summary

## 4.10 Competitor Tracking

1. Admin or workspace member adds competitor entry to an org
2. Fields: name, type, service line, incumbent status, strengths (array), weaknesses (array), displacement difficulty, contract status, share of wallet
3. `verification_status` defaults to `SUGGESTED`; workspace admin can verify
4. Links to pain points created via `competitor_pain_point_links` (relationship type: CAUSED_BY, EXACERBATED_BY, etc.)
5. When links change: `refreshPainPointsCausedCache()` re-aggregates `pain_points_caused` on competitor
6. Competitor accordion in mobile UI: collapsed shows name + type + incumbent badge; expanded shows strengths (green dot), weaknesses (red dot), linked pain points

## 4.11 Opportunity Creation and Pipeline Movement

1. User taps "Add Opportunity"
2. Required: title, pipeline, pipeline stage
3. Optional: organization, primary contact, value estimate, close date, description, service line
4. Opportunity created with `status = OPEN`
5. `stage_entered_at` set on creation and on each stage change
6. Pipeline Kanban board: opportunities displayed as cards in columns by stage
7. User drags card to new column → `pipeline_stage_id` updated; `stage_entered_at` reset
8. Status changes: WON, LOST, ON_HOLD set via status field update

**EMS-specific:**
- If `pipeline.category = 'EMS'`: EMS saved views strip shown; EMS Transport Profile card on opportunity detail
- EMS profile can be created/updated with service mix, transport data, payer mix, agreement info

## 4.12 Follow-up Task Generation

1. User manually creates task from contact detail, task list, or org detail
2. Fields: title (required), description, due date, priority, assignment, linked contact/org/opportunity
3. Tasks appear on global task list with status and due-date filters
4. Overdue detection: `due_date < now()` and `status = OPEN`
5. **Automated task generation:** Planned — no AI-generated tasks yet

## 4.13 Reporting and Rollups

1. `GET /api/reports` aggregates workspace data:
   - Contact count by status
   - Opportunity count and value by stage/status
   - Activity count by type
   - Task completion rate
2. Roll-up stats on org hierarchy: contacts, opportunities, pipeline value, won value across all child orgs (recursive)
3. `workspace_health_snapshots` captures point-in-time workspace metrics
4. **Advanced reporting dashboards:** Planned

## 4.14 Admin Review Flows

1. **Master Org AI Suggestions:** Admin views pending suggestions at `/admin/master-orgs/:id/suggestions`; approves/rejects each field
2. **Promotion Queue:** Admin reviews pending promotions at `/admin/master-promotion/queue`
3. **Onboarding Review:** Admin reviews AI recommendations per item in onboarding session
4. **Business Card Review:** Workspace admins/members review cards
5. **Pain Point Review:** Workspace admins approve/reject suggested pain points
6. **Structure Scan Review:** Workspace admins approve/reject hierarchy suggestions

## 4.15 Archive / Deactivate / Restore Behavior

| Entity | Behavior |
|---|---|
| Organizations | `is_active` not in schema; soft delete not implemented; hard delete cascades contacts/opps |
| Contacts | `status = INACTIVE` serves as soft deactivation |
| Pain Points | `is_active = false` for rejected/inactive; still exists in DB |
| Competitors | `is_active = false` for inactive |
| Onboarding Sessions | `archived_at` timestamp set; not deleted |
| Business Cards | Status changes to `REJECTED`; card record retained |

---

# 5. Per-Feature Specification

## Authentication

| Attribute | Detail |
|---|---|
| **Purpose** | Authenticate users, manage sessions |
| **Schema Entities** | `users`, `workspaces`, `workspace_members`, `subscriptions`, `plans` |
| **Workflows** | Self-service signup, login |
| **Role Permissions** | All roles: login/logout. OWNER implied on self-signup |
| **Status** | Complete (core); Planned (forgot password email, email verification) |
| **What's Built** | Login, signup, `/auth/me`, change-password |
| **Missing Logic** | Forgot-password email not sent; no email verification; no OAuth |
| **Missing UX** | No "verify your email" screen; forgot-password shows success but does nothing |

## Organization Management

| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **What's Built** | Full CRUD, hierarchy (parent/child), 11 saved views, tag system, roll-up stats, vertical-specific display labels |
| **Missing Logic** | No soft delete; duplicate detection within workspace not implemented |
| **Missing UX** | No bulk edit; no dedup merge UI |

## Contact Management

| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **What's Built** | Full CRUD, tags, org linking, stakeholder roles, relationship strength |
| **Missing Logic** | No duplicate detection; no email uniqueness enforcement within workspace |
| **Missing UX** | No contact merge UI |

## Business Card Scanner

| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **What's Built** | Upload, OCR (GPT-4o), review screen, approve/reject/merge, PHI warning |
| **Missing Logic** | No duplicate detection against existing contacts at approval time |
| **Missing UX** | No batch scan; no bulk review |

## Pipeline / Kanban

| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **What's Built** | Horizontal Kanban board, multiple pipelines, stage probability, EMS saved views |
| **Missing Logic** | Stage change automation (auto-tasks) not implemented |
| **Missing UX** | No pipeline analytics view |

## Opportunities

| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **What's Built** | Full CRUD, contacts many-to-many, EMS profile overlay, pipeline stage tracking |
| **Missing Logic** | No automated stage-based actions |
| **Missing UX** | No forecast/reporting view |

## Tasks

| Attribute | Detail |
|---|---|
| **Status** | Complete (list + CRUD); In Progress (detail/edit screen) |
| **What's Built** | Create, complete, filter by status/priority/due, link to contact/org/opp |
| **Missing Logic** | No AI task generation; no reminders/push notifications |
| **Missing UX** | No dedicated task edit screen; no task calendar view |

## Notes

| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **What's Built** | CRUD on contact/org/opp detail screens |
| **Missing Logic** | No rich text; no @mention; no note-to-task conversion |

## Admin-Led Onboarding

| Attribute | Detail |
|---|---|
| **Status** | Complete (provisioning); Planned (email handoff, client portal) |
| **What's Built** | Full 5-phase flow: intake → AI recommend → review → provision → launch |
| **Missing Logic** | `SEND_INVITE_EMAILS` step is a stub |
| **Missing UX** | No client-facing progress view; no admin re-provisioning UI |

## Master Database

| Attribute | Detail |
|---|---|
| **Status** | Complete (core); In Progress (AI suggestion workflows) |
| **What's Built** | Master orgs + contacts, promotion queue, AI suggestions, relationship graph, overlays |
| **Missing Logic** | No automated dedup; admin must manually match |
| **Missing UX** | No visual relationship graph; no org family tree view |

## Healthcare Intelligence

| Attribute | Detail |
|---|---|
| **Status** | Complete (schema + API + mobile cards) |
| **What's Built** | CMS profile, pain points (suggest/verify), competitor tracking, 7-dimension scoring, intelligence summary |
| **Missing Logic** | CMS data import pipeline not built (data entered manually or via API); no automated refresh |
| **Missing UX** | CMS data entry via admin portal not built |

## EMS Vertical

| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **What's Built** | EMS pipeline, opportunity profile (22 columns), organization profile, saved views, jurisdiction tracking |
| **Missing Logic** | No reporting specific to EMS transport metrics |

---

# 6. Permissions and Control Layers

## Tier 1: Platform Admin (`is_platform_admin = true`)

Enforced by `platformAdminMiddleware.ts` on all `/admin/*` routes.

| Capability | Details |
|---|---|
| Access master database | Full CRUD on `master_organizations`, `master_contacts`, overlays, aliases, relationships |
| Manage promotion queue | Approve/reject/merge all pending workspace promotions |
| Manage AI suggestions | Approve/reject field-level suggestions for master orgs |
| Run onboarding sessions | Full access to all client onboarding sessions |
| Manage pipeline templates | Create/edit/delete `pipeline_view_templates` |
| Manage onboarding presets | Create/edit/delete `onboarding_presets` |
| View all workspaces | List and inspect any workspace |
| Run org scans (admin) | Logo scan to create new master orgs |
| View platform stats | Dashboard metrics across all workspaces |
| Cannot access | Individual workspace CRM data directly (no bypass of workspace auth for standard routes) |

## Tier 2: Workspace Owner (`role = OWNER`)

| Capability | Details |
|---|---|
| All ADMIN capabilities | Full access |
| Cannot be demoted if last admin | System prevents removing last OWNER/ADMIN |
| Invite and remove members | Full team management |

## Tier 3: Workspace Admin (`role = ADMIN`)

Enforced by workspace role check in route handlers. In healthcare intelligence routes, checked via `isAdminCaller()`.

| Capability | Details |
|---|---|
| Approve/reject business cards | Yes |
| Approve/reject pain points | Yes (ADMIN or OWNER) |
| Approve/reject structure scans | Yes |
| Approve/reject competitors | Yes |
| Manage workspace pipeline views | Yes |
| Cannot | Manage plans, access master DB admin routes |

## Tier 4: Workspace Member (`role = MEMBER`)

| Capability | Details |
|---|---|
| Create/read/update organizations | Yes |
| Create/read/update contacts | Yes |
| Create/read/update opportunities | Yes |
| Create/read/update tasks, activities, notes | Yes |
| Upload and OCR business cards | Yes |
| View pain points (both tabs) | Yes — "Needs Review" dot visible to all |
| Approve/reject pain points | No — ADMIN/OWNER only |
| Access admin console | No |
| Invite members | No |

## Middleware Enforcement

| Middleware | Guards |
|---|---|
| `authMiddleware.ts` | Verifies JWT; injects `userId`, `workspaceId` on all `/api/*` routes |
| `platformAdminMiddleware.ts` | Verifies `is_platform_admin = true`; guards all `/admin/*` routes |
| `getCurrentWorkspace()` | Used in route handlers to validate workspace membership |
| `isAdminCaller()` | Used in healthcare intelligence routes to check OWNER/ADMIN role |

---

# 7. Master Database Intelligence Model

## What Data Can Flow from Workspace to Master DB

| Entity | Flow Path | Who Controls |
|---|---|---|
| Organizations | Enqueued by `enqueuePromotion()` after create/update | Platform admin resolves |
| Contacts | Enqueued by `enqueuePromotion()` after create/update | Platform admin resolves |
| Notes | Enqueued manually as `NOTE_ADDED` change type | Platform admin resolves |
| Business card data | Indirectly via contact creation | Goes through standard contact flow |
| Healthcare intelligence | Not promoted to master DB (workspace-scoped only) | N/A |

## What Auto-Suggests Only

| Data Type | How |
|---|---|
| Master org field enrichments | AI generates `master_org_ai_suggestions` with `PENDING` status |
| Pain points (healthcare) | CMS signals auto-create `SUGGESTED` pain points in workspace |
| Hierarchy suggestions | Structure scans create `PENDING_REVIEW` suggestions |

**Nothing is ever auto-applied to the master database.** All promotions and suggestion approvals require explicit human action.

## What Requires Approval

| Action | Who Approves |
|---|---|
| Workspace org → master org (new) | Platform admin |
| Workspace org → master org (merge) | Platform admin |
| Workspace org → link to existing master | Platform admin |
| Workspace contact → master contact | Platform admin |
| AI suggestion → apply to master org field | Platform admin |
| CMS pain point suggestion → verified | Workspace OWNER/ADMIN |
| Organization hierarchy suggestion → apply | Workspace OWNER/ADMIN |

## What Should Never Auto-Promote

- Personal data (PII) — contacts should always be manually reviewed
- Pain points — CMS signals are only evidence, not ground truth
- Hierarchy relationships — require evidence synthesis

## Validation Pipeline Rules

1. **Name Normalization:** `normalizeOrgName()` strips punctuation, lowercases, collapses whitespace
2. **Domain Normalization:** `normalizeDomain()` extracts root domain for dedup
3. **Confidence Scoring:** `master_organizations.confidence_score` reflects overall data quality (0–1)
4. **Validation Status Progression:** `UNVALIDATED` → `PARTIALLY_VALIDATED` → `VALIDATED` (manual admin action)
5. **AI Field Normalization:** `normalizeFieldValue()` maps AI-produced variations to valid enum values

## Provenance/Source Tracking

Every master record tracks:
- `source_type` — how it was created (`MANUAL`, `WORKSPACE_PROMOTED`, `ADMIN_SCAN`)
- `source_workspace_id` — which workspace contributed it
- `source_organization_id` — workspace entity ID
- `promoted_by_admin_user_id` — who approved it
- `promoted_at` — when

## Confidence Scoring

| Score | Meaning |
|---|---|
| 0.0–0.3 | Unvalidated, single source, sparse data |
| 0.3–0.6 | Partially validated, some corroboration |
| 0.6–0.9 | Validated, multiple sources |
| 0.9–1.0 | Fully validated, confirmed from authoritative source |

Completeness scoring (master org):

| Field | Weight | Critical |
|---|---|---|
| Canonical Name | 15 | Yes |
| Website Domain | 15 | Yes |
| Industry | 10 | Yes |
| Account Structure Type | 10 | Yes |
| Normalized Name | 5 | No |
| Validation Status (not UNVALIDATED) | 10 | No |
| + Healthcare/GovCon overlay fields | 5–10 each | Vertical-only |

Health Stages: `INCOMPLETE` (0–39%), `IDENTIFIED` (40–59%), `STRUCTURED` (60–79%), `STRATEGIC` (80–100%).

## Merge and Duplicate Governance

- **Before promotion:** Admin checks for existing master org by name similarity and domain
- **Alias table:** `master_organization_aliases` stores known variants; checked during dedup
- **Merge action:** Admin selects `APPROVED_MERGE`; data from workspace snapshot applied where master field is empty
- **No automated merge:** No fuzzy-match auto-merge; human decision required

---

# 8. UX Logic

## 8.1 Authentication Screens

| State | User Sees | Admin Sees | Behind Scenes |
|---|---|---|---|
| Login | Email + password form, "Remember me", "Forgot password" link | Same | JWT stored in SecureStore (native) or localStorage (web) |
| Signup | Name, email, password, workspace name fields | Same | User + workspace created; OWNER role assigned |
| Forgot Password | Email input → "If account exists, reset link sent" | Same | **Stub: no email sent** |
| Logged In | Dashboard with workspace data | Admin console accessible at `/admin/` | `/auth/me` fetched on app load |
| Token Expired | Redirected to login | Same | Token verification fails; token cleared |

## 8.2 Organization Detail Screen

| State | What User Sees | What Admin Sees | Behind Scenes |
|---|---|---|---|
| Normal | Org header, intel pulse, hierarchy, contacts, pipeline summary, healthcare cards (if vertical=healthcare) | Same + admin-only actions | Data fetched from multiple endpoints |
| No contacts | Empty state with "Add Contact" CTA | Same | `GET /organizations/:id` returns contacts: [] |
| No opportunities | Empty pipeline summary | Same | Opportunities list empty |
| Healthcare org | CMS Evidence Card, Pain Points Card (2 tabs), Competitor Landscape, Entry Strategy, Intelligence Pulse with Opp Score modal | Same + Approve/Reject pain points | Healthcare endpoints fetched conditionally |
| Stale CMS data | Amber warning on CMS card | Same | `cms_last_updated_at > 90 days` triggers warning |
| Needs Review (pain points) | Red dot on Pain Points tab header | Same | Any SUGGESTED items exist |

## 8.3 Business Card Review Screen

| State | What User Sees | Behind Scenes |
|---|---|---|
| Processing | Loading indicator | OCR in progress |
| Parsed | Extracted fields editable | `parsedJson` shown |
| PHI Warning | Yellow warning banner | If health-related data detected |
| Approved | Confirmation; contact created | `review_status = APPROVED` |
| Failed OCR | Error message; fields empty | `processing_status = FAILED` |

## 8.4 Pain Points Card

| State | What User Sees | What Admin/OWNER Sees |
|---|---|---|
| Verified tab | List of verified pain points with severity badges | Same + Approve/Reject buttons on Suggested tab |
| Suggested tab | List of suggested pain points with CMS trigger shown | Approve/Reject buttons per item |
| Empty (verified) | "No verified pain points" empty state | + CTA to review suggestions |
| Needs Review dot | Visible to ALL workspace members | Same |

## 8.5 Competitor Landscape Card

| State | What User Sees |
|---|---|
| Collapsed | Competitor name, type badge, incumbent badge, displacement pill |
| Expanded | Strengths (green dot), weaknesses (red dot), linked pain points count |
| Empty | "No competitors tracked" with admin CTA to add |

## 8.6 Admin Onboarding Screens

| Screen | State | User Sees |
|---|---|---|
| Intake | Normal | Form with client details |
| Recommend | Loading | "Analyzing client profile..." spinner |
| Review | Items pending | List of AI-suggested items with confidence badges |
| Review | Item approved | Green checkmark |
| Review | Item edited | Edit indicator; admin's value shown |
| Review | Session locked | "Lock & Provision" CTA enabled |
| Provision | Running | Step list with status icons (pending/in_progress/completed/failed) |
| Provision | Step failed | Red error; retry option |
| Launch | Done | Activation summary; "Open Priority Dashboard" CTA |

## 8.7 Master DB Admin Screens

| Screen | State | Admin Sees |
|---|---|---|
| Promotion Queue | Pending items | Entity snapshot, workspace name, change type |
| Promotion Queue | Resolved item | Status badge (Approved/Rejected/Merged) |
| AI Suggestions | Pending | Field name, current value, suggested value, rationale |
| AI Suggestions | Approved | Green checkmark; value written to master org |
| Completeness | Any org | Score bar, health stage, missing fields list, next best action |

---

# 9. Open Gaps / Risks / Needed Decisions

## Unresolved Logic Gaps

| Gap | Impact | Priority |
|---|---|---|
| `forgot-password` endpoint is a stub | Users cannot reset passwords; support blocker | HIGH |
| `SEND_INVITE_EMAILS` provisioning step is a stub | Invited team members have no way to know they have access | HIGH |
| No email delivery infrastructure | Password reset, invites, and welcome emails all blocked | HIGH |
| No invite acceptance flow for new users | Inviting unknown email does nothing useful | HIGH |
| No duplicate contact detection at business card approval | Duplicate contacts created silently | HIGH |
| Self-serve users have no industry/vertical selection | All workspaces default to "Healthcare & GovCon" regardless of user type | MEDIUM |
| `audit_logs` table exists but no API exposes it | Audit data not queryable or visible | MEDIUM |
| `opportunity_id` on tasks/notes/activities has no FK constraint | Referential integrity not enforced; can reference deleted opps | MEDIUM |
| Automated CMS data import pipeline not built | Healthcare intelligence CMS data must be manually entered via API | HIGH |
| No automated pain point refresh when CMS data updates | Old CMS data keeps old suggestions; no refresh trigger | MEDIUM |

## Unresolved UX Gaps

| Gap | Impact | Priority |
|---|---|---|
| No first-run wizard for self-serve users | Empty dashboard; no guidance | HIGH |
| No Day-1 onboarding checklist for self-serve users | Only admin-provisioned workspaces get a launch checklist | HIGH |
| No client-facing progress view during admin onboarding | Client has no visibility into setup status | MEDIUM |
| No automated handoff email when admin provisioning completes | Client has no credentials or welcome info | HIGH |
| No task edit/detail screen | Users can create and complete tasks but cannot edit details inline | MEDIUM |
| No pipeline analytics/forecast view | No revenue forecasting UI | MEDIUM |
| No duplicate merge UI | Admins cannot merge duplicate contacts or orgs in the UI | MEDIUM |
| No visual org relationship graph | Master org hierarchy not visualized | LOW |
| No push notifications or reminders | Users have no overdue task alerts | MEDIUM |

## Unresolved Schema Gaps

| Gap | Notes |
|---|---|
| `users.platform_role` not enforced | Field exists but no business logic uses it |
| `organizations.msa_status`, `expansion_strategy`, `expansion_maturity` not validated | Free text; no picklist enforcement |
| `tasks.opportunity_id` lacks FK | Loose reference; can go stale |
| Plan `features` field is jsonb but not validated | No schema for which feature keys are valid |
| `workspace_intelligence.kind` values not enumerated | Any string accepted; no type enforcement |

## Technical Risks

| Risk | Severity | Notes |
|---|---|---|
| No email delivery service | CRITICAL | Without email: password reset impossible, invites broken, no notifications |
| No dedup at scale | HIGH | As workspace data grows, duplicate org/contact records will accumulate |
| GCS dependency for all media | HIGH | Business cards, org scans — all depend on GCS availability |
| API TypeScript errors pre-existing | MEDIUM | esbuild ignores TS errors at runtime; type safety not enforced in API layer |
| JWT tokens long-lived with no refresh | MEDIUM | Tokens expire but there's no silent refresh; users get logged out unexpectedly |
| No rate limiting on AI endpoints | MEDIUM | AI suggestion generation has no rate limit; could incur unexpected cost |
| `as any` forbidden but TS types may drift | LOW | Codebase rule; requires ongoing enforcement |

## Recommended Next Build Priorities

| Priority | Feature | Rationale |
|---|---|---|
| 1 | Email delivery integration (e.g., Resend, SendGrid) | Unblocks: password reset, invites, welcome emails |
| 2 | Invite acceptance flow for new users | Unblocks: team onboarding from admin provisioning |
| 3 | Self-serve first-run wizard | Reduces churn from empty-state users |
| 4 | Duplicate contact detection at business card approval | Prevents data quality issues |
| 5 | CMS data import pipeline | Required for healthcare intelligence to be useful at scale |
| 6 | Vertical/industry selection at self-serve signup | Makes onboarding relevant to each user |
| 7 | Automated pain point refresh on CMS update | Keeps intelligence current |
| 8 | Task edit/detail screen | Completes task management feature |
| 9 | Pipeline analytics/forecast view | Sales leadership need |
| 10 | Push notifications for overdue tasks | User retention and engagement |

---

# 10. Appendices

## 10.1 Appendix A: Feature Inventory Matrix

| Feature | Description | Schema Entities | Workflow Coverage | Role Coverage | Status | Missing Logic | Missing UX | Priority |
|---|---|---|---|---|---|---|---|---|
| User Login | JWT-based login with remember-me | users, workspaces, workspace_members, subscriptions | Login flow | All | Complete | — | — | — |
| User Signup (Self-Service) | Creates user + workspace + OWNER membership | users, workspaces, workspace_members, subscriptions, plans | Self-service signup | None (pre-auth) | Complete | No email verification; no vertical selection; no first-run wizard | No guided onboarding | HIGH |
| Forgot Password | Password reset request | users | — | All | Planned | No email sent (stub only) | Shows success incorrectly | HIGH |
| Change Password | Authenticated password change | users | — | All | Complete | — | — | — |
| Admin Login | Platform admin authentication | users | — | Platform Admin only | Complete | — | — | — |
| Organization CRUD | Create/read/update/delete workspace orgs | organizations, organization_tags, tags | Org creation, updates | All (create/update); OWNER/ADMIN (delete implied) | Complete | No soft delete; no dedup | No bulk edit; no merge UI | MEDIUM |
| Org Hierarchy | Parent/child/ultimate-parent relationships | organizations | Org creation, hierarchy scan | All | Complete | Cycle detection; propagation implemented | — | — |
| Org Saved Views | 11 pre-built filter views | organizations | — | All | Complete | — | — | — |
| Contact CRUD | Create/read/update/delete workspace contacts | contacts, contact_tags, tags | Contact creation, BC approval | All | Complete | No dedup | No merge UI | MEDIUM |
| Contact Relationship Fields | Stakeholder role, influence, strength | contacts | — | All | Complete | — | — | — |
| Business Card Scanner | Camera/gallery → OCR → review → contact | business_cards, contacts, organizations, activities | Business card flow | All (scan/review); ADMIN (approve) | Complete | No dedup at approval | No batch scan | HIGH |
| Org Logo Scan | Photo → Google Places match → org enrichment | organization_scans, organizations | Logo scan flow | All | Complete | — | — | LOW |
| Org Structure Scan | AI hierarchy inference for workspace orgs | organization_structure_scans, organizations | Structure scan flow | All (initiate); OWNER/ADMIN (approve) | Complete | — | — | LOW |
| Pipeline (Kanban) | Horizontal board grouped by stage | pipelines, pipeline_stages, opportunities | Opp creation, stage movement | All | Complete | No stage automation | No analytics | MEDIUM |
| Multiple Pipelines | Per-workspace pipeline tabs | pipelines | — | All | Complete | — | — | — |
| EMS Pipeline | EMS-specific 8-stage pipeline | pipelines, opportunity_ems_interfacility_profiles | EMS-specific flow | All | Complete | — | — | — |
| Opportunity CRUD | Create/read/update/delete opportunities | opportunities, opportunity_contacts | Opp creation, pipeline movement | All | Complete | — | No forecast view | MEDIUM |
| EMS Opportunity Profile | 22-column EMS transport profile | opportunity_ems_interfacility_profiles | — | All | Complete | — | — | LOW |
| Tasks | Create/complete/filter tasks | tasks | Follow-up task flow | All | Complete (list); In Progress (edit) | No AI generation; no reminders | No edit screen; no calendar | HIGH |
| Activities | Activity feed CRUD | activities | — | All | Complete | — | — | — |
| Notes | Note CRUD on any entity | notes | Notes flow | All | Complete | No rich text | — | LOW |
| Tags | Workspace-scoped tags on contacts and orgs | tags, contact_tags, organization_tags | — | All | Complete | — | — | — |
| Account Intelligence Pulse | Rules-based org health + relationship score | (computed from multiple tables) | — | All | Complete | No AI; no trend history | — | MEDIUM |
| Admin-Led Onboarding | 5-phase AI-assisted workspace provisioning | client_onboarding_sessions, onboarding_review_items, onboarding_provisioning_steps, workspace_* | Admin onboarding flow | Platform Admin | Complete (core); Planned (email handoff) | Email not sent; no client portal | No re-provisioning UI | HIGH |
| Onboarding Presets | Saved onboarding templates | onboarding_presets | — | Platform Admin | Complete | — | — | LOW |
| Master Org DB | Canonical org reference database | master_organizations, master_org_*, master_organization_aliases, master_organization_relationships | Master DB sync | Platform Admin | Complete | No automated dedup | No graph view | HIGH |
| Master Promotion Queue | Workspace → master DB review | master_promotion_queue | Promotion workflow | Platform Admin | Complete | Admin must manually match | — | HIGH |
| Master Org AI Suggestions | AI-generated field enrichments | master_org_ai_suggestions | AI suggestion flow | Platform Admin | Complete | No rate limiting | — | MEDIUM |
| Master Contact DB | Canonical contact records | master_contacts | Promotion workflow | Platform Admin | Complete | — | — | MEDIUM |
| Healthcare Intelligence — CMS | CMS data on healthcare orgs | organization_healthcare_profile | Healthcare intel flow | All (view); OWNER/ADMIN (approve pain points) | Complete (schema + API + UI) | No import pipeline; no auto-refresh | No CMS data entry admin UI | HIGH |
| Healthcare Intelligence — Pain Points | Suggested/verified pain points from CMS | organization_pain_points | Pain point flow | All (view); OWNER/ADMIN (approve) | Complete | No auto-refresh on CMS update | — | HIGH |
| Healthcare Intelligence — Competitors | Competitor tracking with pain point links | organization_competitors, competitor_pain_point_links | Competitor tracking flow | All (view); OWNER/ADMIN (verify) | Complete | — | — | MEDIUM |
| Healthcare Intelligence — Opp Score | 7-dimension opportunity scoring | organization_healthcare_profile, organization_pain_points, organization_competitors | — | All | Complete | — | — | LOW |
| Healthcare Intelligence — Summary | Cached intelligence summary on org | organizations.organization_intelligence_summary | — | All | Complete | Manual trigger only | — | MEDIUM |
| Team Management / Invites | Invite/remove workspace members | workspace_members, workspace_admin_audit_log | Invite flow | OWNER/ADMIN | Complete (add existing users); Planned (invite new users) | No email for new-user invites | No invite acceptance for new users | HIGH |
| Plan Management | Workspace subscription plans | plans, subscriptions | Signup | OWNER | Complete (data model); Planned (billing UI) | No payment integration | No upgrade/downgrade UI | HIGH |
| Reports | Workspace analytics aggregates | (computed) | Reporting flow | All | In Progress | No advanced analytics | No charts/dashboards | MEDIUM |
| Workspace Health Snapshots | Point-in-time workspace health records | workspace_health_snapshots | Onboarding provisioning | Platform Admin | Complete | Not exposed to clients | No client-facing health dashboard | MEDIUM |
| Audit Log | Entity-level change history | audit_logs, workspace_admin_audit_log | — | Platform Admin (admin log); All (generates) | In Progress | Audit log not exposed via API | No audit trail UI | LOW |
| Public Landing Page | Marketing + pricing page | — | — | — | Complete | — | — | — |

---

## 10.2 Appendix B: Complete API Route Catalog

All routes use base path `/api` (Express API, port 8080). Auth requirements:
- **Public**: No JWT required
- **Workspace Auth**: JWT required (`authMiddleware`); workspace membership verified in handler
- **Platform Admin**: JWT + `is_platform_admin = true` (`platformAdminMiddleware`)

---

### 10.2.1 Authentication Routes (`/api/auth`)

Auth middleware: None (public)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/auth/login` | Public | `{ email, password }` | `{ token, user }` | Normalize email; verify bcrypt hash; issue JWT |
| `POST` | `/api/auth/signup` | Public | `{ firstName, lastName, email, password, workspaceName }` | `{ token, user }` | Create user + workspace + OWNER membership + "independent" plan |
| `GET` | `/api/auth/me` | Workspace Auth | — | `{ user, workspace, role }` | Token must be valid; returns decoded claims + workspace info |
| `POST` | `/api/auth/change-password` | Workspace Auth | `{ currentPassword, newPassword }` | `{ success }` | Verifies current password before update |
| `POST` | `/api/auth/forgot-password` | Public | `{ email }` | `{ message }` | **STUB** — returns success; no email sent |

---

### 10.2.2 Admin Auth Routes (`/api/admin`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/admin/login` | Public | `{ email, password }` | `{ token, user }` | Requires `is_platform_admin = true`; returns error if not admin |
| `GET` | `/api/admin/me` | Platform Admin | — | `{ user }` | Returns admin user profile |

---

### 10.2.3 Contact Routes (`/api/contacts`)

| Method | Path | Auth | Query Params | Request Body | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/contacts` | Workspace Auth | `search`, `status`, `organizationId`, `tagIds`, `savedView`, `limit`, `offset` | — | `{ contacts[], total }` | Filtered list with tag + org join |
| `POST` | `/api/contacts` | Workspace Auth | — | `{ fullName, firstName, lastName, title, department, email, phone, mobile, linkedinUrl, organizationId, status, stakeholderRole, influenceLevel, relationshipStrength, roleNotes, tagIds }` | Contact | Creates contact; enqueues promotion |
| `GET` | `/api/contacts/:id` | Workspace Auth | — | — | Contact with tags, org, activities | |
| `PUT` | `/api/contacts/:id` | Workspace Auth | — | Same as POST body | Updated contact | |
| `PATCH` | `/api/contacts/:id` | Workspace Auth | — | Partial contact fields | Updated contact | Partial update |
| `DELETE` | `/api/contacts/:id` | Workspace Auth | — | — | `{ success }` | Hard delete; cascades tags |
| `POST` | `/api/contacts/bulk/tasks` | Workspace Auth | — | `{ contactIds[], task: { title, dueDate, priority } }` | `{ created }` | Bulk create task for multiple contacts |
| `POST` | `/api/contacts/bulk/tags` | Workspace Auth | — | `{ contactIds[], tagIds[] }` | `{ updated }` | Bulk apply tags |

---

### 10.2.4 Organization Routes (`/api/organizations`)

| Method | Path | Auth | Query Params | Request Body | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/organizations` | Workspace Auth | `search`, `vertical`, `accountStructureType`, `parentId`, `savedView`, `limit`, `offset` | — | `{ organizations[], total }` | With rollup stats |
| `POST` | `/api/organizations` | Workspace Auth | — | `{ name, organizationType, vertical, accountStructureType, parentOrganizationId, website, phone, city, state, tagIds, ... }` | Organization | Cycle check if parent set; enqueues promotion |
| `GET` | `/api/organizations/:id` | Workspace Auth | — | — | Org + children + contacts + pipeline summary | |
| `PUT` | `/api/organizations/:id` | Workspace Auth | — | Full org body | Updated org | Recomputes hierarchy if parent changes |
| `POST` | `/api/organizations/:id/link-child` | Workspace Auth | — | `{ childOrganizationId }` | `{ success }` | Sets parent; cycle check; propagates ultimate parent |
| `POST` | `/api/organizations/:id/unlink-child` | Workspace Auth | — | `{ childOrganizationId }` | `{ success }` | Clears parent ref on child |
| `DELETE` | `/api/organizations/:id` | Workspace Auth | — | — | `{ success }` | Hard delete; cascades contacts/opps |
| `GET` | `/api/organizations/:id/intelligence` | Workspace Auth | — | — | `OrgIntelligenceResult` | Rules-based health/risk/gaps/action computation |

---

### 10.2.5 Healthcare Intelligence Routes (`/api/organizations/:id/`)

Mounted at `/api/organizations/:id`. Auth: Workspace Auth. Write operations check OWNER/ADMIN role.

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| `GET` | `/healthcare-profile` | Workspace Auth | — | `OrganizationHealthcareProfile` | CMS data for org |
| `POST` | `/healthcare-profile` | Workspace Auth | Full CMS profile fields | Profile | Creates/updates CMS profile |
| `POST` | `/healthcare-profile/run-suggestions` | ADMIN | — | `{ created }` | Analyzes CMS data; creates SUGGESTED pain points (idempotent) |
| `GET` | `/pain-points` | Workspace Auth | — | `{ verified[], suggested[] }` | Split by verification_status |
| `POST` | `/pain-points` | Workspace Auth | `{ painPointCategory, severity, frequency, sourceType, painPointStatement, linkedCmsSignalKey, evidenceType, confidenceScore }` | Pain point | Creates with SUGGESTED status |
| `PATCH` | `/pain-points/:ppId` | ADMIN | Partial pain point fields | Updated pain point | |
| `POST` | `/pain-points/:ppId/approve` | ADMIN | — | Updated pain point | Sets status = VERIFIED, is_active = true |
| `POST` | `/pain-points/:ppId/reject` | ADMIN | — | Updated pain point | Sets status = REJECTED |
| `GET` | `/competitors` | Workspace Auth | — | `competitor[]` | All competitors for org |
| `POST` | `/competitors` | Workspace Auth | `{ competitorName, competitorType, serviceLine, incumbentStatus, strengths[], weaknesses[], displacementDifficulty, contractStatus, shareOfWalletEstimate }` | Competitor | |
| `PATCH` | `/competitors/:cId` | ADMIN | Partial competitor fields | Updated competitor | |
| `GET` | `/competitors/:cId/pain-point-links` | Workspace Auth | — | `link[]` | Links with pain point details |
| `POST` | `/competitors/:cId/pain-point-links` | ADMIN | `{ organizationPainPointId, relationshipType, confidenceScore, notes }` | Link | Also calls `refreshPainPointsCausedCache()` |
| `DELETE` | `/competitors/:cId/pain-point-links/:linkId` | ADMIN | — | `{ success }` | Also calls `refreshPainPointsCausedCache()` |
| `GET` | `/opportunity-score` | Workspace Auth | — | `{ dimensions[], overallScore, colorBand }` | 7-dimension scoring |
| `POST` | `/compute-intelligence-summary` | Workspace Auth | — | `{ summary }` | Recomputes and caches intelligence summary |
| `GET` | `/intelligence-summary` | Workspace Auth | — | `{ summary }` | Returns cached summary from `organization_intelligence_summary` |

---

### 10.2.6 Business Card Routes (`/api/business-cards`)

| Method | Path | Auth | Input | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/business-cards/upload` | Workspace Auth | `multipart/form-data` with `image` file | Card | Upload to GCS; trigger OCR |
| `GET` | `/api/business-cards` | Workspace Auth | `?reviewStatus=PENDING_REVIEW` | `card[]` | List with optional review status filter |
| `POST` | `/api/business-cards` | Workspace Auth | `{ imageUrlFront, imageUrlBack }` | Card | Create record manually (internal use) |
| `GET` | `/api/business-cards/:id` | Workspace Auth | — | Card | Full card with parsed JSON |
| `PUT` | `/api/business-cards/:id` | Workspace Auth | Partial card fields | Updated card | |
| `POST` | `/api/business-cards/:id/parse` | Workspace Auth | — | Card | Trigger/retry OCR parsing |
| `POST` | `/api/business-cards/:id/approve` | Workspace Auth | `{ contactData, organizationName }` | `{ contact, organization, card }` | Creates contact; optionally creates org; sets APPROVED |
| `POST` | `/api/business-cards/:id/reject` | Workspace Auth | — | Card | Sets review_status = REJECTED |

---

### 10.2.7 Organization Scan Routes (`/api/organization-scans`)

| Method | Path | Auth | Input | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/upload` | Workspace Auth | `multipart/form-data` with `image` | Scan | Upload to GCS |
| `GET` | `/` | Workspace Auth | `?organizationId` | `scan[]` | |
| `GET` | `/:id` | Workspace Auth | — | Scan | |
| `POST` | `/:id/parse` | Workspace Auth | — | Scan | Extract text from image |
| `POST` | `/:id/match` | Workspace Auth | — | Scan with `matched_place_json` | Search Google Places |
| `POST` | `/:id/approve` | Workspace Auth | `{ selectedMatchJson, organizationId? }` | `{ organization, scan }` | Enriches org with place data; sets APPROVED |
| `POST` | `/:id/reject` | Workspace Auth | — | Scan | Sets REJECTED |

---

### 10.2.8 Structure Scan Routes (`/api/structure-scans`)

| Method | Path | Auth | Input | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/` | Workspace Auth | `{ organizationId }` | Scan | Creates scan record; status = PENDING |
| `GET` | `/` | Workspace Auth | `?organizationId` | `scan[]` | |
| `GET` | `/:id` | Workspace Auth | — | Scan | |
| `POST` | `/:id/run` | Workspace Auth | — | Scan | Executes full pipeline (master match → external search → LLM review) |
| `POST` | `/:id/approve` | ADMIN | — | `{ scan, organization }` | Applies suggested hierarchy to org; optionally writes to master graph |
| `POST` | `/:id/reject` | ADMIN | — | Scan | Sets review_status = REJECTED; logs activity |

---

### 10.2.9 Task Routes (`/api/tasks`)

| Method | Path | Auth | Query | Body | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/tasks` | Workspace Auth | `status`, `priority`, `contactId`, `organizationId`, `assignedToUserId`, `overdueOnly` | — | `task[]` | |
| `POST` | `/api/tasks` | Workspace Auth | — | `{ title, description, dueDate, priority, status, contactId, organizationId, opportunityId, assignedToUserId }` | Task | |
| `GET` | `/api/tasks/:id` | Workspace Auth | — | — | Task with contact + org | |
| `PUT` | `/api/tasks/:id` | Workspace Auth | — | Full task body | Updated task | |
| `DELETE` | `/api/tasks/:id` | Workspace Auth | — | — | `{ success }` | |

---

### 10.2.10 Activity Routes (`/api/activities`)

| Method | Path | Auth | Query | Body | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/activities` | Workspace Auth | `contactId`, `organizationId`, `opportunityId`, `type`, `limit`, `offset` | — | `activity[]` | |
| `POST` | `/api/activities` | Workspace Auth | — | `{ type, subject, description, occurredAt, contactId, organizationId, opportunityId }` | Activity | |
| `PUT` | `/api/activities/:id` | Workspace Auth | — | Partial activity | Updated | |
| `DELETE` | `/api/activities/:id` | Workspace Auth | — | — | `{ success }` | |

---

### 10.2.11 Note Routes (`/api/notes`)

| Method | Path | Auth | Body | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/notes` | Workspace Auth | `{ content, contactId?, organizationId?, opportunityId? }` | Note | |
| `PUT` | `/api/notes/:id` | Workspace Auth | `{ content }` | Updated note | |
| `DELETE` | `/api/notes/:id` | Workspace Auth | — | `{ success }` | |

---

### 10.2.12 Pipeline Routes (`/api/pipelines`)

| Method | Path | Auth | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/pipelines` | Workspace Auth | `{ pipelines[] }` with stages | Returns all workspace pipelines with their stages |

---

### 10.2.13 Opportunity Routes (`/api/opportunities`)

| Method | Path | Auth | Query | Body | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/opportunities` | Workspace Auth | `pipelineId`, `pipelineStageId`, `organizationId`, `status`, `emsView`, `search` | — | `opportunity[]` | `emsView` enum enables EMS-specific filters |
| `POST` | `/api/opportunities` | Workspace Auth | — | `{ title, pipelineId, pipelineStageId, organizationId, primaryContactId, valueEstimate, closeDateEstimate, vertical, description, serviceLineId }` | Opportunity | Sets `stage_entered_at = now()` |
| `GET` | `/api/opportunities/:id` | Workspace Auth | — | — | Opportunity + contacts + pipeline + emsProfile | |
| `PUT` | `/api/opportunities/:id` | Workspace Auth | — | Full opp body | Updated opportunity | Resets `stage_entered_at` on stage change |
| `DELETE` | `/api/opportunities/:id` | Workspace Auth | — | — | `{ success }` | |

---

### 10.2.14 EMS Profile Routes (`/api/ems/*`)

| Method | Path | Auth | Body | Response | Notes |
|---|---|---|---|---|---|
| `GET` | `/api/ems/opportunities/:id/ems-profile` | Workspace Auth | — | EMS profile | |
| `POST` | `/api/ems/opportunities/:id/ems-profile` | Workspace Auth | All EMS profile fields | Created profile | Creates if doesn't exist |
| `PUT` | `/api/ems/opportunities/:id/ems-profile` | Workspace Auth | Partial profile fields | Updated profile | |
| `GET` | `/api/ems/organizations/:id/ems-profile` | Workspace Auth | — | Org EMS profile | |
| `PUT` | `/api/ems/organizations/:id/ems-profile` | Workspace Auth | Partial org EMS fields | Updated profile | Upsert |

---

### 10.2.15 Tag Routes (`/api/tags`)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| `GET` | `/api/tags` | Workspace Auth | — | `tag[]` |
| `POST` | `/api/tags` | Workspace Auth | `{ name, color, category }` | Tag |

---

### 10.2.16 Report Routes (`/api/reports`)

| Method | Path | Auth | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/reports/dashboard` | Workspace Auth | `{ contacts, opportunities, activities, tasks }` aggregate counts | |
| `GET` | `/api/reports/activities` | Workspace Auth | Activity breakdown by type | |

---

### 10.2.17 Workspace Member Routes (`/api/workspaces`)

| Method | Path | Auth | Body | Response | Notes |
|---|---|---|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/members` | Workspace Auth | — | `member[]` with user info | |
| `POST` | `/api/workspaces/:workspaceId/invites` | OWNER/ADMIN | `{ email, role }` | `{ success }` | Adds existing user to workspace; **no email for new users** |
| `DELETE` | `/api/workspaces/:workspaceId/members/:userId` | OWNER/ADMIN | — | `{ success }` | Cannot remove last OWNER |
| `PUT` | `/api/workspaces/:workspaceId/members/:userId` | OWNER/ADMIN | `{ role }` | Updated member | |
| `GET` | `/api/workspaces/:workspaceId/audit-log` | OWNER/ADMIN | — | `auditLogEntry[]` | Workspace admin audit log |

---

### 10.2.18 Workspace Pipeline View Routes

| Method | Path | Auth | Body | Response | Notes |
|---|---|---|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/pipeline-views` | Workspace Auth | — | `view[]` | Views with template info |
| `PUT` | `/api/workspaces/:workspaceId/pipeline-views/:id` | OWNER/ADMIN | `{ isEnabled, isDefault, sortOrder, settingsJson }` | Updated view | |

---

### 10.2.19 Admin — Workspace Management Routes (`/api/admin/workspaces`)

| Method | Path | Auth | Body | Response | Notes |
|---|---|---|---|---|---|
| `GET` | `/api/admin/workspaces` | Platform Admin | — | `workspace[]` | All workspaces |
| `GET` | `/api/admin/workspaces/:workspaceId` | Platform Admin | — | Workspace details | |
| `GET` | `/api/admin/workspaces/:workspaceId/pipeline-views` | Platform Admin | — | `view[]` | |
| `PUT` | `/api/admin/workspaces/:workspaceId/pipeline-views/:viewId` | Platform Admin | View fields | Updated view | |
| `PUT` | `/api/admin/workspaces/:workspaceId/pipeline-views/reorder` | Platform Admin | `{ orderedIds[] }` | `{ success }` | |
| `GET` | `/api/admin/workspaces/:workspaceId/members` | Platform Admin | — | `member[]` | |
| `DELETE` | `/api/admin/workspaces/:workspaceId/members/:userId` | Platform Admin | — | `{ success }` | |
| `PUT` | `/api/admin/workspaces/:workspaceId/members/:memberId/role` | Platform Admin | `{ role }` | Updated member | |
| `GET` | `/api/admin/workspaces/:workspaceId/health` | Platform Admin | — | `WorkspaceHealthSnapshot` | Latest snapshot |
| `POST` | `/api/admin/workspaces/:workspaceId/health/snapshot` | Platform Admin | — | Snapshot | Creates new snapshot |
| `GET` | `/api/admin/workspaces/:workspaceId/checklist` | Platform Admin | — | `checklistItem[]` | |
| `PATCH` | `/api/admin/workspaces/:workspaceId/checklist/:key` | Platform Admin | `{ status }` | Updated item | |
| `GET` | `/api/admin/workspaces/:workspaceId/audit-log` | Platform Admin | — | `auditEntry[]` | |
| `POST` | `/api/admin/workspaces/:workspaceId/day1-init` | Platform Admin | `{ config }` | `{ success }` | Day-1 workspace initialization |
| `GET` | `/api/admin/workspaces/:workspaceId/day1-summary` | Platform Admin | — | Summary | |

---

### 10.2.20 Admin — Master Organization Routes (`/api/admin/master-organizations`)

| Method | Path | Auth | Query | Body | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/` | Platform Admin | `search`, `industry`, `validationStatus`, `limit`, `offset` | — | `masterOrg[]` | |
| `POST` | `/` | Platform Admin | — | Master org fields | Created org | |
| `GET` | `/suggest-link` | Platform Admin | `?name`, `?domain` | — | `masterOrg[]` | Fuzzy-match suggestions for linking |
| `GET` | `/completeness-audit` | Platform Admin | — | — | Orgs sorted by completeness ascending | |
| `GET` | `/:id` | Platform Admin | — | — | Master org + overlays + aliases | |
| `PUT` | `/:id` | Platform Admin | — | Updated org fields | Updated master org | |
| `DELETE` | `/:id` | Platform Admin | — | — | `{ success }` | Hard delete |
| `PATCH` | `/:id/validation-status` | Platform Admin | — | `{ validationStatus }` | Updated org | |
| `POST` | `/:id/structure-scan` | Platform Admin | — | — | Scan | Initiates master org structure scan |
| `GET` | `/:id/aliases` | Platform Admin | — | — | `alias[]` | |
| `POST` | `/:id/aliases` | Platform Admin | — | `{ aliasName, aliasType }` | Alias | |
| `DELETE` | `/:id/aliases/:aliasId` | Platform Admin | — | — | `{ success }` | |
| `GET` | `/:id/healthcare-overlay` | Platform Admin | — | — | Healthcare overlay | |
| `PUT` | `/:id/healthcare-overlay` | Platform Admin | — | Healthcare overlay fields | Upserted overlay | |
| `GET` | `/:id/govcon-overlay` | Platform Admin | — | — | GovCon overlay | |
| `PUT` | `/:id/govcon-overlay` | Platform Admin | — | GovCon overlay fields | Upserted overlay | |
| `GET` | `/:id/siblings` | Platform Admin | — | — | `masterOrg[]` | Orgs sharing same parent |
| `GET` | `/:id/ultimate-parent` | Platform Admin | — | — | Master org | |
| `GET` | `/:id/relationships` | Platform Admin | — | — | `relationship[]` | Parent + child relationships |
| `POST` | `/:id/relationships` | Platform Admin | — | `{ childMasterOrganizationId, relationshipType, confidenceScore, evidenceSummary }` | Relationship | Creates parent-child link |

---

### 10.2.21 Admin — Master Organization Relationships (`/api/admin/master-organization-relationships`)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| `PUT` | `/:id` | Platform Admin | `{ relationshipType, confidenceScore, evidenceSummary, reviewStatus }` | Updated relationship |
| `DELETE` | `/:id` | Platform Admin | — | `{ success }` |

---

### 10.2.22 Admin — Master Promotion Queue (`/api/admin/master-promotion`)

| Method | Path | Auth | Query | Body | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/queue/counts` | Platform Admin | — | — | `{ pending, approved, rejected }` | Summary counts |
| `GET` | `/queue` | Platform Admin | `status`, `entityType`, `limit`, `offset` | — | `queueItem[]` | |
| `GET` | `/suggest-match` | Platform Admin | `?entityType`, `?name`, `?domain` | — | `masterOrg[] or masterContact[]` | Dedup suggestions |
| `POST` | `/:queueId/approve-new` | Platform Admin | — | `{ masterData }` | `{ masterRecord, queueItem }` | Create new master record |
| `POST` | `/:queueId/approve-merge` | Platform Admin | — | `{ targetMasterId }` | `{ masterRecord, queueItem }` | Merge into existing |
| `POST` | `/:queueId/approve-link` | Platform Admin | — | `{ targetMasterId }` | `{ queueItem }` | Link workspace entity to master |
| `POST` | `/:queueId/reject` | Platform Admin | — | `{ rejectionReason }` | `{ queueItem }` | |

---

### 10.2.23 Admin — AI Suggestions (`/api/admin/ai-suggestions`)

| Method | Path | Auth | Response | Notes |
|---|---|---|---|---|
| `GET` | `/` | Platform Admin | `suggestion[]` | All PENDING suggestions across all master orgs |
| `POST` | `/:orgId/generate` | Platform Admin | `{ generated }` | Triggers AI field enrichment suggestions for a master org |
| `POST` | `/:id/approve` | Platform Admin | Updated suggestion | Applies field value to master org; marks APPROVED |
| `POST` | `/:id/reject` | Platform Admin | Updated suggestion | Marks REJECTED; no field change |

---

### 10.2.24 Admin — Master Org Scans (`/api/admin/master-org-scans`)

| Method | Path | Auth | Input | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/upload` | Platform Admin | `multipart/form-data` with `image` | Scan | Upload logo to GCS |
| `GET` | `/` | Platform Admin | — | `scan[]` | |
| `GET` | `/:id` | Platform Admin | — | Scan | |
| `POST` | `/:id/parse` | Platform Admin | — | Scan | Run OCR on image |
| `POST` | `/:id/match` | Platform Admin | — | Scan | Google Places search |
| `POST` | `/:id/approve` | Platform Admin | `{ selectedMatchJson }` | `{ masterOrg, scan }` | Creates/links master org from scan |
| `POST` | `/:id/reject` | Platform Admin | — | Scan | Sets REJECTED |

---

### 10.2.25 Admin — Diagnostics (`/api/admin/diagnostics`)

All routes: Platform Admin auth. All read-only.

| Method | Path | Response | Notes |
|---|---|---|---|
| `GET` | `/summary` | Overall master DB health metrics | |
| `GET` | `/duplicates` | Potential duplicate master orgs by name/domain | |
| `GET` | `/structure-coverage` | % of master orgs with parent hierarchy | |
| `GET` | `/relationship-integrity` | Broken or orphaned relationship records | |
| `GET` | `/confidence-review` | Orgs below confidence threshold | |
| `GET` | `/domain` | Domain coverage and gaps | |
| `GET` | `/workspace-coverage` | Which workspaces have no master org links | |
| `GET` | `/unlinked-orgs` | Workspace orgs with no `master_organization_id` | |

---

### 10.2.26 Admin — Pipeline Templates (`/api/admin/pipeline-templates`)

| Method | Path | Auth | Body | Response | Notes |
|---|---|---|---|---|---|
| `GET` | `/` | Platform Admin | — | `template[]` | |
| `POST` | `/` | Platform Admin | `{ key, name, vertical, subVertical, status, isLocked, isClientEditable, configJson }` | Template | |
| `GET` | `/:id` | Platform Admin | — | Template | |
| `PUT` | `/:id` | Platform Admin | Template fields | Updated | |
| `DELETE` | `/:id` | Platform Admin | — | `{ success }` | |
| `POST` | `/:id/publish` | Platform Admin | — | Updated template | Sets status = active |

---

### 10.2.27 Admin — Onboarding (`/api/admin/onboarding`)

| Method | Path | Auth | Body | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/sessions` | Platform Admin | `{ clientType, intakePayload, createdFromPresetId }` | Session | Creates session in DRAFT |
| `GET` | `/sessions` | Platform Admin | — | `session[]` | |
| `GET` | `/sessions/:id` | Platform Admin | — | Session with review items + steps | |
| `PATCH` | `/sessions/:id/archive` | Platform Admin | — | Session | Sets archived_at |
| `DELETE` | `/sessions/:id` | Platform Admin | — | `{ success }` | |
| `PATCH` | `/sessions/:id/intake` | Platform Admin | `{ intakePayload }` | Session | Update intake fields |
| `POST` | `/sessions/:id/recommend` | Platform Admin | — | Session | Triggers AI recommendation; creates review items; → REVIEW |
| `PATCH` | `/sessions/:id/decisions` | Platform Admin | `{ decisions: { [itemKey]: { status, finalValue } } }` | Session | Batch update admin decisions on review items |
| `POST` | `/sessions/:id/lock` | Platform Admin | — | `{ session, appliedConfig }` | Validates all required items resolved; → LOCKED |
| `POST` | `/sessions/:id/provision` | Platform Admin | — | Session | Runs all 16 provisioning steps; → PROVISIONING → PROVISIONED |
| `POST` | `/sessions/:id/retry` | Platform Admin | `{ retryFailedOnly? }` | Session | Retries failed steps |
| `GET` | `/sessions/:id/audit` | Platform Admin | — | Audit entries for session | |
| `GET` | `/sessions/:id/provision-preview` | Platform Admin | — | Preview of what will be provisioned | |
| `POST` | `/sessions/:id/rebuild-items` | Platform Admin | — | `{ items[] }` | Rebuilds review items from current normalized_recommendation |
| `GET` | `/sessions/:id/progress` | Platform Admin | — | `{ steps[], completedCount, failedCount }` | |
| `GET` | `/config/verticals` | Platform Admin | — | `vertical[]` | |
| `GET` | `/config/sub-verticals` | Platform Admin | — | `subVertical[]` | |
| `GET` | `/config/service-lines` | Platform Admin | — | `serviceLine[]` | |
| `GET` | `/config/pipeline-templates` | Platform Admin | — | `template[]` | Active only |
| `GET` | `/config/add-on-types` | Platform Admin | — | `addOnType[]` | |

---

### 10.2.28 Admin — Onboarding Presets (`/api/admin/onboarding/presets`)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| `GET` | `/` | Platform Admin | — | `preset[]` |
| `GET` | `/:id` | Platform Admin | — | Preset |
| `POST` | `/` | Platform Admin | `{ name, verticalId, subVerticalId, isPublic, presetPayload }` | Preset |
| `POST` | `/:id/apply` | Platform Admin | `{ sessionId }` | Updated session | Applies preset config to onboarding session |

---

### 10.2.29 Admin — Pipeline Templates Admin (`/api/admin/pipeline-templates`)

(Also exposed via adminTemplates.ts — same routes, see Section 11.26)

---

### 10.2.30 Admin — Stats (`/api/admin/stats`)

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Platform Admin | Platform-wide aggregate metrics (workspace count, org count, contact count, pending promotions) |
| `GET` | `/api/admin/stats/structure-scans/:id` | Platform Admin | Full structure scan detail |

---

### 10.2.31 Storage Routes

| Method | Path | Auth | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/storage/signed-url` | Workspace Auth | `{ signedUrl, objectPath }` | Pre-signed GCS URL for direct upload |

---

## 10.3 Appendix C: Workspace Pipeline View Schema

## `workspace_pipeline_views`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `template_id` | text (FK→pipeline_view_templates) | Yes | — | ON DELETE CASCADE |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `pipeline_id` | text (FK→pipelines) | No | — | ON DELETE SET NULL |
| `is_enabled` | boolean | Yes | `true` | Show/hide this view |
| `is_default` | boolean | Yes | `false` | Default view for the workspace |
| `sort_order` | integer | Yes | `0` | Ordering of views in nav |
| `visibility_scope` | text | Yes | `all` | `all`, `owner`, `admin`, `member` |
| `settings_json` | jsonb | Yes | `{}` | Per-workspace configuration overrides |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

**Unique constraint:** `(template_id, workspace_id)` — one instance per template per workspace.

## `workspace_pipeline_view_permissions`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_pipeline_view_id` | text (FK→workspace_pipeline_views) | Yes | — | ON DELETE CASCADE |
| `user_id` | text (FK→users) | No | — | ON DELETE CASCADE; if null, applies by role |
| `role` | text | No | — | Role-level permission override (e.g., `ADMIN`, `MEMBER`) |
| `permission` | text | Yes | `view` | `view`, `edit`, `admin` |
| `created_at` | timestamp | Yes | `now()` | |

**Logic:** If `user_id` is set, it's a per-user override. If `role` is set and `user_id` is null, it applies to all members with that role.

---

## 10.4 Appendix D: Plans and Subscriptions Schema

## `plans`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `name` | text | Yes | — | Display name (e.g., "Independent") |
| `slug` | text | Yes | — | Unique identifier (e.g., `independent`, `team`, `enterprise`) |
| `features` | jsonb | No | — | Feature flags; structure not enforced; no validation schema defined |
| `created_at` | timestamp | Yes | `now()` | |

**Note:** `features` is a free-form JSON blob; no validated schema for which keys are valid. The only plan seeded by default is `"independent"` (assigned to all self-signup users).

## `subscriptions`

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | text (UUID) | Yes | auto | PK |
| `workspace_id` | text (FK→workspaces) | Yes | — | ON DELETE CASCADE |
| `plan_id` | text (FK→plans) | Yes | — | **No cascade** — deleting a plan with active subscriptions fails |
| `status` | text | Yes | `active` | `active`, `cancelled`, `past_due` |
| `created_at` | timestamp | Yes | `now()` | |
| `updated_at` | timestamp | Yes | `now()` | |

**Business rule:** If the "independent" plan is not found in the DB at signup time, subscription creation is silently skipped (soft failure). No payment integration is wired.

---
