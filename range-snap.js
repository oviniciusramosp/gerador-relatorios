/* Snap points em input[type=range]:
 * - data-snaps="0,25,50,75,100"  → marcas DENTRO da trilha + ímã nesses valores
 * - no máx. 6 marcas (lista maior é amostrada, extremos preservados)
 * - o usuário ainda pode parar em valores livres (ímã só perto do ponto)
 * - não altera o valor inicial; só intervém em input do usuário
 */
const ATTR = 'data-snaps';
const DONE = 'data-snap-ready';
const MAX_SNAPS = 6;
// fração do span (max−min) em que o ímã puxa — sem piso absoluto (ranges 0–0.8 quebram)
const THRESH_FRAC = 0.035;

function parseSnaps(raw) {
  if (!raw) return [];
  return String(raw).split(',')
    .map((s) => +s.trim())
    .filter((n) => Number.isFinite(n));
}

/** Ordena, filtra no range e limita a MAX_SNAPS (extremos + amostra uniforme). */
function resolveSnaps(raw, min, max) {
  const sorted = [...new Set(parseSnaps(raw))]
    .filter((s) => s >= min && s <= max)
    .sort((a, b) => a - b);
  if (sorted.length <= MAX_SNAPS) return sorted;
  const out = [];
  for (let i = 0; i < MAX_SNAPS; i++) {
    const idx = Math.round(i * (sorted.length - 1) / (MAX_SNAPS - 1));
    out.push(sorted[idx]);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function nearestSnap(v, snaps) {
  let best = null, bestD = Infinity;
  for (const s of snaps) {
    const d = Math.abs(v - s);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best == null ? null : { value: best, dist: bestD };
}

function threshold(min, max, snaps) {
  const span = Math.max(1e-9, max - min);
  let gap = span;
  for (let i = 1; i < snaps.length; i++) gap = Math.min(gap, snaps[i] - snaps[i - 1]);
  return Math.min(span * THRESH_FRAC, Math.max(gap * 0.4, span * 0.01));
}

function tickLeft(snap, min, max) {
  if (max === min) return 0;
  return ((snap - min) / (max - min)) * 100;
}

function readMin(input) {
  return input.min === '' ? 0 : +input.min;
}
function readMax(input) {
  return input.max === '' ? 100 : +input.max;
}

/** Decora um <input type=range data-snaps="…"> com ticks e ímã. Idempotente. */
export function enhanceRange(input) {
  if (!input || input.type !== 'range' || input.hasAttribute(DONE)) return input;
  const raw = input.getAttribute(ATTR);
  if (!parseSnaps(raw).length) return input;

  const min = () => readMin(input);
  const max = () => readMax(input);
  let snaps = resolveSnaps(raw, min(), max());
  if (!snaps.length) return input;

  // wrapper: ticks sobrepostos na trilha (dentro do slider), pointer-events:none
  const wrap = document.createElement('div');
  wrap.className = 'range-snap';
  const ticks = document.createElement('div');
  ticks.className = 'range-snap-ticks';
  ticks.setAttribute('aria-hidden', 'true');

  const paintTicks = () => {
    const a = min(), b = max();
    snaps = resolveSnaps(input.getAttribute(ATTR), a, b);
    ticks.replaceChildren();
    for (const s of snaps) {
      const t = document.createElement('span');
      t.style.left = tickLeft(s, a, b) + '%';
      ticks.append(t);
    }
  };
  paintTicks();

  input.parentNode.insertBefore(wrap, input);
  wrap.append(input, ticks);
  input.setAttribute(DONE, '');

  // capture: ímã antes dos handlers do app (que leem e.target.value no bubble)
  input.addEventListener('input', () => {
    const a = min(), b = max();
    const hit = nearestSnap(+input.value, snaps);
    if (hit && hit.dist <= threshold(a, b, snaps) && String(hit.value) !== input.value) {
      input.value = String(hit.value);
    }
  }, true);

  new MutationObserver(paintTicks)
    .observe(input, { attributes: true, attributeFilter: ['min', 'max', ATTR] });

  return input;
}

/** Aplica em todos os ranges com data-snaps dentro de `root` (default: document). */
export function enhanceAll(root = document) {
  root.querySelectorAll(`input[type="range"][${ATTR}]`).forEach(enhanceRange);
}
