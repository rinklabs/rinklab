// ─────────────────────────────────────────────────────────────
//  renderer.js  —  all canvas drawing logic
// ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const wrap   = document.getElementById('canvas-wrap');

// ── Rink → canvas transform ───────────────────────────────────
// Elements are stored in rink-coordinate space (0–RINK_W × 0–RINK_H).
// This transform maps rink coords to canvas pixels at render time,
// matching exactly how the SVG rink is positioned via preserveAspectRatio.
let _rinkTransform = { x: 0, y: 0, s: 1 };

function computeRinkTransform() {
  const isHalf = getRinkView() === 'half';
  const vbW    = isHalf ? HALF_X : RINK_W;
  const vbH    = RINK_H;
  const cW     = canvas.width;
  const cH     = canvas.height;
  const s      = Math.min(cW / vbW, cH / vbH);
  const x      = isHalf ? 0 : (cW - s * vbW) / 2;
  const y      = (cH - s * vbH) / 2;
  _rinkTransform = { x, y, s };
  return _rinkTransform;
}

function getRinkTransform() { return _rinkTransform; }

// Size the canvas backing store at physical pixels so rendering is crisp on
// HiDPI / retina screens. CSS size is kept at logical (CSS) pixels so the
// element occupies the same layout space — the browser then maps the denser
// backing store onto that area, giving sharper lines and text.
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = wrap.clientWidth  * dpr;
  canvas.height = wrap.clientHeight * dpr;
  canvas.style.width  = wrap.clientWidth  + 'px';
  canvas.style.height = wrap.clientHeight + 'px';
}

function initRenderer() {
  resizeCanvas();
  computeRinkTransform();

  new ResizeObserver(() => {
    resizeCanvas();
    computeRinkTransform();
    render();
  }).observe(wrap);
}

