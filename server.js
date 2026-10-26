/**
 * @file server.js
 * @description Tournament Web & API Server for NCF Intramurals 2026.
 * Connects to MongoDB Atlas, serves live bracket updates every 5 seconds,
 * enforces organizer authorization, and executes Optimistic Concurrency Control.
 */

require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const { getDb, closeDb } = require('./lib/db.js');
const { authenticateOrganizer, requireOrganizer } = require('./lib/auth.js');
const {
  getAllBrackets,
  getBracket,
  recordGameWithOCC,
  updateTeamsWithOCC,
  resetBracketWithOCC,
} = require('./lib/occ.js');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Serve static frontend assets from dist/
app.use(express.static(path.join(__dirname, 'dist')));

// Livestream links are public to read and organizer-only to publish.
const { getStreams, setStream } = require('./lib/streams');
app.get('/api/streams', async (req, res) => {
  try { res.json({ success: true, streams: await getStreams() }); }
  catch { res.status(500).json({ success: false, error: 'Unable to load livestreams.' }); }
});
app.post('/api/streams/:title', requireOrganizer, async (req, res) => {
  try {
    const title = req.params.title.toUpperCase();
    const { normalizeUrl } = require('./lib/streams');
    if (!['MLBB', 'CODM'].includes(title)) return res.status(400).json({ success: false, error: 'Choose MLBB or CODM.' });
    let url;
    try { url = normalizeUrl(req.body.url); }
    catch { return res.status(400).json({ success: false, error: 'Enter a valid HTTP or HTTPS livestream link.' }); }
    await setStream(title, url, req.organizer?.name || 'Organizer');
    res.json({ success: true, title, url });
  } catch { res.status(500).json({ success: false, error: 'Unable to save livestream. Please try again.' }); }
});

// -----------------------------------------------------------------------------
// PUBLIC SPECATOR ENDPOINTS (Polled every 5 seconds)
// -----------------------------------------------------------------------------

/**
 * Public endpoint to fetch all tournament brackets with versions.
 * Polled by spectator browsers every 5 seconds.
 */
app.get('/api/brackets', async (req, res) => {
  try {
    const data = await getAllBrackets();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      brackets: data,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Public endpoint to fetch a single tournament bracket.
 */
app.get('/api/brackets/:title', async (req, res) => {
  try {
    const { title } = req.params;
    const bracket = await getBracket(title.toUpperCase());
    if (!bracket) {
      return res.status(404).json({ success: false, error: 'Bracket not found' });
    }
    res.json({
      success: true,
      bracket: {
        title: bracket.title,
        names: bracket.names,
        games: bracket.games,
        version: bracket.version || 1,
        updatedAt: bracket.updatedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// ORGANIZER AUTHENTICATION ENDPOINTS
// -----------------------------------------------------------------------------

/**
 * Login endpoint for approved tournament organizers.
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { passcode, email } = req.body;
    const result = await authenticateOrganizer(passcode, email);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// ORGANIZER ACTION ENDPOINTS (PROTECTED WITH OPTIMISTIC CONCURRENCY CONTROL)
// -----------------------------------------------------------------------------

/**
 * Records a game result with OCC.
 * Rejects conflicting edits from other devices with HTTP 409.
 */
app.post('/api/bracket/record', requireOrganizer, async (req, res) => {
  try {
    const { title, expectedVersion, matchIndex, gameIndex, winnerSide } = req.body;
    const editor = req.organizer?.name || 'Tournament Marshall';

    const result = await recordGameWithOCC({
      title: title?.toUpperCase(),
      expectedVersion: Number(expectedVersion),
      matchIndex: Number(matchIndex),
      gameIndex: Number(gameIndex),
      winnerSide: winnerSide === null ? null : Number(winnerSide),
      editor,
    });

    if (result.conflict) {
      // 409 Conflict: another device updated this bracket first!
      return res.status(409).json(result);
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Updates team names with OCC.
 */
app.post('/api/bracket/teams', requireOrganizer, async (req, res) => {
  try {
    const { title, expectedVersion, names } = req.body;
    const editor = req.organizer?.name || 'Tournament Marshall';

    const result = await updateTeamsWithOCC({
      title: title?.toUpperCase(),
      expectedVersion: Number(expectedVersion),
      names,
      editor,
    });

    if (result.conflict) {
      return res.status(409).json(result);
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Resets a bracket with OCC.
 */
app.post('/api/bracket/reset', requireOrganizer, async (req, res) => {
  try {
    const { title, expectedVersion } = req.body;
    const editor = req.organizer?.name || 'Tournament Marshall';

    const result = await resetBracketWithOCC({
      title: title?.toUpperCase(),
      expectedVersion: Number(expectedVersion),
      editor,
    });

    if (result.conflict) {
      return res.status(409).json(result);
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Healthcheck route for cloud monitoring (Render, Railway, Fly.io).
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NCF Call of Legends Tournament Server' });
});

// Fallback to index.html for client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
  next();
});

// Start server if executed directly
if (require.main === module) {
  getDb()
    .then(() => {
      app.listen(PORT, () => {
        // Log clean startup banner
        process.stdout.write(`NCF Tournament Server running live at http://localhost:${PORT}\n`);
      });
    })
    .catch((err) => {
      process.stderr.write(`Failed to connect to MongoDB: ${err.message}\n`);
      process.exit(1);
    });

  process.on('SIGINT', async () => {
    await closeDb();
    process.exit(0);
  });
}

module.exports = app;
