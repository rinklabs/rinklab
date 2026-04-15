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
    redirectTo: window.location.origin + '/index.html',
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

function showTeamInfo(teams, userId) {
  document.getElementById('team-prompt').style.display   = 'none';
  document.getElementById('team-add-form').style.display = 'none';
  const info = document.getElementById('team-info');
  info.style.display = 'flex';

  const chipsEl = document.getElementById('team-chips');
  chipsEl.innerHTML = teams.map(t => {
    const isOwner   = t.owner_id === userId;
    const actionBtn = isOwner
      ? `<button onclick="disbandTeam('${t.id}','${esc(t.name)}')" style="font-size:11px;color:#f38ba8;background:none;border:none;cursor:pointer;text-decoration:underline;padding:0;">Disband</button>`
      : `<button onclick="leaveTeam('${t.id}')" style="font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer;text-decoration:underline;padding:0;">Leave</button>`;
    return `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 12px;display:flex;align-items:center;gap:10px;">
        <strong style="font-size:13px;">${esc(t.name)}</strong>
        <span class="team-code-display" style="font-size:12px;" title="Click to copy" onclick="copyTeamCode('${t.code}')">${t.code}</span>
        ${actionBtn}
      </div>`;
  }).join('');
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
