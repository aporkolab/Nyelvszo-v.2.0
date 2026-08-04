const mongoose = require('mongoose');

const EntrySchema = mongoose.Schema(
  {
    hungarian: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    fieldOfExpertise: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    wordType: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    english: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastViewed: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ---------------------------------------------------------------------------
// Indexes
//
// MongoDB permits exactly one text index per collection. The previous schema
// declared `index: 'text'` on both `hungarian` and `english` *and* a compound
// text index, so index creation failed at runtime and none of them existed.
// This is the single, weighted text index.
// ---------------------------------------------------------------------------
EntrySchema.index(
  { hungarian: 'text', english: 'text' },
  { weights: { hungarian: 10, english: 5 }, name: 'entry_text_search' }
);

// Prefix-anchored lookups use a plain collation-aware index on each term.
EntrySchema.index({ isActive: 1, hungarian: 1 });
EntrySchema.index({ isActive: 1, english: 1 });
EntrySchema.index({ isActive: 1, fieldOfExpertise: 1, wordType: 1 });
EntrySchema.index({ isActive: 1, createdAt: -1 });
EntrySchema.index({ isActive: 1, views: -1 });

EntrySchema.virtual('wordCount').get(function () {
  const count = (value) => (value ? value.trim().split(/\s+/).length : 0);
  return { hungarian: count(this.hungarian), english: count(this.english) };
});

EntrySchema.methods.incrementViews = function () {
  this.views += 1;
  this.lastViewed = new Date();
  return this.save();
};

/**
 * Escape a user-supplied string for literal use inside a RegExp.
 *
 * Without this, a search for `a(` throws, and `(a+)+$` is a catastrophic
 * backtracking payload that pins a CPU core.
 *
 * @param {string} term - Raw search term.
 * @returns {string} Escaped term.
 */
const escapeRegex = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a case-insensitive prefix matcher.
 *
 * Anchored at the start so the index on the field can be used; an unanchored
 * pattern forces a full collection scan on every keystroke.
 *
 * @param {string} term - Raw search term.
 * @returns {RegExp|null} Matcher, or null when the term is blank.
 */
const prefixMatcher = (term) => {
  if (typeof term !== 'string' || !term.trim()) return null;
  return new RegExp(`^${escapeRegex(term.trim())}`, 'i');
};

const SORTS = {
  alphabetical: { hungarian: 1 },
  relevance: { hungarian: 1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  popular: { views: -1 },
};

// Projection shared by every list endpoint. Keeps `createdBy`/`updatedBy` and
// internal counters out of public responses.
const LIST_PROJECTION = 'hungarian english fieldOfExpertise wordType views createdAt updatedAt';

/**
 * Build the find and count queries for a dictionary search.
 *
 * Column filters take precedence over the free-text term, matching the
 * behaviour of the UI's "search in column" selector.
 *
 * @param {string} [searchTerm] - Free-text term.
 * @param {object} [options] - Search options.
 * @param {number} [options.page] - 1-based page number.
 * @param {number} [options.limit] - Page size.
 * @param {string} [options.hungarian] - Hungarian column filter.
 * @param {string} [options.english] - English column filter.
 * @param {string} [options.fieldOfExpertise] - Field-of-expertise filter.
 * @param {string} [options.wordType] - Word-type filter.
 * @param {string} [options.sortBy] - One of the keys of SORTS.
 * @returns {{query: object, countQuery: object}} Mongoose queries.
 */
EntrySchema.statics.searchEntries = function (searchTerm, options = {}) {
  const { page = 1, limit = 20, hungarian, english, fieldOfExpertise, wordType, sortBy } = options;

  const filter = { isActive: true };

  const columnFilters = { hungarian, english, fieldOfExpertise, wordType };
  const hasColumnFilter = Object.values(columnFilters).some((value) => value && value.trim());

  if (hasColumnFilter) {
    Object.entries(columnFilters).forEach(([field, value]) => {
      const matcher = prefixMatcher(value);
      if (matcher) filter[field] = matcher;
    });
  } else {
    const matcher = prefixMatcher(searchTerm);
    if (matcher) {
      // Search both directions: a user typing an English word expects to find
      // it, not just Hungarian headwords.
      filter.$or = [{ hungarian: matcher }, { english: matcher }];
    }
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  return {
    query: this.find(filter)
      .select(LIST_PROJECTION)
      .sort(SORTS[sortBy] || SORTS.relevance)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    countQuery: this.countDocuments(filter),
  };
};

EntrySchema.statics.getPopularEntries = function (limit = 10) {
  return this.find({ isActive: true })
    .select(LIST_PROJECTION)
    .sort({ views: -1 })
    .limit(limit)
    .lean();
};

EntrySchema.statics.getRecentEntries = function (limit = 10) {
  return this.find({ isActive: true })
    .select(LIST_PROJECTION)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Aggregate dictionary-wide statistics.
 *
 * @returns {Promise<object>} Totals plus the distinct field and word-type lists.
 */
EntrySchema.statics.getStatistics = async function () {
  const [totalEntries, fields, wordTypes, viewsResult] = await Promise.all([
    this.countDocuments({ isActive: true }),
    this.distinct('fieldOfExpertise', { isActive: true }),
    this.distinct('wordType', { isActive: true }),
    this.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, totalViews: { $sum: '$views' } } },
    ]),
  ]);

  const nonEmptyWordTypes = wordTypes.filter(Boolean);

  return {
    totalEntries,
    totalFields: fields.length,
    totalWordTypes: nonEmptyWordTypes.length,
    totalViews: viewsResult[0]?.totalViews || 0,
    fields: fields.sort(),
    wordTypes: nonEmptyWordTypes.sort(),
  };
};

module.exports = mongoose.model('Entry', EntrySchema);
