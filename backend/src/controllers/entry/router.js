const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../../models/auth/authenticate');
const { validate } = require('../../middleware/validation');
const {
  entrySchema,
  entryUpdateSchema,
  entryListQuerySchema,
  entryLimitQuerySchema,
  emptyQuerySchema,
  entryBulkSchema,
  idSchema,
} = require('../../validation/schemas');
const { presets: cachePresets } = require('../../middleware/cache');
const { EDITORIAL_ROLES, ADMIN_ROLES } = require('../../constants/roles');
const controller = require('./controller');

// ---------------------------------------------------------------------------
// Public reads
//
// The literal paths are declared before `/:id` so that "popular", "recent" and
// "statistics" are not swallowed by the parameterised route.
// ---------------------------------------------------------------------------
router.get(
  '/',
  validate(entryListQuerySchema, 'query'),
  cachePresets.search,
  controller.getAllEntries
);

router.get(
  '/popular',
  validate(entryLimitQuerySchema, 'query'),
  cachePresets.public,
  controller.getPopularEntries
);

router.get(
  '/recent',
  validate(entryLimitQuerySchema, 'query'),
  cachePresets.public,
  controller.getRecentEntries
);

router.get(
  '/statistics',
  validate(emptyQuerySchema, 'query'),
  cachePresets.statistics,
  controller.getStatistics
);

router.get('/:id', validate(idSchema, 'params'), cachePresets.entries, controller.getEntryById);

// ---------------------------------------------------------------------------
// Editorial writes
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize(EDITORIAL_ROLES),
  validate(entrySchema),
  controller.createEntry
);

router.post(
  '/bulk',
  authenticate,
  authorize(ADMIN_ROLES),
  validate(entryBulkSchema),
  controller.bulkOperations
);

router.put(
  '/:id',
  authenticate,
  authorize(EDITORIAL_ROLES),
  validate(idSchema, 'params'),
  validate(entryUpdateSchema),
  controller.updateEntry
);

router.patch(
  '/:id',
  authenticate,
  authorize(EDITORIAL_ROLES),
  validate(idSchema, 'params'),
  validate(entryUpdateSchema),
  controller.updateEntry
);

router.delete(
  '/:id',
  authenticate,
  authorize(EDITORIAL_ROLES),
  validate(idSchema, 'params'),
  controller.deleteEntry
);

module.exports = router;
