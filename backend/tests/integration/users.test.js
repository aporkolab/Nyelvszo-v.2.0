const request = require('supertest');

const app = require('../../src/server');
const User = require('../../src/models/user');
const { ROLES } = require('../../src/constants/roles');

const PASSWORD = 'TestPassword123!';

// A well-formed ObjectId that never exists, for "not found" paths.
const MISSING_ID = '507f1f77bcf86cd799439011';

/**
 * Every route the users router exposes, as method/path pairs.
 *
 * The whole router sits behind authenticate + authorize(ADMIN_ROLES), so the
 * table is enumerated once and reused by the authorization tests — a route
 * added without a matching guard shows up as a gap here.
 *
 * @param {string} id - Target user id to interpolate into the parameterised routes.
 * @returns {Array<{method: string, path: string, body?: object}>} Route table.
 */
const allRoutes = (id) => [
  { method: 'get', path: '/users' },
  { method: 'post', path: '/users', body: { firstName: 'A', lastName: 'B' } },
  { method: 'get', path: `/users/${id}` },
  { method: 'put', path: `/users/${id}`, body: { firstName: 'Nope' } },
  { method: 'patch', path: `/users/${id}`, body: { role: ROLES.ADMIN } },
  { method: 'delete', path: `/users/${id}` },
];

