/* ─────────────────────────────────────────────────────────────
   js/auth.js  —  Auth flow + team management for index.html
   Depends on: _supabase (config.js)
───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'drillLab:coach';

const promptEl    = document.getElementById('coach-prompt');
const greetingEl  = document.getElementById('coach-greeting');
const greetName   = document.getElementById('coach-greeting-name');
const emailInput  = document.getElementById('coach-text');
const passInput   = document.getElementById('coach-pin');
const displayInput = document.getElementById('coach-display');
const confirmBtn  = document.getElementById('coach-confirm');
const changeBtn   = document.getElementById('coach-change');
const errorEl     = document.getElementById('coach-error');
const toggleBtn   = document.getElementById('auth-toggle');
const authLabel   = document.getElementById('auth-label');
const accountBtn  = document.getElementById('account-btn');
const accountModal = document.getElementById('account-modal');

let isSignUp = false;

// ── Auth mode toggle ─────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
  isSignUp = !isSignUp;
  if (isSignUp) {
    authLabel.textContent      = 'Create account';
    confirmBtn.textContent     = 'Sign up →';
    toggleBtn.textContent      = 'Already have an account?';
    displayInput.style.display = 'block';
    passInput.placeholder      = 'Password (min 6 chars)';
  } else {
    authLabel.textContent      = 'Sign in';
    confirmBtn.textContent     = 'Sign in →';
    toggleBtn.textContent      = 'Create account';
    displayInput.style.display = 'none';
    passInput.placeholder      = 'Password';
  }
  errorEl.style.display = 'none';
  document.getElementById('auth-forgot').style.display = isSignUp ? 'none' : 'inline';
});

// ── Forgot password ──────────────────────────────────────────
document.getElementById('auth-forgot').addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) {
    errorEl.style.color   = '#f38ba8';
    errorEl.textContent   = 'Enter your email above first.';
    errorEl.style.display = 'inline';
    return;
  }
  const { error } = await _supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split('?')[0],
  });
  errorEl.style.color   = error ? '#f38ba8' : '#a6e3a1';
  errorEl.textContent   = error ? error.message : '✓ Password reset email sent — check your inbox.';
  errorEl.style.display = 'inline';
});

// ── UI helpers ───────────────────────────────────────────────
function showGreeting(name) {
  greetName.textContent    = name;
  promptEl.style.display   = 'none';
  greetingEl.style.display = 'flex';
}

function showPrompt() {
  promptEl.style.display   = 'flex';
  greetingEl.style.display = 'none';
  errorEl.style.display    = 'none';
  emailInput.value         = '';
  passInput.value          = '';
  displayInput.value       = '';
  emailInput.focus();
}

// ── Sign in / sign up ────────────────────────────────────────
async function handleAuth() {
  const email   = emailInput.value.trim();
  const pass    = passInput.value;
  const display = displayInput.value.trim();

  if (!email || !pass) return;
  if (isSignUp && !display) {
    errorEl.textContent   = 'Please enter a display name.';
    errorEl.style.display = 'inline';
    return;
  }

  errorEl.style.display  = 'none';
  confirmBtn.disabled    = true;
  confirmBtn.textContent = isSignUp ? 'Signing up…' : 'Signing in…';

  try {
    let result;
    if (isSignUp) {
      result = await _supabase.auth.signUp({
        email, password: pass,
        options: { data: { display_name: display } },
      });
    } else {
      result = await _supabase.auth.signInWithPassword({ email, password: pass });
    }

    if (result.error) throw result.error;

    const user = result.data.user || result.data.session?.user;
    const name = user?.user_metadata?.display_name || email;
    localStorage.setItem(STORAGE_KEY, name);

    if (isSignUp && !result.data.session) {
      errorEl.style.color    = '#a6e3a1';
      errorEl.textContent    = '✓ Check your email to confirm your account, then sign in.';
      errorEl.style.display  = 'inline';
      confirmBtn.disabled    = false;
      confirmBtn.textContent = 'Sign up →';
      return;
    }

    showGreeting(name);
    if (result.data.session) showTeamPanel(result.data.session);
  } catch (err) {
    errorEl.style.color   = '#f38ba8';
    errorEl.textContent   = err.message || 'Something went wrong.';
    errorEl.style.display = 'inline';
  } finally {
    if (confirmBtn.disabled) {
      confirmBtn.disabled    = false;
      confirmBtn.textContent = isSignUp ? 'Sign up →' : 'Sign in →';
    }
  }
}

confirmBtn.addEventListener('click', handleAuth);
[emailInput, passInput, displayInput].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); })
);

// ── Sign out ─────────────────────────────────────────────────
changeBtn.addEventListener('click', async () => {
  await _supabase.auth.signOut();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('drillLab:teamId');
  accountModal.style.display = 'none';
  showPrompt();
});

// ── Account modal ────────────────────────────────────────────
const accountModalClose = document.getElementById('account-modal-close');
const deleteAccountBtn  = document.getElementById('delete-account-btn');
const deleteModal       = document.getElementById('delete-account-modal');
const cancelDeleteBtn   = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn  = document.getElementById('confirm-delete-btn');
const deleteInput       = document.getElementById('delete-confirm-input');
const deleteError       = document.getElementById('delete-error');

accountBtn.addEventListener('click', () => { accountModal.style.display = 'flex'; });
accountModalClose.addEventListener('click', () => { accountModal.style.display = 'none'; });
accountModal.addEventListener('click', e => {
  if (e.target === accountModal) accountModal.style.display = 'none';
});

// ── Delete account ───────────────────────────────────────────
deleteAccountBtn.addEventListener('click', () => {
  deleteModal.style.display = 'flex';
  deleteInput.value         = '';
  confirmDeleteBtn.disabled = true;
  deleteError.style.display = 'none';
});
cancelDeleteBtn.addEventListener('click', () => { deleteModal.style.display = 'none'; });
deleteInput.addEventListener('input', () => {
  confirmDeleteBtn.disabled = deleteInput.value.trim() !== 'DELETE';
});
confirmDeleteBtn.addEventListener('click', async () => {
  confirmDeleteBtn.disabled    = true;
  confirmDeleteBtn.textContent = 'Deleting…';
  const { data: { user } } = await _supabase.auth.getUser();
  await _supabase.from('team_member').delete().eq('user_id', user.id);
  const { error } = await _supabase.rpc('delete_user');
  if (error) {
    deleteError.textContent      = 'Something went wrong — please try again.';
    deleteError.style.display    = 'block';
    confirmDeleteBtn.disabled    = false;
    confirmDeleteBtn.textContent = 'Delete My Account';
  } else {
    await _supabase.auth.signOut();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('drillLab:teamId');
    window.location.reload();
  }
});

// ── Team management ──────────────────────────────────────────
function showTeamPanel(session) { loadTeamState(session); }

async function loadTeamState(session) {
  const { data: memberships } = await _supabase
    .from('team_member')
    .select('team_id, team(id, name, code, owner_id)')
    .eq('user_id', session.user.id);
  const teams = (memberships || []).map(m => m.team).filter(Boolean);
  teams.length === 0 ? showTeamPrompt() : showTeamInfo(teams, session.user.id);
}

const openMembers = new Set();   // team ids whose member list is expanded

// Styles for the team cards (kept here so index.html needs no changes)
(function injectTeamStyles() {
  const css = `
    .tm-card { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:12px 14px; }
    .tm-head { display:flex; align-items:center; gap:8px; }
    .tm-name { font-size:15px; font-weight:700; color:var(--text); }
    .tm-badge { font-size:10px; letter-spacing:.06em; text-transform:uppercase; padding:1px 6px; border-radius:3px;
                border:1px solid var(--border); color:var(--muted); }
    .tm-badge.owner { color:var(--accent); border-color:var(--accent); }
    .tm-count { font-size:12px; color:var(--muted); margin-left:2px; }
    .tm-code-row { display:flex; align-items:center; gap:8px; margin-top:8px; font-size:12px; color:var(--muted); }
    .tm-footer { display:flex; align-items:center; gap:14px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
    .tm-link { font-size:12px; color:var(--accent); background:none; border:none; cursor:pointer; padding:0; text-decoration:underline; }
    .tm-link.muted { color:var(--muted); }
    .tm-menu-wrap { position:relative; margin-left:auto; }
    .tm-menu-btn { background:none; border:1px solid var(--border); border-radius:4px; color:var(--muted);
                   cursor:pointer; font-size:16px; line-height:1; padding:2px 8px; }
    .tm-menu-btn:hover { color:var(--text); border-color:#666; }
    .tm-menu { display:none; position:absolute; right:0; bottom:calc(100% + 4px); min-width:150px; z-index:10;
               background:var(--panel); border:1px solid var(--border); border-radius:6px; padding:4px;
               box-shadow:0 4px 15px rgba(0,0,0,.5); flex-direction:column; }
    .tm-menu.open { display:flex; }
    .tm-menu button { background:none; border:none; text-align:left; font-size:13px; color:var(--text);
                      padding:6px 10px; border-radius:4px; cursor:pointer; }
    .tm-menu button:hover { background:var(--hover); }
    .tm-menu hr { border:0; height:1px; background:var(--border); margin:4px 0; }
    .tm-menu button.danger { color:#f38ba8; }
  `;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
})();

function toggleTeamMenu(e, teamId) {
  e.stopPropagation();
  const menu = document.getElementById('tm-menu-' + teamId);
  const wasOpen = menu.classList.contains('open');
  closeTeamMenus();
  if (!wasOpen) menu.classList.add('open');
}
function closeTeamMenus() {
  document.querySelectorAll('.tm-menu.open').forEach(m => m.classList.remove('open'));
}
document.addEventListener('click', closeTeamMenus);

function showTeamInfo(teams, userId) {
  document.getElementById('team-prompt').style.display   = 'none';
  document.getElementById('team-add-form').style.display = 'none';
  const info = document.getElementById('team-info');
  info.style.display = 'flex';

  const chipsEl = document.getElementById('team-chips');
  chipsEl.innerHTML = teams.map(t => {
    const isOwner = t.owner_id === userId;
    const data    = `data-id="${esc(t.id)}" data-name="${esc(t.name)}"`;

    const footerRight = isOwner
      ? `<div class="tm-menu-wrap">
           <button class="tm-menu-btn" title="Team actions" onclick="toggleTeamMenu(event,'${esc(t.id)}')">⋯</button>
           <div class="tm-menu" id="tm-menu-${esc(t.id)}">
             <button ${data} onclick="renameTeam(this.dataset.id, this.dataset.name)">Rename team</button>
             <button ${data} onclick="regenerateCode(this.dataset.id)">New invite code</button>
             <hr>
             <button class="danger" ${data} onclick="disbandTeam(this.dataset.id, this.dataset.name)">Disband team</button>
           </div>
         </div>`
      : `<button class="tm-link muted" style="margin-left:auto;" onclick="leaveTeam('${esc(t.id)}')">Leave team</button>`;

    return `
      <div style="flex-basis:100%;">
        <div class="tm-card">
          <div class="tm-head">
            <span class="tm-name">${esc(t.name)}</span>
            <span class="tm-badge ${isOwner ? 'owner' : ''}">${isOwner ? 'Owner' : 'Member'}</span>
            <span class="tm-count" id="count-${esc(t.id)}"></span>
          </div>
          <div class="tm-code-row">
            Invite code
            <span class="team-code-display" style="font-size:12px;" title="Click to copy" onclick="copyTeamCode('${esc(t.code)}')">${esc(t.code)}</span>
          </div>
          <div class="tm-footer">
            <button class="tm-link" onclick="toggleMembers('${esc(t.id)}', ${isOwner})">Members</button>
            ${footerRight}
          </div>
          <div id="members-${esc(t.id)}" style="display:none;margin-top:8px;"></div>
        </div>
      </div>`;
  }).join('');

  // Fill in member counts, and re-open any member lists that were expanded
  teams.forEach(t => {
    const isOwner = t.owner_id === userId;
    if (openMembers.has(String(t.id))) loadMembers(t.id, isOwner);
    else updateMemberCount(t.id);
  });
}

async function updateMemberCount(teamId) {
  const { data } = await _supabase.rpc('get_team_members', { p_team_id: teamId });
  setMemberCount(teamId, data);
}
function setMemberCount(teamId, members) {
  const el = document.getElementById('count-' + teamId);
  if (!el || !members) return;
  el.textContent = `· ${members.length} ${members.length === 1 ? 'coach' : 'coaches'}`;
}

// ── Members list ─────────────────────────────────────────────
function toggleMembers(teamId, isOwner) {
  const el = document.getElementById('members-' + teamId);
  if (!el) return;
  if (el.style.display !== 'none') {
    el.style.display = 'none';
    openMembers.delete(String(teamId));
    return;
  }
  openMembers.add(String(teamId));
  loadMembers(teamId, isOwner);
}

async function loadMembers(teamId, isOwner) {
  const el = document.getElementById('members-' + teamId);
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `<div style="font-size:12px;color:var(--muted);">Loading…</div>`;

  const { data: { session } } = await _supabase.auth.getSession();
  const { data, error } = await _supabase.rpc('get_team_members', { p_team_id: teamId });
  if (error) {
    el.innerHTML = `<div style="font-size:12px;color:#f38ba8;">Could not load members: ${esc(error.message)}</div>`;
    return;
  }

  setMemberCount(teamId, data);
  el.innerHTML = (data || []).map(m => {
    const isMe  = m.user_id === session.user.id;
    const badge = m.is_owner
      ? `<span style="font-size:10px;color:var(--accent);border:1px solid var(--accent);border-radius:3px;padding:0 5px;">Owner</span>`
      : '';
    const you = isMe ? `<span style="font-size:11px;color:var(--muted);">(you)</span>` : '';
    const kick = (isOwner && !m.is_owner)
      ? `<button data-team="${esc(teamId)}" data-user="${esc(m.user_id)}" data-name="${esc(m.display_name)}"
                 onclick="removeMember(this)"
                 style="font-size:11px;color:#f38ba8;background:none;border:none;cursor:pointer;text-decoration:underline;padding:0;margin-left:auto;">Remove</button>`
      : '';
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;border-bottom:1px solid var(--border);">
        <span>${esc(m.display_name)}</span>${badge}${you}${kick}
      </div>`;
  }).join('') || `<div style="font-size:12px;color:var(--muted);">No members found.</div>`;
}

async function removeMember(btn) {
  const { team, user, name } = btn.dataset;
  if (!confirm(`Remove ${name} from this team? They will need the team code to rejoin.`)) return;
  const { error } = await _supabase.rpc('kick_team_member', { p_team_id: team, p_user_id: user });
  if (error) { alert('Could not remove member: ' + error.message); return; }
  await loadMembers(team, true);
}

// ── New invite code (owner only) ─────────────────────────────
async function regenerateCode(teamId) {
  if (!confirm('Create a new team code? The old code will stop working immediately. Existing members are not affected.')) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await _supabase.from('team').update({ code: randomCode() }).eq('id', teamId);
    if (!error) { await refreshTeams(); return; }
    if (error.code !== '23505') { alert('Could not create new code: ' + error.message); return; }  // retry only on duplicate code
  }
  alert('Could not create a unique code — please try again.');
}

function copyTeamCode(code) {
  navigator.clipboard.writeText(code);
  const toast = document.getElementById('toast');
  if (toast) { toast.textContent = 'Code copied!'; toast.className = 'show'; setTimeout(() => toast.className = '', 2000); }
}

async function leaveTeam(teamId) {
  if (!confirm('Leave this team? You will no longer see shared practices.')) return;
  const { data: { session } } = await _supabase.auth.getSession();
  await _supabase.from('team_member').delete().eq('user_id', session.user.id).eq('team_id', teamId);
  if (localStorage.getItem('drillLab:teamId') === teamId) localStorage.removeItem('drillLab:teamId');
  await refreshTeams();
}

async function renameTeam(teamId, currentName) {
  const newName = prompt('Rename team:', currentName);
  if (newName === null) return;               // cancelled
  const trimmed = newName.trim();
  if (!trimmed || trimmed === currentName) return;
  const { error } = await _supabase.from('team').update({ name: trimmed }).eq('id', teamId);
  if (error) { alert('Could not rename team: ' + error.message); return; }
  await refreshTeams();
}

async function disbandTeam(teamId, name) {
  if (!confirm(`Disband "${name}"? This removes all members and unshares all practices. This cannot be undone.`)) return;
  await _supabase.from('practice').update({ team_id: null }).eq('team_id', teamId);
  const { error } = await _supabase.from('team').delete().eq('id', teamId);
  if (error) { alert('Could not disband team: ' + error.message); return; }
  if (localStorage.getItem('drillLab:teamId') === teamId) localStorage.removeItem('drillLab:teamId');
  await refreshTeams();
}

function showTeamPrompt() {
  localStorage.removeItem('drillLab:teamId');
  document.getElementById('team-info').style.display   = 'none';
  document.getElementById('team-prompt').style.display = 'flex';
}

function teamError(msg)  { const el = document.getElementById('team-error');  el.textContent = msg; el.style.display = msg ? 'inline' : 'none'; }
function teamError2(msg) { const el = document.getElementById('team-error2'); el.textContent = msg; el.style.display = msg ? 'inline' : 'none'; }
function randomCode()    { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
function esc(s)          { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function refreshTeams() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (session) await loadTeamState(session);
}

// Create / join (initial form)
document.getElementById('btn-create-team').addEventListener('click', async () => {
  const name = document.getElementById('team-name-input').value.trim();
  if (!name) { teamError('Enter a team name.'); return; }
  teamError('');
  const { data: { session } } = await _supabase.auth.getSession();
  const code = randomCode();
  const { data: team, error } = await _supabase.from('team').insert({ name, code, owner_id: session.user.id }).select().single();
  if (error) { teamError(error.message); return; }
  await _supabase.from('team_member').insert({ team_id: team.id, user_id: session.user.id });
  document.getElementById('team-name-input').value = '';
  await refreshTeams();
});

document.getElementById('btn-join-team').addEventListener('click', async () => {
  const code = document.getElementById('team-code-input').value.trim().toUpperCase();
  if (!code) { teamError('Enter an invite code.'); return; }
  teamError('');
  const { data: team, error } = await _supabase.from('team').select('id, name, code, owner_id').eq('code', code).maybeSingle();
  if (error || !team) { teamError('Team not found — check the code and try again.'); return; }
  const { data: { session } } = await _supabase.auth.getSession();
  const { error: joinError } = await _supabase.from('team_member').insert({ team_id: team.id, user_id: session.user.id });
  if (joinError && !joinError.message.includes('duplicate')) { teamError(joinError.message); return; }
  document.getElementById('team-code-input').value = '';
  await refreshTeams();
});

// Add team form (inline)
document.getElementById('btn-add-team').addEventListener('click', () => {
  const f = document.getElementById('team-add-form');
  f.style.display = f.style.display === 'none' ? 'flex' : 'none';
});
document.getElementById('btn-cancel-add').addEventListener('click', () => {
  document.getElementById('team-add-form').style.display = 'none';
});

document.getElementById('btn-create-team2').addEventListener('click', async () => {
  const name = document.getElementById('team-name-input2').value.trim();
  if (!name) { teamError2('Enter a team name.'); return; }
  teamError2('');
  const { data: { session } } = await _supabase.auth.getSession();
  const code = randomCode();
  const { data: team, error } = await _supabase.from('team').insert({ name, code, owner_id: session.user.id }).select().single();
  if (error) { teamError2(error.message); return; }
  await _supabase.from('team_member').insert({ team_id: team.id, user_id: session.user.id });
  document.getElementById('team-name-input2').value = '';
  await refreshTeams();
});

document.getElementById('btn-join-team2').addEventListener('click', async () => {
  const code = document.getElementById('team-code-input2').value.trim().toUpperCase();
  if (!code) { teamError2('Enter an invite code.'); return; }
  teamError2('');
  const { data: team, error } = await _supabase.from('team').select('id, name, code, owner_id').eq('code', code).maybeSingle();
  if (error || !team) { teamError2('Team not found — check the code and try again.'); return; }
  const { data: { session } } = await _supabase.auth.getSession();
  const { error: joinError } = await _supabase.from('team_member').insert({ team_id: team.id, user_id: session.user.id });
  if (joinError && !joinError.message.includes('duplicate')) { teamError2(joinError.message); return; }
  document.getElementById('team-code-input2').value = '';
  await refreshTeams();
});

// ── Boot — restore session ───────────────────────────────────
_supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    const name = session.user.user_metadata?.display_name || session.user.email;
    localStorage.setItem(STORAGE_KEY, name);
    showGreeting(name);
    showTeamPanel(session);
  } else {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) showGreeting(stored);
    else showPrompt();
  }
});
