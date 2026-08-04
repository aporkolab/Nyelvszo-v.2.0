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
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS production
ENV NODE_ENV=production

RUN apk add --no-cache curl ca-certificates && rm -rf /var/cache/apk/*

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
