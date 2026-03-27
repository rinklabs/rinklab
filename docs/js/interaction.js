// ─────────────────────────────────────────────────────────────
//  interaction.js  —  mouse, keyboard, tool bar, props panel
// ─────────────────────────────────────────────────────────────

function initInteraction() {
  initMouseEvents();
  initKeyboard();
  initToolButtons();
  initToolbarInputs();
  initPropsPanel();
  document.getElementById('btn-del').addEventListener('click', deleteSelected);
}

// ── Hit testing ──────────────────────────────────────────────
function hitTest(x, y) {
  for (let i = State.elements.length - 1; i >= 0; i--) {
    const el = State.elements[i];
    if (hitEl(el, x, y)) return el;
  }
  return null;
}

function hitEl(el, x, y) {
  // For rotatable elements, un-rotate the test point into local space
  const angle = el.angle ?? 0;
  let tx = x, ty = y;
  if (angle) {
    const c = getElementCenter(el);
    const rp = rotatePoint(c.x, c.y, -angle, x, y);
    tx = rp.x; ty = rp.y;
  }

  switch (el.type) {
    case 'rect':
    case 'ellipse':
    case 'pylon':
    case 'net': {
      const x1 = Math.min(el.x, el.x + el.w), y1 = Math.min(el.y, el.y + el.h);
      return tx >= x1 && tx <= x1 + Math.abs(el.w) && ty >= y1 && ty <= y1 + Math.abs(el.h);
    }
    case 'line':
    case 'arrow':
      return pointSegDist(x, y, el.x, el.y, el.x + el.w, el.y + el.h) < 8;
    case 'pen': {
      const bb = penBounds(el.points);
      return tx >= bb.x - 8 && tx <= bb.x + bb.w + 8 && ty >= bb.y - 8 && ty <= bb.y + bb.h + 8;
    }
    case 'text': {
      ctx.font = `${el.fontSize ?? 20}px sans-serif`;
      const w = ctx.measureText(el.text || ' ').width;
      return tx >= el.x - 4 && tx <= el.x + w + 4 && ty >= el.y - 4 && ty <= el.y + (el.fontSize ?? 20) * 1.4 + 4;
    }
    case 'player': {
      const r = (el.fontSize ?? 32) / 2 + 6;
      return Math.hypot(x - el.x, y - el.y) <= r;
    }
    default: return false;
  }
}

function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ── Mouse events ─────────────────────────────────────────────
function initMouseEvents() {
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup',   onMouseUp);
  canvas.addEventListener('dblclick',  onDblClick);
}

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onMouseDown(e) {
  const { x, y } = canvasPos(e);

  if (State.editingText) { commitText(); return; }

  if (State.tool === 'select') {
    // 1. Check if clicking a handle on the selected element (resize/rotate takes priority)
    if (State.selected) {
      const selEl = State.elements.find(e => e.id === State.selected);
      if (selEl) {
        const handle = pickHandle(selEl, x, y);
        if (handle) { startHandleDrag(selEl, handle, x, y); return; }
      }
    }

    // 2. Regular element hit → move
    const hit = hitTest(x, y);
    if (hit) {
      State.selected  = hit.id;
      State.moveStart = { x, y };
      // Store correct origin depending on type
      if (hit.type === 'pen') {
        State.moveOrigin = { isPen: true, points: hit.points.map(p => [...p]) };
      } else {
        State.moveOrigin = { x: hit.x, y: hit.y };
      }
    } else {
      State.selected = null;
    }
    updatePropsPanel();
    render();
    return;
  }

  if (State.tool === 'text') {
    const hit = hitTest(x, y);
    if (hit && hit.type === 'text') { startEditText(hit); return; }
    const el = { id: uid(), type: 'text', x, y, text: '', fontSize: 20,
                 strokeColor: State.defStroke, opacity: 100 };
    State.elements.push(el);
    State.selected = el.id;
    startEditText(el);
    return;
  }

  if (State.tool === 'player') {
    const el = {
      id:          uid(),
      type:        'player',
      playerType:  State.defPlayerType,
      fontSize:    parseInt(document.getElementById('p-player-size').value) || 32,
      x,
      y,
      strokeColor: State.defStroke,
      opacity:     100,
    };
    State.elements.push(el);
    State.selected = el.id;
    updatePropsPanel();
    render();
    return;
  }

  if (State.tool === 'pylon') {
    const el = {
      id:          uid(),
      type:        'pylon',
      x:           x - 15,   // center the 30px-wide pylon on click
      y:           y - 20,   // center the 40px-tall pylon on click
      w:           30,
      h:           40,
      strokeColor: State.defStroke,
      fillColor:   '#ff8c00', // orange by default
      opacity:     100,
    };
    State.elements.push(el);
    State.selected = el.id;
    updatePropsPanel();
    render();
    return;
  }

  if (State.tool === 'net') {
    // Net is drag-to-place so you can control size/orientation
    State.drawing   = true;
    State.dragStart = { x, y };
    return;
  }

  State.drawing   = true;
  State.dragStart = { x, y };
  if (State.tool === 'pen') State.penPoints = [[x, y]];
}

