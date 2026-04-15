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

  // Auto-load drill from URL param  ?id=123
  const urlId = new URLSearchParams(location.search).get('id');
  if (urlId) {
    loadFromServer(urlId, '');
  }

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
      _rinkNormalized: true,
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
    base.isCoach    = el.isCoach    ?? false;
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
  const x = (el.x ?? 0) * RINK_W;
  const y = (el.y ?? 0) * RINK_H;
  const w = (el.width  ?? 0) * RINK_W;
  const h = (el.height ?? 0) * RINK_H;

  let points = el.points ?? null;
  if (points) {
    points = points.map(([px, py]) => [px * RINK_W, py * RINK_H]);
  }

  return {
    id:          el.id ?? uid(),
    type:        fromExcalidrawType(el.type),
    playerType:  el.playerType  ?? 'F',
    isCoach:     el.isCoach     ?? false,
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

  // ── Hover preview ───────────────────────────────────────────
  const preview = document.createElement('div');
  preview.style.cssText = `
    position:fixed;z-index:10001;pointer-events:none;display:none;
    background:#1e1e2e;border:1px solid #45475a;border-radius:8px;
    padding:8px;box-shadow:0 8px 28px rgba(0,0,0,.65);
  `;
  const previewImg = document.createElement('img');
  previewImg.style.cssText = 'display:block;width:280px;border-radius:4px;';
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

  // ── Modal shell ─────────────────────────────────────────────
  const modal = document.createElement('div');
  modal.id = 'drill-library';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.65);
    display:flex;align-items:center;justify-content:center;z-index:9999;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background:#1e1e2e;color:#cdd6f4;border-radius:10px;padding:24px;
    width:620px;max-height:80vh;display:flex;flex-direction:column;
    font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.6);
  `;

  // Header: title + search (non-scrolling)
  const header = document.createElement('div');
  header.style.cssText = 'flex-shrink:0;margin-bottom:4px;';
  header.innerHTML = `<h2 style="margin:0 0 12px;font-size:1.1rem;">📂 Drill Library</h2>`;

  const searchInput = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.placeholder = '🔍  Search by title, tag, or coach…';
  searchInput.style.cssText = `
    width:100%;box-sizing:border-box;background:#313244;color:#cdd6f4;
    border:1px solid #45475a;border-radius:6px;padding:8px 12px;
    font-size:.9rem;margin-bottom:14px;outline:none;
  `;
  searchInput.addEventListener('focus', () => searchInput.style.borderColor = '#89b4fa');
  searchInput.addEventListener('blur',  () => searchInput.style.borderColor = '#45475a');
  header.appendChild(searchInput);
  panel.appendChild(header);

  // Scrollable list
  const list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto;flex:1;';
  panel.appendChild(list);

  // Footer close button
  const footer = document.createElement('div');
  footer.style.cssText = 'flex-shrink:0;margin-top:16px;display:flex;justify-content:flex-end;';
  footer.innerHTML = `<button id="lib-close"
    style="background:#45475a;color:#cdd6f4;border:none;border-radius:4px;
           padding:8px 18px;cursor:pointer;">Close</button>`;
  panel.appendChild(footer);

  modal.appendChild(panel);
  document.body.appendChild(modal);

  function closeLibrary() { modal.remove(); preview.remove(); }
  modal.addEventListener('click', e => { if (e.target === modal) closeLibrary(); });
  panel.querySelector('#lib-close').addEventListener('click', closeLibrary);

  // ── Fetch ───────────────────────────────────────────────────
  const status = Object.assign(document.createElement('p'), {
    textContent: 'Loading…',
    style: 'color:#6c7086;margin:0 0 12px;',
  });
  list.appendChild(status);

  const [session, { data: drills, error }, { data: practices }] = await Promise.all([
    getSession(),
    _supabase.from('drill')
      .select('id, title, coach, tags, saved_at, thumbnail, user_id, slug')
      .order('saved_at', { ascending: false }),
    _supabase.from('practice').select('items'),
  ]);

  if (error) { status.textContent = '✗ ' + error.message; return; }
  status.remove();

  // Count drill usage across all saved practices
  const usageCount = {};
  (practices || []).forEach(p => {
    try {
      JSON.parse(p.items || '[]').forEach(item => {
        if (item.id) usageCount[item.id] = (usageCount[item.id] || 0) + 1;
      });
    } catch {}
  });

  if (!drills || !drills.length) {
    list.appendChild(Object.assign(document.createElement('p'), {
      textContent: 'No drills saved yet. Use 💾 Save to add one.',
      style: 'color:#6c7086;margin:0 0 12px;',
    }));
    return;
  }

  const userId = session?.user?.id || null;

  // Annotate + sort: own drills → used-in-practice (by count) → rest (by count)
  drills.forEach(d => { d.useCount = usageCount[d.id] || 0; });
  drills.sort((a, b) => {
    const aMine = a.user_id === userId;
    const bMine = b.user_id === userId;
    if (aMine !== bMine) return aMine ? -1 : 1;
    return b.useCount - a.useCount;
  });

  const allCards = [];

  // ── Button style helper ──────────────────────────────────────
  const btnStyle = (bg, fg = '#1e1e2e') =>
    `background:${bg};color:${fg};border:none;border-radius:4px;
     padding:6px 10px;cursor:pointer;font-size:.82rem;white-space:nowrap;`;

  // ── Build cards ──────────────────────────────────────────────
  drills.forEach(d => {
    d.tags    = JSON.parse(d.tags || '[]');
    d.is_mine = d.user_id === userId;

    const tagStr  = d.tags?.length ? d.tags.join(', ') : '—';
    const dateStr = d.saved_at ? new Date(d.saved_at).toLocaleDateString() : '';

    const card = document.createElement('div');
    card.dataset.search = [d.title, tagStr, d.coach].join(' ').toLowerCase();
    card.style.cssText = `
      background:#313244;border-radius:6px;padding:12px 14px;
      margin-bottom:10px;display:flex;justify-content:space-between;
      align-items:center;gap:12px;cursor:default;
    `;

    // ── Info column ────────────────────────────────────────────
    const info = document.createElement('div');
    info.style.cssText = 'min-width:0;flex:1;';

    const titleEl = document.createElement('strong');
    titleEl.style.cssText = `
      display:block;white-space:nowrap;overflow:hidden;
      text-overflow:ellipsis;margin-bottom:4px;
    `;
    titleEl.textContent = d.title;

    const tagsEl = Object.assign(document.createElement('span'), {
      textContent: `🏷 ${tagStr}`,
    });
    tagsEl.style.cssText = 'font-size:.78em;color:#a6adc8;display:block;margin-bottom:2px;';

    const metaEl = Object.assign(document.createElement('span'), {
      textContent: `${d.coach} · ${dateStr}`,
    });
    metaEl.style.cssText = 'font-size:.75em;color:#6c7086;';

    info.append(titleEl, tagsEl, metaEl);

    // ── Buttons column ─────────────────────────────────────────
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;flex-shrink:0;align-items:center;';

    // Load
    const loadBtn = document.createElement('button');
    loadBtn.textContent  = 'Load';
    loadBtn.style.cssText = btnStyle('#89b4fa');
    loadBtn.title = 'Load drill onto canvas';
    loadBtn.addEventListener('click', async () => {
      hidePreview();
      await loadFromServer(d.id, d.title);
      closeLibrary();
    });
    btns.appendChild(loadBtn);

    // Copy (available on all drills)
    const copyBtn = document.createElement('button');
    copyBtn.textContent   = '⧉ Copy';
    copyBtn.style.cssText = btnStyle('#a6e3a1');
    copyBtn.title = 'Load as your own copy — saves as a new drill';
    copyBtn.addEventListener('click', async () => {
      hidePreview();
      const { data, error: loadErr } = await _supabase
        .from('drill').select('scene').eq('id', d.id).single();
      if (loadErr) { showToast('✗ Could not load: ' + loadErr.message, true); return; }
      applySceneData(JSON.parse(data.scene));
      // Append "(copy)" so it saves under a new slug
      const titleInput = document.getElementById('drill-title');
      titleInput.value = (titleInput.value || d.title).replace(/ \(copy\d*\)$/, '') + ' (copy)';
      closeLibrary();
      showToast('✓ Copied "' + d.title + '" — edit and 💾 Save to keep it');
    });
    btns.appendChild(copyBtn);

    // Rename (own drills only)
    if (d.is_mine) {
      const renameBtn = document.createElement('button');
      renameBtn.textContent   = '✎';
      renameBtn.style.cssText = btnStyle('#f9e2af');
      renameBtn.title = 'Rename drill';
      renameBtn.addEventListener('click', () => {
        const original = d.title;

        // Replace title element with an inline input
        const input = document.createElement('input');
        input.type  = 'text';
        input.value = original;
        input.style.cssText = `
          background:#1e1e2e;color:#cdd6f4;border:1px solid #89b4fa;
          border-radius:4px;padding:3px 7px;font-size:.9rem;
          width:100%;box-sizing:border-box;
        `;
        info.replaceChild(input, titleEl);
        input.focus();
        input.select();

        let committed = false;

        const commit = async () => {
          if (committed) return;
          committed = true;

          const newTitle = input.value.trim();
          if (!newTitle || newTitle === original) {
            info.replaceChild(titleEl, input);
            return;
          }

          const newSlug = newTitle.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

          const { error: renameErr } = await _supabase.from('drill')
            .update({ title: newTitle, slug: newSlug })
            .eq('id', d.id).eq('user_id', userId);

          if (renameErr) {
            showToast('✗ Rename failed: ' + renameErr.message, true);
            committed = false;       // allow retry
            info.replaceChild(titleEl, input);
            return;
          }

          // Update local state
          d.title       = newTitle;
          d.slug        = newSlug;
          titleEl.textContent   = newTitle;
          card.dataset.search   = [newTitle, tagStr, d.coach].join(' ').toLowerCase();
          info.replaceChild(titleEl, input);
          showToast('✓ Renamed to "' + newTitle + '"');
        };

        const cancel = () => {
          committed = true;
          info.replaceChild(titleEl, input);
        };

        input.addEventListener('keydown', e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', commit);
      });
      btns.appendChild(renameBtn);

      // Delete (own drills only)
      const delBtn = document.createElement('button');
      delBtn.textContent   = '✕';
      delBtn.style.cssText = btnStyle('#f38ba8');
      delBtn.title = 'Delete drill';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
        const { error: delErr } = await _supabase.from('drill').delete()
          .eq('id', d.id).eq('user_id', userId);
        if (delErr) showToast('✗ Could not delete: ' + delErr.message, true);
        else { card.remove(); showToast(`Deleted "${d.title}"`); }
      });
      btns.appendChild(delBtn);
    }

    // Report (other coaches' drills only)
    if (!d.is_mine) {
      const reportBtn = document.createElement('button');
      reportBtn.textContent   = '⚑';
      reportBtn.style.cssText = btnStyle('#f38ba8', '#1e1e2e');
      reportBtn.title = 'Report this drill as inappropriate';
      reportBtn.addEventListener('click', e => {
        e.stopPropagation();
        openReportModal(d.id, d.title);
      });
      btns.appendChild(reportBtn);
    }

    card.append(info, btns);

    // Thumbnail hover preview
    if (d.thumbnail) {
      card.addEventListener('mouseenter', e => showPreview(d.thumbnail, e));
      card.addEventListener('mousemove',  e => movePreview(e));
      card.addEventListener('mouseleave', hidePreview);
    }

    allCards.push(card);
    list.appendChild(card);
  });

  // ── Live search filter ───────────────────────────────────────
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    let visible = 0;
    allCards.forEach(card => {
      const show = !q || card.dataset.search.includes(q);
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
  });

  // Auto-focus search
  requestAnimationFrame(() => searchInput.focus());
}


// ─────────────────────────────────────────────────────────────
//  Load a single drill from Supabase by ID
// ─────────────────────────────────────────────────────────────

async function loadFromServer(id, title) {
  const { data, error } = await _supabase.from('drill').select('scene').eq('id', id).single();
  if (error) { showToast('✗ Could not load: ' + error.message, true); return; }
  applySceneData(JSON.parse(data.scene));
  showToast('✓ Loaded: ' + title);
}
