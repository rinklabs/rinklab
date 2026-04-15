/* ─────────────────────────────────────────────────────────────
   js/practice.js  —  Practice builder logic for practice.html
   Depends on: _supabase (config.js), showToast (toast.js)
───────────────────────────────────────────────────────────── */

// ── State ────────────────────────────────────────────────────
let practiceItems = [];
let drillLibrary  = [];
let dragSrcIdx    = null;
let libDragId     = null;

function getCoach() {
  return (localStorage.getItem('drillLab:coach') || '').trim();
}

// ── Sidebar toggle ───────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('pg-sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
}
function openSidebar() {
  document.getElementById('pg-sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('active');
}
function closeSidebar() {
  document.getElementById('pg-sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('active');
}

// ── Team selector ────────────────────────────────────────────
async function initTeamSelector() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) return;

  const { data: memberships } = await _supabase
    .from('team_member')
    .select('team_id, team(id, name)')
    .eq('user_id', session.user.id);

  const teams  = (memberships || []).map(m => m.team).filter(Boolean);
  const wrap   = document.getElementById('team-selector-wrap');
  const select = document.getElementById('save-team-selector');
  select.innerHTML = '';

  const noneOpt = document.createElement('option');
  noneOpt.value       = '';
  noneOpt.textContent = 'None (private)';
  select.appendChild(noneOpt);

  if (teams.length > 0) {
    wrap.style.display = 'flex';
    teams.forEach(t => {
      const opt = document.createElement('option');
      opt.value       = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
    const stored = localStorage.getItem('drillLab:teamId');
    if (stored && teams.find(t => t.id === stored)) select.value = stored;
    select.addEventListener('change', () => {
      if (select.value) localStorage.setItem('drillLab:teamId', select.value);
      else              localStorage.removeItem('drillLab:teamId');
    });
  }
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  document.getElementById('practice-date').value = new Date().toISOString().slice(0, 10);
  loadFromURL();
  updateEmpty();
  updateTimeline();
  await fetchDrills();
  await initTeamSelector();
}

// ── Fetch drills ─────────────────────────────────────────────
async function fetchDrills() {
  const el = document.getElementById('drill-library');
  el.innerHTML = `<div style="padding:20px;text-align:center;font-size:10px;color:var(--muted)">Loading…</div>`;

  try {
    const [
      { data: { session } },
      { data, error },
      { data: practices },
    ] = await Promise.all([
      _supabase.auth.getSession(),
      _supabase.from('drill').select('id, title, coach, tags, thumbnail, user_id').order('saved_at', { ascending: false }),
      _supabase.from('practice').select('items'),
    ]);

    if (error) throw new Error(error.message);
    const userId = session?.user?.id || null;

    const usageCount = {};
    (practices || []).forEach(p => {
      try {
        JSON.parse(p.items || '[]').forEach(item => {
          if (item.id) usageCount[item.id] = (usageCount[item.id] || 0) + 1;
        });
      } catch {}
    });

    drillLibrary = (data || []).map(d => ({
      id:        d.id,
      name:      d.title,
      desc:      '',
      tags:      JSON.parse(d.tags || '[]'),
      coach:     d.coach,
      thumbnail: d.thumbnail || null,
      isMine:    d.user_id === userId,
      useCount:  usageCount[d.id] || 0,
    }));

    drillLibrary.sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      return b.useCount - a.useCount;
    });

    renderLibrary();
  } catch (err) {
    el.innerHTML = `<div style="padding:20px;text-align:center;font-size:10px;color:#e05a5a">
      Could not load drills.<br><span style="color:var(--muted)">${err.message}</span>
    </div>`;
  }
}

