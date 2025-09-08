const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../models/auth/authenticate');
const { presets: cachePresets } = require('../../middleware/cache');
const controller = require('./controller');

// Public routes with caching

// Get all entries with search and filtering
router.get('/', 
  cachePresets.search, 
  controller.getAllEntries
);

// Get popular entries
router.get('/popular', 
  cachePresets.public, 
  controller.getPopularEntries
);

// Get recent entries
router.get('/recent', 
  cachePresets.public, 
  controller.getRecentEntries
);

// Get statistics
router.get('/statistics', 
  cachePresets.statistics, 
  controller.getStatistics
);

// Get single entry by ID
router.get('/:id', 
  cachePresets.entries, 
  controller.getEntryById
);

// Protected routes (Editor+ required)

// Create new entry
router.post('/', 
  authenticate, 
  authorize([2, 3]), // Editor or Admin
  controller.createEntry
);

// Bulk operations (Admin only)
router.post('/bulk', 
  authenticate, 
  authorize([3]), // Admin only
  controller.bulkOperations
);

// Update entry (full update)
router.put('/:id', 
  authenticate, 
  authorize([2, 3]), // Editor or Admin
  controller.updateEntry
);

// Partial update entry
router.patch('/:id', 
  authenticate, 
  authorize([2, 3]), // Editor or Admin
  controller.patchEntry
);

// Delete entry (soft delete)
router.delete('/:id', 
  authenticate, 
  authorize([2, 3]), // Editor or Admin
  controller.deleteEntry
);

module.exports = router;
