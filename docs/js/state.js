// ─────────────────────────────────────────────────────────────
//  state.js  —  single source of truth for all mutable state
// ─────────────────────────────────────────────────────────────

const State = {
  // Drawing elements
  elements:    [],
  selected:    null,

  // Active tool
  tool:        'select',

  // In-progress drawing
  drawing:     false,
  dragStart:   null,
  penPoints:   [],

  // Text editing
  editingText: null,   // { id } | null
  textCursor:  '',

  // Move drag
  moveStart:   null,   // { x, y } at drag begin
  moveOrigin:  null,   // { x, y } element position at drag begin

  // Toolbar defaults
  defStroke:     '#000000',
  defFill:       '#ffffff57',
  defFillOn:     false,
  defSW:         2,

  // Player tool default
  defPlayerType: 'F',
  defPlayerSize: 32,

  // Line style default (applies to line, arrow, pen)
  defLineStyle: 'solid',

  // Handle drag state (resize / rotate)
  dragMode:          null,   // 'resize' | 'rotate' | 'band' | null
  dragHandle:        null,   // handle id string
  dragOrigin:        null,   // { x, y } mouse position at drag start
  dragElementSnap:   null,   // deep copy of element at drag start
  rotateCenter:      null,   // { x, y } rotation center
  rotateStartAngle:  null,   // initial mouse angle from center

  // Multi-select
  multiSelected:     new Set(),   // Set of selected element IDs
  bandRect:          null,        // { x, y, w, h } rubber-band box while dragging
  multiMoveOrigins:  null,        // Map id→{x,y} snapshots for group move
};

// ── Unique ID generator ──────────────────────────────────────
let _idCounter = 1;
function uid() {
  return `el-${Date.now()}-${_idCounter++}`;
}

// ── Type mapping helpers ─────────────────────────────────────

// ── History (undo / redo) ────────────────────────────────────
const History = {
  _stack:  [],   // array of JSON-serialised elements snapshots
  _cursor: -1,   // points to the current snapshot
  MAX:     80,   // max steps kept
};

/** Call before every user mutation. Snapshots current elements array. */
function pushHistory() {
  // Discard any "future" states after the current cursor
  History._stack.splice(History._cursor + 1);
  History._stack.push(JSON.stringify(State.elements));
  if (History._stack.length > History.MAX) History._stack.shift();
  History._cursor = History._stack.length - 1;
  _updateHistoryButtons();
}

function undo() {
  if (History._cursor <= 0) return;
  History._cursor--;
  _applySnapshot(History._stack[History._cursor]);
}

function redo() {
  if (History._cursor >= History._stack.length - 1) return;
  History._cursor++;
  _applySnapshot(History._stack[History._cursor]);
}

function _applySnapshot(json) {
  State.elements     = JSON.parse(json);
  State.selected     = null;
  State.multiSelected.clear();
  updatePropsPanel();
  render();
  _updateHistoryButtons();
}

function _updateHistoryButtons() {
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (!u || !r) return;
  u.disabled = History._cursor <= 0;
  r.disabled = History._cursor >= History._stack.length - 1;
}

/** Internal type → serialized type */
function toExcalidrawType(t) {
  return { rect: 'rectangle', pen: 'freedraw', arrow: 'arrow',
           ellipse: 'ellipse', line: 'line', text: 'text',
           player: 'player' ,pylon: 'pylon', net: 'net', puck: 'puck'}[t] ?? 'rectangle';
}

/** Serialized type → internal type */
function fromExcalidrawType(t) {
  return { rectangle: 'rect', freedraw: 'pen', arrow: 'arrow',
           ellipse: 'ellipse', line: 'line', text: 'text',
           player: 'player', pylon: 'pylon', net: 'net', puck: 'puck' }[t] ?? 'rect';
}
