// ─────────────────────────────────────────────────────────────
//  toast.js  —  lightweight notification helper
// ─────────────────────────────────────────────────────────────

function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = isError ? 'show err' : 'show';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, 2600);
}
