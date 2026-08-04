const mongoose = require('mongoose');

const User = require('../../models/user');
const {
  catchAsync,
  createNotFoundError,
  createConflictError,
} = require('../../middleware/errorHandler');
const { ROLES } = require('../../constants/roles');
const logger = require('../../logger/logger');

// Only these fields may ever be written from a request body. Everything else —
// `_id`, `createdBy`, `updatedBy`, `lastLogin`, timestamps — is derived on the
// server. Spreading req.body into the model is what let any logged-in account
// promote itself to admin.
const WRITABLE_FIELDS = ['firstName', 'lastName', 'email', 'role', 'password', 'isActive'];

/**
 * Copy only whitelisted, present fields out of a request body.
 *
 * @param {object} body - Validated request body.
 * @returns {object} Object containing at most the writable fields.
 */
const pickWritable = (body) =>
  WRITABLE_FIELDS.reduce((acc, field) => {
    if (body[field] !== undefined) {
      acc[field] = body[field];
    }
    return acc;
  }, {});

/**
 * List users.
 *
 * @route GET /users
 * @access Admin
 */
const listUsers = catchAsync(async (req, res) => {
  // `userListQuerySchema` has already coerced and defaulted these, so read the
  // validated value rather than re-parsing the raw string. Comparing the
  // already-coerced `isActive` against the string 'true' was never true, which
  // meant ?isActive=true returned exactly the deactivated accounts.
  const { page, limit, role, isActive } = req.validatedQuery || req.query;

  const filter = {};
  if (role !== undefined) {
    filter.role = role;
  }
  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

  const [users, totalItems] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalItems / limit) || 1;

  res.json({
    data: users,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
});

/**
 * Fetch a single user.
 *
 * @route GET /users/:id
 * @access Admin
 */
const getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id).lean();

  if (!user) {
    throw createNotFoundError('User');
  }

  res.json({ data: user });
});

/**
 * Create a user.
 *
 * @route POST /users
 * @access Admin
 */
const createUser = catchAsync(async (req, res) => {
  const payload = pickWritable(req.body);

  const existing = await User.findOne({ email: payload.email }).lean();
  if (existing) {
    throw createConflictError(
      'An account with this email address already exists',
      'DuplicateEmailError'
    );
  }

  // new + save (not create/insertMany) so the pre('save') bcrypt hook runs.
  const user = new User({ ...payload, createdBy: req.user.userId, updatedBy: req.user.userId });
  await user.save();

  logger.audit('User created', {
    createdUserId: user._id.toString(),
    createdUserEmail: user.email,
    role: user.role,
    by: req.user.email,
  });

  res.status(201).json({
    data: user.toSafeObject(),
    meta: { message: 'User created successfully' },
  });
});

/**
 * Update a user.
 *
 * Guards two ways an administrator can lock everyone out: demoting or
 * deactivating themselves, and removing the last remaining active admin.
 *
 * @route PUT /users/:id
 * @route PATCH /users/:id
 * @access Admin
 */
const updateUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const payload = pickWritable(req.body);

  const user = await User.findById(id).select('+password');
  if (!user) {
    throw createNotFoundError('User');
  }

  const isSelf = req.user.userId === id;
  const losesAdmin =
    user.role === ROLES.ADMIN &&
    ((payload.role !== undefined && payload.role !== ROLES.ADMIN) || payload.isActive === false);

  if (isSelf && losesAdmin) {
    throw createConflictError('You cannot revoke your own administrator access');
  }

  if (losesAdmin) {
    const remainingAdmins = await User.countActiveAdmins(id);
    if (remainingAdmins === 0) {
      throw createConflictError('At least one active administrator must remain');
    }
  }

  if (payload.email && payload.email !== user.email) {
    // `mongoose.trusted()` because `sanitizeFilter` is enabled globally; without
    // it this server-built `$ne` is rewritten into `{ $eq: { $ne: … } }` and the
    // duplicate-email check fails to cast, surfacing as a 400 instead of a 409.
    const clash = await User.findOne({
      email: payload.email,
      _id: mongoose.trusted({ $ne: id }),
    }).lean();
    if (clash) {
      throw createConflictError(
        'An account with this email address already exists',
        'DuplicateEmailError'
      );
    }
  }

  // Assign then save, so the password hashing hook fires. An empty or absent
  // password means "leave it alone" — the edit form does not know the current
  // one and must not be able to blank it.
  Object.entries(payload).forEach(([field, value]) => {
    if (field === 'password' && !value) return;
    user[field] = value;
  });
  user.updatedBy = req.user.userId;

  await user.save();

  logger.audit('User updated', {
    updatedUserId: id,
    fields: Object.keys(payload).filter((f) => f !== 'password'),
    passwordChanged: Boolean(payload.password),
    by: req.user.email,
  });

  res.json({
    data: user.toSafeObject(),
    meta: { message: 'User updated successfully' },
  });
});

/**
 * Delete a user.
 *
 * @route DELETE /users/:id
 * @access Admin
 */
const deleteUser = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (req.user.userId === id) {
    throw createConflictError('You cannot delete your own account');
  }

  const user = await User.findById(id);
  if (!user) {
    throw createNotFoundError('User');
  }

  if (user.role === ROLES.ADMIN) {
    const remainingAdmins = await User.countActiveAdmins(id);
    if (remainingAdmins === 0) {
      throw createConflictError('At least one active administrator must remain');
    }
  }

  await user.deleteOne();

  logger.audit('User deleted', {
    deletedUserId: id,
    deletedUserEmail: user.email,
    by: req.user.email,
  });

  res.status(204).send();
});

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
