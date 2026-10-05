# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Web dashboard image — build context is the repository root:
#   docker build -f apps/web/Dockerfile -t cloud-devops-web .
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1 — build the static bundle with Vite
FROM node:26-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/web --no-audit --no-fund

COPY apps/web apps/web

ARG APP_VERSION=dev
ARG GIT_COMMIT=local
ENV VITE_APP_VERSION=${APP_VERSION} \
    VITE_GIT_COMMIT=${GIT_COMMIT}
RUN npm run build --workspace apps/web


# Stage 2 — serve with unprivileged NGINX (runs as UID 101 on port 8080)
FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime

ARG APP_VERSION=dev
ARG GIT_COMMIT=local
LABEL org.opencontainers.image.title="cloud-devops-web" \
      org.opencontainers.image.description="Cloud DevOps Platform — DORA metrics dashboard" \
      org.opencontainers.image.source="https://github.com/yuvi1-1/cloud-devops-platform" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.licenses="MIT"

# Pull in Alpine security fixes published after the base image was built.
USER root
# hadolint ignore=DL3017
RUN apk upgrade --no-cache
USER 101

COPY --chown=101:101 apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /repo/apps/web/dist /usr/share/nginx/html

USER 101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
