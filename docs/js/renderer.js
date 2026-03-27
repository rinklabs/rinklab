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
  ctx.strokeStyle  = el.strokeColor ?? '#000000';
  ctx.lineWidth    = el.strokeWidth  ?? 2;
  ctx.lineCap      = 'round';
  ctx.lineJoin     = 'round';

  // Apply rotation around element centre (for types that support it)
  const angle = el.angle ?? 0;
  if (angle) {
    const c = getElementCenter(el);
    ctx.translate(c.x, c.y);
    ctx.rotate(angle);
    ctx.translate(-c.x, -c.y);
  }

  switch (el.type) {
    case 'rect':    drawRect(el);    break;
    case 'ellipse': drawEllipse(el); break;
    case 'line':    drawLine(el);    break;
    case 'arrow':   drawArrow(el);   break;
    case 'pen':     drawPen(el);     break;
    case 'text':    drawText(el);    break;
    case 'player':  drawPlayer(el);  break;
    case 'pylon':   drawPylon(el);   break;
    case 'net':     drawNet(el);     break;
  }

  ctx.restore();
  // Draw selection handles in screen space (after restoring the rotation transform)
  if (selected) drawSelection(el);
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
  applyLineStyle(el.lineStyle);
  ctx.beginPath();
  if (el.lineStyle === 'wiggle') {
    wigglyLinePath(el.x, el.y, el.x + el.w, el.y + el.h);
  } else {
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x + el.w, el.y + el.h);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawArrow(el) {
  const x2 = el.x + el.w, y2 = el.y + el.h;
  applyLineStyle(el.lineStyle);
  ctx.beginPath();
  if (el.lineStyle === 'wiggle') {
    wigglyLinePath(el.x, el.y, x2, y2);
  } else {
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead is always solid
  const ang = Math.atan2(y2 - el.y, x2 - el.x);
  const hs  = Math.max(10, (el.strokeWidth ?? 2) * 3.5);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hs * Math.cos(ang - 0.4), y2 - hs * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - hs * Math.cos(ang + 0.4), y2 - hs * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fillStyle = el.strokeColor ?? '#000000';
  ctx.fill();
}

function drawPen(el) {
  if (el.points.length < 2) return;
  applyLineStyle(el.lineStyle);
  ctx.beginPath();
  if (el.lineStyle === 'wiggle') {
    wigglyPenPath(el.points);
  } else {
    ctx.moveTo(el.points[0][0], el.points[0][1]);
    el.points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawText(el) {
  ctx.font      = `${el.fontSize ?? 20}px sans-serif`;
  ctx.fillStyle = el.strokeColor ?? '#000000';
  const txt     = el.id === State.editingText?.id ? State.textCursor : (el.text ?? '');
  ctx.fillText(txt, el.x, el.y + (el.fontSize ?? 20));
}

// Player radius in px — fixed size
const PLAYER_R = 16;

function drawPlayer(el) {
  ctx.save();
  ctx.globalAlpha = el.opacity / 100;
  ctx.fillStyle   = el.strokeColor; // This uses the Black default we set
  
  // Use the saved fontSize from the element, or default to 32
  const size = el.fontSize || 32;
  ctx.font = `bold ${size}px sans-serif`;
  
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(el.playerType, el.x, el.y);
  ctx.restore();
}

function drawPylon(el) {
  const { x, y, w, h } = el;

  // Body (triangle)
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);          // apex
  ctx.lineTo(x + w,     y + h * 0.8); // bottom-right
  ctx.lineTo(x,         y + h * 0.8); // bottom-left
  ctx.closePath();
  if (el.fillColor) {
    ctx.fillStyle = hexAlpha(el.fillColor, el.opacity);
    ctx.fill();
  }
  ctx.stroke();

  // Base
  ctx.beginPath();
  ctx.rect(x - w * 0.1, y + h * 0.8, w * 1.2, h * 0.2);
  if (el.fillColor) {
    ctx.fillStyle = hexAlpha(el.fillColor, el.opacity);
    ctx.fill();
  }
  ctx.stroke();
}

function drawNet(el) {
  const { x, y, w, h } = el;
  // Net shape: crossbar across the top, two posts dropping down,
  // curving back to meet in the middle — works for any drag size/direction.
  const absW = Math.abs(w), absH = Math.abs(h);
  const ox = w < 0 ? el.x + w : el.x; // normalised origin
  const oy = h < 0 ? el.y + h : el.y;

  const postW  = absW * 0.15; // depth of each side post
  const neckY  = absH * 0.35; // where the back-curve starts

  ctx.beginPath();
  // Crossbar (front opening)
  ctx.moveTo(ox,         oy);
  ctx.lineTo(ox + absW,  oy);
  // Right post down
  ctx.lineTo(ox + absW,  oy + neckY);
  // Curve to back centre
  ctx.quadraticCurveTo(ox + absW, oy + absH, ox + absW / 2, oy + absH);
  // Curve back up left side
  ctx.quadraticCurveTo(ox,        oy + absH, ox, oy + neckY);
  // Left post back up to crossbar
  ctx.lineTo(ox, oy);
  ctx.closePath();

  if (el.fillColor) {
    ctx.fillStyle = hexAlpha(el.fillColor, el.opacity);
    ctx.fill();
  }
  ctx.stroke();

  // Posts (filled circles at crossbar ends)
  const pr = Math.max(2, (el.strokeWidth ?? 2) * 1.5);
  ctx.fillStyle = el.strokeColor ?? '#000000';
  [ox, ox + absW].forEach(px => {
    ctx.beginPath();
    ctx.arc(px, oy, pr, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── Selection handles ────────────────────────────────────────
const HANDLE_R     = 5;    // half-size of resize handle squares
const HANDLE_HIT_R = 9;    // hit-detection radius (slightly larger for usability)
const ROT_OFFSET   = 22;   // px above element top for rotation handle

function drawSelection(el) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  const handles  = getElementHandles(el);
  const rotH     = handles.find(h => h.id === 'rot');
  const resizeH  = handles.filter(h => h.id !== 'rot');

  // ── Dashed bounding outline ──────────────────────────
  const hasBox = !['line', 'arrow', 'player'].includes(el.type);
  if (hasBox) {
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);

    if (el.type === 'pen') {
      const bb = penBounds(el.points);
      ctx.strokeRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8);
    } else if (el.type === 'text') {
      ctx.font = `${el.fontSize ?? 20}px sans-serif`;
      const txt = el.id === State.editingText?.id ? State.textCursor : (el.text ?? '');
      const mw  = ctx.measureText(txt || ' ').width;
      ctx.strokeRect(el.x - 2, el.y, mw + 4, (el.fontSize ?? 20) * 1.4);
    } else {
      // Draw outline in the element's rotated frame
      const angle = el.angle ?? 0;
      const c = getElementCenter(el);
      if (angle) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(angle); ctx.translate(-c.x, -c.y); }
      const nx = el.w >= 0 ? el.x : el.x + el.w;
      const ny = el.h >= 0 ? el.y : el.y + el.h;
      ctx.strokeRect(nx - 4, ny - 4, Math.abs(el.w) + 8, Math.abs(el.h) + 8);
      if (angle) ctx.restore();
    }
    ctx.setLineDash([]);
  }

  // ── Rotation handle (circle + connecting line) ───────
  if (rotH) {
    const topH = handles.find(h => h.id === 'n') ?? handles.find(h => h.id === 'nw');
    ctx.strokeStyle = '#ff6b35';
    ctx.fillStyle   = '#ff6b35';
    ctx.lineWidth   = 1;
    if (topH) {
      ctx.beginPath();
      ctx.moveTo(topH.x, topH.y);
      ctx.lineTo(rotH.x, rotH.y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(rotH.x, rotH.y, HANDLE_R + 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Resize / endpoint / scale handles ────────────────
  resizeH.forEach(h => {
    if (h.id === 'p1' || h.id === 'p2') {
      selDot(h.x, h.y);
    } else if (h.id === 'scale') {
      ctx.fillStyle = '#ff6b35'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ff6b35'; ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.fillRect(h.x - HANDLE_R, h.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
      ctx.strokeRect(h.x - HANDLE_R, h.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
    }
  });

  ctx.restore();
}

function selDot(x, y) {
  ctx.save();
  ctx.fillStyle = '#ff6b35'; ctx.globalAlpha = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
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
      applyLineStyle(State.defLineStyle);
      ctx.beginPath();
      if (State.defLineStyle === 'wiggle') {
        wigglyLinePath(a.x, a.y, b.x, b.y);
      } else {
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'arrow': {
      applyLineStyle(State.defLineStyle);
      ctx.beginPath();
      if (State.defLineStyle === 'wiggle') {
        wigglyLinePath(a.x, a.y, b.x, b.y);
      } else {
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
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
  applyLineStyle(State.defLineStyle);
  ctx.beginPath();
  if (State.defLineStyle === 'wiggle') {
    wigglyPenPath(pts);
  } else {
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
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

// ── Element geometry helpers ─────────────────────────────────

/** Returns the visual center of an element in screen space (unaffected by angle). */
function getElementCenter(el) {
  if (el.type === 'player') return { x: el.x, y: el.y };
  if (el.type === 'pen') {
    const bb = penBounds(el.points);
    return { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
  }
  return { x: el.x + (el.w ?? 0) / 2, y: el.y + (el.h ?? 0) / 2 };
}

/** Rotate point (px,py) around (cx,cy) by angle radians. */
function rotatePoint(cx, cy, angle, px, py) {
  if (!angle) return { x: px, y: py };
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * Returns all interactive handle positions for an element, in screen space.
 * Each handle: { id, x, y }
 */
function getElementHandles(el) {
  const angle = el.angle ?? 0;

  // Line / arrow — two draggable endpoints, no rotation handle
  if (el.type === 'line' || el.type === 'arrow') {
    return [
      { id: 'p1', x: el.x,        y: el.y },
      { id: 'p2', x: el.x + el.w, y: el.y + el.h },
    ];
  }

  // Player — one scale handle (bottom-right of glyph), no rotation
  if (el.type === 'player') {
    const r = (el.fontSize ?? 32) / 2;
    return [{ id: 'scale', x: el.x + r, y: el.y + r }];
  }

  // Pen — four bounding-box corners, no rotation
  if (el.type === 'pen') {
    const bb = penBounds(el.points);
    return [
      { id: 'nw', x: bb.x,        y: bb.y },
      { id: 'ne', x: bb.x + bb.w, y: bb.y },
      { id: 'se', x: bb.x + bb.w, y: bb.y + bb.h },
      { id: 'sw', x: bb.x,        y: bb.y + bb.h },
    ];
  }

  // Text — no handles (use props panel for font size)
  if (el.type === 'text') return [];

  // rect / ellipse / pylon / net — 8 resize handles + rotation handle
  const nx = el.w >= 0 ? el.x : el.x + el.w;
  const ny = el.h >= 0 ? el.y : el.y + el.h;
  const nw = Math.abs(el.w || 1), nh = Math.abs(el.h || 1);
  const x2 = nx + nw, y2 = ny + nh;
  const cx = nx + nw / 2, cy = ny + nh / 2;

  const pts = [
    { id: 'nw',  x: nx, y: ny },
    { id: 'n',   x: cx, y: ny },
    { id: 'ne',  x: x2, y: ny },
    { id: 'e',   x: x2, y: cy },
    { id: 'se',  x: x2, y: y2 },
    { id: 's',   x: cx, y: y2 },
    { id: 'sw',  x: nx, y: y2 },
    { id: 'w',   x: nx, y: cy },
    { id: 'rot', x: cx, y: ny - ROT_OFFSET },
  ];

  if (!angle) return pts;
  return pts.map(p => {
    const rp = rotatePoint(cx, cy, angle, p.x, p.y);
    return { id: p.id, x: rp.x, y: rp.y };
  });
}

// ── Line style helpers ───────────────────────────────────────

/** Sets ctx dash pattern for solid / dashed / dotted. Wiggle is handled via path. */
function applyLineStyle(style) {
  switch (style) {
    case 'dashed': ctx.setLineDash([14, 7]);  ctx.lineCap = 'butt';  break;
    case 'dotted': ctx.setLineDash([2, 8]);   ctx.lineCap = 'round'; break;
    default:       ctx.setLineDash([]);        ctx.lineCap = 'round'; break; // solid + wiggle
  }
}

/**
 * Builds a sine-wave path between two points directly into ctx.
 * Does NOT call ctx.stroke() — caller does that.
 */
function wigglyLinePath(x1, y1, x2, y2) {
  const dx  = x2 - x1, dy  = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len; // unit along
  const nx = -uy,      ny =  ux;      // unit normal
  const amp   = 4;
  const freq  = Math.PI * 2 / 24;     // one full wave every 24 px
  const steps = Math.max(30, Math.ceil(len / 3));

  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t    = i / steps;
    const dist = t * len;
    const wave = amp * Math.sin(dist * freq);
    const px   = x1 + t * dx + wave * nx;
    const py   = y1 + t * dy + wave * ny;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
}

/**
 * Builds a sine-wave path that follows an arbitrary polyline (pen strokes).
 * Maintains a running arc-length so the wave frequency is consistent.
 */
function wigglyPenPath(pts) {
  const amp  = 3;
  const freq = Math.PI * 2 / 24;
  let totalLen = 0;
  let first    = true;

  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    if (segLen < 0.5) continue;

    const ux = (x2 - x1) / segLen, uy = (y2 - y1) / segLen;
    const nx = -uy, ny = ux;
    const steps = Math.max(2, Math.ceil(segLen / 3));

    for (let j = first ? 0 : 1; j <= steps; j++) {
      const t    = j / steps;
      const dist = totalLen + t * segLen;
      const wave = amp * Math.sin(dist * freq);
      const px   = x1 + t * (x2 - x1) + wave * nx;
      const py   = y1 + t * (y2 - y1) + wave * ny;
      first ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      first = false;
    }
    totalLen += segLen;
  }
}
