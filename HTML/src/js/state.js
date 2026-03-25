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
  defStroke:   '#e8e8e8',
  defFill:     '#ffffff',
  defFillOn:   false,
  defSW:       2,
};

// ── Unique ID generator ──────────────────────────────────────
let _idCounter = 1;
function uid() {
  return `el-${Date.now()}-${_idCounter++}`;
}

// ── Type mapping helpers ─────────────────────────────────────

/** Internal type → Excalidraw type */
function toExcalidrawType(t) {
  return { rect: 'rectangle', pen: 'freedraw', arrow: 'arrow',
           ellipse: 'ellipse', line: 'line', text: 'text' }[t] ?? 'rectangle';
}

/** Excalidraw type → internal type */
function fromExcalidrawType(t) {
  return { rectangle: 'rect', freedraw: 'pen', arrow: 'arrow',
           ellipse: 'ellipse', line: 'line', text: 'text' }[t] ?? 'rect';
}
