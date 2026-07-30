/* Criador de Stories — artboard 360×640 (trabalho, ≈ telefone), export 1080×1920.
 *
 * Páginas discretas, lista horizontal + prev/next, 2 colunas 50% gap 0,
 * margens Stories/Reels + preview de UI, blocos Texto e Imagem,
 * export PNG / JPG / ZIP (.pdgm) em resolução Instagram (× EXPORT_SCALE).
 *
 * Núcleo puro: stories-core.js. Serialização: doc-format.js (genérica).
 */

import { enhanceAll } from './range-snap.js';
import { deserializeDoc, serializeDocZip, loadDocZip } from './doc-format.js';
import { projectBaseName, projectFormatFromName } from './project-link.js';
import { initFeedback } from './feedback.js';
import { initAppNav } from './app-nav.js';
import { openSwatchPop, parseColor } from './swatch.js';
import {
  PAGE_W, PAGE_H, EXPORT_W, EXPORT_H, EXPORT_SCALE,
  DEFAULT_BG, DEFAULT_TEXT, uid,
  seedDoc, normalizeStoriesDoc, isStoriesDoc,
  mkBlock, mkPage, clampPageIndex, clampMarginMode,
  dangerZones, safeOf, safeRect,
} from './stories-core.js';

initAppNav();
initFeedback();

// ─────────────────────────── state ──────────────────────────────────────────
const LS_KEY = 'pdgm-stories-cfg-v1';
const IDB_NAME = 'pdgm-stories';

const state = {
  doc: seedDoc(),
  pageIndex: 0,
  activeId: null,
  sel: null,       // image block id
  zoom: 'fit',     // 'fit' | number 0.1–2
  editing: true,
};

// ─────────────────────────── IDB mínimo ─────────────────────────────────────
const idb = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get(key) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      t.onsuccess = () => res(t.result);
      t.onerror = () => rej(t.error);
    });
  },
  async set(key, val) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite').objectStore('kv').put(val, key);
      t.onsuccess = () => res();
      t.onerror = () => rej(t.error);
    });
  },
  async del(key) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite').objectStore('kv').delete(key);
      t.onsuccess = () => res();
      t.onerror = () => rej(t.error);
    });
  },
};

// ─────────────────────────── helpers ────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const pagesEl = $('pages');
const pagesWrap = $('pages-wrap');
const stage = $('stage');
const stripScroll = $('stripScroll');

function toast(msg, err = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('err', !!err);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const slug = (s) => (s || 'story').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'story';

function currentPage() {
  const pages = state.doc.pages;
  state.pageIndex = clampPageIndex(state.pageIndex, pages.length);
  return pages[state.pageIndex];
}

function blockOf(id) {
  for (const p of state.doc.pages) {
    const b = p.blocks.find((x) => x.id === id);
    if (b) return b;
  }
  return null;
}

function pageOfBlock(id) {
  return state.doc.pages.find((p) => p.blocks.some((b) => b.id === id)) || null;
}

// ─────────────────────────── persistência ───────────────────────────────────
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    idb.set('doc', state.doc).catch(() => {});
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        title: state.doc.title,
        marginMode: state.doc.marginMode,
        uiPreview: state.doc.uiPreview,
        showSafe: state.doc.showSafe,
        pageIndex: state.pageIndex,
      }));
    } catch { /* quota */ }
  }, 250);
}

// ─────────────────────────── histórico ──────────────────────────────────────
const hist = { past: [], future: [], last: null };
const snap = () => JSON.stringify(state.doc);
let commitT;
function scheduleCommit() {
  clearTimeout(commitT);
  commitT = setTimeout(commit, 400);
}
function commit() {
  const s = snap();
  if (hist.last === null) { hist.last = s; return; }
  if (s === hist.last) return;
  hist.past.push(hist.last);
  if (hist.past.length > 40) hist.past.shift();
  hist.last = s;
  hist.future.length = 0;
  updateHistBtns();
}
function restoreSnap(s) {
  state.doc = normalizeStoriesDoc(JSON.parse(s));
  state.pageIndex = clampPageIndex(state.pageIndex, state.doc.pages.length);
  state.activeId = null;
  state.sel = null;
  syncSidebarFromDoc();
  render();
}
function undo() {
  clearTimeout(commitT); commit();
  if (!hist.past.length) return;
  hist.future.push(hist.last);
  hist.last = hist.past.pop();
  restoreSnap(hist.last);
  updateHistBtns();
}
function redo() {
  if (!hist.future.length) return;
  hist.past.push(hist.last);
  hist.last = hist.future.pop();
  restoreSnap(hist.last);
  updateHistBtns();
}
function updateHistBtns() {
  const u = $('btnUndo'), r = $('btnRedo');
  if (u) u.disabled = !hist.past.length;
  if (r) r.disabled = !hist.future.length;
}

// ─────────────────────────── zoom ───────────────────────────────────────────
const ZOOM_MIN = 0.1, ZOOM_MAX = 2;
function fitZoomScale() {
  // caber no viewport entre as setas (story vertical, slide em foco no centro)
  const pad = 16;
  const availH = Math.max(120, stage.clientHeight - pad);
  const availW = Math.max(120, stage.clientWidth - pad);
  return Math.min(1, availH / PAGE_H, availW / PAGE_W);
}
function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}
function syncZoomUI(scale) {
  const isFit = state.zoom === 'fit';
  const z = scale ?? (isFit ? fitZoomScale() : clampZoom(+state.zoom));
  const pct = Math.round(z * 100);
  $('zoomFit')?.setAttribute('aria-pressed', String(isFit));
  if ($('zoomPctLabel')) $('zoomPctLabel').textContent = pct + '%';
  if ($('zoomPopVal')) $('zoomPopVal').textContent = pct + '%';
  const zr = $('zoomRange');
  if (zr && document.activeElement !== zr) zr.value = String(pct);
}
function applyZoom() {
  let z = state.zoom === 'fit' ? fitZoomScale() : clampZoom(+state.zoom);
  // scale no #pages; o wrap assume o tamanho visual (z×PAGE) pra centralizar no stage
  pagesEl.style.transform = `scale(${z})`;
  pagesEl.style.width = PAGE_W + 'px';
  pagesEl.style.height = PAGE_H + 'px';
  if (pagesWrap) {
    pagesWrap.style.width = Math.round(PAGE_W * z) + 'px';
    pagesWrap.style.height = Math.round(PAGE_H * z) + 'px';
  }
  syncZoomUI(z);
}

// ─────────────────────────── UI Instagram ───────────────────────────────────
function igIcon(name) {
  const icons = {
    close: '<svg class="ig-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    heart: '<svg class="ig-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    send: '<svg class="ig-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    heartF: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-5-8-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-8 11-8 11z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 18 0z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    music: '<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M6 12.5a2 2 0 1 1-2-2V3.5l8-1.5v8a2 2 0 1 1-2-2V5.2L6 5.9v6.6z"/></svg>',
  };
  return icons[name] || '';
}