function onMouseMove(e) {
  const { x, y } = canvasPos(e);

  // ── Resize drag ──────────────────────────────────────
  if (State.dragMode === 'resize') {
    const el = State.elements.find(e => e.id === State.selected);
    if (el && State.dragElementSnap) {
      applyResize(el, State.dragHandle, State.dragElementSnap,
                  x - State.dragOrigin.x, y - State.dragOrigin.y);
      render();
    }
    return;
  }

  // ── Rotate drag ──────────────────────────────────────
  if (State.dragMode === 'rotate') {
    const el = State.elements.find(e => e.id === State.selected);
    if (el && State.rotateCenter) {
      const mouseAngle = Math.atan2(y - State.rotateCenter.y, x - State.rotateCenter.x);
      el.angle = (State.dragElementSnap.angle ?? 0) + (mouseAngle - State.rotateStartAngle);
      render();
    }
    return;
  }

  // ── Move selected element ────────────────────────────
  if (State.tool === 'select' && State.moveStart && State.selected) {
    const el = State.elements.find(e => e.id === State.selected);
    if (el) {
      const dx = x - State.moveStart.x;
      const dy = y - State.moveStart.y;
      if (el.type === 'pen' && State.moveOrigin?.isPen) {
        el.points = State.moveOrigin.points.map(([px, py]) => [px + dx, py + dy]);
      } else {
        el.x = State.moveOrigin.x + dx;
        el.y = State.moveOrigin.y + dy;
      }
      render();
    }
    return;
  }

  if (!State.drawing) return;

  if (State.tool === 'pen') {
    State.penPoints.push([x, y]);
    renderPenPreview(State.penPoints);
    return;
  }

  renderDragPreview(State.dragStart, { x, y });
}

function onMouseUp(e) {
  const { x, y } = canvasPos(e);

  // Handle drag (resize / rotate) takes priority
  if (State.dragMode) {
    State.dragMode         = null;
    State.dragHandle       = null;
    State.dragOrigin       = null;
    State.dragElementSnap  = null;
    State.rotateCenter     = null;
    State.rotateStartAngle = null;
    updatePropsPanel();
    render();
    return;
  }

  State.moveStart  = null;
  State.moveOrigin = null;

  if (!State.drawing) return;
  State.drawing = false;

  if (State.tool === 'pen') {
    if (State.penPoints.length > 2) {
      const el = { id: uid(), type: 'pen', points: [...State.penPoints],
                   strokeColor: State.defStroke, strokeWidth: State.defSW,
                   lineStyle: State.defLineStyle, opacity: 100 };
      State.elements.push(el);
      State.selected = el.id;
    }
    State.penPoints = [];
    render();
    updatePropsPanel();
    return;
  }

  const dx = x - State.dragStart.x;
  const dy = y - State.dragStart.y;
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) { render(); return; }

  const el = {
    id: uid(), type: State.tool,
    x: State.dragStart.x, y: State.dragStart.y, w: dx, h: dy,
    strokeColor: State.defStroke,
    fillColor:   State.defFillOn ? State.defFill : null,
    strokeWidth: State.defSW,
    opacity:     100,
  };
  if (['line', 'arrow'].includes(State.tool)) el.lineStyle = State.defLineStyle;
  State.elements.push(el);
  State.selected = el.id;
  render();
  updatePropsPanel();
}

function onDblClick(e) {
  if (State.tool !== 'select') return;
  const { x, y } = canvasPos(e);
  const hit = hitTest(x, y);
  if (hit && hit.type === 'text') startEditText(hit);
}

// ── Text editing ─────────────────────────────────────────────
function startEditText(el) {
  State.selected   = el.id;
  State.editingText = { id: el.id };
  State.textCursor  = el.text ?? '';
  canvas.classList.add('cursor-text');
  render();
}

function commitText() {
  if (!State.editingText) return;
  const el = State.elements.find(e => e.id === State.editingText.id);
  if (el) {
    el.text = State.textCursor;
    if (!el.text.trim()) State.elements = State.elements.filter(e => e.id !== el.id);
  }
  State.editingText = null;
  State.textCursor  = '';
  canvas.classList.remove('cursor-text');
  render();
  updatePropsPanel();
}

