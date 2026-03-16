import { COLOR } from './gameState.js';

export class UI {
  constructor(onNewGame, onToggleView) {
    this.turnDisplay    = document.getElementById('turn-display');
    this.statusDisplay  = document.getElementById('status-display');
    this.overlay        = document.getElementById('game-over-overlay');
    this.resultText     = document.getElementById('game-over-result');
    this.viewBtn        = document.getElementById('view-toggle-btn');
    this.colorIndicator = document.getElementById('player-color-indicator');
    this.undoBtn          = document.getElementById('undo-btn');
    this.undoOverlay      = document.getElementById('undo-request-overlay');
    this.undoMsg          = document.getElementById('undo-request-msg');
    this.capturesByWhite  = document.getElementById('captures-by-white');
    this.capturesByBlack  = document.getElementById('captures-by-black');
    this.capturesWhiteRow = document.getElementById('captures-white-row');
    this.capturesBlackRow = document.getElementById('captures-black-row');

    // Use onclick so repeated initGame() calls replace the handler cleanly,
    // preventing stacking event listeners across game resets.
    const newGameBtn = document.getElementById('new-game-btn');
    newGameBtn.onclick  = onNewGame;
    newGameBtn.disabled = false;

    document.getElementById('play-again-btn').onclick  = onNewGame;
    document.getElementById('review-board-btn').onclick = () => this.hideGameOver();

    this.viewBtn.onclick  = onToggleView;
    this.viewBtn.disabled = false;

    this.undoBtn.disabled = true;
    this.undoBtn.onclick  = null;
    this.hideUndoOverlay();
  }

  // ── Game state display ────────────────────────────────────────────────────

  update(gs) {
    const name = gs.currentTurn === COLOR.WHITE ? 'White' : 'Black';
    this.turnDisplay.textContent = `${name}'s Turn`;
    this.turnDisplay.className = gs.currentTurn === COLOR.BLACK ? 'black-turn' : '';
    this.statusDisplay.textContent = gs.status === 'check'
      ? `⚠ ${name} is in CHECK!` : '';
    this._updateCaptures(gs);
  }

  _updateCaptures(gs) {
    // Unicode symbols for each piece by its original colour
    const SYM_WHITE = { P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', U: '🦄' };
    const SYM_BLACK = { P: '♟', R: '♜', N: '♞', B: '♝', Q: '♛', K: '♚', U: '🦄' };
    // Sort most-valuable first: Q > R > U > B > N > P
    const ORDER = { Q: 0, R: 1, U: 2, B: 3, N: 4, P: 5, K: 6 };
    const sort = arr => [...arr].sort((a, b) => (ORDER[a] ?? 9) - (ORDER[b] ?? 9));

    // captured.w = black pieces white took → show black symbols
    const byW = sort(gs.captured.w);
    this.capturesByWhite.textContent = byW.map(t => SYM_BLACK[t] ?? t).join('');
    this.capturesWhiteRow.classList.toggle('hidden', byW.length === 0);

    // captured.b = white pieces black took → show white symbols
    const byB = sort(gs.captured.b);
    this.capturesByBlack.textContent = byB.map(t => SYM_WHITE[t] ?? t).join('');
    this.capturesBlackRow.classList.toggle('hidden', byB.length === 0);
  }

  setViewLabel(mode) {
    this.viewBtn.textContent = mode === 'cube' ? 'Layer View' : 'Cube View';
  }

  showGameOver(status, losingColor) {
    this.overlay.classList.remove('hidden');
    if (status === 'checkmate') {
      const winner = losingColor === COLOR.WHITE ? 'Black' : 'White';
      this.resultText.textContent = `${winner} wins by checkmate!`;
    } else {
      this.resultText.textContent = 'Draw by stalemate.';
    }
  }

  /** Show the pawn-promotion picker; calls callback(pieceType) on selection. */
  showPromotionPicker(callback) {
    const overlay = document.getElementById('promotion-overlay');
    overlay.classList.remove('hidden');
    overlay.querySelectorAll('[data-piece]').forEach(btn => {
      btn.onclick = () => {
        overlay.classList.add('hidden');
        callback(btn.dataset.piece);
      };
    });
  }

  hideGameOver() {
    this.overlay.classList.add('hidden');
    this.statusDisplay.textContent = '';
  }

  // ── Network / lobby helpers ───────────────────────────────────────────────

  /** Show a HUD badge indicating which color this player controls. */
  showColorIndicator(color) {
    this.colorIndicator.textContent =
      color === COLOR.WHITE ? 'You are: White ♔' : 'You are: Black ♚';
    // Set className (also removes 'hidden' class):
    this.colorIndicator.className =
      color === COLOR.BLACK ? 'black-turn' : '';
  }

  hideColorIndicator() {
    this.colorIndicator.className = 'hidden';
  }

  // ── Undo button ───────────────────────────────────────────────────────────

  setUndoBtn(enabled, label = null, handler = null) {
    this.undoBtn.disabled = !enabled;
    if (label)   this.undoBtn.textContent = label;
    if (handler) this.undoBtn.onclick = handler;
  }

  // ── Undo request overlay ──────────────────────────────────────────────────

  /** Show "waiting for opponent to respond" state. */
  showUndoPending() {
    this.undoMsg.textContent = 'Waiting for opponent to approve undo…';
    document.getElementById('undo-request-buttons').classList.add('hidden');
    this.undoOverlay.classList.remove('hidden');
  }

  /** Show opponent's undo request with Accept / Decline buttons. */
  showUndoRequest(onAccept, onDecline) {
    this.undoMsg.textContent = 'Opponent requests to undo their last move.';
    const btns = document.getElementById('undo-request-buttons');
    btns.classList.remove('hidden');
    document.getElementById('undo-accept-btn').onclick  = onAccept;
    document.getElementById('undo-decline-btn').onclick = onDecline;
    this.undoOverlay.classList.remove('hidden');
  }

  hideUndoOverlay() {
    this.undoOverlay.classList.add('hidden');
  }

  /** Show a brief status message (e.g. "Undo declined.") */
  showUndoStatus(msg, durationMs = 2500) {
    this.undoMsg.textContent = msg;
    document.getElementById('undo-request-buttons').classList.add('hidden');
    this.undoOverlay.classList.remove('hidden');
    clearTimeout(this._undoStatusTimer);
    this._undoStatusTimer = setTimeout(() => this.hideUndoOverlay(), durationMs);
  }

  /** Show one lobby panel ('mode' | 'host' | 'join'), hide the others. */
  showLobby(panel) {
    document.getElementById('lobby-overlay').classList.remove('hidden');
    for (const p of ['mode', 'host', 'join', 'ai']) {
      document.getElementById(`lobby-${p}`)
        .classList.toggle('hidden', p !== panel);
    }
  }

  hideLobby() {
    document.getElementById('lobby-overlay').classList.add('hidden');
  }
}
