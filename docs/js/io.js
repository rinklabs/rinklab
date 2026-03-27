// ─────────────────────────────────────────────────────────────
//  io.js  —  save and load drill JSON
// ─────────────────────────────────────────────────────────────

function initIO() {
  document.getElementById('btn-save').addEventListener('click', saveJSON);
  document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', loadJSON);
}

// ── Save ─────────────────────────────────────────────────────
function saveJSON() {
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

  downloadJSON(scene, `${slug}.json`);
  showToast('✓ Scene exported as JSON');
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
    angle:           0,
    seed:            Math.floor(Math.random() * 100000),
    version:         1,
    isDeleted:       false,
    groupIds:        [],
    boundElements:   null,
    link:            null,
    locked:          false,
  };

  if (el.type === 'pen') {
    base.points = el.points.map(([x, y]) => [x - el.x, y - el.y]);
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
  if (el.type === 'pen') {
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

  return base;
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

// ── Load ─────────────────────────────────────────────────────
async function loadJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());

    // Restore rink view
    if (data.appState?.rinkView) {
      setRinkView(data.appState.rinkView);
    }

    // Restore metadata fields
    if (data.metadata) {
      const m = data.metadata;
      document.getElementById('drill-title').value = m.title === 'Untitled Drill' ? '' : (m.title ?? '');
      document.getElementById('drill-tags').value  = (m.tags ?? []).join('; ');
      document.getElementById('drill-desc').value  = m.description ?? '';
    }

    // Restore drawing elements
    State.elements = (data.elements ?? [])
      .filter(el => !el.isDeleted)
      .map(deserializeElement);

    State.selected = null;
    updatePropsPanel();
    render();
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
