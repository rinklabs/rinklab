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
  switch (el.type) {
    case 'rect':
    case 'ellipse': {
      const x1 = Math.min(el.x, el.x + el.w), y1 = Math.min(el.y, el.y + el.h);
      return x >= x1 && x <= x1 + Math.abs(el.w) && y >= y1 && y <= y1 + Math.abs(el.h);
    }
    case 'line':
    case 'arrow':
      return pointSegDist(x, y, el.x, el.y, el.x + el.w, el.y + el.h) < 8;
    case 'pen': {
      const bb = penBounds(el.points);
      return x >= bb.x - 8 && x <= bb.x + bb.w + 8 && y >= bb.y - 8 && y <= bb.y + bb.h + 8;
    }
    case 'text': {
      ctx.font = `${el.fontSize ?? 20}px sans-serif`;
      const w = ctx.measureText(el.text || ' ').width;
      return x >= el.x - 4 && x <= el.x + w + 4 && y >= el.y - 4 && y <= el.y + (el.fontSize ?? 20) * 1.4 + 4;
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
    const hit = hitTest(x, y);
    if (hit) {
      State.selected   = hit.id;
      State.moveStart  = { x, y };
      State.moveOrigin = { x: hit.x, y: hit.y };
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

  State.drawing   = true;
  State.dragStart = { x, y };
  if (State.tool === 'pen') State.penPoints = [[x, y]];
}

function onMouseMove(e) {
  const { x, y } = canvasPos(e);

  // Move selected element
  if (State.tool === 'select' && State.moveStart && State.selected) {
    const el = State.elements.find(e => e.id === State.selected);
    if (el) {
      el.x = State.moveOrigin.x + (x - State.moveStart.x);
      el.y = State.moveOrigin.y + (y - State.moveStart.y);
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

  State.moveStart  = null;
  State.moveOrigin = null;

  if (!State.drawing) return;
  State.drawing = false;

  if (State.tool === 'pen') {
    if (State.penPoints.length > 2) {
      const el = { id: uid(), type: 'pen', points: [...State.penPoints],
                   strokeColor: State.defStroke, strokeWidth: State.defSW, opacity: 100 };
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
}

function applyToSelected(key, value) {
  if (!State.selected) return;
  const el = State.elements.find(e => e.id === State.selected);
  if (el) { el[key] = value; render(); }
}

// ── Properties panel ─────────────────────────────────────────
function initPropsPanel() {
  ['p-stroke', 'p-fill', 'p-sw', 'p-opacity', 'p-font', 'p-fill-check'].forEach(id => {
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
  document.getElementById('row-font').style.display = el.type === 'text' ? 'flex' : 'none';
}

function syncPropsToElement() {
  if (!State.selected) return;
  const el = State.elements.find(e => e.id === State.selected);
  if (!el) return;

  el.strokeColor = document.getElementById('p-stroke').value;
  el.fillColor   = document.getElementById('p-fill-check').checked
                   ? document.getElementById('p-fill').value : null;
  el.strokeWidth = +document.getElementById('p-sw').value;
  el.opacity     = +document.getElementById('p-opacity').value;
  if (el.type === 'text') el.fontSize = +document.getElementById('p-font').value;
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