// ── Library ──────────────────────────────────────────────────
function renderLibrary(filter = '') {
  const el = document.getElementById('drill-library');
  const f  = filter.toLowerCase();
  const items = drillLibrary.filter(d =>
    !f ||
    d.name.toLowerCase().includes(f) ||
    (d.tags || []).some(t => t.toLowerCase().includes(f)) ||
    (d.coach || '').toLowerCase().includes(f)
  );

  if (!items.length) {
    el.innerHTML = `<div style="padding:20px;text-align:center;font-size:10px;color:var(--muted)">No drills found</div>`;
    return;
  }

  el.innerHTML = items.map(d => {
    const iconHtml  = d.thumbnail
      ? `<img src="${d.thumbnail}" style="width:36px;height:36px;object-fit:cover;border-radius:3px;display:block;" />`
      : `🏒`;
    const iconStyle = d.thumbnail ? 'width:38px;height:38px;padding:0;overflow:hidden;' : '';
    const tagPills  = (d.tags || []).map(t => `<span class="lib-tag">${esc(t)}</span>`).join('');
    const coachTxt  = d.coach ? `<span style="font-size:9px;color:var(--muted)">${esc(d.coach)}</span>` : '';
    return `
      <div class="lib-item" draggable="true" ${d.thumbnail ? 'data-thumb="true"' : ''}
           ondragstart="libDragStart(event,${d.id})"
           onclick="addFromLibrary(${d.id})"
           onmouseenter="showThumbTip(event,${d.id})"
           onmousemove="moveThumbTip(event)"
           onmouseleave="hideThumbTip()">
        <div class="lib-icon" style="${iconStyle}">${iconHtml}</div>
        <div class="lib-info">
          <div class="lib-name">${esc(d.name)} ${coachTxt}</div>
          <div class="lib-tags">${tagPills}</div>
        </div>
        <button class="lib-add" onclick="event.stopPropagation();addFromLibrary(${d.id})" title="Add">+</button>
      </div>`;
  }).join('');
}

function filterLibrary(val) { renderLibrary(val); }

async function addFromLibrary(id) {
  const d = drillLibrary.find(x => x.id == id);
  if (!d) return;

  let desc = '', rinkView = 'half';
  try {
    const { data, error } = await _supabase.from('drill').select('scene').eq('id', d.id).single();
    if (!error && data) {
      const scene = JSON.parse(data.scene);
      desc     = scene?.metadata?.description || '';
      rinkView = scene?.appState?.rinkView    || 'half';
    }
  } catch (_) {}

  practiceItems.push({
    id: uid(), sourceId: d.id, name: d.name,
    desc, tags: d.tags || [], thumbnail: d.thumbnail || null,
    rinkView, type: 'diagram', duration: 10,
  });
  renderList();
  showToast('Added: ' + d.name);
  if (window.innerWidth <= 680) closeSidebar();
}

// ── Quick Drill ──────────────────────────────────────────────
function addQuickDrill() {
  const name = document.getElementById('qd-name').value.trim();
  const desc = document.getElementById('qd-desc').value.trim();
  if (!name) { showToast('Enter a drill name', true); return; }
  practiceItems.push({ id: uid(), name, desc, type: 'quick', duration: 5 });
  renderList();
  document.getElementById('qd-name').value = '';
  document.getElementById('qd-desc').value = '';
  showToast('Quick drill added');
  if (window.innerWidth <= 680) closeSidebar();
}

// ── Practice List ────────────────────────────────────────────
function renderList() {
  updateEmpty();
  document.getElementById('practice-list').innerHTML = practiceItems.map((item, i) => `
    <div class="practice-item" id="pi-${item.id}"
         data-idx="${i}"
         draggable="true"
         ondragstart="itemDragStart(event,${i})"
         ondragover="itemDragOver(event,${i})"
         ondragleave="itemDragLeave(event,${i})"
         ondrop="itemDrop(event,${i})"
         ondragend="itemDragEnd()">
      <div class="item-num">${i + 1}</div>
      <div class="drag-handle" title="Drag to reorder">⠿</div>
      <div class="item-icon ${item.type === 'diagram' ? 'type-diagram' : 'type-quick'}">
        ${item.type === 'diagram' ? '🏒' : '📝'}
      </div>
      <div class="item-info">
        <div class="item-name">${esc(item.name)}</div>
        ${item.desc ? `<div class="item-desc">${esc(item.desc)}</div>` : ''}
        <span class="item-tag ${item.type === 'diagram' ? 'tag-diagram' : 'tag-quick'}">
          ${item.type === 'diagram' ? 'Diagram' : 'Quick'}
        </span>
      </div>
      <div class="item-time">
        <input type="number" min="1" max="120" value="${item.duration}"
               onchange="setDuration('${item.id}',this.value)"
               oninput="setDuration('${item.id}',this.value)"
               title="Duration in minutes" />
        <span class="item-time-lbl">min</span>
      </div>
      <button class="item-remove" onclick="removeItem('${item.id}')" title="Remove">✕</button>
    </div>
  `).join('');
  updateTimeline();
}

