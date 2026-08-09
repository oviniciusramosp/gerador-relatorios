/* Ícones do diagramador: Google Material Symbols + Tabler Icons.
 *
 * Material: fontes Outlined|Rounded|Sharp · eixos FILL/wght/GRAD/opsz
 * Tabler: webfont ti ti-* · outline only (sem filled no produto; espessura em px)
 *
 *   iconHtml(name, opts) / materialIconHtml (alias material)
 *   materialOptsFrom(b, mode) / applyMaterialOpts  — family em opts
 *   mapIconName / resolveIconName — equivalência Material ↔ Tabler
 *   openMaterialIconPop — picker com abas Material | Tabler
 */
import { MATERIAL_SYMBOLS as MS_ALL } from './material-symbols-names.js';
import { TABLER_ICONS, TABLER_ICONS_FILLED } from './tabler-icons-names.js';
import { MS_TO_TABLER, TABLER_TO_MS } from './icon-cross-map.js';

/** Lista COMPLETA de ligatures oficiais Material (~4k). */
export const MATERIAL_SYMBOLS = MS_ALL;
export { TABLER_ICONS, TABLER_ICONS_FILLED };
export { MS_TO_TABLER, TABLER_TO_MS };

export const MS_SHAPE = { outlined: 'outlined', rounded: 'rounded', sharp: 'sharp' };
export const MS_DEFAULTS = {
  family: 'material', // 'material' | 'tabler'
  fill: false,
  weight: 400,
  grade: 0,
  opsz: 24,
  shape: 'outlined',
  size: 28,
  color: '#4E39FF',
  stroke: 2, // Tabler: espessura do traço em px (1–3)
};
export function clampTablerStroke(n) {
  const v = Math.round(Number(n) * 2) / 2; // step 0.5
  if (!Number.isFinite(v)) return MS_DEFAULTS.stroke;
  return Math.max(1, Math.min(3, v));
}

// Set precomputado pra lookup O(1)
const MS_SET = new Set(MATERIAL_SYMBOLS);
const TABLER_SET = new Set(TABLER_ICONS);

export function isMaterialSymbol(name) {
  const n = normalizeMaterialName(name);
  return !!n && MS_SET.has(n);
}
export function isTablerIcon(name) {
  const n = normalizeTablerName(name);
  return !!n && TABLER_SET.has(n);
}

/** Material: snake_case. Tabler: kebab-case. */
export function normalizeMaterialName(name) {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  return n || '';
}
export function normalizeTablerName(name) {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
  return n || '';
}
export function familyOf(v) {
  return v === 'tabler' ? 'tabler' : 'material';
}

/**
 * Traduz o nome do ícone entre Material Symbols e Tabler Icons.
 * 1) nome já válido no destino
 * 2) mapa curated + exact (icon-cross-map.js)
 * 3) null se não houver equivalente
 *
 * @param {string} name
 * @param {'material'|'tabler'} fromFamily
 * @param {'material'|'tabler'} toFamily
 * @returns {string|null}
 */
export function mapIconName(name, fromFamily, toFamily) {
  const from = familyOf(fromFamily);
  const to = familyOf(toFamily);
  if (!name) return null;
  if (from === to) {
    if (to === 'tabler') {
      const t = normalizeTablerName(name);
      return TABLER_SET.has(t) ? t : null;
    }
    const m = normalizeMaterialName(name);
    return MS_SET.has(m) ? m : null;
  }
  if (to === 'tabler') {
    const ms = normalizeMaterialName(name);
    // nome já no formato tabler?
    const asTb = normalizeTablerName(name);
    if (TABLER_SET.has(asTb)) return asTb;
    if (MS_TO_TABLER[ms] && TABLER_SET.has(MS_TO_TABLER[ms])) return MS_TO_TABLER[ms];
    // strip variantes Material e tenta de novo
    const base = ms
      .replace(/_outline$/, '')
      .replace(/_outlined$/, '')
      .replace(/_border$/, '')
      .replace(/_filled$/, '');
    if (base !== ms && MS_TO_TABLER[base] && TABLER_SET.has(MS_TO_TABLER[base])) {
      return MS_TO_TABLER[base];
    }
    const kebab = base.replace(/_/g, '-');
    if (TABLER_SET.has(kebab)) return kebab;
    return null;
  }
  // → material
  let tb = normalizeTablerName(name);
  if (tb.endsWith('-filled')) tb = tb.slice(0, -7);
  if (MS_SET.has(normalizeMaterialName(name))) return normalizeMaterialName(name);
  if (TABLER_TO_MS[tb] && MS_SET.has(TABLER_TO_MS[tb])) return TABLER_TO_MS[tb];
  const snake = tb.replace(/-/g, '_');
  if (MS_SET.has(snake)) return snake;
  return null;
}

