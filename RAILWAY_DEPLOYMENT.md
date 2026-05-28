# Railway Deployment Guide for Opportunity OS

This document explains the correct architecture and steps to deploy Opportunity OS to Railway so the backend is publicly accessible and stable.

## Architecture (Important!)

You should **only** have **one** main Railway service for production:

- **`api-server`** → The Express backend (this is the only service that needs to run 24/7 on Railway).

**Do NOT** create separate Railway services for:
- `mobile` (Expo app)
- `mockup-sandbox`
- `api-client-react`

These are client-side or development-only packages. Deploying them as separate services wastes money and causes confusing build failures.

### Recommended Railway Setup

1. **One Service**: `opportunity-os-api` (or similar name)
   - Root Directory: `.` (or blank)
   - Dockerfile Path: `Dockerfile`
   - Builder: Dockerfile
   - Custom Build Command: (leave completely empty)
   - Custom Start Command: (leave completely empty)

2. **Mobile App**
   - Build with Expo Application Services (EAS) or `expo export`.
   - Point the mobile app at your Railway URL using `EXPO_PUBLIC_DOMAIN`.

3. **Future Web Frontend**
   - If you want a public web experience, create a separate lightweight Next.js or Vite frontend later. Do not try to force the current Expo mobile app to be the only public surface.

## Required Environment Variables (Railway)

Set these in your Railway service (Settings → Variables):

| Variable                  | Required | Notes                                      |
|---------------------------|----------|--------------------------------------------|
| `DATABASE_URL`            | Yes      | Postgres connection string                 |
| `RESEND_API_KEY`          | Yes      | For sending onboarding/invite emails       |
| `OPENAI_API_KEY`          | Often    | Or OpenRouter key if using that provider   |
| `OPENROUTER_API_KEY`      | Often    | Alternative to OpenAI                      |
| `JWT_SECRET`              | Recommended | Strong random secret (or let the app generate one) |
| `NODE_ENV`                | Recommended | Set to `production`                        |
| `PORT`                    | No       | Railway injects this automatically         |

## Current Dockerfile

The root `Dockerfile` is intentionally written to build **only** the api-server using pnpm workspaces:

```dockerfile
...
RUN pnpm --filter @workspace/api-server build
...
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
```

It includes a `HEALTHCHECK` pointing at `/api/healthz`.

## Preinstall Hook

The root `package.json` contains a tolerant `preinstall` script that allows Railway + Corepack builds while still protecting against accidental `npm`/`yarn` usage locally.

## Database Strategy

You currently use Replit Postgres. For production on Railway you have options:

1. **Railway Postgres** (easiest for starting)
2. **Neon** or **Supabase** (excellent free tiers + branching)
3. Keep Replit Postgres temporarily (not recommended long-term)

Migrate your schema using Drizzle migrations when ready.

## Mobile App Configuration

When building the mobile app for production (or when testing against Railway):

```bash
EXPO_PUBLIC_DOMAIN=your-railway-url.up.railway.app npx expo start --clear
```

Or set it in your EAS build profile.

## Admin Access

The current admin (`/admin/login`) is inside the Expo app. Once the api-server is live:

- You can access the admin by running the mobile app (or Expo web) against the Railway backend.
- For a pure browser admin experience, consider extracting a small admin UI later.

## Common Failures & Fixes

| Symptom                              | Cause                                      | Fix |
|--------------------------------------|--------------------------------------------|-----|
| `preinstall: Use pnpm instead`       | Strict preinstall hook                     | Use the tolerant version in this repo |
| `pnpm-lock.yaml not found`           | Lockfile was never committed               | Run `rm -rf node_modules pnpm-lock.yaml && pnpm install` then commit |
| Wrong Dockerfile path                | Old Railway service config                 | Set Root Directory = `.` and Dockerfile Path = `Dockerfile` in UI |
| Multiple services failing the same way | Deploying mobile + mockup as separate services | Delete those services. Only keep the api-server |
| App starts but can't connect to DB   | Missing DATABASE_URL                       | Add it in Railway Variables |

## Recommended First Deployment Steps

1. Make sure the latest code (including the fixed preinstall + Dockerfile) is pushed to GitHub.
2. In Railway, create **one** new service connected to your GitHub repo.
3. Set Root Directory = `.`
4. Set Dockerfile Path = `Dockerfile`
5. Clear any custom build/start commands.
6. Add the required environment variables (especially `DATABASE_URL` and `RESEND_API_KEY`).
7. Deploy.
8. Check the `/api/healthz` endpoint in the browser or with curl.
9. Update your mobile app to point at the new Railway URL and test login + core flows.

