FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy root files for workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/

# Copy api-server
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/api-server/src ./artifacts/api-server/src
COPY artifacts/api-server/tsconfig.json ./artifacts/api-server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @workspace/api-server build

# Start
EXPOSE 8080
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
