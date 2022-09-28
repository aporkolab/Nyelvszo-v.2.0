const mongoose = require('mongoose');
const SALT_WORK_FACTOR = 10;

const UserSchema = mongoose.Schema({
	firstName: {
		type: String,
		required: true
	},
	lastName: {
		type: String,
		required: true
	},
	email: {
		type: String,
		required: true,
		index: {
			unique: true,
		}
	},
	role: {
		type: Number,
		required: true
	},
	password: {
		type: String,
		required: true,
		bcrypt: true
	},
});


UserSchema.plugin(require('mongoose-bcrypt'));

module.exports = mongoose.model('User', UserSchema);