## Next Milestones After Backend is Live

- Migrate real data / seed production data
- Set up proper domain + SSL on Railway (or Cloudflare)
- Build production mobile app with EAS pointing at production backend
- Consider a lightweight public landing page + admin web UI

---

Last updated: 2026-05 (Grok AI complete, three Railway options added, preinstall fixed, R2 decision documented)

---

## Current Production Readiness Snapshot (May 2026)

- **AI**: Full migration to Grok (xAI) complete in all core flows. `getAiClient("grok")` + `aiProvider.ts` is the single source of truth. Vision OCR (business cards + storefronts), structure scans, opportunity event extraction, bulk import, and govcon classification all use Grok. OpenAI package remains only for the OpenAI-compatible SDK client pointing at `https://api.x.ai/v1`. No direct OpenAI calls left in business logic. Set `AI_INTEGRATIONS_GROK_API_KEY`.
- **Replit removal**: In progress. `resendClient.ts` fully cleaned (direct Resend SDK, no more sidecar/Connectors). Preinstall hook now properly tolerant for Docker/Corepack (respects `DOCKER_BUILD=1`). Object storage (`objectStorage.ts` + `objectAcl.ts`) still fully tied to Replit GCS sidecar — next major cleanup target (planned migration to Cloudflare R2 / S3-compatible).
- **Storage**: Currently GCS via Replit sidecar (127.0.0.1:1106 + external_account creds). Decision: migrate to Cloudflare R2. Will require new client using AWS SDK v3, updated upload/download routes, and simplified ACL handling (R2 does not support the same custom metadata ACLs).
- **Database**: Target is **Neon Postgres** (with branching). Current code uses Replit Postgres. Use Drizzle migrations for schema sync.
- **Email**: Clean Resend integration. No Replit dependencies left.
- **Docker / pnpm**: Root `Dockerfile` + `.dockerignore` already selective (only ships what api-server needs). `pnpm-workspace.yaml` has correct `onlyBuiltDependencies`. Preinstall hook fixed to respect `DOCKER_BUILD=1`.
- **Mobile**: All API calls use `EXPO_PUBLIC_DOMAIN` (falls back to localhost/emulator). EAS builds will point at the Railway public URL.
- **Health**: `/api/healthz` returns `{ "status": "ok" }`. Dockerfile has built-in `HEALTHCHECK`.

**Key environment variables for Railway (updated):**

| Variable                        | Required          | Notes |
|---------------------------------|-------------------|-------|
| `DATABASE_URL`                  | Yes               | Neon (or Railway Postgres) connection string. Use pooled for production. |
| `AI_INTEGRATIONS_GROK_API_KEY`  | Yes (for AI)      | xAI Grok key. `AI_PROVIDER=grok` is optional (defaults to grok now). |
| `RESEND_API_KEY`                | Yes               | Transactional emails (invites, onboarding). |
| `GOOGLE_PLACES_API_KEY`         | Yes (for now)     | Org logo scan + structure scan enrichment (still used). |
| `PRIVATE_OBJECT_DIR`            | Yes (storage)     | Bucket/path for private uploads (business cards, scans). Will become R2 config later. |
| `PUBLIC_OBJECT_SEARCH_PATHS`    | For public assets | Comma-separated paths for public objects (if any). |
| `INVITE_BASE_URL` or `PUBLIC_APP_URL` | Recommended | Used for magic links / invite emails. Set to your eventual custom domain or Railway URL. |
| `JWT_SECRET`                    | Recommended       | Strong random value for session tokens. |
| `NODE_ENV`                      | Recommended       | `production` |
| `PORT`                          | No                | Railway injects this (code defaults to 8080). |

