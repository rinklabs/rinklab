// ─────────────────────────────────────────────────────────────
//  assets.js  —  SVG sprite loader for pylon and net
//
//  SVG files live in assets/ and use two placeholder tokens:
//    STROKE_COLOR  →  element's strokeColor
//    FILL_COLOR    →  element's fillColor (or a sensible default)
//
//  getSpriteImage(type, strokeColor, fillColor)
//    Returns a cached HTMLImageElement, or null on first call
//    while the image is loading (render() is called again on load).
// ─────────────────────────────────────────────────────────────

const Sprites = {
  _raw:   {},   // type → raw SVG text
  _cache: {},   // `${type}|${stroke}|${fill}` → HTMLImageElement | 'loading'
};

/** Called once at startup — fetches all sprite SVGs. */
async function initAssets() {
  const files = ['pylon', 'net'];
  await Promise.all(files.map(async name => {
    try {
      const res  = await fetch(`assets/${name}.svg`);
      Sprites._raw[name] = await res.text();
    } catch (e) {
      console.warn(`assets.js: could not load assets/${name}.svg`, e);
    }
  }));
}

/**
 * Returns a ready HTMLImageElement for the given sprite + colors,
 * or null if still loading (re-renders automatically on load).
 *
 * @param {string} type        - 'pylon' | 'net'
 * @param {string} strokeColor - CSS color string
 * @param {string} fillColor   - CSS color string (may be null)
 * @returns {HTMLImageElement|null}
 */
function getSpriteImage(type, strokeColor, fillColor) {
  const stroke = strokeColor ?? '#000000';
  const fill   = fillColor   ?? _defaultFill(type);
  const key    = `${type}|${stroke}|${fill}`;

  const cached = Sprites._cache[key];
  if (cached === 'loading') return null;
  if (cached)               return cached;

  // Not yet in cache — kick off async load
  const raw = Sprites._raw[type];
  if (!raw) return null;

  Sprites._cache[key] = 'loading';

  const svg  = raw
    .replaceAll('STROKE_COLOR', stroke)
    .replaceAll('FILL_COLOR',   fill);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);

  const img  = new Image();
  img.onload = () => {
    Sprites._cache[key] = img;
    URL.revokeObjectURL(url);
    render(); // repaint now that the image is ready
  };
  img.onerror = () => {
    delete Sprites._cache[key]; // allow retry
    URL.revokeObjectURL(url);
  };
  img.src = url;
  return null;
}

function _defaultFill(type) {
  if (type === 'pylon') return '#ff8c00'; // orange
  if (type === 'net')   return '#4488cc'; // ice-blue tint
  return '#888888';
}
