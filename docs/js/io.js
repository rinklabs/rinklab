// ─────────────────────────────────────────────────────────────
//  io.js  —  save / load drill JSON
// ─────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000';

// ─────────────────────────────────────────────────────────────
//  Coach identity
// ─────────────────────────────────────────────────────────────

function getCoach() {
  return (localStorage.getItem('drillLab:coach') || '').trim();
}

function initCoachField() {
  const input = document.getElementById('coach-name');
  if (!input) return;
  input.value = getCoach();
  input.addEventListener('input', () => {
    localStorage.setItem('drillLab:coach', input.value.trim());
  });
}


// ─────────────────────────────────────────────────────────────
//  Thumbnail — composites the rink SVG + drill canvas at 2×
//  the source canvas resolution for crisp print quality.
//
//  Two bugs are avoided here:
//  1. SVGs without explicit width/height on the root <svg> element
//     fail silently in drawImage() on all browsers — we inject them.
//  2. Output size must match source canvas aspect ratio (not the
//     rink's natural SVG size) so element positions stay correct.
// ─────────────────────────────────────────────────────────────

async function captureThumbnail() {
  const source = document.getElementById('c');
  if (!source || source.width === 0) return null;

  const scale = Math.min(2, 1500 / source.width);
  const W = Math.round(source.width * scale);
  const H = Math.round(source.height * scale);

  const offscreen = document.createElement('canvas');
  offscreen.width  = W;
  offscreen.height = H;
  const ctx = offscreen.getContext('2d');

  // ── Draw the rink ────────────────────────────────────────────
  // Serialise the live DOM SVG rather than fetching the file.
  // This avoids two bugs that silently break canvas drawImage():
  //   1. Inkscape SVGs have an <?xml?> prolog that Chrome refuses
  //      to render when the SVG is loaded as a blob: URL image.
  //   2. File-fetched SVGs can have duplicate/missing attributes.
  // The DOM SVG is already proven to render on screen and
  // automatically reflects the current half/full rink state.
  let rinkDrawn = false;
  const liveSvg = document.querySelector('#rink-layer svg');
  if (liveSvg) {
    await new Promise(resolve => {
      try {
        // XMLSerializer never emits an <?xml?> prolog
        let svgStr = new XMLSerializer().serializeToString(liveSvg);

        // Inject explicit pixel size — SVGs without width/height
        // attributes draw as 0x0 on canvas even with a viewBox
        svgStr = svgStr.replace(
          /(<svg\b[^>]*?)(\s*>)/,
          `$1 width="${W}" height="${H}"$2`
        );

        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url  = URL.createObjectURL(blob);
        const img  = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, W, H);
          URL.revokeObjectURL(url);
          rinkDrawn = true;
          resolve();
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        img.src = url;
      } catch (e) {
        console.warn('captureThumbnail: SVG serialise failed', e);
        resolve();
      }
    });
  }

  if (!rinkDrawn) {
    // Fallback: plain ice colour so the thumbnail is never blank
    ctx.fillStyle = '#e8f0f8';
    ctx.fillRect(0, 0, W, H);
  }

  // ── Draw drill elements on top ───────────────────────────────
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, W, H);

  return offscreen.toDataURL('image/jpeg', 0.93);
}




// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────

function initIO() {
  initCoachField();

  document.getElementById('btn-save').addEventListener('click', saveJSON);
  document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', loadJSON);
  document.getElementById('btn-save-local').addEventListener('click', saveToServer);
  document.getElementById('btn-library').addEventListener('click', openLibrary);

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear the canvas? This cannot be undone.')) return;
    pushHistory();
    State.elements  = [];
    State.selected  = null;
    State.multiSelected.clear();
    document.getElementById('drill-title').value = '';
    document.getElementById('drill-tags').value  = '';
    document.getElementById('drill-desc').value  = '';
    pushHistory();
    updatePropsPanel();
    render();
    showToast('Canvas cleared');
  });

  pushHistory();
}


// ─────────────────────────────────────────────────────────────
//  Scene helpers
// ─────────────────────────────────────────────────────────────

function buildScene() {
  const title = document.getElementById('drill-title').value.trim();
  const tags  = document.getElementById('drill-tags').value
                  .split(';').map(t => t.trim()).filter(Boolean);
  const desc  = document.getElementById('drill-desc').value.trim();

  const scene = {
    type:    'excalidraw',
    version: 2,
    source:  'rink-draw',
    metadata: {
      title:       title || 'Untitled Drill',
      tags,
      description: desc,
      savedAt:     new Date().toISOString(),
    },
    appState: {
      viewBackgroundColor: 'transparent',
      rinkView: getRinkView(),
    },
    elements: State.elements.map(serializeElement),
    files: {},
  };

  const slug = (title || 'untitled-drill')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return { scene, slug };
}

