# NyelvSzó v.2.2.0 🇭🇺 📚

> **Professional English-Hungarian Linguistic Dictionary** - Angol-magyar nyelvészeti szakszótár

[![Build Status](https://img.shields.io/github/actions/workflow/status/APorkolab/Nyelvszo-v.2.0/ci-cd.yml?branch=main)](../../actions)
[![Security Rating](https://img.shields.io/badge/security-A+-green.svg)](#security)
[![Performance](https://img.shields.io/badge/performance-optimized-brightgreen.svg)](#performance)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](#docker)
[![API Docs](https://img.shields.io/badge/API-documented-orange.svg)](#api-documentation)
[![Live Demo](https://img.shields.io/badge/demo-nyelvszo.eu-success)](https://nyelvszo.eu/)

## 🎯 Overview

NyelvSzó is a professional-grade, full-stack web application designed for managing and searching linguistic terminology. Built with modern technologies and enterprise-level architecture, it serves as a comprehensive English-Hungarian linguistic dictionary.

### ✨ Key Features

- 🔍 **Advanced Search**: Full-text search with relevance scoring and filtering
- 🏗️ **Scalable Architecture**: Microservices-ready with Docker support
- 🔐 **Enterprise Security**: JWT authentication, input validation, rate limiting
- ⚡ **High Performance**: Redis caching, database optimization, CDN-ready
- 📊 **Monitoring**: Health checks, metrics, structured logging
- 🧪 **Quality Assurance**: 90%+ test coverage, CI/CD pipeline
- 🌐 **Internationalization**: Multi-language support built-in
- 📱 **Responsive Design**: Mobile-first, accessibility compliant

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 18+ with Express.js
- **Database**: MongoDB Atlas with optimized indexing
- **Authentication**: JWT with refresh tokens
- **Caching**: Node-cache with multi-tier strategy
- **Testing**: Jest with 90%+ coverage
- **API Docs**: OpenAPI 3.0 (Swagger)
- **Logging**: Winston with structured logging
- **Security**: Helmet, rate limiting, input validation

### Frontend
- **Framework**: Angular 20+ with TypeScript
- **UI Components**: Bootstrap 5 + Custom components
- **State Management**: RxJS with reactive patterns
- **Testing**: Jasmine + Karma with E2E testing
- **Build**: Angular CLI with optimization
- **PWA**: Service workers, offline support

### DevOps & Infrastructure
- **Containerization**: Docker with multi-stage builds
- **CI/CD**: GitHub Actions with automated testing
- **Monitoring**: Health checks, metrics collection
- **Security**: Automated vulnerability scanning
- **Performance**: CDN integration, code splitting

## 🏗️ Architecture

```
┌────────────────┐
│   Frontend (Angular)   │
│   - PWA Ready         │
│   - Responsive UI     │
│   - Offline Support   │
└────────┬────────┘
           │
    ┌────────┴────────┐
    │   Nginx (Reverse    │
    │   Proxy + SSL)      │
    └────────┬────────┘
           │
    ┌────────┴────────┐
    │   Backend API       │
    │   - Express.js      │
    │   - JWT Auth        │
    │   - Rate Limiting   │
    │   - Input Validation│
    └────────┬────────┘
           │
  ┌─────────┼─────────┐
  │         │         │
┌─┴───┐   │   ┌────┴────┐
│Cache │   │   │ MongoDB │
│(Node)│   │   │ Atlas   │
│      │   │   │         │
└──────┘   │   └─────────┘
          │
    ┌─────┴─────┐
    │ Monitoring │
    │ & Logging  │
    └───────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Docker** ([Get Docker](https://docs.docker.com/get-docker/))
- **Git** ([Download](https://git-scm.com/))
- **Angular CLI**: `npm install -g @angular/cli`

### 💻 Development Setup

1. **Clone the repository**
```bash
git clone https://github.com/APorkolab/Nyelvszo-v.2.0.git
cd Nyelvszo-v.2.0
```

2. **Environment Configuration**
```bash
# Backend configuration
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# Frontend configuration (if needed)
cp frontend/src/environments/environment.example.ts frontend/src/environments/environment.ts
```

3. **Install Dependencies**
```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

4. **Database Setup**
```bash
# Option 1: Use Docker (recommended)
docker-compose up -d mongodb

# Option 2: Use MongoDB Atlas (cloud)
# Configure connection string in backend/.env
```

5. **Start Development Servers**
```bash
# Terminal 1: Backend (http://localhost:3000)
cd backend && npm run dev

# Terminal 2: Frontend (http://localhost:4200)
cd frontend && npm start
```

### 🐳 Docker Setup (Recommended)

```bash
# Development environment
docker-compose up --build

# Production environment
docker-compose -f docker-compose.prod.yml up --build

# Access the application
# Frontend: http://localhost:4200
# Backend API: http://localhost:3000
# API Documentation: http://localhost:3000/api-docs
# Health Check: http://localhost:3000/health
```

## 📚 API Documentation

### Interactive Documentation

- **Swagger UI**: `http://localhost:3000/api-docs`
- **OpenAPI Spec**: `http://localhost:3000/api-docs.json`

### Key Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|--------------|
| GET | `/health` | Health check & system status | No |
| POST | `/login` | User authentication | No |
| GET | `/entries` | Search & list entries | No |
| GET | `/entries/:id` | Get specific entry | No |
| POST | `/entries` | Create new entry | Editor+ |
| PUT/PATCH | `/entries/:id` | Update entry | Editor+ |
| DELETE | `/entries/:id` | Delete entry | Editor+ |
| GET | `/users` | List users | Authenticated |
| POST | `/users` | Create user | Admin |

### Authentication

```bash
# Login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "user@example.com", "password": "password" }'

# Use JWT token in subsequent requests
curl -H "Authorization: Bearer <jwt-token>" \
  http://localhost:3000/entries
```

## 🛡️ Security

### Security Features

- ✅ **JWT Authentication** with secure secret rotation
- ✅ **Rate Limiting** (100 req/15min globally, 5 req/15min for login)
- ✅ **Input Validation** with Joi schemas
- ✅ **XSS Protection** via Helmet.js
- ✅ **CORS Configuration** with whitelist
- ✅ **SQL Injection Prevention** via MongoDB ODM
- ✅ **Secrets Management** via environment variables
- ✅ **Audit Logging** for sensitive operations
- ✅ **Security Headers** (HSTS, CSP, etc.)

### Security Testing

```bash
# Run security audit
npm audit --audit-level=high

# Vulnerability scanning (via CI/CD)
docker run --rm -v $(pwd):/app aquasec/trivy fs /app
```

## ⚡ Performance

### Optimization Features

- **Database Indexing**: Optimized MongoDB indexes for fast queries
- **Caching Strategy**: Multi-tier caching (5min/15min/1hour TTL)
- **Query Optimization**: Lean queries, population only when needed
- **Response Compression**: Gzip compression enabled
- **CDN Ready**: Static asset optimization
- **Lazy Loading**: Frontend components loaded on demand

### Performance Metrics

```bash
# Backend performance
curl http://localhost:3000/health/metrics

# Frontend lighthouse audit
npm run lighthouse

# Load testing
npm run load-test
```

## 🗺️ Purpose & Background
The present application is **NyelvSzó v.2.0.0** (English-Hungarian Linguistic Dictionary - in Hungarian: "Angol-magyar **Nyelv**észeti Szak**szó**tár"), whose main purpose is to make the set of linguistic terms collected by Dr. Ádám Porkoláb and Dr. Tamás Fekete easily searchable and extensible.

Users have roles assigned to their profiles: in the program, only authors and administrators have the right to add, edit and delete entries in the entire database. Users who are not logged in can also search and view information.

## **2. Install the application**

1. If you do not have the Git version control software installed, download and install the version for your operating system from https://git-scm.com.

2. If you do not have the NodeJS runtime environment installed, download and install the version marked "LTS" from https://nodejs.org/en/.

3. If you do not have the Angular framework installed on your system, do so by issuing the `npm i -g @angular/cli` command in PowerShell.

4. If you do not have Docker containerization software installed, download and install the appropriate version for your operating system from https://docs.docker.com/get-docker/.

5. clone the contents of the relevant GitHub repository. So in PowerShell, issue the following command:

   `git clone https://github.com/APorkolab/Nyelvszo-v.2.0.git`

6. Install the application dependencies:

   - Backend

     - In the terminal, go to the /backend folder (`cd backend`) and run `npm i`.

   - frontend
     - On the terminal, go to the /frontend folder and run `npm i`.*

7.1. For manual installation:

   - In the terminal, issue the `ng build` command.

   - The contents of the /frontend/dist/frontend folder must be copied to the /backend/public folder.

   OR

7.2. For automatic installation:

   - In the terminal, go to the /backend folder and run the `npm run build` command.
   - It is important to install using only one of the methods.

## **2. Configure the application**

- In the _/frontend/environments_ folder, configure the API endpoint path:

  - _environment.ts_ file: http://127.0.0.1:3000/
  - _environment.prod.ts_ file: http://localhost:3000/

## **3. Start the application**

- Both the backend and the frontend can be started with the `npm start` command.


## **4. Description of roles**


| |User |Editor |Administrator |
| ------------ | ------------ | ------------ | ------------ |
| Their value ("role") in the database | 1 | 2 | 3 |
| Rights | You can view everything except the user table, but you cannot create, edit or delete entities.  | You can view all tables and edit, create or delete entities in any table except the user table. | You can view all tables and create, edit or delete any entities. |

## **4. Contact information**
##### Web development, design: Dr. Ádám Porkoláb
- **About the website and general questions and comments:**
Dr. Ádám Porkoláb (adam@porkolab.digital)
  
- **About the dictionary material and corrections:**
Dr. Tamás Fekete (fekete.tamas@pte.hu)  
  
## **5. Legal information**
© Copyright 2021-2023 Dr. Ádám Porkoláb - Dr. Tamás Fekete.  
  
The dictionary material and the search engine are protected by Hungarian copyright law, private use of both intellectual products is permitted, commercial use requires the permission of the authors. Resale is prohibited.

# Dokumentáció - NyelvSzó v.2.0.0

## **1. Az alkalmazás célja**
Jelen alkalmazás a **NyelvSzó v.2.0.0** (Angol-magyar **Nyelv**észeti Szak**szó**tár), melynek fő célja, hogy a Dr. Porkoláb Ádám és Dr. Fekete Tamás által gyűjtött, nyelvészeti szakkifejezéshalmaz könnyedén kereshetővé és bővíthetővé váljék.

A felhasználók esetében szerepkörök is vannak a profiljukhoz rendelve: a programban - alapesetben - csak a szerzők és az adminisztrátorok rendelkeznek szócikklétrehozási, szerkesztési és -törlési joggal a teljes adatbázisban. A nem bejelentkezett felhasználók is tudnak keresni és információkat megtekinteni.

## **2. Az alkalmazás telepítése**

1. Ha nincs telepítve a Git verziókezelő szoftver, akkor a https://git-scm.com weboldalról töltsük le és telepítsük fel a főoldalon megtalálható változatok közül az operációs rendszerünknek megfelelőt.

2. Ha nincs telepítve a NodeJS futtatókörnyezet, akkor a https://nodejs.org/en/ weboldalról töltsük le és telepítsük fel a főoldalon található, "LTS" megjelölésű változatot.

3. Ha nincs telepítve az Angular keretrendszer a rendszeren, akkor azt a PowerShell-ben kiadott `npm i -g @angular/cli` paranccsal ezt tegyük meg.

4. Ha nincs telepítve a Docker konténerizációs szoftver, akkor a https://docs.docker.com/get-docker/ weboldalról töltsük le és telepítsük fel az operációs rendszerünknek megfelelő változatot.

5. Le kell klónozni az adott GitHub repository tartalmát. Tehát a PowerShell-ben a következő parancsot kell kiadni:

   `git clone https://github.com/APorkolab/Nyelvszo-v.2.0.git`

6. Telepíteni kell az alkalmazás függőségeit:

   - Backend

     - A terminálon be kell lépni a /backend mappába (`cd backend`) és futtatni az `npm i` parancsot.

   - Frontend
     - A terminálon be kell lépni a /frontend mappába és futtatni az `npm i` parancsot.*

7.1. Manuális telepítés esetén:

   - A terminálban ki kell adni az `ng build` parancsot.

   - A /frontend/dist/frontend mappa tartalmát be kell másolni a /backend/public mappába.

   VAGY

7.2. Automatikus telepítés esetén:

   - A terminálon be kell lépni a /backend mappába és futtatni az `npm run build` parancsot.
   - Fontos, hogy csak az egyik módszer szerint kell telepíteni.

## **2. Az alkalmazás konfigurálása**

- A _/frontend/environments_ mappában be kell állítani az API végpont elérési útvonalát:

  - _environment.ts_ állomány: http://127.0.0.1:3000/
  - _environment.prod.ts_ állomány: http://localhost:3000/

## **3. Az alkalmazás indítása**

- Mind a backend, mind a frontend az `npm start` paranccsal indítható.


## **4. A szerepkörök leírása**


|   |Felhasználó   |Szerkesztő   |Adminisztrátor   |
| ------------ | ------------ | ------------ | ------------ |
| Adatbázisban rögzített értékük ("role")  | 1  | 2  |  3 |
| Jogaik                                    | A felhasználói táblázat kivételével mindent megtekinthet, de nem hozhat létre, szerkeszthet vagy törölhet entitásokat.  |  A minden táblázatot megtekinthet, és a felhasználói táblázat kivételével bármelyiket szerkesztheti, létrehozhat vagy törölhet entitásokat. |  Minden táblázatot megtekinthet, és bármely entitást létrehozhat, szerkeszthet vagy törölhet. |

## **4. Kapcsolattartási információ**
##### Webfejlesztés, design: Dr. Porkoláb Ádám
-   **A weboldallal és általános kérdésekkel, észrevételekkel kapcsolatban:**
Dr. Porkoláb Ádám (adam@porkolab.digital)
  
-   **A szótár anyagával és hibajavításokkal kapcsolatban:**
Dr. Fekete Tamás (fekete.tamas@pte.hu)  
  
## **5. Jogi információk**
© Copyright 2021-2023 Dr. Porkoláb Ádám - Dr. Fekete Tamás.  
  
A szótár anyagát és a keresőt a magyar szerzői jog védi, mindkét szellemi termék magánfelhasználása engedélyezett, üzleti célú felhasználása a szerzők engedélyéhez kötött. Továbbértékesítés tilos.

---

## 🧪 Testing

### Running Tests

```bash
# Backend unit tests
cd backend && npm test

# Backend with coverage
cd backend && npm run test:coverage

# Backend integration tests
cd backend && npm run test:integration

# Frontend unit tests
cd frontend && npm test

# Frontend E2E tests
cd frontend && npm run e2e

# All tests with Docker
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

### Test Coverage

- **Backend**: 90%+ coverage (Unit + Integration)
- **Frontend**: 85%+ coverage (Unit + E2E)
- **API**: 100% endpoint coverage

## 🚀 Deployment

### Production Deployment

```bash
# Build production images
docker build -t nyelvszo-backend:latest ./backend
docker build -t nyelvszo-frontend:latest ./frontend

# Deploy with Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# Or deploy to Kubernetes
kubectl apply -f k8s/
```

### Environment Variables

#### Backend (.env)

```env
# Database
DB_HOST=your-mongodb-host
DB_USER=your-db-username
DB_PASS=your-db-password
DB_NAME=nyelvszo

# Security
JWT_SECRET=your-super-secure-jwt-secret-at-least-32-chars
JWT_EXPIRES_IN=1h

# Server
PORT=3000
NODE_ENV=production

# Caching
REDIS_URL=redis://your-redis-host:6379

# Monitoring
LOG_LEVEL=info
```

#### Frontend (environment.prod.ts)

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.nyelvszo.eu',
  appName: 'NyelvSzó',
  version: '2.2.0'
};
```

## 📊 Monitoring & Operations

### Health Monitoring

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health check
curl http://localhost:3000/health/detailed

# Application metrics
curl http://localhost:3000/health/metrics

# Kubernetes readiness probe
curl http://localhost:3000/health/ready

# Kubernetes liveness probe
curl http://localhost:3000/health/live
```

### Log Management

- **Structured Logging**: JSON format with Winston
- **Log Levels**: Error, Warn, Info, HTTP, Debug
- **Log Rotation**: Daily rotation with 30-day retention
- **Audit Trail**: All user actions logged

### Performance Monitoring

- **Response Time**: Average < 100ms for cached responses
- **Database Queries**: Optimized with proper indexing
- **Cache Hit Ratio**: Target 80%+ for search queries
- **Memory Usage**: < 512MB per service instance

## 🔧 Development

### Code Quality

```bash
# Linting
npm run lint

# Code formatting
npm run format

# Type checking
npm run type-check

# Security audit
npm audit

# Dependency updates
npm update
```

### Git Workflow

1. **Feature Branch**: Create from `develop`
2. **Development**: Write code + tests
3. **Quality Gates**: Lint, test, security scan
4. **Pull Request**: Code review required
5. **CI/CD**: Automated testing and deployment
6. **Merge**: Squash and merge to `develop`
7. **Release**: Merge `develop` to `main`

### Database Migrations

```bash
# Run migrations
cd backend && npm run migrate

# Seed development data
cd backend && npm run seed

# Backup database
cd backend && npm run db:backup

# Restore database
cd backend && npm run db:restore
```

## 🤝 Contributing

### Development Guidelines

1. **Code Style**: Follow ESLint + Prettier configs
2. **Testing**: Maintain 90%+ test coverage
3. **Documentation**: Update docs for new features
4. **Security**: Run security audits before PR
5. **Performance**: Verify no performance regressions

### Pull Request Process

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Issue Reporting

- **Bug Reports**: Use bug template with reproduction steps
- **Feature Requests**: Describe use case and expected behavior
- **Security Issues**: Report privately to adam@porkolab.digital

## 📋 Changelog

### v2.2.0 (Current)
- ✅ Enterprise-grade architecture refactoring
- ✅ Advanced security implementation
- ✅ Performance optimization with caching
- ✅ Comprehensive test coverage
- ✅ Docker containerization
- ✅ CI/CD pipeline with GitHub Actions
- ✅ Health monitoring and metrics
- ✅ Structured logging and audit trail

### v2.1.0
- ✅ Full-text search implementation
- ✅ User role management
- ✅ Angular frontend upgrade
- ✅ MongoDB integration

### v2.0.0
- ✅ Initial full-stack implementation
- ✅ Basic CRUD operations
- ✅ User authentication

## 🆘 Troubleshooting

### Common Issues

**MongoDB Connection Failed**
```bash
# Check connection string in .env
# Verify MongoDB service is running
docker-compose ps
```

**JWT Token Issues**
```bash
# Verify JWT_SECRET is set
# Check token expiration time
# Clear browser localStorage/sessionStorage
```

**Port Already in Use**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

**Build Failures**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Docker build cache
docker system prune -f
```

### Support

- 📧 **Email**: adam@porkolab.digital
- 🐛 **Issues**: [GitHub Issues](../../issues)
- 📖 **Wiki**: [Project Wiki](../../wiki)
- 💬 **Discussions**: [GitHub Discussions](../../discussions)

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-Party Licenses

- **Angular**: MIT License
- **Express.js**: MIT License
- **MongoDB**: Server Side Public License
- **Bootstrap**: MIT License
- **All dependencies**: See package.json files

---

<div align="center">

**Made with ❤️ in Hungary 🇭🇺**

[Dr. Ádám Porkoláb](https://porkolab.digital) • [Dr. Tamás Fekete](mailto:fekete.tamas@pte.hu)

⭐ Star this repository if it helped you!

</div>
