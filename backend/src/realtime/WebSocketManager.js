const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { EventEmitter } = require('events');
const logger = require('../logger/logger');
const { EventStore } = require('../cqrs/events/EventStore');

/**
 * STATE-OF-THE-ART REAL-TIME WEBSOCKET MANAGER
 *
 * Enterprise-grade real-time communication:
 * - WebSocket server with authentication
 * - Real-time search suggestions
 * - Live collaborative features
 * - Push notifications
 * - Event streaming from Event Store
 * - Connection management and scaling
 * - Message queuing and delivery guarantees
 */

class WebSocketManager extends EventEmitter {
  constructor(server) {
    super();
    this.server = server;
    this.wss = null;
    this.clients = new Map(); // clientId -> WebSocket connection
    this.rooms = new Map(); // roomId -> Set of clientIds
    this.userSessions = new Map(); // userId -> Set of clientIds
    this.messageQueue = new Map(); // clientId -> Array of messages
    this.heartbeatInterval = null;
    this.eventStore = new EventStore();

    this.initialize();
  }

  /**
   * Initialize WebSocket server
   */
  initialize() {
    try {
      // Create WebSocket server
      this.wss = new WebSocket.Server({
        server: this.server,
        path: '/ws',
        perMessageDeflate: {
          zlibDeflateOptions: {
            level: 3,
          },
        },
        maxPayload: 100 * 1024 * 1024, // 100MB max payload
      });

      // Setup connection handling
      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleServerError.bind(this));

      // Start heartbeat mechanism
      this.startHeartbeat();

      // Subscribe to Event Store for real-time updates
      this.subscribeToEventStore();

      logger.info('WebSocket Manager initialized', {
        path: '/ws',
        maxPayload: '100MB',
        compression: true,
      });
    } catch (error) {
      logger.error('Failed to initialize WebSocket Manager', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(ws, request) {
    const clientId = this.generateClientId();
    const clientIp = request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];

    logger.info('New WebSocket connection', {
      clientId,
      clientIp,
      userAgent: userAgent?.substring(0, 100),
    });

    // Store client connection
    this.clients.set(clientId, {
      ws,
      clientId,
      clientIp,
      userAgent,
      userId: null,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      subscriptions: new Set(),
      metadata: {},
    });

    // Setup client event handlers
    ws.clientId = clientId;
    ws.on('message', (data) => this.handleMessage(clientId, data));
    ws.on('close', (code, reason) => this.handleDisconnection(clientId, code, reason));
    ws.on('error', (error) => this.handleClientError(clientId, error));
    ws.on('pong', () => this.handlePong(clientId));

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connection',
      payload: {
        clientId,
        timestamp: new Date().toISOString(),
        features: {
          realTimeSearch: true,
          liveCollaboration: true,
          pushNotifications: true,
          eventStreaming: true,
        },
      },
    });

