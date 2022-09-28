module.exports = (model, populateList = []) => {
	return {
		findAll: (params = {}) => {
			if (Object.keys(params).length) {
				Object.keys(params).map(key => {
					params[key] = {
						$regex: '.*' + params[key] + '.*',
						$options: 'i'
					};
				});
				return model.find(params).populate(...populateList);
			}
			return model.find(params).populate(...populateList);
		},
		findOne: (id) => model.findById(id).populate(...populateList),
		// findOne: (id) => model.findById(id).populate(),
		update: (id, updateData) => model.findByIdAndUpdate(id, updateData, {
			new: true
		}),
		create: async (body) => {
			const newEntity = new model(body);
			const error = newEntity.validateSync();
			if (!error) {
				const saved = await newEntity.save();
				return model.findById(saved._id);
			}
			throw new Error(error);
		},
		delete: async (id) => {
			const doc = await model.findByIdAndRemove(id);
			if (!doc) {
				throw new Error('Not found');
			}
			return doc.delete();
		}

	};
}