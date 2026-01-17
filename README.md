# NyelvSzó v.2.2.0

> **Professional English-Hungarian Linguistic Dictionary** - Angol-magyar nyelvészeti szakszótár

[![Build Status](https://img.shields.io/github/actions/workflow/status/APorkolab/Nyelvszo-v.2.0/ci-cd.yml?branch=main)](../../actions)
[![Security Rating](https://img.shields.io/badge/security-A+-green.svg)](#security)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](#docker-setup)
[![Live Demo](https://img.shields.io/badge/demo-nyelvszo.eu-success)](https://nyelvszo.eu/)

---

## Overview

NyelvSzó is a full-stack web application for managing and searching linguistic terminology. It serves as a comprehensive English-Hungarian linguistic dictionary, created by Dr. Ádám Porkoláb and Dr. Tamás Fekete.

### Key Features

- **Advanced Search**: Full-text search with column filtering (Hungarian, English, Field of Expertise, Word Type)
- **User Roles**: Guest (view), Editor (create/edit), Administrator (full access)
- **Security**: JWT authentication, rate limiting, input validation
- **Performance**: Server-side pagination, MongoDB indexing, caching
- **Internationalization**: Hungarian and English UI
- **Responsive Design**: Mobile-first Bootstrap 5 UI

---

## Tech Stack

### Backend
- **Runtime**: Node.js 18+ with Express.js
- **Database**: MongoDB (Atlas or local)
- **Authentication**: JWT with refresh tokens
- **Logging**: Winston with daily rotation
- **API Docs**: OpenAPI 3.0 (Swagger)

### Frontend
- **Framework**: Angular 20 with TypeScript
- **UI**: Bootstrap 5
- **State Management**: RxJS
- **Build**: Angular CLI

### Infrastructure
- **Containerization**: Docker with multi-stage builds
- **CI/CD**: GitHub Actions
- **Reverse Proxy**: Nginx

---

## Quick Start

### Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- Docker ([Get Docker](https://docs.docker.com/get-docker/))
- Git ([Download](https://git-scm.com/))

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/APorkolab/Nyelvszo-v.2.0.git
cd Nyelvszo-v.2.0
```

2. **Configure environment**

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your MongoDB and JWT settings
```

3. **Install dependencies**

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

4. **Start development servers**

```bash
# Terminal 1: Backend (http://localhost:3000)
cd backend && npm run dev

# Terminal 2: Frontend (http://localhost:4200)
cd frontend && npm start
```

### Docker Setup

```bash
# Development
docker-compose up --build

# Production
docker-compose -f docker-compose.prod.yml up --build

# Access points:
# - Frontend: http://localhost:4200
# - Backend API: http://localhost:3000
# - API Docs: http://localhost:3000/api-docs
# - Health Check: http://localhost:3000/health
```

---

## API Documentation

Interactive documentation available at: `http://localhost:3000/api-docs`

### Key Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/health` | Health check | No |
| POST | `/login` | Authentication | No |
| GET | `/entries` | Search entries | No |
| GET | `/entries/:id` | Get entry | No |
| POST | `/entries` | Create entry | Editor+ |
| PUT | `/entries/:id` | Update entry | Editor+ |
| DELETE | `/entries/:id` | Delete entry | Editor+ |
| GET | `/users` | List users | Admin |

### Search Parameters

```
GET /entries?hungarian=nyelv&page=1&limit=25&sortBy=alphabetical
```

| Parameter | Description |
|-----------|-------------|
| `hungarian` | Filter by Hungarian column |
| `english` | Filter by English column |
| `fieldOfExpertise` | Filter by field |
| `wordType` | Filter by word type |
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 25) |
| `sortBy` | alphabetical, newest, oldest, popular |

---

## User Roles

| Role | Value | Permissions |
|------|-------|-------------|
| User | 1 | View entries only |
| Editor | 2 | View, create, edit, delete entries |
| Administrator | 3 | Full access including user management |

---

## Environment Variables

### Backend (.env)

```env
# Database (Option 1: Full URI)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/nyelvszo

# Database (Option 2: Individual values)
DB_HOST=your-mongodb-host
DB_USER=your-username
DB_PASS=your-password
DB_NAME=nyelvszo

# Security
JWT_SECRET=your-secure-jwt-secret-at-least-32-chars
JWT_EXPIRES_IN=1h

# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
```

---

## Development

### Code Quality

```bash
# Linting
npm run lint

# Formatting
npx prettier --write "src/**/*.{js,ts,html,scss}"

# Security audit
npm audit --audit-level=high

# Tests
npm test
```

### Build for Production

```bash
# Backend Docker image
docker build -t nyelvszo-backend:latest ./backend --target production

# Frontend Docker image
docker build -t nyelvszo-frontend:latest ./frontend --target production
```

---

## Troubleshooting

### MongoDB Connection Failed
- Verify `MONGODB_URI` or `DB_*` variables in `.env`
- Check if MongoDB service is running: `docker-compose ps`

### Port Already in Use
```bash
lsof -i :3000
kill -9 <PID>
```

### Build Failures
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## Contact

- **Website & Technical Issues**: Dr. Ádám Porkoláb (adam@porkolab.digital)
- **Dictionary Content & Corrections**: Dr. Tamás Fekete (fekete.tamas@pte.hu)

---

## License

© 2021-2026 Dr. Ádám Porkoláb & Dr. Tamás Fekete

This project is licensed under the MIT License. The dictionary content is protected by Hungarian copyright law. Private use is permitted; commercial use requires author permission.

---

<div align="center">

**Made in Hungary**

[Dr. Ádám Porkoláb](https://porkolab.digital) • [Dr. Tamás Fekete](mailto:fekete.tamas@pte.hu)

</div>