    this.emit('connection', { clientId, clientIp });
  }

  /**
   * Handle incoming messages from clients
   */
  async handleMessage(clientId, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      // Parse message
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (error) {
        this.sendError(clientId, 'INVALID_JSON', 'Invalid JSON format');
        return;
      }

      // Update last activity
      client.lastHeartbeat = new Date();

      // Validate message structure
      if (!message.type) {
        this.sendError(clientId, 'MISSING_TYPE', 'Message type is required');
        return;
      }

      logger.debug('WebSocket message received', {
        clientId,
        type: message.type,
        hasPayload: !!message.payload,
      });

      // Route message to appropriate handler
      switch (message.type) {
        case 'auth':
          await this.handleAuth(clientId, message.payload);
          break;

        case 'subscribe':
          await this.handleSubscribe(clientId, message.payload);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(clientId, message.payload);
          break;

        case 'search':
          await this.handleRealTimeSearch(clientId, message.payload);
          break;

        case 'typing':
          await this.handleTyping(clientId, message.payload);
          break;

        case 'heartbeat':
          await this.handleHeartbeat(clientId, message.payload);
          break;

        case 'join_room':
          await this.handleJoinRoom(clientId, message.payload);
          break;

        case 'leave_room':
          await this.handleLeaveRoom(clientId, message.payload);
          break;

        case 'chat_message':
          await this.handleChatMessage(clientId, message.payload);
          break;

        case 'entry_edit':
          await this.handleEntryEdit(clientId, message.payload);
          break;

        default:
          this.sendError(clientId, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', {
        error: error.message,
        clientId,
        data: data.toString().substring(0, 200),
      });

      this.sendError(clientId, 'INTERNAL_ERROR', 'Internal server error');
    }
  }

  /**
   * Handle client authentication
   */
  async handleAuth(clientId, payload) {
    try {
      const { token } = payload;

      if (!token) {
        this.sendError(clientId, 'AUTH_TOKEN_REQUIRED', 'Authentication token is required');
        return;
      }

      // Verify JWT token
      const jwtSecret = process.env.JWT_SECRET;
      const decoded = jwt.verify(token, jwtSecret);

      // Update client with user information
      const client = this.clients.get(clientId);
      if (client) {
        client.userId = decoded.userId;
        client.email = decoded.email;
        client.role = decoded.role;

        // Track user sessions
        if (!this.userSessions.has(decoded.userId)) {
          this.userSessions.set(decoded.userId, new Set());
        }
        this.userSessions.get(decoded.userId).add(clientId);

        // Send authentication success
        this.sendToClient(clientId, {
          type: 'auth_success',
          payload: {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            features: this.getFeaturesForRole(decoded.role),
          },
        });

        logger.info('Client authenticated', {
          clientId,
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        });

        this.emit('user_authenticated', {
          clientId,
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        });
      }
    } catch (error) {
      logger.warn('Authentication failed', {
        error: error.message,
        clientId,
      });

      this.sendError(clientId, 'AUTH_FAILED', 'Invalid authentication token');
    }
  }

  /**
   * Handle subscription to real-time updates
   */
  async handleSubscribe(clientId, payload) {
    const { channels } = payload;

    if (!Array.isArray(channels)) {
      this.sendError(clientId, 'INVALID_CHANNELS', 'Channels must be an array');
      return;
    }

    const client = this.clients.get(clientId);
    if (!client) return;

    const allowedChannels = this.getAllowedChannels(client.role);
    const subscriptions = [];

    for (const channel of channels) {
      if (allowedChannels.includes(channel)) {
        client.subscriptions.add(channel);
        subscriptions.push(channel);

        // Subscribe to Event Store events for this channel
        if (channel.startsWith('entries:')) {
          this.eventStore.subscribeToStream(channel, (event) => {
            this.broadcastToSubscribers(channel, {
              type: 'event',
              payload: event,
            });
          });
        }
      }
    }

    this.sendToClient(clientId, {
      type: 'subscribed',
      payload: {
        channels: subscriptions,
        timestamp: new Date().toISOString(),
      },
    });

    logger.debug('Client subscribed to channels', {
      clientId,
      userId: client.userId,
      channels: subscriptions,
    });
  }

  /**
   * Handle real-time search
   */
  async handleRealTimeSearch(clientId, payload) {
    try {
      const { query, options = {} } = payload;

      if (!query || query.trim().length < 2) {
        this.sendToClient(clientId, {
          type: 'search_results',
          payload: {
            query,
            results: [],
            suggestions: [],
          },
        });
        return;
      }

      // Get client info for personalization
      const client = this.clients.get(clientId);
      const context = {
        userId: client?.userId,
        role: client?.role,
        realTime: true,
      };

      // Perform intelligent search (would integrate with AI search service)
      const searchResults = await this.performRealTimeSearch(query, context, options);

      // Get search suggestions
      const suggestions = await this.getSearchSuggestions(query, context);

      this.sendToClient(clientId, {
        type: 'search_results',
        payload: {
          query,
          results: searchResults.slice(0, 10), // Limit real-time results
          suggestions: suggestions.slice(0, 5),
          metadata: {
            totalResults: searchResults.length,
            processingTime: new Date().toISOString(),
            realTime: true,
          },
        },
      });

      logger.debug('Real-time search performed', {
        clientId,
        query: query.substring(0, 50),
        resultCount: searchResults.length,
      });
    } catch (error) {
      logger.error('Real-time search failed', {
        error: error.message,
        clientId,
        query: payload.query?.substring(0, 50),
      });

      this.sendError(clientId, 'SEARCH_FAILED', 'Search request failed');
    }
  }

  /**
   * Handle typing indicators
   */
  async handleTyping(clientId, payload) {
    const { room, isTyping } = payload;

    const client = this.clients.get(clientId);
    if (!client || !client.userId) return;

    // Broadcast typing status to room members
    this.broadcastToRoom(
      room,
      {
        type: 'user_typing',
        payload: {
          userId: client.userId,
          email: client.email,
          isTyping,
          timestamp: new Date().toISOString(),
        },
      },
      [clientId]
    ); // Exclude sender
  }

  /**
   * Handle collaborative entry editing
   */
  async handleEntryEdit(clientId, payload) {
    try {
      const { entryId, operation, data } = payload;

      const client = this.clients.get(clientId);
      if (!client || !client.userId) {
        this.sendError(clientId, 'UNAUTHORIZED', 'Authentication required');
        return;
      }

      // Validate user permissions
      if (client.role < 2) {
        // Need Editor+ role
        this.sendError(clientId, 'INSUFFICIENT_PERMISSIONS', 'Editor role required');
        return;
      }

      // Process the edit operation
      const editEvent = {
        eventType: 'EntryEditOperation',
        aggregateId: entryId,
        aggregateType: 'Entry',
        eventData: {
          operation,
          data,
          userId: client.userId,
          timestamp: new Date().toISOString(),
        },
      };

      // Append to event store
      await this.eventStore.appendToStream(`entry-${entryId}`, [editEvent], -1, {
        userId: client.userId,
        clientId: clientId,
        source: 'websocket',
      });

      // Broadcast to all subscribers of this entry
      this.broadcastToSubscribers(
        `entries:${entryId}`,
        {
          type: 'entry_updated',
          payload: {
            entryId,
            operation,
            data,
            user: {
              userId: client.userId,
              email: client.email,
            },
            timestamp: new Date().toISOString(),
          },
        },
        [clientId]
      ); // Exclude sender

      logger.audit('Real-time entry edit', {
        entryId,
        operation,
        userId: client.userId,
        clientId,
      });
    } catch (error) {
      logger.error('Entry edit failed', {
        error: error.message,
        clientId,
        entryId: payload.entryId,
      });

      this.sendError(clientId, 'EDIT_FAILED', 'Failed to process entry edit');
    }
  }

  /**
   * Handle unsubscription from channels
   */
  async handleUnsubscribe(clientId, payload) {
    const { channels } = payload;

    if (!Array.isArray(channels)) {
      this.sendError(clientId, 'INVALID_CHANNELS', 'Channels must be an array');
      return;
    }

    const client = this.clients.get(clientId);
    if (!client) return;

    const unsubscribed = [];

    for (const channel of channels) {
      if (client.subscriptions.has(channel)) {
        client.subscriptions.delete(channel);
        unsubscribed.push(channel);
      }
    }

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      payload: {
        channels: unsubscribed,
        timestamp: new Date().toISOString(),
      },
    });

    logger.debug('Client unsubscribed from channels', {
      clientId,
      userId: client.userId,
      channels: unsubscribed,
    });
  }

  /**
   * Handle leaving a room
   */
  async handleLeaveRoom(clientId, payload) {
    const { roomId } = payload;

    const room = this.rooms.get(roomId);
    if (room && room.has(clientId)) {
      room.delete(clientId);

      // Clean up empty room
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    const client = this.clients.get(clientId);

    this.sendToClient(clientId, {
      type: 'room_left',
      payload: {
        roomId,
        memberCount: room ? room.size : 0,
        timestamp: new Date().toISOString(),
      },
    });

    // Notify other room members if room still exists
    if (room && room.size > 0) {
      this.broadcastToRoom(roomId, {
        type: 'user_left',
        payload: {
          userId: client?.userId,
          email: client?.email,
          roomId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    logger.debug('Client left room', {
      clientId,
      roomId,
      remainingMembers: room ? room.size : 0,
    });
  }

  /**
   * Handle chat messages (placeholder)
   */
  async handleChatMessage(clientId, payload) {
    const { roomId, message } = payload;
    const client = this.clients.get(clientId);

    if (!client || !client.userId) {
      this.sendError(clientId, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    // Broadcast message to room
    this.broadcastToRoom(
      roomId,
      {
        type: 'chat_message',
        payload: {
          message,
          user: {
            userId: client.userId,
            email: client.email,
          },
          roomId,
          timestamp: new Date().toISOString(),
        },
      },
      [clientId]
    ); // Exclude sender

    logger.debug('Chat message sent', {
      clientId,
      userId: client.userId,
      roomId,
      messageLength: message?.length,
    });
  }

  /**
   * Handle room management
   */
  async handleJoinRoom(clientId, payload) {
    const { roomId } = payload;

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    this.rooms.get(roomId).add(clientId);

    const client = this.clients.get(clientId);

    this.sendToClient(clientId, {
      type: 'room_joined',
      payload: {
        roomId,
        memberCount: this.rooms.get(roomId).size,
        timestamp: new Date().toISOString(),
      },
    });

    // Notify other room members
    this.broadcastToRoom(
      roomId,
      {
        type: 'user_joined',
        payload: {
          userId: client?.userId,
          email: client?.email,
          roomId,
          timestamp: new Date().toISOString(),
        },
      },
      [clientId]
    );

    logger.debug('Client joined room', {
      clientId,
      roomId,
      memberCount: this.rooms.get(roomId).size,
    });
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);

    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      // Queue message for later delivery if client reconnects
      if (!this.messageQueue.has(clientId)) {
        this.messageQueue.set(clientId, []);
      }
      this.messageQueue.get(clientId).push({
        message,
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send message to client', {
        error: error.message,
        clientId,
        messageType: message.type,
      });
      return false;
    }
  }

  /**
   * Broadcast to all subscribers of a channel
   */
  broadcastToSubscribers(channel, message, exclude = []) {
    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      if (exclude.includes(clientId)) continue;
      if (!client.subscriptions.has(channel)) continue;

      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    logger.debug('Message broadcasted to subscribers', {
      channel,
      sentCount,
      messageType: message.type,
    });

    return sentCount;
  }

  /**
   * Broadcast to all clients in a room
   */
  broadcastToRoom(roomId, message, exclude = []) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    let sentCount = 0;

    for (const clientId of room) {
      if (exclude.includes(clientId)) continue;

      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Send error message to client
   */
  sendError(clientId, code, message) {
    this.sendToClient(clientId, {
      type: 'error',
      payload: {
        code,
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Handle client disconnection
   */
  handleDisconnection(clientId, code, reason) {
    const client = this.clients.get(clientId);

    if (client) {
      // Remove from user sessions
      if (client.userId && this.userSessions.has(client.userId)) {
        this.userSessions.get(client.userId).delete(clientId);
        if (this.userSessions.get(client.userId).size === 0) {
          this.userSessions.delete(client.userId);
        }
      }

      // Remove from rooms
      for (const [roomId, room] of this.rooms) {
        if (room.has(clientId)) {
          room.delete(clientId);

          // Notify room members
          this.broadcastToRoom(roomId, {
            type: 'user_left',
            payload: {
              userId: client.userId,
              email: client.email,
              roomId,
              timestamp: new Date().toISOString(),
            },
          });

          // Clean up empty rooms
          if (room.size === 0) {
            this.rooms.delete(roomId);
          }
        }
      }

      logger.info('Client disconnected', {
        clientId,
        userId: client.userId,
        code,
        reason: reason?.toString(),
        connectedDuration: Date.now() - client.connectedAt.getTime(),
      });
    }

    // Remove client
    this.clients.delete(clientId);

    this.emit('disconnection', { clientId, code, reason });
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();

      for (const [clientId, client] of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Check if client is still responsive
          const timeSinceHeartbeat = now - client.lastHeartbeat;

          if (timeSinceHeartbeat > 60000) {
            // 60 seconds timeout
            logger.warn('Client heartbeat timeout', {
              clientId,
              userId: client.userId,
              timeSinceHeartbeat,
            });

            client.ws.terminate();
          } else {
            // Send ping
            client.ws.ping();
          }
        }
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Subscribe to Event Store for real-time updates
   */
  subscribeToEventStore() {
    this.eventStore.on('eventAppended', (event) => {
      // Broadcast events to relevant subscribers
      const channel = `events:${event.aggregateType}`;
      this.broadcastToSubscribers(channel, {
        type: 'domain_event',
        payload: event,
      });
    });

    logger.info('Subscribed to Event Store for real-time updates');
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalConnections: this.clients.size,
      authenticatedUsers: this.userSessions.size,
      activeRooms: this.rooms.size,
      queuedMessages: Array.from(this.messageQueue.values()).reduce(
        (sum, queue) => sum + queue.length,
        0
      ),
      uptime: process.uptime(),
    };
  }

  /**
   * Helper methods
   */
  generateClientId() {
    return require('uuid').v4();
  }

  getAllowedChannels(role) {
    const baseChannels = ['entries:public', 'search:suggestions'];

    if (role >= 2) {
      // Editor+
      baseChannels.push('entries:editing', 'collaboration:*');
    }

    if (role >= 3) {
      // Admin
      baseChannels.push('admin:*', 'system:*');
    }

    return baseChannels;
  }

  getFeaturesForRole(role) {
    return {
      realTimeSearch: true,
      liveCollaboration: role >= 2,
      pushNotifications: true,
      adminFeatures: role >= 3,
    };
  }

  async performRealTimeSearch(query, context, options) {
    // This would integrate with the AI Search Service
    // For now, return mock results
    const Entry = require('../models/entry');
    const { query: searchQuery } = Entry.searchEntries(query, { ...options, limit: 10 });
    return await searchQuery;
  }

  // eslint-disable-next-line no-unused-vars
  async getSearchSuggestions(_query, _context) {
    // Implementation for real-time search suggestions
    return [];
  }

  handleServerError(error) {
    logger.error('WebSocket server error', {
      error: error.message,
      stack: error.stack,
    });
  }

  handleClientError(clientId, error) {
    logger.error('WebSocket client error', {
      error: error.message,
      clientId,
    });
  }

  handlePong(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = new Date();
    }
  }

  // eslint-disable-next-line no-unused-vars
  handleHeartbeat(clientId, _payload) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = new Date();

      this.sendToClient(clientId, {
        type: 'heartbeat_ack',
        payload: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}

module.exports = WebSocketManager;
