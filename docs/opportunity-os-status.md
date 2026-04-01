# Opportunity OS — Project Status Document

> Generated: April 1, 2026  
> Platform: Expo React Native (iOS / Android / Web) + Node/Express API + PostgreSQL  
> Design system: Dark navy `#0B1220` + Emerald green `#10B981` · Inter font

---

## Section 1 — Database Schema

### Enum Types

| Enum Name | Values |
|---|---|
| `workspace_role` | OWNER · ADMIN · MEMBER |
| `contact_status` | NEW · REVIEWED · ACTIVE · INACTIVE |
| `organization_type` | HOSPITAL · HEALTH_SYSTEM · HOSPICE · HOME_HEALTH · GOVERNMENT_AGENCY · PRIME_CONTRACTOR · SUBCONTRACTOR · CONSULTANT · VENDOR · OTHER |
| `organization_level` | enterprise · group · facility |
| `account_structure_type` | enterprise · parent · regional · local_entity |
| `org_vertical` | healthcare · govcon · general_business · government · nonprofit · vendor · other |
| `primary_decision_level` | enterprise · parent · regional · local |
| `activity_type` | CALL · EMAIL · MEETING · CARD_SCAN · NOTE · FOLLOW_UP · EVENT · INTRO |
| `task_priority` | LOW · MEDIUM · HIGH |
| `task_status` | OPEN · IN_PROGRESS · COMPLETED · CANCELED |
| `opportunity_status` | OPEN · WON · LOST · ON_HOLD |
| `opportunity_vertical` | HEALTHCARE · GOVCON · CONSULTING · PARTNERSHIP |
| `card_processing_status` | UPLOADED · PARSING · PARSED · FAILED |
| `card_review_status` | PENDING_REVIEW · APPROVED · REJECTED · MERGED |

---

### Table: `users`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `first_name` | text | nullable | |
| `last_name` | text | nullable | |
| `email` | text | NOT NULL | unique |
| `password_hash` | text | nullable | bcrypt |
| `auth_provider_id` | text | nullable | unique · OAuth future |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `workspaces`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `name` | text | NOT NULL | |
| `industry_focus` | text | nullable | |
| `owner_user_id` | text | NOT NULL | FK → users.id (cascade delete) |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `workspace_members`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `user_id` | text | NOT NULL | FK → users.id (cascade delete) |
| `role` | workspace_role | NOT NULL | default MEMBER |
| `created_at` | timestamp | NOT NULL | defaultNow |

---

### Table: `plans`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `name` | text | NOT NULL | e.g. "Independent", "Business", "Enterprise" |
| `slug` | text | NOT NULL | unique · e.g. "independent", "business" |
| `features` | jsonb | nullable | feature flags object |
| `created_at` | timestamp | NOT NULL | defaultNow |

Seeded tiers: Independent ($29/mo) · Business ($79/mo) · Enterprise (contact us)

---

### Table: `subscriptions`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `plan_id` | text | NOT NULL | FK → plans.id |
| `status` | text | NOT NULL | default "active" |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `organizations`

Enums used: `organization_type`, `organization_level`, `account_structure_type`, `org_vertical`, `primary_decision_level`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `parent_organization_id` | text | nullable | Self-ref FK → organizations.id (set null) |
| `ultimate_parent_organization_id` | text | nullable | Self-ref FK → organizations.id (set null) · auto-propagated |
| `organization_level` | organization_level | nullable | default facility |
| `account_structure_type` | account_structure_type | nullable | |
| `vertical` | org_vertical | nullable | |
| `primary_decision_level` | primary_decision_level | nullable | |
| `name` | text | NOT NULL | |
| `legal_name` | text | nullable | |
| `website` | text | nullable | |
| `phone` | text | nullable | |
| `email` | text | nullable | |
| `organization_type` | organization_type | NOT NULL | default OTHER |
| `industry` | text | nullable | |
| `sub_industry` | text | nullable | |
| `sub_vertical` | text | nullable | |
| `region_name` | text | nullable | |
| `msa_status` | text | nullable | |
| `system_priority_tier` | text | nullable | |
| `expansion_strategy` | text | nullable | |
| `expansion_maturity` | text | nullable | |
| `strategic_tier` | text | nullable | |
| `address_line1` | text | nullable | |
| `address_line2` | text | nullable | |
| `city` | text | nullable | |
| `state` | text | nullable | |
| `zip` | text | nullable | |
| `country` | text | nullable | |
| `notes_text` | text | nullable | |
| `owner_user_id` | text | nullable | FK → users.id (set null) |
| `outreach_owner_user_id` | text | nullable | FK → users.id (set null) |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `contacts`

