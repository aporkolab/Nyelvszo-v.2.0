const mongoose = require('mongoose');

const EntrySchema = mongoose.Schema({
	hungarian: {
		type: String,
		required: true,
		trim: true,
		maxlength: 500,
		index: 'text' // Text index for full-text search
	},
	fieldOfExpertise: {
		type: String,
		required: true,
		trim: true,
		maxlength: 200,
		index: true // Regular index for filtering
	},
	wordType: {
		type: String,
		trim: true,
		maxlength: 100,
		index: true // Index for word type filtering
	},
	english: {
		type: String,
		required: true,
		trim: true,
		maxlength: 500,
		index: 'text' // Text index for full-text search
	},
	createdBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		default: null
	},
	updatedBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		default: null
	},
	views: {
		type: Number,
		default: 0,
		index: true
	},
	lastViewed: {
		type: Date,
		default: null
	},
	isActive: {
		type: Boolean,
		default: true,
		index: true
	}
}, {
	timestamps: true, // Automatically manage createdAt and updatedAt
	toJSON: { virtuals: true },
	toObject: { virtuals: true }
});

// Compound indexes for performance
EntrySchema.index({ hungarian: 'text', english: 'text' }, {
	weights: {
		hungarian: 10,
		english: 5
	},
	name: 'search_index'
});

EntrySchema.index({ fieldOfExpertise: 1, wordType: 1 });
EntrySchema.index({ createdAt: -1 }); // For sorting by creation date
EntrySchema.index({ views: -1 }); // For popular entries
EntrySchema.index({ isActive: 1, createdAt: -1 }); // Active entries sorted by date

// Virtual for word count
EntrySchema.virtual('wordCount').get(function() {
	const hunWords = this.hungarian ? this.hungarian.split(/\s+/).length : 0;
	const engWords = this.english ? this.english.split(/\s+/).length : 0;
	return { hungarian: hunWords, english: engWords };
});

// Pre-save middleware
EntrySchema.pre('save', function(next) {
	if (this.isModified() && !this.isNew) {
		this.updatedAt = new Date();
	}
	next();
});

// Instance methods
EntrySchema.methods.incrementViews = function() {
	this.views += 1;
	this.lastViewed = new Date();
	return this.save();
};

EntrySchema.methods.toSearchResult = function() {
	return {
		_id: this._id,
		hungarian: this.hungarian,
		english: this.english,
		fieldOfExpertise: this.fieldOfExpertise,
		wordType: this.wordType,
		views: this.views,
		createdAt: this.createdAt,
		updatedAt: this.updatedAt
	};
};

// Static methods for optimized queries
EntrySchema.statics.searchEntries = function(searchTerm, options = {}) {
	const {
		page = 1,
		limit = 20,
		fieldOfExpertise,
		wordType,
		sortBy = 'relevance'
	} = options;

	const query = { isActive: true };
	const searchQuery = {};

	// Text search
	if (searchTerm) {
		searchQuery.$text = {
			$search: searchTerm,
			$language: 'none' // Disable language-specific stemming
		};
		searchQuery.score = { $meta: 'textScore' };
	}

	// Filters
	if (fieldOfExpertise) {
		query.fieldOfExpertise = new RegExp(fieldOfExpertise, 'i');
	}

	if (wordType) {
		query.wordType = new RegExp(wordType, 'i');
	}

	// Combine search and filter queries
	const finalQuery = { ...query, ...searchQuery };

	// Sorting
	let sort = {};
	switch (sortBy) {
		case 'relevance':
			sort = searchTerm ? { score: { $meta: 'textScore' } } : { createdAt: -1 };
			break;
		case 'alphabetical':
			sort = { hungarian: 1 };
			break;
		case 'newest':
			sort = { createdAt: -1 };
			break;
		case 'oldest':
			sort = { createdAt: 1 };
			break;
		case 'popular':
			sort = { views: -1 };
			break;
		default:
			sort = { createdAt: -1 };
	}

	const skip = (page - 1) * limit;

	return {
		query: this.find(finalQuery)
			.select('hungarian english fieldOfExpertise wordType views createdAt updatedAt')
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.lean(), // Use lean() for better performance when we don't need mongoose methods
		countQuery: this.countDocuments(finalQuery)
	};
};

EntrySchema.statics.getPopularEntries = function(limit = 10) {
	return this.find({ isActive: true })
		.select('hungarian english fieldOfExpertise views')
		.sort({ views: -1 })
		.limit(limit)
		.lean();
};

EntrySchema.statics.getRecentEntries = function(limit = 10) {
	return this.find({ isActive: true })
		.select('hungarian english fieldOfExpertise createdAt')
		.sort({ createdAt: -1 })
		.limit(limit)
		.lean();
};

EntrySchema.statics.getStatistics = function() {
	return Promise.all([
		this.countDocuments({ isActive: true }),
		this.distinct('fieldOfExpertise', { isActive: true }),
		this.distinct('wordType', { isActive: true }),
		this.aggregate([
			{ $match: { isActive: true } },
			{ $group: { _id: null, totalViews: { $sum: '$views' } } }
		])
	]).then(([totalEntries, fields, wordTypes, viewsResult]) => ({
		totalEntries,
		totalFields: fields.length,
		totalWordTypes: wordTypes.length,
		totalViews: viewsResult[0]?.totalViews || 0,
		fields: fields.sort(),
		wordTypes: wordTypes.sort()
	}));
};

module.exports = mongoose.model('Entry', EntrySchema);
