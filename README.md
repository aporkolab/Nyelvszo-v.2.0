# NyelvSzó v2.2.0

English–Hungarian linguistic dictionary. Angol-magyar nyelvészeti szakszótár.

[![Build Status](https://img.shields.io/github/actions/workflow/status/APorkolab/Nyelvszo-v.2.0/ci.yml?branch=main)](../../actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)
[![Live](https://img.shields.io/badge/live-nyelvszo.eu-success)](https://nyelvszo.eu/)

---

## Overview

A searchable dictionary of linguistic terminology, compiled by Dr. Ádám Porkoláb and
Dr. Tamás Fekete. The repository holds two deployable pieces:

| Directory   | What it is                                                    |
|-------------|---------------------------------------------------------------|
| `backend/`  | REST API — Express 4, Mongoose 7, MongoDB                     |
| `frontend/` | Single-page client — Angular 21, standalone components        |

Anyone may read the dictionary without an account. Writing requires a token.

## Stack

**Backend** — Node.js 24 (`engines: >=24`), Express 4.22, Mongoose 7, MongoDB
(Atlas or self-hosted), JWT auth via `jsonwebtoken`, Joi validation, Winston
logging with daily rotation, OpenAPI 3.0 served by `swagger-ui-express`,
in-process response caching via `node-cache`.

**Frontend** — Angular 21, TypeScript 5.9, RxJS, a purpose-built CSS design
system (no UI framework),
`@ngx-translate` (Hungarian and English UI), `ngx-toastr`, `angular-feather`.

**Infrastructure** — multi-stage Dockerfiles for both apps, Nginx as the
production reverse proxy, GitHub Actions for CI.

There is no WebSocket layer, no CQRS/event-sourcing layer and no AI-assisted
search in this codebase. Earlier revisions of this file described all three;
they were never functional and have been removed.

---

## Quick start

### Prerequisites

- Node.js 24 or newer
- MongoDB 6+ (local, containerised, or an Atlas cluster)
- Docker, if you want to run the stack with Compose

### 1. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Generate the two JWT secrets — they must be different, and each at least 32
characters:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_REFRESH_SECRET
```

Paste them into `backend/.env`. The server validates its configuration before
it binds a port and exits with an explanatory message if anything is missing,
too short, or if the two secrets are identical.

### 2. Install and run

```bash
cd backend  && npm install && npm run dev     # http://localhost:3000
cd frontend && npm install && npm start       # http://localhost:4200
```

Useful URLs once the API is up:

- `http://localhost:3000/` — service descriptor
- `http://localhost:3000/api-docs` — interactive OpenAPI documentation
- `http://localhost:3000/health` — health summary

### 3. Seed data (optional)

```bash
cd backend && npm run seed
```

The seeder is a no-op for any collection that already contains documents.

---

## Environment variables

Backend only; `backend/.env.example` is the authoritative list.

### Database

| Variable | Default | Notes |
|----------|---------|-------|
| `MONGODB_URI` | — | Full connection string. Takes precedence over the `DB_*` parts. |
| `DB_HOST` | `localhost:27017` | Used when `MONGODB_URI` is unset. |
| `DB_USER`, `DB_PASS` | — | Credentials; URL-encoded before use. |
| `DB_NAME` | `nyelvszo` | Database name. |
| `DB_MAX_POOL_SIZE` | `10` | Connection pool size. |
| `DB_CONNECTION_TIMEOUT_MS` | `30000` | Server selection timeout. |
| `DB_SOCKET_TIMEOUT_MS` | `45000` | Socket timeout. |

At least one of `MONGODB_URI` and `DB_HOST` must be set.

### JWT

| Variable | Default | Notes |
|----------|---------|-------|
| `JWT_SECRET` | — | **Required.** Signs access tokens. 32+ characters. |
| `JWT_REFRESH_SECRET` | — | **Required.** Signs refresh tokens. 32+ characters, must differ from `JWT_SECRET`. |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime. |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime. |

### Server, CORS and limits

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3000` | Listen port. |
| `NODE_ENV` | `development` | `production` enables response caching and hides error internals. |
| `ALLOWED_ORIGINS` | `http://localhost:4200,https://nyelvszo.eu` | Comma-separated exact origins. **Required in production.** |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Global rate-limit window. |
| `RATE_LIMIT_MAX_REQUESTS` | `300` | Requests per window per IP. `/health*` is exempt. |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` | Login window. |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | `10` | Failed logins per window per IP; successful ones are not counted. |
| `TRUST_PROXY_HOPS` | `0` | Number of reverse proxies in front of the app. Never set it above the real hop count — each extra hop lets a client forge one more `X-Forwarded-For` entry and evade rate limiting. |
| `LOG_LEVEL` | `info` | Winston level. |
| `HELMET_ENABLED` | `true` | Set to `false` only to debug header problems locally. |

Rate limiting is disabled when `NODE_ENV=test`.

---

## Roles

Roles are numeric and stored on the account. Authorisation checks **exact
membership**, not rank — a route lists every role it admits.

| Value | Role   | Can do                                                                  |
|-------|--------|-------------------------------------------------------------------------|
| 1     | Viewer | Read entries. Reads are public anyway, so this is effectively a login with no write rights. |
| 2     | Editor | Everything a viewer can, plus create, update and delete entries.        |
| 3     | Admin  | Everything an editor can, plus bulk entry operations, user administration and `GET /health/detailed`. |

The role in a token is not trusted: every authenticated request re-reads the
account, so demoting or deactivating a user takes effect immediately instead of
when their token expires.

---

## API

Full reference at `/api-docs`; the spec lives in `backend/docs/swagger.yaml`.

| Method | Path | Auth |
|--------|------|------|
| GET | `/` | public |
| POST | `/login` | public |
| POST | `/login/refresh` | public |
| GET | `/entries` | public |
| GET | `/entries/popular` | public |
| GET | `/entries/recent` | public |
| GET | `/entries/statistics` | public |
| GET | `/entries/:id` | public |
| POST | `/entries` | editor, admin |
| PUT / PATCH | `/entries/:id` | editor, admin |
| DELETE | `/entries/:id` | editor, admin |
| POST | `/entries/bulk` | admin |
| GET / POST | `/users` | admin |
| GET / PUT / PATCH / DELETE | `/users/:id` | admin |
| GET | `/health` | public |
| GET | `/health/live` | public |
| GET | `/health/ready` | public |
| GET | `/health/detailed` | admin |

### Authentication flow

`POST /login` returns an access token and a refresh token. Send the access
token as `Authorization: Bearer <token>`; when it expires, `POST /login/refresh`
exchanges the refresh token for a **new pair** and the old refresh token should
be discarded.

### Search parameters

```
GET /entries?search=hang&page=1&limit=20&sortBy=alphabetical
```

| Parameter | Default | Notes |
|-----------|---------|-------|
| `page` | `1` | 1–10000. |
| `limit` | `20` | 1–100. |
| `search` | — | Prefix match against the Hungarian and English columns at once. |
| `hungarian`, `english`, `fieldOfExpertise`, `wordType` | — | Per-column prefix filters. When any of these is present, `search` is ignored. |
| `sortBy` | `relevance` | `relevance`, `alphabetical`, `newest`, `oldest`, `popular`. |
| `includeStats` | `false` | Appends a `statistics` block to the response. |

Unknown query parameters are rejected with `400`, not silently dropped.

### Response shapes

Collections return `{ data, pagination, meta }`, single resources `{ data }`,
and writes `{ data, meta }`. Errors always look like this:

```json
{
  "error": "Entry not found",
  "statusCode": 404,
  "type": "NotFoundError",
  "timestamp": "2026-01-31T10:12:44.108Z",
  "path": "/entries/507f1f77bcf86cd799439011"
}
```

`details` is present only on validation failures. A `stack` field is included
when `NODE_ENV` is `development` or `test`, never in production. `429`
responses are the one exception to the envelope: they come from the rate
limiter and carry only `error`.

---

## Security

Properties the code enforces, not aspirations:

- **Separate token secrets.** Access and refresh tokens are signed with
  different keys and carry a `typ` claim, so a refresh token cannot authorise
  API calls and an access token cannot renew itself indefinitely.
- **Pinned verification.** Algorithm (`HS256`), issuer and audience are all
  pinned, so an `alg: none` token or one minted for another service is rejected.
- **Live account checks.** Every authenticated request re-reads the account and
  rejects missing or deactivated ones.
- **Refresh rotation.** `POST /login/refresh` issues a new refresh token each
  time, limiting how long a stolen one stays useful.
- **Boot-time config validation.** The process refuses to start with missing,
  short, or identical JWT secrets, without a database target, or without
  `ALLOWED_ORIGINS` in production.
- **Allow-list validation.** Every body, path parameter and query string is
  checked against a Joi schema with `stripUnknown`; unknown fields are
  rejected. This is what keeps `?hungarian[$ne]=` from reaching the database
  filter as an object. Mongoose runs with `strictQuery` and `sanitizeFilter` as
  a second layer.
- **Field whitelists.** Controllers copy a fixed list of writable fields out of
  the request body, so `role`, `isActive`, `views` and the audit fields cannot
  be mass-assigned.
- **Admin lockout guards.** An administrator cannot revoke their own admin
  access, delete their own account, or remove the last active administrator.
- **Password handling.** bcrypt at 12 rounds, hashes excluded from queries by
  default, and 12+ character passwords requiring mixed case, a digit and a
  symbol. Login compares against a dummy hash when no account matches, so
  response time does not reveal whether an address is registered.
- **Log redaction.** Passwords, tokens and secrets are replaced with
  `[REDACTED]` before anything reaches a log file.
- **Cache isolation.** Responses to requests carrying an `Authorization` header
  are never cached or served from cache.
- **Rate limiting** on every route except health probes, with a tighter budget
  for `/login`, counted against a proxy hop count rather than a blanket
  `trust proxy`.
- **Security headers** via Helmet, including HSTS, `frame-ancestors 'none'` and
  a CSP with a correct `base-uri` directive. CORS is an exact-origin allow-list
  that fails closed.

Report a vulnerability privately to adam@porkolab.digital rather than opening
an issue.

---

## Scripts

### Backend (`cd backend`)

| Script | What it does |
|--------|--------------|
| `npm start` | Run the API. |
| `npm run dev` | Run under nodemon. |
| `npm test` | Full Jest suite. |
| `npm run test:unit` | Unit tests only. |
| `npm run test:integration` | Integration tests only. |
| `npm run test:watch` | Watch mode. |
| `npm run test:coverage` | Coverage report into `coverage/`. |
| `npm run test:ci` | CI run — coverage, two workers. |
| `npm run lint` / `lint:fix` | ESLint 9 (flat config in `eslint.config.mjs`). |
| `npm run format` / `format:check` | Prettier. |
| `npm run audit:prod` | `npm audit` over production dependencies, high and above. |
| `npm run seed` | Seed the database. |
| `npm run health` | `curl` the health endpoint (requires `jq`). |

### Frontend (`cd frontend`)

| Script | What it does |
|--------|--------------|
| `npm start` | Dev server on port 4200. |
| `npm run build` / `build:prod` | Production build into `dist/nyelvszo`. |
| `npm test` | Karma in headless Chrome, single run. |
| `npm run test:watch` / `test:coverage` | Watch mode / coverage. |
| `npm run lint` / `lint:check` | ESLint. |
| `npm run format` / `format:check` | Prettier. |
| `npm run analyze` | Bundle analysis. |

---

## Tests

The backend suite runs against an in-memory MongoDB (`mongodb-memory-server`),
so no local database is needed and nothing is written to a real one. Because
the suites share one `mongod`, Jest is pinned to a single worker.

```bash
cd backend
npm test                  # everything
npm run test:unit         # tests/unit
npm run test:integration  # tests/integration
npm run test:coverage
```

Coverage thresholds are set just below the suite's current numbers so a
regression fails the build. Raise them when coverage improves; do not lower
them to make CI green.

---

## Docker

```bash
docker compose up --build                              # development
docker compose -f docker-compose.prod.yml up --build   # production
```

Both Compose files require `JWT_SECRET` and `JWT_REFRESH_SECRET` and refuse to
start without them, so put both in a `.env` beside the compose file (see
`backend/.env.example`). Development binds MongoDB to `127.0.0.1` only. There is
no Redis service: the cache is in-process.

---

## Troubleshooting

**The API exits immediately with "Cannot start NyelvSzó API".** Configuration
validation failed; the listed problems are the actual cause. Usually a missing
or too-short `JWT_REFRESH_SECRET`.

**MongoDB connection error on startup.** Check `MONGODB_URI` or the `DB_*`
variables, and that the server is reachable: `docker compose ps`.

**Browser reports a CORS failure.** The origin is not in `ALLOWED_ORIGINS`. The
API deliberately omits the CORS headers rather than returning an error, so the
only symptom is the browser-side rejection.

**Port already in use.**

```bash
lsof -i :3000 && kill -9 <PID>
```

---

## Contact

- Site and technical issues — Dr. Ádám Porkoláb, adam@porkolab.digital
- Dictionary content and corrections — Dr. Tamás Fekete, fekete.tamas@pte.hu

## License

© 2021–2026 Dr. Ádám Porkoláb & Dr. Tamás Fekete.

The code is MIT-licensed. The dictionary content is protected by Hungarian
copyright law: private use is permitted, commercial use requires the authors'
permission.