function buildUiOverlay(pageIndex, total) {
  const mode = clampMarginMode(state.doc.marginMode);
  const layer = document.createElement('div');
  layer.className = 'ui-layer' + (mode === 'reels' ? ' reels' : '');
  layer.dataset.exportHide = '1';

  if (mode === 'reels') {
    layer.innerHTML = `
      <div class="ig-top">
        <div class="ig-reels-bar">
          <span class="ig-reels-title">Reels</span>
          <span class="ig-reels-search" aria-hidden="true">⌕</span>
        </div>
      </div>
      <div class="ig-rail">
        <div class="rail-av"></div>
        <div class="rail-btn">${igIcon('heartF')}<span>24.1 mil</span></div>
        <div class="rail-btn">${igIcon('chat')}<span>312</span></div>
        <div class="rail-btn">${igIcon('share')}<span>Enviar</span></div>
        <div class="rail-btn">${igIcon('more')}</div>
      </div>
      <div class="ig-cap">
        <div class="cap-user">@paradigma</div>
        <div class="cap-txt">Legenda de exemplo do Reel · toque para expandir</div>
        <div class="cap-audio">${igIcon('music')} Áudio original · paradigma</div>
      </div>`;
    return layer;
  }

  // Stories — tamanhos em CSS (canvas de trabalho 360×640)
  const segs = Array.from({ length: Math.max(1, total) }, (_, i) => {
    const cls = i < pageIndex ? 'done' : i === pageIndex ? 'on' : '';
    return `<i class="${cls}"></i>`;
  }).join('');
  layer.innerHTML = `
    <div class="ig-top">
      <div class="ig-progress">${segs}</div>
      <div class="ig-user">
        <div class="ig-avatar"><span></span></div>
        <span class="ig-name">paradigma</span>
        <span class="ig-time">2 h</span>
        ${igIcon('close')}
      </div>
    </div>
    <div class="ig-bottom">
      <div class="ig-reply">Enviar mensagem</div>
      ${igIcon('heart')}
      ${igIcon('send')}
    </div>`;
  return layer;
}

function buildSafeOverlay() {
  // Anel exato: box-shadow cobre fora do retângulo seguro (evita faixas
  // desencontradas / bottom “encolhido” visualmente).
  const s = safeOf(state.doc.marginMode);
  const wrap = document.createElement('div');
  wrap.className = 'safe-layer';
  wrap.dataset.exportHide = '1';
  wrap.dataset.safeTop = String(s.top);
  wrap.dataset.safeBottom = String(s.bottom);
  wrap.dataset.safeLeft = String(s.left);
  wrap.dataset.safeRight = String(s.right);

  const hole = document.createElement('div');
  hole.className = 'safe-hole';
  hole.style.left = s.left + 'px';
  hole.style.top = s.top + 'px';
  hole.style.width = (PAGE_W - s.left - s.right) + 'px';
  hole.style.height = (PAGE_H - s.top - s.bottom) + 'px';
  wrap.appendChild(hole);
  return wrap;
}

// ─────────────────────────── blocos DOM ─────────────────────────────────────
function buildTextEl(b) {
  const el = document.createElement('div');
  el.className = 'blk text';
  el.dataset.id = b.id;
  el.dataset.type = 'text';
  el.style.top = (b.y | 0) + 'px';
  el.style.fontSize = (b.size || 48) + 'px';
  el.style.fontWeight = String(b.weight || 600);
  el.style.textAlign = b.align || 'left';
  el.style.color = b.color || DEFAULT_TEXT;
  el.style.lineHeight = '1.15';
  el.style.letterSpacing = '-0.02em';
  if (state.editing) {
    el.contentEditable = 'true';
    el.spellcheck = true;
  }
  el.innerHTML = b.html || '';
  return el;
}

// ── imagem: helpers iguais ao diagramador (escala %, raio, altura por aspect ratio) ──
const IMG_SCALE_STEP = 0.1;
const PLUS_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>';
const MINUS_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 8h10"/></svg>';
const TRASH_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10M6.5 4V3h3v1M5 4l.6 9h4.8L11 4"/></svg>';
const REPLACE_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a5 5 0 0 1 8.2-3.7M13 2.5v3h-3M13 8a5 5 0 0 1-8.2 3.7M3 13.5v-3h3"/></svg>';
const COL_ICON = {
  left: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="4" width="4.5" height="8" fill="currentColor"/></svg>',
  full: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="4" width="10" height="8" fill="currentColor"/></svg>',
  right: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="8.5" y="4" width="4.5" height="8" fill="currentColor"/></svg>',
};
const ALIGN_ICON = {
  left: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/><rect x="2" y="7" width="7" height="2" rx="1" fill="currentColor"/><rect x="2" y="11" width="9" height="2" rx="1" fill="currentColor"/></svg>',
  center: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/><rect x="4.5" y="7" width="7" height="2" rx="1" fill="currentColor"/><rect x="3.5" y="11" width="9" height="2" rx="1" fill="currentColor"/></svg>',
};

function imgScalePct(b) {
  const s = b.scale == null ? 100 : +b.scale;
  if (!Number.isFinite(s)) return 100;
  const q = Math.round(Math.min(100, Math.max(10, s)) / IMG_SCALE_STEP) * IMG_SCALE_STEP;
  return +q.toFixed(1);
}
function fmtImgScalePct(n) {
  return String(imgScalePct({ scale: n }));
}
function imgRadiusOf(b) {
  const n = Math.round(+b.radius);
  return Number.isFinite(n) ? Math.max(0, n) : 4;
}
function imgAlignOf(b) {
  return b.imgAlign === 'center' || b.align === 'center' ? 'center' : 'left';
}
function colWidthOf(b) {
  const r = safeRect(state.doc.marginMode);
  return (b.col === 'left' || b.col === 'right') ? r.w / 2 : r.w;
}
/** altura natural da imagem escalada (como imgHeight no diagramador). */
function imgHeightOf(b) {
  const w = colWidthOf(b) * (imgScalePct(b) / 100);
  if (b.nw && b.nh) return w * (b.nh / b.nw);
  return Math.max(40, b.h | 0) || w * 0.6;
}

function widthSeg(cur, opts, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'segment iconseg' + (opts.length === 2 ? ' cols-2' : '');
  wrap.setAttribute('role', 'tablist');
  for (const { val, label, icon } of opts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = label;
    btn.innerHTML = icon;
    btn.setAttribute('aria-selected', String(cur === val));
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.onclick = () => onPick(val);
    wrap.appendChild(btn);
  }
  return wrap;
}

function buildImageEl(b) {
  const el = document.createElement('div');
  el.className = 'blk image' + (state.sel === b.id ? ' selected imgsel' : '');
  el.dataset.id = b.id;
  el.dataset.type = 'image';
  el.style.top = (b.y | 0) + 'px';

  const scale = imgScalePct(b);
  const h = imgHeightOf(b);
  el.style.height = Math.max(40, h) + 'px';
  // escala = % da largura da coluna (mesmo contrato do diagramador)
  el.style.width = scale + '%';
  el.style.left = '0';
  el.style.right = 'auto';
  el.style.transform = '';
  if (scale < 100 && imgAlignOf(b) === 'center') {
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
  } else if (scale < 100 && (b.imgAlign === 'right' || b.align === 'right')) {
    el.style.left = 'auto';
    el.style.right = '0';
  }

  const frame = document.createElement('div');
  frame.className = 'img-frame';
  const rad = imgRadiusOf(b);
  frame.style.borderRadius = rad + 'px';
  frame.style.height = '100%';

  if (b.title != null) {
    const t = document.createElement('div');
    t.className = 'figtitle';
    t.dataset.role = 'title';
    t.contentEditable = state.editing ? 'true' : 'false';
    t.innerHTML = b.title || '';
    t.style.cssText = 'font-size:22px;font-weight:600;margin:0 0 8px;outline:none;';
    t.addEventListener('input', () => { b.title = t.innerHTML; save(); scheduleCommit(); });
    el.appendChild(t);
  }

  if (b.src) {
    const img = document.createElement('img');
    img.src = b.src;
    img.alt = '';
    img.draggable = false;
    img.style.width = '100%';
    img.style.height = b.title != null || b.caption != null ? 'auto' : '100%';
    img.style.display = 'block';
    img.style.borderRadius = rad + 'px';
    img.style.objectFit = 'cover';
    frame.appendChild(img);
  } else {
    const slot = document.createElement('div');
    slot.className = 'img-slot';
    slot.style.borderRadius = rad + 'px';
    slot.textContent = state.editing ? 'Clique para imagem' : '';
    frame.appendChild(slot);
  }
  el.appendChild(frame);

  if (b.caption != null) {
    const c = document.createElement('div');
    c.className = 'figcaption';
    c.dataset.role = 'caption';
    c.contentEditable = state.editing ? 'true' : 'false';
    c.innerHTML = b.caption || '';
    c.style.cssText = 'font-size:16px;color:#666;margin:8px 0 0;outline:none;';
    c.addEventListener('input', () => { b.caption = c.innerHTML; save(); scheduleCommit(); });
    el.appendChild(c);
  }

  const badge = document.createElement('span');
  badge.className = 'drag-badge';
  badge.textContent = '↕ arraste';
  badge.dataset.exportHide = '1';
  el.appendChild(badge);
  return el;
}