function updateEmpty() {
  document.getElementById('practice-empty').style.display = practiceItems.length ? 'none' : 'flex';
}

function removeItem(id) {
  practiceItems = practiceItems.filter(x => x.id !== id);
  renderList();
}

function setDuration(id, val) {
  const item = practiceItems.find(x => x.id === id);
  if (item) item.duration = Math.max(1, parseInt(val) || 1);
  updateTimeline();
}

// ── Timeline ─────────────────────────────────────────────────
function updateTimeline() {
  const total  = practiceItems.reduce((s, x) => s + (x.duration || 0), 0);
  const target = parseInt(document.getElementById('target-duration').value) || 60;
  const pct    = Math.min((total / target) * 100, 100);
  const remain = Math.max(target - total, 0);
  const over   = total > target;
  const mm     = String(Math.floor(total / 60)).padStart(2, '0');
  const ss     = String(total % 60).padStart(2, '0');

  document.getElementById('total-time').textContent    = `${mm}:${ss}`;
  document.getElementById('total-time').className      = 'meta-stat-val' + (over ? ' warn' : '');
  document.getElementById('drill-count').textContent   = practiceItems.length;
  document.getElementById('used-min').textContent      = total;
  document.getElementById('remaining-min').textContent = remain;

  const fill = document.getElementById('timeline-fill');
  fill.style.width = pct + '%';
  fill.className   = 'timeline-fill' + (over ? ' over' : '');
}

// ── Drag & Drop (mouse) ──────────────────────────────────────
function libDragStart(e, id) {
  libDragId = +id;
  e.dataTransfer.effectAllowed = 'copy';
}

function itemDragStart(e, idx) {
  dragSrcIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.getElementById('pi-' + practiceItems[idx].id);
    if (el) el.classList.add('dragging');
  }, 0);
}

function itemDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = libDragId ? 'copy' : 'move';
  document.querySelectorAll('.practice-item').forEach(el => el.classList.remove('drag-over'));
  const el = document.getElementById('pi-' + practiceItems[idx].id);
  if (el) el.classList.add('drag-over');
}

function itemDragLeave(e, idx) {
  const el = document.getElementById('pi-' + practiceItems[idx].id);
  if (el) el.classList.remove('drag-over');
}

function itemDrop(e, idx) {
  e.preventDefault();
  document.querySelectorAll('.practice-item').forEach(el => el.classList.remove('drag-over', 'dragging'));

  if (libDragId !== null) {
    const d = drillLibrary.find(x => x.id == libDragId);
    if (d) {
      practiceItems.splice(idx, 0, {
        id: uid(), sourceId: d.id, name: d.name, desc: d.desc,
        tags: d.tags || [], thumbnail: d.thumbnail || null,
        rinkView: d.rinkView || 'half', type: 'diagram', duration: 10,
      });
      renderList();
      showToast('Added: ' + d.name);
    }
    libDragId = null;
    return;
  }

  if (dragSrcIdx === null || dragSrcIdx === idx) return;
  const [moved] = practiceItems.splice(dragSrcIdx, 1);
  practiceItems.splice(idx, 0, moved);
  dragSrcIdx = null;
  renderList();
}

