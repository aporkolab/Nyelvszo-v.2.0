const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../models/auth/authenticate');
const logger = require('../logger/logger');

// Helper function to create auth middleware with roles
const auth = (roles = []) => {
  if (roles.length === 0) {
    return authenticate;
  }
  return [authenticate, authorize(roles)];
};

/**
 * WEBSOCKET MANAGEMENT ROUTES
 *
 * HTTP endpoints for WebSocket management and monitoring:
 * - Connection statistics
 * - Active sessions monitoring
 * - Real-time feature controls
 * - Administrative functions
 */

/**
 * Get WebSocket connection statistics
 * GET /api/websocket/stats
 */
router.get('/stats', auth(), async (req, res) => {
  try {
    const { webSocketManager } = req.app.locals;

    if (!webSocketManager) {
      return res.status(503).json({
        success: false,
        error: 'WebSocket service unavailable',
      });
    }

    const stats = webSocketManager.getStats();

    res.json({
      success: true,
      data: {
        connections: stats,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('WebSocket stats requested', {
      userId: req.user.userId,
      stats: stats,
    });
  } catch (error) {
    logger.error('Error fetching WebSocket stats', {
      error: error.message,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch WebSocket statistics',
    });
  }
});

/**
 * Get active user sessions
 * GET /api/websocket/sessions
 */
router.get('/sessions', auth(['admin']), async (req, res) => {
  try {
    const { webSocketManager } = req.app.locals;

    if (!webSocketManager) {
      return res.status(503).json({
        success: false,
        error: 'WebSocket service unavailable',
      });
    }

    const sessions = [];

    // Collect session information
    for (const [clientId, client] of webSocketManager.clients) {
      sessions.push({
        clientId,
        userId: client.userId,
        email: client.email,
        role: client.role,
        connectedAt: client.connectedAt,
        lastHeartbeat: client.lastHeartbeat,
        clientIp: client.clientIp,
        subscriptions: Array.from(client.subscriptions),
        userAgent: client.userAgent?.substring(0, 100),
      });
    }

    // Sort by connection time (newest first)
    sessions.sort((a, b) => new Date(b.connectedAt) - new Date(a.connectedAt));

    res.json({
      success: true,
      data: {
        sessions,
        total: sessions.length,
        authenticated: sessions.filter((s) => s.userId).length,
        anonymous: sessions.filter((s) => !s.userId).length,
      },
    });

    logger.info('WebSocket sessions listed', {
      adminUserId: req.user.userId,
      totalSessions: sessions.length,
    });
  } catch (error) {
    logger.error('Error listing WebSocket sessions', {
      error: error.message,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to list WebSocket sessions',
    });
  }
});

/**
 * Get active rooms and their members
 * GET /api/websocket/rooms
 */
router.get('/rooms', auth(['admin', 'editor']), async (req, res) => {
  try {
    const { webSocketManager } = req.app.locals;

    if (!webSocketManager) {
      return res.status(503).json({
        success: false,
        error: 'WebSocket service unavailable',
      });
    }

    const rooms = [];

    for (const [roomId, members] of webSocketManager.rooms) {
      const roomData = {
        roomId,
        memberCount: members.size,
        members: [],
      };

      // Get member details
      for (const clientId of members) {
        const client = webSocketManager.clients.get(clientId);
        if (client) {
          roomData.members.push({
            clientId,
            userId: client.userId,
            email: client.email,
            connectedAt: client.connectedAt,
          });
        }
      }

      rooms.push(roomData);
    }

    res.json({
      success: true,
      data: {
        rooms,
        totalRooms: rooms.length,
        totalMembers: rooms.reduce((sum, room) => sum + room.memberCount, 0),
      },
    });
  } catch (error) {
    logger.error('Error listing WebSocket rooms', {
      error: error.message,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to list WebSocket rooms',
    });
  }
});

/**
 * Send broadcast message to all connected clients
 * POST /api/websocket/broadcast
 */
router.post('/broadcast', auth(['admin']), async (req, res) => {
  try {
    const { message, channels = [], userFilter = {} } = req.body;
    const { webSocketManager } = req.app.locals;

    if (!webSocketManager) {
      return res.status(503).json({
        success: false,
        error: 'WebSocket service unavailable',
      });
    }

    if (!message || !message.type) {
      return res.status(400).json({
        success: false,
        error: 'Message type is required',
      });
    }

    let sentCount = 0;
    let filteredCount = 0;

    // Broadcast to all clients
    for (const [clientId, client] of webSocketManager.clients) {
      // Apply user filters
      if (userFilter.role && client.role !== userFilter.role) {
        filteredCount++;
        continue;
      }

      if (userFilter.userId && client.userId !== userFilter.userId) {
        filteredCount++;
        continue;
      }

      // Check channel subscriptions if specified
      if (channels.length > 0) {
        const hasSubscription = channels.some((channel) => client.subscriptions.has(channel));
        if (!hasSubscription) {
          filteredCount++;
          continue;
        }
      }

      // Send message
      if (
        webSocketManager.sendToClient(clientId, {
          type: 'broadcast',
          payload: {
            ...message,
            timestamp: new Date().toISOString(),
            sender: 'system',
          },
        })
      ) {
        sentCount++;
      }
    }

    logger.audit('WebSocket broadcast sent', {
      adminUserId: req.user.userId,
      messageType: message.type,
      sentTo: sentCount,
      filtered: filteredCount,
      channels: channels,
    });

    res.json({
      success: true,
      data: {
        sent: sentCount,
        filtered: filteredCount,
        total: webSocketManager.clients.size,
      },
    });
  } catch (error) {
    logger.error('Error sending WebSocket broadcast', {
      error: error.message,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to send broadcast message',
    });
  }
});

/**
 * Disconnect specific client
 * POST /api/websocket/disconnect/:clientId
 */
router.post('/disconnect/:clientId', auth(['admin']), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { reason = 'Disconnected by admin' } = req.body;
    const { webSocketManager } = req.app.locals;

    if (!webSocketManager) {
      return res.status(503).json({
        success: false,
        error: 'WebSocket service unavailable',
      });
    }

    const client = webSocketManager.clients.get(clientId);

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found',
      });
    }

    // Send notification before disconnecting
    webSocketManager.sendToClient(clientId, {
      type: 'admin_disconnect',
      payload: {
        reason,
        timestamp: new Date().toISOString(),
      },
    });

    // Close connection
    client.ws.close(1000, reason);

    logger.audit('Client disconnected by admin', {
      adminUserId: req.user.userId,
      clientId,
      disconnectedUserId: client.userId,
      reason,
    });

    res.json({
      success: true,
      data: {
        clientId,
        reason,
        disconnectedUser: client.userId,
      },
    });
  } catch (error) {
    logger.error('Error disconnecting client', {
      error: error.message,
      userId: req.user?.userId,
      clientId: req.params.clientId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to disconnect client',
    });
  }
});

