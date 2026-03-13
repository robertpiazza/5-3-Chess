import * as THREE from 'three';
import { COLOR, PIECE } from './gameState.js';
import { getLegalMoves, isInCheck, hasAnyLegalMove } from './moveValidator.js';

export class InputHandler {
  /**
   * @param {string|null}   localColor      COLOR.WHITE/BLACK in network play; null = local
   * @param {Function|null} networkSendMove Called with (src, dst, promotionType) after a move
   * @param {Function|null} onAfterMove     Called after every local move (for undo state updates)
   */
  constructor(camera, renderer, gameState, board, pieceManager, ui,
              localColor = null, networkSendMove = null, onAfterMove = null) {
    this.camera          = camera;
    this.renderer        = renderer;
    this.gameState       = gameState;
    this.board           = board;
    this.pieceManager    = pieceManager;
    this.ui              = ui;
    this.localColor      = localColor;
    this.networkSendMove = networkSendMove;
    this.onAfterMove     = onAfterMove;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._isDragging   = false;
    this._mouseDownPos = { x: 0, y: 0 };
    this._isPromoting  = false;

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

    // Block clicks while a piece animation is in progress
    if (this.pieceManager.isAnimating) return;
    if (this._isPromoting) return;

    // In network mode, block clicks when it's not this player's turn
    if (this.localColor !== null && this.gameState.currentTurn !== this.localColor) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Collect all hits — intersectObjects returns them sorted nearest→farthest.
    // In cube view the ray passes through many overlapping cell meshes, so we must
    // walk the full list to find the nearest *semantically relevant* cube rather
    // than blindly taking hit[0] (which is always an outer surface).
    const pieceHits  = this.raycaster.intersectObjects(this.pieceManager.getPieceMeshes());
    const squareHits = this.raycaster.intersectObjects(this.board.getSquareMeshes());

    const gs = this.gameState;

    const squarePos = hit => {
      const sq = hit.object;
      return { x: sq.userData.boardX, y: sq.userData.boardY, z: sq.userData.boardZ };
    };
    const isLegal = pos => gs.legalMoves.some(m => m.x === pos.x && m.y === pos.y && m.z === pos.z);
    const isOwn   = pos => { const p = gs.get(pos.x, pos.y, pos.z); return p && p.color === gs.currentTurn; };

    if (gs.selectedPos) {
      // Walk all square hits nearest→farthest; first relevant hit wins.
      for (const hit of squareHits) {
        const pos = squarePos(hit);
        if (isLegal(pos)) { this._executeMove(gs.selectedPos, pos); return; }
        if (isOwn(pos))   { this._selectPiece(pos); return; }
      }
      // Fall back: check piece-mesh hits for reselection
      if (pieceHits.length > 0) {
        const coords = this.pieceManager.getGroupCoords(pieceHits[0].object);
        if (coords && isOwn(coords)) { this._selectPiece(coords); return; }
      }
      // Nothing relevant along the ray — deselect
      gs.selectedPos = null;
      gs.legalMoves  = [];
      this.board.showHighlights(null, []);
    } else {
      // Walk all square hits nearest→farthest; select the first own piece found.
      for (const hit of squareHits) {
        const pos = squarePos(hit);
        if (isOwn(pos)) { this._selectPiece(pos); return; }
      }
      // Fall back: check piece-mesh hits
      if (pieceHits.length > 0) {
        const coords = this.pieceManager.getGroupCoords(pieceHits[0].object);
        if (coords && isOwn(coords)) this._selectPiece(coords);
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

  async _executeMove(src, dst) {
    const gs = this.gameState;
    const piece = gs.get(src.x, src.y, src.z);

    // Detect promotion before animating (piece may disappear from src mid-flight)
    let isPromotion = false;
    if (piece.type === PIECE.PAWN) {
      const promoteZ = piece.color === COLOR.WHITE ? 4 : 0;
      if (dst.z === promoteZ) isPromotion = true;
    }

    // Animate the 3D mesh — await so game state updates after the piece lands
    await this.pieceManager.moveMesh(src, dst);

    // Show promotion picker after the piece lands
    let promotionType = null;
    if (isPromotion) {
      this._isPromoting = true;
      promotionType = await this._askPromotion();
      this._isPromoting = false;
    }

    // Update game state
    gs.executeMove(src, dst, promotionType);

    // Refresh promoted piece mesh if needed
    if (promotionType) this.pieceManager.refreshCell(dst.x, dst.y, dst.z);

    // Clear selection highlights and mark this move on the board
    this.board.showHighlights(null, []);
    this.board.showLastMove(src, dst);

    // Send move to opponent over the network / trigger AI
    if (this.networkSendMove) this.networkSendMove(src, dst, promotionType);

    // Evaluate new position
    this._updateGameStatus();
    this.ui.update(gs);

    if (this.onAfterMove) this.onAfterMove();
  }

  _askPromotion() {
    return new Promise(resolve => {
      this.ui.showPromotionPicker(resolve);
    });
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
