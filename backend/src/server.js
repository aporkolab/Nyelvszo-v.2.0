const express = require('express');
const httpErrors = require('http-errors');
const config = require('config');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const logger = require('./logger/logger');

const app = express();

// Security middleware
if (process.env.HELMET_ENABLED !== 'false') {
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseSrc: ["'self'"],
        },
      },
    })
  );
}

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((process.env.RATE_LIMIT_WINDOW_MS || 900000) / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
app.use(
  '/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // limit each IP to 5 login attempts per windowMs
    message: {
      error: 'Too many login attempts from this IP, please try again later.',
    },
  })
);

// Trust proxy if behind reverse proxy
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

//Documentation
const swaggerDocument = YAML.load('./docs/swagger.yaml');

const { host, user, pass, name = 'nyelvszo' } = config.get('database');

mongoose
  .connect(`mongodb+srv://${user}:${pass}@${host}/${name}`, {
    maxPoolSize: process.env.DB_MAX_POOL_SIZE || 10,
    serverSelectionTimeoutMS: process.env.DB_CONNECTION_TIMEOUT_MS || 30000,
    socketTimeoutMS: process.env.DB_SOCKET_TIMEOUT_MS || 45000,
    retryWrites: true,
  })
  .then(
    // require('./seed/seeder'), // Seed the database, ONLY ONCE MUST RUN
    // logger.info('Data has been seeded into the database.'),
    (conn) => logger.info('Connected to MongoDB Atlas')
  )
  .catch((err) => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Cross Origin Resource Sharing
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:4200', 'https://nyelvszo.eu'];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    maxAge: 86400, // 24 hours
  })
);

app.use(
  morgan('combined', {
    stream: logger.stream,
    skip: function (req, res) {
      return process.env.NODE_ENV === 'test';
    },
  })
);

app.use(
  express.static('public', {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0',
    etag: true,
    lastModified: true,
  })
);

app.use(
  bodyParser.json({
    limit: '10mb',
    strict: true,
    type: 'application/json',
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: '10mb',
  })
);

const { authenticate } = require('./models/auth/authenticate');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Routes
app.use('/health', require('./controllers/health/router'));
app.use('/entries', require('./controllers/entry/router'));
app.use('/versionhistory', require('./controllers/entry/router'));
app.use('/contact', require('./controllers/entry/router'));
app.use('/preface', require('./controllers/entry/router'));
app.use('/users', authenticate, require('./controllers/user/router'));
app.use('/login', require('./controllers/login/router'));

// Real-time WebSocket management routes
app.use('/api/websocket', require('./routes/websocket'));

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Basic root route
app.get('/', (req, res) => {
  res.json({
    name: 'NyelvSzó API',
    version: '2.2.0',
    message: 'Welcome to the NyelvSzó API - Now with Real-time Features!',
    documentation: '/api-docs',
    health: '/health',
    webSocket: '/ws',
    webSocketAdmin: '/api/websocket',
    features: {
      realTimeSearch: true,
      liveCollaboration: true,
      pushNotifications: true,
      eventStreaming: true,
      aiSearch: true,
      cqrsEventStore: true,
    },
    timestamp: new Date().toISOString(),
  });
});

// Handle unmatched routes
app.all('*', notFoundHandler);

// Global error handling middleware
app.use(errorHandler);

module.exports = app;