function itemDragEnd() {
  document.querySelectorAll('.practice-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
  libDragId  = null;
  dragSrcIdx = null;
}

// ── Touch drag-and-drop (iOS Safari) ────────────────────────
(function initTouchDrag() {
  let touchSrcIdx = null;
  let ghost       = null;
  let lastOver    = null;

  function clearHighlights() {
    document.querySelectorAll('.practice-item.drag-over').forEach(e => e.classList.remove('drag-over'));
  }

  function createGhost(sourceEl, touchX, touchY) {
    const r = sourceEl.getBoundingClientRect();
    const g = sourceEl.cloneNode(true);
    g.style.cssText = `
      position:fixed; left:${r.left}px; top:${r.top}px;
      width:${r.width}px; opacity:0.75; pointer-events:none;
      z-index:9999; box-shadow:0 6px 24px rgba(0,0,0,.4);
      border-radius:8px; margin:0;
    `;
    g._offX = touchX - r.left;
    g._offY = touchY - r.top;
    document.body.appendChild(g);
    return g;
  }

  document.addEventListener('touchstart', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    const t    = e.touches[0];
    const item = handle.closest('.practice-item');
    if (!item) return;
    touchSrcIdx = +item.dataset.idx;
    item.classList.add('dragging');
    ghost = createGhost(item, t.clientX, t.clientY);
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (touchSrcIdx === null || !ghost) return;
    e.preventDefault();
    const t = e.touches[0];
    ghost.style.left = (t.clientX - ghost._offX) + 'px';
    ghost.style.top  = (t.clientY - ghost._offY) + 'px';
    ghost.style.display = 'none';
    const below = document.elementFromPoint(t.clientX, t.clientY);
    ghost.style.display = '';
    clearHighlights();
    const targetItem = below && below.closest('.practice-item');
    if (targetItem) {
      const targetIdx = +targetItem.dataset.idx;
      if (!isNaN(targetIdx) && targetIdx !== touchSrcIdx) {
        targetItem.classList.add('drag-over');
        lastOver = targetIdx;
      } else { lastOver = null; }
    } else { lastOver = null; }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (touchSrcIdx === null) return;
    document.querySelectorAll('.practice-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
    if (ghost) { ghost.remove(); ghost = null; }
    if (lastOver !== null && lastOver !== touchSrcIdx) {
      const [moved] = practiceItems.splice(touchSrcIdx, 1);
      practiceItems.splice(lastOver, 0, moved);
      renderList();
    }
    touchSrcIdx = null;
    lastOver    = null;
  }, { passive: false });
})();

// ── Save / Load / Share / PDF ────────────────────────────────
function getPracticeData() {
  return {
    name:   document.getElementById('practice-name').value || 'Untitled Practice',
    date:   document.getElementById('practice-date').value,
    team:   document.getElementById('practice-team').value,
    target: parseInt(document.getElementById('target-duration').value) || 60,
    items:  practiceItems,
  };
}

async function savePractice() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) { showToast('Not logged in — sign in from the home page', true); return; }

  const coach  = getCoach();
  const data   = getPracticeData();
  const slug   = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  const teamId = document.getElementById('save-team-selector').value || null;

  const { error } = await _supabase.from('practice').upsert({
    user_id:  session.user.id,
    coach,
    slug,
    name:     data.name,
    date:     data.date,
    team:     data.team,
    target:   data.target,
    items:    JSON.stringify(data.items),
    team_id:  teamId ? parseInt(teamId) : null,
    saved_at: new Date().toISOString(),
  }, { onConflict: 'user_id,slug' });

  if (error) showToast('Save failed: ' + error.message, true);
  else       showToast(teamId ? '✓ Practice saved & shared with team' : '✓ Practice saved (private)');
}

