const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../../models/auth/authenticate');
const { validate } = require('../../middleware/validation');
const {
  userSchema,
  userUpdateSchema,
  idSchema,
  userListQuerySchema,
} = require('../../validation/schemas');
const { ADMIN_ROLES } = require('../../constants/roles');
const controller = require('./controller');

// Every route below administers other people's accounts, so the whole router is
// admin-only. Previously this was mounted behind `authenticate` alone, which
// let any logged-in viewer read, create, modify and delete accounts.
router.use(authenticate, authorize(ADMIN_ROLES));

router.get('/', validate(userListQuerySchema, 'query'), controller.listUsers);

router.post('/', validate(userSchema), controller.createUser);

router.get('/:id', validate(idSchema, 'params'), controller.getUser);

router.put('/:id', validate(idSchema, 'params'), validate(userUpdateSchema), controller.updateUser);

router.patch(
  '/:id',
  validate(idSchema, 'params'),
  validate(userUpdateSchema),
  controller.updateUser
);

router.delete('/:id', validate(idSchema, 'params'), controller.deleteUser);

module.exports = router;
