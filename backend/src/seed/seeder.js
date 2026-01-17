const fsp = require('fs').promises;
const path = require('path');
const User = require('../models/user');
const Entry = require('../models/entry');
const logger = require('../logger/logger');

/**
 * Upload data from JSON file to MongoDB Atlas
 * @param {Model} model - Mongoose model
 * @param {string} fileName - JSON file name (without extension)
 */
const AtlasUploader = async (model, fileName) => {
  try {
    const count = await model.countDocuments();
    if (count > 0) {
      logger.info(`${fileName} collection already has ${count} documents, skipping seed`);
      return;
    }

    const filePath = path.join(__dirname, `${fileName}.json`);
    const source = await fsp.readFile(filePath, 'utf8');
    const list = JSON.parse(source);

    if (model && model.insertMany && Array.isArray(list) && list.length > 0) {
      await model.insertMany(list, { ordered: false });
      logger.info(`Successfully seeded ${list.length} documents into ${fileName}`);
    }
  } catch (error) {
    logger.error(`Error seeding ${fileName}:`, { error: error.message });
    throw error;
  }
};

/**
 * Seed users with password hashing
 * @param {Array} userList - List of user objects
 */
const seedUsers = async (userList) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      logger.info(`Users collection already has ${count} documents, skipping seed`);
      return;
    }

    for (const userData of userList) {
      const user = new User(userData);
      await user.save();
    }
    logger.info(`Successfully seeded ${userList.length} users`);
  } catch (error) {
    logger.error('Error seeding users:', { error: error.message });
    throw error;
  }
};

/**
 * Main seeder function
 */
const runSeeder = async () => {
  try {
    logger.info('Starting database seeding...');

    // Seed entries
    await AtlasUploader(Entry, 'entries');

    // Seed users (with password hashing)
    const usersFilePath = path.join(__dirname, 'users.json');
    const usersSource = await fsp.readFile(usersFilePath, 'utf8');
    const userList = JSON.parse(usersSource);
    await seedUsers(userList);

    logger.info('Database seeding completed successfully!');
  } catch (error) {
    logger.error('Database seeding failed:', { error: error.message });
    process.exit(1);
  }
};

// Run seeder if called directly
if (require.main === module) {
  runSeeder();
}

module.exports = { runSeeder, AtlasUploader, seedUsers };
