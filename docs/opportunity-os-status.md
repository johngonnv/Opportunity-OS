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
| `image_url_front` | text | NOT NULL | GCS public URL |
| `image_url_back` | text | nullable | GCS public URL |
| `raw_ocr_text` | text | nullable | GPT-4o Vision raw output |
| `parsed_json` | jsonb | nullable | Structured parsed fields |
| `processing_status` | card_processing_status | NOT NULL | default UPLOADED |
| `review_status` | card_review_status | NOT NULL | default PENDING_REVIEW |
| `linked_contact_id` | text | nullable | FK → contacts.id (set null) |
| `linked_organization_id` | text | nullable | FK → organizations.id (set null) |
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
| POST | `/api/auth/login` | Password login — returns JWT + user + workspace + plan |
| POST | `/api/auth/signup` | Create user + workspace + OWNER membership + free plan subscription |
| GET | `/api/auth/me` | Return current user, workspace, plan info from token |
| POST | `/api/auth/change-password` | Update password (authenticated) |

---

### Contacts (`/api/contacts`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/contacts` | List with search, sort (name/status/created), filter (status, tag, org, hasEmail, hasMobile), pagination |
| POST | `/api/contacts` | Create contact |
| GET | `/api/contacts/:id` | Detail with tags, activities, tasks, linked opportunities |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact |
| POST | `/api/contacts/bulk/tasks` | Create tasks for multiple contacts at once |
| POST | `/api/contacts/bulk/tags` | Apply or remove tags from multiple contacts |

---

### Organizations (`/api/organizations`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/organizations` | List with search, sortBy, sortOrder, filter (11 types), tag, vertical, accountStructureType, standalone, isParent, limit |
| POST | `/api/organizations` | Create organization |
| GET | `/api/organizations/:id` | Detail with roll-up stats (pipeline value, won value, child count, last activity), hierarchy tree, contacts, activities, tasks, notes |
| PUT | `/api/organizations/:id` | Update; propagates `ultimate_parent_organization_id` to all descendants on reparent; workspace-scoped cycle detection |
| POST | `/api/organizations/:id/link-child` | Attach child org (validates same workspace, no cycle) |
| POST | `/api/organizations/:id/unlink-child` | Detach child org |
| DELETE | `/api/organizations/:id` | Delete organization |

---

### Business Cards / OCR (`/api/business-cards`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/business-cards/upload` | Upload image to GCS; sets processing_status UPLOADED |
| GET | `/api/business-cards` | List; filter by processingStatus, reviewStatus |
| POST | `/api/business-cards` | Create card record without upload |
| GET | `/api/business-cards/:id` | Card detail |
| PUT | `/api/business-cards/:id` | Update card fields |
| POST | `/api/business-cards/:id/parse` | Call GPT-4o Vision OCR → store raw_ocr_text + parsed_json; status → PARSED |
| POST | `/api/business-cards/:id/approve` | Create or update contact + organization from parsed_json; review_status → APPROVED / MERGED |
| POST | `/api/business-cards/:id/reject` | review_status → REJECTED |

---

### Opportunities (`/api/opportunities`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/opportunities` | List; filter by pipelineId, status |
| POST | `/api/opportunities` | Create opportunity |
| GET | `/api/opportunities/:id` | Detail with contacts, organization, pipeline stage |
| PUT | `/api/opportunities/:id` | Update — move stage, change status, edit value/close date |
| DELETE | `/api/opportunities/:id` | Delete opportunity |

---

### Pipelines (`/api/pipelines`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/pipelines` | List all pipelines with their stages |

---

### Tasks (`/api/tasks`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks` | List; filter by status, dueFilter (today/overdue), contactId, organizationId |
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/:id` | Task detail |
| PUT | `/api/tasks/:id` | Update — complete, change priority, reassign |
| DELETE | `/api/tasks/:id` | Delete task |

---

### Activities (`/api/activities`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/activities` | List; filter by contactId, organizationId, type, limit |
| POST | `/api/activities` | Create activity |
| PUT | `/api/activities/:id` | Update activity |
| DELETE | `/api/activities/:id` | Delete activity |

---

### Notes (`/api/notes`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/notes` | Create note |
| PUT | `/api/notes/:id` | Update note |
| DELETE | `/api/notes/:id` | Delete note |

---

### Tags (`/api/tags`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/tags` | List all workspace tags |
| POST | `/api/tags` | Create tag |

---

### Reports (`/api/reports`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/reports/dashboard` | Dashboard stats: contactsThisWeek, cardsPendingReview, tasksDueToday, tasksOverdue, openOpportunities, totalContacts, recentActivities |
| GET | `/api/reports/activities` | Recent activity feed |

---

### Storage (`/api/storage`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/storage/upload-url` | Presigned URL for direct GCS upload |

---

## Section 3 — User Workflow Map

### Authentication Flow