/**
 * Nome usable na família alvo: mantém se já existe, senão mapeia.
 * Se nada bater, tenta `fallback` (se válido); senão ''.
 * @param {string} name
 * @param {'material'|'tabler'} family
 * @param {string} [fallback='']
 */
export function resolveIconName(name, family, fallback = '') {
  if (name == null || name === '') return '';
  const fam = familyOf(family);
  if (fam === 'tabler') {
    const t = normalizeTablerName(name);
    if (TABLER_SET.has(t)) return t;
    const mapped = mapIconName(name, 'material', 'tabler');
    if (mapped) return mapped;
    if (fallback) {
      const fb = normalizeTablerName(fallback);
      if (TABLER_SET.has(fb)) return fb;
    }
    return '';
  }
  const m = normalizeMaterialName(name);
  if (MS_SET.has(m)) return m;
  const mapped = mapIconName(name, 'tabler', 'material');
  if (mapped) return mapped;
  if (fallback) {
    const fb = normalizeMaterialName(fallback);
    if (MS_SET.has(fb)) return fb;
  }
  return '';
}

export function clampMsWeight(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MS_DEFAULTS.weight;
  return Math.max(100, Math.min(700, v));
}
export function clampMsGrade(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MS_DEFAULTS.grade;
  return Math.max(-50, Math.min(200, v));
}
export function clampMsOpsz(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MS_DEFAULTS.opsz;
  return Math.max(20, Math.min(48, v));
}
export function clampMsSize(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MS_DEFAULTS.size;
  return Math.max(12, Math.min(120, v));
}
export function shapeOf(v) {
  if (v === 'rounded' || v === 'sharp') return v;
  return 'outlined';
}
export function materialClassForShape(shape) {
  if (shape === 'rounded') return 'material-symbols-rounded';
  if (shape === 'sharp') return 'material-symbols-sharp';
  return 'material-symbols-outlined';
}

/** Normaliza opts de render (family + eixos + size/color). */
export function normalizeMsOpts(raw = {}) {
  const size = raw.size != null ? clampMsSize(raw.size) : MS_DEFAULTS.size;
  const opsz = raw.opsz != null ? clampMsOpsz(raw.opsz) : clampMsOpsz(Math.min(48, Math.max(20, size)));
  return {
    family: familyOf(raw.family),
    fill: !!raw.fill,
    weight: raw.weight != null ? clampMsWeight(raw.weight) : MS_DEFAULTS.weight,
    grade: raw.grade != null ? clampMsGrade(raw.grade) : MS_DEFAULTS.grade,
    opsz,
    shape: shapeOf(raw.shape),
    size,
    color: raw.color || MS_DEFAULTS.color,
    stroke: raw.stroke != null ? clampTablerStroke(raw.stroke) : MS_DEFAULTS.stroke,
  };
}

/**
 * Lê estilo do bloco.
 * mode 'icon' → b.icon, b.family, b.fill… (bloco type=icon)
 * mode 'head' → b.icon + b.iconFamily, b.iconFill… (H1–H4)
 */
