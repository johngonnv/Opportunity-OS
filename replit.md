# Workspace

## Overview

pnpm workspace monorepo using TypeScript. **Opportunity OS** — a full-stack mobile CRM app for healthcare/GovCon relationship and sales pipeline management.

## App: Opportunity OS

**Target users:** Healthcare and GovCon relationship managers.

**Design:** Dark midnight navy (`#0B1220`) + emerald green (`#10B981`) branding. Inter font throughout.

**Auth:** No real auth — uses demo user pattern (`demo@opportunityos.com`) auto-created on first request via `getCurrentWorkspace()` helper.

### Features Built
- Dashboard with 6 stat cards + quick actions + recent activity feed
- Contacts CRUD with search, tags, org linking, status, saved views
- Organizations CRUD with universal hierarchy, enterprise selling model, vertical-neutral architecture
  - Account structure types: enterprise, parent, regional, local_entity
  - Verticals: healthcare, govcon, general_business, government, nonprofit, vendor, other
  - Full hierarchy with parent/child/ultimate-parent relationships
  - Roll-up stats: contacts, opportunities, pipeline value, won value across hierarchy
  - Hierarchy tools: set parent, link child, unlink child
  - 11 saved views: All, Enterprise, Parent Accounts, Regionals, Local Entities, No Parent, Has Children, Healthcare, GovCon, General Biz, Government
  - Vertical-aware labels (Healthcare → "Hospitals", GovCon → "Business Units", etc.)
  - Account profile: strategic tier, MSA status, expansion strategy/maturity, decision level
- Opportunities Kanban pipeline (horizontal scroll board grouped by stage)
- Business Card scanner (camera/gallery upload → review → approve to create contact)
- Tasks with status filters, priority, due date overdue detection
- Activities feed
- PHI warning in card review form
- Full backend: contacts, organizations, businessCards, tasks, activities, opportunities, pipelines, notes, tags, reports

### EMS Vertical Overlay (Nevada Ground EMS / City of Las Vegas jurisdiction)
- New DB tables: `opportunity_ems_interfacility_profiles` (22 columns: service mix booleans, transport metrics, payer mix, agreement status, go-live tracking) and `organization_ems_profiles` (7 columns)
- New EMS pipeline "Interfacility Transport" (category="EMS") with 8 stages: Prospect/Lead → Discovery → Director Engaged → Agreement Alignment → Contract Review → Pending Go-Live → Active Account → Closed/Won
- New API routes: `GET/POST/PUT /api/ems/opportunities/:id/ems-profile` and `GET/PUT /api/ems/organizations/:id/ems-profile`
- Enhanced `GET /api/opportunities/:id` to include `emsProfile` and `pipeline.category`
- Enhanced `GET /api/opportunities` to support `emsView` query param for EMS-specific filtering (inJurisdiction, directorEngaged, discoveryIncomplete, agreementAlignment, goLive, activeAccounts, outOfTerritory)
- Mobile: EMS saved views strip (8 filter chips, DraggableScrollView) visible only when current pipeline has `category === "EMS"`
- Mobile: EMS Transport Profile card on opportunity detail screen with jurisdiction badges, transport stats, service mix chips, payer mix breakdown, agreement info, timeline tracking

### Seed Data
- 2 pipelines (auto-seeded on first workspace creation): Relationship Pipeline (7 stages) + Sales Pipeline (8 stages)
- 1 EMS pipeline (seeded via `lib/db/src/seed-ems.ts`): Interfacility Transport (8 stages)
- 6 tags: healthcare, govcon, hot_lead, case_management, hospital, teaming_partner

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo Router, React Query, @expo/vector-icons, Inter font

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (port 8080)
│   └── mobile/             # Expo React Native app
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## Database Schema

Tables: users, workspaces, workspace_members, organizations, contacts, tags, contact_tags, organization_tags, business_cards, activities, tasks, pipelines, pipeline_stages, opportunities, opportunity_contacts, notes, audit_logs, pipeline_view_templates, workspace_pipeline_views, workspace_pipeline_view_permissions, workspace_admin_audit_log, organization_scans

### Post-Provision Day 1 Experience

After provisioning a workspace, admins can trigger the Day 1 Experience via the "Initialize Day 1 & Launch" button on the provision screen:

**Backend — `artifacts/api-server/src/routes/adminDay1.ts`** (registered under `/admin/workspaces`):
- `POST /admin/workspaces/:workspaceId/day1-init` — idempotent init; creates 6 real high-priority tasks (due 2–7 days), 1 opportunity seed linked to first pipeline stage, ensures 6 saved views (Hospitals, SNFs, Event Venues, High Priority Targets, Missing Buyer Roles, GovCon Ready), sets a `day1_initialized` marker in `workspace_intelligence`
- `GET /admin/workspaces/:workspaceId/day1-summary` — returns engagement metrics (tasks completed, contacts, activities, opportunities), primary action card (why + expected impact), intelligence panel data (competitors, pain points, positioning), warning→action mappings, Day 1 tasks list, saved views

**Mobile screens:**
- `artifacts/mobile/app/workspace/[id]/launch.tsx` — activation summary screen (admin-facing); animated 4-tile grid showing pipelines/views/tasks/opportunities created, setup checklist, "Open Priority Dashboard" CTA
- `artifacts/mobile/app/dashboard/priority.tsx` — Day 1 Mission Control dashboard; engagement tracker bars, Primary Action Card (amber hero), warning→action list with severity routing, tabbed intelligence panel (Competitors / Pain Points / Positioning), saved view chips, Day 1 task list with completion status, "Go to Main App" CTA

**Warning → Action Map (8 scenarios):**
no_contacts, no_activity, missing_buyer_roles, competitor_risk, stalled_pipeline, low_confidence, govcon_gaps, no_pipeline — each maps to a specific next step and in-app route

**Rules enforced:**
- Workspace never shows empty state after Day 1 init
- System suggests primary revenue action immediately on load
- All actions include "why" context and expected impact
- Mobile-first responsive card layout throughout

### Pipeline View Template System (Task 9)
- `pipeline_view_templates`: Master template library (key, name, vertical, sub_vertical, status enum [draft/active/inactive/archived], is_locked, is_client_editable, config_json, created_by_user_id, updated_by_user_id)
- `workspace_pipeline_views`: Per-workspace view enablement (template_id FK, workspace_id FK, pipeline_id FK, is_enabled, is_default, sort_order, visibility_scope, settings_json)
- `workspace_pipeline_view_permissions`: User/role-level access (workspace_pipeline_view_id FK, user_id FK, role, permission)
- `workspace_admin_audit_log`: Platform support audit trail (changedAt, action, entityType, entityId, previousValue, newValue, platformSupportAction, notes)
- `users` table now has `is_platform_admin` boolean column
- `organizations` table enrichment columns added (Task 15): `google_place_id`, `formatted_address`, `website_domain`, `latitude`, `longitude`, `place_category`, `last_enriched_at`, `enrichment_source`
- `organization_scans` table (Task 15): `id`, `workspace_id`, `uploaded_by_user_id`, `organization_id` (nullable FK), `image_url`, `raw_ocr_text`, `parsed_business_name`, `ocr_confidence`, `matched_place_json` (jsonb), `selected_match_json` (jsonb), `processing_status` (enum: UPLOADED/PARSING/PARSED/MATCHED/FAILED), `review_status` (enum: PENDING_REVIEW/APPROVED/REJECTED)
- `activity_type` enum extended with `LOGO_SCAN` and `ORG_ENRICHMENT` (Task 15)

