// ─────────────────────────────────────────────────────────────
//  io.js  —  save / load drill JSON  (local-first)
// ─────────────────────────────────────────────────────────────

function initIO() {
  document.getElementById('btn-save').addEventListener('click', saveJSON);
  document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', loadJSON);
  document.getElementById('btn-save-local').addEventListener('click', saveToLocal);
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
//  Save JSON (download)
// ─────────────────────────────────────────────────────────────

function saveJSON() {
  const { scene, slug } = buildScene();
  downloadJSON(scene, `${slug}.json`);
  showToast('✓ Scene exported as JSON');
}

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

  return { scene, slug, title, tags, desc };
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

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}


// ─────────────────────────────────────────────────────────────
//  Load JSON (file picker)
// ─────────────────────────────────────────────────────────────

async function loadJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    applySceneData(data);
    showToast('✓ Scene loaded');
  } catch (err) {
    showToast('✗ Invalid JSON: ' + err.message, true);
  }

  e.target.value = '';
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

// Shared helper — applies a parsed scene object to the canvas.
function applySceneData(data) {
  if (data.appState?.rinkView) setRinkView(data.appState.rinkView);

  if (data.metadata) {
    const m = data.metadata;
    document.getElementById('drill-title').value = m.title === 'Untitled Drill' ? '' : (m.title ?? '');
    document.getElementById('drill-tags').value  = (m.tags ?? []).join('; ');
    document.getElementById('drill-desc').value  = m.description ?? '';
  }

  State.elements = (data.elements ?? [])
    .filter(el => !el.isDeleted)
    .map(deserializeElement);

  State.selected = null;
  State.multiSelected.clear();
  pushHistory();
  updatePropsPanel();
  render();
}


// ─────────────────────────────────────────────────────────────
//  Local save — File System Access API with download fallback
// ─────────────────────────────────────────────────────────────

// Directory handle is kept for the session so the picker only
// appears once per page load.
let _dirHandle = null;

async function getOrPickDir() {
  if (_dirHandle) return _dirHandle;
  if (!window.showDirectoryPicker) return null;
  try {
    _dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return _dirHandle;
  } catch {
    // User cancelled.
    return null;
  }
}

async function saveToLocal() {
  const { scene, slug, title, tags, desc } = buildScene();
  const filename = `${slug}-${Date.now()}.json`;
  const json     = JSON.stringify(scene, null, 2);
  let   savedViaAPI = false;

  // Try File System Access API (Chrome / Edge).
  if (window.showDirectoryPicker) {
    const dir = await getOrPickDir();
    if (dir) {
      try {
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable   = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        savedViaAPI = true;
      } catch (err) {
        showToast('✗ Could not write file: ' + err.message, true);
        return;
      }
    }
  }

  // Fallback: normal browser download.
  if (!savedViaAPI) downloadJSON(scene, filename);

  // Always update the localStorage index.
  indexDrill({
    title: title || 'Untitled Drill',
    tags,
    description: desc,
    filename,
    savedAt: scene.metadata.savedAt,
  });

  showToast(savedViaAPI ? `✓ Saved: ${filename}` : `✓ Downloaded: ${filename}`);
}


// ─────────────────────────────────────────────────────────────
//  localStorage index  (lightweight "database")
//  Each entry: { title, tags[], description, filename, savedAt }
//  The actual JSON lives on disk; this is just the catalogue.
// ─────────────────────────────────────────────────────────────

const INDEX_KEY = 'drillLab:index';

function getIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY)) ?? []; }
  catch { return []; }
}

function saveIndex(entries) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

function indexDrill(entry) {
  // Replace existing entry with the same filename, then prepend.
  const entries = getIndex().filter(e => e.filename !== entry.filename);
  entries.unshift(entry);
  saveIndex(entries.slice(0, 200)); // cap at 200
}

function removeFromIndex(filename) {
  saveIndex(getIndex().filter(e => e.filename !== filename));
}


// ─────────────────────────────────────────────────────────────
//  Library panel
// ─────────────────────────────────────────────────────────────

async function openLibrary() {
  // Ask for the folder so Load buttons can read files back.
  // (No-op if already granted this session.)
  const dir = window.showDirectoryPicker ? await getOrPickDir() : null;

  // Remove any existing panel.
  document.getElementById('drill-library')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'drill-library';
  modal.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `;

  const entries = getIndex();

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #1e1e2e; color: #cdd6f4;
    border-radius: 10px; padding: 24px;
    width: 540px; max-height: 72vh;
    overflow-y: auto; font-family: sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
  `;

  panel.innerHTML = `
    <h2 style="margin: 0 0 16px; font-size: 1.1rem;">📂 Drill Library</h2>
    ${entries.length === 0
      ? '<p style="color:#6c7086; margin:0">No drills saved yet. Use <strong>💾 Save Local</strong> to add one.</p>'
      : entries.map(e => `
          <div class="lib-entry" data-filename="${e.filename}" style="
            background: #313244; border-radius: 6px; padding: 12px 14px;
            margin-bottom: 10px;
            display: flex; justify-content: space-between; align-items: center;
            gap: 12px;
          ">
            <div style="min-width:0; flex:1;">
              <strong style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${e.title}
              </strong>
              <span style="font-size:.8em; color:#a6adc8;">
                ${e.tags?.length ? e.tags.join(', ') + ' · ' : ''}
                ${new Date(e.savedAt).toLocaleDateString()}
              </span>
            </div>
            <div style="display:flex; gap:8px; flex-shrink:0;">
              ${dir
                ? `<button class="lib-btn-load"
                     style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;
                            padding:6px 12px;cursor:pointer;font-size:.85rem;">
                     Load
                   </button>`
                : ''}
              <button class="lib-btn-del"
                style="background:#f38ba8;color:#1e1e2e;border:none;border-radius:4px;
                       padding:6px 10px;cursor:pointer;font-size:.85rem;"
                title="Remove from library (does not delete the file)">
                ✕
              </button>
            </div>
          </div>
        `).join('')
    }
    <div style="margin-top:16px; display:flex; justify-content:flex-end;">
      <button id="lib-close"
        style="background:#45475a;color:#cdd6f4;border:none;border-radius:4px;
               padding:8px 18px;cursor:pointer;">
        Close
      </button>
    </div>
  `;

  modal.appendChild(panel);
  document.body.appendChild(modal);

  // Close on backdrop click or Close button.
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  panel.querySelector('#lib-close').addEventListener('click', () => modal.remove());

  // Wire up Load buttons.
  panel.querySelectorAll('.lib-btn-load').forEach(btn => {
    const entry = btn.closest('.lib-entry');
    btn.addEventListener('click', () => loadFromFolder(entry.dataset.filename));
  });

  // Wire up Delete buttons.
  panel.querySelectorAll('.lib-btn-del').forEach(btn => {
    const entry = btn.closest('.lib-entry');
    btn.addEventListener('click', () => {
      removeFromIndex(entry.dataset.filename);
      entry.remove();
      showToast('Removed from library');
    });
  });
}

async function loadFromFolder(filename) {
  const dir = await getOrPickDir();
  if (!dir) return showToast('✗ No folder selected', true);

  try {
    const fileHandle = await dir.getFileHandle(filename);
    const file       = await fileHandle.getFile();
    const data       = JSON.parse(await file.text());
    applySceneData(data);
    document.getElementById('drill-library')?.remove();
    showToast(`✓ Loaded: ${filename}`);
  } catch (err) {
    showToast('✗ Could not read file: ' + err.message, true);
  }
}
