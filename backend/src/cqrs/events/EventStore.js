const { EventEmitter } = require('events');
const mongoose = require('mongoose');
const logger = require('../../logger/logger');

/**
 * STATE-OF-THE-ART EVENT SOURCING IMPLEMENTATION
 * 
 * Enterprise-grade Event Store with CQRS pattern
 * - Event Sourcing for complete audit trail
 * - CQRS for read/write separation
 * - Event streaming for real-time updates
 * - Snapshots for performance optimization
 */

// Event Schema for MongoDB
const EventSchema = new mongoose.Schema({
  streamId: {
    type: String,
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  eventVersion: {
    type: Number,
    required: true,
    default: 1
  },
  aggregateId: {
    type: String,
    required: true,
    index: true
  },
  aggregateType: {
    type: String,
    required: true,
    index: true
  },
  eventData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: {
    userId: String,
    correlationId: String,
    causationId: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    source: String,
    version: String,
    traceId: String
  },
  sequenceNumber: {
    type: Number,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'eventstore'
});

// Compound indexes for optimal query performance
EventSchema.index({ streamId: 1, sequenceNumber: 1 }, { unique: true });
EventSchema.index({ aggregateId: 1, aggregateType: 1, sequenceNumber: 1 });
EventSchema.index({ eventType: 1, 'metadata.timestamp': -1 });
EventSchema.index({ 'metadata.correlationId': 1 });

const Event = mongoose.model('Event', EventSchema);

// Snapshot Schema for performance optimization
const SnapshotSchema = new mongoose.Schema({
  aggregateId: {
    type: String,
    required: true,
    unique: true
  },
  aggregateType: {
    type: String,
    required: true
  },
  aggregateVersion: {
    type: Number,
    required: true
  },
  snapshot: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: {
    timestamp: {
      type: Date,
      default: Date.now
    },
    userId: String
  }
}, {
  timestamps: true,
  collection: 'snapshots'
});

SnapshotSchema.index({ aggregateId: 1, aggregateType: 1 }, { unique: true });
const Snapshot = mongoose.model('Snapshot', SnapshotSchema);

class EventStore extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000); // Support many listeners
    this.sequenceCounter = new Map(); // Track sequence numbers per stream
  }

  /**
   * Append events to the event store
   * @param {string} streamId - Stream identifier
   * @param {Array} events - Array of events to append
   * @param {number} expectedVersion - Expected version for optimistic concurrency
   * @param {Object} metadata - Event metadata
   * @returns {Promise<Array>} Persisted events
   */
  async appendToStream(streamId, events, expectedVersion = -1, metadata = {}) {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Get current stream version
        const lastEvent = await Event.findOne(
          { streamId },
          {},
          { sort: { sequenceNumber: -1 }, session }
        );

        const currentVersion = lastEvent ? lastEvent.sequenceNumber : 0;

        // Optimistic concurrency check
        if (expectedVersion !== -1 && currentVersion !== expectedVersion) {
          throw new ConcurrencyError(
            `Expected version ${expectedVersion}, but current version is ${currentVersion}`
          );
        }

        // Prepare events for insertion
        const eventsToInsert = events.map((event, index) => ({
          streamId,
          eventType: event.eventType,
          eventVersion: event.eventVersion || 1,
          aggregateId: event.aggregateId,
          aggregateType: event.aggregateType,
          eventData: event.eventData,
          metadata: {
            ...metadata,
            timestamp: new Date(),
            correlationId: metadata.correlationId || this.generateId(),
            causationId: metadata.causationId,
            traceId: metadata.traceId || this.generateId()
          },
          sequenceNumber: currentVersion + index + 1
        }));

        // Insert events atomically
        const insertedEvents = await Event.insertMany(eventsToInsert, { session });

        // Emit events for real-time processing
        insertedEvents.forEach(event => {
          this.emit('eventAppended', event.toObject());
          this.emit(`event:${event.eventType}`, event.toObject());
          this.emit(`stream:${streamId}`, event.toObject());
        });

        logger.performance('Events appended to stream', {
          streamId,
          eventCount: insertedEvents.length,
          newVersion: currentVersion + events.length,
          correlationId: metadata.correlationId
        });

        return insertedEvents;
      });
    } catch (error) {
      logger.error('Failed to append events to stream', {
        error: error.message,
        streamId,
        expectedVersion,
        metadata
      });
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Read events from stream
   * @param {string} streamId - Stream identifier
   * @param {number} fromVersion - Start reading from this version
   * @param {number} toVersion - Read up to this version
   * @returns {Promise<Array>} Stream events
   */
  async readStreamEvents(streamId, fromVersion = 0, toVersion = Number.MAX_SAFE_INTEGER) {
    try {
      const events = await Event.find({
        streamId,
        sequenceNumber: {
          $gte: fromVersion,
          $lte: toVersion
        }
      })
      .sort({ sequenceNumber: 1 })
      .lean()
      .exec();

      logger.debug('Read events from stream', {
        streamId,
        fromVersion,
        toVersion,
        eventCount: events.length
      });

      return events;
    } catch (error) {
      logger.error('Failed to read stream events', {
        error: error.message,
        streamId,
        fromVersion,
        toVersion
      });
      throw error;
    }
  }

  /**
   * Read events by aggregate
   * @param {string} aggregateId - Aggregate identifier
   * @param {string} aggregateType - Aggregate type
   * @param {number} fromVersion - Start version
   * @returns {Promise<Array>} Aggregate events
   */
  async readAggregateEvents(aggregateId, aggregateType, fromVersion = 0) {
    try {
      // Check if we have a snapshot
      let events = [];
      let startVersion = fromVersion;

      if (fromVersion === 0) {
        const snapshot = await this.getSnapshot(aggregateId, aggregateType);
        if (snapshot) {
          startVersion = snapshot.aggregateVersion + 1;
          events.push({
            eventType: 'SnapshotRestored',
            eventData: snapshot.snapshot,
            sequenceNumber: snapshot.aggregateVersion,
            metadata: snapshot.metadata
          });
        }
      }

      // Get events after snapshot
      const aggregateEvents = await Event.find({
        aggregateId,
        aggregateType,
        sequenceNumber: { $gte: startVersion }
      })
      .sort({ sequenceNumber: 1 })
      .lean()
      .exec();

      events.push(...aggregateEvents);

      logger.debug('Read aggregate events', {
        aggregateId,
        aggregateType,
        fromVersion,
        eventCount: events.length,
        hasSnapshot: startVersion > fromVersion
      });

      return events;
    } catch (error) {
      logger.error('Failed to read aggregate events', {
        error: error.message,
        aggregateId,
        aggregateType,
        fromVersion
      });
      throw error;
    }
  }

  /**
   * Create snapshot for aggregate
   * @param {string} aggregateId - Aggregate identifier
   * @param {string} aggregateType - Aggregate type
   * @param {number} version - Aggregate version
   * @param {Object} snapshot - Snapshot data
   * @param {Object} metadata - Snapshot metadata
   */
  async createSnapshot(aggregateId, aggregateType, version, snapshot, metadata = {}) {
    try {
      await Snapshot.findOneAndUpdate(
        { aggregateId, aggregateType },
        {
          aggregateVersion: version,
          snapshot,
          metadata: {
            ...metadata,
            timestamp: new Date()
          }
        },
        { upsert: true, new: true }
      );

      logger.performance('Snapshot created', {
        aggregateId,
        aggregateType,
        version,
        metadata
      });
    } catch (error) {
      logger.error('Failed to create snapshot', {
        error: error.message,
        aggregateId,
        aggregateType,
        version
      });
      throw error;
    }
  }

  /**
   * Get snapshot for aggregate
   * @param {string} aggregateId - Aggregate identifier
   * @param {string} aggregateType - Aggregate type
   * @returns {Promise<Object|null>} Snapshot or null
   */
  async getSnapshot(aggregateId, aggregateType) {
    try {
      return await Snapshot.findOne({
        aggregateId,
        aggregateType
      }).lean().exec();
    } catch (error) {
      logger.error('Failed to get snapshot', {
        error: error.message,
        aggregateId,
        aggregateType
      });
      return null;
    }
  }

  /**
   * Subscribe to events
   * @param {string} eventType - Event type to subscribe to
   * @param {Function} handler - Event handler function
   */
  subscribe(eventType, handler) {
    this.on(`event:${eventType}`, handler);
    logger.debug('Subscribed to event type', { eventType });
  }

  /**
   * Subscribe to stream events
   * @param {string} streamId - Stream identifier
   * @param {Function} handler - Event handler function
   */
  subscribeToStream(streamId, handler) {
    this.on(`stream:${streamId}`, handler);
    logger.debug('Subscribed to stream', { streamId });
  }

  /**
   * Get stream statistics
   * @param {string} streamId - Stream identifier
   * @returns {Promise<Object>} Stream statistics
   */
  async getStreamStatistics(streamId) {
    try {
      const stats = await Event.aggregate([
        { $match: { streamId } },
        {
          $group: {
            _id: null,
            eventCount: { $sum: 1 },
            firstEvent: { $min: '$metadata.timestamp' },
            lastEvent: { $max: '$metadata.timestamp' },
            eventTypes: { $addToSet: '$eventType' },
            maxSequence: { $max: '$sequenceNumber' }
          }
        }
      ]);

      return stats[0] || {
        eventCount: 0,
        firstEvent: null,
        lastEvent: null,
        eventTypes: [],
        maxSequence: 0
      };
    } catch (error) {
      logger.error('Failed to get stream statistics', {
        error: error.message,
        streamId
      });
      throw error;
    }
  }

  /**
   * Replay events from specific point in time
   * @param {Date} fromDate - Start date
   * @param {Function} eventHandler - Handler for each event
   * @returns {Promise<number>} Number of events processed
   */
  async replayEvents(fromDate, eventHandler) {
    try {
      let processedCount = 0;
      const batchSize = 1000;
      let skip = 0;

      while (true) {
        const events = await Event.find({
          'metadata.timestamp': { $gte: fromDate }
        })
        .sort({ 'metadata.timestamp': 1 })
        .skip(skip)
        .limit(batchSize)
        .lean()
        .exec();

        if (events.length === 0) break;

        for (const event of events) {
          await eventHandler(event);
          processedCount++;
        }

        skip += batchSize;
      }

      logger.performance('Events replayed', {
        fromDate,
        processedCount
      });

      return processedCount;
    } catch (error) {
      logger.error('Failed to replay events', {
        error: error.message,
        fromDate
      });
      throw error;
    }
  }

  /**
   * Generate unique identifier
   * @returns {string} Unique ID
   */
  generateId() {
    return require('uuid').v4();
  }
}

// Custom error classes
class ConcurrencyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

module.exports = {
  EventStore,
  Event,
  Snapshot,
  ConcurrencyError
};
