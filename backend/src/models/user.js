const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../constants/roles');

// 12 rounds is the current sensible floor for bcrypt on server hardware: still
// a few hundred milliseconds, but meaningfully more expensive to brute-force
// than the 10 this project shipped with.
const SALT_ROUNDS = 12;

const UserSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 255,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    },
    role: {
      type: Number,
      required: true,
      enum: Object.values(ROLES),
      default: ROLES.VIEWER,
    },
    password: {
      type: String,
      required: true,
      maxlength: 128,
      select: false, // Never returned unless a query opts in with .select('+password')
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

// Indexes for performance. `email` gets its uniqueness from here only — the
// field-level `index` option was declared as well, which made Mongoose emit a
// duplicate-index warning on every boot.
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: -1 });

UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

UserSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  }
});

// Query-based updates bypass `pre('save')` entirely. Without this guard a
// password sent through findOneAndUpdate/updateOne lands in the database in
// cleartext and then never matches on login. Hash it here too rather than
// relying on every call site to remember.
const hashPasswordInUpdate = async function () {
  const update = this.getUpdate();
  if (!update) return;

  // Both shapes must be handled, not one or the other. Mongoose's own
  // timestamps middleware registers first and injects `$set: { updatedAt }`,
  // so an update written as `{ password }` arrives here as
  // `{ password, $set: { updatedAt } }` — checking `update.$set || update`
  // would then look only inside `$set`, find no password, and write the
  // plaintext straight through.
  const hash = async (container) => {
    if (container && typeof container.password === 'string' && container.password.length > 0) {
      container.password = await bcrypt.hash(container.password, SALT_ROUNDS);
    }
  };

  await hash(update);
  await hash(update.$set);
};

UserSchema.pre('findOneAndUpdate', hashPasswordInUpdate);
UserSchema.pre('updateOne', hashPasswordInUpdate);
UserSchema.pre('updateMany', hashPasswordInUpdate);

UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

UserSchema.methods.hasRole = function (requiredRole) {
  return this.role >= requiredRole;
};

UserSchema.methods.isEditor = function () {
  return this.role >= ROLES.EDITOR;
};

UserSchema.methods.isAdmin = function () {
  return this.role >= ROLES.ADMIN;
};

/**
 * Compare a candidate password against the stored hash.
 *
 * Requires the document to have been loaded with `.select('+password')`;
 * without the hash there is nothing to compare against, and returning `true`
 * would be catastrophic, so an absent hash always fails.
 *
 * @param {string} candidatePassword - Plaintext password to check.
 * @returns {Promise<boolean>} Whether the password matches.
 */
UserSchema.methods.verifyPassword = async function (candidatePassword) {
  if (!this.password || typeof candidatePassword !== 'string') {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.comparePassword = UserSchema.methods.verifyPassword;

UserSchema.statics.findByRole = function (role) {
  return this.find({ role, isActive: true });
};

UserSchema.statics.findActiveUsers = function () {
  return this.find({ isActive: true });
};

/**
 * Count administrators that are still active.
 *
 * Used to refuse the edit that would leave the installation with no way in.
 *
 * @param {string} [excludeId] - Account to leave out of the count.
 * @returns {Promise<number>} Number of remaining active admins.
 */
UserSchema.statics.countActiveAdmins = function (excludeId) {
  const filter = { role: ROLES.ADMIN, isActive: true };
  if (excludeId) {
    // `mongoose.trusted()` because `sanitizeFilter` is enabled globally and
    // would otherwise rewrite this server-built `$ne` into `{ $eq: { $ne: … } }`
    // and fail to cast.
    filter._id = mongoose.trusted({ $ne: excludeId });
  }
  return this.countDocuments(filter);
};

module.exports = mongoose.model('User', UserSchema);
