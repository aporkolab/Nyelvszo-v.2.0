/* global db, print */
// MongoDB bootstrap for the containerised database.
//
// The mongo image runs every /docker-entrypoint-initdb.d/*.js file with
// mongosh, once, on an empty data directory and after the root user has been
// created — so `db`, `print` and `process.env` are all available here, and the
// script must stay idempotent enough to survive a re-run against a volume that
// was only partially initialised.

const dbName = process.env.MONGO_INITDB_DATABASE || 'nyelvszo';
const appDb = db.getSiblingDB(dbName);

// ---------------------------------------------------------------------------
// Optional least-privilege application account.
//
// The previous version re-created the *root* credentials as a user inside the
// application database: it granted nothing the root account did not already
// have and left two different identities sharing one name. A separate account
// is now only created when one is explicitly configured, and the API keeps
// authenticating against `admin` until it is.
// ---------------------------------------------------------------------------
const appUser = process.env.MONGO_APP_USER;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (appUser && appPassword) {
  if (appDb.getUser(appUser)) {
    print(`User ${appUser} already exists in ${dbName}; leaving it untouched`);
  } else {
    appDb.createUser({
      user: appUser,
      pwd: appPassword,
      roles: [{ role: 'readWrite', db: dbName }],
    });
    print(`Created application user ${appUser} with readWrite on ${dbName}`);
  }
} else {
  print('MONGO_APP_USER/MONGO_APP_PASSWORD not set — skipping application user');
}

// ---------------------------------------------------------------------------
// Collections and indexes.
//
// These mirror src/models/entry.js and src/models/user.js exactly, names
// included. Mongoose builds the same indexes on first connect; if the options
// differed (the old text index was called `search_index` and pinned
// default_language) MongoDB would reject the second definition and the
// application would log an index build error on every boot.
// ---------------------------------------------------------------------------
appDb.createCollection('entries');
appDb.entries.createIndex(
  { hungarian: 'text', english: 'text' },
  { weights: { hungarian: 10, english: 5 }, name: 'entry_text_search' }
);
appDb.entries.createIndex({ isActive: 1, hungarian: 1 });
appDb.entries.createIndex({ isActive: 1, english: 1 });
appDb.entries.createIndex({ isActive: 1, fieldOfExpertise: 1, wordType: 1 });
appDb.entries.createIndex({ isActive: 1, createdAt: -1 });
appDb.entries.createIndex({ isActive: 1, views: -1 });

appDb.createCollection('users');
appDb.users.createIndex({ email: 1 }, { unique: true });
appDb.users.createIndex({ role: 1 });
appDb.users.createIndex({ isActive: 1 });
appDb.users.createIndex({ createdAt: -1 });

// No `events` collection: the CQRS event store it belonged to was removed.

print(`MongoDB initialisation completed for ${dbName}`);
print('Collections: entries, users');
