const Entry = require('../../models/entry');
const {
  catchAsync,
  createNotFoundError,
  createValidationError,
} = require('../../middleware/errorHandler');
const { validate, sanitize } = require('../../middleware/validation');
const { entrySchema, entryUpdateSchema, idSchema } = require('../../validation/schemas');
const { presets: cachePresets, invalidateCache } = require('../../middleware/cache');
const logger = require('../../logger/logger');

/**
 * Get all entries with advanced filtering, search, and pagination
 * @route GET /entries
 * @access Public
 */
const getAllEntries = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    fieldOfExpertise,
    wordType,
    sortBy = 'relevance',
    includeStats = false,
  } = req.query;

  // Validate pagination parameters
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  // Build search options
  const searchOptions = {
    page: pageNum,
    limit: limitNum,
    fieldOfExpertise,
    wordType,
    sortBy,
  };

  // Log search request for analytics
  logger.performance('Entry search request', {
    search: search || 'none',
    filters: { fieldOfExpertise, wordType },
    sortBy,
    pagination: { page: pageNum, limit: limitNum },
    userRole: req.user?.role || 'anonymous',
  });

  // Execute search with optimized queries
  const { query, countQuery } = Entry.searchEntries(search, searchOptions);

  // Execute both queries in parallel
  const [entries, totalCount] = await Promise.all([query, countQuery]);

  // Calculate pagination metadata
  const totalPages = Math.ceil(totalCount / limitNum);
  const hasNextPage = pageNum < totalPages;
  const hasPrevPage = pageNum > 1;

  // Prepare response
  const response = {
    data: entries,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems: totalCount,
      itemsPerPage: limitNum,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? pageNum + 1 : null,
      prevPage: hasPrevPage ? pageNum - 1 : null,
    },
    meta: {
      searchTerm: search || null,
      filters: {
        fieldOfExpertise: fieldOfExpertise || null,
        wordType: wordType || null,
      },
      sortBy,
      timestamp: new Date().toISOString(),
    },
  };

  // Include statistics if requested
  if (includeStats === 'true' || includeStats === true) {
    const stats = await Entry.getStatistics();
    response.statistics = stats;
  }

  // Set appropriate cache headers
  res.set({
    'X-Total-Count': totalCount,
    'X-Page': pageNum,
    'X-Per-Page': limitNum,
  });

  res.json(response);
});

/**
 * Get single entry by ID
 * @route GET /entries/:id
 * @access Public
 */
const getEntryById = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Find entry with lean query for better performance
  const entry = await Entry.findOne({ _id: id, isActive: true })
    .populate('createdBy', 'firstName lastName')
    .populate('updatedBy', 'firstName lastName')
    .lean();

  if (!entry) {
    throw createNotFoundError('Entry');
  }

  // Increment view count asynchronously (fire and forget)
  Entry.findByIdAndUpdate(
    id,
    {
      $inc: { views: 1 },
      $set: { lastViewed: new Date() },
    },
    { new: false }
  ).catch((err) => {
    logger.warn('Failed to increment view count', {
      entryId: id,
      error: err.message,
    });
  });

  // Log entry view for analytics
  logger.performance('Entry viewed', {
    entryId: id,
    hungarian: entry.hungarian,
    english: entry.english,
    userRole: req.user?.role || 'anonymous',
    ip: req.ip,
  });

  res.json({
    data: entry,
    meta: {
      timestamp: new Date().toISOString(),
      viewed: true,
    },
  });
});

/**
 * Create new entry
 * @route POST /entries
 * @access Private (Editor+)
 */
const createEntry = [
  sanitize('body'),
  validate(entrySchema),
  catchAsync(async (req, res) => {
    const entryData = {
      ...req.body,
      createdBy: req.user?.userId || null,
    };

    const entry = new Entry(entryData);
    const savedEntry = await entry.save();

    // Populate creator info
    await savedEntry.populate('createdBy', 'firstName lastName');

    // Invalidate relevant caches
    invalidateCache.entries();

    // Log entry creation
    logger.audit('Entry created', {
      entryId: savedEntry._id,
      hungarian: savedEntry.hungarian,
      english: savedEntry.english,
      createdBy: req.user?.email,
    });

    res.status(201).json({
      data: savedEntry,
      meta: {
        message: 'Entry created successfully',
        timestamp: new Date().toISOString(),
      },
    });
  }),
];

/**
 * Update entry
 * @route PUT /entries/:id
 * @access Private (Editor+)
 */
const updateEntry = [
  validate(idSchema, 'params'),
  sanitize('body'),
  validate(entryUpdateSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedBy: req.user?.userId || null,
    };

    const entry = await Entry.findOneAndUpdate({ _id: id, isActive: true }, updateData, {
      new: true,
      runValidators: true,
    }).populate('createdBy updatedBy', 'firstName lastName');

    if (!entry) {
      throw createNotFoundError('Entry');
    }

    // Invalidate relevant caches
    invalidateCache.entries();

    // Log entry update
    logger.audit('Entry updated', {
      entryId: id,
      hungarian: entry.hungarian,
      english: entry.english,
      updatedBy: req.user?.email,
      changes: Object.keys(req.body),
    });

    res.json({
      data: entry,
      meta: {
        message: 'Entry updated successfully',
        timestamp: new Date().toISOString(),
      },
    });
  }),
];