function placeBlock(host, b) {
  const el = b.type === 'image' ? buildImageEl(b) : buildTextEl(b);
  host.appendChild(el);
  return el;
}

// ─────────────────────────── render ─────────────────────────────────────────
function applySafeInsets(el, mode) {
  const s = safeOf(mode);
  el.style.left = s.left + 'px';
  el.style.right = s.right + 'px';
  el.style.top = s.top + 'px';
  el.style.bottom = s.bottom + 'px';
}

function mkColAdd(col) {
  const add = document.createElement('div');
  add.className = 'col-add';
  add.dataset.col = col;
  add.innerHTML = '<button type="button" class="col-add-btn" title="Adicionar bloco">+</button>';
  return add;
}

function renderStoryPage(page, pageIndex, total) {
  const root = document.createElement('div');
  root.className = 'story-page' + (state.editing ? ' editing' : '');
  root.dataset.page = String(pageIndex);
  const mode = clampMarginMode(state.doc.marginMode);

  const bg = document.createElement('div');
  bg.className = 'bg-layer';
  bg.style.backgroundColor = page.bg || DEFAULT_BG;
  if (page.bgImage) bg.style.backgroundImage = `url(${page.bgImage})`;
  root.appendChild(bg);

  // colunas 50/50 gap 0 DENTRO das safe margins (topo/base/lados)
  const cols = document.createElement('div');
  cols.className = 'cols';
  applySafeInsets(cols, mode);
  const colL = document.createElement('div');
  colL.className = 'col col-left';
  colL.dataset.col = 'left';
  const colR = document.createElement('div');
  colR.className = 'col col-right';
  colR.dataset.col = 'right';
  cols.append(colL, colR);
  root.appendChild(cols);

  const full = document.createElement('div');
  full.className = 'col-full';
  applySafeInsets(full, mode);
  root.appendChild(full);

  for (const b of page.blocks) {
    const host = b.col === 'full' ? full : b.col === 'right' ? colR : colL;
    placeBlock(host, b);
  }

  // "+" no hover de cada coluna (padrão diagramador). Full não tem col-add —
  // a camada full cobre as duas e engoliria o hover; use sidebar "Largura total".
  if (state.editing) {
    colL.appendChild(mkColAdd('left'));
    colR.appendChild(mkColAdd('right'));
  }

  if (state.doc.showSafe) root.appendChild(buildSafeOverlay());
  if (state.doc.uiPreview) root.appendChild(buildUiOverlay(pageIndex, total));

  return root;
}

