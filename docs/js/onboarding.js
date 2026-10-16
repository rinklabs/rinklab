/* js/onboarding.js — first-visit tours for Rink Lab (index + practice pages)
 *
 *   RinkTour.auto('index' | 'practice')   run on page load; shows the tour once per device,
 *                                         and a "join your team" nudge once per account
 *   RinkTour.start(page, {force:true})    replay the tour on demand
 */
(function () {
  'use strict';

  var VERSION = 1; // bump to show the tour again after you change it

  // ── storage (safe if localStorage is blocked) ──────────────
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var tourKey  = function (page) { return 'rinklab:tour:' + page + ':v' + VERSION; };
  var nudgeKey = function (uid)  { return 'rinklab:joinNudge:' + uid; };

  // ── who is looking at the page? ────────────────────────────
  async function getCtx() {
    var ctx = { signedIn: false, hasTeams: false, uid: null };
    try {
      var res = await _supabase.auth.getSession();
      var session = res.data && res.data.session;
      if (!session) return ctx;
      ctx.signedIn = true;
      ctx.uid = session.user.id;
      var m = await _supabase.from('team_member').select('team_id').eq('user_id', ctx.uid).limit(1);
      ctx.hasTeams = !!(m.data && m.data.length);
    } catch (e) { /* offline or not configured: treat as signed out */ }
    return ctx;
  }

  // ── step definitions ───────────────────────────────────────
  function openAccount() {
    var b = document.getElementById('account-btn');
    if (b) b.click();
  }

  function joinTeamStep(page) {
    return {
      title: 'Join your team',
      body: 'Assistant coaches: ask your head coach for the <b>team code</b>, then open ' +
            'the menu under your name on the home page, choose <b>Manage Teams and Account</b>, and enter it under “join with code”. ' +
            'Your team will then appear in the Team dropdown on the Practice page.',
      action: page === 'index'
        ? { label: 'Open Teams', run: openAccount }
        : { label: 'Go to home page', run: function () { location.href = 'index.html#teams'; } }
    };
  }

  var TOURS = {
    index: function (ctx) {
      return [
        { title: 'Welcome to Rink Lab',
          body: 'A quick tour of where things are. You can replay it any time from the “Replay the tour” button at the bottom of this page.' },

        ctx.signedIn
          ? { target: '#coach-greeting', title: 'You’re signed in',
              body: 'Tap your name for your account menu: manage your teams or sign out.' }
          : { target: '#header-actions', title: 'Sign in or create an account',
              body: 'You need an account to save drills and practices and to join a team. ' +
                    'Every coach, head or assistant, should create their own.',
              action: { label: 'Go to sign in', run: function () {
                var b = document.getElementById('hdr-signin'); if (b) b.click(); } } },

        { target: ctx.signedIn ? '#coach-greeting' : '#header-actions',
          title: 'Create or join your team',
          body: ctx.signedIn
            ? 'Open the menu under your name and choose <b>Manage Teams and Account</b>. Head coaches: create a team and share its code. Assistant coaches: <b>join with the code from your head coach</b>. ' +
              'Do this first — it connects you to your team’s drills and practices.'
            : 'Once you’re signed in, open the menu under your name and choose <b>Manage Teams and Account</b>. Head coaches create a team; ' +
              'assistant coaches join with the code from their head coach.',
          action: ctx.signedIn ? { label: 'Open Teams', run: openAccount } : null },

        { target: '.grid-a', title: 'The three labs',
          body: 'Draw drills, build practice plans, and browse the library of everything your teams have saved.' },

        { target: '#hero-cta-row', title: 'Want more detail?',
          body: '<b>Quick Start</b> is a short walkthrough. <b>How To Use</b> is the full guide.' }
      ];
    },

    practice: function (ctx) {
      var teamStep;
      if (!ctx.signedIn) {
        teamStep = {target: ['#auth-status.out', '#auth-status'], title: 'Sign in to use your team',
          body: 'Sign in to save practices and see your team’s drills. Assistant coaches: after signing in, ' +
                'join your team with the code from your head coach.',
          action: { label: 'Sign in', run: function () {
            if (typeof openAuthModal === 'function') openAuthModal(function () { location.reload(); });
          } } };
      } else if (!ctx.hasTeams) {
        teamStep = joinTeamStep('practice');
        teamStep.title = 'You haven’t joined a team yet';
      } else {
        teamStep = { target: '#team-selector-wrap', title: 'Pick your team',
          body: 'Choose your team here so you see and save the team’s practices. ' +
                'Coaching more than one team? Switch here. “None (private)” keeps a plan to yourself.' };
      }
      return [
        { title: 'Welcome to the Practice Lab',
          body: 'Build a practice plan from your drills. Quick tour of the main parts.' },
        teamStep,
        { target: ['#pg-sidebar', '#sidebar-toggle'], title: 'Drill Library',
          body: 'The library of drills live here. Add them to your practice plan, or use <b>Quick Drill</b> for a one-off drill without a picture. ' +
                'On a phone, tap the clipboard icon to open it. Drills can be grouped using <i class="ti ti-arrows-join" aria-hidden="true"></i> to run multiple drills simultaneously. Use <i class="ti ti-eye" aria-hidden="true"> to see a drill preview.' },
        { target: '#target-duration', title: 'Practice Length',
          body: 'Set your target practice length and keep track of used time at the bottom.' },
        { target: '#pg-list-wrap', title: 'Your practice plan',
          body: 'Added drills appear here in order. The bar at the bottom shows how much of the practice time is used. You can always reorder the drills or merge two drills to be run concurrently.' },
        { target: '#practice-name', title: 'Name your practice',
          body: 'Give your practice a name so you can find it later. The title is also printed on the PDF.' },
        { union: ['#top-actions .btn-primary', '#btn-library-top'], title: 'Save and Load',
          body: '<b>Save</b> stores this practice to the team shown in the Team menu, so your team can find it. ' +
                '<b>Load</b>, right beside it, reopens any practice you’ve saved. ' +
                'Start a fresh one from <b>New</b> (in the ⋮ menu on a phone).' },
        { union: ['#btn-pdf-top', '#btn-share-top', '#btn-mobile-menu'], title: 'PDF and Share',
          body: '<b>PDF</b> builds a printable plan with a summary table and each drill’s details. ' +
                'Your browser’s print window opens: choose <b>Save as PDF</b> as the destination. ' +
                '<b>Share</b> gives you a link instead. On a phone, both are in the ⋮ menu.' },
        {target: ["#btn-view", "btn-mobile-menu"], title: "Preview your practice",
          body: "View the practice on easy to flip through cards to see if the flow works." },
        { target: ['#btn-help-top', '#btn-mobile-menu'], title: 'Help is always here',
          body: 'Open <b>Help</b> any time for the walkthrough, or replay this tour from there.' }
      ];
    }
  };

  // ── styles (injected once) ─────────────────────────────────
  function injectCSS() {
    if (document.getElementById('rt-css')) return;
    var s = document.createElement('style');
    s.id = 'rt-css';
    s.textContent =
      '.rt-root{position:fixed;inset:0;z-index:10000;font-family:Inter,system-ui,sans-serif}' +
      '.rt-dim{position:absolute;inset:0;background:rgba(0,0,0,.68)}' +
      '.rt-spot{position:absolute;border-radius:8px;border:2px solid var(--accent,#ff6b35);' +
        'box-shadow:0 0 0 9999px rgba(0,0,0,.68);pointer-events:none;transition:all .2s ease}' +
      '.rt-card{position:absolute;width:340px;max-width:calc(100vw - 24px);box-sizing:border-box;' +
        'background:var(--panel,#1a1a1a);color:var(--text,#eee);border:1px solid var(--border,#333);' +
        'border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.5)}' +
      '.rt-card h3{margin:0 0 6px;font-size:16px;color:var(--accent,#ff6b35)}' +
      '.rt-card p{margin:0 0 14px;font-size:13.5px;line-height:1.5}' +
      '.rt-foot{display:flex;align-items:center;gap:8px}' +
      '.rt-count{font-size:11px;color:var(--muted,#999);margin-right:auto}' +
      '.rt-btn{font:inherit;font-size:13px;padding:6px 12px;border-radius:5px;cursor:pointer;' +
        'border:1px solid var(--border,#333);background:transparent;color:var(--text,#eee)}' +
      '.rt-btn.rt-primary{background:var(--accent,#ff6b35);border-color:var(--accent,#ff6b35);color:#000;font-weight:600}' +
      '.rt-skip{background:none;border:none;color:var(--muted,#999);font-size:12px;text-decoration:underline;cursor:pointer;padding:0 4px}' +
      '.rt-help-row{display:flex;justify-content:center;margin:6px 0 18px}' +
      '.rt-help{display:inline-flex;align-items:center;gap:9px;font:inherit;font-size:13px;cursor:pointer;' +
        'color:var(--muted,#999);background:transparent;border:1px dashed var(--border,#333);' +
        'border-radius:999px;padding:8px 18px;transition:color .15s,border-color .15s,background .15s}' +
      '.rt-help svg{width:18px;height:18px;transition:transform .35s ease}' +
      '.rt-help:hover,.rt-help:focus-visible{color:var(--accent,#ff6b35);border-color:var(--accent,#ff6b35);' +
        'background:rgba(255,107,53,.08);outline:none}' +
      '.rt-help:hover svg,.rt-help:focus-visible svg{transform:rotate(45deg)}';
    document.head.appendChild(s);
  }

  // ── tour engine ────────────────────────────────────────────
  var active = false;

  function findVisible(sel) {
    var list = Array.isArray(sel) ? sel : [sel];
    for (var n = 0; n < list.length; n++) {
      var el = list[n] && document.querySelector(list[n]);
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth &&
          getComputedStyle(el).visibility !== 'hidden') return el;
    }
    return null;
  }

  // Where to draw the spotlight for a step. A step can use:
  //   target: [...]  → highlight the first of these that is visible
  //   union:  [...]  → highlight ALL of these together (one box around every visible one)
  function stepBox(st) {
    if (st.union) {
      var els = st.union.map(function (sel) { return findVisible(sel); }).filter(Boolean);
      if (els.length) {
        var rs = els.map(function (e) { return e.getBoundingClientRect(); });
        var top = Math.min.apply(null, rs.map(function (r) { return r.top; })),
            left = Math.min.apply(null, rs.map(function (r) { return r.left; })),
            right = Math.max.apply(null, rs.map(function (r) { return r.right; })),
            bottom = Math.max.apply(null, rs.map(function (r) { return r.bottom; }));
        return { el: els[0], rect: { top: top, left: left, right: right, bottom: bottom,
                                     width: right - left, height: bottom - top } };
      }
    }
    var t = st.target && findVisible(st.target);
    return t ? { el: t, rect: t.getBoundingClientRect() } : null;
  }

  // steps: array of step objects; onEnd(): called when the tour finishes or is skipped
  function run(steps, onEnd) {
    if (active || !steps.length) return;
    active = true;
    injectCSS();

    var i = 0;
    var root = document.createElement('div');
    root.className = 'rt-root';
    root.innerHTML =
      '<div class="rt-dim"></div><div class="rt-spot" style="display:none"></div>' +
      '<div class="rt-card" role="dialog" aria-live="polite" aria-label="Tour"></div>';
    document.body.appendChild(root);
    var dim = root.querySelector('.rt-dim'),
        spot = root.querySelector('.rt-spot'),
        card = root.querySelector('.rt-card');

    function end() {
      active = false;
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('keydown', onKey);
      root.remove();
      if (onEnd) onEnd();
    }

    function render() {
      var st = steps[i], last = i === steps.length - 1;
      card.innerHTML =
        '<h3>' + st.title + '</h3><p>' + st.body + '</p>' +
        '<div class="rt-foot">' +
          '<span class="rt-count">' + (i + 1) + ' / ' + steps.length + '</span>' +
          (last ? '' : '<button class="rt-skip" data-a="skip">Skip</button>') +
          (i > 0 ? '<button class="rt-btn" data-a="back">Back</button>' : '') +
          (st.action ? '<button class="rt-btn" data-a="act">' + st.action.label + '</button>' : '') +
          '<button class="rt-btn rt-primary" data-a="next">' + (last ? 'Done' : 'Next') + '</button>' +
        '</div>';
      var box = stepBox(st);
      if (box) box.el.scrollIntoView({ block: 'center', inline: 'nearest' });
      place();
      var nb = card.querySelector('[data-a="next"]'); if (nb) nb.focus();
    }

    function place() {
      var st = steps[i], box = stepBox(st);
      var vw = window.innerWidth, vh = window.innerHeight;
      var cw = card.offsetWidth, ch = card.offsetHeight, top, left;
      if (box) {
        var r = box.rect, pad = 6;
        dim.style.display = 'none';
        spot.style.display = 'block';
        spot.style.top = (r.top - pad) + 'px';
        spot.style.left = (r.left - pad) + 'px';
        spot.style.width = (r.width + pad * 2) + 'px';
        spot.style.height = (r.height + pad * 2) + 'px';
        if (r.bottom + ch + 24 < vh)      top = r.bottom + 14;   // below
        else if (r.top - ch - 24 > 0)     top = r.top - ch - 14; // above
        else                              top = Math.max(12, (vh - ch) / 2);
        left = Math.min(Math.max(12, r.left), vw - cw - 12);
      } else {
        spot.style.display = 'none';
        dim.style.display = 'block';
        top = Math.max(12, (vh - ch) / 2);
        left = Math.max(12, (vw - cw) / 2);
      }
      card.style.top = top + 'px';
      card.style.left = left + 'px';
    }

    function go(d) {
      var n = i + d;
      if (n < 0) return;
      if (n >= steps.length) return end();
      i = n; render();
    }

    card.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'next') go(1);
      else if (a === 'back') go(-1);
      else if (a === 'skip') end();
      else if (a === 'act') {
        var fn = steps[i].action.run;
        end();            // closes the tour and records it as seen
        if (fn) fn();
      }
    });

    function onKey(e) {
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    }

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('keydown', onKey);
    render();
  }

  // ── public API ─────────────────────────────────────────────
  async function start(page, opts) {
    if (!TOURS[page]) return;
    var ctx = await getCtx();
    run(TOURS[page](ctx), function () {
      sset(tourKey(page), '1');
      // The full tour already covered "join a team", so don't nudge again right after
      if (ctx.signedIn && !ctx.hasTeams) sset(nudgeKey(ctx.uid), '1');
    });
  }

  async function auto(page) {
    if (!TOURS[page]) return;
    // Arriving from a "join your team" link: let the Teams panel open instead of touring
    if (page === 'index' && location.hash === '#teams') { openTeamsWhenReady(); return; }

    if (!sget(tourKey(page))) { start(page); return; }

    // Tour already seen on this device: still catch signed-in coaches with no team (assistants!)
    var ctx = await getCtx();
    if (ctx.signedIn && !ctx.hasTeams && !sget(nudgeKey(ctx.uid))) {
      run([joinTeamStep(page)], function () { sset(nudgeKey(ctx.uid), '1'); });
    }
  }

  function openTeamsWhenReady() {
    var tries = 0, t = setInterval(function () {
      var b = document.getElementById('account-btn'), g = document.getElementById('coach-greeting');
      var ready = b && g && g.offsetParent;   // greeting (holding the closed menu) shows once signed in
      if (ready || ++tries > 25) {
        clearInterval(t);
        if (ready) b.click();
      }
    }, 200);
  }

  // "Replay the tour" pill at the bottom of the home page, under the closing note
  var COMPASS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"/><polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5"/></svg>';

  function addReplayButton() {
    if (document.getElementById('rt-replay') || !document.getElementById('hero-cta-row')) return; // home page only
    injectCSS();
    var row = document.createElement('div');
    row.className = 'rt-help-row';
    row.innerHTML = '<button id="rt-replay" class="rt-help" type="button">' + COMPASS +
                    '<span>Replay the tour</span></button>';
    row.firstChild.onclick = function () { start('index', { force: true }); };
    var note = document.querySelector('.final-note');
    if (note && note.parentNode) note.parentNode.insertBefore(row, note.nextSibling);
    else document.body.appendChild(row);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addReplayButton);
  else addReplayButton();

  window.RinkTour = { auto: auto, start: start };
})();
