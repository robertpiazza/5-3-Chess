import { COLOR } from './gameState.js';

export class UI {
  constructor(onNewGame, onToggleView) {
    this.turnDisplay    = document.getElementById('turn-display');
    this.statusDisplay  = document.getElementById('status-display');
    this.overlay        = document.getElementById('game-over-overlay');
    this.resultText     = document.getElementById('game-over-result');
    this.viewBtn        = document.getElementById('view-toggle-btn');
    this.colorIndicator = document.getElementById('player-color-indicator');

    // Use onclick so repeated initGame() calls replace the handler cleanly,
    // preventing stacking event listeners across game resets.
    const newGameBtn = document.getElementById('new-game-btn');
    newGameBtn.onclick  = onNewGame;
    newGameBtn.disabled = false;

    document.getElementById('play-again-btn').onclick = onNewGame;

    this.viewBtn.onclick  = onToggleView;
    this.viewBtn.disabled = false;
  }

  // ── Game state display ────────────────────────────────────────────────────

  update(gs) {
    const name = gs.currentTurn === COLOR.WHITE ? 'White' : 'Black';
    this.turnDisplay.textContent = `${name}'s Turn`;
    this.turnDisplay.className = gs.currentTurn === COLOR.BLACK ? 'black-turn' : '';
    this.statusDisplay.textContent = gs.status === 'check'
      ? `⚠ ${name} is in CHECK!` : '';
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

  /** Show one lobby panel ('mode' | 'host' | 'join'), hide the others. */
  showLobby(panel) {
    document.getElementById('lobby-overlay').classList.remove('hidden');
    for (const p of ['mode', 'host', 'join']) {
      document.getElementById(`lobby-${p}`)
        .classList.toggle('hidden', p !== panel);
    }
  }

  hideLobby() {
    document.getElementById('lobby-overlay').classList.add('hidden');
  }
}
