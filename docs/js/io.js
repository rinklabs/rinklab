// ─────────────────────────────────────────────────────────────
//  io.js  —  save / load via Supabase
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  Auth helpers
// ─────────────────────────────────────────────────────────────

async function getSession() {
  const { data: { session } } = await _supabase.auth.getSession();
  return session;
}

function getCoach() {
  return (localStorage.getItem('drillLab:coach') || '').trim();
}

function _setCoachCache(name) {
  localStorage.setItem('drillLab:coach', name || '');
}

// ─────────────────────────────────────────────────────────────
//  Thumbnail
// ─────────────────────────────────────────────────────────────

async function captureThumbnail() {
  const source = document.getElementById('c');
  if (!source || source.width === 0) return null;

  const scale = Math.min(2, 1500 / source.width);
  const W = Math.round(source.width  * scale);
  const H = Math.round(source.height * scale);

  const offscreen  = document.createElement('canvas');
  offscreen.width  = W;
  offscreen.height = H;
  const ctx = offscreen.getContext('2d');

  let rinkDrawn = false;
  const liveSvg = document.querySelector('#rink-layer svg');
  if (liveSvg) {
    await new Promise(resolve => {
      try {
        let svgStr = new XMLSerializer().serializeToString(liveSvg);
        // Strip width/height only from the root <svg> tag, then inject thumbnail size
        svgStr = svgStr.replace(/(<svg\b[^>]*>)/, match =>
          match
            .replace(/\s+width="[^"]*"/, '')
            .replace(/\s+height="[^"]*"/, '')
            .replace(/(<svg\b)/, `$1 width="${W}" height="${H}"`)
        );
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url  = URL.createObjectURL(blob);
        const img  = new Image();
        img.onload = () => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, W, H);
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
    ctx.fillStyle = '#e8f0f8';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, W, H);
  return offscreen.toDataURL('image/jpeg', 0.93);
}


// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────

function initIO() {
  // Sync coach display name from active Supabase session
  _supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      const name = session.user.user_metadata?.display_name || session.user.email;
      _setCoachCache(name);
      const ind = document.getElementById('coach-indicator-name');
      if (ind) ind.textContent = name;
    }
  });

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
      _rinkNormalized: true,   // coords are fractions of RINK_W × RINK_H
    },
    elements: State.elements.map(el => serializeElement(el)),
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
    x:               (el.x ?? 0) / RINK_W,
    y:               (el.y ?? 0) / RINK_H,
    width:           (el.w ?? 0) / RINK_W,
    height:          (el.h ?? 0) / RINK_H,
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
    // Store pen points as absolute rink-space fractions
    base.points    = el.points.map(([x, y]) => [x / RINK_W, y / RINK_H]);
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
  // Coords are stored as fractions of RINK_W × RINK_H — convert back to rink space
  const rinkNorm = true; // all new saves use _rinkNormalized; legacy files fall back gracefully
  const x = (el.x ?? 0) * RINK_W;
  const y = (el.y ?? 0) * RINK_H;
  const w = (el.width  ?? 0) * RINK_W;
  const h = (el.height ?? 0) * RINK_H;

  let points = el.points ?? null;
  if (points) {
    // Pen points are absolute rink-fraction coords
    points = points.map(([px, py]) => [px * RINK_W, py * RINK_H]);
  }

  return {
    id:          el.id ?? uid(),
    type:        fromExcalidrawType(el.type),
    playerType:  el.playerType  ?? 'F',
    fontSize:    el.fontSize    ?? (el.type === 'player' ? 32 : 20),
    lineStyle:   el.lineStyle   ?? 'solid',
    angle:       el.angle       ?? 0,
    r:           el.r           ?? 12,
    x, y, w, h,
    strokeColor: el.strokeColor ?? '#000000',
    fillColor:   (el.backgroundColor === 'transparent' || !el.backgroundColor)
                   ? null : el.backgroundColor,
    strokeWidth: el.strokeWidth ?? 2,
    opacity:     el.opacity     ?? 100,
    text:        el.text        ?? '',
    points,
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
  State.elements = (data.elements ?? []).filter(el => !el.isDeleted).map(el => deserializeElement(el));
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
//  Save to Supabase
// ─────────────────────────────────────────────────────────────

async function saveToServer() {
  const session = await getSession();
  if (!session) {
    showToast('✗ Not logged in — sign in from the home page', true);
    return;
  }

  const coach           = getCoach();
  const { scene, slug } = buildScene();
  const thumbnail       = await captureThumbnail();

  const { error } = await _supabase.from('drill').upsert({
    user_id:   session.user.id,
    coach,
    slug,
    title:     scene.metadata.title,
    tags:      JSON.stringify(scene.metadata.tags || []),
    scene:     JSON.stringify(scene),
    thumbnail: thumbnail || null,
    saved_at:  new Date().toISOString(),
  }, { onConflict: 'user_id,slug' });

  if (error) showToast('✗ ' + error.message, true);
  else       showToast('✓ Saved "' + scene.metadata.title + '"');
}


// ─────────────────────────────────────────────────────────────
//  Library
// ─────────────────────────────────────────────────────────────

async function openLibrary() {
  document.getElementById('drill-library')?.remove();

  const preview = document.createElement('div');
  preview.style.cssText = `
    position: fixed; z-index: 10001; pointer-events: none;
    display: none; background: #1e1e2e;
    border: 1px solid #45475a; border-radius: 8px;
    padding: 8px; box-shadow: 0 8px 28px rgba(0,0,0,.65);
  `;
  const previewImg = document.createElement('img');
  previewImg.style.cssText = 'display:block; width:280px; border-radius:4px;';
  preview.appendChild(previewImg);
  document.body.appendChild(preview);

  function showPreview(src, e) { previewImg.src = src; preview.style.display = 'block'; movePreview(e); }
  function movePreview(e) {
    const gap = 16, pw = 280 + 18;
    const x = (e.clientX + gap + pw > window.innerWidth) ? e.clientX - pw - gap : e.clientX + gap;
    const y = Math.min(e.clientY - 40, window.innerHeight - 220);
    preview.style.left = x + 'px';
    preview.style.top  = Math.max(y, 8) + 'px';
  }
  function hidePreview() { preview.style.display = 'none'; }

  const modal = document.createElement('div');
  modal.id    = 'drill-library';
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,.65);
    display: flex; align-items: center; justify-content: center; z-index: 9999;
  `;
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #1e1e2e; color: #cdd6f4; border-radius: 10px; padding: 24px;
    width: 580px; max-height: 72vh; overflow-y: auto; font-family: sans-serif;
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

  function closeLibrary() { modal.remove(); preview.remove(); }
  modal.addEventListener('click', e => { if (e.target === modal) closeLibrary(); });
  panel.querySelector('#lib-close').addEventListener('click', closeLibrary);

  const status = Object.assign(document.createElement('p'), {
    textContent: 'Loading…', style: 'color:#6c7086;margin:0 0 12px;',
  });
  panel.insertBefore(status, closeRow);

  const [session, { data: drills, error }] = await Promise.all([
    getSession(),
    _supabase.from('drill')
      .select('id, title, coach, tags, saved_at, thumbnail, user_id')
      .order('saved_at', { ascending: false }),
  ]);

  if (error) { status.textContent = '✗ ' + error.message; return; }
  status.remove();

  if (!drills.length) {
    panel.insertBefore(
      Object.assign(document.createElement('p'), {
        textContent: 'No drills saved yet. Use 💾 Save to add one.',
        style: 'color:#6c7086;margin:0 0 12px;',
      }), closeRow
    );
    return;
  }

  const userId = session?.user?.id || null;

  drills.forEach(d => {
    d.tags    = JSON.parse(d.tags || '[]');
    d.is_mine = d.user_id === userId;

    const card    = document.createElement('div');
    const tagStr  = d.tags?.length ? d.tags.join(', ') : '—';
    const dateStr = d.saved_at ? new Date(d.saved_at).toLocaleDateString() : '';
    const delBtn  = d.is_mine
      ? `<button class="lib-btn-del"
           style="background:#f38ba8;color:#1e1e2e;border:none;border-radius:4px;
                  padding:6px 10px;cursor:pointer;font-size:.85rem;" title="Delete">✕</button>`
      : '';

    card.style.cssText = `
      background: #313244; border-radius: 6px; padding: 12px 14px;
      margin-bottom: 10px; display: flex; justify-content: space-between;
      align-items: center; gap: 12px; cursor: default;
    `;
    card.innerHTML = `
      <div style="min-width:0;flex:1;">
        <strong style="display:block;white-space:nowrap;overflow:hidden;
                        text-overflow:ellipsis;margin-bottom:4px;">${d.title}</strong>
        <span style="font-size:.78em;color:#a6adc8;display:block;margin-bottom:2px;">🏷 ${tagStr}</span>
        <span style="font-size:.75em;color:#6c7086;">${d.coach} · ${dateStr}</span>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button class="lib-btn-load"
          style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;
                 padding:6px 12px;cursor:pointer;font-size:.85rem;">Load</button>
        ${delBtn}
      </div>
    `;

    if (d.thumbnail) {
      card.addEventListener('mouseenter', e => showPreview(d.thumbnail, e));
      card.addEventListener('mousemove',  e => movePreview(e));
      card.addEventListener('mouseleave', hidePreview);
    }

    card.querySelector('.lib-btn-load').addEventListener('click', async () => {
      hidePreview();
      await loadFromServer(d.id, d.title);
      closeLibrary();
    });

    card.querySelector('.lib-btn-del')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
      const { error } = await _supabase.from('drill').delete()
        .eq('id', d.id).eq('user_id', userId);
      if (error) showToast('✗ Could not delete: ' + error.message, true);
      else { card.remove(); showToast(`Deleted "${d.title}"`); }
    });

    panel.insertBefore(card, closeRow);
  });
}

async function loadFromServer(id, title) {
  const { data, error } = await _supabase.from('drill').select('scene').eq('id', id).single();
  if (error) { showToast('✗ Could not load: ' + error.message, true); return; }
  applySceneData(JSON.parse(data.scene));
  showToast('✓ Loaded: ' + title);
}
