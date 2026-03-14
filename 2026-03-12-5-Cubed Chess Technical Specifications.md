# 5³ Chess (Raumschach) Technical Blog

## Overview

5³ Chess is a browser-based 3-D chess game played on a 5×5×5 board (Raumschach variant). It runs entirely client-side using Three.js for 3-D rendering and Firebase Realtime Database for optional two-player online play. No server-side compute is required beyond static file hosting.

**[Play now](https://robertpiazza.com/5-3-Chess/)**

---

## Technology Stack

| Layer | Technology |
|---|---|
| Rendering | Three.js 0.165 (ESM, CDN) |
| Multiplayer sync | Firebase Realtime Database 10.12.2 |
| Language | Vanilla JavaScript (ES Modules) |
| Styling | Plain CSS |
| Build tooling | None — direct browser execution via importmap |

---

## Board & Coordinate System

The board is a 5×5×5 grid. Each cell is addressed as `(x, y, z)` where all axes range from 0–4.

- **x**: left–right (file)
- **y**: front–back (rank)
- **z**: bottom–top (layer), with White starting at z=0–1 and Black at z=3–4

### View Modes

Two view modes are supported and can be toggled at any time during play via the hamburger menu:

**Layers view** (default): Five horizontal 5×5 boards stacked vertically, separated by `LAYER_GAP = 1.65` world units. Each square is a flat `BoxGeometry` tile.

**Cube view**: All 125 cells rendered as a single 5×5×5 transparent cube lattice with wireframe edges. Pieces appear floating inside the cube at their correct 3-D positions.

Both views share the same coordinate system and move validation logic.

---

## Piece Types

| Piece | Symbol | Movement |
|---|---|---|
| Rook | R | Slides any distance along one axis — X, Y, or Z (6 directions) |
| Bishop | B | Slides along face diagonals — exactly 2 axes change simultaneously (12 directions) |
| Unicorn | U | Slides along space diagonals — all 3 axes change simultaneously (8 directions) |
| Queen | Q | Combines Rook + Bishop + Unicorn — all 26 sliding directions |
| King | K | One step in any of the 26 directions; must stay out of check |
| Knight | N | L-shape in 3-D: 2 squares on one axis + 1 on another; jumps over pieces (up to 24 targets) |
| Pawn | P | Advances one layer (White: +z, Black: −z); captures diagonally forward; promotes to Queen on far layer |

---

Raumschach adds the unicorn piece not found in standard chess.

## 3-D Piece Models

Pieces are loaded as GLB models from the `/web/models/` directory. Each piece type has a corresponding `.glb` file (`king.glb`, `queen.glb`, etc.).

### Proportional Height System

Piece heights are based on real-world standard chess piece proportions, anchored so that the King reaches `TARGET_HEIGHT = 1.50` world units.

| Piece | Real-world height (cm) | In-game height (world units) |
|---|---|---|
| King | 9.5 | 1.50 |
| Queen | 8.5 | 1.342 |
| Bishop | 7.0 | 1.105 |
| Knight | 6.0 | 0.947 |
| Unicorn | 6.0 | 0.947 |
| Rook | 5.5 | 0.868 |
| Pawn | 5.0 | 0.789 |

The Unicorn shares the Knight's body height (excluding the horn). The horn geometry is scaled by the same `knight/9.5` ratio relative to the king so that the overall visual proportions remain consistent.

Each model is normalized at load time by computing its bounding box, scaling uniformly so the tallest axis reaches the target height, then repositioning so the base sits at y=0.

In cube view, all pieces are scaled by an additional `0.83×` factor (`board.pieceScale`) to fit comfortably within the lattice cells.

---

## Game Modes

### Local Play
Two players share the same device and take turns clicking. No network connection required.

### vs AI
One player chooses a color (White, Black, or Random). The AI controls the other color. After the human makes a move, the AI responds automatically.

### Online Multiplayer (Create / Join)
One player creates a game and receives a 6-character room code. The other player enters the code to join. All moves are synchronized in real time via Firebase Realtime Database at `games/{code}/moves`.

---

## AI Opponent

The AI uses **minimax search with alpha-beta pruning**.

### Algorithm

```
findBestMove(board, aiColor, depth = 3)
  → iterates all legal moves for aiColor
  → applies each move to a cloned board
  → calls minimax(depth - 1, opponentTurn, α, β)
  → returns the move with the highest score
```

Terminal conditions:
- No legal moves + in check → checkmate (score ±999999, scaled by depth to prefer faster mates)
- No legal moves + not in check → stalemate (score 0)
- depth == 0 → static material evaluation

### Material Values

| Piece | Value |
|---|---|
| Pawn | 100 |
| Knight | 350 |
| Bishop | 350 |
| Unicorn | 475 |
| Rook | 525 |
| Queen | 1000 |
| King | 20000 |

Evaluation is purely material (no positional tables). Positive scores favor the AI; negative scores favor the opponent.

Pawn promotion to Queen is simulated inside the search tree.

---

## Threat Preview Rings

When a player selects a piece, every legal-move indicator shows a color-coded ring encoding the expected material outcome of moving to that square. The calculation is a **Static Exchange Evaluation (SEE)** — the same technique chess engines use to evaluate captures without doing a full tree search.

### Flow

`InputHandler._selectPiece()` calls `getSquareThreat` for every legal destination and assembles a `threatMap` before passing it to the board renderer:

```js
const threatMap = new Map();
for (const move of moves) {
  threatMap.set(
    `${move.x},${move.y},${move.z}`,
    getSquareThreat(gs.board, move, pos, gs.currentTurn)
  );
}
this.board.showHighlights(pos, moves, threatMap);
```

`getSquareThreat` in `moveValidator.js` returns `{ greenScore, redScore }`:
- `greenScore` — material the moving side expects to gain through the full recapture sequence
- `redScore` — material the moving side expects to lose

### SEE Algorithm

The simulation plays out the complete exchange sequence on the target square, each side always recapturing with its cheapest available piece.

**Two shadow boards**

The function operates on two derived board states, not the live board:

- `base` — the moving piece relocated to the target, source cleared. Used to determine which opponent pieces can now reach the target.
- `defSim` — identical to `base`, but the piece at the target is replaced with a dummy of the *opponent's* color. This lets own sliding pieces "see through" to the target when computing defenders — without this, a rook behind the moving piece on the same rank would not appear to cover the target square.

```js
const base = boardArr.map(p => p.map(r => [...r]));
base[tx][ty][tz] = base[selectedPos.x][selectedPos.y][selectedPos.z];
base[selectedPos.x][selectedPos.y][selectedPos.z] = null;

const defSim = base.map(p => p.map(r => [...r]));
defSim[tx][ty][tz] = { ...base[tx][ty][tz], color: opponentColor };
```

**Collecting participants**

Every non-target piece is tested via `pseudoLegalMoves()` to determine whether it can reach `(tx, ty, tz)`:

- Opponent pieces → `attackerVals[]` (the pieces that can recapture the mover)
- Own pieces → `defenderVals[]` (own pieces that can recapture after the opponent takes)

Both arrays are sorted cheapest-first so each side always uses its least-valuable recapturer.

**King handling**

Kings are tracked separately in `attackerKing` / `defenderKing` boolean flags rather than being inserted into the sorted arrays. A king may only participate as the **very last** recapturer — moving a king onto a square still covered by an enemy piece would be walking into check, which is illegal. The simulation enforces this before allowing king participation:

```js
} else if (attackerKing) {
  // King may only capture once the defender side is completely exhausted.
  if (di < defenderVals.length || defenderKing) break;
  redScore += onSquareValue;
  onSquareValue = PIECE_VALUES[PIECE.KING];
  attackerKing = false;
}
```

**Simulation loop**

```
onSquareValue = value of the moving piece (what the opponent could gain by recapturing)
greenScore   += initial capture gain (if landing on an opponent piece)

loop:
  attacker's turn → redScore   += onSquareValue; onSquareValue = cheapest attacker value
  defender's turn → greenScore += onSquareValue; onSquareValue = cheapest defender value
  … until one side runs out of pieces (or king legality check halts early)
```

**Example** — White bishop moves to a square defended by a Black knight (350) and Black queen (1000), with a White pawn (100) behind that can recapture:

| Step | Event | greenScore | redScore |
|------|-------|-----------|---------|
| initial move | White bishop captures (empty) | 0 | 0 |
| attacker 1 | Black knight captures bishop | 0 | 350 |
| defender 1 | White pawn captures knight | 350 | 350 |
| attacker 2 | Black queen captures pawn | 350 | 450 |
| defender — none | White has no more pieces | stop | |

Result: `greenScore = 350, redScore = 450` → ring is ~44% green, ~56% red.

### Ring Rendering

**Layers view — split arc**

`THREE.RingGeometry` supports partial arcs via `thetaStart` and `thetaLength`. The green and red arcs are sized proportionally:

```js
const greenFrac  = threat.greenScore / total;
const greenAngle = greenFrac * Math.PI * 2;

// Green arc, starting at 0
new THREE.RingGeometry(0.28, 0.44, 24, 1, 0, greenAngle)

// Red arc, continuing from where green ends
new THREE.RingGeometry(0.28, 0.44, 24, 1, greenAngle, Math.PI * 2 - greenAngle)
```

When `redScore === 0` (no recapture threat), a single solid green ring is rendered — no split needed.

**Cube view — interpolated edge box**

Cube view uses `LineSegments` edge boxes instead of rings. A single box is rendered per destination, its color linearly interpolated between green and red:

```js
const redFrac = total === 0 ? 0 : threat.redScore / total;
const color = new THREE.Color().copy(COLOR_HIGHLIGHT).lerp(COLOR_THREAT, redFrac);
```

The cube view can't split a single geometry proportionally without significantly more vertex manipulation, so the continuous lerp is an intentional design tradeoff that preserves performance and simplicity.

---

## Captured Pieces Bar

A persistent bar at the bottom-left shows which pieces each player has captured, displayed as Unicode chess symbols sorted by material value.

### State Tracking

`GameState` stores captures as two growing arrays of piece-type strings:

```js
this.captured = { w: [], b: [] };
// captured.w = piece types captured BY White (i.e. Black pieces White removed)
// captured.b = piece types captured BY Black (i.e. White pieces Black removed)
```

When a move lands on an occupied square, `executeMove()` records the victim before overwriting the destination:

```js
const victim = this.get(dst.x, dst.y, dst.z);
if (victim) this.captured[piece.color].push(victim.type);
```

The entire `captured` state is deep-copied into every undo snapshot and fully restored on undo, keeping the display consistent with board history.

### Display

`UI._updateCaptures(gs)` runs on every call to `ui.update()` (i.e., after every move):

```js
const SYM_WHITE = { P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', U: '🦄' };
const SYM_BLACK = { P: '♟', R: '♜', N: '♞', B: '♝', Q: '♛', K: '♚', U: '🦄' };
const ORDER = { Q: 0, R: 1, U: 2, B: 3, N: 4, P: 5, K: 6 };
```

White's row shows the Black symbols for each piece White captured (the physical pieces removed from Black's side of the board). Sorting follows material value descending — Queen first, Pawns last — giving both players a quick advantage read without requiring mental arithmetic.

