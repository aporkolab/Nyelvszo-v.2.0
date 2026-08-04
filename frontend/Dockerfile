# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for the NyelvSzó Angular frontend.
#
# The syntax directive has to be the very first line: a parser directive that
# follows a comment is silently ignored.

ARG NODE_VERSION=24-alpine

# 1.30.4-alpine, not 1.27-alpine. Resolved 2026-08-04 to nginx 1.30.4 on
# Alpine 3.24.1, digest
# sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46.
#
# The old pin was the actual CVE source, not anything we wrote. `1.27-alpine`
# is a release-branch tag: Docker rebuilds it only while that branch is
# current, and 1.27 stopped being current long ago, so the tag froze on Alpine
# 3.21.3 and kept shipping package versions Alpine had already patched — 35
# fixable HIGH/CRITICAL findings (c-ares, libcrypto3/libssl3, libexpat,
# libpng, libxml2, musl/musl-utils, nghttp2-libs, zlib), every one of them
# inherited from the base image.
#
# Why this tag specifically, measured on the date above:
#   1.27-alpine  -> Alpine 3.21.3  (dead branch, 35 findings)
#   1.28-alpine  -> Alpine 3.23.3  (stale)
#   1.29-alpine  -> Alpine 3.23.4  (stale)
#   1.30-alpine  -> Alpine 3.24.1  (current, 0 findings)  <- stable branch
#   alpine / mainline-alpine -> Alpine 3.24.1, nginx 1.31.3 (mainline)
#
# 1.30.x is nginx's stable branch (even minor); 1.31.x is mainline. Both scan
# clean, and stable is the conservative pick for a box that only serves static
# files — it takes bugfixes and security patches but no feature work, so an
# image rebuild cannot change proxying or header behaviour underneath us.
#
# Pinned to the patch level rather than to `1.30-alpine` or `alpine`: a
# floating tag can silently become a different nginx between two builds of the
# same commit. The cost of pinning is that the tag stops receiving Alpine
# patches, which is what the `apk upgrade` in the runtime stage covers — see
# the note there. Bump this pin when nginx 1.30 leaves stable.
ARG NGINX_VERSION=1.30.4-alpine

# ---------------------------------------------------------------------------
# Dependencies: manifests only, so the install layer survives source edits.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
LABEL maintainer="Dr. Ádám Porkoláb <adam@porkolab.digital>"
LABEL org.opencontainers.image.title="NyelvSzó Frontend"
LABEL org.opencontainers.image.version="2.5.0"
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

# Pinning the base fixes the packages to whatever that image shipped with, and
# Alpine keeps patching the 3.24 branch after the image is cut. Without this
# the pin slowly accumulates exactly the kind of findings that the old
# 1.27-alpine tag had accumulated by the time anyone scanned it.
#
# `apk upgrade` pulls the current 3.24 packages at build time, so the image
# stays clean as it ages without the tag having to move. It is a same-branch
# upgrade (the repositories in the base point at v3.24/main and v3.24/community
# — no branch hop), so it takes security patches only and cannot drag in a new
# major of anything nginx links against.
#
# --no-cache leaves no package index behind to bloat the layer, and the
# trailing `nginx -t` is on the stock config — it only asserts that the
# upgraded libraries still load and the binary still runs. Our own config is
# validated further down, once it has been copied in.
RUN apk upgrade --no-cache && nginx -t

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=build /site /usr/share/nginx/html

# The image already ships an unprivileged `nginx` user (uid 101); it only needs
# the document root and the temp/cache directories. The pid file and the logs
# are kept out of root-owned paths by nginx.conf itself.
#
# `nginx -t` against the real config, as a build-time gate. The base moved from
# nginx 1.27 to 1.30, and a directive that a newer nginx has dropped or renamed
# would otherwise surface as a container that crash-loops on first start in
# production. Here it fails the build instead.
#
# The `rm` is not tidiness, it is required. `nginx -t` creates the pid file
# from the config (/tmp/nginx.pid) and leaves it behind owned by root, because
# this layer still runs as root. The runtime process is uid 101 and cannot
# reopen a root-owned pid file, so leaving it there makes every container exit
# immediately with:
#   [emerg] open() "/tmp/nginx.pid" failed (13: Permission denied)
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx && \
    nginx -t && \
    rm -f /tmp/nginx.pid

USER nginx

# 8080, not 80: an unprivileged process cannot bind a port below 1024.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
