# NCF Intramurals 2026 — Call of Legends

A live tournament web application for separate eight-team MLBB and CODM Search and Destroy brackets, using single elimination with full placement matches. Built with real-time optimistic concurrency control, automatic 5-second match synchronization, and role-based organizer access.

## Tournament format

Each title has exactly 12 series:

| Matches | Stage | Format |
| --- | --- | --- |
| M1–M4 | Quarterfinals | BO3 |
| M5–M6 | Championship semifinals (quarterfinal winners) | BO3 |
| M7–M8 | Placement semifinals (quarterfinal losers) | BO3 |
| M9 | Third place (losers of M5 and M6) | BO3 |
| M10 | Fifth place (winners of M7 and M8) | BO3 |
| M11 | Seventh place (losers of M7 and M8) | BO3 |
| M12 | Championship (winners of M5 and M6) | BO5 |

Quarterfinal losers compete only for 5th–8th place. There is no return to the championship and no reset final. Each team plays three series, and results determine all eight placements. CODM series wins represent complete Search and Destroy maps, not individual rounds within a map.

## Live Synchronization & Multi-Device Concurrency

- **5-Second Live Sync Heartbeat**: Spectator devices poll `/api/brackets` every 5 seconds, displaying live score updates, match completion progress, and placement standings.
- **Optimistic Concurrency Control (OCC)**: Conflicting edits from two devices (e.g., tournament marshals simultaneously editing on different phones/tablets) are **strictly rejected with HTTP 409 Conflict** rather than silently overwriting each other. The rejected device alerts the organizer and automatically refreshes with the latest server state.
- **Role-Based Access Control**:
  - **Spectators**: Public read access to view brackets, matches, and PDF exports. Match dialogs open in view-only mode.
  - **Approved Organizers**: Can log in using the venue passcode (`NCF2026`) or email credentials to record game outcomes, edit team names, or reset brackets.
- **Audit Logging**: Every score change is recorded in an audit trail with timestamps, organizer metadata, match index, and version numbers.

## Features

- Automatic winner and loser routing with expandable series.
- First to two wins in BO3; first to three in the BO5 championship.
- Editable team names and synchronized cloud database via MongoDB Atlas.
- Corrections clear affected downstream results deterministically.
- Responsive bracket connectors: solid for winners, dashed for losers.
- Live sync status indicator (`● LIVE · 5s`).
- PDF export through the browser print dialog, including both brackets, final placements, and individual game/map results.

## Quick Start

### 1. Configure Environment

Ensure `.env` contains your database configuration:

```ini
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority
ORGANIZER_PASSCODE=NCF2026
PORT=8080
```

### 2. Install Dependencies & Run

```sh
npm install
npm start
```

Visit [http://localhost:8080](http://localhost:8080).

## Testing

Run the comprehensive test suite:

```sh
npm test
```

This executes:
1. `tests/engine.cjs`: Validates all 4,096 series outcome paths, clinching, routing, and placements.
2. `tests/render.cjs`: Verifies DOM rendering, match dialogs, and PDF generation without a browser.
3. `tests/concurrency.cjs`: Simulates concurrent devices modifying the same match and asserts that race-condition edits are rejected via OCC.

## Live Web Deployment

### Deploying to Render.com (Recommended)

1. Push your repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** -> **Web Service**.
3. Connect your repository `ncf-double-elimination`.
4. Configure:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. In **Environment Variables**, add:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `ORGANIZER_PASSCODE`: e.g., `NCF2026`.
6. Click **Deploy**. Your site will be live with free automatic SSL/HTTPS!

## Livestreams

Spectators can choose **Watch MLBB** or **Watch CODM** in the livestream section above the brackets. Links open in a new tab. Games without a published link show “Link not posted yet”; posting a link does not claim that a broadcast is currently live.

After logging in, organizers can select a game, paste an HTTP(S) broadcast link, and choose **Save livestream**. Saving an empty link removes it. Links are stored in MongoDB's `streams` collection independently of match scores and refresh for viewers every five seconds. Only organizers can publish or remove links; URLs with credentials or non-web protocols are rejected. Simultaneous saves for the same game use the last saved link.

Final placements sit outside the horizontally scrolling bracket and use four columns on desktop, two on tablets, and one on phones. Team names wrap within each placement card.

`node tests/streams.cjs` exercises the livestream HTTP routes with an isolated database adapter; it does not replace the MongoDB integration suite.

## Wins by default

Organizers can open a ready match and award either team a **win by default**, with confirmation. This awards the entire series (2–0 for BO3 or 3–0 for BO5), advances the winner and routes the loser normally. Later matches remain playable. Bracket cards and match details label the result **WIN BY DEFAULT**. Recording a correction removes that label; changing participants clears affected downstream scores and labels. Awards use the same atomic version checks and audit trail as regular results.

## Placement points

Under section VII of the NCF Intramurals E-Games Competition Guidelines, 1st–8th place receive **25, 15, 10, 7, 4, 2, 1, and 0.5 points**, respectively. The same allocation applies separately to MLBB and CODM. Final placement cards and PDF exports display these points, marking undecided placements as pending. Points do not change bracket advancement or award extra points for individual games or rounds.