Enum used: `contact_status`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `organization_id` | text | nullable | FK → organizations.id (set null) |
| `first_name` | text | nullable | |
| `last_name` | text | nullable | |
| `full_name` | text | NOT NULL | |
| `title` | text | nullable | |
| `department` | text | nullable | |
| `email` | text | nullable | |
| `phone` | text | nullable | |
| `mobile` | text | nullable | |
| `linkedin_url` | text | nullable | |
| `source` | text | nullable | |
| `source_detail` | text | nullable | |
| `status` | contact_status | NOT NULL | default NEW |
| `notes_text` | text | nullable | |
| `owner_user_id` | text | nullable | FK → users.id (set null) |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `tags`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `name` | text | NOT NULL | UNIQUE(workspace_id, name) |
| `color` | text | nullable | |
| `category` | text | nullable | |
| `created_at` | timestamp | NOT NULL | defaultNow |

---

### Table: `contact_tags`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `contact_id` | text | NOT NULL | FK → contacts.id (cascade delete) |
| `tag_id` | text | NOT NULL | FK → tags.id (cascade delete) |
| | | | UNIQUE(contact_id, tag_id) |

---

### Table: `organization_tags`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `organization_id` | text | NOT NULL | FK → organizations.id (cascade delete) |
| `tag_id` | text | NOT NULL | FK → tags.id (cascade delete) |
| | | | UNIQUE(organization_id, tag_id) |

---

### Table: `pipelines`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `name` | text | NOT NULL | |
| `category` | text | nullable | |
| `created_at` | timestamp | NOT NULL | defaultNow |

---

### Table: `pipeline_stages`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `pipeline_id` | text | NOT NULL | FK → pipelines.id (cascade delete) |
| `name` | text | NOT NULL | |
| `stage_order` | integer | NOT NULL | UNIQUE(pipeline_id, stage_order) |
| `probability_percent` | integer | NOT NULL | default 0 |
| `created_at` | timestamp | NOT NULL | defaultNow |

---

### Table: `opportunities`

Enums used: `opportunity_status`, `opportunity_vertical`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `pipeline_id` | text | NOT NULL | FK → pipelines.id (cascade delete) |
| `pipeline_stage_id` | text | NOT NULL | FK → pipeline_stages.id (restrict delete) |
| `organization_id` | text | nullable | FK → organizations.id (set null) |
| `primary_contact_id` | text | nullable | FK → contacts.id (set null) |
| `title` | text | NOT NULL | |
| `description` | text | nullable | |
| `vertical` | opportunity_vertical | NOT NULL | default CONSULTING |
| `value_estimate` | double precision | nullable | |
| `close_date_estimate` | timestamp | nullable | |
| `status` | opportunity_status | NOT NULL | default OPEN |
| `score` | integer | nullable | |
| `source` | text | nullable | |
| `owner_user_id` | text | nullable | FK → users.id (set null) |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `opportunity_contacts`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `opportunity_id` | text | NOT NULL | FK → opportunities.id (cascade delete) |
| `contact_id` | text | NOT NULL | FK → contacts.id (cascade delete) |
| `relationship_role` | text | nullable | |
| | | | UNIQUE(opportunity_id, contact_id) |

---

### Table: `activities`

Enum used: `activity_type`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `contact_id` | text | nullable | FK → contacts.id (set null) |
| `organization_id` | text | nullable | FK → organizations.id (set null) |
| `opportunity_id` | text | nullable | Loose FK (no constraint) |
| `type` | activity_type | NOT NULL | |
| `subject` | text | NOT NULL | |
| `description` | text | nullable | |
| `occurred_at` | timestamp | NOT NULL | defaultNow |
| `created_by_user_id` | text | nullable | FK → users.id (set null) |
| `created_at` | timestamp | NOT NULL | defaultNow |

---

### Table: `tasks`

