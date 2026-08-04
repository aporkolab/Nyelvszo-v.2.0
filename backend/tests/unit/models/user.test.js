const bcrypt = require('bcryptjs');
const User = require('../../../src/models/user');

describe('User Model', () => {
  describe('User Creation', () => {
    test('should create a valid user', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 2,
        password: 'SecurePassword123!',
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
        password: 'SecurePassword123!',
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
        password: 'SecurePassword123!',
      };

      const user1 = new User(userData);
      await user1.save();

      const user2 = new User({
        ...userData,
        firstName: 'Jane',
      });

      await expect(user2.save()).rejects.toThrow();
    });

    test('should fail to create user with invalid role', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 5, // Invalid role
        password: 'SecurePassword123!',
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
        password: plainPassword,
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.password).not.toBe(plainPassword);
      expect(savedUser.password).toMatch(/^\$2[ayb]\$.{56}$/); // bcrypt hash pattern
    });

    test('should hash with a cost factor of at least 12', async () => {
      const user = await createTestUser({ email: 'cost@example.com' });
      const withHash = await User.findById(user._id).select('+password');

      // The cost is the second `$`-delimited segment. Anything below 12 is the
      // pre-refactor default and must not creep back in.
      const [, , cost] = withHash.password.split('$');

      expect(Number(cost)).toBeGreaterThanOrEqual(12);
    });

    test('should not re-hash the stored hash when other fields change', async () => {
      const user = await createTestUser({ email: 'stable@example.com' });
      const before = (await User.findById(user._id).select('+password')).password;

      user.firstName = 'Renamed';
      await user.save();

      const after = (await User.findById(user._id).select('+password')).password;

      expect(after).toBe(before);
      expect(await bcrypt.compare('TestPassword123!', after)).toBe(true);
    });

    test('should not return the password by default', async () => {
      await createTestUser({ email: 'hidden@example.com' });

      const found = await User.findOne({ email: 'hidden@example.com' });

      expect(found.password).toBeUndefined();
      expect(found.toJSON().password).toBeUndefined();
      expect(found.toObject().password).toBeUndefined();
    });
  });

  describe('Password hashing on query-based updates', () => {
    // pre('save') does not run for findOneAndUpdate/updateOne. Without the
    // dedicated hooks a password sent through those helpers would be stored in
    // cleartext and would then never match at login.
    //
    // Both update shapes have to be covered. Mongoose's own timestamps
    // middleware registers before ours and injects `$set: { updatedAt }`, so an
    // update written as `{ password }` reaches the hook as
    // `{ password, $set: { updatedAt } }` — a hook that looks only inside `$set`
    // finds nothing and writes the plaintext straight through.
    const BCRYPT_HASH = /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/;

    let user;

    beforeEach(async () => {
      user = await createTestUser({ email: 'updatable@example.com' });
    });

    test('should hash a password set through findOneAndUpdate with $set', async () => {
      await User.findOneAndUpdate({ _id: user._id }, { $set: { password: 'RotatedPass123!' } });

      const stored = await User.findById(user._id).select('+password');

      expect(stored.password).not.toBe('RotatedPass123!');
      expect(stored.password).toMatch(BCRYPT_HASH);
      expect(await stored.verifyPassword('RotatedPass123!')).toBe(true);
    });

    test('should hash a top-level password set through findOneAndUpdate', async () => {
      await User.findOneAndUpdate({ _id: user._id }, { password: 'TopLevelPass123!' });

      const stored = await User.findById(user._id).select('+password');

      expect(stored.password).not.toBe('TopLevelPass123!');
      expect(stored.password).toMatch(BCRYPT_HASH);
      expect(await stored.verifyPassword('TopLevelPass123!')).toBe(true);
    });

    test('should hash a password set through updateOne with $set', async () => {
      await User.updateOne({ _id: user._id }, { $set: { password: 'AnotherPass123!' } });

      const stored = await User.findById(user._id).select('+password');

      expect(stored.password).not.toBe('AnotherPass123!');
      expect(stored.password).toMatch(BCRYPT_HASH);
      expect(await stored.verifyPassword('AnotherPass123!')).toBe(true);
    });

    test('should hash a top-level password set through updateOne', async () => {
      await User.updateOne({ _id: user._id }, { password: 'TopLevelOne123!' });

      const stored = await User.findById(user._id).select('+password');

      expect(stored.password).not.toBe('TopLevelOne123!');
      expect(stored.password).toMatch(BCRYPT_HASH);
      expect(await stored.verifyPassword('TopLevelOne123!')).toBe(true);
    });

    test('should hash a password set through updateMany with $set', async () => {
      await User.updateMany({ _id: user._id }, { $set: { password: 'BulkPass123!x' } });

      const stored = await User.findById(user._id).select('+password');

      expect(stored.password).not.toBe('BulkPass123!x');
      expect(stored.password).toMatch(BCRYPT_HASH);
      expect(await stored.verifyPassword('BulkPass123!x')).toBe(true);
    });

    test('should hash a top-level password set through updateMany', async () => {
      await User.updateMany({ _id: user._id }, { password: 'TopLevelMany12!' });

      const stored = await User.findById(user._id).select('+password');

      expect(stored.password).not.toBe('TopLevelMany12!');
      expect(stored.password).toMatch(BCRYPT_HASH);
      expect(await stored.verifyPassword('TopLevelMany12!')).toBe(true);
    });

    test('should hash exactly once, leaving the old password unusable', async () => {
      await User.findOneAndUpdate({ _id: user._id }, { password: 'SingleHash123!' });

      const stored = await User.findById(user._id).select('+password');

      // A double hash would still match BCRYPT_HASH but would never verify.
      expect(await stored.verifyPassword('SingleHash123!')).toBe(true);
      expect(await stored.verifyPassword('TestPassword123!')).toBe(false);
      expect(await bcrypt.compare('SingleHash123!', stored.password)).toBe(true);
    });

    test('should leave the hash alone when the update carries no password', async () => {
      const before = (await User.findById(user._id).select('+password')).password;

      await User.updateOne({ _id: user._id }, { $set: { firstName: 'Untouched' } });
      await User.findOneAndUpdate({ _id: user._id }, { lastName: 'Untouched' });

      const after = (await User.findById(user._id).select('+password')).password;

      expect(after).toBe(before);
      expect(await bcrypt.compare('TestPassword123!', after)).toBe(true);
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
        password: 'SecurePassword123!',
      });
    });

    test('should verify correct password', async () => {
      const isValid = await user.verifyPassword('SecurePassword123!');
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const isValid = await user.verifyPassword('WrongPassword123!');
      expect(isValid).toBe(false);
    });

    test('should refuse to verify when the hash was not loaded', async () => {
      // A document fetched without `.select('+password')` has nothing to compare
      // against; returning true here would authenticate everyone.
      const withoutHash = await User.findById(user._id);

      expect(withoutHash.password).toBeUndefined();
      await expect(withoutHash.verifyPassword('SecurePassword123!')).resolves.toBe(false);
    });

    test('should refuse to verify a non-string candidate', async () => {
      await expect(user.verifyPassword(undefined)).resolves.toBe(false);
      await expect(user.verifyPassword({ $ne: null })).resolves.toBe(false);
      await expect(user.verifyPassword(12345)).resolves.toBe(false);
    });

    test('should expose comparePassword as an alias of verifyPassword', async () => {
      expect(user.comparePassword).toBe(user.verifyPassword);
      await expect(user.comparePassword('SecurePassword123!')).resolves.toBe(true);
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
        isActive: true,
      });

      await createTestUser({
        firstName: 'Inactive',
        lastName: 'User',
        email: 'inactive@example.com',
        role: 2,
        isActive: false,
      });

      await createTestUser({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        role: 3,
        isActive: true,
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
      activeUsers.forEach((user) => {
        expect(user.isActive).toBe(true);
      });
    });

    test('should count active administrators', async () => {
      await expect(User.countActiveAdmins()).resolves.toBe(1);
    });

    test('should exclude the named account when counting administrators', async () => {
      // This is the guard behind "at least one active administrator must
      // remain": the account being edited is excluded, so the count answers
      // "who would be left?".
      //
      // The exclusion needs `mongoose.trusted()` in the model because
      // `sanitizeFilter` is enabled globally: without it the server-built `$ne`
      // is rewritten into `{ $eq: { $ne: … } }`, which throws a CastError rather
      // than counting, so this whole guard collapses into a 400.
      const admin = await User.findOne({ email: 'admin@example.com' });

      await expect(User.countActiveAdmins(admin._id)).resolves.toBe(0);

      const second = await createTestUser({ email: 'admin2@example.com', role: 3 });

      await expect(User.countActiveAdmins(admin._id)).resolves.toBe(1);

      second.isActive = false;
      await second.save();

      await expect(User.countActiveAdmins(admin._id)).resolves.toBe(0);
    });
  });

  describe('User Validation', () => {
    test('should validate firstName length', async () => {
      const userData = {
        firstName: 'a', // Too short
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 2,
        password: 'SecurePassword123!',
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
        password: 'SecurePassword123!',
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
        'invalid.invalid.com',
      ];

      for (const email of invalidEmails) {
        const userData = {
          firstName: 'John',
          lastName: 'Doe',
          email: email,
          role: 2,
          password: 'SecurePassword123!',
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
        password: 'SecurePassword123!',
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.email).toBe('john.doe@example.com');
    });
  });

  describe('User Indexes', () => {
    test('should have exactly one unique index on email', async () => {
      const indexes = await User.collection.indexes();
      const emailIndexes = indexes.filter((index) => index.key.email !== undefined);

      // Exactly one: the field-level `index: true` option used to duplicate the
      // schema-level declaration, which made Mongoose warn on every boot.
      expect(emailIndexes).toHaveLength(1);
      expect(emailIndexes[0].unique).toBe(true);
    });

    test('should index the fields the admin listing filters on', async () => {
      const indexes = await User.collection.indexes();
      const keys = indexes.map((index) => Object.keys(index.key).join(','));

      expect(keys).toContain('role');
      expect(keys).toContain('isActive');
      expect(keys).toContain('createdAt');
    });
  });
});
