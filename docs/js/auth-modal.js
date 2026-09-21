/* ─────────────────────────────────────────────────────────────
   js/auth-modal.js  —  Reusable sign-in / sign-up modal
   Lets a logged-out coach authenticate from canvas.html or
   practice.html without navigating to index.html — so whatever
   they were mid-edit (canvas drawing, practice plan) stays intact
   in memory the whole time. The page never reloads or unloads.

   Usage:
     openAuthModal(onSuccess, message)
       onSuccess(session) — called once sign-in/sign-up completes
       message            — optional context line shown in the modal

   Depends on: _supabase (config.js). Sets localStorage
   'drillLab:coach' on success, matching the key used elsewhere.
───────────────────────────────────────────────────────────── */

(function () {
  const STORAGE_KEY = 'drillLab:coach';

  let modalEl  = null;
  let isSignUp = false;
  let pendingCallback = null;

  function injectStyles() {
    if (document.getElementById('auth-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'auth-modal-styles';
    style.textContent = `
      #auth-modal-backdrop {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,.7); z-index: 3000;
        align-items: center; justify-content: center;
      }
      #auth-modal-backdrop.open { display: flex; }
      #auth-modal-box {
        background: var(--panel); border: 1px solid var(--border);
        border-radius: 10px; padding: 28px 32px; width: 100%;
        max-width: 380px; position: relative;
      }
      #auth-modal-close {
        position: absolute; top: 14px; right: 18px;
        background: none; border: none; color: var(--muted);
        font-size: 20px; cursor: pointer; line-height: 1;
      }
      #auth-modal-close:hover { color: var(--text); }
      #auth-modal-box h2 { margin: 0 0 6px; font-size: 17px; color: var(--text); }
      #auth-modal-sub   { font-size: 12px; color: var(--muted); margin-bottom: 18px; line-height: 1.5; }
      #auth-modal-box input {
        width: 100%; box-sizing: border-box;
        background: var(--bg); color: var(--text);
        border: 1px solid var(--border); border-radius: 5px;
        padding: 8px 12px; font-size: 14px; margin-bottom: 10px;
        font-family: inherit; outline: none;
      }
      #auth-modal-box input:focus { border-color: var(--accent); }
      #auth-modal-box .btn { width: 100%; margin-bottom: 10px; justify-content: center; }
      #auth-modal-links {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 12px; margin-top: 2px;
      }
      #auth-modal-links button {
        background: none; border: none; color: var(--accent);
        text-decoration: underline; cursor: pointer;
        font-size: 12px; padding: 0;
      }
      #auth-modal-error { font-size: 12px; margin-top: 10px; display: none; line-height: 1.5; }
    `;
    document.head.appendChild(style);
  }

  function buildModal() {
    if (modalEl) return;
    injectStyles();

    const backdrop = document.createElement('div');
    backdrop.id = 'auth-modal-backdrop';
    backdrop.innerHTML = `
      <div id="auth-modal-box">
        <button id="auth-modal-close" aria-label="Close">✕</button>
        <h2 id="auth-modal-title">Sign in</h2>
        <p id="auth-modal-sub">Sign in to save your work to the cloud.</p>
        <input type="text"     id="auth-modal-display" placeholder="Display name" autocomplete="off" style="display:none;"/>
        <input type="email"    id="auth-modal-email"    placeholder="Email" autocomplete="email"/>
        <input type="password" id="auth-modal-pass"     placeholder="Password" autocomplete="current-password"/>
        <button class="btn btn-primary" id="auth-modal-confirm">Sign in →</button>
        <div id="auth-modal-links">
          <button id="auth-modal-toggle" type="button">Create account</button>
          <button id="auth-modal-forgot" type="button">Forgot password?</button>
        </div>
        <p id="auth-modal-sender-note" style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5;">
          Account emails (confirmations, password resets) come from <strong>rinklabsadmin@gmail.com</strong> — check spam if you don't see them.
        </p>
        <p id="auth-modal-error"></p>
      </div>
    `;
    document.body.appendChild(backdrop);
    modalEl = backdrop;

    const emailInput   = backdrop.querySelector('#auth-modal-email');
    const passInput    = backdrop.querySelector('#auth-modal-pass');
    const displayInput = backdrop.querySelector('#auth-modal-display');
    const confirmBtn   = backdrop.querySelector('#auth-modal-confirm');
    const toggleBtn    = backdrop.querySelector('#auth-modal-toggle');
    const forgotBtn    = backdrop.querySelector('#auth-modal-forgot');
    const closeBtn     = backdrop.querySelector('#auth-modal-close');
    const errorEl      = backdrop.querySelector('#auth-modal-error');
    const titleEl      = backdrop.querySelector('#auth-modal-title');

    function showMsg(msg, ok) {
      errorEl.textContent   = msg;
      errorEl.style.color   = ok ? '#a6e3a1' : '#f38ba8';
      errorEl.style.display = 'block';
    }

    toggleBtn.addEventListener('click', () => {
      isSignUp = !isSignUp;
      titleEl.textContent        = isSignUp ? 'Create account' : 'Sign in';
      confirmBtn.textContent     = isSignUp ? 'Sign up →' : 'Sign in →';
      toggleBtn.textContent      = isSignUp ? 'Already have an account?' : 'Create account';
      displayInput.style.display = isSignUp ? 'block' : 'none';
      passInput.placeholder      = isSignUp ? 'Password (min 6 chars)' : 'Password';
      forgotBtn.style.display    = isSignUp ? 'none' : 'inline';
      errorEl.style.display      = 'none';
    });

    forgotBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (!email) { showMsg('Enter your email above first.', false); return; }
      const { error } = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html'
      });
      showMsg(error ? error.message : '✓ Password reset email sent — check your inbox.', !error);
    });

    async function handleAuth() {
      const email   = emailInput.value.trim();
      const pass    = passInput.value;
      const display = displayInput.value.trim();
      if (!email || !pass) return;
      if (isSignUp && !display) { showMsg('Please enter a display name.', false); return; }

      errorEl.style.display   = 'none';
      confirmBtn.disabled     = true;
      confirmBtn.textContent  = isSignUp ? 'Signing up…' : 'Signing in…';

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
          showMsg('✓ Check your email to confirm your account, then sign in.', true);
          confirmBtn.disabled    = false;
          confirmBtn.textContent = 'Sign up →';
          return;
        }

        const cb = pendingCallback;
        closeModal();
        if (typeof cb === 'function') cb(result.data.session);
      } catch (err) {
        showMsg(err.message || 'Something went wrong.', false);
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

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && backdrop.classList.contains('open')) closeModal();
    });
  }

  function closeModal() {
    if (modalEl) modalEl.classList.remove('open');
    pendingCallback = null;
  }

  // Opens the modal in a fresh sign-in state. onSuccess(session) fires
  // right after the modal closes on success — never on cancel/close.
  window.openAuthModal = function (onSuccess, message) {
    buildModal();
    pendingCallback = onSuccess || null;
    isSignUp = false;

    modalEl.querySelector('#auth-modal-sub').textContent        = message || 'Sign in to save your work to the cloud.';
    modalEl.querySelector('#auth-modal-title').textContent      = 'Sign in';
    modalEl.querySelector('#auth-modal-confirm').textContent    = 'Sign in →';
    modalEl.querySelector('#auth-modal-toggle').textContent     = 'Create account';
    modalEl.querySelector('#auth-modal-forgot').style.display   = 'inline';
    modalEl.querySelector('#auth-modal-display').style.display  = 'none';
    modalEl.querySelector('#auth-modal-error').style.display    = 'none';
    modalEl.querySelector('#auth-modal-email').value            = '';
    modalEl.querySelector('#auth-modal-pass').value             = '';
    modalEl.querySelector('#auth-modal-display').value          = '';
    modalEl.classList.add('open');
    requestAnimationFrame(() => modalEl.querySelector('#auth-modal-email').focus());
  };

  window.closeAuthModal = closeModal;
})();
