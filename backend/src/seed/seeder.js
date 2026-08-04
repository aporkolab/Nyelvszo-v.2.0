require('dotenv').config();

const fsp = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');

const User = require('../models/user');
const Entry = require('../models/entry');
const { ROLES } = require('../constants/roles');
const logger = require('../logger/logger');

/**
 * Parse the bundled entry export.
 *
 * The file is JSON Lines — one document per line, no enclosing array. The
 * previous seeder called `JSON.parse` on the whole file, which throws on the
 * second line, so seeding a fresh database never actually worked. Both shapes
 * are accepted here so a future export in either format loads.
 *
 * @param {string} source - Raw file contents.
 * @returns {object[]} Parsed documents.
 */
const parseEntryExport = (source) => {
  const trimmed = source.trim();

  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`entries.json line ${index + 1} is not valid JSON: ${error.message}`);
      }
    });
};

/**
 * Load the dictionary entries from the bundled export.
 *
 * Idempotent: if the collection already holds documents the seed is skipped, so
 * running this against a live database cannot duplicate the dictionary.
 *
 * @returns {Promise<number>} Number of documents inserted.
 */
const seedEntries = async () => {
  const existing = await Entry.countDocuments();
  if (existing > 0) {
    logger.info(`Entries collection already holds ${existing} documents — skipping`);
    return 0;
  }

  const filePath = path.join(__dirname, 'entries.json');
  const list = parseEntryExport(await fsp.readFile(filePath, 'utf8'));

  if (list.length === 0) {
    logger.warn('entries.json contained no documents');
    return 0;
  }

  // `ordered: false` so one malformed record does not abort the rest.
  await Entry.insertMany(list, { ordered: false });
  logger.info(`Seeded ${list.length} dictionary entries`);
  return list.length;
};

/**
 * Create the initial administrator from the environment.
 *
 * The credentials are deliberately NOT stored in the repository. A seed file
 * with a fixed administrator password was committed here previously, which
 * meant anyone who read the public repository held the credentials for every
 * installation that ran this script.
 *
 * @returns {Promise<boolean>} Whether an account was created.
 */
const seedAdmin = async () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const firstName = process.env.SEED_ADMIN_FIRST_NAME || 'Admin';
  const lastName = process.env.SEED_ADMIN_LAST_NAME || 'User';

  if (!email || !password) {
    logger.info('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping administrator seed');
    return false;
  }

  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  }

  const existing = await User.findOne({ email });
  if (existing) {
    logger.info('Administrator account already exists — skipping');
    return false;
  }

  // new + save so the pre('save') bcrypt hook hashes the password.
  const admin = new User({
    firstName,
    lastName,
    email,
    password,
    role: ROLES.ADMIN,
    isActive: true,
  });

  await admin.save();
  logger.info('Created the initial administrator account', { email });
  return true;
};

/**
 * Connect, seed, disconnect.
 */
const runSeeder = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI must be set to run the seeder');
  }

  await mongoose.connect(mongoUri);
  logger.info('Connected — starting seed');

  try {
    await seedEntries();
    await seedAdmin();
    logger.info('Seeding complete');
  } finally {
    await mongoose.connection.close();
  }
};

if (require.main === module) {
  runSeeder().catch((error) => {
    logger.error('Seeding failed', { error: error.message });
    // eslint-disable-next-line no-console
    console.error(`Seeding failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runSeeder, seedEntries, seedAdmin, parseEntryExport };
