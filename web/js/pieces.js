import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PIECE, COLOR } from './gameState.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BODY_COLOR = {
  [COLOR.WHITE]: 0xfaf4e8,   // brighter ivory
  [COLOR.BLACK]: 0x1a1a28,   // darker ebony
};

// Phong material parameters per team — strong specular makes 3D shape visible
const BODY_MAT_PARAMS = {
  [COLOR.WHITE]: { specular: 0xffffff, shininess: 100 },
  [COLOR.BLACK]: { specular: 0xaaaaaa, shininess: 70 },
};

const UNICORN_HORN_COLOR = 0x1abc9c;

// King height in world units — all other pieces scale proportionally
const TARGET_HEIGHT = 1.50;   // king = 9.5 cm → 1.50 world units

// Standard piece heights in cm (real-world proportions)
const PIECE_HEIGHT_CM = {
  king:   9.5,
  queen:  8.5,
  bishop: 7.0,
  knight: 6.0,   // unicorn body matches this
  rook:   5.5,
  pawn:   5.0,
};

// Convert to world units (king anchors the scale)
const PIECE_TARGET_HEIGHT = Object.fromEntries(
  Object.entries(PIECE_HEIGHT_CM).map(([k, cm]) => [k, TARGET_HEIGHT * cm / 9.5])
);

// ── Model cache ───────────────────────────────────────────────────────────────

// Loaded + pivot-normalised template Groups, keyed by file name
const _templates = {};

// Piece type → GLB file name ('knight' is reused as the unicorn base)
const PIECE_FILE = {
  [PIECE.KING]:    'king',
  [PIECE.QUEEN]:   'queen',
  [PIECE.ROOK]:    'rook',
  [PIECE.BISHOP]:  'bishop',
  [PIECE.KNIGHT]:  'knight',
  [PIECE.UNICORN]: 'knight',
  [PIECE.PAWN]:    'pawn',
};

// ── Public: preload all GLB files ─────────────────────────────────────────────

export async function loadAllModels() {
  const loader = new GLTFLoader();
  const fileNames = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

  await Promise.all(fileNames.map(name =>
    new Promise((resolve, reject) => {
      loader.load(
        `./models/${name}.glb`,
        gltf => { _templates[name] = _normalize(gltf.scene, PIECE_TARGET_HEIGHT[name]); resolve(); },
        undefined,
        err  => { console.error(`Failed to load ${name}.glb`, err); reject(err); }
      );
    })
  ));
}

// ── Internal: normalise a raw GLTF scene to a standard height & pivot ────────

function _normalize(scene, targetHeight) {
  // 1. Uniform scale so the model's Y-extent equals targetHeight
  const box1 = new THREE.Box3().setFromObject(scene);
  const height = box1.getSize(new THREE.Vector3()).y;
  scene.scale.setScalar(targetHeight / height);

  // 2. Re-measure after scaling
  scene.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(scene);
  const center = box2.getCenter(new THREE.Vector3());

  // 3. Wrap in a Group whose local origin is at the base-center of the model.
  //    This makes positioning trivial: group.position = board cell position.
  const wrapper = new THREE.Group();
  scene.position.set(-center.x, -box2.min.y, -center.z);
  wrapper.add(scene);
  return wrapper;
}

// ── Internal: build a coloured piece Group from the cached template ───────────

function _makeBody(pieceType, color) {
  const template = _templates[PIECE_FILE[pieceType]];
  if (!template) {
    console.warn(`Model template not loaded for piece type: ${pieceType}`);
    return new THREE.Group();
  }

  // Deep-clone so each piece instance is independent
  const group = template.clone(true);

  // Replace all mesh materials with Phong (specular highlights = visible 3D shape)
  const { specular, shininess } = BODY_MAT_PARAMS[color];
  group.traverse(child => {
    if (child.isMesh) {
      // Ensure smooth normals exist — some GLB exports lack them
      if (child.geometry && !child.geometry.getAttribute('normal')) {
        child.geometry.computeVertexNormals();
      }
      child.material = new THREE.MeshPhongMaterial({
        color: BODY_COLOR[color],
        specular,
        shininess,
      });
    }
  });

  // Knights and Unicorns face their opponent:
  //   White (+90° Y = CCW from above), Black (−90° Y = CW from above)
  if (pieceType === PIECE.KNIGHT || pieceType === PIECE.UNICORN) {
    group.rotation.y = color === COLOR.WHITE ? Math.PI / 2 : -Math.PI / 2;
  }

  // Unicorn: graft a teal horn onto the knight's head
  if (pieceType === PIECE.UNICORN) {
    // The unicorn body uses the knight model scaled to knight height (6.0 cm).
    // Horn geometry/position were originally tuned at TARGET_HEIGHT (9.5 cm scale).
    // Scale them down by the same ratio so they stay proportional.
    const hornScale = PIECE_HEIGHT_CM.knight / 9.5;  // 6.0 / 9.5
    const hornMat = new THREE.MeshPhongMaterial({ color: UNICORN_HORN_COLOR, specular: 0x999999, shininess: 90 });
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.05 * hornScale, 0.21 * hornScale, 8),
      hornMat
    );
    horn.position.set(-0.06 * hornScale, 0.69 * hornScale, 0.00);
    horn.rotation.set(0.00, 0.00, 0.80);
    group.add(horn);
  }

  return group;
}