function renderStrip() {
  const pages = state.doc.pages;
  stripScroll.replaceChildren();
  pages.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb';
    btn.role = 'listitem';
    btn.setAttribute('aria-current', String(i === state.pageIndex));
    btn.title = `Página ${i + 1}`;
    const bg = document.createElement('span');
    bg.className = 'thumb-bg';
    bg.style.backgroundColor = p.bg || DEFAULT_BG;
    if (p.bgImage) bg.style.backgroundImage = `url(${p.bgImage})`;
    const n = document.createElement('span');
    n.className = 'thumb-n';
    n.textContent = String(i + 1);
    btn.append(bg, n);
    btn.onclick = () => goToPage(i);
    stripScroll.appendChild(btn);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'thumb-add';
  add.title = 'Nova página';
  add.setAttribute('aria-label', 'Nova página');
  add.textContent = '+';
  add.onclick = () => addPage();
  stripScroll.appendChild(add);

  const n = pages.length;
  const i = state.pageIndex;
  $('pageCounter').textContent = `${i + 1} / ${n}`;
  const atStart = i <= 0;
  const atEnd = i >= n - 1;
  if ($('btnPrev')) $('btnPrev').disabled = atStart;
  if ($('btnNext')) $('btnNext').disabled = atEnd;
  $('btnDelPage').disabled = n <= 1;

  // scroll do thumb ativo pra vista
  const cur = stripScroll.querySelector('.thumb[aria-current="true"]');
  if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

function render() {
  const pages = state.doc.pages;
  state.pageIndex = clampPageIndex(state.pageIndex, pages.length);
  const page = pages[state.pageIndex];
  pagesEl.replaceChildren(renderStoryPage(page, state.pageIndex, pages.length));
  applyZoom();
  renderStrip();
  syncSelPanel();
  paintActive();
  save();
  scheduleCommit();
}

/** Só troca UI/safe no DOM — sem re-render nem applyZoom (não mexe no enquadramento). */
function paintOverlays() {
  const root = pagesEl.querySelector('.story-page');
  if (!root) return;
  root.querySelectorAll('.ui-layer, .safe-layer').forEach((el) => el.remove());
  if (state.doc.showSafe) root.appendChild(buildSafeOverlay());
  if (state.doc.uiPreview) {
    root.appendChild(buildUiOverlay(state.pageIndex, state.doc.pages.length));
  }
  save();
}

function paintActive() {
  pagesEl.querySelectorAll('.blk').forEach((el) => {
    el.classList.toggle('active-block', el.dataset.id === state.activeId);
  });
}

// ─────────────────────────── páginas ────────────────────────────────────────
function goToPage(i) {
  state.pageIndex = clampPageIndex(i, state.doc.pages.length);
  state.activeId = null;
  state.sel = null;
  closeFmtbar();
  syncSidebarFromDoc();
  render();
}
function addPage() {
  commit();
  state.doc.pages.push(mkPage());
  state.pageIndex = state.doc.pages.length - 1;
  state.activeId = state.doc.pages[state.pageIndex].blocks[0]?.id || null;
  state.sel = null;
  render();
  toast(`Página ${state.pageIndex + 1} adicionada`);
}
function delPage() {
  if (state.doc.pages.length <= 1) return;
  commit();
  state.doc.pages.splice(state.pageIndex, 1);
  state.pageIndex = clampPageIndex(state.pageIndex, state.doc.pages.length);
  state.activeId = null;
  state.sel = null;
  render();
  toast('Página removida');
}

// ─────────────────────────── blocos ─────────────────────────────────────────
/** @param {'text'|'image'} type @param {string} [colOverride] @param {string|null} [afterId] */
function addBlock(type, colOverride, afterId = null) {
  const page = currentPage();
  // default full width; colOverride vem do + na coluna (left/right) ou do menu
  const col = colOverride || 'full';
  const b = mkBlock(type, col);
  const peers = page.blocks.filter((x) => x.col === b.col);
  const safeH = safeRect(state.doc.marginMode).h;
  let y = 0;
  if (afterId) {
    const after = page.blocks.find((x) => x.id === afterId);
    if (after) {
      const h = after.type === 'image' ? (after.h | 0) : 80;
      y = (after.y | 0) + h + 24;
    }
  } else {
    for (const p of peers) {
      const h = p.type === 'image' ? (p.h | 0) : 80;
      y = Math.max(y, (p.y | 0) + h + 24);
    }
  }
  b.y = Math.min(y, Math.max(0, safeH - 120));
  if (type === 'text') b.html = '';
  page.blocks.push(b);
  state.activeId = b.id;
  state.sel = type === 'image' ? b.id : null;
  hideBadd();
  closeColAddMenu();
  render();
  if (type === 'image') {
    pendingImgId = b.id;
    $('imgFile').click();
  } else {
    requestAnimationFrame(() => {
      const el = pagesEl.querySelector(`.blk[data-id="${b.id}"]`);
      if (el) { el.focus(); placeCaretEnd(el); }
    });
  }
}

// menu Texto | Imagem ancorado no botão +
let colAddCtx = null; // { col, afterId, anchor }
function closeColAddMenu() {
  const m = $('colAddMenu');
  if (m) m.hidden = true;
  colAddCtx = null;
}
function openColAddMenu(anchor, col, afterId = null) {
  const m = $('colAddMenu');
  if (!m || !anchor) return;
  colAddCtx = { col, afterId, anchor };
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth || 140, mh = m.offsetHeight || 80;
  let x = r.left + (r.width - mw) / 2;
  x = Math.min(Math.max(8, x), innerWidth - mw - 8);
  let y = r.bottom + 6;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  m.style.left = x + 'px';
  m.style.top = y + 'px';
}

// ── alças Notion: + e ⠿ (mesmo padrão do diagramador) ───────────────────────
const baddEl = $('badd');
const bhandleEl = $('bhandle');
const bmenuEl = $('bmenu');
let handleFor = null; // id do bloco sob as alças
let handlePending = null; // pointerdown na alça (click = menu, move = drag)
const HANDLE_DRAG_PX = 5;

function hideHandles() {
  if (baddEl) baddEl.hidden = true;
  if (bhandleEl) bhandleEl.hidden = true;
  handleFor = null;
}
function hideBadd() { hideHandles(); }

function placeHandles(blkEl) {
  if (!state.editing || !blkEl || !baddEl || !bhandleEl) return hideHandles();
  const r = blkEl.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return hideHandles();
  handleFor = blkEl.dataset.id;
  const midY = r.top + r.height / 2;
  // [+] [gap] [⠿] | bloco  — à esquerda do bloco
  const dragLeft = Math.max(4, r.left - 22);
  const addLeft = Math.max(4, dragLeft - 22);
  bhandleEl.style.left = dragLeft + 'px';
  bhandleEl.style.top = midY + 'px';
  bhandleEl.hidden = false;
  baddEl.style.left = addLeft + 'px';
  baddEl.style.top = midY + 'px';
  baddEl.hidden = false;
}

function closeBlockMenu() {
  if (bmenuEl) bmenuEl.hidden = true;
}
function openBlockMenu(id, anchorEl) {
  if (!bmenuEl) return;
  bmenuEl.hidden = false;
  bmenuEl.dataset.id = id;
  const r = (anchorEl || bhandleEl).getBoundingClientRect();
  const mw = bmenuEl.offsetWidth || 160, mh = bmenuEl.offsetHeight || 72;
  let x = r.right + 6;
  if (x + mw > innerWidth - 8) x = Math.max(8, r.left - mw - 6);
  let y = r.top;
  if (y + mh > innerHeight - 8) y = Math.max(8, innerHeight - mh - 8);
  bmenuEl.style.left = x + 'px';
  bmenuEl.style.top = y + 'px';
}

function placeCaretEnd(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

function removeBlock(id) {
  const page = pageOfBlock(id);
  if (!page) return;
  const i = page.blocks.findIndex((b) => b.id === id);
  if (i < 0) return;
  page.blocks.splice(i, 1);
  if (!page.blocks.length) page.blocks.push(mkBlock('text', 'full'));
  if (state.activeId === id) state.activeId = page.blocks[Math.min(i, page.blocks.length - 1)]?.id || null;
  if (state.sel === id) state.sel = null;
  closeImgPanel();
  closeBlockMenu();
  hideHandles();
  render();
}

function duplicateBlock(id) {
  const page = pageOfBlock(id);
  if (!page) return;
  const i = page.blocks.findIndex((b) => b.id === id);
  if (i < 0) return;
  const src = page.blocks[i];
  const copy = structuredClone(src);
  copy.id = uid();
  // empurra um pouco pra baixo pra não sobrepor
  const h = src.type === 'image' ? (src.h | 0) : 80;
  copy.y = Math.min((src.y | 0) + h + 16, Math.max(0, safeRect(state.doc.marginMode).h - 40));
  page.blocks.splice(i + 1, 0, copy);
  state.activeId = copy.id;
  state.sel = copy.type === 'image' ? copy.id : null;
  closeBlockMenu();
  render();
  if (copy.type === 'image') openImgPanel();
}

let pendingImgId = null;
let replaceImageId = null;

function setImageSrc(id, dataUrl) {
  const b = blockOf(id);
  if (!b || b.type !== 'image') return;
  b.src = dataUrl;
  if (b.radius == null) b.radius = 4;
  if (b.scale == null) b.scale = 100;
  // lê dimensões naturais (altura = f(escala × aspect) como no diagramador)
  const probe = new Image();
  probe.onload = () => {
    b.nw = probe.naturalWidth;
    b.nh = probe.naturalHeight;
    b.h = Math.round(imgHeightOf(b));
    render();
    if (state.sel === id) openImgPanel();
  };
  probe.onerror = () => {
    render();
    if (state.sel === id) openImgPanel();
  };
  probe.src = dataUrl;
}

// ── painel flutuante da imagem (cópia do contrato do diagramador) ───────────
let imgPanel = $('imgPanel');
function closeImgPanel() {
  if (imgPanel) imgPanel.hidden = true;
}
function positionImgPanel() {
  if (!imgPanel || imgPanel.hidden || !state.sel) return;
  const el = pagesEl.querySelector(`.blk.image[data-id="${state.sel}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = imgPanel.offsetWidth || 232, ph = imgPanel.offsetHeight || 280;
  let x = r.right + 10;
  if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  imgPanel.style.left = x + 'px';
  imgPanel.style.top = y + 'px';
}

function openImgPanel() {
  const b = blockOf(state.sel);
  if (!b || b.type !== 'image') return closeImgPanel();
  if (!imgPanel) {
    imgPanel = document.createElement('div');
    imgPanel.id = 'imgPanel';
    document.body.appendChild(imgPanel);
  }
  const radius = imgRadiusOf(b);
  const RADIUS_SLIDER_MAX = 24;
  const scalePct = imgScalePct(b);
  const scaleLabel = fmtImgScalePct(scalePct);
  const col = b.col === 'left' || b.col === 'right' ? b.col : 'full';

  imgPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Imagem</div>
    <div class="row img-tc-row">
      <button type="button" class="fieldbtn" data-a="title">${b.title != null ? MINUS_SVG : PLUS_SVG}<span>Título</span></button>
      <button type="button" class="fieldbtn" data-a="caption">${b.caption != null ? MINUS_SVG : PLUS_SVG}<span>Legenda</span></button>
    </div>
    <div class="field">Posição<div data-slot="col"></div></div>
    <label class="field"><span class="field-row">Escala <span class="field-val"><span data-role="scalev">${scaleLabel}</span>%<button type="button" class="resetbtn" data-a="scalereset" title="Redefinir para 100% (ocupa a coluna)">↺</button></span></span>
      <input type="range" data-a="scale" min="10" max="100" step="${IMG_SCALE_STEP}" value="${scalePct}" data-snaps="10,25,50,75,100">
    </label>
    <div data-role="scale-opts" ${scalePct >= 100 ? 'hidden' : ''}>
      <div class="field">Alinhamento<div data-slot="imgalign"></div></div>
    </div>
    <label class="field"><span class="field-row">Cantos (raio) <span class="field-val"><span data-role="radv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric" title="Clique para digitar">${radius}</span>px<button type="button" class="resetbtn" data-a="radiusreset" title="Redefinir para 4px">↺</button></span></span>
      <input type="range" data-a="radius" min="0" max="${RADIUS_SLIDER_MAX}" step="1" value="${Math.min(radius, RADIUS_SLIDER_MAX)}" data-snaps="0,4,8,12,16,24" data-edit="off">
    </label>
    <button type="button" class="fieldbtn" data-a="replace">${REPLACE_ICO}<span>Substituir</span></button>
    <button type="button" class="fieldbtn danger" data-a="del">${TRASH_ICO}<span>Remover</span></button>`;
  imgPanel.hidden = false;

  // Posição: ícones de coluna (mesmo visual do diagramador)
  imgPanel.querySelector('[data-slot="col"]').append(
    widthSeg(col, [
      { val: 'left', label: 'Coluna Esquerda', icon: COL_ICON.left },
      { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
      { val: 'right', label: 'Coluna Direita', icon: COL_ICON.right },
    ], (v) => {
      b.col = v;
      render();
      if (state.sel) openImgPanel();
    }));

  const alignSlot = imgPanel.querySelector('[data-slot="imgalign"]');
  const mountAlignSeg = () => {
    if (!alignSlot) return;
    alignSlot.replaceChildren(widthSeg(imgAlignOf(b), [
      { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
      { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
    ], (v) => {
      b.imgAlign = v === 'center' ? 'center' : 'left';
      if (b.imgAlign === 'left') delete b.imgAlign;
      delete b.align; // legado
      render();
      if (state.sel) openImgPanel();
    }));
  };
  mountAlignSeg();

  const liveEl = () => pagesEl.querySelector(`.blk.image[data-id="${b.id}"]`);
  const paintRadius = (n, { syncText = true } = {}) => {
    b.radius = n;
    const el = liveEl();
    if (el) {
      el.querySelectorAll('.img-frame, img, .img-slot').forEach((node) => {
        node.style.borderRadius = n + 'px';
      });
    }
    const radv = imgPanel.querySelector('[data-role="radv"]');
    if (syncText && radv && document.activeElement !== radv) radv.textContent = String(n);
    const range = imgPanel.querySelector('input[data-a="radius"]');
    if (range) range.value = String(Math.min(n, RADIUS_SLIDER_MAX));
    save(); scheduleCommit();
  };
  const paintScale = (pct) => {
    b.scale = pct;
    b.h = Math.round(imgHeightOf(b));
    const scalev = imgPanel.querySelector('[data-role="scalev"]');
    if (scalev) scalev.textContent = fmtImgScalePct(pct);
    const opts = imgPanel.querySelector('[data-role="scale-opts"]');
    if (opts) opts.hidden = pct >= 100;
    // reflow ao vivo: width/height do bloco
    const el = liveEl();
    if (el) {
      el.style.width = pct + '%';
      el.style.height = Math.max(40, imgHeightOf(b)) + 'px';
      if (pct < 100 && imgAlignOf(b) === 'center') {
        el.style.left = '50%';
        el.style.right = 'auto';
        el.style.transform = 'translateX(-50%)';
      } else {
        el.style.left = '0';
        el.style.right = 'auto';
        el.style.transform = '';
      }
    }
    save(); scheduleCommit();
  };

  imgPanel.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });

  const radv = imgPanel.querySelector('[data-role="radv"]');
  if (radv) {
    radv.addEventListener('input', () => {
      const n = Math.round(Number(String(radv.textContent || '').replace(/[^\d.-]/g, '')));
      if (Number.isFinite(n)) paintRadius(Math.max(0, Math.min(Math.floor(PAGE_W / 2), n)), { syncText: false });
    });
    radv.addEventListener('blur', () => {
      paintRadius(imgRadiusOf(b), { syncText: true });
      radv.textContent = String(imgRadiusOf(b));
    });
  }

  enhanceAll(imgPanel);

  imgPanel.querySelectorAll('button[data-a],input[data-a]').forEach((el) => {
    const ev = el.type === 'range' ? 'input' : 'click';
    el.addEventListener(ev, () => {
      const a = el.dataset.a;
      if (a === 'radius') { paintRadius(+el.value); return; }
      if (a === 'radiusreset') { paintRadius(4); return; }
      if (a === 'scale') { paintScale(+el.value); return; }
      if (a === 'scalereset') {
        paintScale(100);
        render();
        if (state.sel) openImgPanel();
        return;
      }
      if (a === 'title') {
        if (b.title != null) delete b.title;
        else b.title = '';
        render();
        if (state.sel) openImgPanel();
        return;
      }
      if (a === 'caption') {
        if (b.caption != null) delete b.caption;
        else b.caption = '';
        render();
        if (state.sel) openImgPanel();
        return;
      }
      if (a === 'replace') {
        replaceImageId = b.id;
        pendingImgId = b.id;
        $('imgFile').click();
        return;
      }
      if (a === 'del') {
        removeBlock(b.id);
        return;
      }
    });
  });
  // commit da escala (soltar thumb): re-render pra altura final
  imgPanel.querySelector('input[data-a="scale"]')?.addEventListener('change', () => {
    b.h = Math.round(imgHeightOf(b));
    render();
    positionImgPanel();
  });

  positionImgPanel();
}

// ─────────────────────────── segment Configurações / Conteúdo ───────────────
// Mesmo contrato do diagramador: ícones options/layers + troca de .pane no stack.
const SEG_ICO = {
  // options-outline / layers-outline (Ionicons-like paths)
  documento: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/></svg>',
  conteudo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/></svg>',
};
const segBtns = [...document.querySelectorAll('#segment button')];
segBtns.forEach((b) => {
  const ico = SEG_ICO[b.dataset.seg];
  if (!ico) return;
  const label = b.textContent.trim();
  b.innerHTML = `${ico}<span>${label}</span>`;
});

/** Troca aba Configurações ↔ Conteúdo (idêntico ao setSegment do diagramador). */
function setSegment(name) {
  segBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.seg === name)));
  document.querySelectorAll('.pane-stack > .pane').forEach((p) => {
    const on = p.dataset.pane === name;
    p.hidden = !on;
    // limpa estado residual de fade, se houver
    p.classList.remove('sb-fading');
    p.style.opacity = p.style.transition = p.style.zIndex = '';
  });
}

function syncSelPanel() {
  const panel = $('selPanel');
  const body = $('selBody');
  const id = state.sel || state.activeId;
  const b = id ? blockOf(id) : null;
  if (!b) {
    panel.hidden = true;
    body.replaceChildren();
    return;
  }
  panel.hidden = false;
  body.replaceChildren();

  if (b.type === 'text') {
    body.append(fieldSelect('Coluna', b.col, [
      ['full', 'Largura total'], ['left', 'Esquerda'], ['right', 'Direita'],
    ], (v) => { b.col = v; render(); }));
    body.append(fieldRange('Tamanho', b.size || 24, 10, 72, 1, (v) => {
      b.size = v;
      const el = pagesEl.querySelector(`.blk[data-id="${b.id}"]`);
      if (el) el.style.fontSize = v + 'px';
      else render();
      save(); scheduleCommit();
    }));
    body.append(fieldColor('Cor', b.color || DEFAULT_TEXT, (v) => {
      b.color = v;
      const el = pagesEl.querySelector(`.blk[data-id="${b.id}"]`);
      if (el) el.style.color = v;
      save(); scheduleCommit();
    }));
    const safeH = safeRect(state.doc.marginMode).h;
    body.append(fieldRange('Posição Y', b.y | 0, 0, Math.max(0, safeH - 40), 1, (v) => {
      b.y = v;
      const el = pagesEl.querySelector(`.blk[data-id="${b.id}"]`);
      if (el) el.style.top = v + 'px';
      save(); scheduleCommit();
    }));
  } else {
    // imagem: o painel flutuante (#imgPanel) é a fonte de verdade (igual diagramador)
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Use o painel ao lado da imagem (Posição, Escala, Cantos, Substituir…).';
    body.append(hint);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'fieldbtn';
    open.textContent = 'Abrir painel da imagem';
    open.onclick = () => { state.sel = b.id; openImgPanel(); };
    body.append(open);
    const safeH = safeRect(state.doc.marginMode).h;
    body.append(fieldRange('Posição Y', b.y | 0, 0, Math.max(0, safeH - 40), 1, (v) => {
      b.y = v;
      const el = pagesEl.querySelector(`.blk[data-id="${b.id}"]`);
      if (el) el.style.top = v + 'px';
      save(); scheduleCommit();
    }));
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = 'Apagar bloco';
  del.style.color = '#FF6B6B';
  del.onclick = () => removeBlock(b.id);
  body.append(del);
}

function fieldSelect(label, cur, opts, onPick) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const sel = document.createElement('select');
  for (const [val, lab] of opts) {
    const o = document.createElement('option');
    o.value = val; o.textContent = lab;
    if (val === cur) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => onPick(sel.value);
  wrap.appendChild(sel);
  return wrap;
}
function fieldRange(label, cur, min, max, step, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const row = document.createElement('span');
  row.className = 'field-row';
  row.style.display = 'flex';
  row.style.justifyContent = 'space-between';
  const lab = document.createElement('span'); lab.textContent = label;
  const val = document.createElement('span'); val.textContent = String(cur);
  val.style.color = 'var(--ink)';
  val.style.fontVariantNumeric = 'tabular-nums';
  row.append(lab, val);
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = cur;
  inp.oninput = () => { val.textContent = inp.value; onInput(+inp.value); };
  wrap.append(row, inp);
  return wrap;
}
function fieldColor(label, cur, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : DEFAULT_TEXT;
  inp.oninput = () => onInput(inp.value);
  wrap.appendChild(inp);
  return wrap;
}

// ─────────────────────────── sidebar sync ───────────────────────────────────
function syncSidebarFromDoc() {
  const d = state.doc;
  const page = currentPage();
  if ($('marginMode')) $('marginMode').value = clampMarginMode(d.marginMode);
  syncStageToggles();
  paintPageBg();
  if ($('btnBgClear')) $('btnBgClear').disabled = !page.bgImage;
}
function syncStageToggles() {
  const ui = $('btnUiPreview');
  const safe = $('btnShowSafe');
  if (ui) ui.setAttribute('aria-pressed', String(state.doc.uiPreview !== false));
  if (safe) safe.setAttribute('aria-pressed', String(state.doc.showSafe !== false));
}
function pageBgColor() {
  const raw = currentPage()?.bg || DEFAULT_BG;
  const p = parseColor(raw);
  return p ? p.hex : DEFAULT_BG;
}
function paintPageBg() {
  const btn = $('pageBg');
  if (!btn) return;
  btn.style.background = pageBgColor();
}

// ─────────────────────────── fmtbar ─────────────────────────────────────────
const fmtbar = $('fmtbar');
function closeFmtbar() { fmtbar.hidden = true; }
function updateFmtbar() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) { closeFmtbar(); return; }
  let n = sel.anchorNode;
  while (n && n.nodeType === 3) n = n.parentNode;
  const host = n && n.closest && n.closest('#pages .blk.text');
  if (!host) { closeFmtbar(); return; }
  fmtbar.hidden = false;
  fmtbar.querySelectorAll('[data-cmd]').forEach((btn) => {
    try { btn.classList.toggle('on', document.queryCommandState(btn.dataset.cmd)); }
    catch { btn.classList.remove('on'); }
  });
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  const bw = fmtbar.offsetWidth, bh = fmtbar.offsetHeight;
  const x = Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, innerWidth - bw - 8));
  const y = rect.top - bh - 8 >= 8 ? rect.top - bh - 8 : rect.bottom + 8;
  fmtbar.style.left = x + 'px';
  fmtbar.style.top = y + 'px';
}
fmtbar.addEventListener('mousedown', (e) => e.preventDefault());
fmtbar.querySelectorAll('[data-cmd]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.execCommand(btn.dataset.cmd);
    updateFmtbar();
  });
});

