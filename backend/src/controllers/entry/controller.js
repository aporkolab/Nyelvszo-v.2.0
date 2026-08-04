const mongoose = require('mongoose');

const Entry = require('../../models/entry');
const { catchAsync, createNotFoundError } = require('../../middleware/errorHandler');
const { invalidateCache } = require('../../middleware/cache');
const logger = require('../../logger/logger');

// Only these fields may be written from a request body. `createdBy`,
// `updatedBy`, `views`, `isActive` and the timestamps are server-owned.
const WRITABLE_FIELDS = ['hungarian', 'english', 'fieldOfExpertise', 'wordType'];

/**
 * Copy only whitelisted, present fields out of a request body.
 *
 * @param {object} body - Validated request body.
 * @returns {object} Object containing at most the writable fields.
 */
const pickWritable = (body) =>
  WRITABLE_FIELDS.reduce((acc, field) => {
    if (body[field] !== undefined) {
      acc[field] = body[field];
    }
    return acc;
  }, {});

/**
 * Read the validated query.
 *
 * Express 5 makes `req.query` read-only, so the validation middleware also
 * publishes the coerced value on `req.validatedQuery`.
 *
 * @param {object} req - Express request.
 * @returns {object} Validated query parameters.
 */
const query = (req) => req.validatedQuery || req.query;

/**
 * List entries with search, filtering and pagination.
 *
 * @route GET /entries
 * @access Public
 */
const getAllEntries = catchAsync(async (req, res) => {
  const {
    page,
    limit,
    search,
    hungarian,
    english,
    fieldOfExpertise,
    wordType,
    sortBy,
    includeStats,
  } = query(req);

  const { query: findQuery, countQuery } = Entry.searchEntries(search, {
    page,
    limit,
    hungarian,
    english,
    fieldOfExpertise,
    wordType,
    sortBy,
  });

  const [entries, totalItems] = await Promise.all([findQuery, countQuery]);

  const totalPages = Math.ceil(totalItems / limit) || 1;

  const response = {
    data: entries,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    meta: {
      searchTerm: search || null,
      filters: { fieldOfExpertise: fieldOfExpertise || null, wordType: wordType || null },
      sortBy,
    },
  };

  if (includeStats) {
    response.statistics = await Entry.getStatistics();
  }

  res.set({
    'X-Total-Count': String(totalItems),
    'X-Page': String(page),
    'X-Per-Page': String(limit),
  });

  res.json(response);
});

/**
 * Fetch a single entry and record the view.
 *
 * @route GET /entries/:id
 * @access Public
 */
const getEntryById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const entry = await Entry.findOne({ _id: id, isActive: true })
    .populate('createdBy', 'firstName lastName')
    .populate('updatedBy', 'firstName lastName')
    .lean();

  if (!entry) {
    throw createNotFoundError('Entry');
  }

  // Fire and forget: a failed view counter must never fail the read.
  Entry.updateOne({ _id: id }, { $inc: { views: 1 }, $set: { lastViewed: new Date() } }).catch(
    (err) => logger.warn('Failed to increment view count', { entryId: id, error: err.message })
  );

  res.json({ data: entry });
});

/**
 * Create an entry.
 *
 * @route POST /entries
 * @access Editor, Admin
 */
const createEntry = catchAsync(async (req, res) => {
  const entry = new Entry({
    ...pickWritable(req.body),
    createdBy: req.user.userId,
    updatedBy: req.user.userId,
  });

  await entry.save();
  await entry.populate('createdBy', 'firstName lastName');

  invalidateCache.entries();

  logger.audit('Entry created', {
    entryId: entry._id.toString(),
    hungarian: entry.hungarian,
    by: req.user.email,
  });

  res.status(201).json({
    data: entry,
    meta: { message: 'Entry created successfully' },
  });
});

/**
 * Update an entry.
 *
 * @route PUT /entries/:id
 * @route PATCH /entries/:id
 * @access Editor, Admin
 */