async function openLoadModal() {
  document.getElementById('load-modal').style.display = 'flex';
  const el = document.getElementById('load-list');
  el.innerHTML = `<div style="padding:20px;text-align:center;font-size:10px;color:var(--muted)">Loading…</div>`;
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    const userId = session?.user?.id || null;
    const sel    = document.getElementById('save-team-selector');
    const selectedTeamId = sel?.value || null;
    const teamLabel      = selectedTeamId ? (sel.options[sel.selectedIndex]?.text || 'team') : 'private';

    let query = _supabase
      .from('practice')
      .select('id, name, coach, date, team, target, items, saved_at, user_id, team_id')
      .order('saved_at', { ascending: false });

    if (selectedTeamId) query = query.eq('team_id', selectedTeamId);
    else                query = query.eq('user_id', userId).is('team_id', null);

    const { data: list, error } = await query;
    if (error) throw new Error(error.message);

    if (!list || !list.length) {
      el.innerHTML = `<div style="padding:20px;text-align:center;font-size:10px;color:var(--muted)">No saved practices found for <strong>${esc(teamLabel)}</strong>.</div>`;
      return;
    }
    el.innerHTML = list.map(p => {
      const count  = JSON.parse(p.items || '[]').length;
      const isMine = p.user_id === userId;
      const meta   = [p.date, p.team, `${count} drill${count !== 1 ? 's' : ''}`, `${p.target} min target`].filter(Boolean).join(' · ');
      const delBtn = isMine
        ? `<button class="load-item-del" onclick="event.stopPropagation();deletePractice(${p.id},this)" title="Delete">✕</button>`
        : '';
      return `
        <div class="load-item" onclick="loadPractice(${p.id})">
          <div class="load-item-info">
            <div class="load-item-name">${esc(p.name)}</div>
            <div class="load-item-meta">${meta}</div>
          </div>
          ${delBtn}
        </div>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<div style="padding:20px;text-align:center;font-size:10px;color:#e05a5a">Could not load: ${err.message}</div>`;
  }
}

function closeLoadModal() { document.getElementById('load-modal').style.display = 'none'; }

async function loadPractice(id) {
  try {
    const { data, error } = await _supabase.from('practice').select('*').eq('id', id).single();
    if (error) throw new Error(error.message);
    document.getElementById('practice-name').value   = data.name   || '';
    document.getElementById('practice-date').value   = data.date   || '';
    document.getElementById('practice-team').value   = data.team   || '';
    document.getElementById('target-duration').value = data.target || 60;
    practiceItems = JSON.parse(data.items || '[]');
    renderList();
    closeLoadModal();
    showToast('Loaded: ' + (data.name || 'Practice'));
  } catch (err) {
    showToast('Load failed: ' + err.message, true);
  }
}

async function deletePractice(id, btn) {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) return;
  if (!confirm('Delete this practice?')) return;
  try {
    const { error } = await _supabase.from('practice').delete().eq('id', id).eq('user_id', session.user.id);
    if (error) throw new Error(error.message);
    btn.closest('.load-item').remove();
    showToast('Practice deleted');
    if (!document.querySelector('#load-list .load-item')) {
      document.getElementById('load-list').innerHTML =
        `<div style="padding:20px;text-align:center;font-size:10px;color:var(--muted)">No saved practices found.</div>`;
    }
  } catch (err) {
    showToast('Delete failed: ' + err.message, true);
  }
}

function openShareModal() {
  const enc = btoa(encodeURIComponent(JSON.stringify(getPracticeData())));
  document.getElementById('share-url').value   = `${location.origin}${location.pathname}?plan=${enc}`;
  document.getElementById('share-modal').style.display = 'flex';
}
function closeShareModal() { document.getElementById('share-modal').style.display = 'none'; }
function copyShareURL() {
  navigator.clipboard.writeText(document.getElementById('share-url').value)
    .then(() => { showToast('Link copied!'); closeShareModal(); });
}

function loadFromURL() {
  const plan = new URLSearchParams(location.search).get('plan');
  if (!plan) return;
  try {
    const data = JSON.parse(decodeURIComponent(atob(plan)));
    document.getElementById('practice-name').value   = data.name   || '';
    document.getElementById('practice-date').value   = data.date   || '';
    document.getElementById('practice-team').value   = data.team   || '';
    document.getElementById('target-duration').value = data.target || 60;
    practiceItems = data.items || [];
    renderList();
    showToast('Practice loaded from link');
  } catch (e) { showToast('Could not load from link', true); }
}