// ─────────────────────────── eventos de edição ──────────────────────────────
pagesEl.addEventListener('input', (e) => {
  const host = e.target.closest?.('.blk.text');
  if (!host) return;
  const b = blockOf(host.dataset.id);
  if (!b) return;
  b.html = host.innerHTML;
  save();
  scheduleCommit();
});

pagesEl.addEventListener('focusin', (e) => {
  const host = e.target.closest?.('.blk.text');
  if (!host) return;
  state.activeId = host.dataset.id;
  state.sel = null;
  closeImgPanel();
  setSegment('conteudo');
  syncSelPanel();
  paintActive();
  placeHandles(host);
});

pagesEl.addEventListener('mouseup', () => setTimeout(updateFmtbar, 0));
pagesEl.addEventListener('keyup', () => setTimeout(updateFmtbar, 0));

pagesEl.addEventListener('click', (e) => {
  if (e.target.closest?.('#bhandle, #badd, #bmenu, #imgPanel')) return;
  const img = e.target.closest?.('.blk.image');
  if (img) {
    state.sel = img.dataset.id;
    state.activeId = img.dataset.id;
    const b = blockOf(img.dataset.id);
    if (b && !b.src) {
      pendingImgId = b.id;
      $('imgFile').click();
    }
    setSegment('conteudo');
    syncSelPanel();
    paintActive();
    pagesEl.querySelectorAll('.blk.image').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === state.sel);
      el.classList.toggle('imgsel', el.dataset.id === state.sel);
    });
    placeHandles(img);
    openImgPanel();
    return;
  }
  const txt = e.target.closest?.('.blk.text');
  if (txt) {
    placeHandles(txt);
  }
});

