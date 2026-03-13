import * as THREE from 'three';

// Layer-view constants (exported for any consumers that still need them)
export const SQUARE_SIZE = 1.0;
export const LAYER_GAP = 1.65;
export const BOARD_OFFSET = -2;

// Cube-view constants
const CUBE_SPACING = 1.2; // center-to-center distance between small cubes
const CUBE_SIZE    = 1.0; // visual edge length of each small cube

const COLOR_LIGHT      = new THREE.Color(0xd4b896);
const COLOR_DARK       = new THREE.Color(0x7a5c3a);
const COLOR_HIGHLIGHT  = new THREE.Color(0x44dd88);
const COLOR_THREAT     = new THREE.Color(0xff4422);  // red   — attacked square
const COLOR_SELECTED   = new THREE.Color(0xffcc00);
const COLOR_HINT_SRC   = new THREE.Color(0x00ccff);  // cyan  — piece to move
const COLOR_HINT_DST   = new THREE.Color(0xff8800);  // orange — destination
const COLOR_LAST_MOVE  = new THREE.Color(0xc8a820);  // amber — last move src/dst

export class Board {
  constructor(scene) {
    this.scene = scene;
    this.viewMode = 'layers'; // 'layers' | 'cube'
    this._ownedObjects = [];  // everything added to scene by the board
    this.squareMeshes = [];   // layers mode: [z][x][y]
    this.cubeMeshes   = [];   // cube mode: flat array
    this.highlightMeshes  = [];
    this.hintMeshes       = [];
    this.lastMoveMeshes   = [];
    this._lastMoveSrc     = null;
    this._lastMoveDst     = null;
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
    this.clearHintHighlight();
    // Rebuild last-move indicator in the new view style.
    // showLastMove() removes the old meshes from the scene before adding new
    // ones — don't pre-clear lastMoveMeshes or those scene.remove() calls
    // will iterate an empty array and the old geometry will stay rendered.
    const s = this._lastMoveSrc, d = this._lastMoveDst;
    if (s && d) this.showLastMove(s, d);
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

  clearHintHighlight() {
    for (const m of this.hintMeshes) this.scene.remove(m);
    this.hintMeshes = [];
  }

  /** Highlight the two squares involved in the last move (amber tint). */
  showLastMove(src, dst) {
    for (const m of this.lastMoveMeshes) this.scene.remove(m);
    this.lastMoveMeshes  = [];
    this._lastMoveSrc    = src;
    this._lastMoveDst    = dst;
    if (!src || !dst) return;
    if (this.viewMode === 'layers') {
      this._addLastMovePlane(src);
      this._addLastMovePlane(dst);
    } else {
      this._addLastMoveBox(src);
      this._addLastMoveBox(dst);
    }
  }

  clearLastMove() {
    this.showLastMove(null, null);
  }

  /** Show a hint move (cyan = piece to move, orange = destination). */
  showHintHighlight(src, dst) {
    this.clearHintHighlight();
    if (this.viewMode === 'layers') {
      this._addHintDisc(src, COLOR_HINT_SRC);
      this._addHintDisc(dst, COLOR_HINT_DST);
    } else {
      this._addHintBox(src, COLOR_HINT_SRC);
      this._addHintBox(dst, COLOR_HINT_DST);
    }
  }

  showHighlights(selectedPos, legalMoves, threatMap = null) {
    this.clearHighlights();
    if (this.viewMode === 'layers') {
      this._showHighlightsLayers(selectedPos, legalMoves, threatMap);
    } else {
      this._showHighlightsCube(selectedPos, legalMoves, threatMap);
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

  _addHintDisc(pos, color) {
    // Filled disc so the orange is visible inside the legal-move ring and
    // partially visible beneath pieces.  Placed 0.01 above the move ring (y+0.02).
    const geo = new THREE.CircleGeometry(0.48, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.60, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(geo, mat);
    const p = this.cellPosition(pos.x, pos.y, pos.z);
    disc.position.copy(p).setY(p.y + 0.02);
    this.scene.add(disc);
    this.hintMeshes.push(disc);
  }

  _addHintBox(pos, color) {
    const hl  = CUBE_SIZE * 1.10;
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(hl, hl, hl)),
      new THREE.LineBasicMaterial({ color, linewidth: 2 })
    );
    box.position.copy(this._cubeCenter(pos.x, pos.y, pos.z));
    this.scene.add(box);
    this.hintMeshes.push(box);
  }

  _addLastMovePlane(pos) {
    const geo = new THREE.PlaneGeometry(SQUARE_SIZE * 0.94, SQUARE_SIZE * 0.94);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: COLOR_LAST_MOVE, transparent: true, opacity: 0.40, side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(geo, mat);
    const p = this.cellPosition(pos.x, pos.y, pos.z);
    plane.position.copy(p).setY(p.y + 0.005);
    this.scene.add(plane);
    this.lastMoveMeshes.push(plane);
  }

  _addLastMoveBox(pos) {
    const hl  = CUBE_SIZE * 1.08;
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(hl, hl, hl)),
      new THREE.LineBasicMaterial({ color: COLOR_LAST_MOVE, linewidth: 2 }),
    );
    box.position.copy(this._cubeCenter(pos.x, pos.y, pos.z));
    this.scene.add(box);
    this.lastMoveMeshes.push(box);
  }

