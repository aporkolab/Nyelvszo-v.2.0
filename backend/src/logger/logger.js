const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(stack && { stack }),
      ...(Object.keys(meta).length > 0 && { meta })
    };
    
    return JSON.stringify(logEntry, null, process.env.NODE_ENV === 'development' ? 2 : 0);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    let output = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      output += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    if (stack) {
      output += `\n${stack}`;
    }
    
    return output;
  })
);

// Transport configurations
const transports = [];

// Console transport (always enabled in development)
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'debug',
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );
}

// File transports
if (process.env.NODE_ENV !== 'test') {
  // General application logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '14d',
      level: 'info',
      format: customFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '30d',
      level: 'error',
      format: customFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // Access logs for HTTP requests
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'access-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '14d',
      level: 'http',
      format: customFormat
    })
  );

  // Audit logs for important events
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '90d',
      level: 'warn',
      format: customFormat
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
  },
  format: customFormat,
  transports,
  exitOnError: false
});

// Add custom logging methods
logger.audit = function(message, meta = {}) {
  this.log('warn', message, { type: 'audit', ...meta });
};

logger.security = function(message, meta = {}) {
  this.log('error', message, { type: 'security', ...meta });
};

logger.performance = function(message, meta = {}) {
  this.log('info', message, { type: 'performance', ...meta });
};

logger.database = function(message, meta = {}) {
  this.log('debug', message, { type: 'database', ...meta });
};

// Stream for Morgan HTTP logging
logger.stream = {
  write: function(message) {
    // Remove trailing newline and log as http level
    logger.http(message.trim());
  }
};

// Helper functions for structured logging
logger.logRequest = function(req, res, responseTime) {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    contentLength: res.get('content-length') || 0,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    ...(req.user && { userId: req.user.userId, userEmail: req.user.email })
  };
  
  if (res.statusCode >= 400) {
    this.warn('HTTP Request Error', logData);
  } else {
    this.http('HTTP Request', logData);
  }
};

logger.logError = function(error, context = {}) {
  const errorData = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  };
  
  if (error.statusCode && error.statusCode < 500) {
    this.warn('Client Error', errorData);
  } else {
    this.error('Server Error', errorData);
  }
};

logger.logAuth = function(action, user, success, meta = {}) {
  const authData = {
    action,
    success,
    ...(user && {
      userId: user._id || user.userId,
      userEmail: user.email
    }),
    ...meta
  };
  
  if (success) {
    this.audit(`Authentication ${action} successful`, authData);
  } else {
    this.security(`Authentication ${action} failed`, authData);
  }
};

logger.logDatabase = function(operation, collection, meta = {}) {
  this.database(`Database ${operation}`, {
    collection,
    ...meta
  });
};

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal, shutting down gracefully');
  // Close logger transports
  logger.end();
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT signal, shutting down gracefully');
  // Close logger transports
  logger.end();
});

module.exports = logger;