// arraste vertical — pela alça ⠿ (padrão diagramador) ou imagem diretamente
let drag = null;
function startDrag(id, clientY, pointerEl) {
  const b = blockOf(id);
  if (!b) return;
  const z = state.zoom === 'fit' ? fitZoomScale() : clampZoom(+state.zoom);
  drag = { id, startY: clientY, origY: b.y | 0, scale: z };
  document.body.classList.add('grabbing');
  pointerEl?.setPointerCapture?.(0);
}
function moveDrag(clientY) {
  if (!drag) return;
  const b = blockOf(drag.id);
  if (!b) return;
  const dy = (clientY - drag.startY) / drag.scale;
  const maxY = Math.max(0, safeRect(state.doc.marginMode).h - 40);
  b.y = Math.max(0, Math.min(maxY, Math.round(drag.origY + dy)));
  const el = pagesEl.querySelector(`.blk[data-id="${drag.id}"]`);
  if (el) {
    el.style.top = b.y + 'px';
    placeHandles(el);
    if (state.sel === drag.id) positionImgPanel();
  }
}
function endDrag() {
  if (!drag) return;
  drag = null;
  document.body.classList.remove('grabbing');
  save();
  scheduleCommit();
  syncSelPanel();
}

// imagem: arrasta direto (badge "↕ arraste")
pagesEl.addEventListener('pointerdown', (e) => {
  const blk = e.target.closest?.('.blk.image');
  if (!blk || !state.editing) return;
  if (e.target.closest?.('input, button, select, [contenteditable]')) return;
  e.preventDefault();
  startDrag(blk.dataset.id, e.clientY, blk);
});
document.addEventListener('pointermove', (e) => {
  // promove pending da alça a drag
  if (handlePending && !drag) {
    const dx = e.clientX - handlePending.x;
    const dy = e.clientY - handlePending.y;
    if (Math.hypot(dx, dy) >= HANDLE_DRAG_PX) {
      const id = handlePending.id;
      handlePending = null;
      startDrag(id, e.clientY, bhandleEl);
    }
  }
  if (drag) moveDrag(e.clientY);
});
document.addEventListener('pointerup', (e) => {
  if (handlePending) {
    // click curto na alça → menu Duplicar/Remover
    const id = handlePending.id;
    handlePending = null;
    openBlockMenu(id, bhandleEl);
    return;
  }
  endDrag();
});

