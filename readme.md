# Opportunity OS - Interactive CRM

**Vision**: Field-first CRM with powerful AI camera ("Opportunity Eye") for instant organization + contact capture, hierarchy mapping, and deal flow.

## Core Objectives
- Consolidate all camera/scan features into **one unified module called "Opportunity Eye"**
- Make the app fast, reliable, and field-ready (sales professionals on the go)
- Achieve Apple App Store compliance as quickly as possible
- Improve Organization → Contacts hierarchy display and management
- Keep using existing tech stack (React Native + Expo, Node/Express, Postgres, Grok API)

## Project Rules & Guidelines
1. **Never start from scratch** — Refactor and enhance existing code unless a component is fundamentally broken.
2. **Opportunity Eye** is the new single entry point for:
   - Logo scanning → Organization creation/matching
   - Business card scanning → Contact or Organization
   - Quick hierarchy viewer
3. **Apple Compliance First**:
   - Add proper NSUsageDescription strings
   - Implement account deletion flow
   - Live Privacy Policy & Terms links
4. **Code Style**:
   - TypeScript strict mode
   - Use existing state management (Zustand + React Query)
   - Keep Expo Router file-based navigation
   - Comment complex AI/OCR flows clearly
5. **Testing Priority**:
   - Always test camera features in field conditions
   - Test on physical iOS device early

## Current Tech Stack
- Mobile: React Native + Expo 54 + Expo Router
- Backend: Node.js + Express + TypeScript
- AI: Grok-3 + GPT-4o Vision (via OpenRouter)
- Database: PostgreSQL + Drizzle ORM

## Canvas Usage
Use Replit Canvas for:
- Comparing design variants of Opportunity Eye
- Live app previews (multiple screens)
- Architecture diagrams (especially hierarchy flow)

## Next Major Milestone
1. Apple compliance fixes
2. Unified Opportunity Eye screen + logic
3. Improved organization hierarchy UI/UX

## Building & Releasing with EAS (Expo)

This project is configured to build under the **johngon89** Expo account:

- **Expo Project**: https://expo.dev/accounts/johngon89/projects/opportunity-os
- **Slug**: `opportunity-os`
- **EAS Project ID**: `6c2a24f6-28a0-4335-90e8-c0238725b368`

### One-time setup

```bash
cd artifacts/mobile

# Login with the correct account
npx eas login
# Make sure you're logged in as johngon89
npx eas whoami
```

### Common commands

```bash
# Development build (for simulator + dev client)
eas build --platform ios --profile development

# Internal testing build (preview)
eas build --platform ios --profile preview
eas build --platform android --profile preview

# Production build (ready for App Store / Play Store)
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit to App Store (after first production build)
eas submit --platform ios --profile production
```

### Important notes

- The app uses a pnpm monorepo. You may need to run `pnpm install` from the repository root before the first EAS build.
- OTA updates are configured via channels (`development`, `preview`, `production`).
- Update the `ascAppId` in `eas.json` when you're ready to submit to the App Store.

See `artifacts/mobile/eas.json` and `artifacts/mobile/app.json` for the full configuration.