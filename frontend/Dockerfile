# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for the NyelvSzó Angular frontend.
#
# The syntax directive has to be the very first line: a parser directive that
# follows a comment is silently ignored.

ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=1.27-alpine

# ---------------------------------------------------------------------------
# Dependencies: manifests only, so the install layer survives source edits.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
LABEL maintainer="Dr. Ádám Porkoláb <adam@porkolab.digital>"
LABEL org.opencontainers.image.title="NyelvSzó Frontend"
LABEL org.opencontainers.image.version="2.2.0"
LABEL org.opencontainers.image.source="https://github.com/aporkolab/Nyelvszo-v.2.0"

WORKDIR /app

COPY package.json package-lock.json .npmrc ./

# `npm ci`, not `npm install`: the lockfile is the build input, and install
# would resolve newer versions than the ones the lockfile pins, so the image
# would differ from what CI tested.
#
# The Angular CLI comes from devDependencies (^21, same major as the
# framework). A globally installed CLI of a different major refuses to build
# the workspace, which is what `npm i -g @angular/cli@20` used to do here.
RUN npm ci

# ---------------------------------------------------------------------------
# Development: `ng serve` with live reload; compose bind-mounts the sources.
#
# Deliberately runs as root. The mounted tree belongs to whatever uid the host
# user has, and the dev server writes .angular/ and dist/ into it. The image
# that ships to production (below) is unprivileged.
# ---------------------------------------------------------------------------
FROM deps AS development
ENV NODE_ENV=development

COPY angular.json tsconfig*.json .browserslistrc ./
COPY src ./src

EXPOSE 4200

# busybox wget is part of alpine, so the probe needs no extra package.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:4200/ || exit 1

CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200", "--poll", "2000"]

# ---------------------------------------------------------------------------
# Build: the production bundle.
# ---------------------------------------------------------------------------
FROM deps AS build
ENV NODE_ENV=production
# The AOT compiler is memory hungry and the default heap is not enough on
# small CI runners.
ENV NODE_OPTIONS="--max-old-space-size=4096"

COPY angular.json tsconfig*.json .browserslistrc ./
COPY src ./src

# No `--build-optimizer=false --aot=false`: those two flags disabled ahead-of-
# time compilation and the optimiser, which shipped a bigger, slower bundle
# that also needed 'unsafe-eval' in the CSP to run the JIT compiler.
#
# The output directory is read back out of angular.json rather than hard-coded.
# It has already moved once (dist/nyelvszo2.0 under the webpack `browser`
# builder -> dist/nyelvszo under `@angular/build:application`, which also puts
# the bundle in a browser/ subdirectory unless outputPath.browser overrides
# it), and a stale path here would ship an empty document root that only shows
# up as a 404 in production. The index.html check turns any future move into a
# build failure instead.
RUN npm run build -- --configuration production && \
    OUT="$(node -e 'const c=require("./angular.json");const b=Object.values(c.projects)[0].architect.build;const app=/:application$/.test(b.builder);const p=b.options.outputPath;let d;if(typeof p==="string"){d=app?p+"/browser":p}else{const s=p.browser===undefined?(app?"browser":""):p.browser;d=s?p.base+"/"+s:p.base}process.stdout.write(d)')" && \
    test -f "$OUT/index.html" && \
    mv "$OUT" /site

# ---------------------------------------------------------------------------
# Runtime: static files behind nginx, unprivileged.
# ---------------------------------------------------------------------------
FROM nginx:${NGINX_VERSION} AS production

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=build /site /usr/share/nginx/html

# The image already ships an unprivileged `nginx` user (uid 101); it only needs
# the document root and the temp/cache directories. The pid file and the logs
# are kept out of root-owned paths by nginx.conf itself.
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx

USER nginx

# 8080, not 80: an unprivileged process cannot bind a port below 1024.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