### Required Secrets (beyond DB)
- `GOOGLE_PLACES_API_KEY` — Google Places API (New) key. Used by `POST /organization-scans/:id/match`. Without it, match returns 503; all other org-scan endpoints still work.
- `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI Integration proxy for GPT-4o OCR (business cards + logo scans)

- Seeded: `ems_interfacility_transport_v1` template → published to EMS workspace (e7a4042c-9839-4faa-a1c2-b534f4ee89a8)

### Master Database Promotion Workflow (Task 31)

**Schema additions:**
- `master_contacts` table: FK to `master_organizations`, full contact fields (fullName, firstName, lastName, title, department, email, phone, mobile, linkedinUrl, confidenceScore, validationStatus, sourceWorkspaceId, sourceContactId, promotedByAdminUserId, promotedAt)
- `master_promotion_queue` table: entityType (ORG/CONTACT/NOTE enum), entityId, workspaceId, changeType (CREATED/UPDATED/NOTE_ADDED enum), status (PENDING/APPROVED_NEW/APPROVED_MERGE/APPROVED_LINK/REJECTED enum), sourceSnapshot (jsonb), resolvedMasterId, rejectionReason, resolvedByUserId, resolvedAt
- `contacts.master_contact_id` FK column added
- Enums: `promotion_entity_type`, `promotion_change_type`, `promotion_status` (created via direct SQL due to Drizzle push drift on unrelated table)

**Auto-queue triggers:** `contacts.ts` (POST/PATCH), `organizations.ts` (POST/PUT), `notes.ts` (POST/PUT) all call `enqueuePromotion()` which upserts PENDING rows (deduplicates by entityId+entityType)

**Admin API routes (`/admin/master-promotion`):**
- `GET /queue/counts` — pending counts by entity type
- `GET /queue` — paginated queue with filters (entityType, status, workspaceId)
- `GET /suggest-match` — fuzzy match suggestions (ORG/CONTACT lookups)
- `POST /:id/approve-new` — creates new master record + links workspace entity
- `POST /:id/approve-merge` — merges data into existing master + links workspace entity
- `POST /:id/approve-link` — link only (no data change)
- `POST /:id/reject` — reject with optional reason

**Mobile admin screens:**
- `app/admin/diagnostics/org-promotions.tsx` — org promotion queue with approve-new/merge/link/reject
- `app/admin/diagnostics/contact-promotions.tsx` — contact promotion queue (warns if parent org not linked)
- `app/admin/diagnostics/note-promotions.tsx` — note activity queue (dismiss or reject)
- `app/admin/(tabs)/diagnostics.tsx` — Promotion Queue section added with 3 tiles + live counts

**Key invariant:** Contacts cannot be approved-as-new until parent org is linked to master. `approve-new` for CONTACT returns 409 MISSING_ORG_LINK if org has no masterOrganizationId.

### Master Organization Intelligence Layer (Tasks 22–25+)

**Schema additions to `master_organizations`:**
- 10 new columns: `display_name`, `industry` (enum: HEALTHCARE/GOVCON/TECHNOLOGY/FINANCE/EDUCATION/NONPROFIT/OTHER), `account_structure_type` (enum: STANDALONE/PARENT/SUBSIDIARY/DIVISION/FRANCHISE/JOINT_VENTURE), `is_standalone`, `confidence_score`, `validation_status` (enum: PENDING/VERIFIED/FLAGGED/REJECTED), `city`, `state`, `country`, `structure_last_scanned_at`

**4 new tables:**
- `master_organization_aliases` — alternate names for fuzzy matching
- `master_org_healthcare_overlays` — healthcare vertical: facilityType, licensedBeds, traumaLevel, systemType, ownershipModel, careSetting
- `master_org_govcon_overlays` — GovCon vertical: uei, cageCode, naicsCodes[], primeOrSub, contractVehicles[], agencyAlignment
- `master_org_ai_suggestions` — AI-generated field suggestions with PENDING/APPROVED/REJECTED status; approved suggestions write back to master org; no silent updates

**Admin API routes (`/admin/master-organizations`):**
- `GET /suggest-link` — fuzzy match engine: given orgName+domain, returns top-5 master org candidates with confidence score + band (HIGH/MEDIUM/LOW); registered **before** `/:id` route
- `GET /completeness-audit` — all orgs with completeness score + health stage (INCOMPLETE/IDENTIFIED/STRUCTURED/STRATEGIC), sortable
- `GET /` — list with filters: search, sourceType, industry, validationStatus, page/limit
- `POST /` — create with all new fields
- `GET|PUT|DELETE /:id` — full CRUD with all fields
- `GET /:id/completeness` — field-by-field completeness checklist + health stage + next best action
- `GET /:id/next-action` — next best admin action (computed from missing fields + flags)
- `GET /:id/aliases` / `POST /:id/aliases` / `DELETE /:id/aliases/:aliasId` — alias management
- `PUT /:id/healthcare-overlay` — upsert healthcare overlay
- `PUT /:id/govcon-overlay` — upsert GovCon overlay
- `GET /:id/siblings` — sibling orgs (same parent)
- `GET /:id/ultimate-parent` — resolver chain walk to root
- `PATCH /:id/validation-status` — update validation status only
- `POST /:id/structure-scan` — clear structure_not_run flag, stamp timestamp
- `DELETE /:id/relationships/:relId` — remove a relationship

**Admin API routes (`/admin/ai-suggestions`):**
- `GET /` — list AI suggestions (filter by status: PENDING/APPROVED/REJECTED/ALL; filter by orgId)
- `POST /:orgId/generate` — trigger OpenAI to generate field suggestions for missing fields; stores suggestions as PENDING
- `POST /:id/approve` — approve suggestion + write value back to master org
- `POST /:id/reject` — reject suggestion without writeback

**Admin API routes (`/admin/diagnostics`):**
- `GET /summary` — database health summary (now includes missingDomain, missingIndustry, unvalidated, pendingAiSuggestions, unlinkedWorkspaceOrgs)
- `GET /workspace-coverage` — per-workspace org linkage breakdown (total, linked, unlinked, coverage%, healthStatus: GOOD/PARTIAL/LOW)
- `GET /unlinked-orgs` — queue of workspace orgs with no master link

**Server utility (`api-server/src/lib/completeness.ts`):**
- `computeCompleteness(org)` — field-by-field scoring with weights; returns score, maxScore, percentage, healthStage, fields[], missingCritical[]
- `computeNextBestAction(org, completeness)` — priority-ordered next best action determination
- Health stages: INCOMPLETE (<30%) → IDENTIFIED (30-59%) → STRUCTURED (60-79%) → STRATEGIC (≥80%)

**Mobile admin screens:**
- `master-organizations.tsx` list: health stage color dot per row, industry filter chips, "▶ Review" toolbar button, session seeding on tap
- `master-organizations/[id]/index.tsx` detail: 5 tabs + completeness checklist card + health stage badge + next best action card + AI Suggest Updates button in DetailsTab
- `completeness-audit.tsx` — completeness audit queue with stage filter chips + score bar + review-all button
- `ai-suggestions.tsx` — AI enrichment queue: pending suggestions with Approve/Reject actions, current vs suggested value side-by-side
- `workspace-coverage.tsx` — per-workspace coverage breakdown with progress bars and linkage stats
- Diagnostics tab: new "Completeness & Enrichment" and "Workspace Coverage" tile sections

**Product rules enforced:**
- AI can suggest field values; AI cannot silently write to master database
- All approved suggestions are logged (reviewed_at, reviewed_by_user_id)
- `suggestedValue` is only applied to master org on explicit admin approval

## Admin Console

The platform admin console lives at `/admin` paths in the mobile Expo app.

### Admin Account Layers

| Layer | Email | Password | Login Path | Role |
|-------|-------|----------|------------|------|
| **Platform Admin** (Opportunity OS internal) | `admin@opportunityos.com` | `OppOS_Admin2024!` | `/admin/login` | `business_super_admin` — manages entire platform, templates, all client workspaces |
| **Workspace Admin** (Golden Age GovCon client) | `admin@goldenagegovcon.com` | `GoldenAge2024!` | `/` (normal app login) | `ADMIN` in Golden Age GovCon workspace — manages workspace settings, pipeline views, team |
| **Workspace Owner** (Golden Age GovCon) | `john@goldenagegovcon.com` | `Test123` | `/` (normal app login) | `OWNER` of Golden Age GovCon workspace |

**Key rule:** `admin@opportunityos.com` is the ONLY true platform admin. `admin@goldenagegovcon.com` is a client workspace admin — it is explicitly rejected at `/admin/login`.

- `/admin/login` — Platform admin login (stores JWT separately as `adminToken`)
- `/admin/templates` — Template Manager: list, create, edit, clone, archive, publish
- `/admin/templates/new` — Create new pipeline view template
- `/admin/templates/[id]` — Edit template + Publish to Workspace bottom sheet
- `/admin/workspaces` — Client Workspace Manager list
- `/admin/workspaces/[workspaceId]` — Workspace Support Panel with 3 tabs:
  - Pipeline Views: enable/disable, set default, reorder, visibility toggles
  - Members: view roles, assign/correct workspace_admin role (with min-1-admin guard)
  - Audit Log: view recent `workspace_admin_audit_log` entries (uses `changedAt`, `previousValue`, `newValue`, `platformSupportAction`)

Admin API routes under `/api/admin`:
- `POST /admin/auth/login` — Admin login (signs admin JWT, separate from workspace JWT)
- `GET /admin/me` — Get current admin profile
- `GET/POST /admin/pipeline-templates` — List / create templates (via `adminPipelineTemplates` with Zod validation + status transition guards)
- `GET/PUT/DELETE /admin/pipeline-templates/:id` — Get / update / delete template
- `POST /admin/pipeline-templates/:id/publish` — Publish template to workspace
- `GET /admin/workspaces` — List all workspaces with member/admin/view counts
- `GET /admin/workspaces/:workspaceId` — Get workspace details
- `GET /admin/workspaces/:workspaceId/pipeline-views` — List pipeline views
- `PUT /admin/workspaces/:workspaceId/pipeline-views/:viewId` — Update pipeline view (logs via `logAdminAction`)
- `GET /admin/workspaces/:workspaceId/members` — List workspace members with user details
- `DELETE /admin/workspaces/:workspaceId/members/:userId` — Remove member (min-admin guard)
- `PUT /admin/workspaces/:workspaceId/members/:memberId/role` — Update member role (logs via `logAdminAction`)
- `GET /admin/workspaces/:workspaceId/audit-log` — List audit log entries with `changedByName`

## API Routes

All routes under `/api`:
- `GET/POST /contacts` + `GET/PUT/DELETE /contacts/:id`
- `GET/POST /organizations` + `GET/PUT/DELETE /organizations/:id` + `POST /organizations/:id/link-child|unlink-child`
- `GET/POST /business-cards` + `GET/PUT /business-cards/:id` + `POST /business-cards/:id/parse|approve|reject`
- `POST /organization-scans/upload` — multipart image upload → GCS → creates scan record → returns `{ id, imageUrl, scan }` (single endpoint; no separate create route)
- `GET /organization-scans` — list scans (optional `?organizationId=` filter; org join workspace-constrained)
- `GET /organization-scans/:id` — get scan (includes linked org name; org join workspace-constrained)
- `POST /organization-scans/:id/parse` — GPT-4o vision OCR for business name extraction; malformed model output → status FAILED
- `POST /organization-scans/:id/match` — Google Places API (New, v1) text search; optional `{ latitude, longitude }` for location bias; stores up to 5 ranked candidates (processing_status enum includes PARSING as intermediate)
- `POST /organization-scans/:id/approve` — create new org OR enrich existing org (non-destructive merge + `forceFields[]` override); logs LOGO_SCAN or ORG_ENRICHMENT activity + audit log
- `POST /organization-scans/:id/reject` — marks scan REJECTED (preserves record)
- `GET/POST /tasks` + `GET/PUT/DELETE /tasks/:id`
- `GET/POST /activities` + `PUT/DELETE /activities/:id`
- `GET/POST /opportunities` + `GET/PUT/DELETE /opportunities/:id`
- `GET /pipelines`
- `GET/POST /admin/pipeline-templates` (platform admin only)
- `GET/PUT/DELETE /admin/pipeline-templates/:id` (platform admin only)
- `POST /admin/pipeline-templates/:id/publish` (platform admin only; publishes to workspace)
- `GET /workspaces/:workspaceId/pipeline-views` (workspace member)
- `PUT /workspaces/:workspaceId/pipeline-views/:id` (workspace member; blocks locked template fields)
- `GET /workspaces/:workspaceId/members` (workspace member — lists all members with user info)
- `PUT /workspaces/:workspaceId/members/:userId` (workspace admin — change role; min-1-admin enforced)
- `DELETE /workspaces/:workspaceId/members/:userId` (workspace admin — remove; min-1-admin enforced)
- `POST /workspaces/:workspaceId/invites` (workspace admin — invite by email; if user exists, adds directly)
- `POST /notes` + `PUT/DELETE /notes/:id`
- `GET/POST /tags`
- `GET /reports/dashboard` + `GET /reports/activities`

## Mobile Screens

- `app/(tabs)/index.tsx` — Dashboard
- `app/(tabs)/contacts.tsx` — Contact list
- `app/(tabs)/organizations.tsx` — Org list
- `app/(tabs)/opportunities.tsx` — Kanban pipeline board
- `app/(tabs)/cards.tsx` — Business card scanner + list
- `app/(tabs)/tasks.tsx` — Task list with filters
- `app/(tabs)/settings.tsx` — Settings (includes Workspace Settings section for OWNER/ADMIN)
- `app/contact/[id].tsx` + `app/contact/new.tsx`
- `app/organization/[id].tsx` + `app/organization/new.tsx`
- `app/opportunity/[id].tsx` + `app/opportunity/new.tsx`
- `app/card/[id].tsx` — Card review/approve flow
- `app/workspace/pipelines.tsx` — Pipeline Views admin (OWNER/ADMIN only; toggle, default, reorder, view details)
- `app/workspace/team.tsx` — Team & Roles admin (OWNER/ADMIN only; role change, remove, invite)
- `app/workspace/access-restricted.tsx` — Access denied fallback screen

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
