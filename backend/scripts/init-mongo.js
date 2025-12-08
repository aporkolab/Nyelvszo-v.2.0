



db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'nyelvszo');


db.createUser({
  user: process.env.MONGO_INITDB_ROOT_USERNAME,
  pwd: process.env.MONGO_INITDB_ROOT_PASSWORD,
  roles: [
    {
      role: 'readWrite',
      db: process.env.MONGO_INITDB_DATABASE || 'nyelvszo'
    }
  ]
});


db.createCollection('entries');
db.entries.createIndex(
  { hungarian: 'text', english: 'text' },
  {
    weights: { hungarian: 10, english: 5 },
    name: 'search_index',
    default_language: 'none'
  }
);
db.entries.createIndex({ fieldOfExpertise: 1, wordType: 1 });
db.entries.createIndex({ createdAt: -1 });
db.entries.createIndex({ views: -1 });
db.entries.createIndex({ isActive: 1, createdAt: -1 });


db.createCollection('users');
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ isActive: 1 });


db.createCollection('events');
db.events.createIndex({ aggregateId: 1, version: 1 }, { unique: true });
db.events.createIndex({ aggregateType: 1, createdAt: -1 });
db.events.createIndex({ eventType: 1 });
db.events.createIndex({ createdAt: -1 });

print('MongoDB initialization completed successfully');
print('Collections created: entries, users, events');
print('Indexes created for optimal query performance');
