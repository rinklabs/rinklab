// js/quickstart.js
// QuickStart stepper modal — opened from the hero banner button on index.html

const QS_STEPS = [
  {
    eyebrow: 'Step 1 — Account',
    heading: 'Create your account',
    desc:    'Click <strong>Create account</strong> below the hero, enter your email, a display name, and a password (min. 6 characters). Check your inbox to confirm, then sign back in.',
  },
  {
    eyebrow: 'Step 2 — Team',
    heading: 'Create or join a team',
    desc:    'After signing in, click <strong>Manage Teams and Account</strong>. Create a new team or enter a teammate\'s 6-character invite code to join theirs. Share your code so others can join you.',
  },
  {
    eyebrow: 'Step 3 — Drills',
    heading: 'Design your first drill',
    desc:    'From the home page, click <strong>Draw Drills</strong> to open the Canvas. Place players, draw arrows and patterns, add tags and a description — then hit <strong>Save</strong>.',
  },
  {
    eyebrow: 'Step 4 — Practice',
    heading: 'Build a practice plan',
    desc:    'Click <strong>Create Practice Plans</strong> from the home page. Drag drills from the left-hand library into your plan, set durations, pick a target time, then <strong>Save</strong> to share with your team.',
  },
];

let _qsCur = 0;

function openQuickstart() {
  _qsCur = 0;
  _qsRender();
  document.getElementById('qs-modal').style.display = 'flex';
}

function closeQuickstart() {
  document.getElementById('qs-modal').style.display = 'none';
}

function _qsNav(dir) {
  const last = QS_STEPS.length - 1;
  if (dir > 0 && _qsCur === last) { closeQuickstart(); return; }
  _qsCur = Math.max(0, Math.min(last, _qsCur + dir));
  _qsRender();
}

function _qsRender() {
  const s     = QS_STEPS[_qsCur];
  const total = QS_STEPS.length;

  document.getElementById('qs-eyebrow').textContent = s.eyebrow;
  document.getElementById('qs-heading').textContent = s.heading;
  document.getElementById('qs-desc').innerHTML      = s.desc;
  document.getElementById('qs-counter').textContent = `Step ${_qsCur + 1} of ${total}`;

  const backBtn = document.getElementById('qs-back');
  const nextBtn = document.getElementById('qs-next');
  backBtn.style.display  = _qsCur === 0 ? 'none' : '';
  nextBtn.textContent    = _qsCur === total - 1 ? 'Done ✓' : 'Next →';

  // Dots
  for (let i = 0; i < total; i++) {
    const dot = document.getElementById('qs-dot-' + i);
    dot.className = 'qs-dot ' +
      (i < _qsCur ? 'qs-done' : i === _qsCur ? 'qs-active' : 'qs-pending');
  }

  // Connector lines
  for (let i = 0; i < total - 1; i++) {
    const line = document.getElementById('qs-line-' + i);
    line.className = 'qs-line' + (i < _qsCur ? ' qs-done' : '');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('qs-close')
    .addEventListener('click', closeQuickstart);

  document.getElementById('qs-back')
    .addEventListener('click', () => _qsNav(-1));

  document.getElementById('qs-next')
    .addEventListener('click', () => _qsNav(1));

  // Close on backdrop click
  document.getElementById('qs-modal')
    .addEventListener('click', e => {
      if (e.target === document.getElementById('qs-modal')) closeQuickstart();
    });

  // Keyboard: Escape closes, arrow keys navigate
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('qs-modal');
    if (modal.style.display !== 'flex') return;
    if (e.key === 'Escape')      closeQuickstart();
    if (e.key === 'ArrowRight')  _qsNav(1);
    if (e.key === 'ArrowLeft')   _qsNav(-1);
  });
});
