import * as THREE from 'three';
import { PIECE, COLOR } from './gameState.js';

// Piece body/accent materials
const BODY_MAT = {
  [COLOR.WHITE]: new THREE.MeshLambertMaterial({ color: 0xf0e6d3 }),
  [COLOR.BLACK]: new THREE.MeshLambertMaterial({ color: 0x2c2c3a }),
};

const ACCENT_COLOR = {
  [PIECE.ROOK]:    0xe07b39,
  [PIECE.BISHOP]:  0x9b59b6,
  [PIECE.KNIGHT]:  0x27ae60,
  [PIECE.QUEEN]:   0xf1c40f,
  [PIECE.KING]:    0xe74c3c,
  [PIECE.UNICORN]: 0x1abc9c,
  [PIECE.PAWN]:    0x95a5a6,
};

function makeBody(pieceType, color) {
  const group = new THREE.Group();
  const bodyMat   = BODY_MAT[color].clone();
  const accentMat = new THREE.MeshLambertMaterial({ color: ACCENT_COLOR[pieceType] });

  let base, top;

  switch (pieceType) {
    case PIECE.PAWN: {
      base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.28, 12), bodyMat);
      base.position.y = 0.14;
      top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), accentMat);
      top.position.y = 0.44;
      break;
    }
    case PIECE.ROOK: {
      base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.38, 12), bodyMat);
      base.position.y = 0.19;
      top = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.28), accentMat);
      top.position.y = 0.49;
      break;
    }
    case PIECE.KNIGHT: {
      base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.36, 12), bodyMat);
      base.position.y = 0.18;
      top = new THREE.Mesh(new THREE.TetrahedronGeometry(0.18), accentMat);
      top.position.y = 0.52;
      break;
    }
    case PIECE.BISHOP: {
      base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.4, 12), bodyMat);
      base.position.y = 0.20;
      top = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 12), accentMat);
      top.position.y = 0.58;
      break;
    }
    case PIECE.UNICORN: {
      base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.38, 12), bodyMat);
      base.position.y = 0.19;
      top = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 8), accentMat);
      top.position.y = 0.66;
      break;
    }
    case PIECE.QUEEN: {
      base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.44, 12), bodyMat);
      base.position.y = 0.22;
      top = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), accentMat);
      top.position.y = 0.62;
      break;
    }
    case PIECE.KING: {
      base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.44, 12), bodyMat);
      base.position.y = 0.22;
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.11), accentMat);
      crossH.position.y = 0.65;
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.11), accentMat);
      crossV.position.y = 0.65;
      group.add(crossH, crossV);
      top = null;
      break;
    }
    default: {
      base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.35, 12), bodyMat);
      base.position.y = 0.175;
      top = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), accentMat);
      top.position.y = 0.44;
    }
  }

  group.add(base);
  if (top) group.add(top);
  return group;
}

export class PieceManager {
  // board is required so piece positions stay in sync with the current view mode
  constructor(scene, gameState, board) {
    this.scene     = scene;
    this.gameState = gameState;
    this.board     = board;
    this.meshMap   = new Map(); // key `${x},${y},${z}` → THREE.Group
  }

  key(x, y, z) { return `${x},${y},${z}`; }

  // Build meshes from the current board state (clears old meshes first)
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
    const group = makeBody(cell.type, cell.color);
    group.position.copy(this.board.cellPosition(x, y, z));
    group.scale.setScalar(this.board.pieceScale);
    group.userData = { boardX: x, boardY: y, boardZ: z, isPiece: true, pieceColor: cell.color };
    this.scene.add(group);
    this.meshMap.set(this.key(x, y, z), group);
  }

  // Move mesh from src to dst, removing any captured piece mesh
  moveMesh(src, dst) {
    const srcKey = this.key(src.x, src.y, src.z);
    const dstKey = this.key(dst.x, dst.y, dst.z);

    if (this.meshMap.has(dstKey)) {
      this.scene.remove(this.meshMap.get(dstKey));
      this.meshMap.delete(dstKey);
    }

    const mesh = this.meshMap.get(srcKey);
    if (!mesh) return;

    mesh.position.copy(this.board.cellPosition(dst.x, dst.y, dst.z));
    mesh.userData.boardX = dst.x;
    mesh.userData.boardY = dst.y;
    mesh.userData.boardZ = dst.z;

    this.meshMap.delete(srcKey);
    this.meshMap.set(dstKey, mesh);
  }

  // Rebuild a single cell's mesh (used after pawn promotion)
  refreshCell(x, y, z) {
    const k = this.key(x, y, z);
    if (this.meshMap.has(k)) {
      this.scene.remove(this.meshMap.get(k));
      this.meshMap.delete(k);
    }
    const cell = this.gameState.get(x, y, z);
    if (cell) this._spawnMesh(x, y, z, cell);
  }

  // All child Mesh objects across all piece groups (for raycasting)
  getPieceMeshes() {
    const result = [];
    for (const group of this.meshMap.values())
      group.traverse(child => { if (child.isMesh) result.push(child); });
    return result;
  }

  // Walk up from a raycasted child mesh to find board coords on the parent group
  getGroupCoords(mesh) {
    let obj = mesh;
    while (obj && !obj.userData.isPiece) obj = obj.parent;
    if (!obj) return null;
    return { x: obj.userData.boardX, y: obj.userData.boardY, z: obj.userData.boardZ };
  }
}