// ─────────────────────────── export raster ──────────────────────────────────
let _fontUri;
async function plexFontFace() {
  if (!_fontUri) {
    const b = await (await fetch('fonts/IBMPlexSans-Var.ttf')).blob();
    _fontUri = await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result);
      fr.readAsDataURL(b);
    });
  }
  return `@font-face{font-family:"Plex";src:url("${_fontUri}") format("truetype-variations");font-weight:100 700;font-stretch:62% 100%;font-display:block;}`;
}

const EXPORT_CSS = `
  * { box-sizing: border-box; }
  .story-page {
    position: relative; width: ${PAGE_W}px; height: ${PAGE_H}px;
    background: ${DEFAULT_BG}; color: ${DEFAULT_TEXT};
    font-family: "Plex", "IBM Plex Sans", system-ui, sans-serif;
    overflow: hidden;
  }
  .story-page .bg-layer {
    position: absolute; inset: 0;
    background-size: cover; background-position: center; background-repeat: no-repeat;
  }
  /* left/right/top/bottom vêm inline (safe margins) */
  .story-page .cols {
    position: absolute;
    display: grid; grid-template-columns: 1fr 1fr; gap: 0;
  }
  .story-page .col { position: relative; min-width: 0; height: 100%; }
  .story-page .col-full { position: absolute; }
  .story-page .blk {
    position: absolute; left: 0;
    box-sizing: border-box; padding: 12px 20px;
    word-break: break-word; white-space: pre-wrap;
  }
  .story-page .blk.text { right: 0; }
  .story-page .blk.image { padding: 0; overflow: visible; display: flex; flex-direction: column; }
  .story-page .blk.image .img-frame { width: 100%; height: 100%; overflow: hidden; }
  .story-page .blk.image img {
    width: 100%; height: 100%; display: block; object-fit: cover;
  }
  .story-page .blk.image .img-slot,
  .story-page .blk.image .drag-badge { display: none; }
`;

function exportPageNode() {
  // re-render sem chrome de edição / safe / UI
  const prevEdit = state.editing;
  const prevUi = state.doc.uiPreview;
  const prevSafe = state.doc.showSafe;
  state.editing = false;
  state.doc.uiPreview = false;
  state.doc.showSafe = false;
  const page = currentPage();
  const node = renderStoryPage(page, state.pageIndex, state.doc.pages.length);
  state.editing = prevEdit;
  state.doc.uiPreview = prevUi;
  state.doc.showSafe = prevSafe;
  node.querySelectorAll('[data-export-hide]').forEach((el) => el.remove());
  return node;
}

