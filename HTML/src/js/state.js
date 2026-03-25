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
};

// ── Unique ID generator ──────────────────────────────────────
let _idCounter = 1;
function uid() {
  return `el-${Date.now()}-${_idCounter++}`;
}

// ── Type mapping helpers ─────────────────────────────────────

/** Internal type → serialized type */
function toExcalidrawType(t) {
  return { rect: 'rectangle', pen: 'freedraw', arrow: 'arrow',
           ellipse: 'ellipse', line: 'line', text: 'text',
           player: 'player' ,pylon: 'pylon', net: 'net'}[t] ?? 'rectangle';
}

/** Serialized type → internal type */
function fromExcalidrawType(t) {
  return { rectangle: 'rect', freedraw: 'pen', arrow: 'arrow',
           ellipse: 'ellipse', line: 'line', text: 'text',
           player: 'player' }[t] ?? 'rect';
}