function serializeElement(el) {
  const base = {
    id:              el.id,
    type:            toExcalidrawType(el.type),
    x:               el.x,
    y:               el.y,
    width:           el.w ?? 0,
    height:          el.h ?? 0,
    angle:           el.angle ?? 0,
    strokeColor:     el.strokeColor ?? '#e8e8e8',
    backgroundColor: el.fillColor   ?? 'transparent',
    fillStyle:       el.fillColor   ? 'solid' : 'hachure',
    strokeWidth:     el.strokeWidth ?? 2,
    roughness:       1,
    opacity:         el.opacity     ?? 100,
    seed:            Math.floor(Math.random() * 100000),
    version:         1,
    isDeleted:       false,
    groupIds:        [],
    boundElements:   null,
    link:            null,
    locked:          false,
  };

  if (el.type === 'pen') {
    base.points    = el.points.map(([x, y]) => [x - el.x, y - el.y]);
    base.lineStyle = el.lineStyle ?? 'solid';
  }
  if (el.type === 'text') {
    Object.assign(base, {
      text:          el.text       ?? '',
      fontSize:      el.fontSize   ?? 20,
      fontFamily:    1,
      textAlign:     'left',
      verticalAlign: 'top',
    });
  }
  if (el.type === 'line' || el.type === 'arrow') {
    base.points    = [[0, 0], [el.w ?? 0, el.h ?? 0]];
    base.lineStyle = el.lineStyle ?? 'solid';
  }
  if (el.type === 'player') {
    base.playerType = el.playerType ?? 'F';
    base.fontSize   = el.fontSize   ?? 32;
  }
  if (el.type === 'pylon' || el.type === 'net') {
    base.backgroundColor = el.fillColor ?? 'transparent';
    base.fillStyle       = el.fillColor ? 'solid' : 'hachure';
  }
  if (el.type === 'puck') {
    base.r = el.r ?? 12;
  }

  return base;
}

function deserializeElement(el) {
  return {
    id:          el.id ?? uid(),
    type:        fromExcalidrawType(el.type),
    playerType:  el.playerType  ?? 'F',
    fontSize:    el.fontSize    ?? (el.type === 'player' ? 32 : 20),
    lineStyle:   el.lineStyle   ?? 'solid',
    angle:       el.angle       ?? 0,
    r:           el.r           ?? 12,
    x:           el.x,
    y:           el.y,
    w:           el.width       ?? 0,
    h:           el.height      ?? 0,
    strokeColor: el.strokeColor ?? '#000000',
    fillColor:   (el.backgroundColor === 'transparent' || !el.backgroundColor)
                   ? null : el.backgroundColor,
    strokeWidth: el.strokeWidth ?? 2,
    opacity:     el.opacity     ?? 100,
    text:        el.text        ?? '',
    points:      el.points      ?? null,
  };
}

function applySceneData(data) {
  if (data.appState?.rinkView) setRinkView(data.appState.rinkView);
  if (data.metadata) {
    const m = data.metadata;
    document.getElementById('drill-title').value = m.title === 'Untitled Drill' ? '' : (m.title ?? '');
    document.getElementById('drill-tags').value  = (m.tags ?? []).join('; ');
    document.getElementById('drill-desc').value  = m.description ?? '';
  }
  State.elements = (data.elements ?? []).filter(el => !el.isDeleted).map(deserializeElement);
  State.selected = null;
  State.multiSelected.clear();
  pushHistory();
  updatePropsPanel();
  render();
}


// ─────────────────────────────────────────────────────────────
//  Save JSON — browser download
// ─────────────────────────────────────────────────────────────

function saveJSON() {
  const { scene, slug } = buildScene();
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${slug}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('✓ Scene exported as JSON');
}


// ─────────────────────────────────────────────────────────────
//  Load JSON — file picker
// ─────────────────────────────────────────────────────────────

async function loadJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    applySceneData(JSON.parse(await file.text()));
    showToast('✓ Scene loaded');
  } catch (err) {
    showToast('✗ Invalid JSON: ' + err.message, true);
  }
  e.target.value = '';
}


// ─────────────────────────────────────────────────────────────
//  Save to server
// ─────────────────────────────────────────────────────────────

async function saveToServer() {
  const coach = getCoach();
  if (!coach) {
    showToast('✗ Enter your coach name on the home page first', true);
    return;
  }

  const { scene }   = buildScene();
  const thumbnail   = await captureThumbnail();

  try {
    const res = await fetch(`${API_BASE}/save-drill`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ coach, scene, thumbnail }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const { message } = await res.json();
    showToast(`✓ ${message}`);
  } catch (err) {
    showToast('✗ Could not reach server: ' + err.message, true);
  }
}


// ─────────────────────────────────────────────────────────────
//  Library
// ─────────────────────────────────────────────────────────────