Future R2 vars (once storage migration lands): `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, etc.

---

## Three Deployment Configuration Options (Review These)

All three options keep the **single-service** rule and the existing monorepo layout (`pnpm-workspace.yaml`, root `package.json`, selective `Dockerfile` + `.dockerignore`, `artifacts/api-server`, shared `lib/`). They differ in builder, maintenance burden, and image size.

### Option 1: Current Dockerfile Path (Recommended for Immediate Stability)

**Why this exists in the repo**: The root `Dockerfile` was deliberately written to do a minimal-context build of *only* the api-server. It uses `node:22-alpine`, Corepack + pnpm, copies only manifests + `lib/` + `artifacts/api-server/`, runs `pnpm --filter @workspace/api-server build`, and bakes in a `HEALTHCHECK` on `/api/healthz`.

**Railway Service Settings**:
- Root Directory: `.` (or blank)
- Dockerfile Path: `Dockerfile`
- Builder: Dockerfile (do **not** switch to Nixpacks)
- Build Command / Start Command: leave empty (Dockerfile controls everything)
- Healthcheck: automatically uses the Dockerfile one (or set HTTP path `/api/healthz` on port 8080 as backup)
- Watch Paths (optional but recommended): `artifacts/api-server/**,lib/**,pnpm-lock.yaml,package.json,pnpm-workspace.yaml`

**Pros**:
- Exactly matches what has been battle-tested through the pnpm/Docker/Railway pain.
- Smallest possible Docker context.
- Explicit Node 22 + HEALTHCHECK.
- Preinstall hook now correctly skips the "use pnpm" check inside Docker (`DOCKER_BUILD=1`).

**Cons**:
- You maintain a Dockerfile.
- Full workspace `pnpm install` happens in the image (not the leanest possible runtime).

**When to choose**: Right now. This is the lowest-risk path to get production backend live while we finish R2 + remaining Replit cleanup.

**Post-deploy**:
1. Push the latest (including the preinstall tolerance fix).
2. Create the service from GitHub in Railway.
3. Set the variables above (start with Neon `DATABASE_URL`, Grok key, Resend).
4. Deploy.
5. Verify `https://your-service.up.railway.app/api/healthz`.
6. Set `EXPO_PUBLIC_DOMAIN` in your EAS build profile (or locally) and test the mobile app end-to-end.

### Option 2: Native Nixpacks + Explicit Single Service + Watch Paths (Lowest Maintenance)

Railway has excellent first-class pnpm monorepo support (auto-detects `pnpm-workspace.yaml`, can create one service per deployable package, supports `--filter` + scoped Watch Paths).

**How to set it up**:
- You can keep the Dockerfile (Railway will prefer it if present) **or** temporarily rename it to `Dockerfile.disabled` to force Nixpacks.
- In Railway, after connecting the repo, manually configure (or use `railway.toml` for config-as-code):
  - Root Directory: `.`
  - Builder: Nixpacks
  - Build Command: `pnpm --filter @workspace/api-server build`
  - Start Command: `pnpm --filter @workspace/api-server start`
  - Environment: `NIXPACKS_NODE_VERSION=22` (or add `"engines": { "node": "22" }` to root `package.json`)
  - Watch Paths: `["artifacts/api-server/**", "lib/**", "pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]` — **critical** so mobile changes don't trigger full rebuilds.
- Healthcheck: Configure in Railway UI (HTTP, path `/api/healthz`, port 8080). The baked-in Dockerfile one won't apply.
- Add to root `package.json` for determinism: `"packageManager": "pnpm@11.x.x"` (match whatever version your lockfile was generated with).

**Pros**:
- No Dockerfile to maintain.
- Railway's pnpm caching and monorepo intelligence are very good.
- Fast iteration once Watch Paths are correct.

**Cons**:
- Slightly larger runtime image (full workspace deps are present unless you add extra pruning).
- You lose the explicit Alpine + HEALTHCHECK control (unless you add a tiny wrapper or rely on Railway UI healthchecks).
- If you ever need very specific base image behavior or multi-stage pruning, you come back to Docker.

**When to choose**: After the first production backend is stable and you want to reduce custom infra files. Many teams prefer this for pure Node/TS services.

**railway.toml example** (commit this for reproducibility):

```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm --filter @workspace/api-server build"
startCommand = "pnpm --filter @workspace/api-server start"
watchPatterns = ["artifacts/api-server/**", "lib/**", "pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]

[deploy]
numReplicas = 1
```

### Option 3: Advanced Multi-Stage + `pnpm deploy` Dockerfile (Leanest Production Image)

Evolve the current Dockerfile using official 2026 pnpm + Railway best practices:

- Use `pnpm --filter @workspace/api-server deploy --prod /out` in a final stage.
- This produces a *pruned* production directory containing only the api-server's runtime deps + compiled output (dramatically smaller `node_modules`).
- Add non-root user for security.
- Keep the excellent layer caching and selective COPY we already have.

**Benefits**: Smaller images = faster deploys, lower memory, cheaper on Railway. This is the "gold standard" pattern recommended in Railway's own monorepo + Docker guidance when you need control.

**Tradeoff**: More Dockerfile complexity. Only worth it once you are doing frequent deploys or are cost-sensitive on the backend service.

**When to choose**: After R2 migration is done and you are happy with the overall architecture. This would be the long-term "production hardened" choice.

---

## Database: Strong Recommendation — Neon + Branching

The existing guidance listed Railway Postgres as "easiest". For this project the better long-term choice is **Neon**:

- Instant copy-on-write branching (perfect for safe migrations, staging, PR preview environments).
- Pair with Railway's Environments (Production / Staging) + inject branch-specific `DATABASE_URL` per environment.
- Excellent free tier + usage-based scaling.
- Your prior intent (documented) was Neon with branching for master vs workspace data isolation.

**Migration path**: Dump from current Replit Postgres → restore to Neon main branch → point Railway `DATABASE_URL` at it → run any pending Drizzle migrations.

Use Neon's pooled connection string in production.

---

## Mobile + EAS Builds Against Railway

In `eas.json` (or per-profile `.env`):

```
EXPO_PUBLIC_DOMAIN=your-railway-service.up.railway.app
```

All `getBaseUrl()` calls in the mobile codebase already respect this and construct `https://.../api`.

Local dev against Railway:

```bash
EXPO_PUBLIC_DOMAIN=your-service.up.railway.app npx expo start --clear
```

---

## Post-Deploy / Hardening Checklist

- [ ] Custom domain + SSL on the Railway service (or put Cloudflare in front)
- [ ] Set `INVITE_BASE_URL` / `PUBLIC_APP_URL` to the final domain
- [ ] Add proper backups / PITR on Neon
- [ ] Monitor Railway metrics + logs for the api-server
- [ ] Run a full mobile production build via EAS pointing at the live backend
- [ ] Remove or mark deprecated Replit-only code paths (see `sendWorkspaceInvite.ts`, mobile build scripts, etc.)
- [ ] After R2 migration: remove `@google-cloud/storage` and Replit sidecar references from `package.json` + code
- [ ] Consider adding a tiny public landing page or admin web UI later (separate lightweight service or static site)

---

## Common Failures & Fixes (Updated)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `preinstall: Use pnpm instead` | Running under npm/yarn or strict hook in Docker | Preinstall now respects `DOCKER_BUILD=1` and `CI`. Rebuild after pulling latest. |
| `pnpm-lock.yaml not found` | Lockfile not committed or partial | `rm -rf node_modules pnpm-lock.yaml && pnpm install` then commit the fresh lockfile. |
| Healthcheck failing | Wrong port or path | Confirm app listens on `process.env.PORT || 8080` and `/api/healthz` responds 200. |
| Multiple services failing identically | Accidentally created mobile/mockup services | Delete everything except the single api-server service. |
| AI features 500 / "Grok key not set" | Missing `AI_INTEGRATIONS_GROK_API_KEY` | Add it in Railway Variables (not the old OpenAI/Replit keys). |
| Storage uploads fail | Still using old Replit GCS sidecar vars | Will be resolved by R2 migration. Temporarily keep the Replit object storage creds if needed. |
| Mobile can't reach backend | `EXPO_PUBLIC_DOMAIN` not set or using http in production build | Must be the full Railway public domain (https is added automatically in `getBaseUrl`). |

---

## Quick Start (Option 1 — Fastest Path to Live Backend)

1. Commit the latest changes (preinstall fix + this doc).
2. Push to GitHub.
3. In Railway: New Service → Deploy from GitHub repo → select the monorepo root.
4. Service Settings:
   - Root Directory = `.`
   - Dockerfile Path = `Dockerfile`
   - Clear any custom build/start commands
5. Variables tab: add the table above (at minimum `DATABASE_URL`, `AI_INTEGRATIONS_GROK_API_KEY`, `RESEND_API_KEY`).
6. Deploy.
7. Test health endpoint.
8. Point a mobile dev build or EAS preview at it and validate login + Oppo Eye flows end-to-end.

Once that works, we can evaluate Option 2 or 3, finish the R2 storage cutover, and do the final Replit cleanup sweep.