// ── Main render loop ─────────────────────────────────────────
function render() {
  const rT = computeRinkTransform();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(rT.x, rT.y);
  ctx.scale(rT.s, rT.s);

  State.elements.forEach(el => drawElement(el, el.id === State.selected || State.multiSelected.has(el.id)));
  if (State.editingText) drawTextCursor();

  // Rubber-band selection box (coords are in rink space)
  if (State.bandRect) {
    const { x, y, w, h } = State.bandRect;
    ctx.save();
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth   = 1 / rT.s;
    ctx.setLineDash([4 / rT.s, 3 / rT.s]);
    ctx.fillStyle   = 'rgba(255,107,53,0.06)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  ctx.restore();
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
    case 'pen':      drawPen(el);      break;
    case 'penArrow': drawPenArrow(el); break;
    case 'text':    drawText(el);    break;
    case 'player':  drawPlayer(el);  break;
    case 'pylon':   drawPylon(el);   break;
    case 'net':     drawNet(el);     break;
    case 'puck':    drawPuck(el);    break;
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
  } else if (el.lineStyle === 'cross') {
    crossoverLinePath(el.x, el.y, el.x + el.w, el.y + el.h, el.strokeWidth ?? 2);
  } else {
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x + el.w, el.y + el.h);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// Returns the arrowhead reach (and shaft cutoff distance) for a given element.
function arrowHeadSize(el) {
  const sw = el.strokeWidth ?? 2;
  return (el.arrowHead === 'large' || el.arrowHead === 'chevron')
    ? Math.max(24, sw * 8)
    : Math.max(10, sw * 3.5);  // 'small' (default)
}

// Draws the arrowhead at (tipX, tipY) pointing in direction `ang`.
// style: 'small' | 'large' — filled triangle; 'chevron' — open > shape.
function drawArrowHead(tipX, tipY, ang, hs, style, color, strokeWidth) {
  if (style === 'chevron') {
    ctx.beginPath();
    ctx.moveTo(tipX - hs * Math.cos(ang - 0.5), tipY - hs * Math.sin(ang - 0.5));
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX - hs * Math.cos(ang + 0.5), tipY - hs * Math.sin(ang + 0.5));
    ctx.lineWidth   = strokeWidth ?? 2;
    ctx.strokeStyle = color;
    ctx.setLineDash([]);
    ctx.stroke();
  } else {
    // Filled triangle — same geometry for 'small' and 'large', size differs via hs
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - hs * Math.cos(ang - 0.4), tipY - hs * Math.sin(ang - 0.4));
    ctx.lineTo(tipX - hs * Math.cos(ang + 0.4), tipY - hs * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawArrow(el) {
  const x1 = el.x, y1 = el.y;
  const x2 = el.x + el.w, y2 = el.y + el.h;
  const hs  = arrowHeadSize(el);

  const tipX = x2, tipY = y2;
  const ang  = Math.atan2(y2 - y1, x2 - x1);

  applyLineStyle(el.lineStyle);
  ctx.beginPath();

  if (el.lineStyle === 'wiggle') {
    const pts = computeWigglyPoints(x1, y1, x2, y2);

    // Walk back from the end to find the cut point hs pixels before the tip.
    // This trims the wiggle shaft so it doesn't bleed out from under the head.
    let cutIdx = 0;
    let acc = 0;
    for (let i = pts.length - 1; i > 0; i--) {
      acc += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
      if (acc >= hs) { cutIdx = i; break; }
    }

    // Tip is the last wiggle point; tangent averaged from a few steps back
    // for a stable, natural-looking head direction.
    const last = pts[pts.length - 1];
    const ref  = pts[Math.max(0, pts.length - 5)];
    // tipX = last[0]; tipY = last[1];
    // ang  = Math.atan2(last[1] - ref[1], last[0] - ref[0]);

    // Draw only up to the cut point
    for (let i = 0; i <= cutIdx; i++) {
      i === 0 ? ctx.moveTo(pts[i][0], pts[i][1]) : ctx.lineTo(pts[i][0], pts[i][1]);
    }
  } else {
    // For straight lines, stop exactly at the base of the arrowhead.
    const baseX = tipX - hs * Math.cos(ang);
    const baseY = tipY - hs * Math.sin(ang);
    if (el.lineStyle === 'cross') {
      crossoverLinePath(x1, y1, baseX, baseY, el.strokeWidth ?? 2);
    } else {
      ctx.moveTo(x1, y1);
      ctx.lineTo(baseX, baseY);
    }
  }

  ctx.stroke();
  ctx.setLineDash([]);
  drawArrowHead(tipX, tipY, ang, hs, el.arrowHead ?? 'small',
                el.strokeColor ?? '#000000', el.strokeWidth);
}

function drawPen(el) {
  if (el.points.length < 2) return;
  applyLineStyle(el.lineStyle);
  ctx.beginPath();
  if (el.lineStyle === 'wiggle') {
    wigglyPenPath(el.points);
  } else if (el.lineStyle === 'cross') {
    crossoverPenPath(el.points, el.strokeWidth ?? 2);
  } else {
    ctx.moveTo(el.points[0][0], el.points[0][1]);
    el.points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPenArrow(el) {
  if (el.points.length < 2) return;
  const pts = el.points;
  const hs  = arrowHeadSize(el);

  // End tangent: average direction over the last few captured points
  // for a stable arrow angle that isn't jittered by the last tiny segment.
  const last = pts[pts.length - 1];
  const ref  = pts[Math.max(0, pts.length - 5)];
  const tipX = last[0], tipY = last[1];
  const ang  = Math.atan2(last[1] - ref[1], last[0] - ref[0]);

  // Walk back along the path to find where the shaft should end,
  // so the line doesn't bleed out from under the arrowhead.
  let cutIdx = 0;
  let acc    = 0;
  for (let i = pts.length - 1; i > 0; i--) {
    acc += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
    if (acc >= hs) { cutIdx = i; break; }
  }

  applyLineStyle(el.lineStyle);
  ctx.beginPath();
  if (el.lineStyle === 'wiggle') {
    wigglyPenPath(pts.slice(0, cutIdx + 1));
  } else if (el.lineStyle === 'cross') {
    crossoverPenPath(pts.slice(0, cutIdx + 1), el.strokeWidth ?? 2);
  } else {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= cutIdx; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead at the tip of the stroke
  drawArrowHead(tipX, tipY, ang, hs, el.arrowHead ?? 'small',
                el.strokeColor ?? '#000000', el.strokeWidth);
}

function drawText(el) {
  ctx.font      = `${el.fontSize ?? 20}px sans-serif`;
  ctx.fillStyle = el.strokeColor ?? '#000000';
  const txt     = el.id === State.editingText?.id ? State.textCursor : (el.text ?? '');
  ctx.fillText(txt, el.x, el.y + (el.fontSize ?? 20));
}

// Player token radius is derived from fontSize so it scales with the size picker
function playerRadius(el) { return (el.fontSize ?? 32) / 2; }

function drawPlayer(el) {
  const r     = playerRadius(el);
  const color = el.strokeColor ?? '#000000';

  // Circle outline (coach mode)
  if (el.isCoach) {
    ctx.beginPath();
    ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = Math.max(2, r * 0.15);
    ctx.stroke();
  }

  // Main label — shift slightly up-left when a subscript is present
  const label    = el.playerType ?? 'F';
  const fontSize = label.length > 1 ? r * 0.9 : r * 1.1;
  const hasSubscript = el.subscript != null && el.subscript !== '';

  // Nudge the main label toward top-left to make room
  const labelOffsetX = hasSubscript ? -r * 0.15 : 0;
  const labelOffsetY = hasSubscript ? -r * 0.15 : 0;

  ctx.font         = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle    = color;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, el.x + labelOffsetX, el.y + labelOffsetY);

  // Subscript — bottom-right of the label
  if (hasSubscript) {
    const subSize = fontSize * 0.55;
    const subX    = el.x + r * 0.45;
    const subY    = el.y + r * 0.45;

    ctx.font         = `bold ${subSize}px sans-serif`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(el.subscript), subX, subY);
  }

  // Reset text props
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawPylon(el) {
  const img = getSpriteImage('pylon', el.strokeColor, el.fillColor);
  if (img) {
    // Normalise so x/y is always the top-left regardless of drag direction
    const nx = el.w >= 0 ? el.x : el.x + el.w;
    const ny = el.h >= 0 ? el.y : el.y + el.h;
    ctx.drawImage(img, nx, ny, Math.abs(el.w), Math.abs(el.h));
  } else {
    // Fallback while the sprite is loading
    const { x, y, w, h } = el;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h * 0.8);
    ctx.lineTo(x,     y + h * 0.8);
    ctx.closePath();
    ctx.fillStyle = el.fillColor ?? '#ff8c00';
    ctx.fill();
    ctx.stroke();
  }
}

function drawNet(el) {
  const img = getSpriteImage('net', el.strokeColor, el.fillColor);
  if (img) {
    const nx = el.w >= 0 ? el.x : el.x + el.w;
    const ny = el.h >= 0 ? el.y : el.y + el.h;
    ctx.drawImage(img, nx, ny, Math.abs(el.w), Math.abs(el.h));
  } else {
    // Fallback while the sprite is loading
    const absW = Math.abs(el.w), absH = Math.abs(el.h);
    const ox = el.w < 0 ? el.x + el.w : el.x;
    const oy = el.h < 0 ? el.y + el.h : el.y;
    ctx.beginPath();
    ctx.moveTo(ox,        oy);
    ctx.lineTo(ox + absW, oy);
    ctx.lineTo(ox + absW, oy + absH * 0.6);
    ctx.quadraticCurveTo(ox + absW, oy + absH, ox + absW / 2, oy + absH);
    ctx.quadraticCurveTo(ox, oy + absH, ox, oy + absH * 0.6);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawPuck(el) {
  const r = 6;
  // Black rubber disc with a subtle highlight ring
  ctx.beginPath();
  ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#111111';
  ctx.fill();
  // Thin highlight ring so it reads against dark backgrounds
  ctx.beginPath();
  ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

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
  const hasBox = !['line', 'arrow', 'player', 'puck'].includes(el.type);

  // Puck gets a dashed circle (same pattern as player)
  if (el.type === 'puck') {
    const r = el.r ?? 12;
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.arc(el.x, el.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Player gets a dashed circle instead of a rect
  if (el.type === 'player') {
    const r = playerRadius(el);
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.arc(el.x, el.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (hasBox) {
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);

    if (el.type === 'pen' || el.type === 'penArrow') {
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
  const rT = getRinkTransform();
  const dx = b.x - a.x, dy = b.y - a.y;
  ctx.save();
  ctx.translate(rT.x, rT.y);
  ctx.scale(rT.s, rT.s);
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
      } else if (State.defLineStyle === 'cross') {
        crossoverLinePath(a.x, a.y, b.x, b.y, State.defSW);
      } else {
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'arrow': {
      const hs  = (State.defArrowHead === 'large' || State.defArrowHead === 'chevron')
                  ? Math.max(24, State.defSW * 8)
                  : Math.max(10, State.defSW * 3.5);
      let tipX = b.x, tipY = b.y;
      let ang  = Math.atan2(dy, dx);

      applyLineStyle(State.defLineStyle);
      ctx.beginPath();

      if (State.defLineStyle === 'wiggle') {
        const pts = computeWigglyPoints(a.x, a.y, b.x, b.y);
        let cutIdx = 0, acc = 0;
        for (let i = pts.length - 1; i > 0; i--) {
          acc += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
          if (acc >= hs) { cutIdx = i; break; }
        }
        const last = pts[pts.length - 1];
        const ref  = pts[Math.max(0, pts.length - 5)];
        tipX = last[0]; tipY = last[1];
        ang  = Math.atan2(last[1] - ref[1], last[0] - ref[0]);
        for (let i = 0; i <= cutIdx; i++) {
          i === 0 ? ctx.moveTo(pts[i][0], pts[i][1]) : ctx.lineTo(pts[i][0], pts[i][1]);
        }
      } else {
        const baseX = tipX - hs * Math.cos(ang);
        const baseY = tipY - hs * Math.sin(ang);
        if (State.defLineStyle === 'cross') {
          crossoverLinePath(a.x, a.y, baseX, baseY, State.defSW);
        } else {
          ctx.moveTo(a.x, a.y); ctx.lineTo(baseX, baseY);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
      drawArrowHead(tipX, tipY, ang, hs, State.defArrowHead ?? 'small',
                    State.defStroke, State.defSW);
      break;
    }
  }
  ctx.restore();
}

function renderPenPreview(pts) {
  render();
  if (pts.length < 2) return;
  const rT = getRinkTransform();
  ctx.save();
  ctx.translate(rT.x, rT.y);
  ctx.scale(rT.s, rT.s);
  ctx.strokeStyle = State.defStroke;
  ctx.lineWidth   = State.defSW;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  const isPenArrow = State.tool === 'penArrow';
  const hs = (State.defArrowHead === 'large' || State.defArrowHead === 'chevron')
             ? Math.max(24, State.defSW * 8)
             : Math.max(10, State.defSW * 3.5);

  // Determine cut point for penArrow so the shaft stops before the head
  let drawPts = pts;
  if (isPenArrow) {
    let cutIdx = 0, acc = 0;
    for (let i = pts.length - 1; i > 0; i--) {
      acc += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
      if (acc >= hs) { cutIdx = i; break; }
    }
    drawPts = pts.slice(0, cutIdx + 1);
  }

  applyLineStyle(State.defLineStyle);
  ctx.beginPath();
  if (State.defLineStyle === 'wiggle') {
    wigglyPenPath(drawPts);
  } else if (State.defLineStyle === 'cross') {
    crossoverPenPath(drawPts, State.defSW);
  } else {
    ctx.moveTo(drawPts[0][0], drawPts[0][1]);
    drawPts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead for penArrow tool
  if (isPenArrow) {
    const last = pts[pts.length - 1];
    const ref  = pts[Math.max(0, pts.length - 5)];
    const tipX = last[0], tipY = last[1];
    const ang  = Math.atan2(last[1] - ref[1], last[0] - ref[0]);
    drawArrowHead(tipX, tipY, ang, hs, State.defArrowHead ?? 'small',
                  State.defStroke, State.defSW);
  }

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
  if (el.type === 'player' || el.type === 'puck') return { x: el.x, y: el.y };
  if (el.type === 'pen' || el.type === 'penArrow') {
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

  // Puck — scale handle on circle edge at bottom-right (45°)
  if (el.type === 'puck') {
    const r   = el.r ?? 12;
    const off = r / Math.SQRT2;
    return [{ id: 'scale', x: el.x + off, y: el.y + off }];
  }

  // Player — scale handle on the circle edge at bottom-right (45°)
  if (el.type === 'player') {
    const r   = playerRadius(el);
    const off = r / Math.SQRT2;  // position on circle circumference at 45°
    return [{ id: 'scale', x: el.x + off, y: el.y + off }];
  }

  // Pen / PenArrow — four bounding-box corners, no rotation
  if (el.type === 'pen' || el.type === 'penArrow') {
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
 * Returns the discrete sample points of a sine-wave path between two points.
 * Used by both wigglyLinePath (for rendering) and drawArrow (for end-tangent).
 */
function computeWigglyPoints(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return [[x1, y1], [x2, y2]];
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const amp   = 4;
  const freq  = Math.PI * 2 / 24;
  const steps = Math.max(30, Math.ceil(len / 3));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t    = i / steps;
    const dist = t * len;
    const wave = amp * Math.sin(dist * freq);
    pts.push([x1 + t * dx + wave * nx, y1 + t * dy + wave * ny]);
  }
  return pts;
}

/**
 * Adds a solid shaft plus evenly-spaced perpendicular tick marks to the
 * current path, for the 'cross' line style on straight segments.
 * Does NOT call ctx.stroke() — caller does that.
 */
function crossoverLinePath(x1, y1, x2, y2, sw) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;   // unit vector along line
  const nx = -uy,  ny = ux;              // unit normal (perpendicular)
  const halfTick = Math.max(8, sw * 3.5) / 2;
  const spacing  = 14;

  // Main shaft
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);

  // Ticks centred along the shaft, margins equal at both ends
  const count  = Math.floor(len / spacing);
  const margin = (len - count * spacing) / 2;
  for (let i = 0; i <= count; i++) {
    const t  = margin + i * spacing;
    const px = x1 + ux * t;
    const py = y1 + uy * t;
    ctx.moveTo(px - nx * halfTick, py - ny * halfTick);
    ctx.lineTo(px + nx * halfTick, py + ny * halfTick);
  }
}

/**
 * Adds a shaft plus perpendicular tick marks for an arbitrary polyline,
 * for the 'cross' line style on pen strokes.
 * Ticks are spaced by arc length so density stays consistent on curves.
 * Does NOT call ctx.stroke() — caller does that.
 */
function crossoverPenPath(pts, sw) {
  if (pts.length < 2) return;
  const halfTick = Math.max(8, sw * 3.5) / 2;
  const spacing  = 14;

  // Main shaft
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);

  // Walk the polyline and place ticks at regular arc-length intervals
  let acc      = 0;
  let nextTick = spacing / 2;   // start half a spacing in so first tick isn't right at the origin

  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    if (segLen < 0.5) continue;
    const ux = (x2 - x1) / segLen, uy = (y2 - y1) / segLen;
    const nx = -uy, ny = ux;

    while (nextTick <= acc + segLen) {
      const t  = nextTick - acc;
      const px = x1 + ux * t;
      const py = y1 + uy * t;
      ctx.moveTo(px - nx * halfTick, py - ny * halfTick);
      ctx.lineTo(px + nx * halfTick, py + ny * halfTick);
      nextTick += spacing;
    }
    acc += segLen;
  }
}

/**
 * Builds a sine-wave path between two points directly into ctx.
 * Does NOT call ctx.stroke() — caller does that.
 */
function wigglyLinePath(x1, y1, x2, y2) {
  const pts = computeWigglyPoints(x1, y1, x2, y2);
  ctx.beginPath();
  pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
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

/**
 * Calculates the bounding box of the current selection (single or multi)
 */
function getSelectionBounds() {
  const selectedIds = Array.from(State.multiSelected);
  if (State.selected) selectedIds.push(State.selected);
  
  if (selectedIds.length === 0) return null;

  const selectedEls = State.elements.filter(el => selectedIds.includes(el.id));
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  selectedEls.forEach(el => {
    // Determine bounds based on element type
    const x = el.x;
    const y = el.y;
    const w = el.w || (el.type === 'player' ? el.fontSize : 20);
    const h = el.h || (el.type === 'player' ? el.fontSize : 20);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  return {
    x: minX, y: minY, w: maxX - minX, h: maxY - minY,
    cx: minX + (maxX - minX) / 2,
    cy: minY + (maxY - minY) / 2
  };
}

function flipSelection(axis = 'horizontal') {
  const bounds = getSelectionBounds();
  if (!bounds) return;
  pushHistory();

  const selectedIds = Array.from(State.multiSelected);
  if (State.selected) selectedIds.push(State.selected);

  State.elements.forEach(el => {
    if (selectedIds.includes(el.id)) {
      if (axis === 'horizontal') {
        // Reflect across the vertical center line
        const distToCenter = el.x - bounds.cx;
        el.x = bounds.cx - distToCenter - (el.w || 0);
        if (el.angle !== undefined) el.angle = -el.angle;
      } else {
        // Reflect across the horizontal center line
        const distToCenter = el.y - bounds.cy;
        el.y = bounds.cy - distToCenter - (el.h || 0);
        if (el.angle !== undefined) el.angle = Math.PI - el.angle;
      }
    }
  });
  render();
}

function rotateSelection(degrees) {
  const bounds = getSelectionBounds();
  if (!bounds) return;
  pushHistory();

  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const ids = [...new Set([...State.multiSelected, ...(State.selected ? [State.selected] : [])])];

  State.elements.forEach(el => {
    if (!ids.includes(el.id)) return;

    if (el.type === 'pen' || el.type === 'penArrow') {
      // Rotate every point around the group center
      el.points = el.points.map(([px, py]) => {
        const dx = px - bounds.cx, dy = py - bounds.cy;
        return [bounds.cx + dx * cos - dy * sin,
                bounds.cy + dx * sin + dy * cos];
      });
    } else {
      // Rotate the element's visual center around the group center
      const c  = getElementCenter(el);
      const dx = c.x - bounds.cx, dy = c.y - bounds.cy;
      const ncx = bounds.cx + dx * cos - dy * sin;
      const ncy = bounds.cy + dx * sin + dy * cos;

      // Recompute top-left from new center
      if (el.type === 'player' || el.type === 'puck') {
        el.x = ncx;
        el.y = ncy;
      } else {
        el.x = ncx - (el.w ?? 0) / 2;
        el.y = ncy - (el.h ?? 0) / 2;
      }

      // Accumulate element's own rotation angle
      el.angle = (el.angle ?? 0) + rad;
    }
  });

  render();
}