Enums used: `task_priority`, `task_status`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `contact_id` | text | nullable | FK → contacts.id (set null) |
| `organization_id` | text | nullable | FK → organizations.id (set null) |
| `opportunity_id` | text | nullable | Loose FK (no constraint) |
| `title` | text | NOT NULL | |
| `description` | text | nullable | |
| `due_date` | timestamp | nullable | |
| `priority` | task_priority | NOT NULL | default MEDIUM |
| `status` | task_status | NOT NULL | default OPEN |
| `assigned_to_user_id` | text | nullable | FK → users.id (set null) |
| `created_by_user_id` | text | nullable | FK → users.id (set null) |
| `completed_at` | timestamp | nullable | |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `notes`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `contact_id` | text | nullable | FK → contacts.id (set null) |
| `organization_id` | text | nullable | FK → organizations.id (set null) |
| `opportunity_id` | text | nullable | Loose FK (no constraint) |
| `content` | text | NOT NULL | |
| `created_by_user_id` | text | nullable | FK → users.id (set null) |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `business_cards`

Enums used: `card_processing_status`, `card_review_status`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `uploaded_by_user_id` | text | nullable | FK → users.id (set null) |
| `image_url_front` | text | NOT NULL | GCS object path |
| `image_url_back` | text | nullable | GCS object path |
| `raw_ocr_text` | text | nullable | GPT-4o Vision raw output |
| `parsed_json` | jsonb | nullable | Structured parsed fields |
| `processing_status` | card_processing_status | NOT NULL | default UPLOADED |
| `review_status` | card_review_status | NOT NULL | default PENDING_REVIEW |
| `linked_contact_id` | text | nullable | FK → contacts.id (set null) · set on approve |
| `linked_organization_id` | text | nullable | FK → organizations.id (set null) · set on approve |
| `created_at` | timestamp | NOT NULL | defaultNow |
| `updated_at` | timestamp | NOT NULL | defaultNow · auto-update |

---

### Table: `audit_logs`

| Column | Type | Nullable | Default / Notes |
|---|---|---|---|
| `id` | text | NOT NULL | PK · UUID (auto) |
| `workspace_id` | text | NOT NULL | FK → workspaces.id (cascade delete) |
| `user_id` | text | nullable | FK → users.id (set null) |
| `entity_type` | text | NOT NULL | e.g. "contact", "organization" |
| `entity_id` | text | NOT NULL | |
| `action` | text | NOT NULL | e.g. "create", "update", "delete" |
| `before_json` | jsonb | nullable | State before change |
| `after_json` | jsonb | nullable | State after change |
| `created_at` | timestamp | NOT NULL | defaultNow |

---

## Section 2 — API Workflow Map

All routes require JWT Bearer token (`Authorization: Bearer <token>`) unless noted as public.

### Auth (`/api/auth`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Password login; returns JWT + user + workspace + plan |
| POST | `/api/auth/signup` | Create user + workspace + OWNER membership + free plan |
| GET  | `/api/auth/me` | Return current user/workspace/plan from token |
| POST | `/api/auth/change-password` | Update password (authenticated) |

---

### Contacts (`/api/contacts`)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/contacts` | List with search, sort, filter, tag, pagination |
| POST   | `/api/contacts` | Create |
| GET    | `/api/contacts/:id` | Detail with tags, activities, tasks, notes, business cards, and linked organization |
| PUT    | `/api/contacts/:id` | Update |
| DELETE | `/api/contacts/:id` | Delete |
| POST   | `/api/contacts/bulk/tasks` | Create tasks for multiple contacts at once |
| POST   | `/api/contacts/bulk/tags` | Apply tags to multiple contacts |

---

### Organizations (`/api/organizations`)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/organizations` | List with search, sortBy, sortOrder, filter, tag, vertical, accountStructureType, standalone, isParent, limit |
| POST   | `/api/organizations` | Create |
| GET    | `/api/organizations/:id` | Detail with roll-up stats (pipeline value, won value, child count, last activity), hierarchy, contacts, activities, tasks, notes |
| PUT    | `/api/organizations/:id` | Update; propagates ultimateParentOrganizationId to all descendants on reparent; workspace-scoped cycle detection |
| POST   | `/api/organizations/:id/link-child` | Attach child org (validates same workspace, no cycle) |
| POST   | `/api/organizations/:id/unlink-child` | Detach child org |
| DELETE | `/api/organizations/:id` | Delete |

---

### Business Cards (OCR) (`/api/business-cards`)

