import * as THREE from 'three';
import { COLOR, PIECE } from './gameState.js';
import { getLegalMoves, isInCheck, hasAnyLegalMove } from './moveValidator.js';

export class InputHandler {
  /**
   * @param {string|null}   localColor      COLOR.WHITE/BLACK in network play; null = local
   * @param {Function|null} networkSendMove Called with (src, dst, promotionType) after a move
   */
  constructor(camera, renderer, gameState, board, pieceManager, ui,
              localColor = null, networkSendMove = null) {
    this.camera          = camera;
    this.renderer        = renderer;
    this.gameState       = gameState;
    this.board           = board;
    this.pieceManager    = pieceManager;
    this.ui              = ui;
    this.localColor      = localColor;
    this.networkSendMove = networkSendMove;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._isDragging = false;
    this._mouseDownPos = { x: 0, y: 0 };

    renderer.domElement.addEventListener('pointerdown', e => {
      this._isDragging = false;
      this._mouseDownPos = { x: e.clientX, y: e.clientY };
    });
    renderer.domElement.addEventListener('pointermove', e => {
      const dx = e.clientX - this._mouseDownPos.x;
      const dy = e.clientY - this._mouseDownPos.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this._isDragging = true;
    });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!this._isDragging) this._onClick(e);
    });
  }

  _onClick(e) {
    if (this.gameState.status === 'checkmate' || this.gameState.status === 'stalemate') return;

    // In network mode, block clicks when it's not this player's turn
    if (this.localColor !== null && this.gameState.currentTurn !== this.localColor) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // First try to hit piece meshes
    const pieceMeshes = this.pieceManager.getPieceMeshes();
    const pieceHits = this.raycaster.intersectObjects(pieceMeshes);

    // Also hit board squares
    const squareMeshes = this.board.getSquareMeshes();
    const squareHits = this.raycaster.intersectObjects(squareMeshes);

    const gs = this.gameState;

    if (gs.selectedPos) {
      // Something is selected — try to move to target
      let targetPos = null;

      if (squareHits.length > 0) {
        const sq = squareHits[0].object;
        targetPos = { x: sq.userData.boardX, y: sq.userData.boardY, z: sq.userData.boardZ };
      } else if (pieceHits.length > 0) {
        const coords = this.pieceManager.getGroupCoords(pieceHits[0].object);
        if (coords) targetPos = coords;
      }

      if (targetPos) {
        const isLegal = gs.legalMoves.some(m => m.x === targetPos.x && m.y === targetPos.y && m.z === targetPos.z);

        if (isLegal) {
          this._executeMove(gs.selectedPos, targetPos);
          return;
        }

        // Clicked own piece — reselect
        const clickedPiece = gs.get(targetPos.x, targetPos.y, targetPos.z);
        if (clickedPiece && clickedPiece.color === gs.currentTurn) {
          this._selectPiece(targetPos);
          return;
        }

        // Clicked empty or enemy non-legal square — deselect
        gs.selectedPos = null;
        gs.legalMoves = [];
        this.board.showHighlights(null, []);
      }
    } else {
      // Nothing selected — try to select a piece
      let targetPos = null;

      if (pieceHits.length > 0) {
        targetPos = this.pieceManager.getGroupCoords(pieceHits[0].object);
      } else if (squareHits.length > 0) {
        const sq = squareHits[0].object;
        targetPos = { x: sq.userData.boardX, y: sq.userData.boardY, z: sq.userData.boardZ };
      }

      if (targetPos) {
        const piece = gs.get(targetPos.x, targetPos.y, targetPos.z);
        if (piece && piece.color === gs.currentTurn) {
          this._selectPiece(targetPos);
        }
      }
    }
  }

  _selectPiece(pos) {
    const gs = this.gameState;
    const moves = getLegalMoves(gs.board, pos.x, pos.y, pos.z);
    gs.selectedPos = pos;
    gs.legalMoves = moves;
    this.board.showHighlights(pos, moves);
  }

  _executeMove(src, dst) {
    const gs = this.gameState;
    const piece = gs.get(src.x, src.y, src.z);

    // Check for pawn promotion
    let promotionType = null;
    if (piece.type === PIECE.PAWN) {
      const promoteZ = piece.color === COLOR.WHITE ? 4 : 0;
      if (dst.z === promoteZ) {
        promotionType = this._askPromotion();
      }
    }

    // Move the 3D mesh
    this.pieceManager.moveMesh(src, dst);

    // Update game state
    gs.executeMove(src, dst, promotionType);

    // Refresh promoted piece mesh if needed
    if (promotionType) this.pieceManager.refreshCell(dst.x, dst.y, dst.z);

    // Clear highlights
    this.board.showHighlights(null, []);

    // Send move to opponent over the network (no-op in local play)
    if (this.networkSendMove) this.networkSendMove(src, dst, promotionType);

    // Evaluate new position
    this._updateGameStatus();
    this.ui.update(gs);
  }

  _askPromotion() {
    const choices = ['Queen', 'Rook', 'Bishop', 'Knight', 'Unicorn'];
    const answer = window.prompt(
      `Pawn promotion! Choose piece:\n${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
      '1'
    );
    const idx = parseInt(answer, 10) - 1;
    const map = { Queen: PIECE.QUEEN, Rook: PIECE.ROOK, Bishop: PIECE.BISHOP, Knight: PIECE.KNIGHT, Unicorn: PIECE.UNICORN };
    return map[choices[idx]] || PIECE.QUEEN;
  }

  _updateGameStatus() {
    const gs = this.gameState;
    const color = gs.currentTurn;
    const inCheck = isInCheck(gs.board, color);
    const anyMove = hasAnyLegalMove(gs.board, color);

    if (!anyMove) {
      gs.status = inCheck ? 'checkmate' : 'stalemate';
      this.ui.showGameOver(gs.status, color);
    } else {
      gs.status = inCheck ? 'check' : 'playing';
    }
  }
}
