const Joi = require('joi');
const { ALL_ROLES } = require('../constants/roles');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// Latin letters plus the Hungarian accented set, spaces, hyphens and
// apostrophes. Deliberately permissive about apostrophes: "O'Brien" is a name.
const PERSON_NAME = /^[\p{L}\p{M}\s'’-]+$/u;

// At least one lowercase letter, one uppercase letter, one digit and one
// symbol. The symbol class is open rather than a fixed shortlist, so a
// perfectly good passphrase is not rejected for using the wrong punctuation.
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

const passwordRules = (base) =>
  base.min(12).max(128).pattern(STRONG_PASSWORD).messages({
    'string.empty': 'Password is required',
    'string.min': 'Password must be at least 12 characters',
    'string.max': 'Password cannot exceed 128 characters',
    'string.pattern.base':
      'Password must contain an uppercase letter, a lowercase letter, a digit and a symbol',
  });

const personName = (label) =>
  Joi.string()
    .trim()
    .min(2)
    .max(100)
    .pattern(PERSON_NAME)
    .messages({
      'string.empty': `${label} is required`,
      'string.min': `${label} must be at least 2 characters`,
      'string.max': `${label} cannot exceed 100 characters`,
      'string.pattern.base': `${label} can only contain letters, spaces, hyphens and apostrophes`,
    });

const emailField = Joi.string()
  .email({ tlds: { allow: false } })
  .trim()
  .lowercase()
  .max(255)
  .messages({
    'string.empty': 'Email is required',
    'string.email': 'Please provide a valid email address',
    'string.max': 'Email cannot exceed 255 characters',
  });

const roleField = Joi.number()
  .integer()
  .valid(...ALL_ROLES)
  .messages({
    'number.base': 'Role must be a number',
    'any.only': `Role must be one of: ${ALL_ROLES.join(', ')}`,
  });

// ---------------------------------------------------------------------------
// Dictionary entries
// ---------------------------------------------------------------------------

const entryFields = {
  hungarian: Joi.string().trim().min(1).max(500).messages({
    'string.empty': 'Hungarian term is required',
    'string.max': 'Hungarian term cannot exceed 500 characters',
  }),
  english: Joi.string().trim().min(1).max(500).messages({
    'string.empty': 'English term is required',
    'string.max': 'English term cannot exceed 500 characters',
  }),
  fieldOfExpertise: Joi.string().trim().min(1).max(200).messages({
    'string.empty': 'Field of expertise is required',
    'string.max': 'Field of expertise cannot exceed 200 characters',
  }),
  // Optional in the model, so an empty string from a form must be accepted
  // rather than rejected as a too-short value.
  wordType: Joi.string().trim().max(100).allow('').messages({
    'string.max': 'Word type cannot exceed 100 characters',
  }),
};

const entrySchema = Joi.object({
  hungarian: entryFields.hungarian.required(),
  english: entryFields.english.required(),
  fieldOfExpertise: entryFields.fieldOfExpertise.required(),
  wordType: entryFields.wordType.optional(),
});

const entryUpdateSchema = Joi.object({
  hungarian: entryFields.hungarian.optional(),
  english: entryFields.english.optional(),
  fieldOfExpertise: entryFields.fieldOfExpertise.optional(),
  wordType: entryFields.wordType.optional(),
})
  .min(1)
  .messages({ 'object.min': 'At least one field must be provided' });

/**
 * Query parameters accepted by GET /entries.
 *
 * Declaring these explicitly is what stops a crafted query string from reaching
 * the Mongoose filter as an object (`?hungarian[$ne]=`), which is the classic
 * NoSQL injection vector in Express applications.
 */
const entryListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(200).allow(''),
  hungarian: Joi.string().trim().max(200).allow(''),
  english: Joi.string().trim().max(200).allow(''),
  fieldOfExpertise: Joi.string().trim().max(200).allow(''),
  wordType: Joi.string().trim().max(100).allow(''),
  sortBy: Joi.string()
    .valid('relevance', 'alphabetical', 'newest', 'oldest', 'popular')
    .default('relevance'),
  includeStats: Joi.boolean().default(false),
});

const entryLimitQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10),
});

/**
 * Query for endpoints that take no parameters at all.
 *
 * Applying this is not pedantry: the response cache keys on the query string,
 * so an endpoint that ignores its query still lets an anonymous caller mint
 * unlimited distinct cache entries by appending junk, evicting the real ones.
 */
const emptyQuerySchema = Joi.object({});

/**
 * Body accepted by POST /entries/bulk.
 *
 * `filters` is restricted to a closed set of scalar equality matches. The
 * previous implementation forwarded `req.body.filters` straight into
 * `updateMany`, which let an administrator pass arbitrary Mongo operators.
 */
const entryBulkSchema = Joi.object({
  operation: Joi.string().valid('delete', 'update').required(),
  // `.min(1)` is load-bearing. An empty array satisfies `.xor('entries',
  // 'filters')` while `entries?.length` in the controller is falsy, so the
  // request fell through to the filters branch with `filters` undefined and
  // built the selector `{ isActive: true }` — one call would have soft-deleted
  // the entire dictionary.
  entries: Joi.array().items(Joi.string().pattern(OBJECT_ID)).min(1).max(1000),
  filters: Joi.object({
    fieldOfExpertise: Joi.string().trim().max(200),
    wordType: Joi.string().trim().max(100),
  }).min(1),
  updateData: Joi.object({
    fieldOfExpertise: entryFields.fieldOfExpertise,
    wordType: entryFields.wordType,
  }).min(1),
})
  .xor('entries', 'filters')
  .when(Joi.object({ operation: Joi.valid('update') }).unknown(), {
    then: Joi.object({ updateData: Joi.required() }),
  })
  .messages({
    'object.xor': 'Provide either an entries array or a filters object, not both',
  });

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const userSchema = Joi.object({
  firstName: personName('First name').required(),
  lastName: personName('Last name').required(),
  email: emailField.required(),
  role: roleField.required(),
  password: passwordRules(Joi.string()).required(),
  isActive: Joi.boolean().default(true),
});

const userUpdateSchema = Joi.object({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  email: emailField,
  role: roleField,
  // Absent or empty means "keep the current password". The admin edit form has
  // no way to know the existing one, so requiring it would make every edit
  // impossible.
  password: passwordRules(Joi.string()).allow(''),
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ 'object.min': 'At least one field must be provided' });

const userListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  role: roleField,
  isActive: Joi.boolean(),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const loginSchema = Joi.object({
  email: emailField.required(),
  password: Joi.string().max(128).required().messages({
    'string.empty': 'Password is required',
  }),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().max(4096).required().messages({
    'string.empty': 'Refresh token is required',
  }),
});

const idSchema = Joi.object({
  // Lowercased because ObjectId hex is canonically lower case, and the
  // controllers compare the path parameter against `req.user.userId` as a
  // string. Without normalising, an administrator could send their own id in
  // upper case and slip past the "you cannot delete or demote yourself" guards.
  id: Joi.string().pattern(OBJECT_ID).lowercase().required().messages({
    'string.empty': 'ID is required',
    'string.pattern.base': 'Please provide a valid ID',
  }),
});

module.exports = {
  entrySchema,
  entryUpdateSchema,
  entryListQuerySchema,
  entryLimitQuerySchema,
  emptyQuerySchema,
  entryBulkSchema,
  userSchema,
  userUpdateSchema,
  userListQuerySchema,
  loginSchema,
  refreshSchema,
  idSchema,
};
