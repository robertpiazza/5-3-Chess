import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GameState, COLOR } from './gameState.js';
import { Board } from './board.js';
import { PieceManager, loadAllModels } from './pieces.js';
import { InputHandler } from './inputHandler.js';
import { UI } from './ui.js';
import { NetworkManager } from './network.js';
import { isInCheck, hasAnyLegalMove } from './moveValidator.js';

// ── Scene Setup ───────────────────────────────────────────────────────────────

const BG_COLOR = 0xc8a87a; // warm light brown

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);
scene.fog = new THREE.Fog(BG_COLOR, 30, 60);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8, 14, 12);
camera.lookAt(0, 4, 0);

// Lights — low ambient so directional lights carve out 3D form
scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.6); // strong key from the side
dirLight.position.set(10, 8, 2);                            // side-angled, not overhead
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
fillLight.position.set(-6, 10, -4);                         // softer fill from opposite side
scene.add(fillLight);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = 6;
controls.maxDistance = 40;
controls.enablePan = false;
controls.target.set(0, 4, 0);
controls.update();

// ── Game State & Modules ──────────────────────────────────────────────────────

let gameState, board, pieceManager, inputHandler, ui;

// Active network connection (null in local play)
let activeNetwork = null;

/**
 * @param {boolean}     keepViewMode  Preserve current board view (layers/cube)
 * @param {object|null} netOpts       { network: NetworkManager, localColor: string }
 */
function initGame(keepViewMode = false, netOpts = null) {
  const prevMode = board ? board.viewMode : 'layers';

  // Disconnect any previous network session
  if (activeNetwork) {
    activeNetwork.detach();
    activeNetwork = null;
  }
  if (netOpts) activeNetwork = netOpts.network;

  // Remove all non-light scene objects
  const toRemove = [];
  scene.traverse(obj => {
    if (obj !== scene && !(obj instanceof THREE.Light)) toRemove.push(obj);
  });
  toRemove.forEach(obj => scene.remove(obj));

  gameState    = new GameState();
  board        = new Board(scene);
  pieceManager = new PieceManager(scene, gameState, board);

  if (keepViewMode && prevMode === 'cube') {
    board.setViewMode('cube');
    pieceManager.syncFromState();
    _applyCameraForMode('cube');
  } else {
    pieceManager.syncFromState();
  }

  // "New Game" / "Play Again" always returns to local pass-and-play
  const onNewGame = () => initGame(true);

  ui = new UI(onNewGame, switchViewMode);
  ui.hideGameOver();
  ui.update(gameState);
  ui.setViewLabel(board.viewMode);

  if (netOpts) {
    ui.showColorIndicator(netOpts.localColor);
  } else {
    ui.hideColorIndicator();
  }

  const sendMove = netOpts
    ? (src, dst, pt) => activeNetwork && activeNetwork.sendMove(src, dst, pt)
    : null;

  inputHandler = new InputHandler(
    camera, renderer, gameState, board, pieceManager, ui,
    netOpts?.localColor ?? null,
    sendMove,
  );
}

// ── Apply an opponent's move received from Firebase ───────────────────────────

function applyNetworkMove(src, dst, promotionType) {
  pieceManager.moveMesh(src, dst);
  gameState.executeMove(src, dst, promotionType);
  if (promotionType) pieceManager.refreshCell(dst.x, dst.y, dst.z);

  board.showHighlights(null, []);

  // Evaluate the new position (same logic as InputHandler._updateGameStatus)
  const color   = gameState.currentTurn;
  const inCheck = isInCheck(gameState.board, color);
  const anyMove = hasAnyLegalMove(gameState.board, color);

  if (!anyMove) {
    gameState.status = inCheck ? 'checkmate' : 'stalemate';
    ui.showGameOver(gameState.status, color);
  } else {
    gameState.status = inCheck ? 'check' : 'playing';
  }

  ui.update(gameState);
}

// ── View mode switch ──────────────────────────────────────────────────────────

function switchViewMode() {
  const next = board.viewMode === 'layers' ? 'cube' : 'layers';

  // Clear any active selection before switching
  gameState.selectedPos = null;
  gameState.legalMoves  = [];

  // Move the orbit pivot to the new mode's center while preserving the camera
  // angle and distance (shift camera by the same delta as the target change).
  const newTarget = next === 'cube'
    ? new THREE.Vector3(0, 0, 0)
    : new THREE.Vector3(0, 4, 0);
  const delta = newTarget.clone().sub(controls.target);
  controls.target.copy(newTarget);
  camera.position.add(delta);
  controls.update();

  board.setViewMode(next);
  pieceManager.syncFromState();   // rebuild pieces at new positions / scale
  ui.setViewLabel(next);
}

