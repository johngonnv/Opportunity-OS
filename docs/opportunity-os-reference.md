# Opportunity OS — Schema & Workflow Reference

> **Version:** April 2026  
> **Purpose:** Comprehensive reference for the Opportunity OS platform covering the full database schema, API route catalog, key workflows, mobile screen inventory, admin console, and AI enrichment system.

---

## Table of Contents

1. [Tech Stack & Monorepo Structure](#1-tech-stack--monorepo-structure)
2. [PostgreSQL Enums](#2-postgresql-enums)
3. [Database Schema](#3-database-schema)
   - [Identity & Auth](#31-identity--auth)
   - [Workspaces](#32-workspaces)
   - [Plans & Subscriptions](#33-plans--subscriptions)
   - [CRM — Organizations](#34-crm--organizations)
   - [CRM — Contacts](#35-crm--contacts)
   - [CRM — Tags](#36-crm--tags)
   - [CRM — Notes](#37-crm--notes)
   - [Pipeline & Opportunities](#38-pipeline--opportunities)
   - [Tasks & Activities](#39-tasks--activities)
   - [Scanning & Enrichment](#310-scanning--enrichment)
   - [Structure Scans](#311-structure-scans)
   - [Pipeline View Templates](#312-pipeline-view-templates)
   - [Master Organization Intelligence Layer](#313-master-organization-intelligence-layer)
   - [Admin Org Scan Attempts](#314-admin-org-scan-attempts)
   - [Audit Logging](#315-audit-logging)
4. [API Route Catalog](#4-api-route-catalog)
   - [Workspace CRM Routes](#41-workspace-crm-routes)
   - [EMS Vertical Routes](#42-ems-vertical-routes)
   - [Structure Scan Routes](#43-structure-scan-routes)
   - [Admin — Auth & Me](#44-admin--auth--me)
   - [Admin — Pipeline Templates](#45-admin--pipeline-templates)
   - [Admin — Workspaces](#46-admin--workspaces)
   - [Admin — Master Organizations](#47-admin--master-organizations)
   - [Admin — Master Organization Relationships](#48-admin--master-organization-relationships)
   - [Admin — Master Org Scans (Logo Scan for Master DB)](#49-admin--master-org-scans-logo-scan-for-master-db)
   - [Admin — AI Suggestions](#410-admin--ai-suggestions)
   - [Admin — Diagnostics](#411-admin--diagnostics)
   - [Admin — Stats](#412-admin--stats)
5. [Key Workflows](#5-key-workflows)
   - [Business Card Scan → Contact Creation](#51-business-card-scan--contact-creation)
   - [Org Logo Scan → Enrichment](#52-org-logo-scan--enrichment)
   - [AI Suggestion → Human Approval → DB Writeback](#53-ai-suggestion--human-approval--db-writeback)
   - [Completeness Audit → Review Session](#54-completeness-audit--review-session)
   - [Platform Admin Publishing a Template to a Workspace](#55-platform-admin-publishing-a-template-to-a-workspace)
6. [Completeness Scoring System](#6-completeness-scoring-system)
7. [AI Enrichment System](#7-ai-enrichment-system)
8. [Admin Console](#8-admin-console)
9. [Mobile Screen Inventory](#9-mobile-screen-inventory)

---

## 1. Tech Stack & Monorepo Structure

### Stack

| Layer | Technology |
|-------|-----------|
| Monorepo tool | pnpm workspaces |
| Node.js | v24 |
| Language | TypeScript 5.9 |
| API framework | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod (zod/v4), drizzle-zod |
| API codegen | Orval (OpenAPI → React Query hooks) |
| Build | esbuild (CJS bundle) |
| Mobile | Expo Router, React Query, @expo/vector-icons, Inter font |

### Monorepo Layout

```
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         Express API server (port from $PORT, default 8080)
│   └── mobile/             Expo React Native app
├── lib/
│   ├── api-spec/           OpenAPI spec + Orval codegen config
│   ├── api-client-react/   Generated React Query hooks
│   ├── api-zod/            Generated Zod schemas from OpenAPI
│   └── db/
│       └── src/
│           └── schema/     Drizzle schema files (one per domain)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

### Required Secrets / Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_PLACES_API_KEY` | Google Places API (New) — used for org logo scan match |
| `AI_INTEGRATIONS_GROK_API_KEY` | xAI Grok API key (primary/only AI provider) |
| `PRIVATE_OBJECT_DIR` | Object storage bucket path for uploaded images (GCS sidecar today; migrating to Cloudflare R2) |

---

## 2. PostgreSQL Enums

| Enum Name | Allowed Values |
|-----------|---------------|
| `workspace_role` | `OWNER`, `ADMIN`, `MEMBER` |
| `contact_status` | `NEW`, `REVIEWED`, `ACTIVE`, `INACTIVE` |
| `organization_type` | `HOSPITAL`, `HEALTH_SYSTEM`, `HOSPICE`, `HOME_HEALTH`, `GOVERNMENT_AGENCY`, `PRIME_CONTRACTOR`, `SUBCONTRACTOR`, `CONSULTANT`, `VENDOR`, `OTHER` |
| `organization_level` | `enterprise`, `group`, `facility` |
| `account_structure_type` | `enterprise`, `parent`, `regional`, `local_entity`, `facility` |
| `org_vertical` | `healthcare`, `govcon`, `general_business`, `government`, `nonprofit`, `vendor`, `other` |
| `primary_decision_level` | `enterprise`, `parent`, `regional`, `local` |
| `hierarchy_source_type` | `MASTER_DATABASE`, `EXTERNAL_ENRICHMENT`, `LLM_SYNTHESIS`, `HUMAN_CONFIRMED` |
| `opportunity_status` | `OPEN`, `WON`, `LOST`, `ON_HOLD` |
| `opportunity_vertical` | `HEALTHCARE`, `GOVCON`, `CONSULTING`, `PARTNERSHIP` |
| `task_priority` | `LOW`, `MEDIUM`, `HIGH` |
| `task_status` | `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELED` |
| `activity_type` | `CALL`, `EMAIL`, `MEETING`, `CARD_SCAN`, `NOTE`, `FOLLOW_UP`, `EVENT`, `INTRO`, `LOGO_SCAN`, `ORG_ENRICHMENT`, `STRUCTURE_SCAN_STARTED`, `STRUCTURE_SUGGESTED`, `STRUCTURE_APPROVED`, `STRUCTURE_REJECTED` |
| `card_processing_status` | `UPLOADED`, `PARSING`, `PARSED`, `FAILED` |
| `card_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `MERGED` |
| `org_scan_processing_status` | `UPLOADED`, `PARSING`, `PARSED`, `MATCHED`, `FAILED` |
| `org_scan_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `structure_scan_status` | `PENDING`, `MASTER_MATCHED`, `EXTERNAL_SEARCHED`, `LLM_REVIEWED`, `COMPLETED`, `FAILED` |
| `structure_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `admin_org_scan_processing_status` | `UPLOADED`, `PARSING`, `PARSED`, `MATCHED`, `FAILED` |
| `admin_org_scan_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `pipeline_view_template_status` | `draft`, `active`, `inactive`, `archived` |
| `master_org_industry` | `HEALTHCARE`, `GOVCON`, `GENERAL_BUSINESS` |
| `master_account_structure_type` | `ENTERPRISE`, `REGIONAL`, `FACILITY`, `SUB_FACILITY`, `GENERAL_ORG` |
| `master_validation_status` | `UNVALIDATED`, `PARTIALLY_VALIDATED`, `VALIDATED`, `REQUIRES_REVIEW` |
| `master_alias_type` | `DBA`, `ACQUIRED_BRAND`, `ABBREVIATION`, `FORMER_NAME`, `VARIANT` |
| `master_relationship_type` | `SUBSIDIARY`, `REGIONAL`, `DBA`, `AFFILIATED` |
| `master_relationship_review_status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `master_org_ai_suggestion_status` | `PENDING`, `APPROVED`, `REJECTED` |

---

## 3. Database Schema

Tables are grouped by domain. All `id` columns are `text` (UUID, generated via `crypto.randomUUID()`). All timestamps are `timestamp`.

---

### 3.1 Identity & Auth

#### `users`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | `crypto.randomUUID()` | |
| `first_name` | text | null | |
| `last_name` | text | null | |
| `email` | text (NOT NULL, UNIQUE) | — | |
| `password_hash` | text | null | |
| `auth_provider_id` | text (UNIQUE) | null | |
| `account_type` | text (NOT NULL) | `'client_user'` | |
| `is_platform_admin` | boolean (NOT NULL) | `false` | True only for the designated platform admin account |
| `platform_role` | text | null | |
| `created_at` | timestamp (NOT NULL) | `now()` | |
| `updated_at` | timestamp (NOT NULL) | `now()` | auto-updates on write |

---

### 3.2 Workspaces

#### `workspaces`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `name` | text (NOT NULL) | — | |
| `industry_focus` | text | null | |
| `owner_user_id` | text (FK → users.id, CASCADE) | — | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `workspace_members`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `user_id` | text (FK → users.id, CASCADE) | — | |
| `role` | `workspace_role` (NOT NULL) | `MEMBER` | `OWNER`, `ADMIN`, `MEMBER` |
| `created_at` | timestamp | `now()` | |

#### `workspace_admin_audit_log`

Platform-level support action log, separate from workspace `audit_logs`.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `changed_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `changed_at` | timestamp (NOT NULL) | `now()` | |
| `action` | text (NOT NULL) | — | e.g. `ROLE_CHANGE`, `VIEW_TOGGLE` |
| `entity_type` | text (NOT NULL) | — | |
| `entity_id` | text (NOT NULL) | — | |
| `previous_value` | jsonb | null | |
| `new_value` | jsonb | null | |
| `platform_support_action` | boolean (NOT NULL) | `false` | |
| `notes` | text | null | |

---

### 3.3 Plans & Subscriptions

#### `plans`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `name` | text (NOT NULL) | — | |
| `slug` | text (NOT NULL, UNIQUE) | — | |
| `features` | jsonb | null | Feature flag set for this plan |
| `created_at` | timestamp | `now()` | |

#### `subscriptions`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `plan_id` | text (FK → plans.id) | — | |
| `status` | text (NOT NULL) | `'active'` | e.g. `active`, `cancelled` |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

---

### 3.4 CRM — Organizations

#### `organizations`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `parent_organization_id` | text (self-FK, SET NULL) | null | |
| `ultimate_parent_organization_id` | text (self-FK, SET NULL) | null | |
| `organization_level` | `organization_level` | `facility` | |
| `account_structure_type` | `account_structure_type` | null | |
| `vertical` | `org_vertical` | null | |
| `primary_decision_level` | `primary_decision_level` | null | |
| `name` | text (NOT NULL) | — | |
| `legal_name` | text | null | |
| `website` | text | null | |
| `phone` | text | null | |
| `email` | text | null | |
| `organization_type` | `organization_type` (NOT NULL) | `OTHER` | |
| `industry` | text | null | |
| `sub_industry` | text | null | |
| `sub_vertical` | text | null | |
| `region_name` | text | null | |
| `msa_status` | text | null | |
| `system_priority_tier` | text | null | |
| `expansion_strategy` | text | null | |
| `expansion_maturity` | text | null | |
| `strategic_tier` | text | null | |
| `address_line1` | text | null | |
| `address_line2` | text | null | |
| `city` | text | null | |
| `state` | text | null | |
| `zip` | text | null | |
| `country` | text | null | |
| `notes_text` | text | null | |
| `owner_user_id` | text (FK → users.id, SET NULL) | null | |
| `outreach_owner_user_id` | text (FK → users.id, SET NULL) | null | |
| `google_place_id` | text | null | From Google Places enrichment |
| `formatted_address` | text | null | From Google Places enrichment |
| `website_domain` | text | null | Normalized domain |
| `latitude` | double precision | null | |
| `longitude` | double precision | null | |
| `place_category` | text | null | Google Places primary type |
| `last_enriched_at` | timestamp | null | |
| `enrichment_source` | text | null | e.g. `google_places` |
| `master_organization_id` | text | null | Soft FK to master_organizations |
| `hierarchy_confidence_score` | double precision | null | |
| `hierarchy_last_scanned_at` | timestamp | null | |
| `hierarchy_last_reviewed_at` | timestamp | null | |
| `hierarchy_source_type` | `hierarchy_source_type` | null | |
| `suggested_parent_name` | text | null | |
| `suggested_ultimate_parent_name` | text | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `organization_ems_profiles`

One-to-one with `organizations` for EMS vertical data (Nevada Ground EMS context).

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `organization_id` | text (FK → organizations.id, CASCADE) | — | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `primary_transport_need` | text | null | |
| `incumbent_provider` | text | null | |
| `estimated_monthly_transports` | integer | null | |
| `payer_mix_summary` | text | null | |
| `las_vegas_jurisdiction_eligibility` | text | null | |
| `discharge_workflow_notes` | text | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | |

---

### 3.5 CRM — Contacts

#### `contacts`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `organization_id` | text (FK → organizations.id, SET NULL) | null | |
| `first_name` | text | null | |
| `last_name` | text | null | |
| `full_name` | text (NOT NULL) | — | |
| `title` | text | null | |
| `department` | text | null | |
| `email` | text | null | |
| `phone` | text | null | |
| `mobile` | text | null | |
| `linkedin_url` | text | null | |
| `source` | text | null | |
| `source_detail` | text | null | |
| `status` | `contact_status` (NOT NULL) | `NEW` | |
| `notes_text` | text | null | |
| `owner_user_id` | text (FK → users.id, SET NULL) | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

---

### 3.6 CRM — Tags

#### `tags`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `name` | text (NOT NULL) | — | UNIQUE with workspace_id |
| `color` | text | null | |
| `category` | text | null | |
| `created_at` | timestamp | `now()` | |

#### `contact_tags`

Junction table: contact ↔ tag (many-to-many). UNIQUE on `(contact_id, tag_id)`.

| Column | Type |
|--------|------|
| `id` | text (PK) |
| `contact_id` | text (FK → contacts.id, CASCADE) |
| `tag_id` | text (FK → tags.id, CASCADE) |

#### `organization_tags`

Junction table: organization ↔ tag. UNIQUE on `(organization_id, tag_id)`.

| Column | Type |
|--------|------|
| `id` | text (PK) |
| `organization_id` | text (FK → organizations.id, CASCADE) |
| `tag_id` | text (FK → tags.id, CASCADE) |

---

### 3.7 CRM — Notes

#### `notes`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `contact_id` | text (FK → contacts.id, SET NULL) | null | |
| `organization_id` | text (FK → organizations.id, SET NULL) | null | |
| `opportunity_id` | text | null | Soft FK (no constraint) |
| `content` | text (NOT NULL) | — | |
| `created_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

---

### 3.8 Pipeline & Opportunities

#### `pipelines`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `name` | text (NOT NULL) | — | |
| `category` | text | null | `EMS` for EMS vertical pipelines |
| `created_at` | timestamp | `now()` | |

**Seeded pipelines per new workspace:**
- Relationship Pipeline (7 stages)
- Sales Pipeline (8 stages)
- Interfacility Transport EMS Pipeline (8 stages, `category = 'EMS'`)

#### `pipeline_stages`

UNIQUE on `(pipeline_id, stage_order)`.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `pipeline_id` | text (FK → pipelines.id, CASCADE) | — | |
| `name` | text (NOT NULL) | — | |
| `stage_order` | integer (NOT NULL) | — | |
| `probability_percent` | integer (NOT NULL) | `0` | |
| `created_at` | timestamp | `now()` | |

#### `opportunities`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `pipeline_id` | text (FK → pipelines.id, CASCADE) | — | |
| `pipeline_stage_id` | text (FK → pipeline_stages.id, RESTRICT) | — | |
| `organization_id` | text (FK → organizations.id, SET NULL) | null | |
| `primary_contact_id` | text (FK → contacts.id, SET NULL) | null | |
| `title` | text (NOT NULL) | — | |
| `description` | text | null | |
| `vertical` | `opportunity_vertical` (NOT NULL) | `CONSULTING` | |
| `value_estimate` | double precision | null | |
| `close_date_estimate` | timestamp | null | |
| `status` | `opportunity_status` (NOT NULL) | `OPEN` | |
| `score` | integer | null | |
| `source` | text | null | |
| `owner_user_id` | text (FK → users.id, SET NULL) | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `opportunity_contacts`

Junction table: opportunity ↔ contact. UNIQUE on `(opportunity_id, contact_id)`.

| Column | Type |
|--------|------|
| `id` | text (PK) |
| `opportunity_id` | text (FK → opportunities.id, CASCADE) |
| `contact_id` | text (FK → contacts.id, CASCADE) |
| `relationship_role` | text |

#### `opportunity_ems_interfacility_profiles`

One-to-one with `opportunities` (UNIQUE on `opportunity_id`). EMS-specific transport engagement data.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `opportunity_id` | text (FK → opportunities.id, CASCADE) | — | |
| `service_mix_bls` | boolean | `false` | Basic Life Support |
| `service_mix_als` | boolean | `false` | Advanced Life Support |
| `service_mix_cct` | boolean | `false` | Critical Care Transport |
| `current_provider_name` | text | null | |
| `estimated_monthly_transports` | integer | null | |
| `payer_mix_medicare_percent` | integer | null | |
| `payer_mix_medicaid_percent` | integer | null | |
| `payer_mix_private_percent` | integer | null | |
| `payer_mix_other_percent` | integer | null | |
| `primary_pain_points` | text | null | |
| `agreement_status` | text | null | |
| `protocol_go_live_date` | timestamp | null | |
| `active_consistency_start_date` | timestamp | null | |
| `active_last_qualified_transport_at` | timestamp | null | |
| `qualified_transports_last_30_days` | integer | null | |
| `avg_qualified_transports_per_week` | numeric | null | |
| `jurisdiction_eligibility` | text | null | |
| `jurisdiction_notes` | text | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

---

### 3.9 Tasks & Activities

#### `tasks`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `contact_id` | text (FK → contacts.id, SET NULL) | null | |
| `organization_id` | text (FK → organizations.id, SET NULL) | null | |
| `opportunity_id` | text | null | Soft FK |
| `title` | text (NOT NULL) | — | |
| `description` | text | null | |
| `due_date` | timestamp | null | |
| `priority` | `task_priority` (NOT NULL) | `MEDIUM` | |
| `status` | `task_status` (NOT NULL) | `OPEN` | |
| `assigned_to_user_id` | text (FK → users.id, SET NULL) | null | |
| `created_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `completed_at` | timestamp | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `activities`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `contact_id` | text (FK → contacts.id, SET NULL) | null | |
| `organization_id` | text (FK → organizations.id, SET NULL) | null | |
| `opportunity_id` | text | null | Soft FK |
| `type` | `activity_type` (NOT NULL) | — | |
| `subject` | text (NOT NULL) | — | |
| `description` | text | null | |
| `occurred_at` | timestamp (NOT NULL) | `now()` | |
| `created_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `created_at` | timestamp | `now()` | |

---

### 3.10 Scanning & Enrichment

#### `business_cards`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `uploaded_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `image_url_front` | text (NOT NULL) | — | Cloud storage URL |
| `image_url_back` | text | null | |
| `raw_ocr_text` | text | null | Raw GPT-4o OCR output |
| `parsed_json` | jsonb | null | Structured contact fields |
| `processing_status` | `card_processing_status` (NOT NULL) | `UPLOADED` | |
| `review_status` | `card_review_status` (NOT NULL) | `PENDING_REVIEW` | |
| `linked_contact_id` | text (FK → contacts.id, SET NULL) | null | Set on approval |
| `linked_organization_id` | text (FK → organizations.id, SET NULL) | null | Set on approval |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `organization_scans`

Workspace-level org logo/signage scans for enriching workspace org records.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `uploaded_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `organization_id` | text (FK → organizations.id, SET NULL) | null | Set on approval |
| `image_url` | text (NOT NULL) | — | Cloud storage URL |
| `raw_ocr_text` | text | null | |
| `parsed_business_name` | text | null | |
| `confidence_score` | double precision | null | |
| `matched_place_json` | jsonb | null | Up to 5 Google Places candidates |
| `selected_match_json` | jsonb | null | Admin-selected match |
| `processing_status` | `org_scan_processing_status` (NOT NULL) | `UPLOADED` | |
| `review_status` | `org_scan_review_status` (NOT NULL) | `PENDING_REVIEW` | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

---

### 3.11 Structure Scans

#### `organization_structure_scans`

Records a hierarchy scan attempt for a workspace org — determines parent/ultimate-parent relationships by searching the master database, external sources, and LLM analysis.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `organization_id` | text (FK → organizations.id, CASCADE) | — | |
| `initiated_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `scan_status` | `structure_scan_status` (NOT NULL) | `PENDING` | Lifecycle: `PENDING → MASTER_MATCHED / EXTERNAL_SEARCHED / LLM_REVIEWED → COMPLETED / FAILED` |
| `review_status` | `structure_review_status` (NOT NULL) | `PENDING_REVIEW` | Admin acceptance: `PENDING_REVIEW → APPROVED / REJECTED` |
| `suggested_parent_master_organization_id` | text (FK → master_organizations.id, SET NULL) | null | |
| `suggested_parent_name` | text | null | |
| `suggested_ultimate_parent_name` | text | null | |
| `suggested_structure_type` | text | null | |
| `confidence_score` | double precision | null | |
| `evidence_summary` | text | null | |
| `external_source_payload` | jsonb | null | Raw API response |
| `llm_reasoning_summary` | text | null | GPT-4o reasoning text |
| `add_to_master_graph` | boolean (NOT NULL) | `false` | If true, approval writes relationship to master graph |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

---

### 3.12 Pipeline View Templates

#### `pipeline_view_templates`

Platform admin–managed master template library.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `key` | text (NOT NULL, UNIQUE) | — | e.g. `ems_interfacility_transport_v1` |
| `name` | text (NOT NULL) | — | |
| `vertical` | text (NOT NULL) | — | e.g. `EMS`, `healthcare`, `govcon` |
| `sub_vertical` | text | null | |
| `status` | `pipeline_view_template_status` (NOT NULL) | `draft` | |
| `is_locked` | boolean (NOT NULL) | `false` | Prevents workspace admin edits when true |
| `is_client_editable` | boolean (NOT NULL) | `true` | |
| `config_json` | jsonb (NOT NULL) | `{}` | Template configuration payload |
| `created_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `updated_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `workspace_pipeline_views`

Per-workspace enablement of a template. UNIQUE on `(template_id, workspace_id)`.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `template_id` | text (FK → pipeline_view_templates.id, CASCADE) | — | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | — | |
| `pipeline_id` | text (FK → pipelines.id, SET NULL) | null | |
| `is_enabled` | boolean (NOT NULL) | `true` | |
| `is_default` | boolean (NOT NULL) | `false` | |
| `sort_order` | integer (NOT NULL) | `0` | |
| `visibility_scope` | text (NOT NULL) | `all` | |
| `settings_json` | jsonb (NOT NULL) | `{}` | Workspace overrides |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `workspace_pipeline_view_permissions`

User/role-level access control per workspace pipeline view.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `workspace_pipeline_view_id` | text (FK → workspace_pipeline_views.id, CASCADE) | — | |
| `user_id` | text (FK → users.id, CASCADE) | null | |
| `role` | text | null | |
| `permission` | text (NOT NULL) | `view` | |
| `created_at` | timestamp | `now()` | |

---

### 3.13 Master Organization Intelligence Layer

The Master Organization (Master DB) is the platform-level canonical directory of organizations — independent of any workspace. It underpins cross-workspace org linking, hierarchy resolution, and AI enrichment.

#### `master_organizations`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `canonical_name` | text (NOT NULL) | — | Authoritative org name |
| `display_name` | text | null | Human-friendly short name |
| `normalized_name` | text (NOT NULL) | — | Lowercase, punctuation-stripped for fuzzy match |
| `website_domain` | text | null | Normalized domain (e.g. `mayo.edu`) |
| `industry` | `master_org_industry` | null | `HEALTHCARE`, `GOVCON`, `GENERAL_BUSINESS` |
| `sub_vertical` | text | null | |
| `account_structure_type` | `master_account_structure_type` | null | `ENTERPRISE`, `REGIONAL`, `FACILITY`, `SUB_FACILITY`, `GENERAL_ORG` |
| `is_standalone` | boolean (NOT NULL) | `false` | True if no parent/child relationships |
| `confidence_score` | double precision (NOT NULL) | `0.5` | 0–1 quality confidence |
| `source_type` | text (NOT NULL) | `MANUAL` | |
| `source_confidence` | double precision (NOT NULL) | `1.0` | |
| `validation_status` | `master_validation_status` (NOT NULL) | `UNVALIDATED` | |
| `headquarters_address` | text | null | |
| `city` | text | null | |
| `state` | text | null | |
| `country` | text | null | |
| `notes` | text | null | |
| `place_ids` | jsonb (string[]) | `[]` | Google Place IDs |
| `aliases` | jsonb (string[]) | `[]` | Legacy aliases array |
| `admin_flags` | jsonb (string[]) | `[]` | e.g. `duplicate_suspect`, `structure_not_run` |
| `structure_last_scanned_at` | timestamp | null | |
| `structure_last_reviewed_at` | timestamp | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `master_organization_aliases`

Formal alias records used for fuzzy matching.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `master_organization_id` | text (FK → master_organizations.id, CASCADE) | — | |
| `alias_name` | text (NOT NULL) | — | |
| `normalized_alias_name` | text (NOT NULL) | — | |
| `alias_type` | `master_alias_type` (NOT NULL) | `VARIANT` | `DBA`, `ACQUIRED_BRAND`, `ABBREVIATION`, `FORMER_NAME`, `VARIANT` |
| `created_at` | timestamp | `now()` | |

#### `master_organization_relationships`

Parent–child relationships between master orgs.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `parent_master_organization_id` | text (FK → master_organizations.id, CASCADE) | — | |
| `child_master_organization_id` | text (FK → master_organizations.id, CASCADE) | — | |
| `relationship_type` | `master_relationship_type` (NOT NULL) | `SUBSIDIARY` | |
| `confidence_score` | double precision (NOT NULL) | `1.0` | |
| `evidence_summary` | text | null | |
| `source_payload` | jsonb | null | |
| `approved_by_user_id` | text (FK → users.id, SET NULL) | null | |
| `review_status` | `master_relationship_review_status` (NOT NULL) | `APPROVED` | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

#### `master_org_healthcare_overlays`

One-to-one healthcare vertical data. UNIQUE on `master_organization_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | |
| `master_organization_id` | text (FK, CASCADE) | |
| `facility_type` | text | `HOSPITAL`, `AMBULATORY_SURGERY_CENTER`, `SKILLED_NURSING_FACILITY`, `HOME_HEALTH`, `HOSPICE`, `BEHAVIORAL_HEALTH`, `PHYSICIAN_GROUP`, `HEALTH_SYSTEM`, `IMAGING_CENTER`, `URGENT_CARE`, `FQHC`, `CRITICAL_ACCESS_HOSPITAL` |
| `licensed_beds` | integer | Number of licensed beds; 0 for non-inpatient |
| `trauma_level` | text | `LEVEL_I`, `LEVEL_II`, `LEVEL_III`, `LEVEL_IV`, `NONE` |
| `system_type` | text | `ACADEMIC_MEDICAL_CENTER`, `COMMUNITY_HOSPITAL`, `INTEGRATED_DELIVERY_NETWORK`, `INDEPENDENT`, `SAFETY_NET`, `VA_DOD` |
| `ownership_model` | text | `FOR_PROFIT`, `NON_PROFIT`, `GOVERNMENT`, `RELIGIOUS`, `COOPERATIVE` |
| `care_setting` | text | `INPATIENT`, `OUTPATIENT`, `BOTH`, `POST_ACUTE`, `COMMUNITY` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | auto-updates |

#### `master_org_govcon_overlays`

One-to-one GovCon vertical data. UNIQUE on `master_organization_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | |
| `master_organization_id` | text (FK, CASCADE) | |
| `uei` | text | 12-character SAM.gov Unique Entity Identifier |
| `cage_code` | text | 5-character CAGE code |
| `naics_codes` | jsonb (string[]) | Array of NAICS code strings |
| `prime_or_sub` | text | `PRIME`, `SUB`, or `BOTH` |
| `contract_vehicles` | jsonb (string[]) | e.g. `["GSA Schedule","CIO-SP3","SEWP V"]` |
| `agency_alignment` | text | Primary agency focus (e.g. `DoD`, `HHS`, `VA`) |
| `created_at` | timestamp | |
| `updated_at` | timestamp | auto-updates |

#### `master_org_ai_suggestions`

AI-generated field suggestions awaiting human review. No suggestion is ever silently written to the master database.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `master_organization_id` | text (FK → master_organizations.id, CASCADE) | — | |
| `field` | text (NOT NULL) | — | e.g. `websiteDomain`, `healthcare.facilityType`, `govcon.uei` |
| `current_value` | text | null | Value at time suggestion was created |
| `suggested_value` | text (NOT NULL) | — | AI-proposed replacement |
| `rationale` | text | null | One-sentence AI explanation |
| `status` | `master_org_ai_suggestion_status` (NOT NULL) | `PENDING` | |
| `reviewed_by_user_id` | text (FK → users.id, SET NULL) | null | Admin who acted |
| `reviewed_at` | timestamp | null | |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

---

### 3.14 Admin Org Scan Attempts

#### `admin_org_scan_attempts`

Platform admin–level logo/signage scans used to create new records in the master organization database (as opposed to workspace-level `organization_scans` which enrich workspace orgs).

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | text (PK) | UUID | |
| `uploaded_by_admin_id` | text (FK → users.id, SET NULL) | null | Platform admin who uploaded |
| `image_url` | text (NOT NULL) | — | Object storage path (e.g. `/objects/master-org-scans/...`) |
| `raw_ocr_text` | text | null | GPT-4o OCR output |
| `parsed_business_name` | text | null | Extracted org name |
| `confidence_score` | double precision | null | Match confidence |
| `matched_place_json` | jsonb | null | Google Places candidates |
| `selected_match_json` | jsonb | null | Admin-selected match |
| `processing_status` | `admin_org_scan_processing_status` (NOT NULL) | `UPLOADED` | |
| `review_status` | `admin_org_scan_review_status` (NOT NULL) | `PENDING_REVIEW` | |
| `created_master_org_id` | text (FK → master_organizations.id, SET NULL) | null | Set when approved scan creates a new master org |
| `created_at` | timestamp | `now()` | |
| `updated_at` | timestamp | `now()` | auto-updates |

---

### 3.15 Audit Logging

#### `audit_logs`

Workspace-scoped action log (CRM entity changes, card approvals, enrichment events).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | |
| `workspace_id` | text (FK → workspaces.id, CASCADE) | |
| `user_id` | text (FK → users.id, SET NULL) | |
| `entity_type` | text (NOT NULL) | e.g. `contact`, `organization`, `business_card` |
| `entity_id` | text (NOT NULL) | |
| `action` | text (NOT NULL) | e.g. `CREATED`, `UPDATED`, `APPROVED`, `REJECTED` |
| `before_json` | jsonb | Snapshot before change |
| `after_json` | jsonb | Snapshot after change |
| `created_at` | timestamp | |

---

## 4. API Route Catalog

All routes are prefixed with `/api`. Authentication is workspace-scoped via JWT unless noted as **platform admin only**.

### 4.1 Workspace CRM Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/contacts` | List contacts (search, tag, status filters) |
| POST | `/contacts` | Create contact |
| GET | `/contacts/:id` | Get contact detail |
| PUT | `/contacts/:id` | Update contact |
| DELETE | `/contacts/:id` | Delete contact |
| GET | `/organizations` | List organizations (search, vertical, type, hierarchy filters) |
| POST | `/organizations` | Create organization |
| GET | `/organizations/:id` | Get org detail (includes hierarchy roll-up stats) |
| PUT | `/organizations/:id` | Update organization |
| DELETE | `/organizations/:id` | Delete organization |
| POST | `/organizations/:id/link-child` | Set parent–child hierarchy link |
| POST | `/organizations/:id/unlink-child` | Remove hierarchy link |
| GET | `/opportunities` | List opportunities (supports `emsView` filter for EMS saved views) |
| POST | `/opportunities` | Create opportunity |
| GET | `/opportunities/:id` | Get opportunity detail (includes `emsProfile` and `pipeline.category`) |
| PUT | `/opportunities/:id` | Update opportunity |
| DELETE | `/opportunities/:id` | Delete opportunity |
| GET | `/pipelines` | List pipelines for workspace |
| POST | `/business-cards` | Create business card record |
| GET | `/business-cards` | List business cards |
| GET | `/business-cards/:id` | Get card detail |
| PUT | `/business-cards/:id` | Update card fields |
| POST | `/business-cards/:id/parse` | Trigger GPT-4o OCR to extract contact fields |
| POST | `/business-cards/:id/approve` | Approve card → create or merge contact |
| POST | `/business-cards/:id/reject` | Reject card |
| POST | `/organization-scans/upload` | Multipart upload of org logo image |
| GET | `/organization-scans` | List org scans (optional `?organizationId=` filter) |
| GET | `/organization-scans/:id` | Get scan detail |
| POST | `/organization-scans/:id/parse` | GPT-4o vision OCR to extract business name |
| POST | `/organization-scans/:id/match` | Google Places API text search (stores up to 5 candidates) |
| POST | `/organization-scans/:id/approve` | Approve scan → create or enrich organization |
| POST | `/organization-scans/:id/reject` | Reject scan |
| GET | `/tasks` | List tasks (status, priority filters) |
| POST | `/tasks` | Create task |
| GET | `/tasks/:id` | Get task |
| PUT | `/tasks/:id` | Update task |
| DELETE | `/tasks/:id` | Delete task |
| GET | `/activities` | List activities |
| POST | `/activities` | Create activity |
| PUT | `/activities/:id` | Update activity |
| DELETE | `/activities/:id` | Delete activity |
| POST | `/notes` | Create note |
| PUT | `/notes/:id` | Update note |
| DELETE | `/notes/:id` | Delete note |
| GET | `/tags` | List tags |
| POST | `/tags` | Create tag |
| GET | `/reports/dashboard` | Dashboard summary stats |
| GET | `/reports/activities` | Activity feed |
| GET | `/workspaces/:workspaceId/pipeline-views` | List pipeline views for workspace |
| PUT | `/workspaces/:workspaceId/pipeline-views/:id` | Update pipeline view (blocks locked template fields) |
| GET | `/workspaces/:workspaceId/members` | List workspace members with user info |
| PUT | `/workspaces/:workspaceId/members/:userId` | Change member role (min-1-admin enforced) |
| DELETE | `/workspaces/:workspaceId/members/:userId` | Remove member (min-1-admin enforced) |
| POST | `/workspaces/:workspaceId/invites` | Invite user by email |

---

### 4.2 EMS Vertical Routes

Require `category = 'EMS'` pipeline context.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ems/opportunities/:id/ems-profile` | Get EMS interfacility profile for opportunity |
| POST | `/ems/opportunities/:id/ems-profile` | Create EMS profile |
| PUT | `/ems/opportunities/:id/ems-profile` | Update EMS profile |
| GET | `/ems/organizations/:id/ems-profile` | Get EMS org profile |
| PUT | `/ems/organizations/:id/ems-profile` | Update EMS org profile |

---

### 4.3 Structure Scan Routes

Workspace-initiated org hierarchy scan pipeline.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/structure-scans` | Initiate a new structure scan for an organization |
| GET | `/structure-scans` | List structure scans for workspace |
| GET | `/structure-scans/:id` | Get structure scan detail |
| POST | `/structure-scans/:id/run` | Run the scan pipeline (master match → external search → LLM review) |
| POST | `/structure-scans/:id/approve` | Approve scan result → apply parent/structure to org, optionally add to master graph |
| POST | `/structure-scans/:id/reject` | Reject scan result |

---

### 4.4 Admin — Auth & Me

**Platform admin only** (requires admin JWT, separate from workspace JWT).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/admin/auth/login` | Admin login — returns signed admin JWT |
| GET | `/admin/me` | Get current admin user profile |

---

### 4.5 Admin — Pipeline Templates

**Platform admin only.**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/pipeline-templates` | List all templates (status, vertical filters) |
| POST | `/admin/pipeline-templates` | Create new template (Zod validation + status transition guards) |
| GET | `/admin/pipeline-templates/:id` | Get template detail |
| PUT | `/admin/pipeline-templates/:id` | Update template |
| DELETE | `/admin/pipeline-templates/:id` | Delete template |
| POST | `/admin/pipeline-templates/:id/publish` | Publish template to a target workspace |

---

### 4.6 Admin — Workspaces

**Platform admin only.**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/workspaces` | List all client workspaces with member/admin/view counts |
| GET | `/admin/workspaces/:workspaceId` | Get workspace details |
| GET | `/admin/workspaces/:workspaceId/pipeline-views` | List workspace's pipeline views |
| PUT | `/admin/workspaces/:workspaceId/pipeline-views/:viewId` | Update pipeline view (logs via `logAdminAction`) |
| PUT | `/admin/workspaces/:workspaceId/pipeline-views/reorder` | Reorder pipeline views (updates `sort_order` for multiple views in one call) |
| GET | `/admin/workspaces/:workspaceId/members` | List workspace members with user details |
| DELETE | `/admin/workspaces/:workspaceId/members/:userId` | Remove member (min-admin guard) |
| PUT | `/admin/workspaces/:workspaceId/members/:memberId/role` | Update member role (logs via `logAdminAction`) |
| GET | `/admin/workspaces/:workspaceId/audit-log` | List audit log entries with `changedByName` |

---

### 4.7 Admin — Master Organizations

**Platform admin only.**

> **Route order note:** `/suggest-link` and `/completeness-audit` are registered **before** `/:id` to avoid parameter capture by the dynamic route.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/master-organizations/suggest-link` | Fuzzy match engine — given `orgName` + optional `domain`, returns top-5 candidates with confidence score and band (HIGH / MEDIUM / LOW) |
| GET | `/admin/master-organizations/completeness-audit` | List all master orgs with completeness score + health stage, sortable; supports `healthStage` and `industry` filters |
| GET | `/admin/master-organizations` | List master orgs (search, sourceType, industry, validationStatus, page/limit) |
| POST | `/admin/master-organizations` | Create new master org record |
| GET | `/admin/master-organizations/:id` | Get master org detail |
| PUT | `/admin/master-organizations/:id` | Update master org |
| DELETE | `/admin/master-organizations/:id` | Delete master org |
| GET | `/admin/master-organizations/:id/completeness` | Field-by-field completeness checklist + health stage + next best action |
| GET | `/admin/master-organizations/:id/next-action` | Next best admin action (computed from missing fields and flags) |
| GET | `/admin/master-organizations/:id/aliases` | List formal aliases |
| POST | `/admin/master-organizations/:id/aliases` | Add alias |
| DELETE | `/admin/master-organizations/:id/aliases/:aliasId` | Remove alias |
| PUT | `/admin/master-organizations/:id/healthcare-overlay` | Upsert healthcare vertical overlay |
| PUT | `/admin/master-organizations/:id/govcon-overlay` | Upsert GovCon vertical overlay |
| GET | `/admin/master-organizations/:id/siblings` | List sibling orgs (same parent) |
| GET | `/admin/master-organizations/:id/ultimate-parent` | Walk relationship chain to root enterprise |
| PATCH | `/admin/master-organizations/:id/validation-status` | Update validation status only |
| POST | `/admin/master-organizations/:id/structure-scan` | Clear `structure_not_run` flag, stamp `structure_last_scanned_at` |
| DELETE | `/admin/master-organizations/:id/relationships/:relId` | Remove a parent–child relationship |

---

### 4.8 Admin — Master Organization Relationships

**Platform admin only.**

| Method | Path | Purpose |
|--------|------|---------|
| PUT | `/admin/master-organization-relationships/:id` | Update relationship (type, confidence score, evidence summary) |
| DELETE | `/admin/master-organization-relationships/:id` | Delete a master org relationship |

---

### 4.9 Admin — Master Org Scans (Logo Scan for Master DB)

**Platform admin only.** Parallel to workspace `organization_scans` but writes to the master org database, not workspace orgs.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/admin/master-org-scans/upload` | Multipart image upload — stores to object storage, creates `admin_org_scan_attempts` record |
| GET | `/admin/master-org-scans` | List admin scan attempts |
| GET | `/admin/master-org-scans/:id` | Get scan detail |
| POST | `/admin/master-org-scans/:id/parse` | GPT-4o OCR to extract business name |
| POST | `/admin/master-org-scans/:id/match` | Google Places search (stores up to 5 candidates) |
| POST | `/admin/master-org-scans/:id/approve` | Approve scan → create or enrich master organization |
| POST | `/admin/master-org-scans/:id/reject` | Reject scan |

---

### 4.10 Admin — AI Suggestions

**Platform admin only.**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/ai-suggestions` | List AI suggestions — filter by `status` (`PENDING` / `APPROVED` / `REJECTED` / `ALL`) and optional `orgId` |
| POST | `/admin/ai-suggestions/:orgId/generate` | Trigger GPT-4o to generate field suggestions for all missing fields; stores as `PENDING` |
| POST | `/admin/ai-suggestions/:id/approve` | Approve suggestion and write value back to master org |
| POST | `/admin/ai-suggestions/:id/reject` | Reject suggestion — no writeback |

---

### 4.11 Admin — Diagnostics

**Platform admin only.**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/diagnostics/summary` | Database health summary: total master orgs, duplicate suspects, missingDomain, missingIndustry, unvalidated, pendingAiSuggestions, unlinkedWorkspaceOrgs, low-confidence count, stale records |
| GET | `/admin/diagnostics/duplicates` | List master org records suspected to be duplicates (same normalized name or domain) |
| GET | `/admin/diagnostics/structure-coverage` | Structure scan coverage: how many orgs have been scanned, pending review, approved, rejected |
| GET | `/admin/diagnostics/relationship-integrity` | Relationship integrity check: orgs with broken or missing parent chains |
| GET | `/admin/diagnostics/confidence-review` | List master orgs with confidence score below threshold (candidates for manual review) |
| GET | `/admin/diagnostics/domain` | Domain coverage analysis: master orgs missing website domain |
| GET | `/admin/diagnostics/workspace-coverage` | Per-workspace org linkage breakdown: total, linked, unlinked, coverage%, healthStatus (`GOOD` / `PARTIAL` / `LOW`) |
| GET | `/admin/diagnostics/unlinked-orgs` | Queue of workspace orgs with no master link |

---

### 4.12 Admin — Stats

**Platform admin only.**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/stats` | Platform-wide counts: total workspaces, members, templates by status, master orgs; recent structure scans |
| GET | `/admin/stats/structure-scans/:id` | Get full detail of a specific structure scan by ID (includes org name via join) |

---

## 5. Key Workflows

### 5.1 Business Card Scan → Contact Creation

1. **Upload** — User photographs a business card in the mobile app (camera or gallery). The image is uploaded to cloud storage and a `business_cards` record is created with `processing_status = UPLOADED`, `review_status = PENDING_REVIEW`.

2. **Parse** — User (or auto-trigger) calls the parse endpoint. GPT-4o vision OCR extracts structured contact fields (name, title, company, email, phone, etc.) and populates `raw_ocr_text` and `parsed_json`. Status advances to `PARSED` (or `FAILED` on error).

3. **Review** — The card appears in the Cards tab queue. The user opens the card review screen, which displays extracted fields pre-filled in a form. A PHI warning is shown for healthcare context. The user can edit any field before approving.

4. **Approve** — User taps Approve. The API:
   - Creates a new `contacts` record (or merges into an existing one if `linkedContactId` is set).
   - Optionally creates or links an `organizations` record if company data is present.
   - Sets `linked_contact_id` on the card record and `review_status = APPROVED`.
   - Logs a `CARD_SCAN` activity.

5. **Reject** — Alternatively, the user taps Reject. `review_status` is set to `REJECTED`. The card record is preserved for audit purposes.

---

### 5.2 Org Logo Scan → Enrichment

1. **Upload** — User photographs a building sign, door logo, or printed org material. Image is uploaded to cloud storage and an `organization_scans` record is created with `processing_status = UPLOADED`.

2. **Parse** — GPT-4o vision OCR extracts the business name (`parsed_business_name`) and sets `processing_status = PARSED`.

3. **Match** — The match endpoint calls Google Places API (New) text search using the parsed name, optionally biased by GPS coordinates. Up to 5 ranked candidate matches are stored in `matched_place_json`. Status advances to `MATCHED`.

4. **Review & Select** — User reviews candidates. The selected match is stored in `selected_match_json`. Location, website, and place category fields are extracted.

5. **Approve** — User calls approve, providing a target org ID (existing) or requesting a new org be created.
   - If creating: a new `organizations` record is inserted with Place details pre-filled.
   - If enriching existing: non-destructive merge — only blank fields are filled unless `forceFields[]` override is specified.
   - `google_place_id`, `formatted_address`, `website_domain`, `latitude`, `longitude`, `place_category`, `last_enriched_at`, and `enrichment_source` are written.
   - A `LOGO_SCAN` or `ORG_ENRICHMENT` activity is logged.

6. **Reject** — `review_status = REJECTED`. Record is preserved.

---

### 5.3 AI Suggestion → Human Approval → DB Writeback

> **Core rule:** AI cannot silently modify the master database. Every suggestion remains `PENDING` until explicit admin approval.

1. **Generate** — Platform admin triggers generation on a master org from the detail screen or the completeness audit queue.

2. **Prompt construction** — The API collects all missing fields (core fields + healthcare/GovCon overlay fields for the org's industry). A structured prompt is sent to GPT-4o with the org's current data and field-level validation rules.

3. **Store as PENDING** — Each suggestion returned by GPT-4o is stored as a separate `master_org_ai_suggestions` row with `status = PENDING`. Stale `PENDING` suggestions for the same fields are deleted before inserting fresh ones.

4. **Review queue** — The AI Suggestions screen displays all `PENDING` suggestions side-by-side: current value vs. suggested value, plus the AI rationale. Fields are grouped by category (core, Healthcare Overlay, GovCon Overlay) with color-coded category pills.

5. **Approve** — Admin taps Approve on a suggestion. The API routes to the correct writeback:
   - `healthcare.*` prefix → upsert `master_org_healthcare_overlays`
   - `govcon.*` prefix → upsert `master_org_govcon_overlays`
   - Core fields → update `master_organizations` directly
   - Suggestion `status` set to `APPROVED`, `reviewed_at` stamped.

6. **Reject** — Admin taps Reject. `status = REJECTED`. No data is written anywhere.

---

### 5.4 Completeness Audit → Review Session

1. **Open Audit Queue** — Platform admin navigates to the Completeness Audit screen. The screen calls `/admin/master-organizations/completeness-audit`, returning all master orgs sorted by completeness score (lowest first by default).

2. **Filter** — Admin can filter by health stage (`INCOMPLETE`, `IDENTIFIED`, `STRUCTURED`, `STRATEGIC`) or industry chip to narrow the queue.

3. **Start Review Session** — Admin taps "Review All" or taps a single row. The app seeds the review queue with the filtered org IDs and navigates to the master org detail screen for the first org.

4. **Detail Review** — On the detail screen:
   - The Completeness card shows a scored field checklist with a progress bar and health stage badge.
   - The Next-Best-Action card shows the highest-priority recommended admin action.
   - The admin performs the action (editing fields, adding aliases, setting industry, linking parent, etc.).

5. **Advance** — Admin taps the "▶" toolbar button (Review mode) to advance to the next org in the session queue.

6. **AI Enrichment mid-session** — Admin can tap "AI Suggest Updates" on any detail screen to generate AI suggestions, then navigate to the AI Suggestions screen to review them.

---

### 5.5 Platform Admin Publishing a Template to a Workspace

1. **Create/Edit Template** — Platform admin navigates to Templates. Creates a new template or selects an existing one.

2. **Configure** — Admin sets `vertical`, `sub_vertical`, `is_locked`, `is_client_editable`, and `config_json`. Template `status` must be `active` before publishing.

3. **Publish** — Admin opens the template's edit screen and triggers "Publish to Workspace." A bottom sheet appears with a workspace selector.

4. **API call** — `POST /admin/pipeline-templates/:id/publish` with the target `workspaceId`.

5. **Result** — A `workspace_pipeline_views` row is created (or updated if already published) linking the template to the workspace. The workspace admin can now enable the view for their pipeline.

6. **Audit** — The action is logged in `workspace_admin_audit_log` via `logAdminAction`.

---

## 6. Completeness Scoring System

The completeness system evaluates master org records field-by-field, producing a score, health stage, and next-best-action recommendation.

### Field Weights

| Field | Weight | Critical | Vertical |
|-------|--------|---------|---------|
| Canonical Name | 15 | Yes | All |
| Website Domain | 15 | Yes | All |
| Industry | 10 | Yes | All |
| Account Structure Type | 10 | Yes | All |
| Validation Status (not Unvalidated) | 10 | No | All |
| Parent Relationship | 10 | No | All |
| Normalized Name | 5 | No | All |
| Confidence Score ≥ 0.6 | 5 | No | All |
| Ultimate Parent Mapped | 5 | No | All |
| Location (City/State) | 5 | No | All |
| Has Aliases | 5 | No | All |
| Facility Type | 5 | No | Healthcare only |
| UEI | 5 | No | GovCon only |

**Max score:** Sum of weights for applicable fields (vertical-specific fields excluded when industry doesn't match).  
**Percentage:** `Math.round((score / maxScore) * 100)`

### Health Stages

| Stage | Percentage Range | Meaning |
|-------|-----------------|---------|
| `INCOMPLETE` | < 30% | Critical fields missing; record is unusable for matching |
| `IDENTIFIED` | 30–59% | Basic identification present; structural/vertical data missing |
| `STRUCTURED` | 60–79% | Hierarchy and industry set; enrichment data incomplete |
| `STRATEGIC` | ≥ 80% | Record meets all completeness criteria |

### Next-Best-Action Priority Order

Actions are evaluated in priority order; the first matching condition is returned:

1. **HIGH** — `duplicate_suspect` admin flag → Resolve Duplicate
2. **HIGH** — Missing canonical name → Add Canonical Name
3. **HIGH** — Missing website domain → Add Website Domain
4. **HIGH** — Missing industry → Set Industry
5. **HIGH** — Missing account structure type → Set Account Structure Type
6. **HIGH** — `structure_not_run` admin flag → Run Structure Scan
7. **MEDIUM** — Not standalone and no parent → Confirm Parent
8. **MEDIUM** — Validation status is `UNVALIDATED` → Validate Record
9. **MEDIUM** — Validation status is `REQUIRES_REVIEW` → Review Validation
10. **MEDIUM** — Not standalone, no ultimate parent → Map Ultimate Parent
11. **MEDIUM** — Healthcare industry, no facility type → Set Facility Type
12. **MEDIUM** — GovCon industry, no UEI → Add UEI
13. **LOW** — No aliases → Add Alias
14. **LOW** — Confidence score < 0.6 → Review Confidence
15. **LOW** — All criteria met → Record Complete

---

## 7. AI Enrichment System

### Overview

The AI enrichment system uses GPT-4o to suggest values for missing fields on master organization records. All suggestions are stored as `PENDING` and require explicit platform admin approval before any value is written to the database.

### Prompt Inputs

The generate endpoint builds a prompt containing:
- The org's `canonicalName`, `normalizedName`, `websiteDomain`, `industry`, `accountStructureType`, `subVertical`, `city`, `state`, current aliases
- For Healthcare industry: current healthcare overlay values + allowed values for each field
- For GovCon industry: current GovCon overlay values + format rules for each field
- The list of all missing field keys to populate

### Field Coverage

**Core fields:** `websiteDomain`, `industry`, `accountStructureType`, `subVertical`, `location` (city/state), `aliases`

**Healthcare Overlay fields** (prefix: `healthcare.`):
- `facilityType` — facility category (e.g. HOSPITAL, AMBULATORY_SURGERY_CENTER)
- `licensedBeds` — integer count (0 for non-inpatient)
- `traumaLevel` — e.g. LEVEL_I through LEVEL_IV or NONE
- `systemType` — e.g. ACADEMIC_MEDICAL_CENTER, COMMUNITY_HOSPITAL
- `ownershipModel` — e.g. FOR_PROFIT, NON_PROFIT, GOVERNMENT
- `careSetting` — e.g. INPATIENT, OUTPATIENT, BOTH

**GovCon Overlay fields** (prefix: `govcon.`):
- `uei` — SAM.gov 12-character Unique Entity Identifier
- `cageCode` — 5-character CAGE code
- `naicsCodes` — comma-separated NAICS codes
- `primeOrSub` — PRIME, SUB, or BOTH
- `contractVehicles` — comma-separated contract vehicle names
- `agencyAlignment` — primary agency focus (e.g. DoD, HHS, VA)

### Suggestion Lifecycle

```
PENDING → APPROVED  (admin taps Approve → writeback executes)
PENDING → REJECTED  (admin taps Reject → no writeback)
```

Re-running generation deletes stale `PENDING` suggestions for re-generated fields before inserting fresh ones.

### Approval Writeback Rules

| Field namespace | Target table | Writeback method |
|----------------|-------------|-----------------|
| `healthcare.*` | `master_org_healthcare_overlays` | Upsert (INSERT if no row, UPDATE if exists) |
| `govcon.*` | `master_org_govcon_overlays` | Upsert (INSERT if no row, UPDATE if exists) |
| Core fields | `master_organizations` | Direct UPDATE with field map |

JSONB array fields (`naicsCodes`, `contractVehicles`, `aliases`) are parsed from comma-separated suggestion strings into proper arrays before write.

---

## 8. Admin Console

The platform admin console lives under `/admin` paths within the Expo mobile app. It is entirely separate from the workspace user experience.

### Account Layers

> Credentials are stored in the application's secrets/environment configuration and are not documented here for security. Refer to the internal deployment runbook for login credentials.

| Layer | Login Path | Role |
|-------|----------|------|
| Platform Admin (Opportunity OS internal) | `/admin/login` | `business_super_admin` — manages entire platform, all templates, all client workspaces |
| Workspace Admin (client accounts) | `/` (normal app login) | `ADMIN` role in their workspace — manages workspace settings, pipeline views, team |
| Workspace Owner (client accounts) | `/` (normal app login) | `OWNER` role in their workspace |

**Key rule:** The designated platform admin account is the **only** account accepted at `/admin/login`. All workspace-level accounts are explicitly rejected there.

**Auth mechanism:** Admin login issues a separate `adminToken` JWT distinct from workspace JWTs. All admin routes verify this token via `platformAdminMiddleware`.

### Admin Console Screens

| Screen | Path | Purpose |
|--------|------|---------|
| Admin Login | `/admin/login` | Platform admin authentication |
| Admin Dashboard | `/admin/(tabs)/dashboard` | Platform overview — stats, recent activity |
| Template Manager | `/admin/(tabs)/templates` | List, create, edit, clone, archive, and publish pipeline view templates |
| New Template | `/admin/templates/new` | Create new pipeline view template |
| Template Detail | `/admin/templates/[id]` | Edit template + Publish to Workspace bottom sheet |
| Workspace Manager | `/admin/(tabs)/workspaces` | List all client workspaces |
| Workspace Support Panel | `/admin/workspaces/[workspaceId]` | 3-tab panel: Pipeline Views (enable/disable/default/reorder), Members (roles, admin assignment), Audit Log |
| Master Orgs List | `/admin/(tabs)/master-organizations` | Browse and filter master org directory; health stage dot per row; industry filter chips; ▶ Review session mode |
| Master Org Detail | `/admin/master-organizations/[id]` | 5-tab detail view: Details, Hierarchy, Overlays, Aliases, Audit; completeness card + next-action card + AI Suggest Updates |
| New Master Org | `/admin/master-organizations/new` | Create new master org record |
| Completeness Audit | `/admin/completeness-audit` | Sorted queue of master orgs by completeness score; stage filter chips; AI Enrich bulk action |
| AI Suggestions | `/admin/ai-suggestions` | Pending AI field suggestions: current vs. suggested value side-by-side; Approve / Reject per row |
| Workspace Coverage | `/admin/workspace-coverage` | Per-workspace org linkage stats: total, linked, unlinked, coverage %, health status |
| Diagnostics | `/admin/(tabs)/diagnostics` | Summary health tiles covering all diagnostic categories |
| Diagnostics — Confidence | `/admin/diagnostics/confidence` | Confidence score breakdown |
| Diagnostics — Domain | `/admin/diagnostics/domain` | Domain coverage analysis |
| Diagnostics — Duplicates | `/admin/diagnostics/duplicates` | Duplicate suspect review |
| Diagnostics — Relationships | `/admin/diagnostics/relationships` | Relationship coverage |
| Diagnostics — Structure | `/admin/diagnostics/structure` | Structure scan status overview |
| Logo Scan — New | `/admin/logo-scan/new` | Upload org logo/signage image to create/enrich master org |
| Logo Scan — Review | `/admin/logo-scan/[scanId]` | Review OCR output + Place candidates; approve or reject |
| Structure Scan Detail | `/admin/structure-scans/[id]` | Review structure scan results; approve or reject hierarchy suggestion |

### Guarded Actions

| Action | Requirement |
|--------|------------|
| Access any `/admin/*` screen | Must be authenticated with admin JWT (`adminToken`) |
| Change member role | Must not reduce admin count below 1 in workspace |
| Remove member | Must not reduce admin count below 1 in workspace |
| Edit locked template field | Blocked — locked templates cannot be modified |
| Approve AI suggestion | Platform admin explicit action only; no auto-approval |
| Write to master org database | Only via explicit API calls with verified admin JWT |

---

## 9. Mobile Screen Inventory

### Public / Auth Screens

| Route Path | Purpose |
|-----------|---------|
| `app/(public)/index.tsx` | Landing / marketing page |
| `app/(public)/pricing.tsx` | Pricing page |
| `app/(public)/demo.tsx` | Demo request page |
| `app/(auth)/login.tsx` | Workspace user login |
| `app/(auth)/signup.tsx` | Workspace user signup |
| `app/(auth)/forgot-password.tsx` | Password reset flow |

### Standard App Screens (Workspace User)

| Route Path | Purpose |
|-----------|---------|
| `app/(tabs)/dashboard.tsx` | Dashboard — 6 stat cards, quick actions, activity feed |
| `app/(tabs)/contacts.tsx` | Contact list with search, tags, status filters, saved views |
| `app/(tabs)/organizations.tsx` | Org list with 11 saved views, hierarchy indicators, vertical filter |
| `app/(tabs)/opportunities.tsx` | Kanban pipeline board (horizontal scroll, grouped by stage) |
| `app/(tabs)/cards.tsx` | Business card scanner list + upload |
| `app/(tabs)/tasks.tsx` | Task list with status and priority filters |
| `app/(tabs)/settings.tsx` | Settings — includes Workspace Settings section for OWNER/ADMIN |
| `app/contact/[id].tsx` | Contact detail + edit |
| `app/contact/new.tsx` | Create new contact |
| `app/organization/[id].tsx` | Org detail — hierarchy, contacts, opportunities, EMS profile card |
| `app/organization/new.tsx` | Create new organization |
| `app/opportunity/[id].tsx` | Opportunity detail — EMS Transport Profile card if EMS pipeline |
| `app/opportunity/new.tsx` | Create new opportunity |
| `app/card/[id].tsx` | Business card review / approve flow (PHI warning, editable fields) |
| `app/org-scan/new.tsx` | Upload org logo/signage image (workspace-level org enrichment flow) |
| `app/org-scan/[id].tsx` | Review org scan — OCR output, Place candidates, approve or reject |
| `app/org-scan/structure/[id].tsx` | Review structure scan result for an org scan — approve or reject hierarchy suggestion |
| `app/workspace/pipelines.tsx` | Pipeline Views admin (OWNER/ADMIN only — toggle, default, reorder) |
| `app/workspace/team.tsx` | Team & Roles admin (OWNER/ADMIN only — role change, remove, invite) |
| `app/workspace/access-restricted.tsx` | Access denied fallback screen |

### Admin Console Screens

| Route Path | Purpose |
|-----------|---------|
| `app/admin/login.tsx` | Platform admin login |
| `app/admin/(tabs)/dashboard.tsx` | Admin dashboard — platform-wide stats and recent structure scans |
| `app/admin/(tabs)/master-organizations.tsx` | Master org list with health stage indicators and review mode |
| `app/admin/(tabs)/diagnostics.tsx` | Diagnostics dashboard with health summary tiles |
| `app/admin/(tabs)/templates.tsx` | Pipeline view template manager |
| `app/admin/(tabs)/workspaces.tsx` | Client workspace list |
| `app/admin/master-organizations/[id]/index.tsx` | Master org 5-tab detail (Details, Hierarchy, Overlays, Aliases, Audit) |
| `app/admin/master-organizations/new.tsx` | Create new master org |
| `app/admin/templates/[id].tsx` | Edit template + publish to workspace bottom sheet |
| `app/admin/templates/new.tsx` | Create new template |
| `app/admin/workspaces/[workspaceId]/index.tsx` | Workspace support panel (3 tabs: Pipeline Views, Members, Audit Log) |
| `app/admin/completeness-audit.tsx` | Completeness audit queue |
| `app/admin/ai-suggestions.tsx` | AI enrichment suggestion review queue |
| `app/admin/workspace-coverage.tsx` | Per-workspace org linkage coverage breakdown |
| `app/admin/diagnostics/confidence.tsx` | Confidence score diagnostic detail |
| `app/admin/diagnostics/domain.tsx` | Domain coverage diagnostic detail |
| `app/admin/diagnostics/duplicates.tsx` | Duplicate suspect diagnostic detail |
| `app/admin/diagnostics/relationships.tsx` | Relationship coverage diagnostic detail |
| `app/admin/diagnostics/structure.tsx` | Structure scan status diagnostic detail |
| `app/admin/logo-scan/new.tsx` | Upload org logo image to create/enrich master org |
| `app/admin/logo-scan/[scanId].tsx` | Review logo scan OCR + Place candidates; approve or reject |
| `app/admin/structure-scans/[id].tsx` | Review structure scan results; approve or reject hierarchy suggestion |

---

*End of Opportunity OS Schema & Workflow Reference — April 2026*
