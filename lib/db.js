/**
 * @file db.js
 * @description MongoDB connection manager and database initialization.
 * Handles Atlas connection pooling, schema seeding, and index creation.
 */

const { MongoClient } = require('mongodb');
const engine = require('../dist/engine.js');

let client = null;
let db = null;

/**
 * Initializes and caches the MongoDB database connection.
 * @returns {Promise<import('mongodb').Db>} The connected database instance.
 */
async function getDb() {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined in .env');
  }

  // Use connection pooling suitable for serverless and long-running Node apps
  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  await client.connect();
  const dbName = process.env.MONGODB_DB_NAME || 'ncf_tournament';
  db = client.db(dbName);

  // Initialize collections, indices, and default seed data
  await initCollections(db);

  return db;
}

/**
 * Creates unique indexes and seeds default bracket data if collections are empty.
 * @param {import('mongodb').Db} database
 */
async function initCollections(database) {
  const brackets = database.collection('brackets');
  const organizers = database.collection('organizers');
  const auditLogs = database.collection('audit_logs');

  // Ensure index on audit logs
  await auditLogs.createIndex({ tournamentId: 1, createdAt: -1 });

  // Seed default tournament brackets if they do not exist
  const count = await brackets.countDocuments();
  if (count === 0) {
    const defaults = engine.fresh();
    const seeds = [
      {
        _id: 'MLBB',
        title: 'Mobile Legends: Bang Bang',
        names: defaults.MLBB.names,
        games: defaults.MLBB.games,
        version: 1,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
      {
        _id: 'CODM',
        title: 'Call of Duty: Mobile',
        names: defaults.CODM.names,
        games: defaults.CODM.games,
        version: 1,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
    ];
    await brackets.insertMany(seeds);
  }

  // Seed default approved organizers if none exist
  const orgCount = await organizers.countDocuments();
  if (orgCount === 0) {
    const defaultOrganizers = [
      {
        _id: 'admin@ncf.edu.ph',
        name: 'NCF Head Marshall',
        passcode: process.env.ORGANIZER_PASSCODE || 'NCF2026',
        role: 'head_organizer',
        approved: true,
        createdAt: new Date(),
      },
      {
        _id: 'esports@ncf.edu.ph',
        name: 'NCF Esports Coordinator',
        passcode: process.env.ORGANIZER_PASSCODE || 'NCF2026',
        role: 'organizer',
        approved: true,
        createdAt: new Date(),
      },
    ];
    await organizers.insertMany(defaultOrganizers);
  }
}

/**
 * Closes the active MongoDB connection (useful for graceful shutdown and tests).
 */
async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = {
  getDb,
  closeDb,
};
