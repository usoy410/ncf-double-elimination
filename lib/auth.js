/**
 * @file auth.js
 * @description Organizer authentication and authorization helpers.
 * Handles venue passcodes and session token verification for tournament marshals.
 */

const crypto = require('node:crypto');
const { getDb } = require('./db.js');

const SECRET = process.env.JWT_SECRET || 'ncf-legends-intramurals-2026-secret-key';

/**
 * Creates a signed bearer token for an approved organizer.
 * @param {object} organizer
 * @returns {string} Signed token
 */
function createOrganizerToken(organizer) {
  const payload = {
    sub: organizer._id,
    name: organizer.name,
    role: organizer.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(str).digest('base64url');
  return `${str}.${sig}`;
}

/**
 * Verifies and decodes a signed organizer token.
 * @param {string} token
 * @returns {object|null} Decoded payload or null if invalid/expired
 */
function verifyOrganizerToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [str, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(str).digest('base64url');
  if (sig !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authenticates an organizer using their passcode or email + passcode.
 * @param {string} passcode Tournament passcode
 * @param {string} [email] Optional organizer email
 * @returns {Promise<{ success: boolean, token?: string, organizer?: object, error?: string }>}
 */
async function authenticateOrganizer(passcode, email) {
  if (!passcode) {
    return { success: false, error: 'Passcode is required.' };
  }

  const database = await getDb();
  const organizers = database.collection('organizers');

  let query = { passcode: passcode.trim(), approved: true };
  if (email && email.trim()) {
    query._id = email.trim().toLowerCase();
  }

  // Also support the master venue passcode 'NCF2026'
  const masterCode = process.env.ORGANIZER_PASSCODE || 'NCF2026';
  if (passcode.trim() === masterCode && !email) {
    const masterOrganizer = {
      _id: 'marshall@ncf.edu.ph',
      name: 'NCF Tournament Marshall',
      role: 'head_organizer',
      approved: true,
    };
    const token = createOrganizerToken(masterOrganizer);
    return { success: true, token, organizer: masterOrganizer };
  }

  const organizer = await organizers.findOne(query);
  if (!organizer) {
    return { success: false, error: 'Invalid passcode or unapproved organizer account.' };
  }

  const token = createOrganizerToken(organizer);
  return {
    success: true,
    token,
    organizer: {
      id: organizer._id,
      name: organizer.name,
      role: organizer.role,
    },
  };
}

/**
 * Express middleware to verify that incoming requests are from approved organizers.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireOrganizer(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;

  // Also allow passing direct passcode in header/body for quick scripting
  const passcode = req.headers['x-organizer-passcode'] || req.body?.passcode;
  const masterCode = process.env.ORGANIZER_PASSCODE || 'NCF2026';
  if (passcode && passcode === masterCode) {
    req.organizer = { name: 'NCF Marshall (Passcode)' };
    return next();
  }

  const payload = verifyOrganizerToken(token);
  if (!payload) {
    return res.status(403).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized: Only approved tournament organizers can change match results.',
    });
  }

  req.organizer = payload;
  next();
}

module.exports = {
  createOrganizerToken,
  verifyOrganizerToken,
  authenticateOrganizer,
  requireOrganizer,
};
