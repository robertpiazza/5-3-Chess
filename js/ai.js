import { getLegalMoves, isInCheck, hasAnyLegalMove } from './moveValidator.js';
import { COLOR, PIECE } from './gameState.js';

// ── Piece values (material score from the AI's perspective) ──────────────────

const PIECE_VALUES = {
  [PIECE.PAWN]:   100,
  [PIECE.KNIGHT]: 350,
  [PIECE.BISHOP]: 350,
  [PIECE.UNICORN]:475,
  [PIECE.ROOK]:   525,
  [PIECE.QUEEN]:  1000,
  [PIECE.KING]:   20000,
};

// ── Board utilities ───────────────────────────────────────────────────────────

function cloneBoard(b) {
  return b.map(plane => plane.map(row => row.map(cell => cell ? { ...cell } : null)));
}

/**
 * Apply a move to a (cloned) board in place.
 * Pawns that reach the far layer are auto-promoted to Queen.
 */
function applyMoveOnBoard(board, src, dst) {
  const piece = board[src.x][src.y][src.z];
  board[dst.x][dst.y][dst.z] = piece;
  board[src.x][src.y][src.z] = null;

  if (piece && piece.type === PIECE.PAWN) {
    const promoteZ = piece.color === COLOR.WHITE ? 4 : 0;
    if (dst.z === promoteZ) {
      board[dst.x][dst.y][dst.z] = { type: PIECE.QUEEN, color: piece.color };
    }
  }
}

/**
 * Static evaluation: sum of material from aiColor's perspective.
 * Positive = good for AI; negative = good for opponent.
 */
function evaluate(board, aiColor) {
  let score = 0;
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 5; z++) {
        const p = board[x][y][z];
        if (!p) continue;
        const v = PIECE_VALUES[p.type] ?? 0;
        score += p.color === aiColor ? v : -v;
      }
  return score;
}

/**
 * Collect every legal move for `color` on `board`.
 * Returns [{src:{x,y,z}, dst:{x,y,z}}, ...]
 */
function getAllMoves(board, color) {
  const moves = [];
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 5; z++) {
        const p = board[x][y][z];
        if (!p || p.color !== color) continue;
        const dsts = getLegalMoves(board, x, y, z);
        for (const dst of dsts) moves.push({ src: { x, y, z }, dst });
      }
  return moves;
}

// ── Minimax with alpha-beta pruning ──────────────────────────────────────────

/**
 * @param {Array}   board       - 3-D board array (cloned per node)
 * @param {number}  depth       - remaining search depth
 * @param {string}  color       - whose turn it is at this node
 * @param {number}  alpha
 * @param {number}  beta
 * @param {string}  aiColor     - the AI's color (score perspective)
 * @returns {number} evaluation score from aiColor's perspective
 */
function minimax(board, depth, color, alpha, beta, aiColor) {
  const maximizing = color === aiColor;
  const oppColor   = color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;

  // Terminal state: no legal moves means checkmate or stalemate
  if (!hasAnyLegalMove(board, color)) {
    if (isInCheck(board, color)) {
      // Checkmate — return a large loss/win, scaled by depth so shallower mates score higher
      return maximizing ? -(999999 + depth) : (999999 + depth);
    }
    return 0; // stalemate
  }

  if (depth === 0) return evaluate(board, aiColor);

  const moves = getAllMoves(board, color);

  if (maximizing) {
    let best = -Infinity;
    for (const { src, dst } of moves) {
      const nb = cloneBoard(board);
      applyMoveOnBoard(nb, src, dst);
      const score = minimax(nb, depth - 1, oppColor, alpha, beta, aiColor);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break; // β cut-off
    }
    return best;
  } else {
    let best = Infinity;
    for (const { src, dst } of moves) {
      const nb = cloneBoard(board);
      applyMoveOnBoard(nb, src, dst);
      const score = minimax(nb, depth - 1, oppColor, alpha, beta, aiColor);
      if (score < best) best = score;
      if (best < beta) beta = best;
      if (beta <= alpha) break; // α cut-off
    }
    return best;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find the best move for `aiColor` on the given board.
 *
 * @param {Array}  boardArr - current 3-D board (not mutated)
 * @param {string} aiColor  - COLOR.WHITE or COLOR.BLACK
 * @param {number} depth    - search depth (default 3)
 * @returns {{ src:{x,y,z}, dst:{x,y,z} } | null}
 */
export function findBestMove(boardArr, aiColor, depth = 3) {
  const oppColor = aiColor === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
  const moves    = getAllMoves(boardArr, aiColor);
  if (moves.length === 0) return null;

  let bestScore = -Infinity;
  let bestMove  = null;

  for (const { src, dst } of moves) {
    const nb    = cloneBoard(boardArr);
    applyMoveOnBoard(nb, src, dst);
    const score = minimax(nb, depth - 1, oppColor, -Infinity, Infinity, aiColor);
    if (score > bestScore) {
      bestScore = score;
      bestMove  = { src, dst };
    }
  }

  return bestMove;
}
