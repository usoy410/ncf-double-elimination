const { getDb } = require('./db');
const TITLES = ['MLBB', 'CODM'];
function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid HTTP or HTTPS livestream link.');
  if (!value.trim()) return '';
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a valid HTTP or HTTPS livestream link.');
  return url.href;
}
async function getStreams() {
  const db = await getDb();
  const docs = await db.collection('streams').find({ _id: { $in: TITLES } }).toArray();
  return Object.fromEntries(TITLES.map(title => [title, docs.find(doc => doc._id === title)?.url || '']));
}
async function setStream(title, value, editor) {
  if (!TITLES.includes(title)) throw new Error('Choose MLBB or CODM.');
  const url = normalizeUrl(value);
  const db = await getDb();
  await db.collection('streams').updateOne({ _id: title }, { $set: { url, updatedAt: new Date(), updatedBy: editor } }, { upsert: true });
  return url;
}
module.exports = { normalizeUrl, getStreams, setStream };
