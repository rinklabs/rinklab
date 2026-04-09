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
  document.getElementById('btn-dup').addEventListener('click', duplicateSelected);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  // Group interaction
  document.getElementById('btn-group-flip-h').addEventListener('click', () => flipSelection('horizontal'));
  document.getElementById('btn-group-flip-v').addEventListener('click', () => flipSelection('vertical'));
  document.getElementById('btn-group-rotate').addEventListener('click', () => rotateSelection(90));
  document.getElementById('p-is-coach').addEventListener('change', (e) => {
    const selectedIds = Array.isArray(State.selected) ? State.selected : [State.selected];

    State.elements.forEach(el => {
      if (selectedIds.includes(el.id) && el.type === 'player') {
        el.isCoach = e.target.checked;
      }
    });
    render();
  });
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
      const r = playerRadius(el) + 4;   // matches the selection circle
      return Math.hypot(x - el.x, y - el.y) <= r;
    }
    case 'puck': {
      const r = (el.r ?? 12) + 4;
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
  initTouchEvents();
}

// ── Touch events (iOS / mobile) ───────────────────────────────
// iOS doesn't fire mouse events for drags, so we translate touch
// events into the same handlers, reusing the updated canvasPos()
// which already understands both event types.
function initTouchEvents() {
  // passive:false lets us call preventDefault() to stop page scroll
  // while the user is drawing or dragging on the canvas.
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;   // ignore multi-touch
    e.preventDefault();
    onMouseDown(e);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    onMouseMove(e);
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    onMouseUp(e);
  }, { passive: false });

  // A quick tap (no drag) on text should still trigger double-click edit
  canvas.addEventListener('touchend', e => {
    if (State.tool !== 'select') return;
    const now = Date.now();
    const last = canvas._lastTap ?? 0;
    canvas._lastTap = now;
    if (now - last < 350) onDblClick(e);   // two taps within 350 ms
  }, { passive: false });
}

function canvasPos(e) {
  const r   = canvas.getBoundingClientRect();
  const src = (e.touches && e.touches.length > 0)
    ? e.touches[0]
    : (e.changedTouches && e.changedTouches.length > 0)
      ? e.changedTouches[0]
      : e;
  const rT = getRinkTransform();
  return {
    x: (src.clientX - r.left  - rT.x) / rT.s,
    y: (src.clientY - r.top   - rT.y) / rT.s,
  };
}

function onMouseDown(e) {
  const { x, y } = canvasPos(e);

  if (State.editingText) { commitText(); return; }

  if (State.tool === 'select') {
    // 1. Handle on single selected element takes priority
    if (State.selected && !e.shiftKey) {
      const selEl = State.elements.find(e => e.id === State.selected);
      if (selEl) {
        const handle = pickHandle(selEl, x, y);
        if (handle) { startHandleDrag(selEl, handle, x, y); return; }
      }
    }

    const hit = hitTest(x, y);

    if (hit) {
      if (e.shiftKey) {
        // Shift+click: toggle in multi-selection, keep existing group
        if (State.multiSelected.has(hit.id)) {
          State.multiSelected.delete(hit.id);
          State.selected = State.multiSelected.size > 0
            ? [...State.multiSelected][State.multiSelected.size - 1] : null;
        } else {
          // Add previously single-selected item to group first
          if (State.selected) State.multiSelected.add(State.selected);
          State.multiSelected.add(hit.id);
          State.selected = hit.id;
        }
      } else {
        // Regular click: if not already in group, collapse to single
        if (!State.multiSelected.has(hit.id)) {
          State.multiSelected.clear();
          State.selected = hit.id;
        }
        // Begin group or single move
        State.moveStart = { x, y };
        const ids = State.multiSelected.size > 1
          ? [...State.multiSelected] : [State.selected];
        State.multiMoveOrigins = new Map(
          ids.map(id => {
            const el = State.elements.find(e => e.id === id);
            return el ? [id, el.type === 'pen'
              ? { isPen: true, points: el.points.map(p => [...p]) }
              : { x: el.x, y: el.y }] : null;
          }).filter(Boolean)
        );
      }
    } else if (!e.shiftKey) {
      // Click on empty canvas → clear selection, start rubber-band
      State.selected = null;
      State.multiSelected.clear();
      State.dragMode  = 'band';
      State.dragOrigin = { x, y };
      State.bandRect   = { x, y, w: 0, h: 0 };
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
      isCoach: false
    };
    State.elements.push(el);
    State.selected = el.id;
    pushHistory();
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
    pushHistory();
    updatePropsPanel();
    render();
    return;
  }

  if (State.tool === 'net') {
    // Default size matches the net SVG aspect ratio (100×70 → 60×42 px)
    const W = 30, H = 50;
    const el = {
      id:          uid(),
      type:        'net',
      x:           x - W / 2,   // centre on click
      y:           y - H / 2,
      w:           W,
      h:           H,
      strokeColor: State.defStroke,
      fillColor:   '#4488cc',    // ice-blue default
      opacity:     100,
    };
    State.elements.push(el);
    State.selected = el.id;
    pushHistory();
    updatePropsPanel();
    render();
    return;
  }

  if (State.tool === 'puck') {
    const el = {
      id:          uid(),
      type:        'puck',
      x,
      y,
      r:           12,           // default radius in px
      opacity:     100,
    };
    State.elements.push(el);
    State.selected = el.id;
    pushHistory();
    updatePropsPanel();
    render();
    return;
  }

  State.drawing   = true;
  State.dragStart = { x, y };
  if (State.tool === 'pen') State.penPoints = [[x, y]];
}

