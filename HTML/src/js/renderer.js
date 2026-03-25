// ─────────────────────────────────────────────────────────────
//  renderer.js  —  all canvas drawing logic
// ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const wrap   = document.getElementById('canvas-wrap');

// Keep canvas pixel-perfect on resize
function initRenderer() {
  new ResizeObserver(() => {
    canvas.width  = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    render();
  }).observe(wrap);
}

// ── Main render loop ─────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  State.elements.forEach(el => drawElement(el, el.id === State.selected));
  if (State.editingText) drawTextCursor();
}

// ── Individual element drawing ───────────────────────────────
function drawElement(el, selected) {
  ctx.save();
  ctx.globalAlpha  = el.opacity / 100;
  ctx.strokeStyle  = el.strokeColor ?? '#e8e8e8';
  ctx.lineWidth    = el.strokeWidth  ?? 2;
  ctx.lineCap      = 'round';
  ctx.lineJoin     = 'round';

  switch (el.type) {
    case 'rect':    drawRect(el);    break;
    case 'ellipse': drawEllipse(el); break;
    case 'line':    drawLine(el);    break;
    case 'arrow':   drawArrow(el);   break;
    case 'pen':     drawPen(el);     break;
    case 'text':    drawText(el);    break;
    case 'player':  drawPlayer(el);  break;
  }

  if (selected) drawSelection(el);
  ctx.restore();
}

function drawRect(el) {
  if (el.fillColor) {
    ctx.fillStyle = hexAlpha(el.fillColor, el.opacity);
    ctx.fillRect(el.x, el.y, el.w, el.h);
  }
  ctx.strokeRect(el.x, el.y, el.w, el.h);
}

function drawEllipse(el) {
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const rx = Math.abs(el.w / 2), ry = Math.abs(el.h / 2);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (el.fillColor) { ctx.fillStyle = hexAlpha(el.fillColor, el.opacity); ctx.fill(); }
  ctx.stroke();
}

function drawLine(el) {
  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x + el.w, el.y + el.h);
  ctx.stroke();
}

function drawArrow(el) {
  const x2 = el.x + el.w, y2 = el.y + el.h;
  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const ang = Math.atan2(y2 - el.y, x2 - el.x);
  const hs  = Math.max(10, (el.strokeWidth ?? 2) * 3.5);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hs * Math.cos(ang - 0.4), y2 - hs * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - hs * Math.cos(ang + 0.4), y2 - hs * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fillStyle = el.strokeColor ?? '#e8e8e8';
  ctx.fill();
}

function drawPen(el) {
  if (el.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(el.points[0][0], el.points[0][1]);
  el.points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.stroke();
}

function drawText(el) {
  ctx.font      = `${el.fontSize ?? 20}px sans-serif`;
  ctx.fillStyle = el.strokeColor ?? '#e8e8e8';
  const txt     = el.id === State.editingText?.id ? State.textCursor : (el.text ?? '');
  ctx.fillText(txt, el.x, el.y + (el.fontSize ?? 20));
}

// Player radius in px — fixed size
const PLAYER_R = 16;

function drawPlayer(el) {
  const color = el.strokeColor ?? '#e8e8e8';
  const label = el.playerType  ?? 'F';

  // Circle outline
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Label — bold, centered, same color
  const fontSize = label.length > 1 ? 13 : 15;
  ctx.font      = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, el.x, el.y);

  // Reset canvas text alignment so other draw calls aren't affected
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── Selection indicators ─────────────────────────────────────
function drawSelection(el) {
  ctx.save();
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.globalAlpha = 1;

  if (el.type === 'line' || el.type === 'arrow') {
    selDot(el.x, el.y);
    selDot(el.x + el.w, el.y + el.h);
  } else if (el.type === 'player') {
    ctx.strokeRect(
      el.x - PLAYER_R - 4, el.y - PLAYER_R - 4,
      (PLAYER_R + 4) * 2,  (PLAYER_R + 4) * 2
    );
  } else if (el.type === 'pen') {
    const bb = penBounds(el.points);
    ctx.strokeRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8);
  } else if (el.type === 'text') {
    ctx.font = `${el.fontSize ?? 20}px sans-serif`;
    const txt = el.id === State.editingText?.id ? State.textCursor : (el.text ?? '');
    const mw  = ctx.measureText(txt || ' ').width;
    ctx.strokeRect(el.x - 2, el.y, mw + 4, (el.fontSize ?? 20) * 1.4);
  } else {
    ctx.strokeRect(el.x - 4, el.y - 4, (el.w || 1) + 8, (el.h || 1) + 8);
  }
  ctx.restore();
}

function selDot(x, y) {
  ctx.save();
  ctx.fillStyle   = '#ff6b35';
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTextCursor() {
  const el = State.elements.find(e => e.id === State.editingText?.id);
  if (!el) return;
  ctx.font = `${el.fontSize ?? 20}px sans-serif`;
  const cw = ctx.measureText(State.textCursor).width;
  ctx.save();
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(el.x + cw, el.y);
  ctx.lineTo(el.x + cw, el.y + (el.fontSize ?? 20) + 4);
  ctx.stroke();
  ctx.restore();
}

// ── Live preview while drawing ───────────────────────────────
function renderDragPreview(a, b) {
  render();
  const dx = b.x - a.x, dy = b.y - a.y;
  ctx.save();
  ctx.strokeStyle = State.defStroke;
  ctx.lineWidth   = State.defSW;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  switch (State.tool) {
    case 'rect':
      if (State.defFillOn) { ctx.fillStyle = State.defFill; ctx.fillRect(a.x, a.y, dx, dy); }
      ctx.strokeRect(a.x, a.y, dx, dy);
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(a.x + dx / 2, a.y + dy / 2, Math.abs(dx / 2), Math.abs(dy / 2), 0, 0, Math.PI * 2);
      if (State.defFillOn) { ctx.fillStyle = State.defFill; ctx.fill(); }
      ctx.stroke();
      break;
    case 'line':
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      break;
    case 'arrow': {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const ang = Math.atan2(dy, dx), hs = Math.max(10, State.defSW * 3.5);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - hs * Math.cos(ang - 0.4), b.y - hs * Math.sin(ang - 0.4));
      ctx.lineTo(b.x - hs * Math.cos(ang + 0.4), b.y - hs * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fillStyle = State.defStroke;
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function renderPenPreview(pts) {
  render();
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = State.defStroke;
  ctx.lineWidth   = State.defSW;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.stroke();
  ctx.restore();
}

// ── Utilities ────────────────────────────────────────────────
function hexAlpha(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity / 100})`;
}

function penBounds(pts) {
  let minX = pts[0][0], maxX = pts[0][0], minY = pts[0][1], maxY = pts[0][1];
  pts.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
