const mongoose = require('mongoose');

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
      index: {
        unique: true,
        sparse: true,
      },
    },
    role: {
      type: Number,
      required: true,
      min: 1,
      max: 3,
      default: 1,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 128,
      bcrypt: true,
      select: false, // Don't include password by default in queries
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
    timestamps: true, // Automatically manage createdAt and updatedAt
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password; // Remove password from JSON output
        return ret;
      },
    },
  }
);

// Indexes for performance
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastLogin: -1 });

// Virtual for full name
UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Pre-save middleware to track updates
UserSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Instance methods
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

UserSchema.methods.hasRole = function (requiredRole) {
  return this.role >= requiredRole;
};

UserSchema.methods.isEditor = function () {
  return this.role >= 2;
};

UserSchema.methods.isAdmin = function () {
  return this.role >= 3;
};

// Static methods
UserSchema.statics.findByRole = function (role) {
  return this.find({ role, isActive: true });
};

UserSchema.statics.findActiveUsers = function () {
  return this.find({ isActive: true });
};

UserSchema.plugin(require('mongoose-bcrypt'));

module.exports = mongoose.model('User', UserSchema);
