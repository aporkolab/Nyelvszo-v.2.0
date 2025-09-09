require('dotenv').config();
const config = require('config');
const http = require('http');
const logger = require('./logger/logger');
const app = require('./server');

// Import real-time services
const WebSocketManager = require('./realtime/WebSocketManager');
const NotificationService = require('./realtime/NotificationService');

const port = process.env.PORT || 3000;

if (!config.has('database')) {
  logger.error('No database config found.');
  process.exit();
}

// Create HTTP server (required for WebSocket attachment)
const server = http.createServer(app);

// Initialize real-time services
try {
  logger.info('Initializing real-time services...');

  // Initialize WebSocket Manager
  const webSocketManager = new WebSocketManager(server);

  // Initialize Notification Service
  const notificationService = new NotificationService(webSocketManager);

  // Make services available to routes via app.locals
  app.locals.webSocketManager = webSocketManager;
  app.locals.notificationService = notificationService;

  logger.info('Real-time services initialized successfully', {
    webSocket: true,
    notifications: true,
    endpoint: '/ws',
  });
} catch (error) {
  logger.error('Failed to initialize real-time services', {
    error: error.message,
    stack: error.stack,
  });
  // Continue without real-time features for graceful degradation
}

// Start server with WebSocket support
server.listen(port, () => {
  logger.info('NyelvSzó server started', {
    port: port,
    mode: process.env.NODE_ENV || 'development',
    webSocket: !!app.locals.webSocketManager,
    notifications: !!app.locals.notificationService,
    documentation: `http://localhost:${port}/api-docs`,
    webSocketEndpoint: `ws://localhost:${port}/ws`,
  });

  console.log(`🚀 NyelvSzó API listening at http://localhost:${port}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${port}/ws`);
  console.log(`📚 API documentation: http://localhost:${port}/api-docs`);
});
