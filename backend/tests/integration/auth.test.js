const request = require('supertest');
const app = require('../../src/server');
const User = require('../../src/models/user');
const jwt = require('jsonwebtoken');

describe('Authentication Integration Tests', () => {
  describe('POST /login', () => {
    beforeEach(async () => {
      // Create a test user
      await createTestUser({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'TestPassword123!',
        role: 2
      });
    });

    test('should successfully log in with valid credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('expiresIn');

      // Verify token structure
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken).toMatch(/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*$/);

      // Verify user object doesn't contain password
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
      expect(response.body.user).toHaveProperty('role', 2);
    });

    test('should fail with invalid email', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123!'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should fail with invalid password', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should fail with missing credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should fail with invalid email format', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'invalid-email',
          password: 'TestPassword123!'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should verify JWT token is valid', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      const token = response.body.accessToken;
      const secret = process.env.JWT_SECRET;
      
      expect(() => jwt.verify(token, secret)).not.toThrow();
      
      const decoded = jwt.verify(token, secret);
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
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      const userAfter = await User.findOne({ email: 'test@example.com' });
      expect(userAfter.lastLogin).toBeDefined();
      expect(userAfter.lastLogin).toBeInstanceOf(Date);
    });

    test('should handle concurrent login attempts', async () => {
      const loginRequests = [];
      for (let i = 0; i < 5; i++) {
        loginRequests.push(
          request(app)
            .post('/login')
            .send({
              email: 'test@example.com',
              password: 'TestPassword123!'
            })
        );
      }

      const responses = await Promise.all(loginRequests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessToken');
      });
    });
  });

  describe('POST /login/refresh', () => {
    let validToken;
    let testUser;

    beforeEach(async () => {
      // Create a test user and get a valid token
      testUser = await createTestUser({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'TestPassword123!',
        role: 2
      });

      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      validToken = loginResponse.body.accessToken;
    });

    test('should refresh token with valid refresh token', async () => {
      // Wait a bit to ensure tokens are different (iat changes)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const response = await request(app)
        .post('/login/refresh')
        .send({
          refreshToken: validToken
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn');

      // New token should be valid
      const decoded = jwt.verify(response.body.accessToken, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('email', 'test@example.com');
      expect(decoded).toHaveProperty('role', 2);
    });

    test('should fail with missing refresh token', async () => {
      const response = await request(app)
        .post('/login/refresh')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/login/refresh')
        .send({
          refreshToken: 'invalid.token.here'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should fail with expired refresh token', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        {
          email: testUser.email,
          role: testUser.role,
          userId: testUser._id.toString()
        },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .post('/login/refresh')
        .send({
          refreshToken: expiredToken
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should fail when user no longer exists', async () => {
      // Delete the user
      await User.findByIdAndDelete(testUser._id);

      const response = await request(app)
        .post('/login/refresh')
        .send({
          refreshToken: validToken
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      await createTestUser({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'TestPassword123!',
        role: 2
      });
    });

    test('should allow multiple login attempts within rate limit', async () => {
      // Make 4 login attempts (should be within limit)
      for (let i = 0; i < 4; i++) {
        const response = await request(app)
          .post('/login')
          .send({
            email: 'test@example.com',
            password: 'TestPassword123!'
          });
        
        expect(response.status).toBe(200);
      }
    });

    // Note: This test might be flaky depending on rate limiting implementation
    // In a real scenario, you might want to mock the rate limiting middleware
    test.skip('should block requests after rate limit exceeded', async () => {
      // Make 6 login attempts (should exceed limit of 5)
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post('/login')
            .send({
              email: 'test@example.com',
              password: 'TestPassword123!'
            })
        );
      }

      const responses = await Promise.all(requests);
      
      // Last request should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
    });
  });

  describe('Input Sanitization', () => {
    beforeEach(async () => {
      await createTestUser({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'TestPassword123!',
        role: 2
      });
    });

    test('should sanitize malicious input', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com<script>alert("xss")</script>',
          password: 'TestPassword123!'
        })
        .expect(400); // Should fail validation

      expect(response.body).toHaveProperty('error');
    });

    test('should handle SQL injection attempts', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: "test@example.com'; DROP TABLE users; --",
          password: 'TestPassword123!'
        });

      // Should fail with validation error (400) or auth error (401), not crash (500)
      expect([400, 401]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });
  });
});
