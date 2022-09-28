const express = require('express');
const baseService = require('../base/service');
const createError = require('http-errors');

module.exports = (model, populateList = []) => {
	const service = baseService(model, populateList);
	return {
		findAll(req, res, next) {
			return service.findAll()
				.then(list => res.json(list));
		},
		findOne(req, res, next) {
			return service.findOne(req.params.id)
				.then(entity => {
					if (!entity) {
						return next(new createError.NotFound("Entity has not found"));
					}
					return res.json(entity);
				});
		},
		update(req, res, next) {
			return service.update(req.params.id, req.body)
				.then(entity => res.json(entity))
				.catch(err => {
					res.statusCode = 501;
					res.json(err);
				});
		},
		create(req, res, next) {
			return service.create(req.body)
				.then(entity => res.json(entity))
				.catch(err => {
					res.statusCode = 501;
					res.json(err);
				});
		},
		delete(req, res, next) {
			return service.delete(req.params.id)
				.then(() => res.json({}))
				.catch(err => {

					if (err.message === "Not found") {
						return next(
							new createError.NotFound(err.message)
						)
					}
					next(new createError.InternalServerError(err.message));
				});
		}
	}
}