function onMouseMove(e) {
  const { x, y } = canvasPos(e);

  // ── Rubber-band selection ────────────────────────────
  if (State.dragMode === 'band') {
    const ox = State.dragOrigin.x, oy = State.dragOrigin.y;
    State.bandRect = { x: Math.min(ox, x), y: Math.min(oy, y),
                       w: Math.abs(x - ox), h: Math.abs(y - oy) };
    render();
    return;
  }

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

  // ── Move (single or group) ───────────────────────────
  if (State.tool === 'select' && State.moveStart && State.multiMoveOrigins) {
    const dx = x - State.moveStart.x;
    const dy = y - State.moveStart.y;
    State.multiMoveOrigins.forEach((orig, id) => {
      const el = State.elements.find(e => e.id === id);
      if (!el) return;
      if (orig.isPen) {
        el.points = orig.points.map(([px, py]) => [px + dx, py + dy]);
      } else {
        el.x = orig.x + dx;
        el.y = orig.y + dy;
      }
    });
    render();
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

  // ── Rubber-band: select all elements inside the rect ─
  if (State.dragMode === 'band') {
    const { x: bx, y: by, w: bw, h: bh } = State.bandRect ?? {};
    if (bw > 4 && bh > 4) {
      State.elements.forEach(el => {
        const c = getElementCenter(el);
        if (c.x >= bx && c.x <= bx + bw && c.y >= by && c.y <= by + bh) {
          State.multiSelected.add(el.id);
        }
      });
      if (State.multiSelected.size === 1) {
        State.selected = [...State.multiSelected][0];
        State.multiSelected.clear();
      } else if (State.multiSelected.size > 1) {
        State.selected = [...State.multiSelected][State.multiSelected.size - 1];
      }
    }
    State.dragMode   = null;
    State.dragOrigin = null;
    State.bandRect   = null;
    updatePropsPanel();
    render();
    return;
  }

  // Handle drag (resize / rotate) takes priority
  if (State.dragMode) {
    State.dragMode         = null;
    State.dragHandle       = null;
    State.dragOrigin       = null;
    State.dragElementSnap  = null;
    State.rotateCenter     = null;
    State.rotateStartAngle = null;
    pushHistory();
    updatePropsPanel();
    render();
    return;
  }

  State.moveStart       = null;
  State.multiMoveOrigins = null;

  if (!State.drawing) return;
  State.drawing = false;

  if (State.tool === 'pen') {
    if (State.penPoints.length > 2) {
      const el = { id: uid(), type: 'pen', points: [...State.penPoints],
                   strokeColor: State.defStroke, strokeWidth: State.defSW,
                   lineStyle: State.defLineStyle, opacity: 100 };
      State.elements.push(el);
      State.selected = el.id;
      pushHistory();
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
  pushHistory();
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
  pushHistory();
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

    if (e.key === 'Escape') {
      State.selected = null;
      State.multiSelected.clear();
      render();
      updatePropsPanel();
      e.preventDefault();
      setTool('select');
      return;
    }

    if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      duplicateSelected();
      return;
    }

    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && (State.selected || State.multiSelected.size)) {
      deleteSelected();
      return;
    }

    // Inside window.addEventListener('keydown', ...)
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'h') { e.preventDefault(); flipSelection('horizontal'); }
      if (e.key === 'v') { e.preventDefault(); flipSelection('vertical'); }
      if (e.key === 'r') { e.preventDefault(); rotateSelection(90); }
    }

    const shortcuts = { v: 'select', r: 'rect', e: 'ellipse', l: 'line', a: 'arrow', t: 'text', p: 'pen' };
    const t = shortcuts[e.key.toLowerCase()];
    if (t) setTool(t);
  });
}

// ── Tool selection ───────────────────────────────────────────
function initToolButtons() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });
  State.selected = [];
}

