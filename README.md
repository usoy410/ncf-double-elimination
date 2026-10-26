# NCF Intramurals 2026 — Call of Legends

A static tournament website for separate eight-team MLBB and CODM double-elimination brackets.

## Features

- Upper and lower brackets with automatic winner and loser advancement.
- Expandable best-of-three series: first to two game wins advances.
- Grand-final reset if the lower-bracket champion wins the first final.
- Editable team names and separate browser-local progress for each game title.
- Corrections clear affected downstream results.
- PDF export through the browser print dialog, including brackets and game results.

## Run

Open `dist/index.html`, or serve the site locally:

```sh
python3 -m http.server 8080 --directory dist
```

Visit http://localhost:8080. No build or package installation is required.

## Test

Node.js is required for the bracket engine tests:

```sh
node tests/engine.cjs
```

The tests cover 16,384 outcome paths through the first grand final, reset finals, elimination losses, game locking, and correction cascades. Browser visual testing has not been completed.

## Deploy

Deploy the contents of `dist/` to any static website host. Progress is stored in each browser's localStorage; it is not synchronized across devices or visitors.

## Tournament rules

All series are best of three. A team is eliminated after two series losses. The lower-bracket champion must win the grand final and reset final to become champion. The supplied competition guidelines have not been modified and still describe a different format.

The supplied tournament poster is included as the website artwork. Google Fonts are loaded when available, with system font fallbacks.
