const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../../src/server');
const User = require('../../src/models/user');
const { JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHMS } = require('../../src/models/auth/authenticate');

const PASSWORD = 'TestPassword123!';

/**
 * Sign a token with full control over every claim and signing option.
 *
 * The setup helper always produces a valid access token; these tests need the
 * invalid variants, so they build them from scratch.
 *
 * @param {object} payload - Claims to sign.
 * @param {string} secret - Signing secret.
 * @param {object} [options] - jsonwebtoken sign options.
 * @returns {string} Encoded JWT.
 */
const sign = (payload, secret, options = {}) =>
  jwt.sign(payload, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: JWT_ALGORITHMS[0],
    expiresIn: '15m',
    ...options,
  });

/**
 * Hand-assemble a token whose header claims `alg: none` and which carries no
 * signature at all. jsonwebtoken cannot produce one, and a verifier that does
 * not pin its algorithm list accepts it as authentic.
 *
 * @param {object} payload - Claims to encode.
 * @returns {string} Unsigned JWT.
 */
const unsignedToken = (payload) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    ...payload,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + 900,
  })}.`;
};

describe('Authentication Integration Tests', () => {
  describe('POST /login', () => {
    beforeEach(async () => {
      await createTestUser({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: PASSWORD,
        role: 2,
      });
    });

    test('should successfully log in with valid credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: PASSWORD })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('expiresIn');

      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.split('.')).toHaveLength(3);
      expect(response.body.refreshToken.split('.')).toHaveLength(3);
      expect(response.body.accessToken).not.toBe(response.body.refreshToken);

      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
      expect(response.body.user).toHaveProperty('role', 2);
    });

    test('should sign the two tokens with different secrets', async () => {
      const { body } = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: PASSWORD })
        .expect(200);

      // Cross-verification must fail in both directions, otherwise one stolen
      // secret compromises both token types.
      expect(() => jwt.verify(body.accessToken, process.env.JWT_REFRESH_SECRET)).toThrow();
      expect(() => jwt.verify(body.refreshToken, process.env.JWT_SECRET)).toThrow();
    });

    test('should mark the two tokens with distinct typ claims', async () => {
      const { body } = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: PASSWORD })
        .expect(200);

      expect(jwt.decode(body.accessToken).typ).toBe('access');
      expect(jwt.decode(body.refreshToken).typ).toBe('refresh');

      // The refresh token carries no role, so it cannot be used to assert
      // privileges even if a verifier were tricked into accepting it.
      expect(jwt.decode(body.refreshToken).role).toBeUndefined();
      expect(jwt.decode(body.refreshToken).jti).toEqual(expect.any(String));
    });

    test('should fail with invalid email', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'nonexistent@example.com', password: PASSWORD })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should fail with invalid password', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should not distinguish an unknown account from a wrong password', async () => {
      const unknown = await request(app)
        .post('/login')
        .send({ email: 'nobody@example.com', password: PASSWORD });

      const wrongPassword = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'WrongPassword123!' });

      expect(unknown.status).toBe(wrongPassword.status);
      expect(unknown.body.error).toBe(wrongPassword.body.error);
    });

    test('should fail with missing credentials', async () => {
      const response = await request(app).post('/login').send({}).expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should fail with invalid email format', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'invalid-email', password: PASSWORD })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject an object smuggled in place of the email', async () => {
      // The classic Mongo login bypass: `{ email: { $ne: null } }` matches the
      // first user in the collection unless the field is validated as a string.
      const response = await request(app)
        .post('/login')
        .send({ email: { $ne: null }, password: { $ne: null } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should never echo the submitted password back', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'WrongPassword123!' })
        .expect(401);

      expect(JSON.stringify(response.body)).not.toContain('WrongPassword123!');
    });

    test('should issue an access token the auth middleware accepts', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: PASSWORD })
        .expect(200);

      const decoded = jwt.verify(response.body.accessToken, process.env.JWT_SECRET, {
        algorithms: JWT_ALGORITHMS,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      expect(decoded).toHaveProperty('typ', 'access');
      expect(decoded).toHaveProperty('email', 'test@example.com');
      expect(decoded).toHaveProperty('role', 2);
      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });

    test('should update lastLogin timestamp', async () => {
      const userBefore = await User.findOne({ email: 'test@example.com' });
      expect(userBefore.lastLogin).toBeNull();

      await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: PASSWORD })
        .expect(200);

      const userAfter = await User.findOne({ email: 'test@example.com' });
      expect(userAfter.lastLogin).toBeDefined();
      expect(userAfter.lastLogin).toBeInstanceOf(Date);
    });

    test('should handle concurrent login attempts', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app).post('/login').send({ email: 'test@example.com', password: PASSWORD })
        )
      );

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessToken');
      });
    });

    test('should refuse a deactivated account with 403', async () => {
      await User.updateOne({ email: 'test@example.com' }, { $set: { isActive: false } });

      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: PASSWORD })
        .expect(403);

      expect(response.body.error).toContain('deactivated');
      expect(response.body).not.toHaveProperty('accessToken');
    });

    test('should check credentials before reporting deactivation', async () => {
      // Answering 403 for a wrong password would confirm the account exists.
      await User.updateOne({ email: 'test@example.com' }, { $set: { isActive: false } });

      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.error).toContain('Invalid credentials');
    });
  });

  describe('POST /login/refresh', () => {
    let testUser;
    let accessToken;
    let refreshToken;

    beforeEach(async () => {
      testUser = await createTestUser({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: PASSWORD,
        role: 2,
      });

      const login = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: PASSWORD })
        .expect(200);

      accessToken = login.body.accessToken;
      refreshToken = login.body.refreshToken;
    });

    test('should rotate the pair for a valid refresh token', async () => {
      const response = await request(app).post('/login/refresh').send({ refreshToken }).expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');

      // Rotation: the caller gets a *new* refresh token, not the one it sent.
      expect(response.body.refreshToken).not.toBe(refreshToken);
      expect(jwt.decode(response.body.refreshToken).jti).not.toBe(jwt.decode(refreshToken).jti);

      const decoded = jwt.verify(response.body.accessToken, process.env.JWT_SECRET, {
        algorithms: JWT_ALGORITHMS,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      expect(decoded).toHaveProperty('typ', 'access');
      expect(decoded).toHaveProperty('email', 'test@example.com');
      expect(decoded).toHaveProperty('role', 2);
    });

    test('should let the rotated access token authenticate a request', async () => {
      const { body } = await request(app).post('/login/refresh').send({ refreshToken }).expect(200);

      // Role 2 is not an admin, so a 403 (not a 401) proves the token was
      // accepted as a credential.
      await request(app)
        .get('/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(403);
    });

    test('should reflect a role change made since the refresh token was issued', async () => {
      await User.updateOne({ _id: testUser._id }, { $set: { role: 3 } });

      const { body } = await request(app).post('/login/refresh').send({ refreshToken }).expect(200);

      expect(jwt.decode(body.accessToken).role).toBe(3);
    });

    test('should fail with missing refresh token', async () => {
      const response = await request(app).post('/login/refresh').send({}).expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/login/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject a genuine access token at the refresh endpoint', async () => {
      const response = await request(app)
        .post('/login/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);

      expect(response.body.error).toContain('Invalid refresh token');
    });

    test('should reject a refresh-secret token whose typ is not "refresh"', async () => {
      // Signature, issuer and audience all check out here, so only the typ
      // claim stands between an access token and indefinite self-renewal.
      const wrongTyp = sign(
        { typ: 'access', userId: testUser._id.toString() },
        process.env.JWT_REFRESH_SECRET
      );

      const response = await request(app)
        .post('/login/refresh')
        .send({ refreshToken: wrongTyp })
        .expect(401);

      expect(response.body.error).toContain('Invalid refresh token');
    });

    test('should reject a refresh token signed with the access secret', async () => {
      const wrongSecret = sign(
        { typ: 'refresh', userId: testUser._id.toString() },
        process.env.JWT_SECRET
      );

      await request(app).post('/login/refresh').send({ refreshToken: wrongSecret }).expect(401);
    });

    test('should reject a refresh token with a foreign issuer', async () => {
      const foreign = sign(
        { typ: 'refresh', userId: testUser._id.toString() },
        process.env.JWT_REFRESH_SECRET,
        { issuer: 'some-other-service' }
      );

      await request(app).post('/login/refresh').send({ refreshToken: foreign }).expect(401);
    });

    test('should fail with expired refresh token', async () => {
      const expired = sign(
        { typ: 'refresh', userId: testUser._id.toString() },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .post('/login/refresh')
        .send({ refreshToken: expired })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should fail when user no longer exists', async () => {
      await User.findByIdAndDelete(testUser._id);

      const response = await request(app).post('/login/refresh').send({ refreshToken }).expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should fail when the account has been deactivated', async () => {
      await User.updateOne({ _id: testUser._id }, { $set: { isActive: false } });

      const response = await request(app).post('/login/refresh').send({ refreshToken }).expect(401);

      expect(response.body.error).toContain('no longer active');
    });

    test('should reject an oversized refresh token before verifying it', async () => {
      await request(app)
        .post('/login/refresh')
        .send({ refreshToken: 'a'.repeat(5000) })
        .expect(400);
    });
  });

  describe('Bearer token verification', () => {
    let admin;

    beforeEach(async () => {
      admin = await createTestUser({ email: 'admin@example.com', role: 3 });
    });

    /**
     * Hit an authenticated route with the given header value.
     *
     * `/users` is admin-only, so a 200 means the token was accepted *and* the
     * role was honoured — there is no way to fake a pass.
     *
     * @param {string} [header] - Authorization header value.
     * @returns {Promise<object>} Supertest response.
     */
    const callProtected = (header) => {
      const req = request(app).get('/users');
      return header ? req.set('Authorization', header) : req;
    };

    test('should accept a well-formed access token', async () => {
      const response = await callProtected(authHeader(admin));

      expect(response.status).toBe(200);
    });

    test('should reject a missing Authorization header', async () => {
      const response = await callProtected();

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Access token is required');
    });

    test('should reject a header without the Bearer scheme', async () => {
      const response = await callProtected(signAccessToken(admin));

      expect(response.status).toBe(401);
    });

    test('should reject a refresh token used as a bearer credential', async () => {
      const login = await request(app)
        .post('/login')
        .send({ email: 'admin@example.com', password: PASSWORD })
        .expect(200);

      const response = await callProtected(`Bearer ${login.body.refreshToken}`);

      expect(response.status).toBe(401);
    });

    test('should reject an access-secret token whose typ is not "access"', async () => {
      const wrongTyp = sign(
        { typ: 'refresh', userId: admin._id.toString(), email: admin.email, role: admin.role },
        process.env.JWT_SECRET
      );

      const response = await callProtected(`Bearer ${wrongTyp}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid token');
    });

    test('should reject a token with no typ claim at all', async () => {
      const noTyp = sign(
        { userId: admin._id.toString(), email: admin.email, role: admin.role },
        process.env.JWT_SECRET
      );

      expect((await callProtected(`Bearer ${noTyp}`)).status).toBe(401);
    });

    test('should reject a token minted for a different issuer', async () => {
      const foreign = sign(
        { typ: 'access', userId: admin._id.toString(), email: admin.email, role: admin.role },
        process.env.JWT_SECRET,
        { issuer: 'attacker-service' }
      );

      expect((await callProtected(`Bearer ${foreign}`)).status).toBe(401);
    });

    test('should reject a token minted for a different audience', async () => {
      const foreign = sign(
        { typ: 'access', userId: admin._id.toString(), email: admin.email, role: admin.role },
        process.env.JWT_SECRET,
        { audience: 'some-other-client' }
      );

      expect((await callProtected(`Bearer ${foreign}`)).status).toBe(401);
    });

    test('should reject an unsigned "alg: none" token', async () => {
      const forged = unsignedToken({
        typ: 'access',
        userId: admin._id.toString(),
        email: admin.email,
        role: 3,
      });

      expect((await callProtected(`Bearer ${forged}`)).status).toBe(401);
    });

    test('should reject a token signed with the wrong secret', async () => {
      const forged = sign(
        { typ: 'access', userId: admin._id.toString(), email: admin.email, role: 3 },
        'a-completely-different-secret-of-sufficient-length'
      );

      expect((await callProtected(`Bearer ${forged}`)).status).toBe(401);
    });

    test('should reject an expired access token', async () => {
      const expired = sign(
        { typ: 'access', userId: admin._id.toString(), email: admin.email, role: 3 },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const response = await callProtected(`Bearer ${expired}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('expired');
    });

    test('should reject a not-yet-valid token', async () => {
      const future = sign(
        { typ: 'access', userId: admin._id.toString(), email: admin.email, role: 3 },
        process.env.JWT_SECRET,
        { notBefore: '1h' }
      );

      expect((await callProtected(`Bearer ${future}`)).status).toBe(401);
    });

    test('should reject a token whose account has been deleted', async () => {
      const header = authHeader(admin);
      await User.findByIdAndDelete(admin._id);

      const response = await callProtected(header);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('no longer active');
    });

    test('should reject a token whose account has been deactivated', async () => {
      const header = authHeader(admin);
      await User.updateOne({ _id: admin._id }, { $set: { isActive: false } });

      const response = await callProtected(header);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('no longer active');
    });

    test('should honour the stored role over the role baked into the token', async () => {
      // The account is demoted after the token was minted. Re-reading the
      // account on every request is what makes the demotion take effect
      // immediately instead of when the token expires.
      const header = authHeader(admin);
      await User.updateOne({ _id: admin._id }, { $set: { role: 1 } });

      const response = await callProtected(header);

      expect(response.status).toBe(403);
    });

    test('should reject a token for a syntactically valid but unknown user id', async () => {
      const orphan = sign(
        { typ: 'access', userId: '507f1f77bcf86cd799439011', email: 'ghost@example.com', role: 3 },
        process.env.JWT_SECRET
      );

      expect((await callProtected(`Bearer ${orphan}`)).status).toBe(401);
    });
  });

  describe('Input handling', () => {
    beforeEach(async () => {
      await createTestUser({ email: 'test@example.com', password: PASSWORD, role: 2 });
    });

    test('should reject an email carrying a script payload', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com<script>alert("xss")</script>',
          password: PASSWORD,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle SQL injection attempts without a server error', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: "test@example.com'; DROP TABLE users; --", password: PASSWORD });

      expect([400, 401]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });

    test('should strip unknown fields from the login body', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: PASSWORD, role: 3, isActive: true })
        .expect(200);

      // The extra fields must not influence the issued token.
      expect(jwt.decode(response.body.accessToken).role).toBe(2);
    });

    test('should reject a malformed JSON body with 400', async () => {
      const response = await request(app)
        .post('/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "test@example.com",}')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