describe('Users API', () => {
  let admin;
  let editor;
  let viewer;

  beforeEach(async () => {
    admin = await createTestUser({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      role: ROLES.ADMIN,
      password: PASSWORD,
    });

    editor = await createTestUser({
      firstName: 'Editor',
      lastName: 'User',
      email: 'editor@example.com',
      role: ROLES.EDITOR,
      password: PASSWORD,
    });

    viewer = await createTestUser({
      firstName: 'Viewer',
      lastName: 'User',
      email: 'viewer@example.com',
      role: ROLES.VIEWER,
      password: PASSWORD,
    });
  });

  describe('Authorization', () => {
    test('should reject every route without a token', async () => {
      const responses = await Promise.all(
        allRoutes(viewer._id.toString()).map(({ method, path, body }) =>
          request(app)[method](path).send(body)
        )
      );

      responses.forEach((response) => {
        expect(response.status).toBe(401);
      });
    });

    test('should reject every route for a viewer (role 1)', async () => {
      const header = authHeader(viewer);

      const responses = await Promise.all(
        allRoutes(admin._id.toString()).map(({ method, path, body }) =>
          request(app)[method](path).set('Authorization', header).send(body)
        )
      );

      responses.forEach((response) => {
        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Insufficient permissions');
      });
    });

    test('should reject every route for an editor (role 2)', async () => {
      const header = authHeader(editor);

      const responses = await Promise.all(
        allRoutes(admin._id.toString()).map(({ method, path, body }) =>
          request(app)[method](path).set('Authorization', header).send(body)
        )
      );

      responses.forEach((response) => {
        expect(response.status).toBe(403);
      });
    });

    test('should refuse a viewer promoting themselves to admin', async () => {
      // The escalation this router exists to prevent: PATCH your own record
      // with role 3 and the whole installation is yours.
      const response = await request(app)
        .patch(`/users/${viewer._id}`)
        .set('Authorization', authHeader(viewer))
        .send({ role: ROLES.ADMIN })
        .expect(403);

      expect(response.body.error).toContain('Insufficient permissions');

      const unchanged = await User.findById(viewer._id);
      expect(unchanged.role).toBe(ROLES.VIEWER);
    });

    test('should refuse an editor promoting themselves to admin', async () => {
      await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(editor))
        .send({ role: ROLES.ADMIN })
        .expect(403);

      const unchanged = await User.findById(editor._id);
      expect(unchanged.role).toBe(ROLES.EDITOR);
    });

    test('should refuse a viewer reactivating a disabled account', async () => {
      await User.updateOne({ _id: editor._id }, { $set: { isActive: false } });

      await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(viewer))
        .send({ isActive: true })
        .expect(403);

      const stillDisabled = await User.findById(editor._id);
      expect(stillDisabled.isActive).toBe(false);
    });

    test('should admit an admin', async () => {
      await request(app).get('/users').set('Authorization', authHeader(admin)).expect(200);
    });
  });

  describe('GET /users', () => {
    test('should return a data/pagination envelope', async () => {
      const response = await request(app)
        .get('/users')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toEqual({
        currentPage: 1,
        totalPages: 1,
        totalItems: 3,
        itemsPerPage: 25,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    test('should never include password hashes', async () => {
      const response = await request(app)
        .get('/users')
        .set('Authorization', authHeader(admin))
        .expect(200);

      response.body.data.forEach((user) => {
        expect(user).not.toHaveProperty('password');
      });
      expect(JSON.stringify(response.body)).not.toContain('$2b$');
    });

    test('should filter by role', async () => {
      const admins = await request(app)
        .get('/users?role=3')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(admins.body.data).toHaveLength(1);
      expect(admins.body.data[0].email).toBe('admin@example.com');
      admins.body.data.forEach((user) => expect(user.role).toBe(ROLES.ADMIN));
      expect(admins.body.pagination.totalItems).toBe(1);

      const editors = await request(app)
        .get('/users?role=2')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(editors.body.data.map((user) => user.email)).toEqual(['editor@example.com']);
      editors.body.data.forEach((user) => expect(user.role).toBe(ROLES.EDITOR));
    });

    test('should filter by isActive', async () => {
      // `userListQuerySchema` coerces this to a real boolean, so the controller
      // must use the validated value; comparing it against the string 'true' is
      // never satisfied and silently returns the complement of what was asked.
      await User.updateOne({ _id: viewer._id }, { $set: { isActive: false } });

      const active = await request(app)
        .get('/users?isActive=true')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(active.body.data.map((user) => user.email).sort()).toEqual([
        'admin@example.com',
        'editor@example.com',
      ]);
      active.body.data.forEach((user) => expect(user.isActive).toBe(true));
      expect(active.body.pagination.totalItems).toBe(2);

      const inactive = await request(app)
        .get('/users?isActive=false')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(inactive.body.data).toHaveLength(1);
      expect(inactive.body.data[0].email).toBe('viewer@example.com');
      expect(inactive.body.data[0].isActive).toBe(false);
      expect(inactive.body.pagination.totalItems).toBe(1);
    });

    test('should combine the role and isActive filters', async () => {
      await User.updateOne({ _id: editor._id }, { $set: { isActive: false } });

      const activeEditors = await request(app)
        .get('/users?role=2&isActive=true')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(activeEditors.body.data).toHaveLength(0);
      expect(activeEditors.body.pagination.totalItems).toBe(0);

      const inactiveEditors = await request(app)
        .get('/users?role=2&isActive=false')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(inactiveEditors.body.data.map((user) => user.email)).toEqual(['editor@example.com']);
    });

    test('should paginate', async () => {
      const first = await request(app)
        .get('/users?page=1&limit=2')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(first.body.data).toHaveLength(2);
      expect(first.body.pagination).toMatchObject({
        currentPage: 1,
        totalPages: 2,
        totalItems: 3,
        itemsPerPage: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });

      const second = await request(app)
        .get('/users?page=2&limit=2')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(second.body.data).toHaveLength(1);
      expect(second.body.pagination).toMatchObject({
        currentPage: 2,
        totalPages: 2,
        totalItems: 3,
        itemsPerPage: 2,
        hasNextPage: false,
        hasPrevPage: true,
      });

      // The two pages together are the whole set, with nothing repeated —
      // which is what proves skip and limit are both applied.
      const ids = [...first.body.data, ...second.body.data].map((user) => user._id);
      expect(new Set(ids).size).toBe(3);
    });

    test('should honour limit on its own', async () => {
      const response = await request(app)
        .get('/users?limit=1')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalPages: 3,
        totalItems: 3,
        itemsPerPage: 1,
      });
    });

    test('should page within a filtered set', async () => {
      await User.updateOne({ _id: viewer._id }, { $set: { isActive: false } });

      const response = await request(app)
        .get('/users?isActive=true&page=2&limit=1')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].isActive).toBe(true);
      expect(response.body.pagination).toMatchObject({
        currentPage: 2,
        totalPages: 2,
        totalItems: 2,
        itemsPerPage: 1,
      });
    });

    test('should reject an unknown role filter', async () => {
      const response = await request(app)
        .get('/users?role=99')
        .set('Authorization', authHeader(admin))
        .expect(400);

      expect(response.body.type).toBe('ValidationError');
    });

    test('should reject an operator smuggled into the query string', async () => {
      await request(app)
        .get('/users?role[$ne]=1')
        .set('Authorization', authHeader(admin))
        .expect(400);

      await request(app)
        .get('/users?isActive[$ne]=false')
        .set('Authorization', authHeader(admin))
        .expect(400);
    });

    test('should reject an oversized page size', async () => {
      await request(app)
        .get('/users?limit=100000')
        .set('Authorization', authHeader(admin))
        .expect(400);
    });

    test('should strip unknown query parameters', async () => {
      const response = await request(app)
        .get('/users?select=password&sort=-password')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      response.body.data.forEach((user) => expect(user).not.toHaveProperty('password'));
    });
  });

  describe('GET /users/:id', () => {
    test('should return a single user', async () => {
      const response = await request(app)
        .get(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(response.body.data.email).toBe('editor@example.com');
      expect(response.body.data).not.toHaveProperty('password');
    });

    test('should answer 404 for a missing user', async () => {
      const response = await request(app)
        .get(`/users/${MISSING_ID}`)
        .set('Authorization', authHeader(admin))
        .expect(404);

      expect(response.body.type).toBe('NotFoundError');
    });

    test('should answer 400, not 500, for a malformed id', async () => {
      const response = await request(app)
        .get('/users/not-an-object-id')
        .set('Authorization', authHeader(admin))
        .expect(400);

      expect(response.body.type).toBe('ValidationError');
    });
  });

  describe('POST /users', () => {
    const newUser = {
      firstName: 'Nóra',
      lastName: 'Kovács',
      email: 'nora@example.com',
      role: ROLES.EDITOR,
      password: 'BrandNewPass123!',
    };

    test('should create a user', async () => {
      const response = await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send(newUser)
        .expect(201);

      expect(response.body.data).toMatchObject({
        firstName: 'Nóra',
        lastName: 'Kovács',
        email: 'nora@example.com',
        role: ROLES.EDITOR,
        isActive: true,
      });
      expect(response.body.data).not.toHaveProperty('password');
      expect(response.body.meta.message).toBe('User created successfully');
    });

    test('should hash the password and let the new account log in', async () => {
      await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send(newUser)
        .expect(201);

      const stored = await User.findOne({ email: 'nora@example.com' }).select('+password');

      expect(stored.password).not.toBe(newUser.password);
      expect(stored.password).toMatch(/^\$2[ayb]\$/);

      await request(app)
        .post('/login')
        .send({ email: 'nora@example.com', password: newUser.password })
        .expect(200);
    });

    test('should record who created the account', async () => {
      await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send(newUser)
        .expect(201);

      const stored = await User.findOne({ email: 'nora@example.com' });

      expect(stored.createdBy.toString()).toBe(admin._id.toString());
      expect(stored.updatedBy.toString()).toBe(admin._id.toString());
    });

    test('should strip unknown body fields', async () => {
      const response = await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send({
          ...newUser,
          _id: MISSING_ID,
          isAdmin: true,
          createdBy: viewer._id.toString(),
          lastLogin: '2020-01-01T00:00:00.000Z',
          __proto__: { polluted: true },
        })
        .expect(201);

      expect(response.body.data).not.toHaveProperty('isAdmin');
      expect(response.body.data._id).not.toBe(MISSING_ID);

      const stored = await User.findOne({ email: 'nora@example.com' });

      // createdBy comes from the authenticated admin, not from the body.
      expect(stored.createdBy.toString()).toBe(admin._id.toString());
      expect(stored.lastLogin).toBeNull();
      expect(stored.toObject()).not.toHaveProperty('isAdmin');
    });

    test('should reject a duplicate email with 409', async () => {
      const response = await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send({ ...newUser, email: 'editor@example.com' })
        .expect(409);

      // Discriminated from the other 409s (self-demotion, last administrator)
      // so the admin editor can put this one on the email field and the rest in
      // a banner.
      expect(response.body.type).toBe('DuplicateEmailError');
      expect(response.body.error).toContain('already exists');
    });

    test('should treat a differently-cased duplicate email as a duplicate', async () => {
      await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send({ ...newUser, email: 'EDITOR@Example.COM' })
        .expect(409);
    });

    test('should reject a weak password', async () => {
      const weak = [
        'Short1!A', // under 12 characters
        'alllowercase123!', // no uppercase
        'ALLUPPERCASE123!', // no lowercase
        'NoSymbolsHere123', // no symbol
        'NoDigitsHere!!!!', // no digit
      ];

      for (const password of weak) {
        const response = await request(app)
          .post('/users')
          .set('Authorization', authHeader(admin))
          .send({ ...newUser, password });

        expect(response.status).toBe(400);
        expect(response.body.type).toBe('ValidationError');
      }
    });

    test('should reject an unknown role', async () => {
      await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send({ ...newUser, role: 99 })
        .expect(400);
    });

    test('should report every invalid field at once', async () => {
      const response = await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send({ firstName: 'A', lastName: 'B', email: 'nope', role: 9, password: 'x' })
        .expect(400);

      expect(response.body.details.length).toBeGreaterThan(1);
      expect(response.body.details.map((d) => d.field)).toEqual(
        expect.arrayContaining(['firstName', 'email', 'role', 'password'])
      );
    });

    test('should not leak the submitted password in the error response', async () => {
      const response = await request(app)
        .post('/users')
        .set('Authorization', authHeader(admin))
        .send({ ...newUser, email: 'editor@example.com' })
        .expect(409);

      expect(JSON.stringify(response.body)).not.toContain('BrandNewPass123!');
    });
  });

  describe('PATCH /users/:id', () => {
    test('should update whitelisted fields', async () => {
      const response = await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({ firstName: 'Renamed', role: ROLES.VIEWER })
        .expect(200);

      expect(response.body.data.firstName).toBe('Renamed');
      expect(response.body.data.role).toBe(ROLES.VIEWER);
      expect(response.body.data).not.toHaveProperty('password');

      const stored = await User.findById(editor._id);
      expect(stored.updatedBy.toString()).toBe(admin._id.toString());
    });

    test('should bcrypt-hash a password sent through PATCH', async () => {
      const newPassword = 'RotatedSecret123!';

      await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({ password: newPassword })
        .expect(200);

      const stored = await User.findById(editor._id).select('+password');

      // Two independent checks: the stored value is not the plaintext, and the
      // hash is the one bcrypt would produce for it.
      expect(stored.password).not.toBe(newPassword);
      expect(stored.password).toMatch(/^\$2[ayb]\$/);
      await expect(stored.verifyPassword(newPassword)).resolves.toBe(true);

      // And the account can actually log in with it, which is what proves the
      // hash is usable rather than merely non-plaintext.
      await request(app)
        .post('/login')
        .send({ email: 'editor@example.com', password: newPassword })
        .expect(200);

      await request(app)
        .post('/login')
        .send({ email: 'editor@example.com', password: PASSWORD })
        .expect(401);
    });

    test('should leave the password alone when an empty one is sent', async () => {
      const before = (await User.findById(editor._id).select('+password')).password;

      await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({ firstName: 'Renamed', password: '' })
        .expect(200);

      const after = (await User.findById(editor._id).select('+password')).password;

      expect(after).toBe(before);
      await request(app)
        .post('/login')
        .send({ email: 'editor@example.com', password: PASSWORD })
        .expect(200);
    });

    test('should strip unknown body fields', async () => {
      await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({
          firstName: 'Renamed',
          _id: MISSING_ID,
          createdBy: viewer._id.toString(),
          lastLogin: '2020-01-01T00:00:00.000Z',
          views: 999,
        })
        .expect(200);

      const stored = await User.findById(editor._id);

      expect(stored._id.toString()).toBe(editor._id.toString());
      expect(stored.createdBy).toBeNull();
      expect(stored.lastLogin).toBeNull();
      expect(stored.toObject()).not.toHaveProperty('views');
    });

    test('should reject an empty body', async () => {
      await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({})
        .expect(400);
    });

    test('should refuse a duplicate email with 409', async () => {
      // The controller's "any other account with this email" clause is a
      // server-built `{ _id: { $ne: id } }`, and `sanitizeFilter` is enabled
      // globally, so it has to be wrapped in `mongoose.trusted()`. Without that
      // it is rewritten into `{ _id: { $eq: { $ne: id } } }`, fails to cast, and
      // the conflict surfaces as a 400 CastError instead.
      const response = await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({ email: 'viewer@example.com' })
        .expect(409);

      // Discriminated from the other 409s (self-demotion, last administrator)
      // so the admin editor can put this one on the email field and the rest in
      // a banner.
      expect(response.body.type).toBe('DuplicateEmailError');
      expect(response.body.error).toContain('already exists');

      const stored = await User.findById(editor._id);
      expect(stored.email).toBe('editor@example.com');
      await expect(User.countDocuments({ email: 'viewer@example.com' })).resolves.toBe(1);
    });

    test('should allow an email nobody else holds', async () => {
      await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({ email: 'renamed@example.com' })
        .expect(200);

      const stored = await User.findById(editor._id);
      expect(stored.email).toBe('renamed@example.com');
    });

    test('should allow an unchanged email through', async () => {
      await request(app)
        .patch(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({ email: 'editor@example.com', firstName: 'Renamed' })
        .expect(200);
    });

    test('should answer 404 for a missing user', async () => {
      await request(app)
        .patch(`/users/${MISSING_ID}`)
        .set('Authorization', authHeader(admin))
        .send({ firstName: 'Ghost' })
        .expect(404);
    });

    test('should refuse an admin revoking their own admin role', async () => {
      const response = await request(app)
        .patch(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .send({ role: ROLES.EDITOR })
        .expect(409);

      expect(response.body.error).toContain('cannot revoke your own administrator access');

      const stored = await User.findById(admin._id);
      expect(stored.role).toBe(ROLES.ADMIN);
    });

    test('should refuse an admin deactivating themselves', async () => {
      const response = await request(app)
        .patch(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .send({ isActive: false })
        .expect(409);

      expect(response.body.error).toContain('cannot revoke your own administrator access');

      const stored = await User.findById(admin._id);
      expect(stored.isActive).toBe(true);
    });

    test('should still let an admin edit their own harmless fields', async () => {
      await request(app)
        .patch(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .send({ firstName: 'Ádám' })
        .expect(200);

      const stored = await User.findById(admin._id);
      expect(stored.firstName).toBe('Ádám');
      expect(stored.role).toBe(ROLES.ADMIN);
    });

    test('should let one admin demote another while an admin remains', async () => {
      // Also the regression guard for `countActiveAdmins`: demoting an admin
      // takes the `losesAdmin` branch, which counts the admins that would be
      // left. That count excludes the target with a `$ne`, which only survives
      // the global `sanitizeFilter` because the model wraps it in
      // `mongoose.trusted()` — otherwise this answers 400.
      const second = await createTestUser({
        firstName: 'Second',
        lastName: 'Admin',
        email: 'admin2@example.com',
        role: ROLES.ADMIN,
      });

      await request(app)
        .patch(`/users/${second._id}`)
        .set('Authorization', authHeader(admin))
        .send({ role: ROLES.EDITOR })
        .expect(200);

      const stored = await User.findById(second._id);
      expect(stored.role).toBe(ROLES.EDITOR);
      await expect(User.countActiveAdmins()).resolves.toBe(1);
    });

    test('should let one admin deactivate another while an admin remains', async () => {
      const second = await createTestUser({
        firstName: 'Second',
        lastName: 'Admin',
        email: 'admin2@example.com',
        role: ROLES.ADMIN,
      });

      await request(app)
        .patch(`/users/${second._id}`)
        .set('Authorization', authHeader(admin))
        .send({ isActive: false })
        .expect(200);

      const stored = await User.findById(second._id);
      expect(stored.isActive).toBe(false);
      await expect(User.countActiveAdmins()).resolves.toBe(1);
    });

    test('should keep at least one active administrator', async () => {
      // The sole admin cannot demote or deactivate themselves. Every other way
      // in requires an authenticated — therefore active — admin, who is the one
      // account `countActiveAdmins(target)` does not exclude, so the admin set
      // can never be emptied through the API.
      const response = await request(app)
        .patch(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .send({ role: ROLES.VIEWER })
        .expect(409);

      expect(response.body.type).toBe('ConflictError');

      await request(app)
        .patch(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .send({ isActive: false })
        .expect(409);

      const stored = await User.findById(admin._id);
      expect(stored.role).toBe(ROLES.ADMIN);
      expect(stored.isActive).toBe(true);
      await expect(User.countActiveAdmins()).resolves.toBe(1);
    });

    test('should refuse the demotion once the second admin is already gone', async () => {
      const second = await createTestUser({
        firstName: 'Second',
        lastName: 'Admin',
        email: 'admin2@example.com',
        role: ROLES.ADMIN,
      });

      // Demoting the second admin is fine while the caller is still an admin.
      await request(app)
        .patch(`/users/${second._id}`)
        .set('Authorization', authHeader(admin))
        .send({ role: ROLES.EDITOR })
        .expect(200);

      // The caller is now the only one left and cannot step down.
      await request(app)
        .patch(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .send({ role: ROLES.EDITOR })
        .expect(409);

      await expect(User.countActiveAdmins()).resolves.toBe(1);
    });
  });

  describe('PUT /users/:id', () => {
    test('should share the update path with PATCH', async () => {
      const response = await request(app)
        .put(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .send({ firstName: 'Replaced' })
        .expect(200);

      expect(response.body.data.firstName).toBe('Replaced');
    });

    test('should apply the same self-demotion guard', async () => {
      await request(app)
        .put(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .send({ role: ROLES.VIEWER })
        .expect(409);
    });
  });

  describe('DELETE /users/:id', () => {
    test('should delete another account', async () => {
      await request(app)
        .delete(`/users/${viewer._id}`)
        .set('Authorization', authHeader(admin))
        .expect(204);

      await expect(User.findById(viewer._id)).resolves.toBeNull();
    });

    test('should refuse deleting your own account', async () => {
      const response = await request(app)
        .delete(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .expect(409);

      expect(response.body.error).toContain('cannot delete your own account');
      await expect(User.findById(admin._id)).resolves.not.toBeNull();
    });

    test('should not let the last administrator be removed', async () => {
      // Only one admin exists, and self-deletion is refused, so there is no
      // request that can empty the admin set.
      await request(app)
        .delete(`/users/${admin._id}`)
        .set('Authorization', authHeader(admin))
        .expect(409);

      await expect(User.countActiveAdmins()).resolves.toBe(1);
    });

    test('should allow deleting a second admin while one remains', async () => {
      const second = await createTestUser({
        firstName: 'Second',
        lastName: 'Admin',
        email: 'admin2@example.com',
        role: ROLES.ADMIN,
      });

      await request(app)
        .delete(`/users/${second._id}`)
        .set('Authorization', authHeader(admin))
        .expect(204);

      await expect(User.countActiveAdmins()).resolves.toBe(1);
    });

    test('should answer 404 for a missing user', async () => {
      await request(app)
        .delete(`/users/${MISSING_ID}`)
        .set('Authorization', authHeader(admin))
        .expect(404);
    });

    test('should answer 400, not 500, for a malformed id', async () => {
      await request(app).delete('/users/nope').set('Authorization', authHeader(admin)).expect(400);
    });

    test('should invalidate the deleted account token immediately', async () => {
      const header = authHeader(editor);
      await request(app)
        .delete(`/users/${editor._id}`)
        .set('Authorization', authHeader(admin))
        .expect(204);

      await request(app).get('/entries').set('Authorization', header).expect(200);

      // The entries listing is public; the users route is not, and the deleted
      // account's token must no longer authenticate anywhere.
      const response = await request(app).get('/users').set('Authorization', header);
      expect(response.status).toBe(401);
    });
  });
});
