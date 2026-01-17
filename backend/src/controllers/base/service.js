module.exports = (model, populateList = []) => {
  return {
    findAll: (params = {}) => {
      if (Object.keys(params).length) {
        const searchParams = {};
        Object.keys(params).forEach((key) => {
          searchParams[key] = {
            $regex: '.*' + params[key] + '.*',
            $options: 'i',
          };
        });
        return model.find(searchParams).populate(...populateList);
      }
      return model.find(params).populate(...populateList);
    },
    findOne: (id) => model.findById(id).populate(...populateList),
    update: (id, updateData) =>
      model.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }),
    create: async (body) => {
      const newEntity = new model(body);
      const error = newEntity.validateSync();
      if (error) {
        throw new Error(error.message);
      }
      const saved = await newEntity.save();
      return model.findById(saved._id);
    },
    delete: async (id) => {
      const doc = await model.findByIdAndDelete(id);
      if (!doc) {
        throw new Error('Not found');
      }
      return doc;
    },
  };
};