/**
 * Partial update entry
 * @route PATCH /entries/:id
 * @access Private (Editor+)
 */
const patchEntry = updateEntry; // Same logic for PATCH

/**
 * Delete entry (soft delete)
 * @route DELETE /entries/:id
 * @access Private (Editor+)
 */
const deleteEntry = [
  validate(idSchema, 'params'),
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const entry = await Entry.findOneAndUpdate(
      { _id: id, isActive: true },
      {
        isActive: false,
        updatedBy: req.user?.userId || null,
      },
      { new: true }
    );

    if (!entry) {
      throw createNotFoundError('Entry');
    }

    // Invalidate relevant caches
    invalidateCache.entries();

    // Log entry deletion
    logger.audit('Entry deleted (soft)', {
      entryId: id,
      hungarian: entry.hungarian,
      english: entry.english,
      deletedBy: req.user?.email,
    });

    res.json({
      meta: {
        message: 'Entry deleted successfully',
        entryId: id,
        timestamp: new Date().toISOString(),
      },
    });
  }),
];

/**
 * Get popular entries
 * @route GET /entries/popular
 * @access Public
 */
const getPopularEntries = catchAsync(async (req, res) => {
  const { limit = 10 } = req.query;
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

  const popularEntries = await Entry.getPopularEntries(limitNum);

  res.json({
    data: popularEntries,
    meta: {
      type: 'popular',
      limit: limitNum,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get recent entries
 * @route GET /entries/recent
 * @access Public
 */
const getRecentEntries = catchAsync(async (req, res) => {
  const { limit = 10 } = req.query;
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

  const recentEntries = await Entry.getRecentEntries(limitNum);

  res.json({
    data: recentEntries,
    meta: {
      type: 'recent',
      limit: limitNum,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get entry statistics
 * @route GET /entries/statistics
 * @access Public
 */
const getStatistics = catchAsync(async (req, res) => {
  const stats = await Entry.getStatistics();

  // Add additional computed statistics
  const additionalStats = {
    averageViewsPerEntry: stats.totalEntries > 0 ? stats.totalViews / stats.totalEntries : 0,
    entriesPerField: stats.totalEntries > 0 ? stats.totalEntries / stats.totalFields : 0,
    lastUpdated: new Date().toISOString(),
  };

  res.json({
    data: {
      ...stats,
      ...additionalStats,
    },
    meta: {
      type: 'statistics',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Bulk operations for entries
 * @route POST /entries/bulk
 * @access Private (Admin)
 */
const bulkOperations = catchAsync(async (req, res) => {
  const { operation, entries, filters } = req.body;

  if (!operation) {
    throw createValidationError('Operation type is required');
  }

  let result;

  switch (operation) {
    case 'delete':
      if (entries && entries.length > 0) {
        // Delete specific entries
        result = await Entry.updateMany(
          { _id: { $in: entries }, isActive: true },
          {
            isActive: false,
            updatedBy: req.user?.userId,
          }
        );
      } else if (filters) {
        // Delete by filters
        result = await Entry.updateMany(
          { ...filters, isActive: true },
          {
            isActive: false,
            updatedBy: req.user?.userId,
          }
        );
      } else {
        throw createValidationError('Either entries array or filters must be provided');
      }
      break;

    case 'update':
      if (!req.body.updateData) {
        throw createValidationError('Update data is required');
      }

      const updateData = {
        ...req.body.updateData,
        updatedBy: req.user?.userId,
      };

      if (entries && entries.length > 0) {
        result = await Entry.updateMany({ _id: { $in: entries }, isActive: true }, updateData);
      } else if (filters) {
        result = await Entry.updateMany({ ...filters, isActive: true }, updateData);
      } else {
        throw createValidationError('Either entries array or filters must be provided');
      }
      break;

    default:
      throw createValidationError('Invalid operation type');
  }

  // Invalidate caches after bulk operations
  invalidateCache.entries();

  // Log bulk operation
  logger.audit('Bulk operation performed', {
    operation,
    entriesAffected: result.modifiedCount || result.matchedCount,
    performedBy: req.user?.email,
  });

  res.json({
    data: {
      operation,
      matched: result.matchedCount || 0,
      modified: result.modifiedCount || 0,
      acknowledged: result.acknowledged,
    },
    meta: {
      message: `Bulk ${operation} completed successfully`,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = {
  getAllEntries,
  getEntryById,
  createEntry,
  updateEntry,
  patchEntry,
  deleteEntry,
  getPopularEntries,
  getRecentEntries,
  getStatistics,
  bulkOperations,
};
