# Threat Model

## Project Overview

Opportunity OS is a public-facing, autoscaled Replit deployment of a multi-tenant CRM for healthcare and GovCon relationship management. The production backend is a TypeScript Express API in `artifacts/api-server` backed by PostgreSQL, with a mobile Expo client consuming the API. The server also integrates with GCS-backed object storage for uploaded images, Google Places for enrichment, OpenAI/xAI for OCR and AI-assisted workflows, and Resend for invites.

This scan assumes production traffic runs over platform-managed TLS, `NODE_ENV` is `production`, and the mockup sandbox is not deployed. Areas that are clearly development-only should be ignored unless production reachability is demonstrated.

## Assets

- **User accounts and session tokens** — workspace-user and platform-admin credentials/JWTs control access to tenant and platform data.
- **Tenant CRM data** — contacts, organizations, notes, opportunities, tasks, activities, and workspace membership records contain sensitive business and personal information.
- **Master directory data** — master contacts, master organizations, promotion queues, merge queues, and enrichment history cross trust boundaries between ordinary workspace users and platform administrators.
- **Uploaded images and derived OCR output** — business card photos and organization/logo scans may contain PII, contact details, and customer-sensitive data.
- **Application secrets and provider credentials** — JWT signing keys, database credentials, Google Places keys, AI provider credentials, and email credentials can grant broad compromise if exposed.

## Trust Boundaries

- **Public internet -> Express API** — all request input is attacker-controlled until validated and authorized server-side.
- **Unauthenticated -> authenticated workspace user** — public routes such as login, signup, invite acceptance, and health checks must not expose tenant data or allow account takeover.
- **Workspace user -> platform admin / master-data plane** — ordinary users may submit data that later influences master records, but they must not be able to directly or indirectly assert higher-trust facts without appropriate verification.
- **API -> PostgreSQL** — server-side query construction errors can expose or corrupt all tenant data.
- **API -> object storage** — uploaded files are private by default unless intentionally published; object retrieval must enforce authorization/ACLs.
- **API -> external services** — AI, Places, and email integrations receive sensitive user or tenant data and must not be invoked in ways that leak secrets or bypass trust assumptions.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`.
- Highest-risk code areas: auth (`src/lib/auth*.ts`, `src/routes/auth*.ts`), object storage (`src/lib/objectStorage.ts`, `src/routes/storage.ts`), master promotion/contact identity (`src/lib/contactIdentity.ts`, `src/lib/contactPromotion.ts`, `src/routes/adminMasterPromotion.ts`), upload + OCR flows (`src/routes/businessCards.ts`, `src/routes/organizationScans.ts`, `src/routes/bulkImport.ts`).
- Public surfaces: `/api/health`, `/api/auth/*`, `/api/admin/auth/*`, and any routes mounted before `authMiddleware`.
- Authenticated workspace surfaces: most CRM routes mounted after `authMiddleware`.
- Platform-admin surfaces: `/api/admin/*` routes protected by `platformAdminMiddleware`.
- Dev-only areas usually out of scope: `artifacts/mockup-sandbox/**`, seed scripts, local build scripts.

## Threat Categories

### Spoofing

The application relies on bearer JWTs for both workspace users and platform admins. The system must use an unpredictable, deployment-specific signing secret and reject weak defaults. Public auth endpoints must prevent account takeover through credential abuse, invite misuse, or token forgery.

### Tampering

Workspace users can create and edit contacts, organizations, notes, uploads, and enrichment inputs. The server must ensure user-controlled fields cannot tamper with higher-trust master records, admin review queues, or other tenants’ data without server-side verification and authorization.

### Information Disclosure

Tenant CRM records, uploaded business-card images, organization scans, OCR output, and invite/admin data must remain scoped to the correct authenticated principal. Object-storage retrieval and API responses must not expose private files or cross-tenant data through guessable paths or missing ACL checks.

### Denial of Service

Public and authenticated upload/processing flows (file uploads, OCR, bulk import, AI-backed enrichment) can consume memory, CPU, and third-party quotas. The system must bound request sizes, processing fan-out, and expensive operations so untrusted callers cannot exhaust service capacity.

### Elevation of Privilege

Platform-admin routes and cross-workspace master-data operations are the highest-value privilege boundary. The system must enforce server-side admin checks on every admin route, prevent JWT forgery or auth-context confusion, and ensure ordinary users cannot indirectly elevate privileges by injecting unverified data into master workflows.