Each row is hidden with `classList.toggle('hidden', length === 0)` until at least one capture has been made, keeping the initial HUD uncluttered.

---

## Hint System

A hint button (💡) is displayed in the bottom-right corner of the screen. It is enabled during the human player's turn in both Local Play and vs AI modes.

### Behavior

1. Player clicks 💡. The button enters a pulsing CSS animation (`hint-pulse`) to signal computation in progress.
2. After a 50 ms delay (allowing the animation frame to render), `findBestMove` is called at depth 2 for the current player's color.
3. The suggested move is visualized using two colored overlays on the board without executing the move:
   - **Cyan** — the piece to move (source cell)
   - **Orange** — the destination cell
4. Hint highlights are stored in a separate `hintMeshes` array, independent of the selection highlight array, so they persist until the player makes their own move or requests a new hint.
5. Hint highlights are cleared automatically when any move is executed or when the view mode is toggled.

In ring geometry (layers view), hints use `THREE.RingGeometry`. In cube view, hints use `THREE.LineSegments` edge boxes.

---

## Undo Move

An **Undo** button is available in the hamburger menu. Its behavior depends on the game mode.

### Local Play and vs AI

- The game state maintains a history stack (`_history`). Before each move is applied, a snapshot of the full board state is pushed: `{ board, currentTurn, status, moveCount }`.
- Clicking Undo pops the latest snapshot and restores the game state immediately.
- In vs AI mode, undoing once steps back before the AI's last move, restoring the board to the state before the human's prior move (one human ply + one AI ply are both undone in a single undo operation by popping twice).

