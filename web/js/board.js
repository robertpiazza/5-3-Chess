import * as THREE from 'three';

// Layer-view constants (exported for any consumers that still need them)
export const SQUARE_SIZE = 1.0;
export const LAYER_GAP = 1.65;
export const BOARD_OFFSET = -2;

// Cube-view constants
const CUBE_SPACING = 1.2; // center-to-center distance between small cubes
const CUBE_SIZE    = 1.0; // visual edge length of each small cube

const COLOR_LIGHT     = new THREE.Color(0xd4b896);
const COLOR_DARK      = new THREE.Color(0x7a5c3a);
const COLOR_HIGHLIGHT = new THREE.Color(0x44dd88);
const COLOR_SELECTED  = new THREE.Color(0xffcc00);

export class Board {
  constructor(scene) {
    this.scene = scene;
    this.viewMode = 'layers'; // 'layers' | 'cube'
    this._ownedObjects = [];  // everything added to scene by the board
    this.squareMeshes = [];   // layers mode: [z][x][y]
    this.cubeMeshes   = [];   // cube mode: flat array
    this.highlightMeshes = [];
    this._buildLayers();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  setViewMode(mode) {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    this._destroyBoard();
    if (mode === 'layers') this._buildLayers();
    else this._buildCube();
    this.clearHighlights();
  }

  // Scale factor pieces should use in the current view
  get pieceScale() {
    return this.viewMode === 'layers' ? 1.0 : 0.83;
  }

  // World position where a piece's base should be placed
  cellPosition(x, y, z) {
    if (this.viewMode === 'layers') {
      return new THREE.Vector3(
        x * SQUARE_SIZE + BOARD_OFFSET,
        z * LAYER_GAP + 0.12,
        y * SQUARE_SIZE + BOARD_OFFSET
      );
    }
    // Cube mode: sit piece slightly below cube centre so it looks grounded inside
    return new THREE.Vector3(
      (x - 2) * CUBE_SPACING,
      (z - 2) * CUBE_SPACING - 0.25,
      (y - 2) * CUBE_SPACING
    );
  }

  clearHighlights() {
    for (const m of this.highlightMeshes) this.scene.remove(m);
    this.highlightMeshes = [];
  }

  showHighlights(selectedPos, legalMoves) {
    this.clearHighlights();
    if (this.viewMode === 'layers') {
      this._showHighlightsLayers(selectedPos, legalMoves);
    } else {
      this._showHighlightsCube(selectedPos, legalMoves);
    }
  }

  // Returns clickable meshes for raycasting
  getSquareMeshes() {
    if (this.viewMode === 'layers') {
      const out = [];
      for (let z = 0; z < 5; z++)
        for (let x = 0; x < 5; x++)
          for (let y = 0; y < 5; y++)
            out.push(this.squareMeshes[z][x][y]);
      return out;
    }
    return this.cubeMeshes;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  _add(obj) {
    this.scene.add(obj);
    this._ownedObjects.push(obj);
    return obj;
  }

  _destroyBoard() {
    for (const obj of this._ownedObjects) this.scene.remove(obj);
    this._ownedObjects = [];
    this.squareMeshes = [];
    this.cubeMeshes   = [];
  }

  // Exact centre of a cube cell (for highlight positioning)
  _cubeCenter(x, y, z) {
    return new THREE.Vector3(
      (x - 2) * CUBE_SPACING,
      (z - 2) * CUBE_SPACING,
      (y - 2) * CUBE_SPACING
    );
  }

  // ── Layer view ───────────────────────────────────────────────────────────────

  _buildLayers() {
    const geo = new THREE.BoxGeometry(SQUARE_SIZE, 0.12, SQUARE_SIZE);

    for (let z = 0; z < 5; z++) {
      this.squareMeshes[z] = [];
      for (let x = 0; x < 5; x++) {
        this.squareMeshes[z][x] = [];
        for (let y = 0; y < 5; y++) {
          const isLight = (x + y + z) % 2 === 0;
          const mat = new THREE.MeshLambertMaterial({ color: isLight ? COLOR_LIGHT : COLOR_DARK });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(
            x * SQUARE_SIZE + BOARD_OFFSET,
            z * LAYER_GAP,
            y * SQUARE_SIZE + BOARD_OFFSET
          );
          mesh.userData = { boardX: x, boardY: y, boardZ: z, isSquare: true };
          this._add(mesh);
          this.squareMeshes[z][x][y] = mesh;
        }
      }
    }

    this._addGridLines();
  }

  _addGridLines() {
    const mat = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });
    for (let z = 0; z < 5; z++) {
      const wy = z * LAYER_GAP;
      const min = BOARD_OFFSET - SQUARE_SIZE / 2;
      const max = BOARD_OFFSET + 4 * SQUARE_SIZE + SQUARE_SIZE / 2;
      for (let i = 0; i <= 5; i++) {
        const p = BOARD_OFFSET + i * SQUARE_SIZE - SQUARE_SIZE / 2;
        const geo1 = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(min, wy + 0.07, p), new THREE.Vector3(max, wy + 0.07, p),
        ]);
        this._add(new THREE.Line(geo1, mat));
        const geo2 = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p, wy + 0.07, min), new THREE.Vector3(p, wy + 0.07, max),
        ]);
        this._add(new THREE.Line(geo2, mat));
      }
    }
  }

  _showHighlightsLayers(selectedPos, legalMoves) {
    const ringGeo = new THREE.RingGeometry(0.28, 0.44, 24);
    ringGeo.rotateX(-Math.PI / 2);

    if (selectedPos) {
      const mat = new THREE.MeshBasicMaterial({ color: COLOR_SELECTED, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, mat);
      const pos = this.cellPosition(selectedPos.x, selectedPos.y, selectedPos.z);
      ring.position.copy(pos).setY(pos.y + 0.01);
      this.scene.add(ring);
      this.highlightMeshes.push(ring);
    }

    for (const mv of legalMoves) {
      const mat = new THREE.MeshBasicMaterial({ color: COLOR_HIGHLIGHT, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
      const dot = new THREE.Mesh(ringGeo, mat);
      const pos = this.cellPosition(mv.x, mv.y, mv.z);
      dot.position.copy(pos).setY(pos.y + 0.01);
      this.scene.add(dot);
      this.highlightMeshes.push(dot);
    }
  }

  // ── Cube view ────────────────────────────────────────────────────────────────

  _buildCube() {
    const geo     = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    const edgesGeo = new THREE.EdgesGeometry(geo);

    for (let z = 0; z < 5; z++) {
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          const isLight = (x + y + z) % 2 === 0;
          const centre = this._cubeCenter(x, y, z);

          // Translucent face mesh (raycasting target)
          const mat = new THREE.MeshLambertMaterial({
            color: isLight ? 0xc8a876 : 0x5a4020,
            transparent: true,
            opacity: 0.10,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(centre);
          mesh.userData = { boardX: x, boardY: y, boardZ: z, isSquare: true };
          this._add(mesh);
          this.cubeMeshes.push(mesh);

          // Wireframe edges
          const edgeMat = new THREE.LineBasicMaterial({
            color: isLight ? 0x7799cc : 0x334455,
            transparent: true,
            opacity: 0.35,
          });
          const edges = new THREE.LineSegments(edgesGeo, edgeMat);
          edges.position.copy(centre);
          this._add(edges);
        }
      }
    }
  }

  _showHighlightsCube(selectedPos, legalMoves) {
    const hl = CUBE_SIZE * 1.06;
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(hl, hl, hl));

    if (selectedPos) {
      const box = new THREE.LineSegments(hlGeo,
        new THREE.LineBasicMaterial({ color: COLOR_SELECTED }));
      box.position.copy(this._cubeCenter(selectedPos.x, selectedPos.y, selectedPos.z));
      this.scene.add(box);
      this.highlightMeshes.push(box);
    }

    for (const mv of legalMoves) {
      const box = new THREE.LineSegments(hlGeo,
        new THREE.LineBasicMaterial({ color: COLOR_HIGHLIGHT }));
      box.position.copy(this._cubeCenter(mv.x, mv.y, mv.z));
      this.scene.add(box);
      this.highlightMeshes.push(box);
    }
  }
}