| Method | Path | Description |
|---|---|---|
| POST   | `/api/business-cards/upload` | Upload image to GCS; sets status UPLOADED |
| GET    | `/api/business-cards` | List; filter by processingStatus, reviewStatus |
| POST   | `/api/business-cards` | Create record without upload |
| GET    | `/api/business-cards/:id` | Detail |
| PUT    | `/api/business-cards/:id` | Update fields |
| POST   | `/api/business-cards/:id/parse` | Call GPT-4o Vision OCR → store rawOcrText + parsedJson; status → PARSED |
| POST   | `/api/business-cards/:id/approve` | Create/update contact + organization from parsedJson; status → APPROVED/MERGED |
| POST   | `/api/business-cards/:id/reject` | Status → REJECTED; card archived |

---

### Opportunities (`/api/opportunities`)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/opportunities` | List; filter by pipelineId, status |
| POST   | `/api/opportunities` | Create |
| GET    | `/api/opportunities/:id` | Detail with contacts, organization, stage |
| PUT    | `/api/opportunities/:id` | Update (move stage, change status, edit value) |
| DELETE | `/api/opportunities/:id` | Delete |

---

### Pipelines (`/api/pipelines`)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/pipelines` | List all pipelines with stages |

---

### Tasks (`/api/tasks`)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/tasks` | List; filter by status, dueFilter (today/overdue), contactId, organizationId |
| POST   | `/api/tasks` | Create |
| GET    | `/api/tasks/:id` | Detail |
| PUT    | `/api/tasks/:id` | Update (complete, change priority, reassign) |
| DELETE | `/api/tasks/:id` | Delete |

---

### Activities (`/api/activities`)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/activities` | List; filter by contactId, organizationId, type, limit |
| POST   | `/api/activities` | Create |
| PUT    | `/api/activities/:id` | Update |
| DELETE | `/api/activities/:id` | Delete |

---

### Notes (`/api/notes`)

| Method | Path | Description |
|---|---|---|
| POST   | `/api/notes` | Create |
| PUT    | `/api/notes/:id` | Update |
| DELETE | `/api/notes/:id` | Delete |

---

### Tags (`/api/tags`)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/tags` | List workspace tags |
| POST   | `/api/tags` | Create tag |

---

### Reports (`/api/reports`)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/reports/dashboard` | contactsThisWeek, cardsPendingReview, tasksDueToday, tasksOverdue, openOpportunities, totalContacts, recentActivities |
| GET    | `/api/reports/activities` | Recent activity feed |

---

### Storage (`/api/storage`)

| Method | Path | Description |
|---|---|---|
| POST   | `/api/storage/upload-url` | Presigned URL for direct GCS upload |

---

## Section 3 — User Workflow Map (end-to-end flows)

### Authentication flow

```
Landing page → Sign Up (email/password/workspace name) → JWT stored in SecureStore → auto-login → Dashboard
Landing page → Sign In → JWT → Dashboard
Forgot password → (UI shell only, no backend reset yet)
```

---

### Business card OCR pipeline

```
Cards tab → camera or file picker → upload image → POST /upload (GCS)
→ POST /parse (GPT-4o Vision OCR) → review parsed fields on screen
→ Approve → creates/merges Contact + Organization → MERGED
→ Reject → REJECTED; card archived
```

---

### Contact lifecycle

```
New contact (manual or card-scan) → status NEW
→ Add activity/note/task → status REVIEWED / ACTIVE
→ Link to organization → link to opportunity → status ACTIVE
→ Bulk tasks or bulk tags from list (multi-select long-press)
```

---

### Organization hierarchy

```
Create org → optionally link parent via link-child API
→ ultimateParentOrganizationId auto-propagated to all descendants
→ Detail screen shows hierarchy tree + roll-up pipeline stats
```

---

### Sales pipeline

```
Create pipeline + stages → create opportunity in stage
→ Move opportunity between stages → mark WON / LOST / ON_HOLD
→ Kanban view on Pipeline tab (horizontal scroll by stage column)
```

---

### Task management

```
Tasks created from contact detail, org detail, or bulk from contacts list
→ Tasks tab shows OPEN / IN_PROGRESS / COMPLETED + Today / Overdue filters
→ Tap checkbox to complete
```

---

### Navigation structure (mobile tabs)

```
Dashboard → Contacts → Organizations → Pipeline → Cards → Tasks → Settings
```

---