export function materialOptsFrom(b, mode = 'icon') {
  if (!b) return normalizeMsOpts({});
  if (mode === 'head') {
    return normalizeMsOpts({
      family: b.iconFamily,
      fill: b.iconFill,
      weight: b.iconWeight,
      grade: b.iconGrade,
      opsz: b.iconOpsz,
      shape: b.iconShape,
      color: b.iconColor,
      size: b.iconSize,
      stroke: b.iconStroke,
    });
  }
  return normalizeMsOpts({
    family: b.family,
    fill: b.fill,
    weight: b.weight,
    grade: b.grade,
    opsz: b.opsz,
    shape: b.shape,
    color: b.color,
    size: b.size,
    stroke: b.stroke,
  });
}

/**
 * Troca a família do ícone e tenta manter o mesmo glifo (mapa Material ↔ Tabler).
 * Se não houver equivalente, mantém o nome (pode não renderizar até o user escolher outro).
 * @returns {{ family: string, icon: string, mapped: boolean }}
 */
export function switchIconFamily(b, toFamily, mode = 'icon') {
  if (!b) return { family: familyOf(toFamily), icon: '', mapped: false };
  const cur = materialOptsFrom(b, mode);
  const nextFam = familyOf(toFamily);
  const curName = b.icon || '';
  let nextName = curName;
  let mapped = false;
  if (cur.family !== nextFam && curName) {
    const m = mapIconName(curName, cur.family, nextFam);
    if (m) {
      nextName = m;
      mapped = true;
    } else {
      // tenta resolver no destino mesmo sem from correto
      nextName = resolveIconName(curName, nextFam, curName);
      mapped = nextName !== curName;
    }
    b.icon = nextName;
  }
  applyMaterialOpts(b, { family: nextFam }, mode);
  return { family: nextFam, icon: b.icon || '', mapped };
}

/** Grava opts no bloco; defaults somem do JSON (aditivo). */
export function applyMaterialOpts(b, partial, mode = 'icon') {
  if (!b) return;
  const cur = materialOptsFrom(b, mode);
  const merged = { ...cur };
  for (const k of Object.keys(partial || {})) {
    if (partial[k] !== undefined) merged[k] = partial[k];
  }
  const next = normalizeMsOpts(merged);
  // Tabler: sem filled / shape / eixos Material — limpa campos inúteis
  if (next.family === 'tabler') {
    next.fill = false;
    next.shape = 'outlined';
  }
  // troca de família → remapeia b.icon (favorite→heart, etc.)
  if (partial && partial.family !== undefined && next.family !== cur.family && b.icon) {
    const m = mapIconName(b.icon, cur.family, next.family);
    if (m) b.icon = m;
  }
  const put = (field, val, defVal) => {
    if (val === defVal) delete b[field];
    else b[field] = val;
  };
  if (mode === 'head') {
    if (next.family === 'material') delete b.iconFamily;
    else b.iconFamily = next.family;
    if (next.family === 'tabler') {
      delete b.iconFill;
      delete b.iconWeight;
      delete b.iconGrade;
      delete b.iconOpsz;
      delete b.iconShape;
      put('iconStroke', next.stroke, MS_DEFAULTS.stroke);
    } else {
      if (next.fill) b.iconFill = true; else delete b.iconFill;
      put('iconWeight', next.weight, MS_DEFAULTS.weight);
      put('iconGrade', next.grade, MS_DEFAULTS.grade);
      put('iconOpsz', next.opsz, MS_DEFAULTS.opsz);
      put('iconStroke', next.stroke, MS_DEFAULTS.stroke);
      if (next.shape === 'outlined') delete b.iconShape;
      else b.iconShape = next.shape;
    }
    if (partial && partial.color !== undefined) {
      put('iconColor', next.color, MS_DEFAULTS.color);
    }
    if (partial && partial.size !== undefined) {
      put('iconSize', next.size, MS_DEFAULTS.size);
    }
  } else {
    if (next.family === 'material') delete b.family;
    else b.family = next.family;
    if (next.family === 'tabler') {
      delete b.fill;
      delete b.weight;
      delete b.grade;
      delete b.opsz;
      delete b.shape;
      put('stroke', next.stroke, MS_DEFAULTS.stroke);
    } else {
      if (next.fill) b.fill = true; else delete b.fill;
      put('weight', next.weight, MS_DEFAULTS.weight);
      put('grade', next.grade, MS_DEFAULTS.grade);
      put('opsz', next.opsz, MS_DEFAULTS.opsz);
      put('stroke', next.stroke, MS_DEFAULTS.stroke);
      if (next.shape === 'outlined') delete b.shape;
      else b.shape = next.shape;
    }
    if (partial && partial.color !== undefined) {
      put('color', next.color, MS_DEFAULTS.color);
    }
    if (partial && partial.size !== undefined) {
      put('size', next.size, MS_DEFAULTS.size);
    }
  }
  return next;
}