/**
 * Send targeted notification to specific user
 * POST /api/websocket/notify/:userId
 */
router.post('/notify/:userId', auth(['admin', 'editor']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { notification } = req.body;
    const { webSocketManager, notificationService } = req.app.locals;

    if (!webSocketManager || !notificationService) {
      return res.status(503).json({
        success: false,
        error: 'Real-time services unavailable',
      });
    }

    if (!notification || !notification.type) {
      return res.status(400).json({
        success: false,
        error: 'Notification type is required',
      });
    }

    // Send via notification service for proper handling
    const notificationId = await notificationService.sendNotification({
      recipients: [{ userId }],
      template: 'admin_message',
      data: {
        message: notification,
        sender: {
          userId: req.user.userId,
          email: req.user.email,
        },
      },
      channels: ['websocket'],
      priority: 'high',
      context: {
        source: 'admin_api',
        sender: req.user.userId,
      },
    });

    logger.audit('Targeted notification sent', {
      senderUserId: req.user.userId,
      targetUserId: userId,
      notificationId,
      type: notification.type,
    });

    res.json({
      success: true,
      data: {
        notificationId,
        targetUser: userId,
        type: notification.type,
      },
    });
  } catch (error) {
    logger.error('Error sending targeted notification', {
      error: error.message,
      userId: req.user?.userId,
      targetUserId: req.params.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

/**
 * Get WebSocket feature configuration
 * GET /api/websocket/config
 */
router.get('/config', auth(), async (req, res) => {
  try {
    const config = {
      features: {
        realTimeSearch: true,
        liveCollaboration: req.user.role >= 2, // Editor+
        pushNotifications: true,
        eventStreaming: true,
        adminFeatures: req.user.role >= 3, // Admin
      },
      limits: {
        maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS) || 1000,
        messageRateLimit: 10, // per minute
        maxPayloadSize: '100MB',
      },
      channels: {
        public: ['entries:public', 'search:suggestions'],
        editor: ['entries:editing', 'collaboration:*'],
        admin: ['admin:*', 'system:*'],
      },
    };

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    logger.error('Error fetching WebSocket config', {
      error: error.message,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch configuration',
    });
  }
});

/**
 * Health check for WebSocket service
 * GET /api/websocket/health
 */
router.get('/health', async (req, res) => {
  try {
    const { webSocketManager } = req.app.locals;

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'websocket',
    };

    if (webSocketManager) {
      const stats = webSocketManager.getStats();
      health.details = {
        connections: stats.totalConnections,
        uptime: stats.uptime,
        queuedMessages: stats.queuedMessages || 0,
      };

      // Check if service is overloaded
      if (stats.totalConnections > 800) {
        health.status = 'warning';
        health.message = 'High connection count';
      }
    } else {
      health.status = 'unhealthy';
      health.message = 'WebSocket service not available';
    }

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503;

    res.status(statusCode).json({
      success: health.status !== 'unhealthy',
      data: health,
    });
  } catch (error) {
    logger.error('WebSocket health check failed', {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      data: {
        status: 'unhealthy',
        message: 'Health check failed',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

module.exports = router;
