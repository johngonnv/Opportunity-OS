FROM node:22-alpine

WORKDIR /app

# Install pnpm via Corepack
RUN corepack enable pnpm

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/

# Copy only the api-server package
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/api-server/src ./artifacts/api-server/src
COPY artifacts/api-server/tsconfig.json ./artifacts/api-server/

# Install + build
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server build

EXPOSE 8080

# Railway healthcheck (uses the existing /api/healthz endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
