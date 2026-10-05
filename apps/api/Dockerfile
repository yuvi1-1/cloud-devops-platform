# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# API image — build context is the repository root:
#   docker build -f apps/api/Dockerfile -t cloud-devops-api .
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1 — compile TypeScript
FROM node:26-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/api --no-audit --no-fund
COPY apps/api apps/api
RUN npm run build --workspace apps/api


# Stage 2 — production dependencies only
FROM node:26-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/api --omit=dev --no-audit --no-fund


# Stage 3 — distroless runtime: no shell, no package manager, non-root (UID 65532)
FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime

ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.title="cloud-devops-api" \
      org.opencontainers.image.description="Cloud DevOps Platform — DORA metrics API" \
      org.opencontainers.image.source="https://github.com/yuvi1-1/cloud-devops-platform" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT} \
    PORT=3000

# Amazon RDS CA bundle so TLS to RDS is verified (DATABASE_SSL_CA_FILE).
ADD --chmod=0444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist

USER 65532:65532
EXPOSE 3000

# The distroless entrypoint is `node`; the migration Job overrides CMD with dist/migrate.js
CMD ["dist/index.js"]
