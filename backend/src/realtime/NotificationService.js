const EventEmitter = require('events');
const logger = require('../logger/logger');
const { EventStore } = require('../cqrs/events/EventStore');

/**
 * STATE-OF-THE-ART PUSH NOTIFICATION SERVICE
 *
 * Enterprise-grade notification system:
 * - Multi-channel notifications (WebSocket, Email, SMS)
 * - Template-based messages with personalization
 * - Delivery guarantees and retry mechanisms
 * - Rate limiting and user preferences
 * - Analytics and delivery tracking
 * - Event-driven architecture integration
 */

class NotificationService extends EventEmitter {
  constructor(webSocketManager) {
    super();

    this.webSocketManager = webSocketManager;
    this.eventStore = new EventStore();
    this.deliveryQueue = new Map();
    this.deliveryHistory = new Map();
    this.userPreferences = new Map();
    this.rateLimiter = new Map();
    this.templates = new Map();
    this.channels = {
      websocket: new WebSocketChannel(webSocketManager),
      email: new EmailChannel(),
      sms: new SMSChannel(),
    };

    this.initialize();
  }

  /**
   * Initialize notification service
   */
  initialize() {
    try {
      // Load notification templates
      this.loadTemplates();

      // Setup event store subscription for domain events
      this.subscribeToEvents();

      // Start delivery processor
      this.startDeliveryProcessor();

      logger.info('Notification Service initialized', {
        channels: Object.keys(this.channels),
        templates: this.templates.size,
      });
    } catch (error) {
      logger.error('Failed to initialize Notification Service', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Send notification with multiple delivery options
   */
  async sendNotification(notification) {
    try {
      const {
        recipients,
        template,
        data = {},
        channels = ['websocket'],
        priority = 'normal',
        scheduleAt = null,
        deliveryGuarantee = false,
        context = {},
      } = notification;

      // Validate recipients
      if (!recipients || recipients.length === 0) {
        throw new Error('Recipients are required');
      }

      // Check rate limits
      for (const recipient of recipients) {
        if (!(await this.checkRateLimit(recipient, template))) {
          logger.warn('Notification rate limited', {
            recipient: recipient.userId || recipient.email,
            template,
          });
          continue;
        }
      }

      // Generate notification ID
      const notificationId = this.generateNotificationId();

      // Process each recipient
      const deliveryTasks = [];

      for (const recipient of recipients) {
        // Get user preferences
        const preferences = await this.getUserPreferences(recipient.userId);

        // Filter channels based on preferences
        const enabledChannels = channels.filter((channel) =>
          preferences.channels.includes(channel)
        );

        if (enabledChannels.length === 0) {
          logger.debug('All channels disabled for user', {
            userId: recipient.userId,
            template,
          });
          continue;
        }

        // Create delivery tasks for each channel
        for (const channel of enabledChannels) {
          const task = {
            notificationId,
            recipient,
            channel,
            template,
            data: {
              ...data,
              recipient: recipient,
              timestamp: new Date().toISOString(),
            },
            priority,
            scheduleAt,
            deliveryGuarantee,
            context,
            attempts: 0,
            maxAttempts: deliveryGuarantee ? 5 : 1,
            createdAt: new Date(),
            status: 'pending',
          };

          deliveryTasks.push(task);
        }
      }

      // Store in delivery queue
      if (deliveryTasks.length > 0) {
        this.deliveryQueue.set(notificationId, deliveryTasks);

        logger.info('Notification queued for delivery', {
          notificationId,
          recipients: recipients.length,
          channels: channels,
          template,
          tasks: deliveryTasks.length,
        });

        // Record event
        await this.recordNotificationEvent('notification_queued', {
          notificationId,
          recipients: recipients.map((r) => r.userId || r.email),
          template,
          channels,
          context,
        });

        this.emit('notification_queued', {
          notificationId,
          tasks: deliveryTasks.length,
        });

        return notificationId;
      }

      return null;
    } catch (error) {
      logger.error('Failed to send notification', {
        error: error.message,
        notification: {
          template: notification.template,
          recipients: notification.recipients?.length,
        },
      });
      throw error;
    }
  }

  /**
   * Send real-time notification via WebSocket
   */
  async sendRealTimeNotification(userId, notification) {
    try {
      const userSessions = this.webSocketManager.userSessions.get(userId);

      if (!userSessions || userSessions.size === 0) {
        logger.debug('No active sessions for real-time notification', {
          userId,
          type: notification.type,
        });
        return false;
      }

      // Send to all user sessions
      let sentCount = 0;
      for (const clientId of userSessions) {
        if (
          this.webSocketManager.sendToClient(clientId, {
            type: 'notification',
            payload: notification,
          })
        ) {
          sentCount++;
        }
      }

      logger.debug('Real-time notification sent', {
        userId,
        type: notification.type,
        sessions: userSessions.size,
        sent: sentCount,
      });

      return sentCount > 0;
    } catch (error) {
      logger.error('Failed to send real-time notification', {
        error: error.message,
        userId,
        type: notification.type,
      });
      return false;
    }
  }

  /**
   * Process delivery queue
   */
  startDeliveryProcessor() {
    setInterval(async () => {
      try {
        const now = new Date();
        const tasksToProcess = [];

        // Find tasks ready for processing
        for (const [, tasks] of this.deliveryQueue) {
          for (const task of tasks) {
            if (task.status === 'pending' && (!task.scheduleAt || now >= task.scheduleAt)) {
              tasksToProcess.push(task);
            }
          }
        }

        // Process tasks in priority order
        tasksToProcess.sort((a, b) => {
          const priorityOrder = { urgent: 3, high: 2, normal: 1, low: 0 };
          return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
        });

        // Process up to 10 tasks per cycle
        const batch = tasksToProcess.slice(0, 10);

        for (const task of batch) {
          await this.processDeliveryTask(task);
        }

        if (batch.length > 0) {
          logger.debug('Processed delivery batch', {
            processed: batch.length,
            remaining: tasksToProcess.length - batch.length,
          });
        }
      } catch (error) {
        logger.error('Error in delivery processor', {
          error: error.message,
          stack: error.stack,
        });
      }
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process individual delivery task
   */
  async processDeliveryTask(task) {
    try {
      task.status = 'processing';
      task.attempts++;

      logger.debug('Processing delivery task', {
        notificationId: task.notificationId,
        recipient: task.recipient.userId || task.recipient.email,
        channel: task.channel,
        attempt: task.attempts,
      });

      // Get channel handler
      const channel = this.channels[task.channel];
      if (!channel) {
        throw new Error(`Unknown channel: ${task.channel}`);
      }

      // Render message from template
      const message = await this.renderMessage(task.template, task.data);

      // Attempt delivery
      const result = await channel.send(task.recipient, message, task.context);

      if (result.success) {
        task.status = 'delivered';
        task.deliveredAt = new Date();
        task.deliveryResult = result;

        logger.info('Notification delivered', {
          notificationId: task.notificationId,
          recipient: task.recipient.userId || task.recipient.email,
          channel: task.channel,
          attempts: task.attempts,
        });

        // Record successful delivery
        await this.recordNotificationEvent('notification_delivered', {
          notificationId: task.notificationId,
          recipient: task.recipient.userId || task.recipient.email,
          channel: task.channel,
          attempts: task.attempts,
          deliveryTime: task.deliveredAt - task.createdAt,
        });

        this.emit('notification_delivered', task);
      } else {
        throw new Error(result.error || 'Delivery failed');
      }
    } catch (error) {
      logger.warn('Delivery task failed', {
        error: error.message,
        notificationId: task.notificationId,
        recipient: task.recipient.userId || task.recipient.email,
        channel: task.channel,
        attempt: task.attempts,
        maxAttempts: task.maxAttempts,
      });

      // Check if we should retry
      if (task.attempts < task.maxAttempts) {
        task.status = 'pending';
        // Exponential backoff
        task.scheduleAt = new Date(Date.now() + Math.pow(2, task.attempts) * 1000);

        logger.debug('Scheduling retry', {
          notificationId: task.notificationId,
          nextAttempt: task.scheduleAt,
          attemptsLeft: task.maxAttempts - task.attempts,
        });
      } else {
        task.status = 'failed';
        task.failedAt = new Date();
        task.failureReason = error.message;

        logger.error('Notification delivery failed permanently', {
          notificationId: task.notificationId,
          recipient: task.recipient.userId || task.recipient.email,
          channel: task.channel,
          error: error.message,
        });

        // Record failure
        await this.recordNotificationEvent('notification_failed', {
          notificationId: task.notificationId,
          recipient: task.recipient.userId || task.recipient.email,
          channel: task.channel,
          attempts: task.attempts,
          error: error.message,
        });

        this.emit('notification_failed', task);
      }
    }
  }

  /**
   * Load notification templates
   */
  loadTemplates() {
    // Entry-related notifications
    this.templates.set('entry_created', {
      websocket: {
        type: 'entry_created',
        title: 'New Entry Created',
        message: '{{user.name}} created a new entry: "{{entry.title}}"',
        icon: 'plus-circle',
        category: 'content',
      },
      email: {
        subject: 'New Entry: {{entry.title}}',
        template: 'entry_created',
        data: ['user', 'entry'],
      },
    });

    this.templates.set('entry_updated', {
      websocket: {
        type: 'entry_updated',
        title: 'Entry Updated',
        message: '{{user.name}} updated "{{entry.title}}"',
        icon: 'edit',
        category: 'content',
      },
    });

    this.templates.set('entry_approved', {
      websocket: {
        type: 'entry_approved',
        title: 'Entry Approved',
        message: 'Your entry "{{entry.title}}" has been approved!',
        icon: 'check-circle',
        category: 'approval',
        style: 'success',
      },
      email: {
        subject: 'Entry Approved: {{entry.title}}',
        template: 'entry_approved',
        data: ['entry', 'approver'],
      },
    });

    this.templates.set('entry_rejected', {
      websocket: {
        type: 'entry_rejected',
        title: 'Entry Needs Revision',
        message: 'Your entry "{{entry.title}}" needs revision. Reason: {{reason}}',
        icon: 'x-circle',
        category: 'approval',
        style: 'warning',
      },
    });

    // Collaboration notifications
    this.templates.set('collaborative_edit', {
      websocket: {
        type: 'collaborative_edit',
        title: 'Collaborative Editing',
        message: '{{user.name}} is editing "{{entry.title}}"',
        icon: 'users',
        category: 'collaboration',
      },
    });

    // System notifications
    this.templates.set('system_maintenance', {
      websocket: {
        type: 'system_maintenance',
        title: 'System Maintenance',
        message: 'Scheduled maintenance: {{maintenance.description}}',
        icon: 'wrench',
        category: 'system',
        style: 'info',
      },
    });

    // Welcome and onboarding
    this.templates.set('welcome', {
      websocket: {
        type: 'welcome',
        title: 'Welcome to NyelvSzó!',
        message: 'Welcome {{user.name}}! Start exploring our language resources.',
        icon: 'heart',
        category: 'onboarding',
        style: 'success',
      },
      email: {
        subject: 'Welcome to NyelvSzó!',
        template: 'welcome',
        data: ['user'],
      },
    });

    logger.debug('Notification templates loaded', {
      count: this.templates.size,
    });
  }

  /**
   * Subscribe to domain events for automatic notifications
   */
  subscribeToEvents() {
    this.eventStore.on('eventAppended', async (event) => {
      try {
        await this.handleDomainEvent(event);
      } catch (error) {
        logger.error('Error handling domain event for notifications', {
          error: error.message,
          event: event.eventType,
        });
      }
    });

    logger.info('Subscribed to domain events for notifications');
  }

  /**
   * Handle domain events and trigger appropriate notifications
   */
  async handleDomainEvent(event) {
    const { eventType, aggregateType, eventData } = event;

    switch (eventType) {
      case 'EntryCreated':
        if (aggregateType === 'Entry') {
          await this.notifyEntryCreated(eventData);
        }
        break;

      case 'EntryUpdated':
        if (aggregateType === 'Entry') {
          await this.notifyEntryUpdated(eventData);
        }
        break;

      case 'EntryApproved':
        if (aggregateType === 'Entry') {
          await this.notifyEntryApproved(eventData);
        }
        break;

      case 'UserRegistered':
        if (aggregateType === 'User') {
          await this.notifyUserWelcome(eventData);
        }
        break;

      case 'CollaborativeEditStarted':
        if (aggregateType === 'Entry') {
          await this.notifyCollaborativeEdit(eventData);
        }
        break;
    }
  }

  /**
   * Notification handlers for specific events
   */
  async notifyEntryCreated(eventData) {
    const { entry, user } = eventData;

    // Notify subscribers/followers
    const subscribers = await this.getEntrySubscribers(entry._id);

    if (subscribers.length > 0) {
      await this.sendNotification({
        recipients: subscribers,
        template: 'entry_created',
        data: { entry, user },
        channels: ['websocket'],
        context: { event: 'entry_created' },
      });
    }
  }

  async notifyEntryApproved(eventData) {
    const { entry, approver } = eventData;

    // Notify entry author
    await this.sendNotification({
      recipients: [{ userId: entry.authorId }],
      template: 'entry_approved',
      data: { entry, approver },
      channels: ['websocket', 'email'],
      priority: 'high',
      context: { event: 'entry_approved' },
    });
  }

  async notifyUserWelcome(eventData) {
    const { user } = eventData;

    // Send welcome notification
    await this.sendNotification({
      recipients: [{ userId: user._id, email: user.email }],
      template: 'welcome',
      data: { user },
      channels: ['websocket', 'email'],
      priority: 'high',
      context: { event: 'user_welcome' },
    });
  }

  /**
   * Render message from template
   */
  async renderMessage(templateName, data) {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }

    const rendered = {};

    for (const [channel, config] of Object.entries(template)) {
      rendered[channel] = this.interpolateTemplate(config, data);
    }

    return rendered;
  }

  /**
   * Simple template interpolation
   */
  interpolateTemplate(template, data) {
    if (typeof template === 'string') {
      return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        return this.getNestedProperty(data, path.trim()) || match;
      });
    }

    if (Array.isArray(template)) {
      return template.map((item) => this.interpolateTemplate(item, data));
    }

    if (typeof template === 'object' && template !== null) {
      const result = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.interpolateTemplate(value, data);
      }
      return result;
    }

    return template;
  }

  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Check rate limiting
   */
  async checkRateLimit(recipient, template) {
    const key = `${recipient.userId || recipient.email}-${template}`;
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const maxPerWindow = 10;

    if (!this.rateLimiter.has(key)) {
      this.rateLimiter.set(key, []);
    }

    const timestamps = this.rateLimiter.get(key);

    // Remove old timestamps
    const validTimestamps = timestamps.filter((ts) => now - ts < windowMs);
    this.rateLimiter.set(key, validTimestamps);

    if (validTimestamps.length >= maxPerWindow) {
      return false;
    }

    validTimestamps.push(now);
    return true;
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId) {
    if (!userId) {
      return {
        channels: ['websocket'],
        categories: ['all'],
      };
    }

    if (!this.userPreferences.has(userId)) {
      // Load from database or use defaults
      this.userPreferences.set(userId, {
        channels: ['websocket', 'email'],
        categories: ['content', 'approval', 'collaboration', 'system'],
        quiet_hours: { start: 22, end: 8 },
      });
    }

    return this.userPreferences.get(userId);
  }

  /**
   * Record notification events for analytics
   */
  async recordNotificationEvent(eventType, data) {
    try {
      const notificationEvent = {
        eventType: `Notification${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`,
        aggregateType: 'Notification',
        aggregateId: data.notificationId,
        eventData: {
          ...data,
          timestamp: new Date().toISOString(),
        },
      };

      await this.eventStore.appendToStream(
        `notifications-${data.notificationId}`,
        [notificationEvent],
        -1,
        { source: 'notification_service' }
      );
    } catch (error) {
      logger.error('Failed to record notification event', {
        error: error.message,
        eventType,
        notificationId: data.notificationId,
      });
    }
  }

  /**
   * Helper methods
   */
  generateNotificationId() {
    return require('uuid').v4();
  }

  // eslint-disable-next-line no-unused-vars
  async getEntrySubscribers(_entryId) {
    // Mock implementation - would query database
    return [];
  }

  /**
   * Get notification statistics
   */
  getStats() {
    const queueStats = Array.from(this.deliveryQueue.values()).flat();

    return {
      queuedTasks: queueStats.filter((t) => t.status === 'pending').length,
      processingTasks: queueStats.filter((t) => t.status === 'processing').length,
      deliveredTasks: queueStats.filter((t) => t.status === 'delivered').length,
      failedTasks: queueStats.filter((t) => t.status === 'failed').length,
      totalTasks: queueStats.length,
      templates: this.templates.size,
      channels: Object.keys(this.channels).length,
    };
  }
}

/**
 * WebSocket notification channel
 */
class WebSocketChannel {
  constructor(webSocketManager) {
    this.webSocketManager = webSocketManager;
  }

  // eslint-disable-next-line no-unused-vars
  async send(recipient, message, _context) {
    try {
      const notification = message.websocket;
      if (!notification) {
        return { success: false, error: 'No WebSocket template' };
      }

      const success = await this.webSocketManager.sendRealTimeNotification(
        recipient.userId,
        notification
      );

      return { success, channel: 'websocket' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * Email notification channel
 */
class EmailChannel {
  // eslint-disable-next-line no-unused-vars
  async send(recipient, message, _context) {
    try {
      const emailConfig = message.email;
      if (!emailConfig) {
        return { success: false, error: 'No email template' };
      }

      // Mock email sending - would integrate with actual email service
      logger.info('Mock email sent', {
        to: recipient.email,
        subject: emailConfig.subject,
        template: emailConfig.template,
      });

      return { success: true, channel: 'email', messageId: 'mock-' + Date.now() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * SMS notification channel
 */
class SMSChannel {
  // eslint-disable-next-line no-unused-vars
  async send(recipient, message, _context) {
    try {
      const smsConfig = message.sms;
      if (!smsConfig) {
        return { success: false, error: 'No SMS template' };
      }

      // Mock SMS sending - would integrate with SMS service
      logger.info('Mock SMS sent', {
        to: recipient.phone,
        message: smsConfig.message,
      });

      return { success: true, channel: 'sms', messageId: 'mock-sms-' + Date.now() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;
