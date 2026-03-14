# 5³ Chess — Raumschach

A browser-based implementation of **Raumschach** (5×5×5 three-dimensional chess) built with vanilla JavaScript and Three.js. Play locally, challenge a friend online, or test your skills against the AI — all in a fully interactive 3D board.

**[Play now](https://robertpiazza.com/5-3-Chess/)**

---

## What is Raumschach?

Raumschach ("space chess") is a 3D chess variant invented by Ferdinand Maack in 1907. The game is played on a 5×5×5 board — five stacked 5×5 layers — with seven piece types, including the unicorn, unique to 3D chess.

### Pieces

| Piece | Symbol | Movement |
|-------|--------|----------|
| King | K | One step in any of the 26 3D directions |
| Queen | Q | Slides any distance in all 26 directions |
| Rook | R | Slides along one axis — X, Y, or Z (6 directions) |
| Bishop | B | Slides along face diagonals — 2 axes change together (12 directions) |
| Knight | N | 3D L-shape: 2 squares on one axis + 1 on another; jumps over pieces (up to 24 moves) |
| **Unicorn** | U | Slides along space diagonals — all 3 axes change together (8 directions) |
| Pawn | P | Advances one layer forward (+Z for White, −Z for Black); captures diagonally; promotes on the far layer |

White occupies layers A (Z=0) and B (Z=1); Black occupies layers E (Z=4) and D (Z=3). Layer C (Z=2) starts empty.

---

## Features

### Board & Views
- **Exploded layer view** — five boards stacked vertically with clear separation between layers
- **Cube view** — all 125 cells rendered as a translucent 3D cube for spatial reasoning
- Toggle between views at any time without losing game state

### Gameplay
- Full Raumschach rule enforcement including check, checkmate, and stalemate detection
- **Pawn promotion** — styled overlay to choose Queen, Rook, Bishop, Knight, or Unicorn
- **Undo** — single undo in local/AI play; requires opponent approval in network play
- **Last-move highlight** — amber indicator on the source and destination squares of the most recent move, shown in both views

### Threat Preview Rings
When a piece is selected, each legal-move indicator shows the material balance for that destination using **Static Exchange Evaluation (SEE)**:
- **Green ring** — safe square (no opponent can recapture, or exchange is favorable)
- **Split arc** — contested square: green arc = expected material gain, red arc = expected material loss, proportional to centipawn values
- Kings participate only as the final recapturer when the opposing side is exhausted

### Hint System
- 💡 **Hint button** — runs the AI engine and shows cyan (source) and orange (destination) disc indicators for the suggested move
- Press again to dismiss; cleared automatically after any move is made

### Captured Pieces
- Bottom-left bar shows all captured pieces as Unicode chess symbols, sorted most-valuable-first
- White's captures shown with black piece symbols (♟♜♞♝♛), Black's with white piece symbols (♙♖♘♗♕)
- Hidden until the first capture; fully restored on undo

### AI Opponent
- Minimax search with alpha-beta pruning at depth 3
- Material + positional evaluation
- Choose to play as White or Black; AI moves immediately if playing as Black

### Online Multiplayer
- Create or join a game with a 6-character room code
- Powered by Firebase Realtime Database — no account required
- Move sync, undo requests with accept/decline, and in-game status updates

---

## Running Locally

The project uses ES modules with an `importmap`, which requires an HTTP server (not `file://`).

```bash
cd "web"

# Python
python -m http.server 8080

# Node (npx)
npx serve .
```

Then open `http://localhost:8080` in your browser.

---

## File Structure

```
web/
├── index.html           # Entry point, Three.js importmap, overlay HTML
├── css/style.css        # Dark theme HUD, overlays, captured-pieces bar
└── js/
    ├── main.js          # Scene setup, game init, AI/network move application
    ├── board.js         # Board geometry (layers & cube), highlight/hint/last-move meshes
    ├── pieces.js        # Piece mesh factory (primitive shapes + accent colours)
    ├── gameState.js     # board[x][y][z], turn, captured pieces, undo history
    ├── moveValidator.js # getLegalMoves(), isInCheck(), SEE threat evaluation
    ├── inputHandler.js  # Raycaster click → select → move, promotion dialog
    ├── ui.js            # DOM HUD updates, captured-pieces display, overlays
    ├── ai.js            # Minimax with alpha-beta pruning
    └── network.js       # Firebase multiplayer (create/join room, send/receive moves)
```

### Board Coordinates
`board[x][y][z]` — `x` = column (0–4), `y` = row (0–4), `z` = layer (0–4, bottom to top).

In the exploded view, world Y position = `z × 2.2`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Rendering | [Three.js](https://threejs.org/) r165 (CDN via importmap) |
| Multiplayer | [Firebase Realtime Database](https://firebase.google.com/) v10 |
| Hosting | GitHub Pages |
| Build | None — vanilla JS ES modules, no bundler |

---


## License

MIT