/**
 * HTML unificado Material | Tabler.
 * @param {string} name
 * @param {{ family?, size?, color?, fill?, weight?, grade?, opsz?, shape?, className? }} [opts]
 */
export function iconHtml(name, opts = {}) {
  if (name == null || name === '') return '';
  const o = normalizeMsOpts(opts);
  // resolve na família (mapeia se o bloco ficou com nome da outra lib)
  const resolved = resolveIconName(name, o.family, '');
  const key = resolved || name;
  if (o.family === 'tabler') return tablerIconHtml(key, { ...o, className: opts.className });
  return materialIconHtmlOnly(key, { ...o, className: opts.className });
}

/** @deprecated use iconHtml — mantido como alias Material. */
export function materialIconHtml(name, opts = {}) {
  return iconHtml(name, { ...opts, family: opts.family || 'material' });
}

function materialIconHtmlOnly(name, opts = {}) {
  const key = normalizeMaterialName(name);
  if (!key || !/^[a-z0-9_]+$/.test(key)) return '';
  const o = normalizeMsOpts({ ...opts, family: 'material' });
  const cls = [materialClassForShape(o.shape), opts.className].filter(Boolean).join(' ');
  const style = [
    `font-size:${o.size}px`,
    o.color ? `color:${o.color}` : '',
    `font-variation-settings:'FILL' ${o.fill ? 1 : 0},'wght' ${o.weight},'GRAD' ${o.grade},'opsz' ${o.opsz}`,
  ].filter(Boolean).join(';');
  return `<span class="${cls}" style="${style}" aria-hidden="true">${key}</span>`;
}

/**
 * Tabler Icons webfont: class "ti ti-{name}" (só outline — sem filled no produto).
 * Nome em kebab-case. Espessura (stroke) em px (1–3), design default 2px.
 */
export function tablerIconHtml(name, opts = {}) {
  let key = normalizeTablerName(name);
  if (!key || !/^[a-z0-9-]+$/.test(key)) return '';
  if (key.endsWith('-filled')) key = key.slice(0, -7); // força outline
  const size = opts.size != null ? clampMsSize(opts.size) : MS_DEFAULTS.size;
  const color = opts.color || '';
  const stroke = clampTablerStroke(opts.stroke != null ? opts.stroke : MS_DEFAULTS.stroke);
  // design Tabler = 2px; >2 engrossa com text-stroke; <2 afina via scale X leve no traço (font-weight)
  const thicken = Math.max(0, stroke - 2);
  const fw = stroke <= 1 ? 300 : stroke <= 1.5 ? 350 : stroke <= 2 ? 400 : stroke <= 2.5 ? 500 : 600;
  const style = [
    `font-size:${size}px`,
    color ? `color:${color}` : '',
    `font-weight:${fw}`,
    thicken > 0 ? `-webkit-text-stroke:${(thicken * 0.45).toFixed(2)}px ${color || 'currentColor'}` : '',
    'line-height:1',
    'display:inline-block',
  ].filter(Boolean).join(';');
  const extra = opts.className ? ` ${opts.className}` : '';
  return `<i class="ti ti-${key}${extra}" style="${style}" data-stroke="${stroke}" aria-hidden="true"></i>`;
}

