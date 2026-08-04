const path = require('path');
const express = require('express');
const config = require('config');
const morgan = require('morgan');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const logger = require('./logger/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

/**
 * Read a numeric setting from the environment.
 *
 * `process.env` values are always strings. express-rate-limit silently accepts
 * a string `windowMs` and then produces nonsensical reset times, so every
 * numeric option has to be coerced explicitly.
 *
 * @param {string} name - Environment variable name.
 * @param {number} fallback - Value to use when unset or unparseable.
 * @returns {number} Parsed number.
 */
const numericEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// ---------------------------------------------------------------------------
// Proxy awareness
//
// Must be configured before the rate limiter: behind a reverse proxy every
// request otherwise appears to come from the proxy's IP, and a single visitor
// exhausts the limit for everyone. `trust proxy` is a hop count rather than
// `true`, because `true` lets a client forge X-Forwarded-For and evade limits.
// ---------------------------------------------------------------------------
const trustProxyHops = numericEnv('TRUST_PROXY_HOPS', 0);
if (trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// Do not advertise the framework.
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
if (process.env.HELMET_ENABLED !== 'false') {
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI ships inline styles; the API serves no HTML of its own
          // beyond that, so this stays narrow.
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          frameSrc: ["'none'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          // Correct directive name. The previous `baseSrc` key emitted a
          // `base-src` directive, which no browser implements — the policy was
          // silently absent.
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );
}

app.use(compression());

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
let mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  const { host, user, pass, name = 'nyelvszo', protocol = 'mongodb+srv' } = config.get('database');
  const credentials =
    user && pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : '';
  mongoUri = `${protocol}://${credentials}${host}/${name}`;
}

const isAtlas = mongoUri.startsWith('mongodb+srv://');

// Reject unknown operators in query filters rather than silently ignoring them.
mongoose.set('strictQuery', true);
// Strip keys beginning with `$` from filters — defence in depth behind the Joi
// schemas, so a missed validation cannot become NoSQL injection.
mongoose.set('sanitizeFilter', true);

if (process.env.NODE_ENV !== 'test') {
  mongoose
    .connect(mongoUri, {
      maxPoolSize: numericEnv('DB_MAX_POOL_SIZE', 10),
      serverSelectionTimeoutMS: numericEnv('DB_CONNECTION_TIMEOUT_MS', 30000),
      socketTimeoutMS: numericEnv('DB_SOCKET_TIMEOUT_MS', 45000),
      ...(isAtlas && { retryWrites: true }),
    })
    .then(() => logger.info(`Connected to MongoDB (${isAtlas ? 'Atlas' : 'self-hosted'})`))
    .catch((err) => {
      logger.error('MongoDB connection error', { error: err.message });
      process.exit(1);
    });
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200,https://nyelvszo.eu')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and non-browser callers (curl, server-to-server) send no
      // Origin header at all.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      logger.security('Blocked cross-origin request', { origin });
      // Resolve with `false` rather than rejecting: passing an Error makes the
      // cors middleware forward it to the error handler, which answered a
      // disallowed origin with a 500 instead of simply omitting the CORS
      // headers and letting the browser refuse.
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  })
);

// ---------------------------------------------------------------------------
// Request logging and body parsing
// ---------------------------------------------------------------------------
app.use(
  morgan('combined', {
    stream: logger.stream,
    skip: () => process.env.NODE_ENV === 'test',
  })
);

// Express's built-in parsers; body-parser is the same code re-exported and no
// longer needs to be a separate dependency. 100 kB is ample for a dictionary
// entry and leaves no room for a memory-pressure payload.
app.use(express.json({ limit: '100kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ---------------------------------------------------------------------------
// Rate limiting
//
// Deliberately mounted AFTER cors and after body parsing:
//   - after cors, so a 429 still carries the Access-Control-Allow-Origin
//     header. Without it the browser reports a generic network failure and the
//     sign-in screen blames the user's credentials instead of saying "too many
//     attempts".
//   - after the body parser, so the login limiter can key on the submitted
//     email as well as the IP.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'test') {
  // Applied to the whole app rather than a `/api/` prefix the router never
  // serves — that mount point meant no endpoint was rate limited at all.
  app.use(
    rateLimit({
      windowMs: numericEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      limit: numericEnv('RATE_LIMIT_MAX_REQUESTS', 300),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests from this IP, please try again later.' },
      // Health probes must not be throttled, or a busy period looks like an outage.
      skip: (req) => req.path.startsWith('/health'),
    })
  );

  app.use(
    '/login',
    rateLimit({
      windowMs: numericEnv('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      limit: numericEnv('LOGIN_RATE_LIMIT_MAX_ATTEMPTS', 10),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      // Keyed on IP *and* the submitted email. On IP alone, one office behind a
      // single NAT locks out every colleague; on email alone, an attacker
      // rotates the address. `ipKeyGenerator` normalises IPv6 into a /64 so a
      // client with a whole prefix cannot mint unlimited keys.
      keyGenerator: (req) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
        return `${ipKeyGenerator(req.ip)}:${email}`;
      },
      message: { error: 'Too many login attempts, please try again later.' },
    })
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/health', require('./controllers/health/router'));
app.use('/entries', require('./controllers/entry/router'));
app.use('/users', require('./controllers/user/router'));
app.use('/login', require('./controllers/login/router'));

// API documentation
const swaggerDocument = YAML.load(path.join(__dirname, '..', 'docs', 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/', (req, res) => {
  res.json({
    name: 'NyelvSzó API',
    version: require('../package.json').version,
    documentation: '/api-docs',
    health: '/health',
  });
});

app.all(/.*/, notFoundHandler);
app.use(errorHandler);

module.exports = app;
