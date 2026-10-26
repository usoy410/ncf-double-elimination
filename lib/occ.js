/**
 * @file occ.js
 * @description Optimistic Concurrency Control (OCC) engine for tournament brackets.
 * Rejects conflicting edits from multiple devices using atomic MongoDB versioning.
 */

const { getDb } = require('./db.js');
const engine = require('../dist/engine.js');

/**
 * Retrieves the current state and version of a tournament bracket.
 * @param {string} title 'MLBB' or 'CODM'
 * @returns {Promise<object|null>} The bracket document with version and games
 */
async function getBracket(title) {
  const database = await getDb();
  return database.collection('brackets').findOne({ _id: title });
}

/**
 * Retrieves all tournament brackets with versions.
 * @returns {Promise<Record<string, object>>}
 */
async function getAllBrackets() {
  const database = await getDb();
  const docs = await database.collection('brackets').find({}).toArray();
  const out = {};
  for (const doc of docs) {
    out[doc._id] = {
      title: doc.title,
      names: doc.names,
      games: doc.games,
      version: doc.version || 1,
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedBy,
    };
  }
  return out;
}

/**
 * Records a game result for a match using Optimistic Concurrency Control.
 * If another device updated the bracket in the meantime, this edit is rejected.
 *
 * @param {object} params
 * @param {string} params.title 'MLBB' or 'CODM'
 * @param {number} params.expectedVersion Version the client held when initiating edit
 * @param {number} params.matchIndex 0-11
 * @param {number} params.gameIndex 0-4
 * @param {number} params.winnerSide 0 or 1
 * @param {string} [params.editor] Name or ID of the organizer
 * @returns {Promise<{ success: boolean, conflict?: boolean, code?: string, error?: string, bracket?: object, current?: object }>}
 */
async function recordGameWithOCC({ title, expectedVersion, matchIndex, gameIndex, winnerSide, editor = 'organizer' }) {
  const database = await getDb();
  const brackets = database.collection('brackets');
  const auditLogs = database.collection('audit_logs');

  // Fetch current bracket to validate game recording logic
  const current = await brackets.findOne({ _id: title });
  if (!current) {
    return { success: false, code: 'NOT_FOUND', error: `Tournament bracket '${title}' not found.` };
  }

  // Version check (Optimistic Concurrency Control)
  if (current.version !== expectedVersion) {
    return {
      success: false,
      conflict: true,
      code: 'CONFLICT',
      error: `Conflict rejected: This bracket was modified by another device (server is on v${current.version}, your device sent v${expectedVersion}). Your change was rejected to prevent overwriting.`,
      current: {
        names: current.names,
        games: current.games,
        version: current.version,
        updatedAt: current.updatedAt,
        updatedBy: current.updatedBy,
      },
    };
  }

  // Clone bracket data to run deterministic engine validation and downstream cascading
  const tournamentData = {
    names: [...current.names],
    games: current.games.map((match) => [...match]),
  };

  const validRecord = engine.record(tournamentData, matchIndex, gameIndex, winnerSide);
  if (!validRecord) {
    return {
      success: false,
      code: 'INVALID_MOVE',
      error: 'Invalid game score move. Match may not be ready or preceding games incomplete.',
    };
  }

  // Execute atomic conditional update in MongoDB with version check
  // This guarantees that even under millisecond race conditions, only one update succeeds!
  const updateResult = await brackets.findOneAndUpdate(
    {
      _id: title,
      version: expectedVersion, // Atomic check: must strictly match expected version
    },
    {
      $set: {
        games: tournamentData.games,
        updatedAt: new Date(),
        updatedBy: editor,
      },
      $inc: {
        version: 1, // Atomically bump version
      },
    },
    { returnDocument: 'after' }
  );

  // If updateResult is null, another concurrent request committed first between findOne and findOneAndUpdate
  if (!updateResult) {
    const fresh = await brackets.findOne({ _id: title });
    return {
      success: false,
      conflict: true,
      code: 'CONFLICT',
      error: `Conflict rejected: Another organizer updated this bracket simultaneously. Your change was rejected to preserve bracket integrity.`,
      current: {
        names: fresh.names,
        games: fresh.games,
        version: fresh.version,
        updatedAt: fresh.updatedAt,
        updatedBy: fresh.updatedBy,
      },
    };
  }

  // Log to audit trail
  await auditLogs.insertOne({
    tournamentId: title,
    matchIndex,
    gameIndex,
    winnerSide,
    version: updateResult.version,
    changedBy: editor,
    createdAt: new Date(),
  });

  return {
    success: true,
    version: updateResult.version,
    bracket: {
      names: updateResult.names,
      games: updateResult.games,
      version: updateResult.version,
      updatedAt: updateResult.updatedAt,
      updatedBy: updateResult.updatedBy,
    },
  };
}

/**
 * Updates team names with Optimistic Concurrency Control.
 * @param {object} params
 * @param {string} params.title 'MLBB' or 'CODM'
 * @param {number} params.expectedVersion
 * @param {string[]} params.names Array of 8 unique team names
 * @param {string} [params.editor]
 * @returns {Promise<{ success: boolean, conflict?: boolean, error?: string, bracket?: object, current?: object }>}
 */
async function updateTeamsWithOCC({ title, expectedVersion, names, editor = 'organizer' }) {
  if (!Array.isArray(names) || names.length !== 8 || names.some((n) => typeof n !== 'string' || !n.trim())) {
    return { success: false, error: 'Exactly 8 valid team names are required.' };
  }

  const database = await getDb();
  const brackets = database.collection('brackets');

  const updateResult = await brackets.findOneAndUpdate(
    {
      _id: title,
      version: expectedVersion,
    },
    {
      $set: {
        names: names.map((n) => n.trim()),
        updatedAt: new Date(),
        updatedBy: editor,
      },
      $inc: {
        version: 1,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updateResult) {
    const current = await brackets.findOne({ _id: title });
    return {
      success: false,
      conflict: true,
      code: 'CONFLICT',
      error: `Conflict rejected: Team names or bracket were modified on another device. Refreshed with latest data.`,
      current,
    };
  }

  return {
    success: true,
    version: updateResult.version,
    bracket: updateResult,
  };
}

/**
 * Resets a bracket to clean state with Optimistic Concurrency Control.
 * @param {object} params
 * @param {string} params.title 'MLBB' or 'CODM'
 * @param {number} params.expectedVersion
 * @param {string} [params.editor]
 */
async function resetBracketWithOCC({ title, expectedVersion, editor = 'organizer' }) {
  const database = await getDb();
  const brackets = database.collection('brackets');

  const updateResult = await brackets.findOneAndUpdate(
    {
      _id: title,
      version: expectedVersion,
    },
    {
      $set: {
        games: engine.blankGames(),
        updatedAt: new Date(),
        updatedBy: editor,
      },
      $inc: {
        version: 1,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updateResult) {
    const current = await brackets.findOne({ _id: title });
    return {
      success: false,
      conflict: true,
      code: 'CONFLICT',
      error: `Conflict rejected: Bracket was updated on another device before reset. Refreshed with latest state.`,
      current,
    };
  }

  return {
    success: true,
    version: updateResult.version,
    bracket: updateResult,
  };
}

module.exports = {
  getBracket,
  getAllBrackets,
  recordGameWithOCC,
  updateTeamsWithOCC,
  resetBracketWithOCC,
};