// ── PieceManager ──────────────────────────────────────────────────────────────

export class PieceManager {
  constructor(scene, gameState, board) {
    this.scene       = scene;
    this.gameState   = gameState;
    this.board       = board;
    this.meshMap     = new Map(); // `${x},${y},${z}` → THREE.Group
    this._animations = [];        // active move animations
    this.isAnimating = false;     // true while any piece is in flight
  }

  key(x, y, z) { return `${x},${y},${z}`; }

  syncFromState() {
    for (const mesh of this.meshMap.values()) this.scene.remove(mesh);
    this.meshMap.clear();

    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        for (let z = 0; z < 5; z++) {
          const cell = this.gameState.get(x, y, z);
          if (cell) this._spawnMesh(x, y, z, cell);
        }
  }

  _spawnMesh(x, y, z, cell) {
    const group = _makeBody(cell.type, cell.color);
    group.position.copy(this.board.cellPosition(x, y, z));
    group.scale.setScalar(this.board.pieceScale);
    group.userData = { boardX: x, boardY: y, boardZ: z, isPiece: true, pieceColor: cell.color };
    this.scene.add(group);
    this.meshMap.set(this.key(x, y, z), group);
  }

  /**
   * Animate a piece from src to dst along an arc.
   * Returns a Promise that resolves when the animation completes.
   * The meshMap is updated immediately so game-logic stays consistent.
   */
  moveMesh(src, dst) {
    const srcKey = this.key(src.x, src.y, src.z);
    const dstKey = this.key(dst.x, dst.y, dst.z);

    // Remove captured piece immediately
    if (this.meshMap.has(dstKey)) {
      this.scene.remove(this.meshMap.get(dstKey));
      this.meshMap.delete(dstKey);
    }

    const mesh = this.meshMap.get(srcKey);
    if (!mesh) return Promise.resolve();

    // Update the map right away so board logic is always correct
    mesh.userData.boardX = dst.x;
    mesh.userData.boardY = dst.y;
    mesh.userData.boardZ = dst.z;
    this.meshMap.delete(srcKey);
    this.meshMap.set(dstKey, mesh);

    // Build arc: quadratic bezier with an elevated midpoint
    const from = mesh.position.clone();
    const to   = this.board.cellPosition(dst.x, dst.y, dst.z);
    const dist = from.distanceTo(to);
    const mid  = new THREE.Vector3().lerpVectors(from, to, 0.5);
    mid.y += Math.max(1.0, dist * 0.4); // arc height scales with distance

    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);

    this.isAnimating = true;
    return new Promise(resolve => {
      this._animations.push({ mesh, curve, duration: 0.35, elapsed: 0, resolve });
    });
  }

  /**
   * Advance all active animations. Call once per frame with the frame delta (seconds).
   */
  tick(delta) {
    if (this._animations.length === 0) return;

    this._animations = this._animations.filter(anim => {
      anim.elapsed += delta;
      const t  = Math.min(anim.elapsed / anim.duration, 1.0);
      // Smoothstep easing: slow start, fast middle, slow finish
      const ts = t * t * (3 - 2 * t);

      anim.mesh.position.copy(anim.curve.getPoint(ts));

      if (t >= 1.0) {
        anim.resolve();
        return false; // remove completed animation
      }
      return true;
    });

    this.isAnimating = this._animations.length > 0;
  }

  refreshCell(x, y, z) {
    const k = this.key(x, y, z);
    if (this.meshMap.has(k)) {
      this.scene.remove(this.meshMap.get(k));
      this.meshMap.delete(k);
    }
    const cell = this.gameState.get(x, y, z);
    if (cell) this._spawnMesh(x, y, z, cell);
  }

  getPieceMeshes() {
    const result = [];
    for (const group of this.meshMap.values())
      group.traverse(child => { if (child.isMesh) result.push(child); });
    return result;
  }

  getGroupCoords(mesh) {
    let obj = mesh;
    while (obj && !obj.userData.isPiece) obj = obj.parent;
    if (!obj) return null;
    return { x: obj.userData.boardX, y: obj.userData.boardY, z: obj.userData.boardZ };
  }
}