/** Aplica estilo num glifo já montado (Material span ou Tabler i.ti). */
export function applyMaterialStyleToEl(el, opts = {}) {
  if (!el) return;
  const o = normalizeMsOpts(opts);
  if (o.family === 'tabler' || el.classList.contains('ti')) {
    const stroke = clampTablerStroke(o.stroke);
    const thicken = Math.max(0, stroke - 2);
    const fw = stroke <= 1 ? 300 : stroke <= 1.5 ? 350 : stroke <= 2 ? 400 : stroke <= 2.5 ? 500 : 600;
    el.style.fontSize = o.size + 'px';
    if (o.color) el.style.color = o.color;
    el.style.fontWeight = String(fw);
    el.style.fontVariationSettings = '';
    el.style.webkitTextStroke = thicken > 0
      ? `${(thicken * 0.45).toFixed(2)}px ${o.color || 'currentColor'}`
      : '';
    el.dataset.stroke = String(stroke);
    return;
  }
  el.classList.remove('material-symbols-outlined', 'material-symbols-rounded', 'material-symbols-sharp');
  el.classList.add(materialClassForShape(o.shape));
  el.style.fontSize = o.size + 'px';
  if (o.color) el.style.color = o.color;
  el.style.fontVariationSettings =
    `'FILL' ${o.fill ? 1 : 0},'wght' ${o.weight},'GRAD' ${o.grade},'opsz' ${o.opsz}`;
}

/** Pinta um botão (picker / barra) com o glifo. */
export function paintMaterialIconBtn(btn, name, opts = {}) {
  if (!btn) return;
  const o = normalizeMsOpts(opts);
  const key = o.family === 'tabler' ? normalizeTablerName(name) : normalizeMaterialName(name);
  if (!key) {
    btn.innerHTML = '<span class="badge">—</span>';
    return;
  }
  btn.innerHTML = iconHtml(key, {
    ...o,
    size: opts.size || 18,
    color: opts.color || 'currentColor',
  });
}

// ── picker ──────────────────────────────────────────────────────────────────
let matPop = null;
function closeMaterialIconPop() {
  if (!matPop) return;
  removeEventListener('pointerdown', outsideMat);
  matPop.remove();
  matPop = null;
}
function outsideMat(e) {
  if (matPop && !matPop.contains(e.target)) closeMaterialIconPop();
}

/**
 * Picker Material Symbols | Tabler Icons.
 * @param {HTMLElement} anchor
 * @param {(name: string, meta?: { family: string }) => void} pick  '' = sem ícone
 * @param {string} current
 * @param {{ allowNone?: boolean, family?: string, fill?, weight?, grade?, opsz?, shape? }} [opts]
 */
