# Opportunity OS

## Overview

Opportunity OS is a full-stack mobile CRM application designed for healthcare and GovCon relationship and sales pipeline management. It aims to streamline operations for relationship managers by providing tools for contact and organization management, opportunity tracking, and enhanced data intelligence.

Key capabilities include:
- Comprehensive CRM functionalities (Contacts, Organizations, Opportunities, Tasks, Activities).
- Specialized overlays for specific verticals like EMS, including unique data fields and pipeline stages.
- Advanced organization hierarchy management with roll-up statistics.
- Business card and logo scanning with AI-powered OCR and enrichment.
- A robust administrative console for platform-level and workspace-level management.
- A "Day 1 Experience" to rapidly onboard new workspaces with seeded data and guided actions.
- A "Unified Capture System" for quick data entry from various sources.
- A Master Database for consolidating and enriching organizational and contact data across workspaces.

The project's vision is to become the leading mobile CRM solution for relationship-driven sales in specialized industries, offering a highly customizable and intelligent platform.

## User Preferences

I prefer iterative development with clear, concise communication. Please ask before making any major architectural changes or introducing new external dependencies. When implementing new features, prioritize mobile-first responsiveness and a clean UI/UX consistent with the existing design language (dark midnight navy and emerald green). For any data model changes, ensure backward compatibility and clear migration paths.

## System Architecture

The system is built as a pnpm workspace monorepo using TypeScript (v5.9) and Node.js (v24).

**UI/UX Decisions:**
- **Branding:** Dark midnight navy (`#0B1220`) and emerald green (`#10B981`).
- **Typography:** Inter font used throughout the application.
- **Mobile-first Design:** All features are designed with a mobile-first approach, featuring responsive card layouts and touch-friendly interactions.
- **Admin Console:** Integrated within the mobile Expo app under `/admin` paths, with distinct login and access roles.

**Technical Implementations:**
- **API Server:** Express 5 handles all backend API routes.
- **Database:** PostgreSQL with Drizzle ORM for schema definition and interaction.
- **Data Validation:** Zod (`zod/v4`) is used for schema validation, integrated with `drizzle-zod`.
- **API Client Generation:** Orval generates React Query hooks and Zod schemas from an OpenAPI specification, ensuring type safety between frontend and backend.
- **Build System:** esbuild compiles the project into CJS bundles.
- **Mobile Application:** Built with Expo Router and React Native, leveraging React Query for data fetching and caching.
- **Authentication:** Uses a demo user pattern (`demo@opportunityos.com`) for initial setup, with JWT-based authentication for platform and workspace admins.
- **Monorepo Structure:** Divided into `api-server`, `mobile`, and shared `lib` packages (`api-spec`, `api-client-react`, `api-zod`, `db`).
- **Database Schema:** Includes tables for `users`, `workspaces`, `organizations`, `contacts`, `opportunities`, `tasks`, `activities`, `business_cards`, `notes`, `tags`, `pipelines`, `pipeline_stages`, `audit_logs`, and specialized EMS tables.
- **Day 1 Experience:** A guided onboarding process for new workspaces, creating initial data and presenting a mission control dashboard with prioritized actions.
- **Pipeline View Template System:** Allows platform admins to define and publish pipeline view templates to workspaces, which workspace admins can then enable and customize.
- **Master Database System:** Centralizes `master_contacts` and `master_organizations` with a promotion queue for admin review and approval, ensuring data consistency and enrichment across workspaces. Includes an intelligence layer for master organizations with industry-specific overlays (Healthcare, GovCon) and AI-generated suggestions.
- **Unified Capture System:** A centralized flow for quickly adding new contacts, featuring steps for identification, organization assignment, phone type classification, enrichment, and post-save actions (e.g., creating an opportunity).

**Feature Specifications:**
- **Dashboard:** Overview with key metrics, quick actions, and recent activity.
- **CRUD Operations:** Full Create, Read, Update, Delete functionality for Contacts, Organizations, Opportunities, and Tasks.
- **Organization Management:** Supports multi-level hierarchies, roll-up statistics, and vertical-specific labels/profiles.
- **Opportunity Kanban:** Visual pipeline management grouped by stage.
- **Business Card & Logo Scanning:** Mobile-first capture, OCR parsing, and organization matching/enrichment.
- **Tasks & Activities:** Management and tracking of user tasks and system activities.
- **EMS Vertical Overlay:** Dedicated database tables, pipeline, API routes, and mobile UI components for Emergency Medical Services (EMS) interfacility transport management.

## External Dependencies

- **PostgreSQL:** Primary database.
- **Google Cloud Storage (GCS):** For storing uploaded images, such as business cards and organization scans.
- **Google Places API (New, v1):** Used for matching organization scans to real-world entities and enriching organization data with location details.
- **OpenAI API (via Replit AI Integration proxy):** Utilized for AI-powered OCR (GPT-4o vision) for business card and logo scan text extraction and for generating AI suggestions for master organization data enrichment.
- **Expo:** Framework for building the React Native mobile application.
- **React Query:** Data fetching and caching library for the mobile frontend.
- **@expo/vector-icons:** Icon library for the mobile application.
- **Inter Font:** Custom font used for the UI.