function setTool(t) {
  State.tool = t;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === t);
  });
  canvas.className = t === 'select' ? 'cursor-select' : t === 'text' ? 'cursor-text' : '';
  State.selected = [];
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
   'p-fill-check', 'p-player-type', 'p-player-size', 'p-line-style',
   'prop-subscript'].forEach(id => {
    document.getElementById(id).addEventListener('input',  syncPropsToElement);
    document.getElementById(id).addEventListener('change', syncPropsToElement);
  });
}

function updatePropsPanel() {
  const panel = document.getElementById('props');
  const propsEl = document.getElementById('props');
  const groupPropsEl = document.getElementById('group-props');
  
  const hasSingle = !!State.selected;
  const hasMulti  = State.multiSelected.size > 1;

  // Show individual props only if exactly one thing is selected
  propsEl.style.display = (hasSingle && !hasMulti) ? 'block' : 'none';

  // Show group props if multiple things are selected
  groupPropsEl.style.display = hasMulti ? 'block' : 'none';

  // Hide props when multiple items selected — no single element to inspect
  if (State.multiSelected.size > 1) { panel.classList.remove('visible'); return; }
  
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
    document.getElementById('p-player-type').value  = el.playerType  ?? 'F';
    document.getElementById('p-player-size').value  = el.fontSize    ?? 32;
    document.getElementById('p-is-coach').checked   = !!el.isCoach;
    document.getElementById('row-is-coach').style.display = 'flex';
    document.getElementById('prop-subscript').value = el.subscript   ?? '';
  }
  
  if (isStrokable) document.getElementById('p-line-style').value = el.lineStyle ?? 'solid';
}

function syncPropsToElement() {
  if (!State.selected) return;
  const el = State.elements.find(e => e.id === State.selected);
  if (!el) return;

  // Debounce: don't flood history while dragging a slider
  clearTimeout(syncPropsToElement._t);
  syncPropsToElement._t = setTimeout(pushHistory, 400);

  el.strokeColor = document.getElementById('p-stroke').value;
  el.opacity     = +document.getElementById('p-opacity').value;

  if (el.type === 'player') {
    el.playerType  = document.getElementById('p-player-type').value;
    el.fontSize    = parseInt(document.getElementById('p-player-size').value);
    const subVal   = document.getElementById('prop-subscript').value.trim();
    el.subscript   = subVal === '' ? null : subVal;
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
  const ids = allSelectedIds();
  if (!ids.length) return;
  pushHistory();
  State.elements    = State.elements.filter(e => !ids.includes(e.id));
  State.selected    = null;
  State.multiSelected.clear();
  updatePropsPanel();
  render();
}

// ── Duplicate ────────────────────────────────────────────────
function duplicateSelected() {
  const ids = allSelectedIds();
  if (!ids.length) return;
  const newIds = [];
  ids.forEach(id => {
    const el = State.elements.find(e => e.id === id);
    if (!el) return;
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = uid();
    // Offset so it doesn't land exactly on top
    copy.x = (copy.x ?? 0) + 16;
    copy.y = (copy.y ?? 0) + 16;
    if (copy.points) copy.points = copy.points.map(([px, py]) => [px + 16, py + 16]);
    State.elements.push(copy);
    newIds.push(copy.id);
  });
  // Select the duplicates
  State.multiSelected.clear();
  if (newIds.length === 1) {
    State.selected = newIds[0];
  } else {
    newIds.forEach(id => State.multiSelected.add(id));
    State.selected = newIds[newIds.length - 1];
  }
  pushHistory();
  updatePropsPanel();
  render();
  showToast(`✓ Duplicated ${newIds.length} element${newIds.length > 1 ? 's' : ''}`);
}

/** Returns array of all currently selected IDs (single + multi). */
function allSelectedIds() {
  const ids = new Set(State.multiSelected);
  if (State.selected) ids.add(State.selected);
  return [...ids];
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

  if (el.type === 'puck' && handle === 'scale') {
    el.r = Math.max(4, Math.round((origEl.r ?? 12) + (dx + dy) / 2));
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
/** Returns the {x, y, w, h} bounding box of all currently selected elements */
function getSelectionBounds() {
  const ids = Array.from(State.multiSelected);
  if (ids.length === 0 && State.selected) ids.push(State.selected);
  if (ids.length === 0) return null;

  const selectedEls = State.elements.filter(el => ids.includes(el.id));
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  selectedEls.forEach(el => {
    const { x, y, w, h } = el;
    // For simple points (pylons/players), w/h might be 0, use radius/fontSize
    const width = w || (el.fontSize || 20);
    const height = h || (el.fontSize || 20);
    
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, 
           cx: minX + (maxX - minX) / 2, cy: minY + (maxY - minY) / 2 };
}