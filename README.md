# NCF Intramurals 2026 — Call of Legends

A static tournament website for separate eight-team MLBB and CODM Search and Destroy brackets, using single elimination with full placement matches.

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

## Features

- Automatic winner and loser routing with expandable series.
- First to two wins in BO3; first to three in the BO5 championship.
- Editable team names and separate browser-local progress for each title.
- Corrections clear affected downstream results.
- Responsive bracket connectors: solid for winners, dashed for losers.
- PDF export through the browser print dialog, including both brackets, final placements, and individual game/map results.

## Run

Open `dist/index.html`, or serve the site locally:

```sh
python3 -m http.server 8080 --directory dist
```

Visit http://localhost:8080. No build or package installation is required.

## Test

```sh
node tests/engine.cjs
```

Requires Node.js. Tests cover all 4,096 series outcome paths for both titles, placements, routing, BO3/BO5 clinching, corrections and migration. Browser visual testing is limited by the execution sandbox.

## Existing progress

The new format uses a separate localStorage key. Team names, quarterfinals, and championship semifinals are copied from the previous format if available. Incompatible later results start blank. The old saved data remains untouched, including the former BO3 upper final, which is not converted into a BO5 championship result.

## Deploy

Deploy `dist/` to any static website host. Progress stays in each browser's localStorage and is not synchronized across visitors or devices. The repository name retains its original name; the application now uses the 12-series placement format.

The supplied poster is included as artwork. Google Fonts load when available, with system font fallbacks. The uploaded guidelines PDF has not been edited.