```
Public Landing Page
  ├─ Sign Up → email + password + workspace name
  │     └─ POST /api/auth/signup
  │           └─ JWT stored in SecureStore → auto-login → Dashboard
  └─ Sign In → email + password
        └─ POST /api/auth/login (rememberMe: 30-day token)
              └─ JWT stored → Dashboard

Dashboard → Settings → Change Password → POST /api/auth/change-password

Forgot Password → UI shell only (no email backend yet)
```

---

### Business Card OCR Pipeline

```
Cards Tab
  └─ Tap "Scan" → camera or file picker
        └─ POST /api/business-cards/upload (image → GCS)
              └─ POST /api/business-cards/:id/parse
                    └─ GPT-4o Vision reads card → rawOcrText + parsedJson stored
                          ├─ Review parsed fields on screen (edit any field)
                          ├─ Approve → POST /api/business-cards/:id/approve
                          │     └─ Creates or updates Contact + Organization
                          │           └─ reviewStatus → APPROVED / MERGED
                          └─ Reject → POST /api/business-cards/:id/reject
                                └─ reviewStatus → REJECTED; card archived
```

---

### Contact Lifecycle

```
New Contact
  ├─ Manual create (Contacts → + button)
  └─ Auto-created from card scan (approve flow)

Contact Detail
  ├─ Add Activity (CALL / EMAIL / MEETING / NOTE / FOLLOW_UP / EVENT / INTRO / CARD_SCAN)
  ├─ Add Task (due date, priority)
  ├─ Add Note
  ├─ Link to Organization
  └─ Link to Opportunity

Status progression: NEW → REVIEWED → ACTIVE → INACTIVE

Bulk operations (multi-select via long-press on list):
  ├─ Bulk create tasks for selected contacts
  └─ Bulk apply / remove tags
```

---

### Organization Hierarchy

```
Create Organization
  └─ Set organization_level: enterprise | group | facility
        └─ Set account_structure_type: enterprise | parent | regional | local_entity

Link Hierarchy
  └─ POST /api/organizations/:parentId/link-child { childId }
        └─ System validates: same workspace, no circular reference
              └─ ultimate_parent_organization_id auto-propagated to all descendants

Organization Detail
  ├─ Hierarchy tree: parent chain + direct children
  ├─ Roll-up stats: total pipeline value, total won value, contact count, last activity date
  ├─ Contacts tab
  ├─ Activities tab
  ├─ Tasks tab
  └─ Notes tab

Unlink: POST /api/organizations/:parentId/unlink-child { childId }
  └─ Clears parent_organization_id; recalculates ultimate parent for subtree
```

---

### Sales Pipeline

```
Pipeline Tab
  └─ Pipeline selector strip (drag-to-scroll on web)
        └─ Kanban board: columns = pipeline stages
              ├─ Horizontal scroll between stage columns
              ├─ Create opportunity → assigned to stage
              ├─ Move opportunity → PUT /api/opportunities/:id { pipelineStageId }
              └─ Change status → WON / LOST / ON_HOLD / OPEN

Opportunity Detail
  ├─ Title, description, value estimate, close date
  ├─ Vertical: HEALTHCARE / GOVCON / CONSULTING / PARTNERSHIP
  ├─ Linked organization
  ├─ Primary contact + additional contacts (many-to-many via opportunity_contacts)
  └─ Stage probability displayed
```

---

### Task Management

```
Tasks Tab
  ├─ Filter strip: All | Today | Overdue
  ├─ Status tabs: OPEN | IN_PROGRESS | COMPLETED
  └─ Tap checkbox → PUT /api/tasks/:id { status: "COMPLETED", completedAt: now }

Create Task
  ├─ From Contact detail screen
  ├─ From Organization detail screen
  └─ Bulk from Contacts list (multi-select → Create Tasks)

Task fields: title, description, due date, priority (LOW/MEDIUM/HIGH), assignee
```

---

### Navigation Structure (Mobile Tabs)

```
Tab Bar (bottom)
  1. Dashboard  — stats overview + recent activity feed
  2. Contacts   — list (search / sort / filter / 15 saved views) + detail
  3. Organizations — list (search / sort / filter / 15 saved views) + detail + hierarchy
  4. Pipeline   — Kanban board (pipeline tabs + stage columns)
  5. Cards      — business card scanner + review queue
  6. Tasks      — task list (status + due filters)
  7. Settings   — profile, workspace info, plan, change password
```

---

## Section 4 — Feature Status

