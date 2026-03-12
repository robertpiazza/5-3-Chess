import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GameState, COLOR } from './gameState.js';
import { Board } from './board.js';
import { PieceManager } from './pieces.js';
import { InputHandler } from './inputHandler.js';
import { UI } from './ui.js';

// ── Scene Setup ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 30, 60);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8, 14, 12);
camera.lookAt(0, 4, 0);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xfff8e8, 1.2);
dirLight.position.set(6, 16, 8);
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0xa8d8ea, 0.4);
fillLight.position.set(-8, 4, -6);
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

function initGame(keepViewMode = false) {
  const prevMode = board ? board.viewMode : 'layers';

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

  ui = new UI(() => initGame(true), switchViewMode);
  ui.hideGameOver();
  ui.update(gameState);
  ui.setViewLabel(board.viewMode);

  inputHandler = new InputHandler(camera, renderer, gameState, board, pieceManager, ui);
}

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

initGame();

// ── Render Loop ───────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ── Resize Handler ────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
