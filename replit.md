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

Tables: users, workspaces, workspace_members, organizations, contacts, tags, contact_tags, organization_tags, business_cards, activities, tasks, pipelines, pipeline_stages, opportunities, opportunity_contacts, notes, audit_logs, pipeline_view_templates, workspace_pipeline_views, workspace_pipeline_view_permissions

### Pipeline View Template System (Task 9)
- `pipeline_view_templates`: Master template library (key, name, vertical, sub_vertical, status enum [draft/active/inactive/archived], is_locked, is_client_editable, config_json, created_by_user_id, updated_by_user_id)
- `workspace_pipeline_views`: Per-workspace view enablement (template_id FK, workspace_id FK, pipeline_id FK, is_enabled, is_default, sort_order, visibility_scope, settings_json)
- `workspace_pipeline_view_permissions`: User/role-level access (workspace_pipeline_view_id FK, user_id FK, role, permission)
- `users` table now has `is_platform_admin` boolean column
- Seeded: `ems_interfacility_transport_v1` template → published to EMS workspace (e7a4042c-9839-4faa-a1c2-b534f4ee89a8)

## API Routes

All routes under `/api`:
- `GET/POST /contacts` + `GET/PUT/DELETE /contacts/:id`
- `GET/POST /organizations` + `GET/PUT/DELETE /organizations/:id` + `POST /organizations/:id/link-child|unlink-child`
- `GET/POST /business-cards` + `GET/PUT /business-cards/:id` + `POST /business-cards/:id/parse|approve|reject`
- `GET/POST /tasks` + `GET/PUT/DELETE /tasks/:id`
- `GET/POST /activities` + `PUT/DELETE /activities/:id`
- `GET/POST /opportunities` + `GET/PUT/DELETE /opportunities/:id`
- `GET /pipelines`
- `GET/POST /admin/pipeline-templates` (platform admin only)
- `GET/PUT/DELETE /admin/pipeline-templates/:id` (platform admin only)
- `POST /admin/pipeline-templates/:id/publish` (platform admin only; publishes to workspace)
- `GET /workspaces/:workspaceId/pipeline-views` (workspace member)
- `PUT /workspaces/:workspaceId/pipeline-views/:id` (workspace member; blocks locked template fields)
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
- `app/contact/[id].tsx` + `app/contact/new.tsx`
- `app/organization/[id].tsx` + `app/organization/new.tsx`
- `app/opportunity/[id].tsx` + `app/opportunity/new.tsx`
- `app/card/[id].tsx` — Card review/approve flow

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