### Online Multiplayer

Network undo uses a **request/approval protocol** over Firebase.

1. The requesting player clicks Undo. A push event `{ type: 'request', senderColor }` is written to `games/{code}/undoEvents`.
2. The UI shows a "Undo pending…" message to the requester and disables further input.
3. The opponent sees an overlay: "**[Color] requests undo — Accept / Decline**"
4. If the opponent clicks **Accept**, a push event `{ type: 'approved', senderColor }` is written. Both clients receive it; the requesting client calls `undoMove()` and syncs the result.
5. If the opponent clicks **Decline**, a push event `{ type: 'declined', senderColor }` is written. The requester sees "Undo declined" and play resumes.

Seen-key deduplication (`_seenUndoKeys` Set) prevents each client from processing its own echo of the event it sent.

---

## Network Protocol (Firebase)

All real-time game data is stored under `games/{roomCode}/` in Firebase Realtime Database.

| Path | Description |
|---|---|
| `games/{code}/moves` | Append-only list of moves in `{src, dst}` format |
| `games/{code}/undoEvents` | Append-only list of undo request/response events |

Moves are written with `push()` and read with `onValue()` / `onChildAdded()`. The host player is always White; the joining player is always Black.

---

## UI / HUD

### HUD (top-left)
- Game title: **5³ Chess**
- Current turn indicator (highlights White or Black)
- Player color indicator (network mode only)
- Status display (check, checkmate, stalemate messages)

