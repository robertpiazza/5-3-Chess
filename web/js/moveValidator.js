import { PIECE, COLOR } from './gameState.js';

// All 26 directions a queen/king can move in 3D
const ALL_DIRS = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++)
      if (dx !== 0 || dy !== 0 || dz !== 0)
        ALL_DIRS.push([dx, dy, dz]);

// Rook: 6 axis-aligned directions
const ROOK_DIRS = ALL_DIRS.filter(([dx, dy, dz]) =>
  (dx !== 0 ? 1 : 0) + (dy !== 0 ? 1 : 0) + (dz !== 0 ? 1 : 0) === 1
);

// Bishop: 12 face-diagonal directions (exactly 2 axes non-zero)
const BISHOP_DIRS = ALL_DIRS.filter(([dx, dy, dz]) =>
  (dx !== 0 ? 1 : 0) + (dy !== 0 ? 1 : 0) + (dz !== 0 ? 1 : 0) === 2
);

// Unicorn: 8 space-diagonal directions (all 3 axes non-zero)
const UNICORN_DIRS = ALL_DIRS.filter(([dx, dy, dz]) =>
  dx !== 0 && dy !== 0 && dz !== 0
);

// Knight: 24 L-shaped moves (2 on one axis, 1 on another, 0 on third)
const KNIGHT_MOVES = [];
const AXES = [[1,0,0],[0,1,0],[0,0,1]];
for (const [ax, ay, az] of AXES) {
  for (const [bx, by, bz] of AXES) {
    if (ax === bx && ay === by && az === bz) continue; // same axis
    for (const s1 of [1, -1]) {
      for (const s2 of [1, -1]) {
        KNIGHT_MOVES.push([
          ax * 2 * s1 + bx * s2,
          ay * 2 * s1 + by * s2,
          az * 2 * s1 + bz * s2,
        ]);
      }
    }
  }
}

function inBounds(x, y, z) {
  return x >= 0 && x < 5 && y >= 0 && y < 5 && z >= 0 && z < 5;
}

// Generate pseudo-legal moves (ignoring check) for a piece at (x,y,z) on boardArr
function pseudoLegalMoves(boardArr, x, y, z) {
  const piece = boardArr[x][y][z];
  if (!piece) return [];

  const { type, color } = piece;
  const enemy = color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
  const moves = [];

  function slide(dirs) {
    for (const [dx, dy, dz] of dirs) {
      let nx = x + dx, ny = y + dy, nz = z + dz;
      while (inBounds(nx, ny, nz)) {
        const target = boardArr[nx][ny][nz];
        if (target) {
          if (target.color === enemy) moves.push({ x: nx, y: ny, z: nz });
          break; // blocked
        }
        moves.push({ x: nx, y: ny, z: nz });
        nx += dx; ny += dy; nz += dz;
      }
    }
  }

  function step(dirs) {
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!inBounds(nx, ny, nz)) continue;
      const target = boardArr[nx][ny][nz];
      if (!target || target.color === enemy) moves.push({ x: nx, y: ny, z: nz });
    }
  }

  switch (type) {
    case PIECE.ROOK:    slide(ROOK_DIRS); break;
    case PIECE.BISHOP:  slide(BISHOP_DIRS); break;
    case PIECE.UNICORN: slide(UNICORN_DIRS); break;
    case PIECE.QUEEN:   slide(ALL_DIRS); break;
    case PIECE.KING:    step(ALL_DIRS); break;

    case PIECE.KNIGHT: {
      for (const [dx, dy, dz] of KNIGHT_MOVES) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!inBounds(nx, ny, nz)) continue;
        const target = boardArr[nx][ny][nz];
        if (!target || target.color === enemy) moves.push({ x: nx, y: ny, z: nz });
      }
      break;
    }

    case PIECE.PAWN: {
      // Forward direction: white moves +z, black moves -z
      const fwd = color === COLOR.WHITE ? 1 : -1;
      const nz = z + fwd;
      if (inBounds(x, y, nz)) {
        // Forward move (must be empty) — no double-move in Raumschach
        if (!boardArr[x][y][nz]) {
          moves.push({ x, y, z: nz });
        }
        // Diagonal captures: all 4 diagonal squares on the forward layer
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const cx = x + dx, cy = y + dy;
          if (inBounds(cx, cy, nz)) {
            const target = boardArr[cx][cy][nz];
            if (target && target.color === enemy) moves.push({ x: cx, y: cy, z: nz });
          }
        }
      }
      break;
    }
  }

  return moves;
}

// Check if a given color's king is attacked on boardArr
export function isInCheck(boardArr, color) {
  // Find king
  let kx, ky, kz;
  outer: for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 5; z++) {
        const c = boardArr[x][y][z];
        if (c && c.type === PIECE.KING && c.color === color) {
          kx = x; ky = y; kz = z;
          break outer;
        }
      }

  if (kx === undefined) return false; // no king (shouldn't happen in real game)

  const enemy = color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
  // Check if any enemy piece can reach the king
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 5; z++) {
        const c = boardArr[x][y][z];
        if (c && c.color === enemy) {
          const attacks = pseudoLegalMoves(boardArr, x, y, z);
          if (attacks.some(m => m.x === kx && m.y === ky && m.z === kz)) return true;
        }
      }
  return false;
}