// ── PDF export ───────────────────────────────────────────────
function exportPDF() {
  const data  = getPracticeData();
  const total = practiceItems.reduce((s, x) => s + (x.duration || 0), 0);

  const pageHeader = `
    <div class="pc-page-header">
      <h1>${esc(data.name)}</h1>
      <div class="pc-meta-row">
        <span><span class="pc-meta-lbl">Date:</span> ${esc(data.date)}</span>
        <span><span class="pc-meta-lbl">Team:</span> ${esc(data.team)}</span>
        <span><span class="pc-meta-lbl">Duration:</span> ${total} / ${data.target} min</span>
      </div>
    </div>`;

  const summaryRows = practiceItems.map((item, i) => `
    <tr>
      <td class="pc-summary-num">${i + 1}</td>
      <td class="pc-summary-name">${esc(item.name)}</td>
      <td>${item.type === 'quick' ? 'Quick Drill' : (item.tags || []).join(', ')}</td>
      <td>${item.duration} min</td>
    </tr>`).join('');

  const summaryTable = `
    <table class="pc-summary">
      <thead><tr><th>#</th><th>Drill</th><th>Tags</th><th>Time</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>`;

  const drillCards = practiceItems.map((item, i) => {
    const tagPills  = (item.tags || []).map(t => `<span class="pc-drill-tag">${esc(t)}</span>`).join('');
    const rinkClass = item.rinkView === 'full' ? 'rink-full' : 'rink-half';
    const imgCell   = item.type === 'diagram' ? `
      <td class="pc-drill-img-cell ${rinkClass}">
        ${item.thumbnail
          ? `<img src="${item.thumbnail}" alt="${esc(item.name)}" />`
          : `<div class="pc-no-img">No diagram available.</div>`}
      </td>` : '';
    const descHtml  = item.desc
      ? item.desc.split(/\n|<br>/i).map(l => `<p>${esc(l)}</p>`).join('')
      : `<p style="color:#aaa;font-style:italic">No description provided.</p>`;
    return `
      <div class="pc-drill ${item.type === 'quick' ? 'quick' : ''}">
        <div class="pc-drill-bar">
          <div class="pc-drill-bar-left">
            <span class="pc-drill-num">${i + 1}.</span>
            <span class="pc-drill-title">${esc(item.name)}</span>
            ${tagPills}
          </div>
          <div class="pc-drill-bar-right">${item.duration} min</div>
        </div>
        <table class="pc-drill-body">
          <tr>${imgCell}<td class="pc-drill-desc-cell">${descHtml}</td></tr>
        </table>
      </div>`;
  }).join('');

  const container = document.getElementById('print-container');
  container.innerHTML = pageHeader + summaryTable + `<div class="pc-section-label">Drill Details</div>` + drillCards;

  const images   = container.getElementsByTagName('img');
  const promises = Array.from(images).map(img =>
    img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
  );
  Promise.all(promises).then(() => {
    setTimeout(() => {
      window.print();
      setTimeout(() => { container.innerHTML = ''; }, 500);
    }, 250);
  });
}

// ── Thumbnail hover preview ──────────────────────────────────
let thumbTip = null;

function getThumbTip() {
  if (!thumbTip) {
    thumbTip = document.createElement('div');
    thumbTip.className = 'lib-thumb-tip';
    thumbTip.innerHTML = '<img />';
    document.body.appendChild(thumbTip);
  }
  return thumbTip;
}

function showThumbTip(e, id) {
  const d = drillLibrary.find(x => x.id == id);
  if (!d || !d.thumbnail) return;
  const tip = getThumbTip();
  tip.querySelector('img').src = d.thumbnail;
  tip.classList.add('visible');
  moveThumbTip(e);
}

function moveThumbTip(e) {
  if (!thumbTip || !thumbTip.classList.contains('visible')) return;
  const gap = 12, tw = 220;
  const x   = e.clientX + gap + tw > window.innerWidth ? e.clientX - tw - gap : e.clientX + gap;
  const y   = Math.min(e.clientY - 20, window.innerHeight - thumbTip.offsetHeight - 8);
  thumbTip.style.left = x + 'px';
  thumbTip.style.top  = y + 'px';
}

function hideThumbTip() {
  if (thumbTip) thumbTip.classList.remove('visible');
}

// ── Helpers ──────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Event wiring ─────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); savePractice(); }
});

document.getElementById('share-modal').addEventListener('click', function(e) {
  if (e.target === this) closeShareModal();
});
document.getElementById('load-modal').addEventListener('click', function(e) {
  if (e.target === this) closeLoadModal();
});
document.getElementById('qd-desc').addEventListener('keydown', e => {
  if (e.key === 'Enter') addQuickDrill();
});

init();
