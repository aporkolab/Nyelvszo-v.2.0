const mongoose = require('mongoose');
const EntrySchema = mongoose.Schema({
	hungarian: {
		type: String,
		required: true
	},
	fieldOfExpertise: {
		type: String,
		required: true
	},
	wordType: {
		type: String,
	},
	english: {
		type: String,
		required: true
	},
});

module.exports = mongoose.model('Entry', EntrySchema);