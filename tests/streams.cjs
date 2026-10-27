const assert = require('node:assert/strict');
const { normalizeUrl } = require('../lib/streams');
for (const invalid of ['javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.com', null, 'not-a-url']) assert.throws(() => normalizeUrl(invalid));
assert.equal(normalizeUrl('  https://example.com/live  '), 'https://example.com/live');
assert.equal(normalizeUrl(''), '');
const docs = new Map();
require('../lib/db').getDb = async () => ({ collection(name) {
  assert.equal(name, 'streams');
  return {
    find: () => ({ toArray: async () => [...docs.values()] }),
    updateOne: async (filter, update, options) => {
      assert.equal(options.upsert, true);
      docs.set(filter._id, { _id: filter._id, ...update.$set });
    },
  };
}});
// Reload the service so the HTTP routes exercise the isolated database adapter.
delete require.cache[require.resolve('../lib/streams')];
const app = require('../server');
const { createOrganizerToken } = require('../lib/auth');
const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = createOrganizerToken({ _id: 'test', name: 'Test organizer', role: 'organizer' });
    const post = (title, url, authorized=true) => fetch(`${base}/api/streams/${title}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ url }) });
    assert.equal((await post('MLBB','https://example.com',false)).status,403);
    assert.equal((await post('MLBB','javascript:alert(1)')).status,400);
    assert.equal((await post('OTHER','https://example.com')).status,400);
    assert.equal((await post('MLBB','https://example.com/mlbb')).status,200);
    assert.equal((await post('CODM','https://example.com/codm')).status,200);
    let result = await (await fetch(`${base}/api/streams`)).json();
    assert.equal(result.streams.MLBB,'https://example.com/mlbb');
    assert.equal(result.streams.CODM,'https://example.com/codm');
    assert.equal((await post('MLBB','')).status,200);
    result = await (await fetch(`${base}/api/streams`)).json();
    assert.equal(result.streams.MLBB,'');
    assert.equal(result.streams.CODM,'https://example.com/codm');
    console.log('PASS: livestream HTTP authorization, URL validation, independent game links, public reads, and removal (isolated database adapter).');
  } catch (error) { console.error(error); process.exitCode=1; }
  finally { server.close(); }
});
