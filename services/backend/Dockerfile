# BuildKart hosted Mercur backend (Medusa + Mercur + bundled admin/vendor panels).
# Staging only — not a production image.

FROM oven/bun:1.3.11 AS bun-runtime
FROM node:22.22.0-bookworm-slim

# Bun is only needed at runtime for scripts that expect it; the build itself must run under Node.
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
COPY . .
# Install with Bun — this repo has no package-lock.json and uses bun.lock; plain `npm install`
# resolves a fresh (and conflicting) tree. The build scripts themselves still run under Node below.
RUN bun install --frozen-lockfile

# The panels MUST be built before the API, because the API's bundle-dashboards step copies them into
# the Medusa artifact.
#
# Build each workspace with npm (Node), NOT `turbo run build`: turbo runs the scripts under Bun, and
# the Mercur dashboard SDK loads medusa-config.ts through esbuild-register + require, which Bun
# rejects. When that happens the SDK silently falls back to base "/" and the panel assets 404 once
# served under /dashboard or /seller. Running vite under Node lets the SDK read the admin-ui/vendor-ui
# module paths and emit the correct asset base.
#
# NODE_ENV=production makes bundle-dashboards enforce the base path and the backend URL instead of
# warning and skipping.
ENV NODE_ENV=production
# The payment runtime guard reads BUILDKART_ENVIRONMENT before NODE_ENV. Without this the production
# image build would refuse to load medusa-config.ts with the simulated provider. Staging only.
ENV BUILDKART_ENVIRONMENT=staging
ARG MERCUR_BACKEND_URL
ENV MERCUR_BACKEND_URL=$MERCUR_BACKEND_URL

RUN npm run build --workspace @acme/admin
RUN npm run build --workspace @acme/vendor
RUN npm run build --workspace @acme/api

WORKDIR /app/packages/api
EXPOSE 9010
CMD ["npm", "run", "start"]
