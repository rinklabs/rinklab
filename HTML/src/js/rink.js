// ─────────────────────────────────────────────────────────────
//  rink.js  —  SVG background layer + half / full toggle
// ─────────────────────────────────────────────────────────────

const RINK_W = 748.498;
const RINK_H = 347.5;
const HALF_X = RINK_W / 2;

let showHalf = true;

async function initRink() {
  const container = document.getElementById('rink-layer');

  try {
    // 1. Fetch the file from your assets folder
    const response = await fetch('assets/rink.svg');
    const svgText = await response.text();

    // 2. Inject it into the div
    container.innerHTML = svgText;

    // 3. Now that it exists in the DOM, set up the toggle logic
    const rinkSvg = container.querySelector('svg');
    setupRinkLogic(rinkSvg);

  } catch (err) {
    console.error("Failed to load rink.svg:", err);
  }
}

// Move your existing clip-path/group logic into this helper function
function setupRinkLogic(rinkSvg) {
  // Ensure a <defs> block exists
  const defs = rinkSvg.querySelector('defs') ?? (() => {
    const d = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    rinkSvg.prepend(d);
    return d;
  })();

  // Add clip path for half-rink view
  const clipEl   = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  clipEl.setAttribute('id', 'halfClip');
  clipRect.setAttribute('x', '0');
  clipRect.setAttribute('y', '0');
  clipRect.setAttribute('width',  HALF_X);
  clipRect.setAttribute('height', RINK_H);
  clipEl.appendChild(clipRect);
  defs.appendChild(clipEl);

  // Wrap all non-defs children in a group so we can clip them as a unit
  const wrapGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrapGroup.setAttribute('id', 'rink-content');
  [...rinkSvg.children].forEach(child => {
    if (child.tagName !== 'defs' && child.id !== 'namedview36') {
      wrapGroup.appendChild(child);
    }
  });
  rinkSvg.appendChild(wrapGroup);

  applyRinkView();

  document.getElementById('btn-toggle').addEventListener('click', () => {
    showHalf = !showHalf;
    updateToggleButton();
    applyRinkView();
  });
}

function applyRinkView() {
  const rinkSvg   = document.querySelector('#rink-layer svg');
  const wrapGroup = document.getElementById('rink-content');

  if (showHalf) {
    wrapGroup.setAttribute('clip-path', 'url(#halfClip)');
    rinkSvg.setAttribute('viewBox', `0 0 ${HALF_X} ${RINK_H}`);
    rinkSvg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  } else {
    wrapGroup.removeAttribute('clip-path');
    rinkSvg.setAttribute('viewBox', `0 0 ${RINK_W} ${RINK_H}`);
    rinkSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
}

function updateToggleButton() {
  const btn = document.getElementById('btn-toggle');
  if (showHalf) {
    btn.textContent = '◑ Half Rink';
    btn.classList.add('half');
    btn.classList.remove('full');
  } else {
    btn.textContent = '⬡ Full Rink';
    btn.classList.add('full');
    btn.classList.remove('half');
  }
}

function getRinkView()    { return showHalf ? 'half' : 'full'; }
function setRinkView(val) { showHalf = (val === 'half'); updateToggleButton(); applyRinkView(); }