function _applyCameraForMode(mode) {
  if (mode === 'cube') {
    camera.position.set(9, 9, 9);
    controls.target.set(0, 0, 0);
  } else {
    camera.position.set(8, 14, 12);
    controls.target.set(0, 4, 0);
  }
  controls.update();
}

// ── Lobby wiring ──────────────────────────────────────────────────────────────

function _setupLobby() {
  // ── Create Game (host) ──────────────────────────────────────────────────
  document.getElementById('btn-create').addEventListener('click', async () => {
    const network = new NetworkManager(COLOR.WHITE);
    let code;
    try {
      code = await network.createGame();
    } catch (err) {
      console.error('Failed to create game:', err);
      return;
    }

    document.getElementById('room-code-display').textContent = code;
    ui.showLobby('host');

    network.onOpponentJoined(() => {
      ui.hideLobby();
      initGame(false, { network, localColor: COLOR.WHITE });
      network.startListening((src, dst, promotionType) => {
        applyNetworkMove(src, dst, promotionType);
      });
    });
  });

  // ── Copy code button ────────────────────────────────────────────────────
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('room-code-display').textContent;
    navigator.clipboard.writeText(code).catch(() => {
      // Clipboard API unavailable (e.g. non-HTTPS) — silently ignore
    });
  });

  // ── Show join panel ─────────────────────────────────────────────────────
  document.getElementById('btn-join-panel').addEventListener('click', () => {
    document.getElementById('join-error').classList.add('hidden');
    document.getElementById('room-code-input').value = '';
    ui.showLobby('join');
  });

  // ── Join Game (guest) ───────────────────────────────────────────────────
  document.getElementById('btn-join').addEventListener('click', async () => {
    const raw  = document.getElementById('room-code-input').value;
    const code = raw.toUpperCase().trim();
    document.getElementById('join-error').classList.add('hidden');

    if (code.length !== 6) {
      document.getElementById('join-error').classList.remove('hidden');
      return;
    }

    const network = new NetworkManager(COLOR.BLACK);
    try {
      await network.joinGame(code);
    } catch (err) {
      document.getElementById('join-error').classList.remove('hidden');
      return;
    }

    ui.hideLobby();
    initGame(false, { network, localColor: COLOR.BLACK });
    network.startListening((src, dst, promotionType) => {
      applyNetworkMove(src, dst, promotionType);
    });
  });

  // Allow pressing Enter in the code input
  document.getElementById('room-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join').click();
  });

  // ── Local play ──────────────────────────────────────────────────────────
  document.getElementById('btn-local').addEventListener('click', () => {
    ui.hideLobby();
    initGame();
  });

  // ── Back buttons ────────────────────────────────────────────────────────
  document.getElementById('btn-back-host').addEventListener('click', () => {
    if (activeNetwork) { activeNetwork.detach(); activeNetwork = null; }
    ui.showLobby('mode');
  });

  document.getElementById('btn-back-join').addEventListener('click', () => {
    document.getElementById('join-error').classList.add('hidden');
    ui.showLobby('mode');
  });
}

// ── Startup: load models then open lobby ──────────────────────────────────────

loadAllModels()
  .then(() => {
    animate();

    // Hide the loading text and enable lobby buttons
    document.getElementById('lobby-loading').style.display = 'none';
    for (const id of ['btn-create', 'btn-join-panel', 'btn-local']) {
      document.getElementById(id).disabled = false;
    }

    // Create a lightweight UI for lobby-level show/hide (no game callbacks yet)
    // The real UI instance is created inside initGame().
    const _lobbyUi = {
      showLobby: panel => {
        document.getElementById('lobby-overlay').classList.remove('hidden');
        for (const p of ['mode', 'host', 'join'])
          document.getElementById(`lobby-${p}`).classList.toggle('hidden', p !== panel);
      },
      hideLobby: () => document.getElementById('lobby-overlay').classList.add('hidden'),
    };
    // Expose showLobby/hideLobby on a temporary object used by _setupLobby before
    // the first initGame() call.  After initGame() runs, `ui` takes over.
    ui = _lobbyUi;

    _setupLobby();
  })
  .catch(err => {
    console.error('Model load failed:', err);
    document.getElementById('lobby-loading').textContent = 'Load error — check console';
  });

// ── Render Loop ───────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ── Resize Handler ────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