const updateEntry = catchAsync(async (req, res) => {
  const { id } = req.params;

  const entry = await Entry.findOneAndUpdate(
    { _id: id, isActive: true },
    { ...pickWritable(req.body), updatedBy: req.user.userId },
    { new: true, runValidators: true }
  ).populate('createdBy updatedBy', 'firstName lastName');

  if (!entry) {
    throw createNotFoundError('Entry');
  }

  invalidateCache.entries();

  logger.audit('Entry updated', {
    entryId: id,
    fields: Object.keys(pickWritable(req.body)),
    by: req.user.email,
  });

  res.json({
    data: entry,
    meta: { message: 'Entry updated successfully' },
  });
});

/**
 * Soft-delete an entry.
 *
 * @route DELETE /entries/:id
 * @access Editor, Admin
 */
const deleteEntry = catchAsync(async (req, res) => {
  const { id } = req.params;

  const entry = await Entry.findOneAndUpdate(
    { _id: id, isActive: true },
    { isActive: false, updatedBy: req.user.userId },
    { new: true }
  );

  if (!entry) {
    throw createNotFoundError('Entry');
  }

  invalidateCache.entries();

  logger.audit('Entry deleted', { entryId: id, hungarian: entry.hungarian, by: req.user.email });

  res.json({ meta: { message: 'Entry deleted successfully', entryId: id } });
});

/**
 * Most-viewed entries.
 *
 * @route GET /entries/popular
 * @access Public
 */
const getPopularEntries = catchAsync(async (req, res) => {
  const { limit } = query(req);
  const data = await Entry.getPopularEntries(limit);
  res.json({ data, meta: { type: 'popular', limit } });
});

/**
 * Most recently added entries.
 *
 * @route GET /entries/recent
 * @access Public
 */
const getRecentEntries = catchAsync(async (req, res) => {
  const { limit } = query(req);
  const data = await Entry.getRecentEntries(limit);
  res.json({ data, meta: { type: 'recent', limit } });
});

/**
 * Aggregate dictionary statistics.
 *
 * @route GET /entries/statistics
 * @access Public
 */
const getStatistics = catchAsync(async (req, res) => {
  const stats = await Entry.getStatistics();

  res.json({
    data: {
      ...stats,
      averageViewsPerEntry: stats.totalEntries > 0 ? stats.totalViews / stats.totalEntries : 0,
    },
    meta: { type: 'statistics' },
  });
});

/**
 * Bulk soft-delete or bulk field update.
 *
 * The request body is validated against `entryBulkSchema`, which restricts
 * `filters` to a closed set of scalar equality matches — the previous version
 * forwarded the raw object into `updateMany`, so an administrator could pass
 * arbitrary Mongo operators.
 *
 * @route POST /entries/bulk
 * @access Admin
 */
const bulkOperations = catchAsync(async (req, res) => {
  const { operation, entries, filters, updateData } = req.body;

  // `mongoose.trusted()` is required because `sanitizeFilter` is on globally:
  // it rewrites every operator object it sees into `{ $eq: … }`, including the
  // ones the server builds itself, which turned this `$in` into a cast error
  // and made bulk-by-id fail outright. The ids are safe to trust — the Joi
  // schema has already checked each one against /^[0-9a-fA-F]{24}$/.
  const selector = entries?.length
    ? { _id: mongoose.trusted({ $in: entries }), isActive: true }
    : { ...filters, isActive: true };

  const update =
    operation === 'delete'
      ? { isActive: false, updatedBy: req.user.userId }
      : { ...pickWritable(updateData), updatedBy: req.user.userId };

  const result = await Entry.updateMany(selector, update);

  invalidateCache.entries();

  logger.audit('Bulk entry operation', {
    operation,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    by: req.user.email,
  });

  res.json({
    data: {
      operation,
      matched: result.matchedCount || 0,
      modified: result.modifiedCount || 0,
    },
    meta: { message: `Bulk ${operation} completed successfully` },
  });
});

module.exports = {
  getAllEntries,
  getEntryById,
  createEntry,
  updateEntry,
  deleteEntry,
  getPopularEntries,
  getRecentEntries,
  getStatistics,
  bulkOperations,
};