async function openLibrary() {
  document.getElementById('drill-library')?.remove();

  // Floating preview that follows the mouse
  const preview = document.createElement('div');
  preview.style.cssText = `
    position: fixed; z-index: 10001; pointer-events: none;
    display: none;
    background: #1e1e2e;
    border: 1px solid #45475a;
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 8px 28px rgba(0,0,0,.65);
  `;
  const previewImg = document.createElement('img');
  previewImg.style.cssText = 'display:block; width:280px; border-radius:4px;';
  preview.appendChild(previewImg);
  document.body.appendChild(preview);

  function showPreview(src, e) {
    previewImg.src        = src;
    preview.style.display = 'block';
    movePreview(e);
  }
  function movePreview(e) {
    const gap = 16;
    const pw  = 280 + 18;   // image + padding
    const x   = (e.clientX + gap + pw > window.innerWidth)
                  ? e.clientX - pw - gap
                  : e.clientX + gap;
    const y   = Math.min(e.clientY - 40, window.innerHeight - 220);
    preview.style.left = x + 'px';
    preview.style.top  = Math.max(y, 8) + 'px';
  }
  function hidePreview() { preview.style.display = 'none'; }

  // ── Modal shell ─────────────────────────────────────────────
  const modal = document.createElement('div');
  modal.id    = 'drill-library';
  modal.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #1e1e2e; color: #cdd6f4;
    border-radius: 10px; padding: 24px;
    width: 580px; max-height: 72vh;
    overflow-y: auto; font-family: sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
  `;

  const closeRow = document.createElement('div');
  closeRow.style.cssText = 'margin-top:16px;display:flex;justify-content:flex-end;';
  closeRow.innerHTML = `<button id="lib-close"
    style="background:#45475a;color:#cdd6f4;border:none;border-radius:4px;
           padding:8px 18px;cursor:pointer;">Close</button>`;

  panel.innerHTML = `<h2 style="margin:0 0 16px;font-size:1.1rem;">📂 Drill Library</h2>`;
  panel.appendChild(closeRow);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  function closeLibrary() {
    modal.remove();
    preview.remove();
  }

  modal.addEventListener('click', e => { if (e.target === modal) closeLibrary(); });
  panel.querySelector('#lib-close').addEventListener('click', closeLibrary);

  const status = Object.assign(document.createElement('p'), {
    textContent: 'Loading…',
    style: 'color:#6c7086;margin:0 0 12px;',
  });
  panel.insertBefore(status, closeRow);

  const coach = getCoach();

  let drills;
  try {
    const res = await fetch(`${API_BASE}/list-drills?coach=${encodeURIComponent(coach)}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    ({ drills } = await res.json());
  } catch (err) {
    status.textContent = '✗ Could not reach server: ' + err.message;
    return;
  }

  status.remove();

  if (drills.length === 0) {
    panel.insertBefore(
      Object.assign(document.createElement('p'), {
        textContent: 'No drills saved yet. Use 💾 Save to add one.',
        style: 'color:#6c7086;margin:0 0 12px;',
      }),
      closeRow
    );
    return;
  }

  // ── Cards ───────────────────────────────────────────────────
  drills.forEach(({ id, title, coach: drillCoach, tags, saved_at, is_mine, thumbnail }) => {
    const card = document.createElement('div');
    card.style.cssText = `
      background: #313244; border-radius: 6px; padding: 12px 14px;
      margin-bottom: 10px;
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
      cursor: default;
    `;

    const tagStr    = tags?.length ? tags.join(', ') : '—';
    const dateStr   = saved_at ? new Date(saved_at).toLocaleDateString() : '';
    const deleteBtn = is_mine
      ? `<button class="lib-btn-del"
           style="background:#f38ba8;color:#1e1e2e;border:none;border-radius:4px;
                  padding:6px 10px;cursor:pointer;font-size:.85rem;"
           title="Delete your drill">✕</button>`
      : '';

    card.innerHTML = `
      <div style="min-width:0;flex:1;">
        <strong style="display:block;white-space:nowrap;overflow:hidden;
                        text-overflow:ellipsis;margin-bottom:4px;">
          ${title}
        </strong>
        <span style="font-size:.78em;color:#a6adc8;display:block;margin-bottom:2px;">
          🏷 ${tagStr}
        </span>
        <span style="font-size:.75em;color:#6c7086;">
          ${drillCoach} · ${dateStr}
        </span>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button class="lib-btn-load"
          style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;
                 padding:6px 12px;cursor:pointer;font-size:.85rem;">Load</button>
        ${deleteBtn}
      </div>
    `;

    // Hover preview
    if (thumbnail) {
      card.addEventListener('mouseenter', e => showPreview(thumbnail, e));
      card.addEventListener('mousemove',  e => movePreview(e));
      card.addEventListener('mouseleave', hidePreview);
    }

    card.querySelector('.lib-btn-load').addEventListener('click', async () => {
      hidePreview();
      await loadFromServer(id, title);
      closeLibrary();
    });

    card.querySelector('.lib-btn-del')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
      try {
        const res = await fetch(
          `${API_BASE}/delete-drill/${id}?coach=${encodeURIComponent(coach)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        card.remove();
        showToast(`Deleted "${title}"`);
      } catch (err) {
        showToast('✗ Could not delete: ' + err.message, true);
      }
    });

    panel.insertBefore(card, closeRow);
  });
}

async function loadFromServer(id, title) {
  try {
    const res = await fetch(`${API_BASE}/get-drill/${id}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    applySceneData(await res.json());
    showToast(`✓ Loaded: ${title}`);
  } catch (err) {
    showToast('✗ Could not load: ' + err.message, true);
  }
}
