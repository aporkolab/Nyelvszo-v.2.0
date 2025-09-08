require('dotenv').config();
const http = require('http');
const express = require('express');
const logger = require('./src/logger/logger');

// Import real-time services
const WebSocketManager = require('./src/realtime/WebSocketManager');
const NotificationService = require('./src/realtime/NotificationService');

const app = express();
const port = process.env.PORT || 3001;

// Basic middleware
app.use(express.json());
app.use(express.static('public'));

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
    endpoint: '/ws'
  });
  
} catch (error) {
  logger.error('Failed to initialize real-time services', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
}

// Basic routes
app.get('/', (req, res) => {
  res.json({
    name: 'NyelvSzó WebSocket Test Server',
    version: '1.0.0',
    message: 'WebSocket test server is running!',
    webSocket: '/ws',
    features: {
      realTimeSearch: true,
      liveCollaboration: true,
      pushNotifications: true,
      eventStreaming: true
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  const stats = app.locals.webSocketManager?.getStats();
  res.json({
    status: 'healthy',
    webSocket: {
      enabled: !!app.locals.webSocketManager,
      connections: stats?.totalConnections || 0,
      authenticated: stats?.authenticatedUsers || 0
    },
    timestamp: new Date().toISOString()
  });
});

// WebSocket management routes
app.use('/api/websocket', require('./src/routes/websocket'));

// Test authentication endpoint (simple mock)
app.post('/api/auth/test', (req, res) => {
  const jwt = require('jsonwebtoken');
  const payload = {
    userId: '67890123456789012345678',
    email: 'test@example.com',
    role: 3, // Admin role
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'test-secret-key');
  
  res.json({
    success: true,
    token: token,
    user: {
      userId: payload.userId,
      email: payload.email,
      role: payload.role
    }
  });
});

// Start server with WebSocket support
server.listen(port, () => {
  logger.info('WebSocket Test Server started', {
    port: port,
    webSocket: !!app.locals.webSocketManager,
    notifications: !!app.locals.notificationService,
    webSocketEndpoint: `ws://localhost:${port}/ws`
  });
  
  console.log(`\n🚀 WebSocket Test Server listening at http://localhost:${port}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${port}/ws`);
  console.log(`🔍 Test auth endpoint: POST http://localhost:${port}/api/auth/test`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🎮 Open test-websocket.html in your browser to test the WebSocket connection\n`);
});