## Section 4 — Feature Status

| Feature | Status | Notes |
|---|---|---|
| **Authentication** | | |
| JWT authentication (login / signup / me) | ✅ Complete | |
| Remember me (30-day token) | ✅ Complete | |
| Change password | ✅ Complete | |
| Password reset via email | 📋 Planned | UI shell only; no email backend |
| Multi-tenant workspace isolation | ✅ Complete | All queries scoped by workspaceId |
| Workspace member roles (OWNER/ADMIN/MEMBER) | ✅ Complete | Schema + enum; invite flow not yet built |
| Subscription / plan tiers | ✅ Complete | Schema + seeded plans; no payment UI yet |
| Stripe / payment integration | 📋 Planned | |
| **Dashboard** | | |
| Dashboard (stats + recent activity) | ✅ Complete | |
| **Contacts** | | |
| Contacts list — search, sort, filter | ✅ Complete | 11 filter types, 5 sort fields, 15 saved views |
| Contacts list — saved views strip | ✅ Complete | Draggable on web |
| Contacts list — multi-select + bulk tasks | ✅ Complete | |
| Contacts list — bulk tag assignment | ✅ Complete | |
| Contact detail — full profile | ✅ Complete | |
| Contact detail — activities / tasks / notes | ✅ Complete | |
| Contact create / edit / delete | ✅ Complete | |
| **Organizations** | | |
| Organizations list — search, sort, filter | ✅ Complete | 11 filter types, 6 sort fields, 15 saved views |
| Organizations list — saved views strip | ✅ Complete | Draggable on web |
| Organizations — universal hierarchy (4-tier) | ✅ Complete | enterprise / parent / regional / local_entity |
| Organizations — org vertical taxonomy | ✅ Complete | healthcare / govcon / general_business / government / nonprofit / vendor / other |
| Organizations — roll-up stats (pipeline, won value, contacts, activity) | ✅ Complete | |
| Organizations — link/unlink child (cycle detection, cross-tenant guard) | ✅ Complete | |
| Organization create / edit / delete | ✅ Complete | |
| Organization detail — hierarchy + contacts + activities + tasks + notes | ✅ Complete | |
| **Tags** | | |
| Tags (workspace-scoped, contacts + orgs) | ✅ Complete | |
| **Business Cards** | | |
| Business card scanner (camera + file) | ✅ Complete | |
| Business card OCR (GPT-4o Vision) | ✅ Complete | |
| Business card review + approve/reject | ✅ Complete | |
| Business card → auto-create contact + org | ✅ Complete | |
| **Pipeline / Opportunities** | | |
| Pipeline Kanban board | ✅ Complete | Horizontal column scroll; add/move opps |
| Multiple pipelines | ✅ Complete | Pipeline tabs strip (draggable on web) |
| Opportunity create / edit / delete | ✅ Complete | |
| Opportunity detail | ✅ Complete | |
| Opportunity contacts (many-to-many) | ✅ Complete | Schema + API; UI list on detail screen |
| Pipeline stage probability | ✅ Complete | Schema; not surfaced in mobile UI yet |
| **Tasks** | | |
| Tasks list — status + due-date filters | ✅ Complete | |
| Task create / complete | ✅ Complete | |
| Task create from contact (or bulk) | ✅ Complete | |
| Task detail / edit / delete | 📋 Planned | List shows cards; no dedicated edit screen |
| **Activities & Notes** | | |
| Activities — CRUD | ✅ Complete | |
| Notes — CRUD | ✅ Complete | |
| **Audit & Settings** | | |
| Audit log | ✅ Complete | Schema only; not exposed via API yet |
| Settings — profile, workspace, plan info | ✅ Complete | |
| Settings — change password | ✅ Complete | |
| Settings — workspace member management | 📋 Planned | No invite/remove UI |
| **Public Web** | | |
| Public landing page | ✅ Complete | Hero, features, pricing sections |
| Public pricing page | ✅ Complete | |
| Public demo page | ✅ Complete | |
| **Platform & UX** | | |
| Web — drag-to-scroll on chip strips | ✅ Complete | |
| Dark navy + emerald design system | ✅ Complete | Inter font, SafeAreaInsets, BlurView tab bar |
| iOS / Android / Web (Expo Router) | ✅ Complete | |

---

*Generated from source code — reflects actual implementation as of April 1, 2026.*
