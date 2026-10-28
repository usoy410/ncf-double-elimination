const assert = require('node:assert/strict');
const engine = require('../dist/engine');
for (const side of [0, 1]) {
  const t = engine.fresh().MLBB;
  assert.equal(engine.winByDefault(t, 4, side), false);
  assert.equal(engine.winByDefault(t, 0, side), true);
  assert.equal(t.defaultWins[0], side);
  assert.equal(engine.derive(t)[0].winner, side);
  engine.winByDefault(t, 1, 0);
  assert.equal(engine.derive(t)[4].ready, true);
  assert.equal(engine.record(t, 4, 0, 0), true);
  assert.equal(engine.derive(t)[6].ready, true);
  engine.winByDefault(t, 4, 0);
  engine.winByDefault(t, 0, 1-side);
  assert.equal(t.defaultWins[4], null);
  assert(t.games[4].every(value => value === null));
}
const t = engine.fresh().MLBB;
for (let i=0;i<6;i++) engine.winByDefault(t,i,0);
assert.equal(engine.winByDefault(t,11,1),true);
assert.equal(t.games[11].filter(v=>v===1).length,3);
assert.equal(t.defaultWins[11],1);
engine.record(t,11,0,1);
assert.equal(t.defaultWins[11],null);
console.log('PASS: default wins, both sides, BO3/BO5, next matches playable, loser routing, corrections clear downstream labels.');