async function pageToCanvas() {
  const fontCss = await plexFontFace();
  const node = exportPageNode();
  // rasteriza o artboard de TRABALHO (360×640) e escala p/ Instagram (1080×1920)
  const html = node.outerHTML;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${PAGE_W}px;height:${PAGE_H}px;margin:0;padding:0">` +
    `<style>${fontCss}${EXPORT_CSS}</style>${html}</div></foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Falha ao rasterizar a página'));
      img.src = url;
    });
    await img.decode().catch(() => {});
    const c = document.createElement('canvas');
    c.width = EXPORT_W;
    c.height = EXPORT_H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = currentPage().bg || DEFAULT_BG;
    ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
    // × EXPORT_SCALE (3): 360→1080, 640→1920
    ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H, 0, 0, EXPORT_W, EXPORT_H);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportRaster(mime, quality) {
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
  toast(`Gerando ${ext.toUpperCase()}…`);
  try {
    const canvas = await pageToCanvas();
    const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
    if (!blob) throw new Error('Canvas vazio');
    const base = slug(state.doc.title);
    const n = state.pageIndex + 1;
    downloadBlob(blob, `${base}-p${n}.${ext}`);
    toast(`${ext.toUpperCase()} baixado.`);
  } catch (e) {
    console.error(e);
    toast('Falha no export: ' + (e.message || e), true);
  }
}

async function exportZip() {
  toast('Empacotando projeto…');
  try {
    const blob = await serializeDocZip(state.doc);
    const name = projectBaseName(state.doc.title, 'stories') + '.pdgm.zip';
    downloadBlob(blob, name);
    toast('ZIP do projeto baixado.');
  } catch (e) {
    console.error(e);
    toast('Falha no ZIP: ' + (e.message || e), true);
  }
}

// ─────────────────────────── abrir / novo ───────────────────────────────────
function applyDoc(raw) {
  const doc = normalizeStoriesDoc(raw);
  if (raw && raw.kind && raw.kind !== 'stories') {
    // aceita só stories; se kind ausente mas tem pages[], ainda normaliza
    if (!Array.isArray(raw.pages)) {
      throw new Error('Este arquivo não é um projeto de Stories (kind ≠ stories).');
    }
  }
  state.doc = doc;
  state.pageIndex = 0;
  state.activeId = doc.pages[0]?.blocks[0]?.id || null;
  state.sel = null;
  hist.past = []; hist.future = []; hist.last = null;
  syncSidebarFromDoc();
  render();
  commit();
}

async function openFile(file) {
  const fmt = projectFormatFromName(file.name);
  try {
    if (fmt === 'pdgm' || file.name.toLowerCase().endsWith('.zip')) {
      const buf = await file.arrayBuffer();
      const r = await loadDocZip(buf, file.name);
      if (!r.ok) {
        toast(r.title || 'ZIP inválido', true);
        return;
      }
      if (!isStoriesDoc(r.doc) && !Array.isArray(r.doc?.pages)) {
        toast('ZIP não é um projeto de Stories', true);
        return;
      }
      applyDoc(r.doc);
      toast('Projeto aberto');
      return;
    }
    const text = await file.text();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error('JSON inválido'); }
    // aceita envelope {v,doc} ou doc cru
    const doc = deserializeDoc(parsed) || (parsed && parsed.kind === 'stories' ? parsed : null)
      || (Array.isArray(parsed?.pages) ? parsed : null);
    if (!doc) throw new Error('Formato de projeto desconhecido');
    applyDoc(doc);
    toast('Projeto aberto');
  } catch (e) {
    console.error(e);
    toast(e.message || 'Não foi possível abrir', true);
  }
}

function newDoc() {
  if (!confirm('Descartar o story atual e começar um novo?')) return;
  applyDoc(seedDoc());
  idb.del('doc').catch(() => {});
  toast('Novo story');
}

// ─────────────────────────── bind UI ────────────────────────────────────────
function bind() {
  // sidebar toggle
  $('btnSidebar').addEventListener('click', () => {
    const main = $('main');
    const on = main.classList.toggle('sidebar-collapsed');
    $('btnSidebar').setAttribute('aria-pressed', String(!on));
  });

  // zoom
  $('zoomFit').addEventListener('click', () => {
    state.zoom = 'fit';
    applyZoom();
  });
  const zoomPct = $('zoomPct');
  const zoomPop = $('zoomPop');
  zoomPct.addEventListener('click', () => {
    if (zoomPop.hidden) {
      zoomPop.hidden = false;
      zoomPct.setAttribute('aria-expanded', 'true');
      const r = zoomPct.getBoundingClientRect();
      zoomPop.style.left = Math.max(8, r.left + (r.width - 200) / 2) + 'px';
      zoomPop.style.top = (r.bottom + 6) + 'px';
    } else {
      zoomPop.hidden = true;
      zoomPct.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (zoomPop.hidden) return;
    if (e.target.closest('#zoomPop') || e.target.closest('#zoomPct')) return;
    zoomPop.hidden = true;
    zoomPct.setAttribute('aria-expanded', 'false');
  });
  $('zoomRange').addEventListener('input', () => {
    state.zoom = clampZoom((+$('zoomRange').value || 100) / 100);
    applyZoom();
  });
  enhanceAll(zoomPop);

  // hist
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);

  // download menu
  const dlMenu = $('downloadMenu');
  const btnDl = $('btnDownload');
  function openDl() {
    const r = btnDl.getBoundingClientRect();
    dlMenu.hidden = false;
    const mw = dlMenu.offsetWidth || 200;
    dlMenu.style.left = Math.max(8, r.right - mw) + 'px';
    dlMenu.style.top = (r.bottom + 6) + 'px';
  }
  function closeDl() { dlMenu.hidden = true; }
  btnDl.addEventListener('click', () => { dlMenu.hidden ? openDl() : closeDl(); });
  document.addEventListener('mousedown', (e) => {
    if (dlMenu.hidden) return;
    if (e.target.closest('#downloadMenu') || e.target.closest('#btnDownload')) return;
    closeDl();
  }, true);
  dlMenu.querySelector('[data-dl="png"]').onclick = () => { closeDl(); exportRaster('image/png'); };
  dlMenu.querySelector('[data-dl="jpg"]').onclick = () => { closeDl(); exportRaster('image/jpeg', 0.92); };
  dlMenu.querySelector('[data-dl="zip"]').onclick = () => { closeDl(); exportZip(); };

  $('btnNew').addEventListener('click', newDoc);
  $('btnOpen').addEventListener('click', () => $('openFile').click());
  $('openFile').addEventListener('change', () => {
    const f = $('openFile').files?.[0];
    $('openFile').value = '';
    if (f) openFile(f);
  });

  // nav páginas
  $('btnPrev').addEventListener('click', () => goToPage(state.pageIndex - 1));
  $('btnNext').addEventListener('click', () => goToPage(state.pageIndex + 1));
  $('btnDelPage').addEventListener('click', delPage);

  // segment Configurações / Conteúdo (mesmo wiring do diagramador)
  segBtns.forEach((b) => b.addEventListener('click', () => setSegment(b.dataset.seg)));
  setSegment('documento');

  $('marginMode').addEventListener('change', () => {
    state.doc.marginMode = clampMarginMode($('marginMode').value);
    render();
  });
  // toggles flutuantes (canto do palco — mesmo lugar do índice no diagramador).
  // paintOverlays: não chama render/applyZoom — o zoom fica onde o usuário deixou.
  $('btnUiPreview')?.addEventListener('click', () => {
    state.doc.uiPreview = !state.doc.uiPreview;
    syncStageToggles();
    paintOverlays();
  });
  $('btnShowSafe')?.addEventListener('click', () => {
    state.doc.showSafe = !state.doc.showSafe;
    syncStageToggles();
    paintOverlays();
  });

  $('pageBg').addEventListener('click', () => {
    openSwatchPop($('pageBg'), (color) => {
      // fundo de página: hex opaco (alpha no swatch vira hex via withAlpha; se rgba, pega hex)
      const p = parseColor(color);
      currentPage().bg = p ? p.hex : (color || DEFAULT_BG);
      paintPageBg();
      render();
    }, pageBgColor(), { opacity: false, paper: true });
  });
  $('btnBgImage').addEventListener('click', () => $('bgFile').click());
  $('btnBgClear').addEventListener('click', () => {
    currentPage().bgImage = null;
    render();
  });
  $('bgFile').addEventListener('change', async () => {
    const f = $('bgFile').files?.[0];
    $('bgFile').value = '';
    if (!f) return;
    const data = await readFileAsDataUrl(f);
    currentPage().bgImage = data;
    render();
  });

  $('blocktypes').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    addBlock(btn.dataset.type);
  });

  // "+" no hover da coluna / full
  pagesEl.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.col-add-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = btn.closest('.col-add');
    const col = wrap?.dataset.col || 'left';
    openColAddMenu(btn, col, null);
  });

  // + da alça → menu Texto|Imagem abaixo do bloco
  baddEl?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!handleFor) return;
    const blk = blockOf(handleFor);
    openColAddMenu(baddEl, blk?.col || 'full', handleFor);
  });

  // ⠿: pointerdown inicia pending (click = menu, move = drag)
  bhandleEl?.addEventListener('pointerdown', (e) => {
    if (!handleFor) return;
    e.preventDefault();
    e.stopPropagation();
    closeBlockMenu();
    handlePending = { id: handleFor, x: e.clientX, y: e.clientY };
  });

  bmenuEl?.addEventListener('mousedown', (e) => e.preventDefault());
  bmenuEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-a]');
    if (!btn || !bmenuEl.dataset.id) return;
    const id = bmenuEl.dataset.id;
    closeBlockMenu();
    if (btn.dataset.a === 'dup') duplicateBlock(id);
    else if (btn.dataset.a === 'del') removeBlock(id);
  });

  $('colAddMenu')?.querySelectorAll('button[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!colAddCtx) return;
      const { col, afterId } = colAddCtx;
      addBlock(btn.dataset.type, col, afterId);
    });
  });

  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    if (t.closest?.('#colAddMenu, #badd, .col-add-btn')) { /* keep */ }
    else closeColAddMenu();
    if (t.closest?.('#bmenu, #bhandle')) { /* keep */ }
    else closeBlockMenu();
    if (t.closest?.('#imgPanel, .blk.image, .swatch-pop')) { /* keep */ }
    else if (state.sel && !t.closest?.('.blk.image')) {
      // clicar fora fecha painel mas mantém sel se for chrome
    }
    if (state.sel && !t.closest?.('#imgPanel, .blk.image, #bhandle, #badd, #bmenu')) {
      // não limpa sel ao clicar sidebar
      if (!t.closest?.('#sidebar')) {
        // keep image panel open only while sel
      }
    }
  }, true);

  // posiciona alças no hover de bloco (document: não some ao ir pro botão)
  document.addEventListener('mousemove', (e) => {
    if (!state.editing || drag || handlePending) return;
    if (e.target.closest?.('#colAddMenu, #bmenu, #imgPanel')) return;
    if (e.target.closest?.('#badd, #bhandle')) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const blk = under?.closest?.('#pages .blk');
    if (blk) placeHandles(blk);
    else if (!under?.closest?.('#badd, #bhandle')) hideHandles();
  });

  $('imgFile').addEventListener('change', async () => {
    const f = $('imgFile').files?.[0];
    $('imgFile').value = '';
    const id = replaceImageId || pendingImgId;
    replaceImageId = null;
    if (!f || !id) return;
    const data = await readFileAsDataUrl(f);
    pendingImgId = null;
    setImageSrc(id, data);
  });

  // teclado
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (mod && e.key === 's') { e.preventDefault(); exportZip(); return; }
    if (e.key === 'ArrowLeft' && mod) { e.preventDefault(); goToPage(state.pageIndex - 1); return; }
    if (e.key === 'ArrowRight' && mod) { e.preventDefault(); goToPage(state.pageIndex + 1); return; }
    if (e.key === 'Escape') {
      closeFmtbar();
      closeDl();
      closeColAddMenu();
      closeBlockMenu();
      closeImgPanel();
      hideHandles();
      state.sel = null;
      syncSelPanel();
      pagesEl.querySelectorAll('.blk.image.selected, .blk.image.imgsel').forEach((el) => {
        el.classList.remove('selected', 'imgsel');
      });
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && state.sel && !e.target.closest('[contenteditable], input, textarea, select')) {
      e.preventDefault();
      removeBlock(state.sel);
    }
  });

  addEventListener('resize', () => { if (state.zoom === 'fit') applyZoom(); });
}

function readFileAsDataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}

// ─────────────────────────── init ───────────────────────────────────────────
bind();
syncSidebarFromDoc();

// restaura sessão
idb.get('doc').then((doc) => {
  if (doc && (isStoriesDoc(doc) || Array.isArray(doc.pages))) {
    try {
      const cfg = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      state.doc = normalizeStoriesDoc(doc);
      if (cfg.pageIndex != null) state.pageIndex = clampPageIndex(cfg.pageIndex, state.doc.pages.length);
      syncSidebarFromDoc();
      render();
      hist.last = snap();
      return;
    } catch { /* fallthrough */ }
  }
  render();
  hist.last = snap();
}).catch(() => {
  render();
  hist.last = snap();
});
