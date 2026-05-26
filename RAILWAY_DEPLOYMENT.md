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

Last updated: 2026-05-26
```

This gives the user a living document in the repo.

Now, let's also check the current .dockerignore one more time and improve the root package.json scripts slightly if helpful.