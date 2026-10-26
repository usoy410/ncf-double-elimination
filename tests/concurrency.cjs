/**
 * @file tests/concurrency.cjs
 * @description Verifies Optimistic Concurrency Control (OCC) and conflict rejection
 * between multiple simulated devices editing tournament matches simultaneously.
 */

require('dotenv').config();
const assert = require('node:assert/strict');
const { getDb, closeDb } = require('../lib/db.js');
const { authenticateOrganizer } = require('../lib/auth.js');
const { recordGameWithOCC, getBracket } = require('../lib/occ.js');

async function runConcurrencyTests() {
  const db = await getDb();
  const brackets = db.collection('brackets');

  // Reset MLBB to a known test version
  const initialVersion = 100;
  await brackets.updateOne(
    { _id: 'MLBB' },
    {
      $set: {
        games: Array.from({ length: 12 }, (_, i) => Array(i === 11 ? 5 : 3).fill(null)),
        version: initialVersion,
        updatedAt: new Date(),
        updatedBy: 'test-runner',
      },
    }
  );

  // 1. Verify Organizer Authentication
  const authRes = await authenticateOrganizer('NCF2026');
  assert.equal(authRes.success, true, 'Organizer passcode NCF2026 should be authenticated');
  assert(authRes.token, 'Should return a signed organizer session token');

  // 2. Simulate Device A and Device B reading the bracket at the same time
  const deviceA_bracket = await getBracket('MLBB');
  const deviceB_bracket = await getBracket('MLBB');

  assert.equal(deviceA_bracket.version, initialVersion);
  assert.equal(deviceB_bracket.version, initialVersion);

  // 3. Device A records Game 1 winner in Match 0 (Quarterfinal 1)
  const deviceA_result = await recordGameWithOCC({
    title: 'MLBB',
    expectedVersion: deviceA_bracket.version, // version 100
    matchIndex: 0,
    gameIndex: 0,
    winnerSide: 0,
    editor: 'Device A (Marshall 1)',
  });

  assert.equal(deviceA_result.success, true, 'Device A update should succeed');
  assert.equal(deviceA_result.version, initialVersion + 1, 'Version should increment to 101');

  // 4. Device B attempts to record Game 2 winner in Match 0 using stale expectedVersion 100
  const deviceB_conflicted_result = await recordGameWithOCC({
    title: 'MLBB',
    expectedVersion: deviceB_bracket.version, // STILL version 100 (stale!)
    matchIndex: 0,
    gameIndex: 1,
    winnerSide: 1,
    editor: 'Device B (Marshall 2)',
  });

  // CRITICAL ASSERTION: The conflicting edit MUST be rejected!
  assert.equal(deviceB_conflicted_result.success, false, 'Conflicting edit must be rejected');
  assert.equal(deviceB_conflicted_result.conflict, true, 'Conflict flag must be true');
  assert.equal(deviceB_conflicted_result.code, 'CONFLICT', 'Code must be CONFLICT');
  assert(deviceB_conflicted_result.error.includes('Conflict rejected'), 'Error message must explain conflict');
  assert.equal(deviceB_conflicted_result.current.version, initialVersion + 1, 'Must return current server version');

  // 5. Verify database integrity was preserved (Device A's record was not overwritten)
  const currentInDb = await getBracket('MLBB');
  assert.equal(currentInDb.version, initialVersion + 1);
  assert.equal(currentInDb.games[0][0], 0, 'Device A winner (0) must remain');
  assert.equal(currentInDb.games[0][1], null, 'Device B conflicting game (1) must NOT be saved');

  // 6. Device B syncs latest state (gets version 101) and applies its move
  const deviceB_synced_result = await recordGameWithOCC({
    title: 'MLBB',
    expectedVersion: deviceB_conflicted_result.current.version, // version 101
    matchIndex: 0,
    gameIndex: 1,
    winnerSide: 1,
    editor: 'Device B (Marshall 2)',
  });

  assert.equal(deviceB_synced_result.success, true, 'Device B should succeed after syncing to latest version');
  assert.equal(deviceB_synced_result.version, initialVersion + 2, 'Version should now increment to 102');

  const finalInDb = await getBracket('MLBB');
  assert.equal(finalInDb.games[0][0], 0);
  assert.equal(finalInDb.games[0][1], 1);
  assert.equal(finalInDb.version, initialVersion + 2);

  // Clean up: reset bracket to blank games and version 1
  await brackets.updateOne(
    { _id: 'MLBB' },
    {
      $set: {
        games: Array.from({ length: 12 }, (_, i) => Array(i === 11 ? 5 : 3).fill(null)),
        version: 1,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
    }
  );

  await closeDb();
  console.log('PASS: Optimistic Concurrency Control (OCC) verified: conflicting edits rejected, database preserved, resync verified.');
}

runConcurrencyTests().catch((err) => {
  console.error('Concurrency test failed:', err);
  process.exit(1);
});