// ── Keyboard ─────────────────────────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', e => {
    // Don't capture keys when typing in metadata fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (State.editingText) {
      if (e.key === 'Enter' || e.key === 'Escape') { commitText(); return; }
      if (e.key === 'Backspace') { State.textCursor = State.textCursor.slice(0, -1); render(); return; }
      if (e.key.length === 1)    { State.textCursor += e.key; render(); return; }
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && State.selected) {
      deleteSelected();
      return;
    }

    const shortcuts = { v: 'select', r: 'rect', e: 'ellipse', l: 'line', a: 'arrow', t: 'text', p: 'pen' };
    const t = shortcuts[e.key.toLowerCase()];
    if (t) setTool(t);
  });
}

// ── Tool selection ───────────────────────────────────────────
function initToolButtons() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });
}

function setTool(t) {
  State.tool = t;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === t);
  });
  canvas.className = t === 'select' ? 'cursor-select' : t === 'text' ? 'cursor-text' : '';
}

// ── Toolbar colour / width inputs ────────────────────────────
function initToolbarInputs() {
  document.getElementById('stroke-color').addEventListener('input', e => {
    State.defStroke = e.target.value;
    applyToSelected('strokeColor', e.target.value);
  });
  document.getElementById('fill-color').addEventListener('input', e => {
    State.defFill = e.target.value;
    if (State.defFillOn) applyToSelected('fillColor', e.target.value);
  });
  document.getElementById('fill-check').addEventListener('change', e => {
    State.defFillOn = e.target.checked;
    applyToSelected('fillColor', State.defFillOn ? State.defFill : null);
  });
  document.getElementById('stroke-width').addEventListener('input', e => {
    State.defSW = +e.target.value;
    applyToSelected('strokeWidth', +e.target.value);
  });

  document.getElementById('line-style').addEventListener('change', e => {
    State.defLineStyle = e.target.value;
    if (State.selected) {
      const el = State.elements.find(el => el.id === State.selected);
      if (el && ['line', 'arrow', 'pen'].includes(el.type)) {
        el.lineStyle = e.target.value;
        render();
      }
    }
  });

  document.getElementById('player-type').addEventListener('change', e => {
    State.defPlayerType = e.target.value;
    // If a player is selected, update its type live
    if (State.selected) {
      const el = State.elements.find(el => el.id === State.selected);
      if (el?.type === 'player') { el.playerType = e.target.value; render(); }
    }
  });
}

function applyToSelected(key, value) {
  if (!State.selected) return;
  const el = State.elements.find(e => e.id === State.selected);
  if (el) { el[key] = value; render(); }
}

// ── Properties panel ─────────────────────────────────────────
function initPropsPanel() {
  ['p-stroke', 'p-fill', 'p-sw', 'p-opacity', 'p-font',
   'p-fill-check', 'p-player-type', 'p-player-size', 'p-line-style'].forEach(id => {
    document.getElementById(id).addEventListener('input',  syncPropsToElement);
    document.getElementById(id).addEventListener('change', syncPropsToElement);
  });
}

function updatePropsPanel() {
  const panel = document.getElementById('props');
  if (!State.selected) { panel.classList.remove('visible'); return; }

  const el = State.elements.find(e => e.id === State.selected);
  if (!el)              { panel.classList.remove('visible'); return; }

  panel.classList.add('visible');
  document.getElementById('p-stroke').value        = el.strokeColor ?? '#ffffff';
  document.getElementById('p-fill').value          = el.fillColor   ?? '#ffffff';
  document.getElementById('p-fill-check').checked  = !!el.fillColor;
  document.getElementById('p-sw').value            = el.strokeWidth ?? 2;
  document.getElementById('p-opacity').value       = el.opacity     ?? 100;
  document.getElementById('p-font').value          = el.fontSize    ?? 20;

  const isPlayer    = el.type === 'player';
  const isStrokable = ['line', 'arrow', 'pen'].includes(el.type);
  const isPylonNet  = el.type === 'pylon' || el.type === 'net';

  document.getElementById('row-font').style.display        = el.type === 'text'  ? 'flex' : 'none';
  document.getElementById('row-fill').style.display        = isPlayer            ? 'none' : 'flex';
  document.getElementById('row-sw').style.display          = isPlayer            ? 'none' : 'flex';
  document.getElementById('row-player-type').style.display = isPlayer            ? 'flex' : 'none';
  document.getElementById('row-line-style').style.display  = isStrokable         ? 'flex' : 'none';

  if (isPlayer) {
    document.getElementById('p-player-type').value = el.playerType ?? 'F';
    document.getElementById('p-player-size').value = el.fontSize   ?? 32;
  }
  if (isStrokable) document.getElementById('p-line-style').value = el.lineStyle ?? 'solid';
}