// Clone a board array
function cloneBoard(boardArr) {
  return boardArr.map(plane =>
    plane.map(row => row.map(cell => cell ? { ...cell } : null))
  );
}

// Apply a move to a cloned board
function applyMove(boardArr, src, dst) {
  const clone = cloneBoard(boardArr);
  clone[dst.x][dst.y][dst.z] = clone[src.x][src.y][src.z];
  clone[src.x][src.y][src.z] = null;
  return clone;
}

// Get fully legal moves (excludes moves that leave own king in check)
export function getLegalMoves(boardArr, x, y, z) {
  const piece = boardArr[x][y][z];
  if (!piece) return [];
  const pseudo = pseudoLegalMoves(boardArr, x, y, z);
  return pseudo.filter(dst => {
    const after = applyMove(boardArr, { x, y, z }, dst);
    return !isInCheck(after, piece.color);
  });
}

// Piece values used for exchange evaluation
const PIECE_VALUES = {
  [PIECE.PAWN]:    100,
  [PIECE.KNIGHT]:  350,
  [PIECE.BISHOP]:  350,
  [PIECE.UNICORN]: 475,
  [PIECE.ROOK]:    525,
  [PIECE.QUEEN]:  1000,
  [PIECE.KING]:  20000,
};

/**
 * Static Exchange Evaluation (SEE) for moving a piece to targetPos.
 * Both sides recapture with their cheapest available piece, alternating
 * until one side runs out of pieces.
 *
 * Returns { greenScore, redScore }:
 *   greenScore — total material the moving side expects to gain
 *   redScore   — total material the moving side expects to lose
 *
 * Example: white bishop → square defended by own pawn, attacked by black
 * knight (350) and black queen (1000).
 *   Sequence: knight takes bishop (−350), pawn takes knight (+350),
 *             queen takes pawn (−100).
 *   → greenScore = 350, redScore = 450, ring = 350/800 green, 450/800 red.
 */
export function getSquareThreat(boardArr, targetPos, selectedPos, movingColor) {
  const opponentColor = movingColor === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
  const { x: tx, y: ty, z: tz } = targetPos;

  // Base simulation: moving piece relocated to target, source cleared.
  const base = boardArr.map(p => p.map(r => [...r]));
  base[tx][ty][tz] = base[selectedPos.x][selectedPos.y][selectedPos.z];
  base[selectedPos.x][selectedPos.y][selectedPos.z] = null;

  // Defender simulation: target holds a dummy enemy so own sliding/stepping
  // pieces can "see" it as capturable (same fix as before).
  const defSim = base.map(p => p.map(r => [...r]));
  defSim[tx][ty][tz] = { ...base[tx][ty][tz], color: opponentColor };

  // Collect piece values for each side, sorted cheapest-first so we always
  // simulate the most natural (lowest-risk) recapture first.
  const attackerVals = [];
  const defenderVals = [];

  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 5; z++) {
        if (x === tx && y === ty && z === tz) continue;
        const piece = base[x][y][z];
        if (!piece) continue;
        const val = PIECE_VALUES[piece.type] ?? 0;

        if (piece.color === opponentColor) {
          if (pseudoLegalMoves(base, x, y, z).some(m => m.x === tx && m.y === ty && m.z === tz))
            attackerVals.push(val);
        } else {
          if (pseudoLegalMoves(defSim, x, y, z).some(m => m.x === tx && m.y === ty && m.z === tz))
            defenderVals.push(val);
        }
      }

  attackerVals.sort((a, b) => a - b);
  defenderVals.sort((a, b) => a - b);

  // Simulate alternating captures. onSquareValue tracks the piece currently
  // sitting on the target (and thus at risk on the next capture).
  const movingPiece = boardArr[selectedPos.x][selectedPos.y][selectedPos.z];
  let onSquareValue = PIECE_VALUES[movingPiece.type] ?? 0;
  let greenScore = 0;
  let redScore   = 0;
  let ai = 0, di = 0;

  while (ai < attackerVals.length) {
    redScore     += onSquareValue;       // opponent captures our piece on the square
    onSquareValue = attackerVals[ai++];  // their piece is now on the square

    if (di >= defenderVals.length) break; // no defender left to recapture

    greenScore   += onSquareValue;       // we recapture their piece
    onSquareValue = defenderVals[di++];  // our next piece is now on the square
  }

  return { greenScore, redScore };
}

// Check if a color has any legal moves at all
export function hasAnyLegalMove(boardArr, color) {
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 5; z++) {
        const c = boardArr[x][y][z];
        if (c && c.color === color) {
          if (getLegalMoves(boardArr, x, y, z).length > 0) return true;
        }
      }
  return false;
}