### Hamburger Menu (top-right)
A collapsible dropdown triggered by a three-line button. Items:
- **New Game** — returns to lobby
- **Cube View / Layer View** — toggles board rendering mode
- **Undo** — requests undo (disabled when not applicable)
- **? How pieces move** — opens the piece reference modal

The dropdown closes automatically when clicking outside it, or after any button action.

### Hint Button (bottom-right)
Fixed circular button (48 px diameter) displaying 💡. Disabled during opponent's turn and AI thinking. Pulses cyan while the AI calculates the suggestion.

### Piece Reference Modal
An overlay table listing all seven piece types with their movement descriptions. Accessible from the hamburger menu at any time.

### Lobby
The start screen presented before a game begins. Panels:
- **Mode selection**: Create Game, Join Game, Local Play, vs AI
- **Host panel**: displays the shareable 6-character room code
- **Join panel**: text input for entering a room code
- **vs AI panel**: color selection (White / Black / Random)

### Game-Over Overlay
Displayed on checkmate or stalemate. Shows result text and a **Play Again** button that returns to the lobby.

### Last-Move Indicator

After every move, the source and destination squares are highlighted with an amber overlay. This makes it easy to see what the opponent just played without a move log.

**Layers view** — a translucent amber `PlaneGeometry` (94% of square size, opacity 0.40) is placed 0.005 units above the board surface, below the piece mesh.

**Cube view** — a `LineSegments` edge box slightly larger than the cell (`1.08×` scale) is drawn around both cells.

Both indicators are stored in `board.lastMoveMeshes`. When the view mode toggles, `setViewMode()` rebuilds them in the new style from the stored `_lastMoveSrc` / `_lastMoveDst` coordinates, so the indicator persists across view switches.

### Undo Request Overlay
A bottom-center toast shown to the opponent when an undo is requested in network play. Contains the request message and Accept / Decline buttons.

---

## File Structure

```
web/
├── index.html              # App shell, overlay markup, hamburger JS
├── css/
│   └── style.css           # All styles (HUD, overlays, animations)
└── js/
    ├── main.js             # Entry point: scene setup, game orchestration
    ├── gameState.js        # Board state, move execution, undo history
    ├── board.js            # Three.js board geometry (layers & cube views)
    ├── pieces.js           # GLB model loading, normalization, placement
    ├── moveValidator.js    # Legal move generation, check detection
    ├── ai.js               # Minimax + alpha-beta, findBestMove()
    ├── inputHandler.js     # Raycasting, click handling, move execution flow
    ├── network.js          # Firebase adapter (moves + undo events)
    └── ui.js               # DOM helpers for overlays and buttons
models/
├── king.glb
├── queen.glb
├── bishop.glb
├── knight.glb
├── unicorn.glb
├── rook.glb
└── pawn.glb
```

---

## Development & Local Serving

Because the project uses ES Modules loaded from CDN, it must be served over HTTP (not opened as a `file://` URL). Any static file server works:

```bash
# Python (built-in)
python3 -m http.server 8080 --directory web

# Node (npx, no install needed)
npx serve web

# VS Code: Live Server extension → right-click index.html → "Open with Live Server"
```

Then open `http://localhost:8080` in a browser.

Firebase credentials are embedded in `main.js`. For offline-only use (Local Play and vs AI), Firebase connectivity is not required; only network features will be unavailable.