function syncPropsToElement() {
  if (!State.selected) return;
  const el = State.elements.find(e => e.id === State.selected);
  if (!el) return;

  el.strokeColor = document.getElementById('p-stroke').value;
  el.opacity     = +document.getElementById('p-opacity').value;

  if (el.type === 'player') {
    el.playerType = document.getElementById('p-player-type').value;
    el.fontSize   = parseInt(document.getElementById('p-player-size').value);
  } else {
    el.fillColor   = document.getElementById('p-fill-check').checked
                     ? document.getElementById('p-fill').value : null;
    el.strokeWidth = +document.getElementById('p-sw').value;
    if (el.type === 'text') el.fontSize = +document.getElementById('p-font').value;
    if (['line', 'arrow', 'pen'].includes(el.type)) {
      el.lineStyle = document.getElementById('p-line-style').value;
    }
  }
  render();
}

// ── Delete ───────────────────────────────────────────────────
function deleteSelected() {
  if (!State.selected) return;
  State.elements = State.elements.filter(e => e.id !== State.selected);
  State.selected = null;
  updatePropsPanel();
  render();
}

// ── Handle drag helpers ───────────────────────────────────────

/** Returns the handle under (x,y) for the given element, or null. */
function pickHandle(el, x, y) {
  const handles = getElementHandles(el);
  return handles.find(h => Math.hypot(x - h.x, y - h.y) < HANDLE_HIT_R) ?? null;
}

/** Initialises resize or rotate drag from a handle click. */
function startHandleDrag(el, handle, x, y) {
  State.dragHandle      = handle.id;
  State.dragOrigin      = { x, y };
  State.dragElementSnap = JSON.parse(JSON.stringify(el));

  if (handle.id === 'rot') {
    State.dragMode        = 'rotate';
    State.rotateCenter    = getElementCenter(el);
    State.rotateStartAngle = Math.atan2(y - State.rotateCenter.y, x - State.rotateCenter.x);
  } else {
    State.dragMode = 'resize';
  }
}

/**
 * Applies a resize delta (dx, dy) in screen space to `el` based on the
 * active handle, using `origEl` as the baseline snapshot.
 * For rotated elements the delta is first transformed into local space.
 */
function applyResize(el, handle, origEl, dx, dy) {
  // Transform screen-space delta into the element's local (unrotated) frame
  const angle = origEl.angle ?? 0;
  let ldx = dx, ldy = dy;
  if (angle && handle !== 'p1' && handle !== 'p2' && handle !== 'scale') {
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    ldx = dx * cos - dy * sin;
    ldy = dx * sin + dy * cos;
  }

  if (el.type === 'pen') { scalePenPoints(el, origEl, handle, ldx, ldy); return; }

  if (el.type === 'player' && handle === 'scale') {
    el.fontSize = Math.max(10, Math.round(origEl.fontSize + (dx + dy) / 2));
    return;
  }

  switch (handle) {
    case 'nw': el.x = origEl.x + ldx; el.y = origEl.y + ldy; el.w = origEl.w - ldx; el.h = origEl.h - ldy; break;
    case 'n':  el.y = origEl.y + ldy; el.h = origEl.h - ldy; break;
    case 'ne': el.y = origEl.y + ldy; el.w = origEl.w + ldx; el.h = origEl.h - ldy; break;
    case 'e':  el.w = origEl.w + ldx; break;
    case 'se': el.w = origEl.w + ldx; el.h = origEl.h + ldy; break;
    case 's':  el.h = origEl.h + ldy; break;
    case 'sw': el.x = origEl.x + ldx; el.w = origEl.w - ldx; el.h = origEl.h + ldy; break;
    case 'w':  el.x = origEl.x + ldx; el.w = origEl.w - ldx; break;
    // Line / arrow endpoints
    case 'p1': el.x = origEl.x + dx; el.y = origEl.y + dy; el.w = origEl.w - dx; el.h = origEl.h - dy; break;
    case 'p2': el.w = origEl.w + dx; el.h = origEl.h + dy; break;
  }
}

/** Scales all pen points to fit a new bounding box derived from the dragged corner. */
function scalePenPoints(el, origEl, handle, dx, dy) {
  const bb = penBounds(origEl.points);
  if (bb.w < 1 || bb.h < 1) return;

  let nx1 = bb.x, ny1 = bb.y, nx2 = bb.x + bb.w, ny2 = bb.y + bb.h;
  if (handle === 'nw' || handle === 'sw') nx1 = bb.x + dx;
  if (handle === 'ne' || handle === 'se') nx2 = bb.x + bb.w + dx;
  if (handle === 'nw' || handle === 'ne') ny1 = bb.y + dy;
  if (handle === 'sw' || handle === 'se') ny2 = bb.y + bb.h + dy;

  const nw = nx2 - nx1, nh = ny2 - ny1;
  if (Math.abs(nw) < 5 || Math.abs(nh) < 5) return;

  el.points = origEl.points.map(([px, py]) => [
    nx1 + ((px - bb.x) / bb.w) * nw,
    ny1 + ((py - bb.y) / bb.h) * nh,
  ]);
}
