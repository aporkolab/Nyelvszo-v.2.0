/**
 * Numeric authorization roles.
 *
 * Stored on the user document and copied into the JWT. Kept numeric and
 * ordered so "editor or above" checks stay simple, but authorize() matches
 * exact membership — pass every role that should be admitted.
 */
const ROLES = Object.freeze({
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
});

/** Roles allowed to create, update and delete dictionary entries. */
const EDITORIAL_ROLES = Object.freeze([ROLES.EDITOR, ROLES.ADMIN]);

/** Roles allowed to administer user accounts. */
const ADMIN_ROLES = Object.freeze([ROLES.ADMIN]);

/** Every valid role, for validation. */
const ALL_ROLES = Object.freeze(Object.values(ROLES));

module.exports = {
  ROLES,
  EDITORIAL_ROLES,
  ADMIN_ROLES,
  ALL_ROLES,
};