export function openMaterialIconPop(anchor, pick, current, opts = {}) {
  closeMaterialIconPop();
  const allowNone = opts.allowNone !== false;
  let family = familyOf(opts.family);
  const styleOpts = {
    fill: !!opts.fill,
    weight: opts.weight,
    grade: opts.grade,
    opsz: opts.opsz,
    shape: opts.shape,
  };

  matPop = document.createElement('div');
  matPop.className = 'icon-pop material-icon-pop';
  matPop.style.width = '18rem';

  // abas Material | Tabler
  const tabs = document.createElement('div');
  tabs.className = 'segment iconseg cols-2';
  tabs.style.marginBottom = '0.35rem';
  tabs.setAttribute('role', 'tablist');
  const mkTab = (val, label) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.textContent = label;
    t.setAttribute('aria-selected', String(family === val));
    t.addEventListener('mousedown', (e) => e.preventDefault());
    t.onclick = () => {
      if (family === val) return;
      family = val;
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
      busca.placeholder = family === 'tabler' ? 'buscar Tabler…' : 'buscar Material…';
      busca.value = '';
      pinta();
    };
    return t;
  };
  tabs.append(mkTab('material', 'Material'), mkTab('tabler', 'Tabler'));
  matPop.append(tabs);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'ip-search-wrap';
  const searchIco = document.createElement('span');
  searchIco.className = 'ip-search-ico material-symbols-outlined';
  searchIco.setAttribute('aria-hidden', 'true');
  searchIco.textContent = 'search';
  searchIco.style.fontSize = '16px';
  const busca = document.createElement('input');
  busca.type = 'search';
  busca.placeholder = family === 'tabler' ? 'buscar Tabler…' : 'buscar Material…';
  busca.setAttribute('aria-label', 'Buscar ícone');
  busca.className = 'ip-search';
  searchWrap.append(searchIco, busca);
  matPop.append(searchWrap);

  const grid = document.createElement('div');
  grid.className = 'ip-grid';
  const MAX_IDLE = 96;
  const MAX_SEARCH = 400;
  const norm = (v) => String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const meta = document.createElement('div');
  meta.className = 'ip-label';
  meta.style.margin = '0';
  meta.style.opacity = '.7';

  /** Nome do ícone atual na aba ativa (mapeia Material ↔ Tabler quando possível). */
  function curKey() {
    if (!current) return '';
    const from = familyOf(opts.family);
    // current pode estar na família do bloco ou já no formato da aba
    const mapped = mapIconName(current, from, family)
      || mapIconName(current, family === 'tabler' ? 'material' : 'tabler', family)
      || (family === 'tabler' ? normalizeTablerName(current) : normalizeMaterialName(current));
    return mapped || '';
  }

  function pinta() {
    const q = norm(busca.value.trim());
    const catalog = family === 'tabler' ? TABLER_ICONS : MATERIAL_SYMBOLS;
    const cur = curKey();
    grid.innerHTML = '';
    if (allowNone && !q) {
      const none = document.createElement('button');
      none.type = 'button';
      none.className = 'ip-none';
      none.title = 'Sem ícone';
      none.setAttribute('aria-label', 'Sem ícone');
      if (!cur) none.classList.add('on');
      none.onclick = () => { pick(''); closeMaterialIconPop(); };
      grid.append(none);
    }
    const lista = q
      ? catalog.filter((k) => norm(k).includes(q) || norm(k.replace(/-/g, '_')).includes(q.replace(/-/g, '_')))
      : catalog;
    // garante que o equivalente do ícone atual entre no grid (mesmo fora do cap idle)
    if (cur && !lista.includes(cur) && catalog.includes(cur)) {
      lista.unshift(cur);
    }
    const cap = q ? MAX_SEARCH : MAX_IDLE;
    const slice = [];
    const seen = new Set();
    for (const key of lista) {
      if (seen.has(key)) continue;
      seen.add(key);
      slice.push(key);
      if (slice.length >= cap) break;
    }
    for (const key of slice) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = key;
      b.innerHTML = iconHtml(key, { size: 22, family, ...styleOpts, color: 'currentColor' });
      if (key === cur) b.classList.add('on');
      b.onclick = () => {
        // grava o nome da família escolhida (já no formato certo)
        pick(key, { family, mappedFrom: current || '' });
        closeMaterialIconPop();
      };
      grid.append(b);
    }
    const lib = family === 'tabler' ? 'Tabler' : 'Material';
    const mappedHint = cur && current && cur !== normalizeTablerName(current)
      && cur !== normalizeMaterialName(current)
      ? ` · eq. de ${current}` : '';
    if (lista.length > cap) {
      meta.textContent = `${cap} de ${lista.length} (${lib}) — refine a busca${mappedHint}`;
    } else if (q) {
      meta.textContent = `${lista.length} · ${lib}${mappedHint}`;
    } else {
      meta.textContent = `${catalog.length} ${lib} · digite para buscar todos${mappedHint}`;
    }
  }
  busca.oninput = pinta;
  matPop.append(meta, grid);
  pinta();

  document.body.append(matPop);
  const r = anchor.getBoundingClientRect();
  const pw = matPop.offsetWidth, ph = matPop.offsetHeight;
  matPop.style.left = Math.max(6, Math.min(r.left, innerWidth - pw - 6)) + 'px';
  matPop.style.top = (r.bottom + 4 + ph > innerHeight ? Math.max(6, r.top - 4 - ph) : r.bottom + 4) + 'px';
  busca.focus();
  setTimeout(() => addEventListener('pointerdown', outsideMat), 0);
}

export { closeMaterialIconPop };
