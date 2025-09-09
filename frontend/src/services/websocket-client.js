/**
 * REAL-TIME WEBSOCKET CLIENT
 *
 * Frontend utility for WebSocket communication:
 * - Automatic reconnection
 * - Authentication handling
 * - Event subscription management
 * - Message queuing during disconnections
 * - Type-safe event handling
 */

class WebSocketClient {
  constructor(url = null) {
    // Auto-detect WebSocket URL
    this.url = url || this.getWebSocketUrl();
    this.ws = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 1000; // Start with 1 second
    this.maxReconnectInterval = 30000; // Max 30 seconds

    // Event handlers
    this.eventHandlers = new Map();
    this.messageQueue = [];
    this.subscriptions = new Set();

    // Authentication
    this.authToken = null;
    this.userId = null;

    // Feature flags
    this.features = {
      realTimeSearch: false,
      liveCollaboration: false,
      pushNotifications: false,
      eventStreaming: false,
    };

    // Statistics
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      reconnections: 0,
      lastConnected: null,
      connectionDuration: 0,
    };

    this.initialize();
  }

  /**
   * Initialize WebSocket client
   */
  initialize() {
    // Check if running in browser
    if (typeof window === 'undefined') {
      console.warn('WebSocketClient: Not running in browser environment');
      return;
    }

    console.log('🔌 Initializing WebSocket client', { url: this.url });

    // Load saved auth token
    this.loadAuthToken();

    // Start connection
    this.connect();
  }

  /**
   * Get WebSocket URL from current location
   */
  getWebSocketUrl() {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      return `${protocol}//${host}/ws`;
    }
    return 'ws://localhost:3000/ws';
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    try {
      console.log(`🔄 Connecting to WebSocket: ${this.url}`);

      this.ws = new WebSocket(this.url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle connection open
   */
  handleOpen(event) {
    console.log('✅ WebSocket connected');

    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.reconnectInterval = 1000;
    this.stats.lastConnected = new Date();
    this.stats.reconnections += this.stats.lastConnected ? 1 : 0;

    // Authenticate if token available
    if (this.authToken) {
      this.authenticate(this.authToken);
    }

    this.emit('connected', {
      url: this.url,
      reconnection: this.stats.reconnections > 0,
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this.stats.messagesReceived++;

      console.log('📨 WebSocket message received:', message.type, message.payload);

      // Handle system messages
      switch (message.type) {
        case 'connection':
          this.handleConnectionMessage(message.payload);
          break;

        case 'auth_success':
          this.handleAuthSuccess(message.payload);
          break;

        case 'auth_failed':
          this.handleAuthFailed(message.payload);
          break;

        case 'subscribed':
          this.handleSubscribed(message.payload);
          break;

        case 'error':
          this.handleServerError(message.payload);
          break;

        case 'heartbeat_ack':
          // Heartbeat acknowledgment
          break;

        default:
          // Emit to custom handlers
          this.emit(message.type, message.payload);
      }
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error, event.data);
    }
  }

  /**
   * Handle connection close
   */
  handleClose(event) {
    console.log('🔌 WebSocket disconnected:', event.code, event.reason);

    this.isConnected = false;
    this.isAuthenticated = false;

    if (this.stats.lastConnected) {
      this.stats.connectionDuration += Date.now() - this.stats.lastConnected.getTime();
    }

    this.emit('disconnected', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });

    // Attempt reconnection if not a clean close
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle connection errors
   */
  handleError(error) {
    console.error('❌ WebSocket error:', error);
    this.emit('error', error);
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    this.reconnectAttempts++;

    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectInterval
    );

    console.log(
      `🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Authenticate with JWT token
   */
  authenticate(token) {
    if (!token) {
      console.warn('⚠️ No authentication token provided');
      return;
    }

    this.authToken = token;
    this.saveAuthToken(token);

    this.send({
      type: 'auth',
      payload: { token },
    });
  }

  /**
   * Subscribe to real-time channels
   */
  subscribe(channels) {
    if (!Array.isArray(channels)) {
      channels = [channels];
    }

    // Add to local subscriptions
    channels.forEach(channel => this.subscriptions.add(channel));

    this.send({
      type: 'subscribe',
      payload: { channels },
    });

    console.log('📡 Subscribing to channels:', channels);
  }

  /**
   * Unsubscribe from channels
   */
  unsubscribe(channels) {
    if (!Array.isArray(channels)) {
      channels = [channels];
    }

    // Remove from local subscriptions
    channels.forEach(channel => this.subscriptions.delete(channel));

    this.send({
      type: 'unsubscribe',
      payload: { channels },
    });

    console.log('🔇 Unsubscribing from channels:', channels);
  }

  /**
   * Perform real-time search
   */
  search(query, options = {}) {
    this.send({
      type: 'search',
      payload: { query, options },
    });
  }

  /**
   * Join collaboration room
   */
  joinRoom(roomId) {
    this.send({
      type: 'join_room',
      payload: { roomId },
    });
  }

  /**
   * Leave collaboration room
   */
  leaveRoom(roomId) {
    this.send({
      type: 'leave_room',
      payload: { roomId },
    });
  }

  /**
   * Send typing indicator
   */
  typing(room, isTyping = true) {
    this.send({
      type: 'typing',
      payload: { room, isTyping },
    });
  }

  /**
   * Send collaborative edit operation
   */
  editEntry(entryId, operation, data) {
    this.send({
      type: 'entry_edit',
      payload: { entryId, operation, data },
    });
  }

  /**
   * Send message to server
   */
  send(message) {
    if (!this.isConnected || !this.ws) {
      console.warn('⚠️ WebSocket not connected, queuing message:', message);
      this.messageQueue.push(message);
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      this.stats.messagesSent++;
      return true;
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      this.messageQueue.push(message);
      return false;
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    console.log('🔌 Disconnecting WebSocket');

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }

    this.isConnected = false;
    this.isAuthenticated = false;
  }

  /**
   * Event handler registration
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Remove event handler
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to handlers
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`❌ Error in event handler for '${event}':`, error);
        }
      });
    }
  }

  /**
   * System message handlers
   */
  handleConnectionMessage(payload) {
    console.log('🎉 WebSocket connection established:', payload);
    this.features = payload.features || this.features;
    this.emit('features_updated', this.features);
  }

  handleAuthSuccess(payload) {
    console.log('✅ WebSocket authentication successful:', payload);
    this.isAuthenticated = true;
    this.userId = payload.userId;
    this.features = payload.features || this.features;

    // Send queued messages
    this.processMessageQueue();

    // Restore subscriptions
    if (this.subscriptions.size > 0) {
      this.subscribe(Array.from(this.subscriptions));
    }

    this.emit('authenticated', payload);
  }

  handleAuthFailed(payload) {
    console.error('❌ WebSocket authentication failed:', payload);
    this.isAuthenticated = false;
    this.authToken = null;
    this.clearAuthToken();
    this.emit('auth_failed', payload);
  }

  handleSubscribed(payload) {
    console.log('📡 Subscribed to channels:', payload.channels);
    this.emit('subscribed', payload);
  }

  handleServerError(payload) {
    console.error('❌ Server error:', payload);
    this.emit('server_error', payload);
  }

  /**
   * Process queued messages
   */
  processMessageQueue() {
    if (this.messageQueue.length === 0) return;

    console.log(`📤 Processing ${this.messageQueue.length} queued messages`);

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach(message => this.send(message));
  }

  /**
   * Auth token persistence
   */
  saveAuthToken(token) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ws_auth_token', token);
    }
  }

  loadAuthToken() {
    if (typeof localStorage !== 'undefined') {
      this.authToken = localStorage.getItem('ws_auth_token');
    }
  }

  clearAuthToken() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('ws_auth_token');
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      isAuthenticated: this.isAuthenticated,
      subscriptions: Array.from(this.subscriptions),
      queuedMessages: this.messageQueue.length,
      features: this.features,
      url: this.url,
      userId: this.userId,
    };
  }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketClient;
} else if (typeof window !== 'undefined') {
  window.WebSocketClient = WebSocketClient;
}

export default WebSocketClient;
