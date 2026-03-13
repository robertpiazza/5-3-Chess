// Piece type constants
export const PIECE = {
  ROOK: 'R',
  BISHOP: 'B',
  KNIGHT: 'N',
  QUEEN: 'Q',
  KING: 'K',
  UNICORN: 'U',
  PAWN: 'P',
};

export const COLOR = { WHITE: 'w', BLACK: 'b' };

// A cell is null or { type, color }
// board[x][y][z]  x=col(0-4), y=row(0-4), z=layer(0-4)
// White starts on z=0,1; Black on z=3,4

function emptyBoard() {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () =>
      Array(5).fill(null)
    )
  );
}

// Raumschach starting position (Maack 1919) per chessvariants.com/3d.dir/3d5.html
//
// White occupies Levels A (z=0) and B (z=1):
//   Level A rank 1 (y=0): R  N  K  N  R   (x = 0..4)
//   Level A rank 2 (y=1): P  P  P  P  P
//   Level B rank 1 (y=0): B  U  Q  B  U
//   Level B rank 2 (y=1): P  P  P  P  P
//
// Black occupies Levels E (z=4) and D (z=3):
//   Level E rank 5 (y=4): R  N  K  N  R
//   Level E rank 4 (y=3): P  P  P  P  P
//   Level D rank 5 (y=4): B  U  Q  B  U
//   Level D rank 4 (y=3): P  P  P  P  P
//
// Level C (z=2) is empty.

const LEVEL_A_E = [PIECE.ROOK, PIECE.KNIGHT, PIECE.KING, PIECE.KNIGHT, PIECE.ROOK];
const LEVEL_B_D = [PIECE.BISHOP, PIECE.UNICORN, PIECE.QUEEN, PIECE.BISHOP, PIECE.UNICORN];

function buildStartPosition() {
  const b = emptyBoard();

  for (let x = 0; x < 5; x++) {
    // White — Level A (z=0)
    b[x][0][0] = { type: LEVEL_A_E[x], color: COLOR.WHITE };
    b[x][1][0] = { type: PIECE.PAWN,   color: COLOR.WHITE };

    // White — Level B (z=1)
    b[x][0][1] = { type: LEVEL_B_D[x], color: COLOR.WHITE };
    b[x][1][1] = { type: PIECE.PAWN,   color: COLOR.WHITE };

    // Black — Level E (z=4)
    b[x][4][4] = { type: LEVEL_A_E[x], color: COLOR.BLACK };
    b[x][3][4] = { type: PIECE.PAWN,   color: COLOR.BLACK };

    // Black — Level D (z=3)
    b[x][4][3] = { type: LEVEL_B_D[x], color: COLOR.BLACK };
    b[x][3][3] = { type: PIECE.PAWN,   color: COLOR.BLACK };
  }

  return b;
}

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = buildStartPosition();
    this.currentTurn = COLOR.WHITE;
    this.selectedPos = null;   // { x, y, z } of selected piece
    this.legalMoves = [];      // array of { x, y, z }
    this.status = 'playing';   // 'playing' | 'check' | 'checkmate' | 'stalemate'
    this.moveCount = 0;
    this._history = [];        // snapshots for undo
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return undefined;
    return this.board[x][y][z];
  }

  set(x, y, z, piece) {
    this.board[x][y][z] = piece;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < 5 && y >= 0 && y < 5 && z >= 0 && z < 5;
  }

  // Deep clone the board (used for check detection)
  cloneBoard() {
    return this.board.map(plane =>
      plane.map(row => row.map(cell => cell ? { ...cell } : null))
    );
  }

  // Move piece from src to dst on a given board array (mutates it)
  applyMove(boardArr, src, dst) {
    boardArr[dst.x][dst.y][dst.z] = boardArr[src.x][src.y][src.z];
    boardArr[src.x][src.y][src.z] = null;
  }

  // Execute the move in the real game state
  executeMove(src, dst, promotionType = null) {
    // Save snapshot before applying the move
    this._history.push({
      board:       this.cloneBoard(),
      currentTurn: this.currentTurn,
      status:      this.status,
      moveCount:   this.moveCount,
    });

    const piece = this.get(src.x, src.y, src.z);
    this.set(dst.x, dst.y, dst.z, piece);
    this.set(src.x, src.y, src.z, null);

    // Pawn promotion
    if (piece.type === PIECE.PAWN) {
      const promoteZ = piece.color === COLOR.WHITE ? 4 : 0;
      if (dst.z === promoteZ) {
        this.set(dst.x, dst.y, dst.z, { type: promotionType || PIECE.QUEEN, color: piece.color });
      }
    }

    this.selectedPos = null;
    this.legalMoves = [];
    this.currentTurn = this.currentTurn === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
    this.moveCount++;
  }

  // Restore the previous state. Returns false if there is no history.
  undoMove() {
    if (this._history.length === 0) return false;
    const snap = this._history.pop();
    this.board       = snap.board;
    this.currentTurn = snap.currentTurn;
    this.status      = snap.status;
    this.moveCount   = snap.moveCount;
    this.selectedPos = null;
    this.legalMoves  = [];
    return true;
  }

  findKing(color, boardArr) {
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        for (let z = 0; z < 5; z++) {
          const c = boardArr[x][y][z];
          if (c && c.type === PIECE.KING && c.color === color) return { x, y, z };
        }
    return null;
  }
}
