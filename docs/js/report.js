// ─────────────────────────────────────────────────────────────
//  report.js  —  Report Drill feature for Hockey Drills Lab
//  Drop in docs/js/  and add <script src="js/report.js"></script>
//  Requires: supabaseClient (global), SUPABASE_URL, SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────

const VIOLATIONS = [
  {
    id: 'unsafe',
    label: 'Unsafe or dangerous',
    desc: 'Could cause physical harm to youth players.',
  },
  {
    id: 'inappropriate',
    label: 'Inappropriate content',
    desc: 'Offensive, discriminatory, or adult content.',
  },
  {
    id: 'misleading',
    label: 'Misleading or inaccurate',
    desc: 'Drill is labelled or described dishonestly.',
  },
  {
    id: 'spam',
    label: 'Spam or off-topic',
    desc: 'Not a legitimate hockey drill.',
  },
  {
    id: 'bullying',
    label: 'Bullying or targeting',
    desc: 'Designed to embarrass or single out a player.',
  },
  {
    id: 'copyright',
    label: 'Copyright violation',
    desc: 'Reproduces protected material without permission.',
  },
];

const VALUES_HTML = `
  <strong>Hockey Drills Lab</strong> is built on the values of
  <strong>safety, respect, and sportsmanship</strong>.
  Drills shared here must be appropriate for youth athletes,
  accurately described, and created in good faith.
  We do not tolerate harmful, misleading, or abusive content.
`;

// ── Styles (injected once) ────────────────────────────────────
(function injectStyles() {
  if (document.getElementById('report-styles')) return;
  const s = document.createElement('style');
  s.id = 'report-styles';
  s.textContent = `
    #report-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,.55);
      display: flex; align-items: center; justify-content: center;
    }
    #report-modal {
      background: var(--surface, #1e1e2e);
      color: var(--text, #cdd6f4);
      border: 1px solid var(--border, #313244);
      border-radius: 10px;
      padding: 24px;
      width: 90%;
      max-width: 460px;
      max-height: 88vh;
      overflow-y: auto;
      box-shadow: 0 12px 40px rgba(0,0,0,.5);
    }
    #report-modal h2 {
      margin: 0 0 4px;
      font-size: 1rem;
      color: #f38ba8;
    }
    #report-modal .report-drill-name {
      font-size: .82rem;
      color: var(--muted, #6c7086);
      margin: 0 0 14px;
    }
    #report-modal .report-values {
      background: rgba(59,91,219,.12);
      border-left: 3px solid #3b5bdb;
      border-radius: 4px;
      padding: 10px 13px;
      font-size: .80rem;
      line-height: 1.5;
      color: var(--text, #cdd6f4);
      margin-bottom: 16px;
    }
    #report-modal .report-section-label {
      font-size: .82rem;
      font-weight: 600;
      margin: 0 0 8px;
      color: var(--muted, #6c7086);
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    #report-violation-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
    }
    .report-violation-item {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      background: var(--bg, #181825);
      border: 1px solid var(--border, #313244);
      border-radius: 6px;
      padding: 8px 10px;
      cursor: pointer;
      transition: border-color .15s;
    }
    .report-violation-item:hover {
      border-color: #3b5bdb;
    }
    .report-violation-item input[type=checkbox] {
      margin-top: 3px;
      accent-color: #3b5bdb;
      flex-shrink: 0;
    }
    .report-violation-item strong {
      display: block;
      font-size: .83rem;
    }
    .report-violation-item span {
      font-size: .77rem;
      color: var(--muted, #6c7086);
    }
    #report-notes {
      width: 100%;
      box-sizing: border-box;
      background: var(--bg, #181825);
      border: 1px solid var(--border, #313244);
      color: var(--text, #cdd6f4);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: .82rem;
      resize: vertical;
      min-height: 60px;
      margin-bottom: 16px;
      font-family: inherit;
    }
    #report-notes::placeholder { color: var(--muted, #6c7086); }
    #report-modal .report-footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    #report-cancel-btn {
      padding: 8px 18px;
      border: 1px solid var(--border, #313244);
      border-radius: 6px;
      background: transparent;
      color: var(--text, #cdd6f4);
      cursor: pointer;
      font-size: .84rem;
    }
    #report-submit-btn {
      padding: 8px 18px;
      border: none;
      border-radius: 6px;
      background: #c0392b;
      color: #fff;
      cursor: pointer;
      font-size: .84rem;
      font-weight: 700;
    }
    #report-submit-btn:disabled {
      opacity: .6;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(s);
})();

// ── Main public function ──────────────────────────────────────
window.openReportModal = async function openReportModal(drillId, drillName) {
  // Must be signed in
  const { data: { user } } = await _supabase.auth.getUser();
  if (!user) { showToast('Sign in to report a drill.'); return; }

  // Remove any stale modal
  document.getElementById('report-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'report-overlay';

  overlay.innerHTML = `
    <div id="report-modal" role="dialog" aria-modal="true" aria-label="Report Drill">
      <h2>⚠ Report Drill</h2>
      <p class="report-drill-name">"${drillName}"</p>

      <div class="report-values">${VALUES_HTML}</div>

      <p class="report-section-label">Select all violations that apply</p>
      <div id="report-violation-list">
        ${VIOLATIONS.map(v => `
          <label class="report-violation-item">
            <input type="checkbox" value="${v.id}">
            <div>
              <strong>${v.label}</strong>
              <span>${v.desc}</span>
            </div>
          </label>
        `).join('')}
      </div>

      <textarea id="report-notes" placeholder="Optional: additional context…"></textarea>

      <div class="report-footer">
        <button id="report-cancel-btn">Cancel</button>
        <button id="report-submit-btn">Submit Report</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ── Close handlers ─────────────────────────────────────────
  const close = () => overlay.remove();
  document.getElementById('report-cancel-btn').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // ── Submit ─────────────────────────────────────────────────
  document.getElementById('report-submit-btn').onclick = async () => {
    const checked = [...overlay.querySelectorAll('#report-violation-list input:checked')]
      .map(el => VIOLATIONS.find(v => v.id === el.value)?.label)
      .filter(Boolean);

    if (checked.length === 0) {
      showToast('Please select at least one violation.');
      return;
    }

    const notes  = document.getElementById('report-notes').value.trim();
    const subBtn = document.getElementById('report-submit-btn');
    subBtn.disabled    = true;
    subBtn.textContent = 'Submitting…';

    try {
      // 1 — Save to drill_reports table
      const { error: dbErr } = await _supabase
        .from('drill_reports')
        .insert({
          drill_id:    drillId,
          reporter_id: user.id,
          violations:  checked,
          notes:       notes || null,
        });

      if (dbErr) throw dbErr;

      // 2 — Trigger email via Edge Function
      //     (safe to omit if you haven't set up the Edge Function yet —
      //      the DB record is the source of truth)
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/report-drill`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            drillId,
            drillName,
            reporterEmail: user.email,
            violations:    checked,
            notes,
          }),
        });
      } catch (emailErr) {
        // Don't block UX if email fails — report is already saved
        console.warn('Report email failed (non-fatal):', emailErr);
      }

      close();
      showToast('Report submitted — thank you.');

    } catch (err) {
      console.error('Report submit error:', err);
      showToast('Something went wrong. Please try again.');
      subBtn.disabled    = false;
      subBtn.textContent = 'Submit Report';
    }
  };
};
