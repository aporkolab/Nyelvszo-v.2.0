const fsp = require('fs').promises;
const mongoose = require('mongoose');
const User = require('../models/user');
const userList = require('./users.json');
const entry = require('../models/entry');

const {
	once
} = require('events');
const c = require('config');


// mongoose.connection.dropDatabase();


const AtlasUploader = async (model, fileName) => {
	try {
		const exists = await model.find().count();
		if (!exists) {
			throw new Error();
		}
	} catch (e) {
		const source = await fsp.readFile(
			`./src/seed/${fileName}.json`,
			'utf8'
		);
		const list = JSON.parse(source);
		if (model && model.insertMany) {
			await model.insertMany(list, {
				limit: 100
			});
		}

	}
};

(async () => {
	AtlasUploader(entry, 'entries');

	userList.forEach(async user => {
		const newuser = new User(user);
		await newuser.save();
	})
	console.log("Every file has been processed by the seeder!");

})();