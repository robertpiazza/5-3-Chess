import { initializeApp } from 'firebase-app';
import { getDatabase, ref, set, push, get, onValue, remove, serverTimestamp } from 'firebase-database';

import { firebaseConfig } from './firebaseConfig.js';
import { COLOR } from './gameState.js';

// ── Firebase initialisation (module-level singleton) ─────────────────────────

const _app = initializeApp(firebaseConfig);
const _db  = getDatabase(_app);

// ── Room-code generation ──────────────────────────────────────────────────────

// Exclude visually ambiguous characters: I, O, 1, 0
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function _generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++)
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

// ── NetworkManager ────────────────────────────────────────────────────────────

export class NetworkManager {
  /**
   * @param {string} localColor  COLOR.WHITE or COLOR.BLACK
   */
  constructor(localColor) {
    this.localColor    = localColor;
    this.roomCode      = null;
    this._seenMoveKeys = new Set();  // keys pre-registered before write + already applied
    this._unsubMoves   = null;       // unsubscribe fn from onValue(moves)
    this._unsubMeta    = null;       // unsubscribe fn from onValue(meta/guestJoined)
    this._seenUndoKeys = new Set();  // processed undo-event keys
    this._unsubUndo    = null;       // unsubscribe fn from onValue(undoEvents)
  }

  // ── Host flow ───────────────────────────────────────────────────────────────

  /**
   * Create a new game room and return the 6-char room code.
   * The caller should then show the code and wait for onOpponentJoined().
   */
  async createGame() {
    const code = _generateCode();
    this.roomCode = code;
    await set(ref(_db, `games/${code}/meta`), {
      hostColor:   COLOR.WHITE,
      guestColor:  COLOR.BLACK,
      guestJoined: false,
    });
    return code;
  }

  /**
   * Register a one-shot callback that fires when the guest joins.
   * Automatically detaches after firing.
   */
  onOpponentJoined(callback) {
    const metaRef = ref(_db, `games/${this.roomCode}/meta/guestJoined`);
    const unsub = onValue(metaRef, snapshot => {
      if (snapshot.val() === true) {
        unsub();                    // one-shot
        this._unsubMeta = null;
        callback();
      }
    });
    this._unsubMeta = unsub;
  }

  // ── Guest flow ──────────────────────────────────────────────────────────────

  /**
   * Join an existing room by code.
   * Throws if the room does not exist.
   */
  async joinGame(code) {
    const snap = await get(ref(_db, `games/${code}/meta`));
    if (!snap.exists()) throw new Error(`Room "${code}" not found`);
    this.roomCode = code;
    await set(ref(_db, `games/${code}/meta/guestJoined`), true);
  }

  // ── Move exchange ───────────────────────────────────────────────────────────

  /**
   * Push a move to Firebase.
   * Pre-registers the auto-generated push key in _seenMoveKeys so that
   * our own onValue echo is silently ignored by startListening().
   */
  sendMove(src, dst, promotionType) {
    const movesRef = ref(_db, `games/${this.roomCode}/moves`);
    const pushRef  = push(movesRef);           // synchronous – returns new child ref
    this._seenMoveKeys.add(pushRef.key);       // guard against echo
    set(pushRef, {
      src,
      dst,
      promotionType: promotionType || null,
      senderColor:   this.localColor,
      timestamp:     serverTimestamp(),
    });
  }

  /**
   * Subscribe to opponent moves.
   * Fires onOpponentMove(src, dst, promotionType) for each new opponent move.
   * Idempotent — applying the same key twice is prevented by _seenMoveKeys.
   */
  startListening(onOpponentMove) {
    const movesRef = ref(_db, `games/${this.roomCode}/moves`);
    const unsub = onValue(movesRef, snapshot => {
      if (!snapshot.exists()) return;
      snapshot.forEach(child => {
        const key  = child.key;
        if (this._seenMoveKeys.has(key)) return;   // already processed
        this._seenMoveKeys.add(key);

        const data = child.val();
        if (data.senderColor === this.localColor) return;  // own echo (second guard)

        onOpponentMove(data.src, data.dst, data.promotionType || null);
      });
    });
    this._unsubMoves = unsub;
  }

  // ── Undo-request exchange ────────────────────────────────────────────────────

  /** Push an undo request event. */
  sendUndoRequest() {
    const eventsRef = ref(_db, `games/${this.roomCode}/undoEvents`);
    const pushRef   = push(eventsRef);
    this._seenUndoKeys.add(pushRef.key);
    set(pushRef, { type: 'request', senderColor: this.localColor });
  }

  /** Push an undo response (approved / declined). */
  sendUndoResponse(approved) {
    const eventsRef = ref(_db, `games/${this.roomCode}/undoEvents`);
    const pushRef   = push(eventsRef);
    this._seenUndoKeys.add(pushRef.key);
    set(pushRef, { type: approved ? 'approved' : 'declined', senderColor: this.localColor });
  }

  /**
   * Listen for undo events from the opponent.
   * onRequest()         — opponent wants to undo their last move
   * onResponse(approved) — opponent responded to our undo request
   */
  startListeningUndo(onRequest, onResponse) {
    const eventsRef = ref(_db, `games/${this.roomCode}/undoEvents`);
    const unsub = onValue(eventsRef, snapshot => {
      if (!snapshot.exists()) return;
      snapshot.forEach(child => {
        const key = child.key;
        if (this._seenUndoKeys.has(key)) return;
        this._seenUndoKeys.add(key);

        const data = child.val();
        if (data.senderColor === this.localColor) return;  // own echo

        if (data.type === 'request') {
          onRequest();
        } else if (data.type === 'approved' || data.type === 'declined') {
          onResponse(data.type === 'approved');
        }
      });
    });
    this._unsubUndo = unsub;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  /**
   * Delete the entire room from Firebase. Safe to call multiple times —
   * subsequent calls after the first are no-ops (roomCode is cleared).
   */
  async deleteRoom() {
    if (!this.roomCode) return;
    const code = this.roomCode;
    this.roomCode = null;   // prevent double-delete if called again before promise resolves
    await remove(ref(_db, `games/${code}`));
  }

  /** Detach all Firebase listeners. Call before discarding this instance. */
  detach() {
    if (this._unsubMoves) { this._unsubMoves(); this._unsubMoves = null; }
    if (this._unsubMeta)  { this._unsubMeta();  this._unsubMeta  = null; }
    if (this._unsubUndo)  { this._unsubUndo();  this._unsubUndo  = null; }
  }
}
