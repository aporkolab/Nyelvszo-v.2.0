# Multi-stage Dockerfile for the NyelvSzó Node.js backend
# syntax=docker/dockerfile:1

ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------------------
# Base: package manifests only, so dependency layers stay cached across
# source changes.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
LABEL maintainer="Dr. Ádám Porkoláb <adam@porkolab.digital>"
LABEL org.opencontainers.image.title="NyelvSzó Backend API"
LABEL org.opencontainers.image.version="2.2.0"
LABEL org.opencontainers.image.source="https://github.com/aporkolab/Nyelvszo-v.2.0"

WORKDIR /app

# curl is required by the HEALTHCHECK instructions below.
RUN apk add --no-cache curl ca-certificates && rm -rf /var/cache/apk/*

COPY package.json package-lock.json ./

# ---------------------------------------------------------------------------
# Development: full dependency tree, live reload.
# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development

RUN npm ci --include=dev

COPY . .
RUN mkdir -p logs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:3000/health/live || exit 1

CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# Testing: runs the suite at build time so a broken suite fails the image.
# ---------------------------------------------------------------------------
FROM development AS testing
ENV NODE_ENV=test
ENV JWT_SECRET=ci-only-secret-value-at-least-32-characters-long
RUN npm test

# ---------------------------------------------------------------------------
# Production dependencies: no devDependencies, no lifecycle scripts.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
ENV NODE_ENV=production
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---------------------------------------------------------------------------
# Production: minimal runtime, non-root, only the files the server needs.
#
# The runtime carries no package manager. CMD is `node src/index.js`, the
# HEALTHCHECK is curl, and nothing under src/ or config/ shells out — so npm,
# npx, corepack and yarn are never invoked here. They are not merely dead
# weight: npm's own bundled dependencies (brace-expansion, ip-address, tar,
# undici) were the sole source of every HIGH/CRITICAL finding in this image,
# and a package manager present in a production container is a ready-made
# tool for an attacker who gets code execution. Removing them is the fix.
#
# `apk upgrade` is deliberate. The base tag node:24-alpine is mutable and can
# lag Alpine's security releases; when it does, an ignore-unfixed HIGH/CRITICAL
# gate turns red and blocks deploys through no fault of this repository. The
# build is already non-reproducible by construction (floating base tag,
# unpinned `apk add`), so upgrading adds no new class of non-determinism and
# costs nothing while the base is current.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS production
ENV NODE_ENV=production

RUN apk upgrade --no-cache \
    && apk add --no-cache curl ca-certificates \
    && rm -rf /var/cache/apk/* \
    && rm -rf \
        /usr/local/lib/node_modules/npm \
        /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm \
        /usr/local/bin/npx \
        /usr/local/bin/corepack \
        /usr/local/bin/yarn \
        /usr/local/bin/yarnpkg \
        /opt/yarn-v* \
        /root/.npm \
    && node --version \
    && for tool in npm npx corepack yarn yarnpkg; do \
           if command -v "$tool" >/dev/null 2>&1; then \
               echo "FATAL: $tool still present in the production stage" >&2; \
               exit 1; \
           fi; \
       done

WORKDIR /app

# node:alpine already ships an unprivileged `node` user (uid 1000).
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node docs ./docs
COPY --chown=node:node config ./config
COPY --chown=node:node package.json package-lock.json ./

RUN mkdir -p logs && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:3000/health/live || exit 1

# No npm wrapper: `node` becomes PID 1 and receives SIGTERM directly, which is
# what the graceful-shutdown handler in src/index.js relies on.
CMD ["node", "src/index.js"]
