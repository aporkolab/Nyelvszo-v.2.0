const User = require('../../../src/models/user');
const mongoose = require('mongoose');

describe('User Model', () => {
  describe('User Creation', () => {
    test('should create a valid user', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 2,
        password: 'SecurePassword123!'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.firstName).toBe(userData.firstName);
      expect(savedUser.lastName).toBe(userData.lastName);
      expect(savedUser.email).toBe(userData.email.toLowerCase());
      expect(savedUser.role).toBe(userData.role);
      expect(savedUser.isActive).toBe(true);
      expect(savedUser.password).not.toBe(userData.password); // Should be hashed
      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
    });

    test('should fail to create user without required fields', async () => {
      const user = new User({});
      
      await expect(user.save()).rejects.toThrow();
    });

    test('should fail to create user with invalid email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        role: 2,
        password: 'SecurePassword123!'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    test('should fail to create user with duplicate email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 2,
        password: 'SecurePassword123!'
      };

      const user1 = new User(userData);
      await user1.save();

      const user2 = new User({
        ...userData,
        firstName: 'Jane'
      });

      await expect(user2.save()).rejects.toThrow();
    });

    test('should fail to create user with invalid role', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 5, // Invalid role
        password: 'SecurePassword123!'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    test('should hash password on save', async () => {
      const plainPassword = 'SecurePassword123!';
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 2,
        password: plainPassword
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.password).not.toBe(plainPassword);
      expect(savedUser.password).toMatch(/^\\$2[ayb]\\$.{56}$/); // bcrypt hash pattern
    });
  });

  describe('User Instance Methods', () => {
    let user;

    beforeEach(async () => {
      user = await createTestUser({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 2,
        password: 'SecurePassword123!'
      });
    });

    test('should verify correct password', () => {
      const isValid = user.verifyPasswordSync('SecurePassword123!');
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', () => {
      const isValid = user.verifyPasswordSync('WrongPassword123!');
      expect(isValid).toBe(false);
    });

    test('should return safe object without password', () => {
      const safeUser = user.toSafeObject();
      expect(safeUser.password).toBeUndefined();
      expect(safeUser.firstName).toBe('John');
      expect(safeUser.email).toBe('john.doe@example.com');
    });

    test('should check role permissions correctly', () => {
      // Test user with role 1
      const user1 = new User({ role: 1 });
      expect(user1.hasRole(1)).toBe(true);
      expect(user1.hasRole(2)).toBe(false);
      expect(user1.isEditor()).toBe(false);
      expect(user1.isAdmin()).toBe(false);

      // Test user with role 2
      const user2 = new User({ role: 2 });
      expect(user2.hasRole(1)).toBe(true);
      expect(user2.hasRole(2)).toBe(true);
      expect(user2.hasRole(3)).toBe(false);
      expect(user2.isEditor()).toBe(true);
      expect(user2.isAdmin()).toBe(false);

      // Test user with role 3
      const user3 = new User({ role: 3 });
      expect(user3.hasRole(1)).toBe(true);
      expect(user3.hasRole(2)).toBe(true);
      expect(user3.hasRole(3)).toBe(true);
      expect(user3.isEditor()).toBe(true);
      expect(user3.isAdmin()).toBe(true);
    });

    test('should have virtual fullName property', () => {
      expect(user.fullName).toBe('John Doe');
    });
  });

  describe('User Static Methods', () => {
    beforeEach(async () => {
      await createTestUser({
        firstName: 'Active',
        lastName: 'User',
        email: 'active@example.com',
        role: 2,
        isActive: true
      });

      await createTestUser({
        firstName: 'Inactive',
        lastName: 'User',
        email: 'inactive@example.com',
        role: 2,
        isActive: false
      });

      await createTestUser({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        role: 3,
        isActive: true
      });
    });

    test('should find users by role', async () => {
      const editors = await User.findByRole(2);
      expect(editors).toHaveLength(1);
      expect(editors[0].role).toBe(2);
      expect(editors[0].isActive).toBe(true);

      const admins = await User.findByRole(3);
      expect(admins).toHaveLength(1);
      expect(admins[0].role).toBe(3);
    });

    test('should find only active users', async () => {
      const activeUsers = await User.findActiveUsers();
      expect(activeUsers).toHaveLength(2);
      activeUsers.forEach(user => {
        expect(user.isActive).toBe(true);
      });
    });
  });

  describe('User Validation', () => {
    test('should validate firstName length', async () => {
      const userData = {
        firstName: 'a', // Too short
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 2,
        password: 'SecurePassword123!'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    test('should validate lastName length', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'D'.repeat(101), // Too long
        email: 'john.doe@example.com',
        role: 2,
        password: 'SecurePassword123!'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    test('should validate email format', async () => {
      const invalidEmails = [
        'invalid',
        'invalid@',
        '@invalid.com',
        'invalid@invalid',
        'invalid.invalid.com'
      ];

      for (const email of invalidEmails) {
        const userData = {
          firstName: 'John',
          lastName: 'Doe',
          email: email,
          role: 2,
          password: 'SecurePassword123!'
        };

        const user = new User(userData);
        await expect(user.save()).rejects.toThrow();
      }
    });

    test('should normalize email to lowercase', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'John.Doe@EXAMPLE.COM',
        role: 2,
        password: 'SecurePassword123!'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.email).toBe('john.doe@example.com');
    });
  });

  describe('User Indexes', () => {
    test('should have unique index on email', async () => {
      const indexes = await User.collection.getIndexes();
      const emailIndex = Object.keys(indexes).find(key => 
        indexes[key].some(field => field[0] === 'email')
      );
      
      expect(emailIndex).toBeDefined();
    });
  });
});
