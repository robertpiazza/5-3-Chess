import { COLOR } from './gameState.js';

export class UI {
  constructor(onNewGame, onToggleView) {
    this.turnDisplay   = document.getElementById('turn-display');
    this.statusDisplay = document.getElementById('status-display');
    this.overlay       = document.getElementById('game-over-overlay');
    this.resultText    = document.getElementById('game-over-result');
    this.viewBtn       = document.getElementById('view-toggle-btn');

    const newGameBtn = document.getElementById('new-game-btn');
    newGameBtn.addEventListener('click', onNewGame);
    newGameBtn.disabled = false;

    document.getElementById('play-again-btn').addEventListener('click', onNewGame);

    this.viewBtn.addEventListener('click', onToggleView);
    this.viewBtn.disabled = false;
  }

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
}