  _showHighlightsLayers(selectedPos, legalMoves, threatMap = null) {
    if (selectedPos) {
      const geo = new THREE.RingGeometry(0.28, 0.44, 24);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: COLOR_SELECTED, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(geo, mat);
      const pos = this.cellPosition(selectedPos.x, selectedPos.y, selectedPos.z);
      ring.position.copy(pos).setY(pos.y + 0.01);
      this.scene.add(ring);
      this.highlightMeshes.push(ring);
    }

    for (const mv of legalMoves) {
      const key = `${mv.x},${mv.y},${mv.z}`;
      const threat = threatMap?.get(key) ?? { greenScore: 0, redScore: 0 };
      const total = threat.greenScore + threat.redScore;
      const pos = this.cellPosition(mv.x, mv.y, mv.z);
      const yPos = pos.y + 0.01;

      if (total === 0 || threat.redScore === 0) {
        // Safe square — solid green ring
        const geo = new THREE.RingGeometry(0.28, 0.44, 24);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: COLOR_HIGHLIGHT, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(geo, mat);
        ring.position.copy(pos).setY(yPos);
        this.scene.add(ring);
        this.highlightMeshes.push(ring);
      } else {
        // Contested square — split ring proportional to material at stake
        const greenFrac  = threat.greenScore / total;
        const greenAngle = greenFrac * Math.PI * 2;
        const redAngle   = Math.PI * 2 - greenAngle;

        // Green arc (defenders portion)
        if (greenAngle > 0.001) {
          const geoG = new THREE.RingGeometry(0.28, 0.44, 24, 1, 0, greenAngle);
          geoG.rotateX(-Math.PI / 2);
          const matG = new THREE.MeshBasicMaterial({ color: COLOR_HIGHLIGHT, transparent: true, opacity: 0.80, side: THREE.DoubleSide });
          const ringG = new THREE.Mesh(geoG, matG);
          ringG.position.copy(pos).setY(yPos);
          this.scene.add(ringG);
          this.highlightMeshes.push(ringG);
        }

        // Red arc (attackers portion)
        if (redAngle > 0.001) {
          const geoR = new THREE.RingGeometry(0.28, 0.44, 24, 1, greenAngle, redAngle);
          geoR.rotateX(-Math.PI / 2);
          const matR = new THREE.MeshBasicMaterial({ color: COLOR_THREAT, transparent: true, opacity: 0.80, side: THREE.DoubleSide });
          const ringR = new THREE.Mesh(geoR, matR);
          ringR.position.copy(pos).setY(yPos);
          this.scene.add(ringR);
          this.highlightMeshes.push(ringR);
        }
      }
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

  _showHighlightsCube(selectedPos, legalMoves, threatMap = null) {
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
      const key = `${mv.x},${mv.y},${mv.z}`;
      const threat = threatMap?.get(key) ?? { greenScore: 0, redScore: 0 };
      const total = threat.greenScore + threat.redScore;
      // Lerp green → red based on material-loss fraction; pure green when no threats
      const redFrac = total === 0 ? 0 : threat.redScore / total;
      const color = new THREE.Color().copy(COLOR_HIGHLIGHT).lerp(COLOR_THREAT, redFrac);

      const box = new THREE.LineSegments(hlGeo,
        new THREE.LineBasicMaterial({ color }));
      box.position.copy(this._cubeCenter(mv.x, mv.y, mv.z));
      this.scene.add(box);
      this.highlightMeshes.push(box);
    }
  }
}
