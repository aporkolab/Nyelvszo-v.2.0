const baseService = require('../base/service');
const createError = require('http-errors');

module.exports = (model, populateList = []) => {
  const service = baseService(model, populateList);
  return {
    findAll(req, res, next) {
      return service
        .findAll()
        .then((list) => res.json(list))
        .catch((err) => next(createError(500, err.message)));
    },
    findOne(req, res, next) {
      return service
        .findOne(req.params.id)
        .then((entity) => {
          if (!entity) {
            return next(createError(404, 'Entity not found'));
          }
          return res.json(entity);
        })
        .catch((err) => next(createError(400, err.message)));
    },
    update(req, res, next) {
      return service
        .update(req.params.id, req.body)
        .then((entity) => {
          if (!entity) {
            return next(createError(404, 'Entity not found'));
          }
          res.json(entity);
        })
        .catch((err) => next(createError(400, err.message)));
    },
    create(req, res, next) {
      return service
        .create(req.body)
        .then((entity) => res.status(201).json(entity))
        .catch((err) => next(createError(400, err.message)));
    },
    delete(req, res, next) {
      return service
        .delete(req.params.id)
        .then(() => res.status(204).send())
        .catch((err) => {
          if (err.message === 'Not found') {
            return next(createError(404, err.message));
          }
          next(createError(500, err.message));
        });
    },
  };
};
