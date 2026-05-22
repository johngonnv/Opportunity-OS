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