| Feature | Status | Notes |
|---|---|---|
| **Authentication** | | |
| JWT login / signup / me | ✅ Complete | 24-hour token; 30-day with rememberMe |
| Remember me (30-day token) | ✅ Complete | |
| Change password | ✅ Complete | |
| Password reset via email | 📋 Planned | UI shell only; no email backend |
| **Multi-tenancy & Access** | | |
| Multi-tenant workspace isolation | ✅ Complete | All queries scoped by workspaceId |
| Workspace member roles (OWNER/ADMIN/MEMBER) | ✅ Complete | Schema + enum in place |
| Member invite / remove UI | 📋 Planned | No invite flow built yet |
| Subscription / plan tiers | ✅ Complete | Schema + seeded plans (Independent $29 · Business $79 · Enterprise) |
| Stripe / payment integration | 📋 Planned | Schema ready; no payment UI |
| **Dashboard** | | |
| Stats overview (contacts, tasks, opps, cards) | ✅ Complete | |
| Recent activity feed | ✅ Complete | |
| **Contacts** | | |
| Contacts list — search | ✅ Complete | |
| Contacts list — sort (5 fields) | ✅ Complete | |
| Contacts list — filter (11 types) | ✅ Complete | |
| Contacts list — 15 saved views strip | ✅ Complete | Draggable on web |
| Contacts list — multi-select + bulk tasks | ✅ Complete | Long-press to enter multi-select mode |
| Contacts list — bulk tag assignment | ✅ Complete | |
| Contact detail — full profile | ✅ Complete | |
| Contact detail — activities / tasks / notes tabs | ✅ Complete | |
| Contact create / edit / delete | ✅ Complete | |
| **Organizations** | | |
| Organizations list — search | ✅ Complete | |
| Organizations list — sort (6 fields) | ✅ Complete | |
| Organizations list — filter (11 types) | ✅ Complete | hasContacts, noContacts, hasOpenOpps, hasWonOpps, noOpps, stale30, stale90, missingWebsite, missingPhone, missingVertical, missingStructure |
| Organizations list — 15 saved views strip | ✅ Complete | Draggable on web |
| Organization hierarchy (4-tier) | ✅ Complete | enterprise / parent / regional / local_entity levels |
| Org vertical taxonomy | ✅ Complete | healthcare / govcon / general_business / government / nonprofit / vendor / other |
| Roll-up stats (pipeline value, won value, contacts, last activity) | ✅ Complete | Calculated at GET /api/organizations/:id |
| Link / unlink child org (cycle detection + cross-tenant guard) | ✅ Complete | |
| Organization create / edit / delete | ✅ Complete | |
| Organization detail — hierarchy + contacts + activities + tasks + notes | ✅ Complete | |
| **Tags** | | |
| Tags (workspace-scoped, contacts + orgs) | ✅ Complete | |
| **Business Card Scanner** | | |
| Business card scanner — camera capture | ✅ Complete | |
| Business card scanner — file picker | ✅ Complete | |
| Business card OCR (GPT-4o Vision) | ✅ Complete | |
| Business card review — edit parsed fields | ✅ Complete | |
| Business card approve / reject | ✅ Complete | |
| Business card → auto-create contact + org | ✅ Complete | MERGED status when contact matched |
| **Pipeline / Opportunities** | | |
| Pipeline Kanban board | ✅ Complete | Horizontal stage columns; horizontal scroll |
| Multiple pipelines | ✅ Complete | Pipeline tabs strip (draggable on web) |
| Opportunity create / edit / delete | ✅ Complete | |
| Opportunity detail | ✅ Complete | |
| Opportunity contacts (many-to-many) | ✅ Complete | Schema + API; contact list shown on detail screen |
| Pipeline stage probability | ✅ Complete | Schema + API; not yet surfaced in mobile Kanban UI |
| Opportunity score | ✅ Complete | Schema + API; not yet surfaced in mobile UI |
| **Tasks** | | |
| Tasks list — status filters (OPEN / IN_PROGRESS / COMPLETED) | ✅ Complete | |
| Tasks list — due-date filters (Today / Overdue) | ✅ Complete | |
| Task create + complete | ✅ Complete | |
| Task create from contact detail | ✅ Complete | |
| Task bulk create from contacts list | ✅ Complete | |
| Task detail / edit / delete | 📋 Planned | List shows task cards; no dedicated edit screen |
| **Activities & Notes** | | |
| Activities — CRUD | ✅ Complete | |
| Notes — CRUD | ✅ Complete | |
| **Audit & Reporting** | | |
| Audit log | ✅ Complete | Schema only; not yet exposed via API |
| Reports API (dashboard stats, activity feed) | ✅ Complete | |
| **Settings** | | |
| Settings — profile info | ✅ Complete | |
| Settings — workspace info + plan | ✅ Complete | |
| Settings — change password | ✅ Complete | |
| Settings — workspace member management | 📋 Planned | No invite / remove UI |
| **Public Web Pages** | | |
| Public landing page (hero, features, pricing) | ✅ Complete | |
| Public pricing page | ✅ Complete | |
| Public demo page | ✅ Complete | |
| **Platform & UX** | | |
| Web — drag-to-scroll on all chip/tab strips | ✅ Complete | DraggableScrollView component |
| Dark navy + emerald design system | ✅ Complete | Inter font · SafeAreaInsets · BlurView tab bar |
| iOS / Android / Web (Expo Router) | ✅ Complete | Single codebase |

---

*Generated from source code — reflects actual implementation as of April 1, 2026.*
