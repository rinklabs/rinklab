// ─────────────────────────────────────────────────────────────
//  pinchzoom.js  —  two-finger pinch-zoom / pan on the drawing canvas
//
//  This is purely a *view* transform: it scales/translates the DOM
//  layer wrapping the rink SVG + drawing canvas via CSS. Rink-space
//  coordinates, hit-testing, and rendering are all untouched.
//  canvasPos() (interaction.js) derives its screen→rink-space scale
//  from the canvas element's actual getBoundingClientRect(), which
//  already reflects this transform — so nothing elsewhere needs to
//  know pinch-zoom exists.
//
//  Trade-off: because the canvas's backing store isn't re-rendered
//  at a higher resolution while zoomed, drawn strokes look slightly
//  softer when zoomed in — the same trade-off any CSS-transform
//  zoom makes. Good enough for "zoom in to place something
//  precisely"; a future pass could re-rasterize at the zoomed
//  resolution if sharper zoomed-in drawing is ever needed.
// ─────────────────────────────────────────────────────────────

const ZOOM_MIN = 1;   // can't zoom out past the normal fitted view
const ZOOM_MAX = 4;

const PinchZoom = {
  scale:   1,
  tx:      0,
  ty:      0,
  active:  false,   // true for the whole lifetime of a 2+ finger gesture
  endedAt: 0,       // timestamp a gesture last ended (debounces stray taps)
  _gesture: null,   // { dist0, midX0, midY0, scale0, tx0, ty0 }
};

let _zoomWrap, _zoomLayer, _zoomResetBtn;

function initPinchZoom() {
  _zoomWrap     = document.getElementById('canvas-wrap');
  _zoomLayer    = document.getElementById('canvas-zoom-layer');
  _zoomResetBtn = document.getElementById('zoom-reset-btn');

  if (_zoomResetBtn) _zoomResetBtn.addEventListener('click', resetZoom);
  applyZoomTransform();

  // Trackpad "pinch" is delivered by the browser as wheel events with
  // ctrlKey set — a nice bonus for anyone testing on a laptop trackpad.
  _zoomWrap.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const r = _zoomWrap.getBoundingClientRect();
    zoomAtPoint(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
  }, { passive: false });
}

function applyZoomTransform() {
  if (!_zoomLayer) return;
  _zoomLayer.style.transform = `translate(${PinchZoom.tx}px, ${PinchZoom.ty}px) scale(${PinchZoom.scale})`;
  if (_zoomResetBtn) _zoomResetBtn.style.display = PinchZoom.scale > 1.02 ? 'flex' : 'none';
}

/** Keeps panned content from being dragged fully off-screen. */
function clampPan(scale, tx, ty) {
  if (scale <= 1) return { tx: 0, ty: 0 };
  const w = _zoomWrap.clientWidth, h = _zoomWrap.clientHeight;
  const minTx = w * (1 - scale), minTy = h * (1 - scale);
  return {
    tx: Math.min(0, Math.max(minTx, tx)),
    ty: Math.min(0, Math.max(minTy, ty)),
  };
}

function setZoom(scale, tx, ty) {
  const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
  const p = clampPan(s, tx, ty);
  PinchZoom.scale = s;
  PinchZoom.tx    = p.tx;
  PinchZoom.ty    = p.ty;
  applyZoomTransform();
}

function resetZoom() { setZoom(1, 0, 0); }

/** Zoom in/out around a single local point — used by trackpad ctrl+wheel. */
function zoomAtPoint(localX, localY, factor) {
  const s0 = PinchZoom.scale;
  const s1 = s0 * factor;
  const contentX = (localX - PinchZoom.tx) / s0;
  const contentY = (localY - PinchZoom.ty) / s0;
  setZoom(s1, localX - contentX * s1, localY - contentY * s1);
}

// ── Two-finger touch gesture ──────────────────────────────────
function touchDist(t0, t1) { return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY); }
function touchMid(t0, t1)  { return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 }; }

function startPinchGesture(touches) {
  const r   = _zoomWrap.getBoundingClientRect();
  const mid = touchMid(touches[0], touches[1]);
  PinchZoom.active   = true;
  PinchZoom._gesture = {
    dist0:  touchDist(touches[0], touches[1]),
    midX0:  mid.x - r.left,
    midY0:  mid.y - r.top,
    scale0: PinchZoom.scale,
    tx0:    PinchZoom.tx,
    ty0:    PinchZoom.ty,
  };
}

function updatePinchGesture(touches) {
  const g = PinchZoom._gesture;
  if (!g) return;

  const r    = _zoomWrap.getBoundingClientRect();
  const mid  = touchMid(touches[0], touches[1]);
  const midX = mid.x - r.left, midY = mid.y - r.top;
  const dist = touchDist(touches[0], touches[1]);

  const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, g.scale0 * (dist / (g.dist0 || 1))));

  // Content point that was under the gesture's *starting* midpoint — using
  // a fixed reference (rather than recomputing from the live transform
  // every frame) avoids drift over a long gesture.
  const localX = (g.midX0 - g.tx0) / g.scale0;
  const localY = (g.midY0 - g.ty0) / g.scale0;

  setZoom(newScale, midX - localX * newScale, midY - localY * newScale);
}

function endPinchGesture() {
  PinchZoom.active   = false;
  PinchZoom._gesture = null;
  PinchZoom.endedAt  = Date.now();
}
