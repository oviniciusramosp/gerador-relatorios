/* Criador de Stories — artboard 360×640 (trabalho, ≈ telefone), export 1080×1920.
 *
 * Páginas discretas, lista horizontal + prev/next, layout freestyle (x/y/scale),
 * margens Stories/Reels + preview de UI, blocos Texto, Imagem/Gráfico e Stickers,
 * export PNG / JPG / ZIP (.pdgm) em resolução Instagram (× EXPORT_SCALE).
 *
 * Núcleo puro: stories-core.js. Serialização: doc-format.js (genérica).
 * Ícones de token: coin-icons.js + pasta coin-icons/ (mesma base do mexc-bot).
 */

import { enhanceAll, wireFieldEditKeys, isFreeSnap } from './range-snap.js';
import { deserializeDoc, serializeDocZip, loadDocZip } from './doc-format.js';
import { makeZip } from './zip-lite.js';
import { projectBaseName, projectFormatFromName } from './project-link.js';
import { initFeedback } from './feedback.js';
import { initAppNav } from './app-nav.js';
import { openSwatchPop, parseColor, withAlpha } from './swatch.js';
import { ALIGN_ICON, POS_ICON, widthSeg } from './ui-segment.js';
import { registerUiIcons, uiIco } from './ui-icons.js';
import { createBlockHandles, HANDLE_GEOM } from './ui-handles.js';
import { ensureFmtbarChrome } from './ui-fmtbar.js';
import { bindEditorShell } from './ui-shell.js';
import { LOGOS, logoPickSvg } from './logos.js';
import {
  PAGE_W, PAGE_H, EXPORT_W, EXPORT_H, EXPORT_SCALE,
  DEFAULT_BG, DEFAULT_TEXT, uid,
  seedDoc, normalizeStoriesDoc, isStoriesDoc,
  mkBlock, mkPage, clampPageIndex, clampMarginMode,
  dangerZones, safeOf, safeRect,
  nudgeBlockZ, moveBlockRelative, blockLayerLabel,
  TEXT_STYLE_DEFAULTS, textLetterSpacingOf, clampLetterSpacing,
  textBorderOf, textBorderColorOf, textShadow3dOf, textShadow3dColorOf,
  textEffectsCss, clampHiliteStyle, hiliteStyleLabel, hiliteBrushCss,
  imgBorderOf, imgBorderColorOf,
  BLOCK_SNAP_PX, collectBlockSnapTargets, collectBlockSnapTargetsX,
  snapBlockY, snapBlockX,
  defaultStoriesLogo, normalizeStoriesLogo,
  rotateOf, snapRotate, setBlockRotate, ROTATE_SNAPS, clampRotate, rotatedBoxCorner,
  tiltOf, setBlockTilt, imgTiltCss, TILT_MAX,
  blockScaleOf, clampBlockScale, blockWidthPx,
  DEFAULT_STICKER_SCALE, clampStickerSymbol, clampStickerKind,
} from './stories-core.js';
import {
  coinIconPath, coinLabel, filterCoinIcons, clampCoinSymbol,
} from './coin-icons.js';

registerUiIcons();

// highlight pincel: máscara SVG com textura (borda irregular + dry-brush)
{
  const st = document.createElement('style');
  st.id = 'stories-hilite-brush';
  st.textContent = hiliteBrushCss();
  document.head.appendChild(st);
}

initAppNav();
initFeedback();

// ─────────────────────────── state ──────────────────────────────────────────
const LS_KEY = 'pdgm-stories-cfg-v1';
const IDB_NAME = 'pdgm-stories';

const state = {
  doc: seedDoc(),
  pageIndex: 0,
  activeId: null,
  sel: null,       // image | sticker block id (painel flutuante)
  zoom: 'fit',     // 'fit' | number 0.1–2
  editing: true,
};

// ── coin SVG cache (export foreignObject exige markup inline) ───────────────
/** @type {Map<string, string|null>} symbol → svg markup (null = falhou) */
const coinSvgCache = new Map();

function fitCoinSvgEl(host) {
  const svg = host?.querySelector?.('svg');
  if (!svg) return;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.display = 'block';
}

async function loadCoinSvg(symbol) {
  const s = clampCoinSymbol(symbol);
  if (coinSvgCache.has(s)) return coinSvgCache.get(s);
  try {
    const res = await fetch(coinIconPath(s));
    if (!res.ok) throw new Error(String(res.status));
    let svg = (await res.text()).replace(/<\?xml[^?]*\?>/i, '').trim();
    // remove doctype se houver
    svg = svg.replace(/<!DOCTYPE[^>]*>/i, '').trim();
    if (!svg.includes('<svg')) throw new Error('not svg');
    coinSvgCache.set(s, svg);
    return svg;
  } catch {
    coinSvgCache.set(s, null);
    return null;
  }
}

/** Preload de todos os stickers token da página (export / re-render). */
async function preloadPageStickers(page) {
  const syms = (page?.blocks || [])
    .filter((b) => b?.type === 'sticker' && clampStickerKind(b.sticker) === 'token')
    .map((b) => clampCoinSymbol(b.symbol));
  await Promise.all([...new Set(syms)].map(loadCoinSvg));
}

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
// ─────────────────────────── shell (header/sidebar/zoom) ────────────────────
/** @type {ReturnType<typeof bindEditorShell>|null} */
let shell = null;
function setSegment(name) { shell?.setSegment(name); }
function updateHistBtns() {
  shell?.setHistEnabled(!!hist.past.length, !!hist.future.length);
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
  shell?.setZoomFitPressed(isFit);
  shell?.syncZoomLabel(pct);
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
function applyTextEffectsToEl(el, b) {
  const fx = textEffectsCss(b);
  el.style.webkitTextStroke = fx.webkitTextStroke || '';
  el.style.textShadow = fx.textShadow || 'none';
  el.style.paintOrder = fx.paintOrder || '';
}

/** Transform do bloco: só rotação plana (posição = left/top em px). */
function blockTransformCss(b) {
  const r = rotateOf(b);
  return r ? `rotate(${r}deg)` : '';
}

/** Aplica transform (+ origin) no DOM do bloco. */
function applyBlockTransform(el, b) {
  if (!el) return;
  const css = blockTransformCss(b);
  el.style.transform = css || '';
  el.style.transformOrigin = css ? 'center center' : '';
}

/** Perspectiva 3D no .img-frame (rotateY) — independente do giro plano do .blk. */
function applyImgTilt(frame, b) {
  if (!frame) return;
  const css = imgTiltCss(b);
  frame.style.transform = css || '';
  frame.style.transformOrigin = css ? 'center center' : '';
}

function buildTextEl(b) {
  const el = document.createElement('div');
  const txtOn = !state.sel && state.activeId === b.id;
  el.className = 'blk text' + (txtOn ? ' active-block' : '');
  el.dataset.id = b.id;
  el.dataset.type = 'text';
  el.dataset.role = 'block'; // fmtbar: miolo (mesmo contrato do diagramador)
  el.style.left = (b.x | 0) + 'px';
  el.style.top = (b.y | 0) + 'px';
  el.style.width = blockScaleOf(b) + '%';
  el.style.right = 'auto';
  el.style.fontSize = (b.size || 24) + 'px';
  // peso base do bloco; negrito inline (B) usa <b>/<strong> por cima
  el.style.fontWeight = String(b.weight || 400);
  el.style.textAlign = b.align || 'left';
  el.style.color = b.color || DEFAULT_TEXT;
  el.style.lineHeight = '1.35';
  // tracking global (⋮ do card Texto) — default −0.03em
  el.style.letterSpacing = textLetterSpacingOf(state.doc) + 'em';
  applyTextEffectsToEl(el, b);
  applyBlockTransform(el, b);
  el.style.webkitUserSelect = 'text';
  el.style.userSelect = 'text';
  if (state.editing) {
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.lang = 'pt-BR';
  }
  el.innerHTML = b.html || '';
  return el;
}

// ── imagem: helpers iguais ao diagramador (escala %, raio, altura por aspect ratio) ──
const IMG_SCALE_STEP = 0.1;
const TRASH_ICO = uiIco('trash', 16, 'outline');
const REPLACE_ICO = uiIco('repeat', 16, 'outline');

function imgScalePct(b) {
  return blockScaleOf(b);
}
function fmtImgScalePct(n) {
  return String(blockScaleOf({ scale: n }));
}
function imgRadiusOf(b) {
  const n = Math.round(+b.radius);
  return Number.isFinite(n) ? Math.max(0, n) : 4;
}
/** Intensidade 0–100 da drop shadow suave no frame da imagem. */
function imgShadowOf(b) {
  const n = Math.round(+b.shadow);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}
/**
 * Sombra sempre suave: blur alto, alpha baixo, offset leve.
 * 0 = nenhuma; 100 = ainda discreta (não “hard shadow”).
 */
function imgShadowCss(t) {
  const p = imgShadowOf({ shadow: t }) / 100;
  if (p <= 0) return 'none';
  const y = 2 + p * 10;
  const blur = 10 + p * 30;
  const alpha = 0.05 + p * 0.14;
  return `0 ${y.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${alpha.toFixed(3)})`;
}
/** Aplica borda no frame (radius do canto já vem do paintRadius). */
function applyImgBorderToFrame(frame, b) {
  if (!frame) return;
  const w = imgBorderOf(b);
  if (w > 0) {
    frame.style.border = `${w}px solid ${imgBorderColorOf(b)}`;
    frame.style.boxSizing = 'border-box';
  } else {
    frame.style.border = 'none';
  }
}
/**
 * Raio só no frame + overflow:hidden clipa o SVG/img.
 * (Não pôr border-radius no miolo — fica mais redondo que a borda.)
 * box-shadow do próprio frame não é cortado pelo overflow:hidden.
 */
function applyImgRadius(frame, b) {
  if (!frame) return;
  frame.style.borderRadius = imgRadiusOf(b) + 'px';
  frame.style.overflow = 'hidden';
  frame.querySelectorAll('img, .img-slot').forEach((node) => {
    node.style.borderRadius = '';
  });
}
/** Largura em px da imagem (scale % da safe). */
function colWidthOf(b) {
  return blockWidthPx(b, state.doc.marginMode);
}
/** altura natural da imagem escalada. */
function imgHeightOf(b) {
  const w = colWidthOf(b);
  if (b.nw && b.nh) return w * (b.nh / b.nw);
  return Math.max(40, b.h | 0) || w * 0.6;
}

function buildImageEl(b) {
  const el = document.createElement('div');
  const imgOn = state.sel === b.id || state.activeId === b.id;
  el.className = 'blk image' + (imgOn ? ' selected imgsel active-block' : '');
  el.dataset.id = b.id;
  el.dataset.type = 'image';
  el.style.left = (b.x | 0) + 'px';
  el.style.top = (b.y | 0) + 'px';
  el.style.right = 'auto';

  const scale = blockScaleOf(b);
  const h = imgHeightOf(b);
  el.style.height = Math.max(40, h) + 'px';
  // escala = % da largura da safe (blocks-layer)
  el.style.width = scale + '%';
  applyBlockTransform(el, b);

  const frame = document.createElement('div');
  frame.className = 'img-frame';
  frame.style.height = '100%';
  frame.style.boxShadow = imgShadowCss(imgShadowOf(b));
  applyImgBorderToFrame(frame, b);
  applyImgTilt(frame, b);

  if (b.src) {
    const img = document.createElement('img');
    img.src = b.src;
    img.alt = '';
    img.draggable = false;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.display = 'block';
    img.style.objectFit = 'cover';
    frame.appendChild(img);
  } else {
    const slot = document.createElement('div');
    slot.className = 'img-slot';
    if (state.editing) {
      slot.textContent = b.chart
        ? (b.chart.kind === 'timeline' ? 'Linha do tempo…' : 'Gráfico…')
        : 'Clique para imagem';
    } else {
      slot.textContent = '';
    }
    frame.appendChild(slot);
  }
  // raio + clip no frame; SVG/img sem border-radius próprio
  applyImgRadius(frame, b);
  el.appendChild(frame);
  return el;
}

/** Altura do sticker = largura (ícone quadrado). */
function stickerHeightOf(b) {
  return Math.max(24, Math.round(blockWidthPx(b, state.doc.marginMode)));
}

function buildStickerEl(b) {
  const el = document.createElement('div');
  const on = state.sel === b.id || state.activeId === b.id;
  el.className = 'blk sticker' + (on ? ' selected imgsel active-block' : '');
  el.dataset.id = b.id;
  el.dataset.type = 'sticker';
  el.dataset.sticker = clampStickerKind(b.sticker);
  el.style.left = (b.x | 0) + 'px';
  el.style.top = (b.y | 0) + 'px';
  el.style.right = 'auto';

  const scale = blockScaleOf(b);
  const h = stickerHeightOf(b);
  el.style.width = scale + '%';
  el.style.height = h + 'px';
  applyBlockTransform(el, b);

  const frame = document.createElement('div');
  frame.className = 'sticker-frame';
  frame.style.width = '100%';
  frame.style.height = '100%';

  const icon = document.createElement('div');
  icon.className = 'sticker-icon';
  icon.setAttribute('aria-hidden', 'true');
  const sym = clampCoinSymbol(b.symbol);
  const cached = coinSvgCache.get(sym);
  if (cached) {
    icon.innerHTML = cached;
    fitCoinSvgEl(icon);
  } else if (cached === null) {
    icon.classList.add('sticker-missing');
    icon.textContent = (b.symbol || '?').toString().slice(0, 4).toUpperCase();
  } else {
    icon.classList.add('sticker-loading');
    loadCoinSvg(sym).then((svg) => {
      const live = pagesEl.querySelector(`.blk.sticker[data-id="${b.id}"] .sticker-icon`);
      if (!live) return;
      live.classList.remove('sticker-loading');
      if (svg) {
        live.innerHTML = svg;
        fitCoinSvgEl(live);
      } else {
        live.classList.add('sticker-missing');
        live.textContent = sym.slice(0, 4).toUpperCase();
      }
    });
  }
  frame.appendChild(icon);
  el.appendChild(frame);
  return el;
}

/**
 * Host único (.blocks-layer = safe area). Freestyle: left/top em px, width = scale %.
 * z-index = stackIndex+1 (array maior = na frente).
 */
function placeBlock(host, b, stackIndex) {
  let el;
  if (b.type === 'image') el = buildImageEl(b);
  else if (b.type === 'sticker') el = buildStickerEl(b);
  else el = buildTextEl(b);
  // build* já setou left/top/width/transform
  if (Number.isFinite(stackIndex)) el.style.zIndex = String(stackIndex + 1);
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

/** Posição/escala do fundo (Fill) — igual applyCoverBgStyles do Diagramador. */
function applyPageBgStyles(el, page) {
  const x = page.bgX ?? 50;
  const y = page.bgY ?? 50;
  const s = (page.bgScale ?? 100) / 100;
  el.style.backgroundPosition = `${x}% ${y}%`;
  el.style.transformOrigin = `${x}% ${y}%`;
  el.style.transform = `scale(${s})`;
}
/** Live nos sliders — não remonta a página. */
function applyPageBgLive() {
  const page = currentPage();
  const bg = pagesEl.querySelector('.story-page .bg-layer');
  if (bg && page?.bgImage) applyPageBgStyles(bg, page);
  // thumb ativo espelha posição/escala
  const thumbBg = stripScroll?.querySelector('.thumb[aria-current="true"] .thumb-bg');
  if (thumbBg && page?.bgImage) applyPageBgStyles(thumbBg, page);
}

function renderStoryPage(page, pageIndex, total) {
  const root = document.createElement('div');
  root.className = 'story-page' + (state.editing ? ' editing' : '');
  root.dataset.page = String(pageIndex);
  const mode = clampMarginMode(state.doc.marginMode);

  const bg = document.createElement('div');
  bg.className = 'bg-layer';
  bg.style.backgroundColor = page.bg || DEFAULT_BG;
  if (page.bgImage) {
    bg.style.backgroundImage = `url(${page.bgImage})`;
    applyPageBgStyles(bg, page);
  }
  root.appendChild(bg);

  // Camada de conteúdo freestyle (x/y/scale). Clique no vazio → menu Texto|Imagem.
  const blocksLayer = document.createElement('div');
  blocksLayer.className = 'blocks-layer';
  applySafeInsets(blocksLayer, mode);
  page.blocks.forEach((b, i) => placeBlock(blocksLayer, b, i));
  root.appendChild(blocksLayer);

  // Logo Paradigma (header dentro da safe / footer centrado nos 55px = 165 export)
  const logoEl = buildStoryLogo(state.doc.logo);
  if (logoEl) root.appendChild(logoEl);

  if (state.doc.showSafe) root.appendChild(buildSafeOverlay());
  if (state.doc.uiPreview) root.appendChild(buildUiOverlay(pageIndex, total));

  return root;
}

// ── logo Paradigma (doc.logo) ────────────────────────────────────────────────
const LOGO_BASE_H = 28; // altura base em size=1 (artboard 360×640)
const LOGO_NONE_ICO =
  '<svg viewBox="0 0 16 16" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">'
  + '<circle cx="8" cy="8" r="5.6"/><line x1="4" y1="12" x2="12" y2="4"/></svg>';

function storyLogoOf() {
  return normalizeStoriesLogo(state.doc.logo);
}

function storyLogoSvg(lg) {
  const L = LOGOS[lg.kind];
  if (!L) return '';
  const h = LOGO_BASE_H * (lg.size || 1);
  const w = h * (L.w / L.h);
  // aceita #hex ou rgba (opacidade do swatch)
  const color = lg.color || '#000000';
  const inner = L.inner.replace(/currentColor/g, color);
  // xmlns: foreignObject (export) parseia como XML — SVG sem namespace some
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${+w.toFixed(1)}" height="${+h.toFixed(1)}"`
    + ` viewBox="0 0 ${L.w} ${L.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;
}

/** Pinta o .colorfield do logo (hex opaco ou checker/paper com alpha). */
function paintLogoColorField(btn, color) {
  if (!btn) return;
  const p = parseColor(color);
  btn.classList.remove('checker', 'paper');
  btn.style.removeProperty('--sp-ov');
  if (p && p.alpha < 1) {
    btn.style.background = '';
    btn.style.setProperty('--sp-ov', withAlpha(p.hex, p.alpha));
    btn.classList.add('paper');
  } else {
    btn.style.background = p?.hex || color || '#000000';
  }
}

/** Faixa header/footer com o logo. null se off. */
function buildStoryLogo(lgRaw) {
  const lg = normalizeStoriesLogo(lgRaw);
  if (!lg.on || !LOGOS[lg.kind]) return null;
  const el = document.createElement('div');
  el.className = 'story-logo ' + (lg.pos === 'footer' ? 'lg-footer' : 'lg-header');
  el.style.justifyContent = lg.align === 'center'
    ? 'center'
    : lg.align === 'right' ? 'flex-end' : 'flex-start';
  // insets laterais = safe margins (sempre)
  const s = safeOf(state.doc.marginMode);
  el.style.left = s.left + 'px';
  el.style.right = s.right + 'px';
  if (lg.pos === 'footer') {
    // fora da safe: centrado na faixa inferior de s.bottom (55 editor / 165 export)
    el.style.top = 'auto';
    el.style.bottom = '0';
    el.style.height = s.bottom + 'px';
  } else {
    // dentro da safe: no topo da área útil
    el.style.top = s.top + 'px';
    el.style.bottom = 'auto';
    el.style.height = 'auto';
    el.style.paddingTop = '4px';
  }
  const hit = document.createElement('div');
  hit.className = 'story-logo-hit';
  hit.innerHTML = storyLogoSvg(lg);
  el.appendChild(hit);
  return el;
}

function applyStoryLogoLive() {
  const root = pagesEl.querySelector('.story-page');
  if (!root) return;
  root.querySelectorAll('.story-logo').forEach((n) => n.remove());
  const logoEl = buildStoryLogo(state.doc.logo);
  if (logoEl) {
    // antes dos overlays de UI/safe se existirem
    const before = root.querySelector('.safe-layer, .ui-layer');
    if (before) root.insertBefore(logoEl, before);
    else root.appendChild(logoEl);
  }
}

function syncLogoUI() {
  const lg = storyLogoOf();
  state.doc.logo = lg;
  const active = lg.on ? lg.kind : 'none';
  document.querySelectorAll('[data-logopick] button[data-logokind]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.logokind === active));
  });
  document.querySelectorAll('[data-logoopts]').forEach((el) => {
    el.hidden = !lg.on;
  });
  const posSlot = document.querySelector('[data-slot="logopos"]');
  const alignSlot = document.querySelector('[data-slot="logoalign"]');
  if (posSlot) {
    posSlot.replaceChildren(widthSeg(lg.pos, [
      { val: 'header', label: 'Cabeçalho', icon: POS_ICON.header },
      { val: 'footer', label: 'Rodapé', icon: POS_ICON.footer },
    ], (v) => {
      state.doc.logo.pos = v === 'footer' ? 'footer' : 'header';
      applyStoryLogoLive();
      save(); scheduleCommit();
      syncLogoUI();
    }));
  }
  if (alignSlot) {
    alignSlot.replaceChildren(widthSeg(lg.align, [
      { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
      { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
      { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
    ], (v) => {
      state.doc.logo.align = v === 'center' || v === 'right' ? v : 'left';
      applyStoryLogoLive();
      save(); scheduleCommit();
      syncLogoUI();
    }));
  }
  paintLogoColorField(document.querySelector('[data-logocolor]'), lg.color || '#000000');
  const sizeRange = document.querySelector('[data-logosize]');
  const sizeVal = document.querySelector('[data-logosizev]');
  if (sizeRange && document.activeElement !== sizeRange) {
    sizeRange.value = String(Math.round((lg.size || 1) * 100));
  }
  if (sizeVal) sizeVal.textContent = (+(lg.size || 1).toFixed(2)) + '×';
}

function renderStrip() {
  const pages = state.doc.pages;
  stripScroll.replaceChildren();
  const canDelete = pages.length > 1;
  pages.forEach((p, i) => {
    // div (não button) — permite botão remover no hover sem button-aninhado
    const card = document.createElement('div');
    card.className = 'thumb';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-current', String(i === state.pageIndex));
    card.title = `Story ${i + 1}`;
    card.tabIndex = 0;

    const bg = document.createElement('span');
    bg.className = 'thumb-bg';
    bg.style.backgroundColor = p.bg || DEFAULT_BG;
    if (p.bgImage) {
      bg.style.backgroundImage = `url(${p.bgImage})`;
      applyPageBgStyles(bg, p);
    }
    const nEl = document.createElement('span');
    nEl.className = 'thumb-n';
    nEl.textContent = String(i + 1);
    card.append(bg, nEl);

    if (canDelete) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'thumb-del';
      del.title = 'Remover story';
      del.setAttribute('aria-label', `Remover story ${i + 1}`);
      del.innerHTML = uiIco('trash', 10, 'outline');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        delPageAt(i);
      });
      card.appendChild(del);
    }

    const open = () => goToPage(i);
    card.addEventListener('click', (e) => {
      if (e.target.closest?.('.thumb-del')) return;
      open();
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    stripScroll.appendChild(card);
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
  const counter = $('pageCounter');
  if (counter) counter.textContent = `${i + 1} / ${n}`;
  const atStart = i <= 0;
  const atEnd = i >= n - 1;
  if ($('btnPrev')) $('btnPrev').disabled = atStart;
  if ($('btnNext')) $('btnNext').disabled = atEnd;

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
  renderLayers();
  syncBlockPanel();
  paintActive();
  // re-ancora alças no bloco focado (DOM novo após replaceChildren)
  showHandleAtFocused();
  positionSelPanel();
  save();
  scheduleCommit();
}

/**
 * Reancora painel flutuante do bloco selecionado.
 * Imagem/sticker: por padrão NÃO reancora — a escala muda o AABB e o slider
 * “escapa” do cursor se o popover acompanhar. Arraste/rotação passam
 * `{ images: true, stickers: true }`. Após soltar a escala: reanchor* com fade.
 */
function positionSelPanel(opts = {}) {
  if (!state.sel) {
    if (state.activeId && blockOf(state.activeId)?.type === 'text') positionTextPanel();
    return;
  }
  const t = blockOf(state.sel)?.type;
  if (t === 'image' && opts.images) positionImgPanel();
  else if (t === 'sticker' && opts.stickers) positionStickerPanel();
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
  // anel de foco no selecionado (imagem/sticker = sel, texto = activeId)
  const focusId = selectedHandleId();
  pagesEl.querySelectorAll('.blk').forEach((el) => {
    const on = el.dataset.id === focusId;
    el.classList.toggle('active-block', on);
    if (el.classList.contains('image') || el.classList.contains('sticker')) {
      el.classList.toggle('selected', on);
      el.classList.toggle('imgsel', on);
    }
  });
  paintLayersSelection();
}

// ─────────────────────────── painel Camadas ─────────────────────────────────
let layersDragId = null;

function selectBlockFromLayer(id) {
  const b = blockOf(id);
  if (!b) return;
  state.activeId = id;
  if (b.type === 'image') {
    state.sel = id;
    setSegment('conteudo');
    openImgPanel();
  } else if (b.type === 'sticker') {
    state.sel = id;
    setSegment('conteudo');
    openStickerPanel();
  } else {
    state.sel = null;
    setSegment('conteudo');
    openTextPanel();
  }
  paintActive();
  showHandleAtFocused();
  paintLayersSelection();
}

function paintLayersSelection() {
  const list = $('layersList');
  if (!list) return;
  const focusId = selectedHandleId();
  list.querySelectorAll('.layer-row').forEach((row) => {
    row.setAttribute('aria-current', String(row.dataset.id === focusId));
  });
}

function clearLayerDropMarks() {
  $('layersList')?.querySelectorAll('.layer-row').forEach((r) => {
    r.classList.remove('drop-before', 'drop-after', 'dragging');
  });
}

function renderLayers() {
  const list = $('layersList');
  if (!list) return;
  const page = currentPage();
  const blocks = page?.blocks || [];
  const focusId = selectedHandleId();
  list.replaceChildren();

  if (!blocks.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Nenhum bloco nesta página.';
    list.appendChild(empty);
    return;
  }

  // Lista: topo = frente (inverso do array de paint)
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.dataset.id = b.id;
    row.dataset.index = String(i);
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-current', String(b.id === focusId));
    row.tabIndex = 0;
    row.title = 'Clique para selecionar · arraste para reordenar';

    const grip = document.createElement('span');
    grip.className = 'layer-grip';
    grip.draggable = true;
    grip.title = 'Arraste para reordenar';
    grip.setAttribute('aria-label', 'Arraste para reordenar');
    grip.innerHTML = uiIco('reorder-three', 12, 'solid');
    grip.addEventListener('dragstart', (e) => {
      layersDragId = b.id;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', b.id);
    });
    grip.addEventListener('dragend', () => {
      layersDragId = null;
      clearLayerDropMarks();
    });

    const ico = document.createElement('span');
    ico.className = 'layer-ico';
    ico.setAttribute('aria-hidden', 'true');
    if (b.type === 'image') {
      ico.innerHTML = b.chart
        ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2v12h12"/><rect x="4.2" y="8" width="2" height="4" fill="currentColor" stroke="none"/><rect x="7.2" y="5.5" width="2" height="6.5" fill="currentColor" stroke="none"/><rect x="10.2" y="3.5" width="2" height="8.5" fill="currentColor" stroke="none"/></svg>'
        : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.6" cy="6.4" r="1"/><path d="M3 12l3.4-3.2 2.4 2.2 2.2-2 2 1.8"/></svg>';
    } else if (b.type === 'sticker') {
      ico.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.5"/><path d="M8 5.2v5.6M6.4 6.8h2.6a1.2 1.2 0 0 1 0 2.4H6.4"/></svg>';
    } else {
      ico.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4V3h10v1M8 3v10M6 13h4"/></svg>';
    }

    const lab = document.createElement('span');
    lab.className = 'layer-label';
    lab.textContent = blockLayerLabel(b);

    const moves = document.createElement('div');
    moves.className = 'layer-moves';
    const btnFront = document.createElement('button');
    btnFront.type = 'button';
    btnFront.className = 'layer-nudge';
    btnFront.title = 'Trazer para frente';
    btnFront.setAttribute('aria-label', 'Trazer para frente');
    btnFront.textContent = '▲';
    btnFront.disabled = i >= blocks.length - 1;
    btnFront.addEventListener('click', (e) => {
      e.stopPropagation();
      commit();
      nudgeBlockZ(page.blocks, b.id, 1);
      render();
    });
    const btnBack = document.createElement('button');
    btnBack.type = 'button';
    btnBack.className = 'layer-nudge';
    btnBack.title = 'Enviar para trás';
    btnBack.setAttribute('aria-label', 'Enviar para trás');
    btnBack.textContent = '▼';
    btnBack.disabled = i <= 0;
    btnBack.addEventListener('click', (e) => {
      e.stopPropagation();
      commit();
      nudgeBlockZ(page.blocks, b.id, -1);
      render();
    });
    moves.append(btnFront, btnBack);

    row.addEventListener('click', (e) => {
      if (e.target.closest('.layer-nudge, .layer-grip')) return;
      selectBlockFromLayer(b.id);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectBlockFromLayer(b.id);
      }
    });

    // Drop: metade de cima da linha = na frente do alvo; baixo = atrás
    row.addEventListener('dragover', (e) => {
      if (!layersDragId || layersDragId === b.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = row.getBoundingClientRect();
      clearLayerDropMarks();
      row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      const dragRow = list.querySelector(`.layer-row[data-id="${layersDragId}"]`);
      if (dragRow) dragRow.classList.add('dragging');
    });
    row.addEventListener('drop', (e) => {
      if (!layersDragId || layersDragId === b.id) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const place = e.clientY < r.top + r.height / 2 ? 'front' : 'back';
      const fromId = layersDragId;
      layersDragId = null;
      clearLayerDropMarks();
      commit();
      moveBlockRelative(page.blocks, fromId, b.id, place);
      render();
    });

    row.append(grip, ico, lab, moves);
    list.appendChild(row);
  }
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
/** Remove a página no índice `i` (com confirmação). */
function delPageAt(i) {
  const pages = state.doc.pages;
  if (pages.length <= 1) return;
  const idx = clampPageIndex(i, pages.length);
  if (!confirm(`Remover o story ${idx + 1}?`)) return;
  commit();
  pages.splice(idx, 1);
  if (idx < state.pageIndex) state.pageIndex -= 1;
  state.pageIndex = clampPageIndex(state.pageIndex, pages.length);
  state.activeId = null;
  state.sel = null;
  closeImgPanel();
  closeTextPanel();
  closeStickerPanel();
  hideHandles();
  render();
  toast('Story removido');
}

// ─────────────────────────── blocos ─────────────────────────────────────────
/** Altura estimada p/ empilhar blocos novos. */
function blockStackH(b) {
  if (!b) return 80;
  if (b.type === 'image' || b.type === 'sticker') return Math.max(24, b.h | 0) || 80;
  return 80;
}

/** @param {'text'|'image'|'chart'|'sticker'} type @param {string|null} [afterId] */
function addBlock(type, afterId = null) {
  const page = currentPage();
  // gráfico: cria placeholder imagem+chart e abre o modal (spec chega via postMessage)
  const isChart = type === 'chart';
  const isSticker = type === 'sticker';
  const b = mkBlock(isChart ? 'chart' : type);
  const safe = safeRect(state.doc.marginMode);
  let y = 0;
  if (afterId) {
    const after = page.blocks.find((x) => x.id === afterId);
    if (after) y = (after.y | 0) + blockStackH(after) + 24;
  } else {
    for (const p of page.blocks) {
      y = Math.max(y, (p.y | 0) + blockStackH(p) + 24);
    }
  }
  b.x = 0;
  b.y = Math.min(y, Math.max(0, safe.h - 120));
  if (type === 'text') b.html = '';
  if (isSticker) {
    // centraliza o ícone na safe (scale default 28%)
    const w = blockWidthPx(b, state.doc.marginMode);
    b.x = Math.max(0, Math.round((safe.w - w) / 2));
    b.h = stickerHeightOf(b);
  }
  page.blocks.push(b);
  state.activeId = b.id;
  state.sel = (type === 'image' || isChart || isSticker) ? b.id : null;
  hideBadd();
  closeColAddMenu();
  render();
  if (isChart) {
    chartEditId = b.id;
    openChartModal('chart', null);
    return;
  }
  if (isSticker) {
    openStickerPanel();
    return;
  }
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

// ── modal do gráfico (iframe graficos.html?embed=1) ─────────────────────────
// Mesmo protocolo do Diagramador: pdgm-chart-ready / load / svg / ok / fail.
// into=story → label "Importar para o Story" (graficos/timelines leem o query)
const EDITOR_URL = {
  chart: 'graficos.html?embed=1&into=story',
  timeline: 'timelines.html?embed=1&into=story',
};
let chartEditId = null;
let cmKind = null, cmReady = false, cmPending = null;

function openChartModal(kind = 'chart', spec = null) {
  const chartModal = $('chartModal');
  const cmFrame = $('cmFrame');
  if (!chartModal || !cmFrame) return;
  if (cmKind !== kind) {
    cmKind = kind;
    cmReady = false;
    cmFrame.src = EDITOR_URL[kind] || EDITOR_URL.chart;
  }
  cmPending = spec;
  if (cmReady) sendPendingSpec();
  const title = $('cmTitle');
  if (title) {
    title.textContent = kind === 'timeline' ? 'Montar linha do tempo' : 'Extrair / montar gráfico';
  }
  chartModal.hidden = false;
}
function sendPendingSpec() {
  const cmFrame = $('cmFrame');
  if (!cmPending || !cmFrame?.contentWindow) return;
  cmFrame.contentWindow.postMessage(
    { type: 'pdgm-chart-load', spec: cmPending },
    location.origin,
  );
  cmPending = null;
}
function closeChartModal() {
  const chartModal = $('chartModal');
  if (chartModal) chartModal.hidden = true;
  // se o placeholder de gráfico ficou sem src (usuário cancelou), remove
  if (chartEditId) {
    const b = blockOf(chartEditId);
    if (b && b.chart && !b.src) {
      const page = pageOfBlock(chartEditId);
      if (page) {
        const i = page.blocks.findIndex((x) => x.id === chartEditId);
        if (i >= 0) page.blocks.splice(i, 1);
        if (state.sel === chartEditId) state.sel = null;
        if (state.activeId === chartEditId) state.activeId = null;
        render();
      }
    }
  }
  chartEditId = null;
}

function wireChartModal() {
  const chartModal = $('chartModal');
  if (!chartModal) return;
  $('cmClose')?.addEventListener('click', closeChartModal);
  chartModal.querySelector('.cm-backdrop')?.addEventListener('click', closeChartModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !chartModal.hidden) closeChartModal();
  });
  addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data;
    if (d?.type === 'pdgm-chart-ready') {
      cmReady = true;
      sendPendingSpec();
      return;
    }
    if (!d || d.type !== 'pdgm-chart-svg' || !d.svg) return;
    try {
      const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg);
      const chart = d.spec ? { kind: d.kind || 'chart', spec: d.spec } : null;
      const editing = chartEditId && blockOf(chartEditId);
      if (editing) {
        editing.src = src;
        if (d.w) editing.nw = d.w;
        if (d.h) editing.nh = d.h;
        // altura no canvas de trabalho (proporcional)
        if (d.w && d.h) {
          const colW = colWidthOf(editing);
          editing.h = Math.round(colW * (d.h / d.w));
        }
        if (chart) editing.chart = chart;
        state.sel = editing.id;
        state.activeId = editing.id;
      } else {
        // fallback: cria bloco se não havia placeholder
        const page = currentPage();
        const b = mkBlock('chart');
        b.src = src;
        b.nw = d.w || 640;
        b.nh = d.h || 400;
        if (b.nw && b.nh) {
          const colW = colWidthOf(b);
          b.h = Math.round(colW * (b.nh / b.nw));
        }
        if (chart) b.chart = chart;
        page.blocks.push(b);
        state.sel = b.id;
        state.activeId = b.id;
      }
      chartEditId = null;
      closeChartModal();
      e.source?.postMessage({ type: 'pdgm-chart-ok' }, e.origin);
      render();
      openImgPanel();
      toast((d.kind === 'timeline' ? 'Linha do tempo' : 'Gráfico') + ' adicionado');
      save(); scheduleCommit();
    } catch (err) {
      e.source?.postMessage(
        { type: 'pdgm-chart-fail', error: String(err.message || err) },
        e.origin,
      );
      console.error(err);
      toast('Falha ao importar gráfico', true);
    }
  });
}

// menu Texto | Imagem — no + do bloco, ou no clique no vazio da página
let colAddCtx = null; // { afterId, anchor }
function closeColAddMenu() {
  const m = $('colAddMenu');
  if (m) m.hidden = true;
  colAddCtx = null;
}
/**
 * @param {Element|null} anchor  — ancora visual (badd); null se posicionar em `at`
 * @param {string|null} [afterId]
 * @param {{ x:number, y:number }|null} [at] — viewport coords (clique no vazio)
 */
function openColAddMenu(anchor, afterId = null, at = null) {
  const m = $('colAddMenu');
  if (!m) return;
  if (!anchor && !at) return;
  colAddCtx = { afterId, anchor };
  m.hidden = false;
  const mw = m.offsetWidth || 140, mh = m.offsetHeight || 80;
  let x, y;
  if (at) {
    x = at.x - mw / 2;
    y = at.y + 8;
  } else {
    const r = anchor.getBoundingClientRect();
    x = r.left + (r.width - mw) / 2;
    y = r.bottom + 6;
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  }
  x = Math.min(Math.max(8, x), innerWidth - mw - 8);
  if (at && y + mh > innerHeight - 8) y = Math.max(8, at.y - mh - 8);
  m.style.left = x + 'px';
  m.style.top = y + 'px';
}

// ── alças Notion — módulo real ui-handles.js (só no bloco selecionado) ─────
const handles = createBlockHandles({
  onMenuAction({ action, id }) {
    if (action === 'dup') duplicateBlock(id);
    else if (action === 'del') removeBlock(id);
  },
  onAddClick({ id }) {
    if (!id) return;
    openColAddMenu(handles.badd, id);
  },
  onHandlePointerDown({ id }) {
    const b = blockOf(id);
    if (!b) return;
    state.activeId = id;
    if (b.type === 'image') {
      state.sel = id;
      setSegment('conteudo');
      openImgPanel();
    } else if (b.type === 'sticker') {
      state.sel = id;
      setSegment('conteudo');
      openStickerPanel();
    } else {
      state.sel = null;
      setSegment('conteudo');
      openTextPanel();
    }
    paintActive();
  },
});
const baddEl = handles.badd;
const bhandleEl = handles.bhandle;
const bmenuEl = handles.bmenu;
const HANDLE_DRAG_PX = HANDLE_GEOM.DRAG_PX;

function hideHandles() {
  handles.hide();
  hideRotateHandle();
}
function hideBadd() { hideHandles(); }
function closeBlockMenu() { handles.closeMenu(); }
function openBlockMenu(id, anchorEl) { handles.openMenu(id, anchorEl); }

// ── alça de rotação (canto superior direito do card, acompanha o ângulo) ────
const brotateEl = (() => {
  let el = document.getElementById('brotate');
  if (!el) {
    el = document.createElement('button');
    el.id = 'brotate';
    el.type = 'button';
    el.hidden = true;
    el.title = 'Arrastar para girar · ímã em 0°/15°/45°/90°… · Shift = livre';
    el.setAttribute('aria-label', 'Girar bloco');
    el.innerHTML =
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">'
      + '<path d="M12.5 7A4.5 4.5 0 1 0 8 11.5" fill="none" stroke="currentColor" '
      + 'stroke-width="1.6" stroke-linecap="round"/>'
      + '<path d="M12.5 4.2v2.8h-2.8" fill="none" stroke="currentColor" '
      + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>';
    document.body.appendChild(el);
  }
  return el;
})();
const brotateBadge = (() => {
  let el = document.getElementById('brotate-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'brotate-badge';
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
})();

/** @type {{ id: string, el: Element, cx: number, cy: number, startPointer: number, startRotate: number }|null} */
let rotateDrag = null;

/** Escala viewport do artboard (#pages) — offsetWidth×scale = px na tela. */
function pagesViewportScale() {
  const r = pagesEl.getBoundingClientRect();
  return r.width > 0 ? r.width / PAGE_W : 1;
}

/**
 * Centro visual + canto TR rotacionado do bloco (coords viewport).
 * Centro do AABB = centro do card (origin center). Metades usam layout×zoom.
 */
function blockRotateAnchor(el, b) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const z = pagesViewportScale();
  const halfW = (el.offsetWidth * z) / 2;
  const halfH = (el.offsetHeight * z) / 2;
  const deg = rotateOf(b);
  // pad ~10px para fora do canto (anel de foco + hit confortável)
  const tr = rotatedBoxCorner(cx, cy, halfW, halfH, deg, 'tr', 10 * z);
  return { cx, cy, halfW, halfH, deg, x: tr.x, y: tr.y };
}

function positionRotateChrome(el, b, { badge = false, free = false } = {}) {
  const a = blockRotateAnchor(el, b);
  brotateEl.style.left = a.x + 'px';
  brotateEl.style.top = a.y + 'px';
  brotateEl.hidden = false;
  if (badge) {
    // badge um pouco além do handle, na mesma direção do canto
    const outward = rotatedBoxCorner(a.cx, a.cy, a.halfW, a.halfH, a.deg, 'tr', 28 * pagesViewportScale());
    brotateBadge.style.left = outward.x + 'px';
    brotateBadge.style.top = outward.y + 'px';
    brotateBadge.hidden = false;
    const shown = rotateOf(b);
    const label = Number.isInteger(shown) ? String(shown) : String(+shown.toFixed(1));
    brotateBadge.textContent = label + '°';
    brotateBadge.classList.toggle(
      'is-snap',
      !free && ROTATE_SNAPS.some((s) => s === shown),
    );
  } else {
    brotateBadge.hidden = true;
  }
  return a;
}

function hideRotateHandle() {
  brotateEl.hidden = true;
  brotateBadge.hidden = true;
  delete brotateEl.dataset.id;
}

function placeRotateHandle() {
  if (!state.editing) return hideRotateHandle();
  // durante o gesto de girar, moveRotateDrag manda na posição
  if (rotateDrag) return;
  const t = focusedHandleTarget();
  if (!t?.el) return hideRotateHandle();
  const b = blockOf(t.id);
  if (!b) return hideRotateHandle();
  if (t.el.offsetWidth < 4 || t.el.offsetHeight < 4) return hideRotateHandle();
  positionRotateChrome(t.el, b, { badge: false });
  brotateEl.dataset.id = t.id;
}

function pointerAngleAt(cx, cy, clientX, clientY) {
  return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
}

function startRotateDrag(id, clientX, clientY, pointerId) {
  const b = blockOf(id);
  if (!b) return;
  const el = pagesEl.querySelector(`.blk[data-id="${id}"]`);
  if (!el) return;
  // centro estável do gesture (AABB center = visual center com origin center)
  const a = blockRotateAnchor(el, b);
  rotateDrag = {
    id,
    el,
    cx: a.cx,
    cy: a.cy,
    startPointer: pointerAngleAt(a.cx, a.cy, clientX, clientY),
    startRotate: rotateOf(b),
  };
  document.body.classList.add('rotating-block');
  positionRotateChrome(el, b, { badge: true, free: false });
  try { brotateEl.setPointerCapture(pointerId); } catch { /* already captured */ }
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ shiftKey?: boolean }} [mods]
 */
function moveRotateDrag(clientX, clientY, mods = {}) {
  if (!rotateDrag) return;
  const b = blockOf(rotateDrag.id);
  if (!b) return;
  const el = rotateDrag.el?.isConnected
    ? rotateDrag.el
    : pagesEl.querySelector(`.blk[data-id="${rotateDrag.id}"]`);
  if (!el) return;
  rotateDrag.el = el;
  // centro fixo do gesture (AABB muda de tamanho com a rotação)
  const cur = pointerAngleAt(rotateDrag.cx, rotateDrag.cy, clientX, clientY);
  let next = rotateDrag.startRotate + (cur - rotateDrag.startPointer);
  const free = !!mods.shiftKey;
  // Shift = sem ímã (qualquer ângulo); senão snap em 0/15/45/90…
  next = free ? clampRotate(next) : snapRotate(next);
  setBlockRotate(b, next);
  applyBlockTransform(el, b);
  // handle cola no canto TR do card rotacionado
  positionRotateChrome(el, b, { badge: true, free });
  // alças Notion + painéis
  handles.placeAtElement(el, rotateDrag.id);
  positionSelPanel({ images: true, stickers: true });
}

function endRotateDrag() {
  if (!rotateDrag) return;
  rotateDrag = null;
  document.body.classList.remove('rotating-block');
  brotateBadge.hidden = true;
  save();
  scheduleCommit();
  showHandleAtFocused();
  positionSelPanel({ images: true, stickers: true });
}

brotateEl.addEventListener('pointerdown', (e) => {
  if (!state.editing) return;
  const id = brotateEl.dataset.id || selectedHandleId();
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  closeBlockMenu();
  startRotateDrag(id, e.clientX, e.clientY, e.pointerId);
});
// duplo clique na alça → zera rotação
brotateEl.addEventListener('dblclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const id = brotateEl.dataset.id || selectedHandleId();
  const b = blockOf(id);
  if (!b) return;
  setBlockRotate(b, 0);
  const el = pagesEl.querySelector(`.blk[data-id="${id}"]`);
  if (el) applyBlockTransform(el, b);
  save();
  scheduleCommit();
  placeRotateHandle();
});

/** Id do bloco com alças: só o selecionado (Stories não segue hover). */
function selectedHandleId() {
  if (state.sel) {
    const t = blockOf(state.sel)?.type;
    if (t === 'image' || t === 'sticker') return state.sel;
  }
  if (state.activeId && blockOf(state.activeId)) return state.activeId;
  return null;
}
function focusedHandleTarget() {
  const id = selectedHandleId();
  if (!id) return null;
  const el = pagesEl.querySelector(`.blk[data-id="${id}"]`);
  return el ? { el, id } : null;
}
function placeHandle(_t) {
  if (!state.editing) return hideHandles();
  const t = focusedHandleTarget();
  if (!t?.el) return hideHandles();
  handles.placeAtElement(t.el, t.id);
  placeRotateHandle();
}
function placeHandles(_blkEl) { showHandleAtFocused(); }
function showHandleAtFocused() {
  if (drag || rotateDrag || handles.handlePending) return;
  placeHandle(focusedHandleTarget());
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
  if (!page.blocks.length) page.blocks.push(mkBlock('text'));
  if (state.activeId === id) state.activeId = page.blocks[Math.min(i, page.blocks.length - 1)]?.id || null;
  if (state.sel === id) state.sel = null;
  closeImgPanel();
  closeTextPanel();
  closeStickerPanel();
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
  const h = blockStackH(src);
  copy.y = Math.min((src.y | 0) + h + 16, Math.max(0, safeRect(state.doc.marginMode).h - 40));
  page.blocks.splice(i + 1, 0, copy);
  state.activeId = copy.id;
  state.sel = (copy.type === 'image' || copy.type === 'sticker') ? copy.id : null;
  closeBlockMenu();
  render();
  if (copy.type === 'image') openImgPanel();
  else if (copy.type === 'sticker') openStickerPanel();
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

// ── painel flutuante da imagem/gráfico ─────────────────────────────────────
// Escala: pinado durante o arraste do slider; reancora com fade ao soltar
// (mesmo contrato do sticker — o AABB muda e o thumb não pode “escapar”).
let imgPanel = $('imgPanel');
let imgReanchorTok = 0;
const FLOAT_PANEL_FADE_MS = 140;

function closeImgPanel() {
  if (!imgPanel) return;
  imgReanchorTok += 1;
  imgPanel.classList.remove('is-fading');
  imgPanel.hidden = true;
  delete imgPanel.dataset.forId;
}

/** Alvo left/top do popover de imagem (ao lado do bloco). */
function imgPanelTargetPos() {
  if (!imgPanel || !state.sel) return null;
  const el = pagesEl.querySelector(`.blk.image[data-id="${state.sel}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const pw = imgPanel.offsetWidth || 232;
  const ph = imgPanel.offsetHeight || 280;
  let x = r.right + 10;
  if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  return { x, y };
}

function positionImgPanel() {
  if (!imgPanel || imgPanel.hidden) return;
  const p = imgPanelTargetPos();
  if (!p) return;
  imgPanel.style.left = p.x + 'px';
  imgPanel.style.top = p.y + 'px';
}

/** Fade out → move → fade in (só no commit da escala / reset). */
function reanchorImgPanel() {
  if (!imgPanel || imgPanel.hidden) return;
  const next = imgPanelTargetPos();
  if (!next) return;
  const curX = parseFloat(imgPanel.style.left);
  const curY = parseFloat(imgPanel.style.top);
  if (!Number.isFinite(curX) || !Number.isFinite(curY)) {
    positionImgPanel();
    return;
  }
  if (Math.abs(curX - next.x) < 1 && Math.abs(curY - next.y) < 1) return;

  const tok = ++imgReanchorTok;
  imgPanel.classList.add('is-fading');
  window.setTimeout(() => {
    if (tok !== imgReanchorTok || !imgPanel || imgPanel.hidden) return;
    const p = imgPanelTargetPos() || next;
    imgPanel.style.left = p.x + 'px';
    imgPanel.style.top = p.y + 'px';
    void imgPanel.offsetWidth;
    requestAnimationFrame(() => {
      if (tok !== imgReanchorTok || !imgPanel) return;
      imgPanel.classList.remove('is-fading');
    });
  }, FLOAT_PANEL_FADE_MS);
}

function openImgPanel() {
  const b = blockOf(state.sel);
  if (!b || b.type !== 'image') return closeImgPanel();
  closeTextPanel();
  closeStickerPanel();
  if (!imgPanel) {
    imgPanel = document.createElement('div');
    imgPanel.id = 'imgPanel';
    imgPanel.className = 'float-panel';
    document.body.appendChild(imgPanel);
  }
  // mesma seleção já aberta: mantém left/top (escala não empurra o slider)
  const keepPos = !imgPanel.hidden && imgPanel.dataset.forId === b.id;
  const radius = imgRadiusOf(b);
  const RADIUS_SLIDER_MAX = 24;
  const scalePct = blockScaleOf(b);
  const scaleLabel = fmtImgScalePct(scalePct);

  const shadow = imgShadowOf(b);
  const border = imgBorderOf(b);
  const borderColor = imgBorderColorOf(b);
  const rot = rotateOf(b);
  const tilt = tiltOf(b);
  // ímãs do slider = mesmos do handle (0/15/45/90…)
  const rotateSnaps = ROTATE_SNAPS.join(',');
  const chartKind = b.chart
    ? (b.chart.kind === 'timeline' ? 'timeline' : 'chart')
    : null;
  const titleEyebrow = chartKind === 'timeline' ? 'Linha do tempo' : chartKind ? 'Gráfico' : 'Imagem';
  const editChartBtn = chartKind
    ? `<button type="button" class="fieldbtn" data-a="chart">${uiIco('create', 16, 'outline')}<span>Editar dados</span></button>`
    : '';
  const replaceBtn = chartKind
    ? ''
    : `<button type="button" class="fieldbtn" data-a="replace">${REPLACE_ICO}<span>Substituir</span></button>`;
  imgPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">${titleEyebrow}</div>
    <label class="field"><span class="field-row">Escala <span class="field-val"><span data-role="scalev">${scaleLabel}</span>%<button type="button" class="resetbtn" data-a="scalereset" title="Redefinir para 100% (largura total)">↺</button></span></span>
      <input type="range" data-a="scale" min="10" max="100" step="${IMG_SCALE_STEP}" value="${scalePct}" data-snaps="10,25,50,75,100">
    </label>
    <label class="field" title="Giro plano do bloco (mesmo da alça). Digite o ângulo ou arraste; Shift = sem ímã"><span class="field-row">Rotação <span class="field-val"><span data-role="rotatev">${rot}</span>°<button type="button" class="resetbtn" data-a="rotatereset" title="Sem rotação">↺</button></span></span>
      <input type="range" data-a="rotate" min="-180" max="180" step="1" value="${rot}" data-snaps="${rotateSnaps}">
    </label>
    <label class="field" title="Inclinação em perspectiva (CSS rotateY)"><span class="field-row">Eixo Z <span class="field-val"><span data-role="tiltv">${tilt}</span>°<button type="button" class="resetbtn" data-a="tiltreset" title="Sem perspectiva">↺</button></span></span>
      <input type="range" data-a="tilt" min="${-TILT_MAX}" max="${TILT_MAX}" step="1" value="${tilt}" data-snaps="${-TILT_MAX},-45,-30,-15,0,15,30,45,${TILT_MAX}">
    </label>
    <label class="field"><span class="field-row">Cantos (raio) <span class="field-val"><span data-role="radv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric" title="Clique para digitar">${radius}</span>px<button type="button" class="resetbtn" data-a="radiusreset" title="Redefinir para 4px">↺</button></span></span>
      <input type="range" data-a="radius" min="0" max="${RADIUS_SLIDER_MAX}" step="1" value="${Math.min(radius, RADIUS_SLIDER_MAX)}" data-snaps="0,4,8,12,16,24" data-edit="off" data-edit-max="${Math.floor(PAGE_W / 2)}">
    </label>
    <label class="field"><span class="field-row">Borda <span class="field-val"><span data-role="borderv">${border}px</span><button type="button" class="resetbtn" data-a="borderreset" title="Sem borda">↺</button></span></span>
      <input type="range" data-a="border" min="0" max="24" step="1" value="${border}" data-snaps="0,2,4,8,12,24">
    </label>
    <label class="field">Cor da borda
      <button type="button" class="colorfield" data-a="bordercolor" title="Cor da borda" aria-label="Cor da borda" style="background:${borderColor}"></button>
    </label>
    <label class="field"><span class="field-row">Sombra <span class="field-val"><span data-role="shadowv">${shadow}</span><button type="button" class="resetbtn" data-a="shadowreset" title="Sem sombra">↺</button></span></span>
      <input type="range" data-a="shadow" min="0" max="100" step="1" value="${shadow}" data-snaps="0,25,50,75,100">
    </label>
    ${editChartBtn}
    ${replaceBtn}
    <button type="button" class="fieldbtn danger" data-a="del">${TRASH_ICO}<span>Remover</span></button>`;
  imgPanel.hidden = false;
  imgPanel.dataset.forId = b.id;

  const liveEl = () => pagesEl.querySelector(`.blk.image[data-id="${b.id}"]`);
  const paintRadius = (n, { syncText = true } = {}) => {
    b.radius = n;
    applyImgRadius(liveEl()?.querySelector('.img-frame'), b);
    const radv = imgPanel.querySelector('[data-role="radv"]');
    if (syncText && radv && document.activeElement !== radv) radv.textContent = String(n);
    const range = imgPanel.querySelector('input[data-a="radius"]');
    if (range) range.value = String(Math.min(n, RADIUS_SLIDER_MAX));
    save(); scheduleCommit();
  };
  // escala: só mexe no bloco — popover pinado até o change/reset
  const paintScale = (pct) => {
    b.scale = clampBlockScale(pct);
    b.h = Math.round(imgHeightOf(b));
    const scalev = imgPanel.querySelector('[data-role="scalev"]');
    if (scalev) scalev.textContent = fmtImgScalePct(b.scale);
    // reflow ao vivo: width/height; left = b.x (freestyle)
    const el = liveEl();
    if (el) {
      el.style.width = b.scale + '%';
      el.style.height = Math.max(40, imgHeightOf(b)) + 'px';
      el.style.left = (b.x | 0) + 'px';
      el.style.right = 'auto';
      applyBlockTransform(el, b);
    }
    save(); scheduleCommit();
    placeRotateHandle();
  };
  const paintShadow = (n) => {
    b.shadow = imgShadowOf({ shadow: n });
    const el = liveEl();
    const frame = el?.querySelector('.img-frame');
    if (frame) frame.style.boxShadow = imgShadowCss(b.shadow);
    const shadowv = imgPanel.querySelector('[data-role="shadowv"]');
    if (shadowv) shadowv.textContent = String(b.shadow);
    const range = imgPanel.querySelector('input[data-a="shadow"]');
    if (range && document.activeElement !== range) range.value = String(b.shadow);
    save(); scheduleCommit();
  };
  const paintBorder = (n) => {
    const w = imgBorderOf({ border: n });
    if (w > 0) b.border = w;
    else delete b.border;
    const frame = liveEl()?.querySelector('.img-frame');
    applyImgBorderToFrame(frame, b);
    const v = imgPanel.querySelector('[data-role="borderv"]');
    if (v) v.textContent = w + 'px';
    const range = imgPanel.querySelector('input[data-a="border"]');
    if (range && document.activeElement !== range) range.value = String(w);
    save(); scheduleCommit();
  };
  const paintTilt = (n) => {
    setBlockTilt(b, n);
    const t = tiltOf(b);
    const el = liveEl();
    applyImgTilt(el?.querySelector('.img-frame'), b);
    const v = imgPanel.querySelector('[data-role="tiltv"]');
    if (v) v.textContent = String(t);
    const range = imgPanel.querySelector('input[data-a="tilt"]');
    if (range && document.activeElement !== range) range.value = String(t);
    save(); scheduleCommit();
    // AABB muda com o tilt — alça de rotação acompanha; painel só no commit do range
    placeRotateHandle();
  };
  // rotação plana (mesmo da alça). ímã no arraste; digitação e Shift = livre
  // (sem free, digitar 3 colava em 0 por ROTATE_SNAP_THRESH=4)
  const paintRotate = (n) => {
    const range = imgPanel.querySelector('input[data-a="rotate"]');
    const free = isFreeSnap(range);
    setBlockRotate(b, free ? clampRotate(n) : snapRotate(n));
    const r = rotateOf(b);
    const v = imgPanel.querySelector('[data-role="rotatev"]');
    if (v && document.activeElement !== v) v.textContent = String(r);
    if (range && document.activeElement !== range) range.value = String(r);
    const el = liveEl();
    if (el) applyBlockTransform(el, b);
    save(); scheduleCommit();
    placeRotateHandle();
  };

  imgPanel.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });

  // raio: data-edit=off (max digitável > max do slider). wireFieldEditKeys cobre
  // clique no número → foco + Enter aplica (sem quebrar linha) + Escape cancela.
  const radv = imgPanel.querySelector('[data-role="radv"]');
  const parseRadius = (raw) => {
    const n = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(Math.floor(PAGE_W / 2), n));
  };
  if (radv) {
    wireFieldEditKeys(radv, {
      onInput: (raw) => {
        const n = parseRadius(raw);
        if (n == null) return;
        paintRadius(n, { syncText: false });
      },
      onCommit: (raw) => {
        const n = parseRadius(raw);
        paintRadius(n == null ? imgRadiusOf(b) : n, { syncText: true });
        radv.textContent = String(imgRadiusOf(b));
      },
      onCancel: () => {
        radv.textContent = String(imgRadiusOf(b));
        paintRadius(imgRadiusOf(b), { syncText: true });
      },
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
        const range = imgPanel.querySelector('input[data-a="scale"]');
        if (range) range.value = '100';
        reanchorImgPanel();
        return;
      }
      if (a === 'rotate') { paintRotate(+el.value); return; }
      if (a === 'rotatereset') {
        paintRotate(0);
        const range = imgPanel.querySelector('input[data-a="rotate"]');
        if (range) range.value = '0';
        reanchorImgPanel();
        return;
      }
      if (a === 'shadow') { paintShadow(+el.value); return; }
      if (a === 'shadowreset') { paintShadow(0); return; }
      if (a === 'border') { paintBorder(+el.value); return; }
      if (a === 'borderreset') { paintBorder(0); return; }
      if (a === 'tilt') { paintTilt(+el.value); return; }
      if (a === 'tiltreset') {
        paintTilt(0);
        reanchorImgPanel();
        return;
      }
      if (a === 'chart') {
        chartEditId = b.id;
        closeImgPanel();
        openChartModal(b.chart?.kind || 'chart', b.chart?.spec || null);
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
  imgPanel.querySelector('[data-a="bordercolor"]')?.addEventListener('click', (e) => {
    const cf = e.currentTarget;
    openSwatchPop(cf, (c) => {
      const p = parseColor(c);
      b.borderColor = p ? p.hex : (c || '#FFFFFF');
      cf.style.background = b.borderColor;
      if (!imgBorderOf(b)) paintBorder(2); // liga borda se só escolheu cor
      else {
        applyImgBorderToFrame(liveEl()?.querySelector('.img-frame'), b);
        save(); scheduleCommit();
      }
    }, imgBorderColorOf(b), { opacity: false });
  });
  // soltar o thumb da escala: commit + reancora com fade (pinado no input)
  imgPanel.querySelector('input[data-a="scale"]')?.addEventListener('change', () => {
    b.h = Math.round(imgHeightOf(b));
    save(); scheduleCommit();
    reanchorImgPanel();
  });
  // soltar rotação / tilt: AABB mudou — reancora com o mesmo fade
  imgPanel.querySelector('input[data-a="rotate"]')?.addEventListener('change', () => {
    reanchorImgPanel();
  });
  imgPanel.querySelector('input[data-a="tilt"]')?.addEventListener('change', () => {
    reanchorImgPanel();
  });

  if (!keepPos) positionImgPanel();
}

// ── painel flutuante do STICKER (token: picker de ícones + escala) ───────────
let stickerPanel = $('stickerPanel');
let stickerSearchQ = '';
/** Token p/ cancelar fade de reancoragem se o painel fechar / reancorar de novo. */
let stickerReanchorTok = 0;

function closeStickerPanel() {
  if (!stickerPanel) return;
  stickerReanchorTok += 1; // cancela fade em andamento
  stickerPanel.classList.remove('is-fading');
  stickerPanel.hidden = true;
  delete stickerPanel.dataset.forId;
}

/** Alvo de left/top do popover (ao lado do sticker), ou null se não der. */
function stickerPanelTargetPos() {
  if (!stickerPanel || !state.sel) return null;
  const el = pagesEl.querySelector(`.blk.sticker[data-id="${state.sel}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const pw = stickerPanel.offsetWidth || 260;
  const ph = stickerPanel.offsetHeight || 360;
  let x = r.right + 10;
  if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  return { x, y };
}

function positionStickerPanel() {
  if (!stickerPanel || stickerPanel.hidden) return;
  const p = stickerPanelTargetPos();
  if (!p) return;
  stickerPanel.style.left = p.x + 'px';
  stickerPanel.style.top = p.y + 'px';
}

/**
 * Reancora após soltar a escala: fade out → move → fade in.
 * Não usar no `input` do slider (só no `change` / reset).
 */
function reanchorStickerPanel() {
  if (!stickerPanel || stickerPanel.hidden) return;
  const next = stickerPanelTargetPos();
  if (!next) return;
  const curX = parseFloat(stickerPanel.style.left);
  const curY = parseFloat(stickerPanel.style.top);
  // sem left/top ainda ou já colado no alvo → só snap sem animação
  if (!Number.isFinite(curX) || !Number.isFinite(curY)) {
    positionStickerPanel();
    return;
  }
  if (Math.abs(curX - next.x) < 1 && Math.abs(curY - next.y) < 1) return;

  const tok = ++stickerReanchorTok;
  stickerPanel.classList.add('is-fading');
  window.setTimeout(() => {
    if (tok !== stickerReanchorTok || !stickerPanel || stickerPanel.hidden) return;
    // re-mede: o sticker pode ter mudado no meio do fade
    const p = stickerPanelTargetPos() || next;
    stickerPanel.style.left = p.x + 'px';
    stickerPanel.style.top = p.y + 'px';
    // reflow pra a transição de opacity recomeçar do 0
    void stickerPanel.offsetWidth;
    requestAnimationFrame(() => {
      if (tok !== stickerReanchorTok || !stickerPanel) return;
      stickerPanel.classList.remove('is-fading');
    });
  }, FLOAT_PANEL_FADE_MS);
}

function paintStickerIconGrid(host, activeSymbol) {
  if (!host) return;
  const list = filterCoinIcons(stickerSearchQ);
  host.replaceChildren();
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'sticker-empty';
    empty.textContent = 'Nenhum token encontrado.';
    host.appendChild(empty);
    return;
  }
  // virtualiza leve: renderiza até 200 no filtro; busca estreita traz poucos
  const max = stickerSearchQ.trim() ? 400 : 120;
  const slice = list.slice(0, max);
  const frag = document.createDocumentFragment();
  for (const c of slice) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sticker-pick' + (c.symbol === activeSymbol ? ' on' : '');
    btn.dataset.symbol = c.symbol;
    btn.title = `${c.label} (${c.symbol.toUpperCase()})`;
    btn.setAttribute('aria-label', c.label);
    const thumb = document.createElement('span');
    thumb.className = 'sticker-pick-ico';
    const cached = coinSvgCache.get(c.symbol);
    if (cached) {
      thumb.innerHTML = cached;
      fitCoinSvgEl(thumb);
    } else {
      thumb.classList.add('sticker-loading');
      // lazy load on first paint of this symbol
      loadCoinSvg(c.symbol).then((svg) => {
        if (!svg || !thumb.isConnected) return;
        thumb.classList.remove('sticker-loading');
        thumb.innerHTML = svg;
        fitCoinSvgEl(thumb);
      });
    }
    const lab = document.createElement('span');
    lab.className = 'sticker-pick-lab';
    lab.textContent = c.symbol.toUpperCase();
    btn.appendChild(thumb);
    btn.appendChild(lab);
    frag.appendChild(btn);
  }
  host.appendChild(frag);
  if (list.length > max) {
    const more = document.createElement('p');
    more.className = 'sticker-empty';
    more.textContent = `+${list.length - max} — refine a busca`;
    host.appendChild(more);
  }
}

function openStickerPanel() {
  const b = blockOf(state.sel);
  if (!b || b.type !== 'sticker') return closeStickerPanel();
  closeTextPanel();
  closeImgPanel();
  if (!stickerPanel) {
    stickerPanel = document.createElement('div');
    stickerPanel.id = 'stickerPanel';
    stickerPanel.className = 'float-panel sticker-panel';
    document.body.appendChild(stickerPanel);
  }
  // mesma seleção já aberta: mantém left/top (escala/rotação não empurram o slider)
  const keepPos = !stickerPanel.hidden && stickerPanel.dataset.forId === b.id;
  const scalePct = blockScaleOf(b);
  const rot = rotateOf(b);
  const rotateSnaps = ROTATE_SNAPS.join(',');
  const sym = clampCoinSymbol(b.symbol);
  const title = b.sticker === 'token' || !b.sticker
    ? `Token · ${coinLabel(sym)}`
    : 'Sticker';
  stickerPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">${title}</div>
    <label class="field"><span class="field-row">Escala <span class="field-val"><span data-role="scalev">${fmtImgScalePct(scalePct)}</span>%<button type="button" class="resetbtn" data-a="scalereset" title="Redefinir para ${DEFAULT_STICKER_SCALE}%">↺</button></span></span>
      <input type="range" data-a="scale" min="10" max="100" step="${IMG_SCALE_STEP}" value="${scalePct}" data-snaps="10,25,${DEFAULT_STICKER_SCALE},50,75,100">
    </label>
    <label class="field" title="Giro plano do bloco (mesmo da alça). Digite o ângulo ou arraste; Shift = sem ímã"><span class="field-row">Rotação <span class="field-val"><span data-role="rotatev">${rot}</span>°<button type="button" class="resetbtn" data-a="rotatereset" title="Sem rotação">↺</button></span></span>
      <input type="range" data-a="rotate" min="-180" max="180" step="1" value="${rot}" data-snaps="${rotateSnaps}">
    </label>
    <label class="field sticker-search-field">
      <span class="field-row">Ícone</span>
      <input type="search" data-a="search" placeholder="Buscar (BTC, eth, sol…)" value="${stickerSearchQ.replace(/"/g, '&quot;')}" autocomplete="off" spellcheck="false">
    </label>
    <div class="sticker-grid" data-role="grid" role="listbox" aria-label="Ícones de token"></div>
    <button type="button" class="fieldbtn danger" data-a="del">${TRASH_ICO}<span>Remover</span></button>`;
  stickerPanel.hidden = false;
  stickerPanel.dataset.forId = b.id;

  const grid = stickerPanel.querySelector('[data-role="grid"]');
  paintStickerIconGrid(grid, sym);

  const liveEl = () => pagesEl.querySelector(`.blk.sticker[data-id="${b.id}"]`);
  // escala: só mexe no sticker — popover fica pinado (não reancora no AABB)
  const paintScale = (pct) => {
    b.scale = clampBlockScale(pct);
    b.h = stickerHeightOf(b);
    const scalev = stickerPanel.querySelector('[data-role="scalev"]');
    if (scalev) scalev.textContent = fmtImgScalePct(b.scale);
    const el = liveEl();
    if (el) {
      el.style.width = b.scale + '%';
      el.style.height = b.h + 'px';
      el.style.left = (b.x | 0) + 'px';
      applyBlockTransform(el, b);
    }
    save(); scheduleCommit();
    placeRotateHandle();
  };
  const paintRotate = (n) => {
    const range = stickerPanel.querySelector('input[data-a="rotate"]');
    const free = isFreeSnap(range);
    setBlockRotate(b, free ? clampRotate(n) : snapRotate(n));
    const r = rotateOf(b);
    const v = stickerPanel.querySelector('[data-role="rotatev"]');
    if (v && document.activeElement !== v) v.textContent = String(r);
    if (range && document.activeElement !== range) range.value = String(r);
    const el = liveEl();
    if (el) applyBlockTransform(el, b);
    save(); scheduleCommit();
    placeRotateHandle();
  };

  enhanceAll(stickerPanel);

  stickerPanel.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });

  stickerPanel.querySelector('input[data-a="scale"]')?.addEventListener('input', (e) => {
    paintScale(+e.currentTarget.value);
  });
  // soltar o thumb: commit + reancora com fade (popover pinado durante o arraste)
  stickerPanel.querySelector('input[data-a="scale"]')?.addEventListener('change', () => {
    b.h = stickerHeightOf(b);
    save(); scheduleCommit();
    reanchorStickerPanel();
  });
  stickerPanel.querySelector('[data-a="scalereset"]')?.addEventListener('click', () => {
    paintScale(DEFAULT_STICKER_SCALE);
    const range = stickerPanel.querySelector('input[data-a="scale"]');
    if (range) range.value = String(DEFAULT_STICKER_SCALE);
    reanchorStickerPanel();
  });
  stickerPanel.querySelector('input[data-a="rotate"]')?.addEventListener('input', (e) => {
    paintRotate(+e.currentTarget.value);
  });
  stickerPanel.querySelector('input[data-a="rotate"]')?.addEventListener('change', () => {
    reanchorStickerPanel();
  });
  stickerPanel.querySelector('[data-a="rotatereset"]')?.addEventListener('click', () => {
    paintRotate(0);
    const range = stickerPanel.querySelector('input[data-a="rotate"]');
    if (range) range.value = '0';
    reanchorStickerPanel();
  });
  stickerPanel.querySelector('[data-a="del"]')?.addEventListener('click', () => removeBlock(b.id));

  const search = stickerPanel.querySelector('input[data-a="search"]');
  search?.addEventListener('input', () => {
    stickerSearchQ = search.value || '';
    paintStickerIconGrid(grid, clampCoinSymbol(b.symbol));
  });

  grid?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('button[data-symbol]');
    if (!btn) return;
    const next = clampCoinSymbol(btn.dataset.symbol);
    if (next === clampCoinSymbol(b.symbol)) return;
    b.symbol = next;
    // pré-carrega e re-render (inline no bloco); keepPos mantém o popover no lugar
    loadCoinSvg(next).then(() => {
      save(); scheduleCommit();
      render();
      openStickerPanel();
    });
  });

  if (!keepPos) positionStickerPanel();
}

// segment / chevrons / setSegment → bindEditorShell (ui-shell.js)

// ── painel flutuante do TEXTO (mesmo contrato do coverPanel do diagramador) ──
// Não vive na sidebar: abre ao selecionar/focar o bloco, ao lado do artboard.
let textPanel = $('textPanel');
function closeTextPanel() {
  if (textPanel) textPanel.hidden = true;
}
function positionTextPanel() {
  if (!textPanel || textPanel.hidden || !state.activeId) return;
  const b = blockOf(state.activeId);
  if (!b || b.type !== 'text') return;
  const el = pagesEl.querySelector(`.blk.text[data-id="${state.activeId}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = textPanel.offsetWidth || 232, ph = textPanel.offsetHeight || 240;
  let x = r.right + 10;
  if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  textPanel.style.left = x + 'px';
  textPanel.style.top = y + 'px';
}
function openTextPanel() {
  const id = state.activeId;
  const b = id ? blockOf(id) : null;
  if (!b || b.type !== 'text') return closeTextPanel();
  closeImgPanel();
  closeStickerPanel();
  if (!textPanel) {
    textPanel = document.createElement('div');
    textPanel.id = 'textPanel';
    textPanel.className = 'float-panel';
    document.body.appendChild(textPanel);
  }
  const size = b.size || 24;
  const scalePct = blockScaleOf(b);
  const color = b.color || DEFAULT_TEXT;
  const border = textBorderOf(b);
  const borderColor = textBorderColorOf(b);
  const shadow3d = textShadow3dOf(b);
  const shadow3dColor = textShadow3dColorOf(b);
  textPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Texto</div>
    <div class="field">Alinhamento<div data-slot="align"></div></div>
    <label class="field"><span class="field-row">Largura <span class="field-val"><span data-role="scalev">${fmtImgScalePct(scalePct)}</span>%<button type="button" class="resetbtn" data-a="scalereset" title="Largura total">↺</button></span></span>
      <input type="range" data-a="scale" min="10" max="100" step="${IMG_SCALE_STEP}" value="${scalePct}" data-snaps="10,25,50,75,100">
    </label>
    <label class="field"><span class="field-row">Tamanho <span class="field-val"><span data-role="szv">${size}px</span><button type="button" class="resetbtn" data-a="sizereset" title="Redefinir para 24px">↺</button></span></span>
      <input type="range" data-a="size" min="10" max="72" step="1" value="${size}" data-snaps="10,14,18,24,32,48,72">
    </label>
    <label class="field">Cor
      <button type="button" class="colorfield" data-a="color" title="Cor do texto" aria-label="Cor do texto" style="background:${color}"></button>
    </label>
    <label class="field"><span class="field-row">Borda <span class="field-val"><span data-role="borderv">${border}px</span><button type="button" class="resetbtn" data-a="borderreset" title="Sem borda">↺</button></span></span>
      <input type="range" data-a="border" min="0" max="6" step="1" value="${border}" data-snaps="0,1,2,3,4,6">
    </label>
    <label class="field">Cor da borda
      <button type="button" class="colorfield" data-a="bordercolor" title="Cor da borda" aria-label="Cor da borda" style="background:${borderColor}"></button>
    </label>
    <label class="field"><span class="field-row">Sombra 3D <span class="field-val"><span data-role="shadow3dv">${shadow3d}</span><button type="button" class="resetbtn" data-a="shadow3dreset" title="Sem sombra 3D">↺</button></span></span>
      <input type="range" data-a="shadow3d" min="0" max="100" step="1" value="${shadow3d}" data-snaps="0,25,50,75,100">
    </label>
    <label class="field">Cor da sombra 3D
      <button type="button" class="colorfield" data-a="shadow3dcolor" title="Cor da sombra 3D" aria-label="Cor da sombra 3D" style="background:${shadow3dColor}"></button>
    </label>
    <button type="button" class="fieldbtn danger" data-a="del">${TRASH_ICO}<span>Remover</span></button>`;
  textPanel.hidden = false;

  const liveEl = () => pagesEl.querySelector(`.blk.text[data-id="${b.id}"]`);
  const paintFx = () => {
    const el = liveEl();
    if (el) applyTextEffectsToEl(el, b);
    save(); scheduleCommit();
  };

  const mountAlign = () => {
    const slot = textPanel.querySelector('[data-slot="align"]');
    if (!slot) return;
    const cur = b.align === 'center' || b.align === 'right' ? b.align : 'left';
    slot.replaceChildren(widthSeg(cur, [
      { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
      { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
      { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
    ], (v) => {
      b.align = v;
      const el = liveEl();
      if (el) el.style.textAlign = b.align;
      save(); scheduleCommit();
      mountAlign();
    }));
  };
  mountAlign();

  const paintTextScale = (pct) => {
    b.scale = clampBlockScale(pct);
    const el = liveEl();
    if (el) {
      el.style.width = b.scale + '%';
      el.style.left = (b.x | 0) + 'px';
      el.style.right = 'auto';
    }
    const scalev = textPanel.querySelector('[data-role="scalev"]');
    if (scalev) scalev.textContent = fmtImgScalePct(b.scale);
    const range = textPanel.querySelector('input[data-a="scale"]');
    if (range && document.activeElement !== range) range.value = String(b.scale);
    save(); scheduleCommit();
    placeRotateHandle();
    positionTextPanel();
  };

  const paintSize = (n) => {
    b.size = n;
    const el = liveEl();
    if (el) el.style.fontSize = n + 'px';
    const szv = textPanel.querySelector('[data-role="szv"]');
    if (szv) szv.textContent = n + 'px';
    const range = textPanel.querySelector('input[data-a="size"]');
    if (range && document.activeElement !== range) range.value = String(n);
    save(); scheduleCommit();
    positionTextPanel();
  };
  const paintBorder = (n) => {
    const w = textBorderOf({ textBorder: n });
    if (w > 0) b.textBorder = w;
    else delete b.textBorder;
    const v = textPanel.querySelector('[data-role="borderv"]');
    if (v) v.textContent = w + 'px';
    const range = textPanel.querySelector('input[data-a="border"]');
    if (range && document.activeElement !== range) range.value = String(w);
    paintFx();
  };
  const paintShadow3d = (n) => {
    const d = textShadow3dOf({ textShadow3d: n });
    if (d > 0) b.textShadow3d = d;
    else delete b.textShadow3d;
    const v = textPanel.querySelector('[data-role="shadow3dv"]');
    if (v) v.textContent = String(d);
    const range = textPanel.querySelector('input[data-a="shadow3d"]');
    if (range && document.activeElement !== range) range.value = String(d);
    paintFx();
  };

  textPanel.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });
  enhanceAll(textPanel);

  textPanel.querySelector('input[data-a="size"]')?.addEventListener('input', (e) => {
    paintSize(+e.target.value);
  });
  textPanel.querySelector('[data-a="sizereset"]')?.addEventListener('click', () => paintSize(24));
  textPanel.querySelector('input[data-a="scale"]')?.addEventListener('input', (e) => {
    paintTextScale(+e.target.value);
  });
  textPanel.querySelector('[data-a="scalereset"]')?.addEventListener('click', () => paintTextScale(100));
  textPanel.querySelector('input[data-a="border"]')?.addEventListener('input', (e) => {
    paintBorder(+e.target.value);
  });
  textPanel.querySelector('[data-a="borderreset"]')?.addEventListener('click', () => paintBorder(0));
  textPanel.querySelector('input[data-a="shadow3d"]')?.addEventListener('input', (e) => {
    paintShadow3d(+e.target.value);
  });
  textPanel.querySelector('[data-a="shadow3dreset"]')?.addEventListener('click', () => paintShadow3d(0));
  textPanel.querySelector('[data-a="color"]')?.addEventListener('click', (e) => {
    const cf = e.currentTarget;
    openSwatchPop(cf, (c) => {
      const p = parseColor(c);
      b.color = p ? p.hex : (c || DEFAULT_TEXT);
      cf.style.background = b.color;
      const el = liveEl();
      if (el) el.style.color = b.color;
      save(); scheduleCommit();
    }, b.color || DEFAULT_TEXT, { opacity: false });
  });
  textPanel.querySelector('[data-a="bordercolor"]')?.addEventListener('click', (e) => {
    const cf = e.currentTarget;
    openSwatchPop(cf, (c) => {
      const p = parseColor(c);
      b.textBorderColor = p ? p.hex : (c || '#FFFFFF');
      cf.style.background = b.textBorderColor;
      if (!textBorderOf(b)) paintBorder(2); // liga borda se só escolheu cor
      else paintFx();
    }, textBorderColorOf(b), { opacity: false });
  });
  textPanel.querySelector('[data-a="shadow3dcolor"]')?.addEventListener('click', (e) => {
    const cf = e.currentTarget;
    openSwatchPop(cf, (c) => {
      const p = parseColor(c);
      b.textShadow3dColor = p ? p.hex : (c || '#000000');
      cf.style.background = b.textShadow3dColor;
      if (!textShadow3dOf(b)) paintShadow3d(40);
      else paintFx();
    }, textShadow3dColorOf(b), { opacity: false });
  });
  textPanel.querySelector('[data-a="del"]')?.addEventListener('click', () => removeBlock(b.id));

  positionTextPanel();
}

/** Abre o popover do tipo certo (texto / imagem / sticker). */
function syncBlockPanel() {
  const id = state.sel || state.activeId;
  const b = id ? blockOf(id) : null;
  if (!b) {
    closeTextPanel();
    closeImgPanel();
    closeStickerPanel();
    return;
  }
  if (b.type === 'image') {
    closeTextPanel();
    closeStickerPanel();
    if (state.sel === b.id) openImgPanel();
    else closeImgPanel();
  } else if (b.type === 'sticker') {
    closeTextPanel();
    closeImgPanel();
    if (state.sel === b.id) openStickerPanel();
    else closeStickerPanel();
  } else if (b.type === 'text') {
    closeImgPanel();
    closeStickerPanel();
    if (state.activeId === b.id) openTextPanel();
    else closeTextPanel();
  } else {
    closeTextPanel();
    closeImgPanel();
    closeStickerPanel();
  }
}

// ─────────────────────────── sidebar sync ───────────────────────────────────
function syncSidebarFromDoc() {
  const d = state.doc;
  const page = currentPage();
  if ($('marginMode')) $('marginMode').value = clampMarginMode(d.marginMode);
  syncStageToggles();
  paintPageBg();
  syncBgImageUI(page);
  syncLogoUI();
}

/** "Selecionar" vs "Substituir + Remover" + sliders — idêntico à capa do Diagramador. */
function syncBgImageUI(page = currentPage()) {
  const has = !!(page && page.bgImage);
  const sel = $('btnBgImage');
  const actions = $('bgActions');
  const pos = $('bgXformPos');
  const scale = $('bgXformScale');
  if (sel) sel.hidden = has;
  if (actions) actions.hidden = !has;
  if (pos) pos.hidden = !has;
  if (scale) scale.hidden = !has;
  if (!page) return;
  const x = page.bgX ?? 50;
  const y = page.bgY ?? 50;
  const sc = page.bgScale ?? 100;
  if ($('bgX')) $('bgX').value = x;
  if ($('bgY')) $('bgY').value = y;
  if ($('bgScale')) $('bgScale').value = sc;
  if ($('bgScaleVal')) $('bgScaleVal').textContent = (sc / 100).toFixed(2) + '×';
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

// ── popover ⋮ estilo global do tipo Texto (letter-spacing) ─────────────────
// Mesmo contrato do Diagramador: edita doc.blockStyles.text p/ TODOS os blocos.
let blockStylePanel = null;
let blockStyleType = null;

function applyLetterSpacingLive(em) {
  const ls = clampLetterSpacing(em) + 'em';
  pagesEl.querySelectorAll('.blk.text').forEach((el) => {
    el.style.letterSpacing = ls;
  });
}

function openBlockStylePanel(type, anchorEl) {
  if (type !== 'text') return;
  if (!blockStylePanel) {
    blockStylePanel = document.createElement('div');
    blockStylePanel.id = 'blockStylePanel';
    blockStylePanel.className = 'float-panel';
    document.body.appendChild(blockStylePanel);
  }
  blockStyleType = type;
  const def = TEXT_STYLE_DEFAULTS.letterSpacing;
  const cur = textLetterSpacingOf(state.doc);
  const fmtLS = (n) => clampLetterSpacing(n).toFixed(2) + 'em';
  blockStylePanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Estilo · Texto</div>
    <label class="field"><span class="field-row">Espaço entre letras <span class="field-val"><span data-role="letterSpacingv">${fmtLS(cur)}</span><button type="button" class="resetbtn" data-r="letterSpacing" title="Redefinir para ${fmtLS(def)}">↺</button></span></span>
      <input type="range" data-a="letterSpacing" min="-0.08" max="0.15" step="0.01" value="${cur}" data-snaps="-0.08,-0.05,-0.03,-0.01,0,0.05,0.1,0.15">
    </label>`;
  blockStylePanel.hidden = false;
  enhanceAll(blockStylePanel);
  positionBlockStylePanel(anchorEl);
  blockStylePanel.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });

  const setLs = (val) => {
    const v = clampLetterSpacing(val);
    const o = (state.doc.blockStyles ||= {});
    const t = (o.text ||= {});
    t.letterSpacing = v;
    applyLetterSpacingLive(v);
    const disp = blockStylePanel.querySelector('[data-role="letterSpacingv"]');
    if (disp) disp.textContent = fmtLS(v);
    save(); scheduleCommit();
  };
  const resetLs = () => {
    const o = state.doc.blockStyles && state.doc.blockStyles.text;
    if (o) {
      delete o.letterSpacing;
      if (!Object.keys(o).length) delete state.doc.blockStyles.text;
    }
    applyLetterSpacingLive(TEXT_STYLE_DEFAULTS.letterSpacing);
    const disp = blockStylePanel.querySelector('[data-role="letterSpacingv"]');
    if (disp) disp.textContent = fmtLS(TEXT_STYLE_DEFAULTS.letterSpacing);
    const inp = blockStylePanel.querySelector('input[data-a="letterSpacing"]');
    if (inp) inp.value = String(TEXT_STYLE_DEFAULTS.letterSpacing);
    save(); scheduleCommit();
  };

  blockStylePanel.querySelector('input[data-a="letterSpacing"]')?.addEventListener('input', (e) => {
    setLs(+e.target.value);
  });
  blockStylePanel.querySelector('.resetbtn[data-r="letterSpacing"]')?.addEventListener('click', resetLs);
}

function positionBlockStylePanel(anchorEl) {
  if (!blockStylePanel || blockStylePanel.hidden || !anchorEl) return;
  const r = anchorEl.getBoundingClientRect();
  const pw = blockStylePanel.offsetWidth || 232;
  const ph = blockStylePanel.offsetHeight || 120;
  let x = r.right + 10;
  if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  blockStylePanel.style.left = x + 'px';
  blockStylePanel.style.top = y + 'px';
}
function closeBlockStylePanel() {
  if (blockStylePanel) blockStylePanel.hidden = true;
  blockStyleType = null;
}

// ──────────────── barra flutuante — ui-fmtbar.js (shell canônico) ────────────
// Stories exporta PNG: sem hyperlink. B/I/U/S + cores + estilos de highlight.
const {
  fmtbar,
  hiliteStyleBtn,
  hiliteStyleMenu,
  closeFmtbar,
  positionFmtbar,
  positionHiliteStyleMenu,
} = ensureFmtbarChrome({
  captionMode: true,
  withTypeSelect: false,
  withLink: false,
  withHiliteStyle: true,
});

function editableHostOfRange(range) {
  let n = range && range.commonAncestorContainer;
  while (n && n.nodeType === 3) n = n.parentNode;
  return (n && n.closest && n.closest('#pages [contenteditable="true"]')) || null;
}

/** Range/host da seleção da fmtbar — o <select> do highlight rouba o focus e apaga a Selection. */
let savedFmtRange = null;
let savedFmtHost = null;

function captureFmtSelection() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const host = editableHostOfRange(r);
  if (!host) return;
  // aceita seleção aberta OU caret dentro de um highlight já aplicado
  if (sel.isCollapsed && !hiliteElAtNode(sel.anchorNode)) return;
  try {
    savedFmtRange = r.cloneRange();
    savedFmtHost = host;
  } catch { /* range inválido */ }
}

function restoreFmtSelection() {
  if (!savedFmtHost || !savedFmtRange) return false;
  try {
    if (!savedFmtHost.isConnected) return false;
    savedFmtHost.focus();
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(savedFmtRange);
    return true;
  } catch {
    return false;
  }
}

function syncHiliteStyleUI() {
  const st = clampHiliteStyle(state.doc.hiliteStyle);
  if (hiliteStyleBtn) {
    const lab = hiliteStyleBtn.querySelector('.hilite-style-label');
    if (lab) lab.textContent = hiliteStyleLabel(st);
  }
  if (hiliteStyleMenu) {
    hiliteStyleMenu.querySelectorAll('button[data-style]').forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset.style === st));
    });
  }
}

function closeHiliteStyleMenu() {
  if (!hiliteStyleMenu) return;
  hiliteStyleMenu.hidden = true;
  hiliteStyleBtn?.setAttribute('aria-expanded', 'false');
}

function openHiliteStyleMenu() {
  if (!hiliteStyleMenu || !hiliteStyleBtn) return;
  captureFmtSelection();
  syncHiliteStyleUI();
  hiliteStyleMenu.hidden = false;
  hiliteStyleBtn.setAttribute('aria-expanded', 'true');
  positionHiliteStyleMenu();
}

function toggleHiliteStyleMenu() {
  if (!hiliteStyleMenu) return;
  if (hiliteStyleMenu.hidden) openHiliteStyleMenu();
  else closeHiliteStyleMenu();
}

function pickHiliteStyle(style) {
  const st = clampHiliteStyle(style);
  state.doc.hiliteStyle = st;
  const host = savedFmtHost;
  reapplyHiliteStyleAtSelection(st);
  syncTextBlockFromHost(host || savedFmtHost);
  syncHiliteStyleUI();
  closeHiliteStyleMenu();
  save();
  scheduleCommit();
  updateFmtbar();
}

function syncTextBlockFromHost(host) {
  if (!host) return;
  const b = blockOf(host.dataset.id);
  if (b && b.type === 'text') {
    b.html = host.innerHTML;
    save();
    scheduleCommit();
  }
}

/** Elemento de highlight sob o nó (span.txt-hl ou span/font com background do execCommand). */
function hiliteElAtNode(node) {
  let n = node;
  if (n && n.nodeType === 3) n = n.parentNode;
  while (n && n !== pagesEl) {
    if (n.nodeType === 1 && isHiliteEl(n)) return n;
    if (n.classList?.contains('blk')) break;
    n = n.parentNode;
  }
  return null;
}

function isHiliteEl(el) {
  if (!(el instanceof Element)) return false;
  if (el.classList.contains('txt-hl')) return true;
  if (el.tagName === 'MARK') return true;
  const bg = el.style?.backgroundColor || el.style?.background;
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'initial') return true;
  return false;
}

function hiliteColorFromEl(el) {
  const cssVar = (el.style?.getPropertyValue('--hl') || '').trim();
  if (cssVar) return cssVar;
  const bg = el.style?.backgroundColor || el.style?.background;
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
    const p = parseColor(bg);
    return p ? p.hex : bg;
  }
  try {
    const cs = getComputedStyle(el);
    const c = cs.getPropertyValue('--hl')?.trim() || cs.backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
      const p = parseColor(c);
      return p ? p.hex : c;
    }
  } catch { /* */ }
  return '#FFF3A3';
}

function setHiliteElStyle(el, style, hex) {
  const st = clampHiliteStyle(style);
  if (st === 'none') {
    unwrapHiliteEl(el);
    return;
  }
  // limpa inline de execCommand / estilos anteriores
  el.style.backgroundColor = '';
  el.style.backgroundImage = '';
  el.style.background = '';
  el.style.borderBottom = '';
  el.style.padding = '';
  el.style.borderRadius = '';
  el.className = 'txt-hl txt-hl-' + st;
  el.style.setProperty('--hl', hex || hiliteColorFromEl(el) || '#FFF3A3');
}

function unwrapHiliteEl(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
  parent.normalize?.();
}

/** Highlights que intersectam o range (ou o caret, se estiver dentro de um). */
function hiliteElsInRange(range) {
  const out = [];
  if (!range) return out;
  const seen = new Set();
  const add = (el) => {
    if (el && !seen.has(el)) { seen.add(el); out.push(el); }
  };
  add(hiliteElAtNode(range.startContainer));
  add(hiliteElAtNode(range.endContainer));
  const root = range.commonAncestorContainer;
  const rootEl = root.nodeType === 1 ? root : root.parentNode;
  if (rootEl?.querySelectorAll) {
    rootEl.querySelectorAll('.txt-hl, mark, span[style*="background"], font[style*="background"]').forEach((el) => {
      try {
        if (range.intersectsNode(el) && isHiliteEl(el)) add(el);
      } catch { /* */ }
    });
  }
  return out;
}

/**
 * Aplica / reestiliza / remove highlight na seleção.
 * Todos os estilos (incl. solid) usam span.txt-hl-* — reaplicar via dropdown fica barato.
 */
function applyHiliteToSelection(hex, style) {
  const st = clampHiliteStyle(style);
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  let range = sel.getRangeAt(0);
  const existing = hiliteElsInRange(range);

  if (st === 'none') {
    if (!existing.length) return;
    for (const el of existing) unwrapHiliteEl(el);
    return;
  }

  const color = hex || '#FFF3A3';
  if (existing.length) {
    for (const el of existing) setHiliteElStyle(el, st, color);
    // re-seleciona o primeiro para o caret/fmtbar não sumirem
    try {
      const r = document.createRange();
      r.selectNodeContents(existing[0]);
      sel.removeAllRanges();
      sel.addRange(r);
      savedFmtRange = r.cloneRange();
    } catch { /* */ }
    return;
  }

  if (range.collapsed) return;

  const span = document.createElement('span');
  setHiliteElStyle(span, st, color);
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  try {
    const after = document.createRange();
    after.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(after);
    savedFmtRange = after.cloneRange();
  } catch { /* */ }
}

/** Dropdown mudou: reaplica o estilo no highlight já presente (sem precisar trocar cor). */
function reapplyHiliteStyleAtSelection(style) {
  const st = clampHiliteStyle(style);
  if (!restoreFmtSelection() && savedFmtRange) {
    // tenta só o range salvo sem focus
    try {
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(savedFmtRange);
    } catch { return false; }
  }
  const sel = getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const existing = hiliteElsInRange(range);
  if (!existing.length) {
    // sem highlight ainda: se não é "none" e há seleção, aplica com cor padrão
    if (st !== 'none' && !range.collapsed) {
      applyHiliteToSelection('#FFF3A3', st);
      return true;
    }
    return false;
  }
  // reusa a cor já aplicada em cada mark
  for (const el of existing) {
    const color = hiliteColorFromEl(el);
    setHiliteElStyle(el, st, color);
  }
  try {
    const r = document.createRange();
    r.selectNodeContents(existing[0]);
    if (existing.length > 1) {
      r.setStartBefore(existing[0]);
      r.setEndAfter(existing[existing.length - 1]);
    }
    sel.removeAllRanges();
    sel.addRange(r);
    savedFmtRange = r.cloneRange();
  } catch { /* */ }
  return true;
}

/** Pinta os botões A (texto / highlight) com a cor atual. */
function paintFmtColorButtons({ fore, back } = {}) {
  const foreBtn = fmtbar?.querySelector('.cb-fore');
  const backBtn = fmtbar?.querySelector('.cb-back');
  if (foreBtn && fore) {
    const p = parseColor(fore);
    const hex = p?.hex || (typeof fore === 'string' ? fore : null);
    if (hex) {
      foreBtn.style.borderBottomColor = hex;
      foreBtn.dataset.color = p ? withAlpha(p.hex, p.alpha) : hex;
    }
  }
  if (backBtn && back !== undefined) {
    if (back === false || back === 'false' || back === 'transparent' || back === 'none' || back == null) {
      backBtn.style.background = '';
      delete backBtn.dataset.color;
    } else {
      const p = parseColor(back);
      if (p) {
        const css = withAlpha(p.hex, p.alpha);
        backBtn.style.background = css;
        backBtn.dataset.color = css;
      } else if (typeof back === 'string' && back) {
        backBtn.style.background = back;
        backBtn.dataset.color = back;
      }
    }
  }
}

/** Cores sob a seleção/caret (fore + highlight custom ou execCommand). */
function colorsFromFmtSelection() {
  let fore = null;
  let back = null;
  try {
    const v = document.queryCommandValue('foreColor');
    if (v && v !== 'false') fore = v;
  } catch { /* */ }
  try {
    const v = document.queryCommandValue('hiliteColor') || document.queryCommandValue('backColor');
    if (v && v !== 'false' && v !== 'transparent') back = v;
  } catch { /* */ }
  const sel = getSelection();
  if (sel?.anchorNode) {
    const hl = hiliteElAtNode(sel.anchorNode);
    if (hl) back = hiliteColorFromEl(hl);
    let n = sel.anchorNode;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== pagesEl) {
      if (n.nodeType === 1) {
        if (n.style?.color) { fore = n.style.color; break; }
        if (n.tagName === 'FONT' && n.getAttribute('color')) {
          fore = n.getAttribute('color');
          break;
        }
      }
      if (n.classList?.contains('blk')) break;
      n = n.parentNode;
    }
  }
  return { fore, back };
}

function updateFmtbar() {
  if (!fmtbar) return;
  const sel = getSelection();
  const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  let host = null;
  if (r) {
    let n = sel.anchorNode;
    while (n && n.nodeType === 3) n = n.parentNode;
    host = n && n.closest && n.closest('#pages [contenteditable="true"]');
  }
  // mostra com seleção aberta OU caret dentro de highlight (p/ trocar estilo)
  const inHilite = !!(r && hiliteElAtNode(sel.anchorNode));
  if (!host || (sel.isCollapsed && !inHilite)) { closeFmtbar(); return; }
  captureFmtSelection();
  fmtbar.classList.add('caption-mode');
  syncHiliteStyleUI();
  fmtbar.querySelectorAll('.markbtn').forEach((b) => {
    try { b.classList.toggle('on', document.queryCommandState(b.dataset.cmd)); }
    catch { b.classList.remove('on'); }
  });
  paintFmtColorButtons(colorsFromFmtSelection());
  positionFmtbar(r.getBoundingClientRect());
  // se o menu de estilo estava aberto, reancora no botão (fmtbar pode ter se movido)
  if (hiliteStyleMenu && !hiliteStyleMenu.hidden) positionHiliteStyleMenu();
}

// mousedown na barra NÃO pode roubar a seleção do texto
fmtbar?.addEventListener('mousedown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  e.preventDefault();
  captureFmtSelection();
});

fmtbar?.querySelectorAll('.markbtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.execCommand(btn.dataset.cmd);
    // input no contenteditable sincroniza o bloco
    updateFmtbar();
  });
});

// menu de estilo de highlight (prévia visual) — à direita da cor de destaque
hiliteStyleBtn?.addEventListener('mousedown', (e) => {
  e.preventDefault(); // mantém a Selection do texto
  captureFmtSelection();
});
hiliteStyleBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleHiliteStyleMenu();
});
hiliteStyleMenu?.addEventListener('mousedown', (e) => {
  e.preventDefault(); // não rouba caret/seleção
  captureFmtSelection();
});
hiliteStyleMenu?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-style]');
  if (!btn) return;
  e.preventDefault();
  pickHiliteStyle(btn.dataset.style);
});
document.addEventListener('mousedown', (e) => {
  if (!hiliteStyleMenu || hiliteStyleMenu.hidden) return;
  if (e.target.closest('#hiliteStyleMenu') || e.target.closest('.hilite-style-btn')) return;
  closeHiliteStyleMenu();
}, true);

// cor do texto / highlight — guarda Range (swatch fica fora do fmtbar)
fmtbar?.querySelectorAll('.colorbtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    captureFmtSelection();
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return;
    const saved = sel.getRangeAt(0).cloneRange();
    const host = editableHostOfRange(saved) || savedFmtHost;
    const fromSel = colorsFromFmtSelection();
    const current = btn.dataset.color
      || (btn.dataset.cmd === 'hiliteColor' ? fromSel.back : fromSel.fore)
      || undefined;
    const isHilite = btn.dataset.cmd === 'hiliteColor';
    openSwatchPop(btn, (hex) => {
      if (host) host.focus();
      const s = getSelection();
      s.removeAllRanges();
      try { s.addRange(saved); } catch {
        if (savedFmtRange) {
          try { s.addRange(savedFmtRange); } catch { /* */ }
        }
      }
      if (isHilite) {
        // pick(false) do swatch (allowNone) → remove highlight
        if (hex === false || hex == null || hex === 'false' || hex === 'transparent' || hex === 'none') {
          applyHiliteToSelection(null, 'none');
          paintFmtColorButtons({ back: false });
        } else {
          applyHiliteToSelection(hex, state.doc.hiliteStyle);
          paintFmtColorButtons({ back: hex });
        }
      } else {
        // foreColor: execCommand prefere hex opaco; alpha via style se rgba
        const p = parseColor(hex);
        if (p && p.alpha < 1) {
          document.execCommand('foreColor', false, p.hex);
          // reforça alpha no span gerado quando o browser ignora
          try {
            const s2 = getSelection();
            if (s2?.rangeCount) {
              let n = s2.anchorNode;
              if (n?.nodeType === 3) n = n.parentNode;
              if (n?.style) n.style.color = hex;
            }
          } catch { /* */ }
        } else {
          document.execCommand(btn.dataset.cmd, false, p?.hex || hex);
        }
        paintFmtColorButtons({ fore: hex });
      }
      syncTextBlockFromHost(host);
      updateFmtbar();
    }, current, isHilite ? { allowNone: true, noneLabel: 'Nenhum' } : undefined);
  });
});

// ─────────────────────────── eventos de edição ──────────────────────────────
pagesEl.addEventListener('input', (e) => {
  const host = e.target.closest?.('#pages [contenteditable="true"]');
  if (!host) return;
  const b = blockOf(host.dataset.id);
  if (!b || b.type !== 'text') return;
  b.html = host.innerHTML;
  // atualiza rótulo da camada sem re-render (evita perder caret)
  const lab = $('layersList')?.querySelector(`.layer-row[data-id="${b.id}"] .layer-label`);
  if (lab) lab.textContent = blockLayerLabel(b);
  save();
  scheduleCommit();
});

pagesEl.addEventListener('focusin', (e) => {
  const host = e.target.closest?.('.blk.text[contenteditable="true"]');
  if (!host) return;
  state.activeId = host.dataset.id;
  state.sel = null;
  setSegment('conteudo');
  paintActive();
  placeHandles(host);
  openTextPanel(); // popover ao lado (não sidebar)
});

// seleção: mouseup/keyup/selectionchange (igual diagramador + reforço)
pagesEl.addEventListener('mouseup', () => setTimeout(updateFmtbar, 0));
pagesEl.addEventListener('keyup', () => setTimeout(updateFmtbar, 0));
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  let n = sel.anchorNode;
  while (n && n.nodeType === 3) n = n.parentNode;
  if (n && n.closest && n.closest('#pages [contenteditable="true"]')) {
    updateFmtbar();
  }
});

pagesEl.addEventListener('click', (e) => {
  if (e.target.closest?.('#bhandle, #badd, #bmenu, #brotate, #brotate-badge, #imgPanel, #textPanel, #stickerPanel, #colAddMenu')) return;
  const img = e.target.closest?.('.blk.image');
  if (img) {
    closeColAddMenu();
    state.sel = img.dataset.id;
    state.activeId = img.dataset.id;
    const b = blockOf(img.dataset.id);
    if (b && !b.src) {
      pendingImgId = b.id;
      $('imgFile').click();
    }
    setSegment('conteudo');
    paintActive();
    pagesEl.querySelectorAll('.blk.image, .blk.sticker').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === state.sel);
      el.classList.toggle('imgsel', el.dataset.id === state.sel);
    });
    placeHandles(img);
    openImgPanel();
    return;
  }
  const sticker = e.target.closest?.('.blk.sticker');
  if (sticker) {
    closeColAddMenu();
    state.sel = sticker.dataset.id;
    state.activeId = sticker.dataset.id;
    setSegment('conteudo');
    paintActive();
    pagesEl.querySelectorAll('.blk.image, .blk.sticker').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === state.sel);
      el.classList.toggle('imgsel', el.dataset.id === state.sel);
    });
    placeHandles(sticker);
    openStickerPanel();
    return;
  }
  const txt = e.target.closest?.('.blk.text');
  if (txt) {
    closeColAddMenu();
    state.activeId = txt.dataset.id;
    state.sel = null;
    paintActive();
    placeHandles(txt);
    openTextPanel();
    return;
  }
  // clique no vazio da página (sem bloco) → menu adicionar bloco
  if (!state.editing) return;
  if (suppressEmptyClick) { suppressEmptyClick = false; return; }
  // só dentro do artboard
  if (!e.target.closest?.('.story-page')) return;
  e.preventDefault();
  state.sel = null;
  state.activeId = null;
  closeImgPanel();
  closeTextPanel();
  closeStickerPanel();
  closeFmtbar();
  hideHandles();
  paintActive();
  openColAddMenu(null, null, { x: e.clientX, y: e.clientY });
});

// arraste livre X/Y — alça ⠿ ou imagem diretamente.
// Live no DOM (left/top + placeAtElement); snap em eixos + peers.
let drag = null;
/** true se o último pointerup foi um arraste real — o click sintético não abre o menu + */
let suppressEmptyClick = false;

/**
 * Guia de snap horizontal (Y) dentro de .blocks-layer.
 * @param {number|null} y
 * @param {{ center?: boolean }} [opts]
 */
function showSnapGuide(y, opts = {}) {
  const layer = pagesEl.querySelector('.blocks-layer');
  if (!layer) return;
  let g = layer.querySelector('.snap-guide');
  if (y == null || !Number.isFinite(+y)) {
    if (g) {
      g.hidden = true;
      g.classList.remove('is-center');
    }
    return;
  }
  if (!g) {
    g = document.createElement('div');
    g.className = 'snap-guide';
    g.setAttribute('aria-hidden', 'true');
    const x = document.createElement('span');
    x.className = 'snap-guide-x';
    x.innerHTML =
      '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">'
      + '<path d="M2 2l8 8M10 2L2 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
      + '</svg>';
    g.appendChild(x);
    layer.appendChild(g);
  }
  g.hidden = false;
  g.classList.toggle('is-center', !!opts.center);
  g.style.top = (+y) + 'px';
}

/**
 * Guia de snap vertical (X).
 * @param {number|null} x
 * @param {{ center?: boolean }} [opts]
 */
function showSnapGuideX(x, opts = {}) {
  const layer = pagesEl.querySelector('.blocks-layer');
  if (!layer) return;
  let g = layer.querySelector('.snap-guide-v');
  if (x == null || !Number.isFinite(+x)) {
    if (g) {
      g.hidden = true;
      g.classList.remove('is-center');
    }
    return;
  }
  if (!g) {
    g = document.createElement('div');
    g.className = 'snap-guide-v';
    g.setAttribute('aria-hidden', 'true');
    layer.appendChild(g);
  }
  g.hidden = false;
  g.classList.toggle('is-center', !!opts.center);
  g.style.left = (+x) + 'px';
}

/** Alvos Y: medidos no DOM + peers. */
function snapTargetsForDragY(dragId) {
  const page = pageOfBlock(dragId) || currentPage();
  const safeH = safeRect(state.doc.marginMode).h;
  const heightOf = (b) => {
    if (!b) return 80;
    const node = pagesEl.querySelector(`.blk[data-id="${b.id}"]`);
    if (node) return Math.max(1, node.offsetHeight);
    if (b.type === 'image' || b.type === 'sticker') return Math.max(24, b.h | 0) || 80;
    return 80;
  };
  const lines = collectBlockSnapTargets(page?.blocks || [], dragId, safeH, heightOf);
  pagesEl.querySelectorAll('.blocks-layer > .blk').forEach((node) => {
    if (node.dataset.id === dragId) return;
    const top = node.offsetTop;
    const h = node.offsetHeight;
    lines.push(top, top + h / 2, top + h);
  });
  return [...new Set(lines.filter(Number.isFinite))];
}

/** Alvos X: peers + bordas/centro da safe. */
function snapTargetsForDragX(dragId) {
  const page = pageOfBlock(dragId) || currentPage();
  const safeW = safeRect(state.doc.marginMode).w;
  const widthOf = (b) => {
    if (!b) return 80;
    const node = pagesEl.querySelector(`.blk[data-id="${b.id}"]`);
    if (node) return Math.max(1, node.offsetWidth);
    return blockWidthPx(b, state.doc.marginMode);
  };
  const lines = collectBlockSnapTargetsX(page?.blocks || [], dragId, safeW, widthOf);
  pagesEl.querySelectorAll('.blocks-layer > .blk').forEach((node) => {
    if (node.dataset.id === dragId) return;
    const left = node.offsetLeft;
    const w = node.offsetWidth;
    lines.push(left, left + w / 2, left + w);
  });
  return [...new Set(lines.filter(Number.isFinite))];
}

function startDrag(id, clientX, clientY, pointerEl, pointerId) {
  const b = blockOf(id);
  if (!b) return;
  const z = state.zoom === 'fit' ? fitZoomScale() : clampZoom(+state.zoom);
  const el = pagesEl.querySelector(`.blk[data-id="${id}"]`);
  const h = el ? Math.max(1, el.offsetHeight) : 80;
  const w = el ? Math.max(1, el.offsetWidth) : 80;
  drag = {
    id,
    startX: clientX,
    startY: clientY,
    origX: b.x | 0,
    origY: b.y | 0,
    scale: z,
    el,
    h,
    w,
    targetsY: snapTargetsForDragY(id),
    targetsX: snapTargetsForDragX(id),
    moved: false,
  };
  document.body.classList.add('grabbing');
  if (bhandleEl) bhandleEl.style.pointerEvents = 'none';
  if (baddEl) baddEl.style.pointerEvents = 'none';
  if (pointerEl && pointerId != null) {
    try { pointerEl.setPointerCapture(pointerId); } catch { /* id inválido / já capturado */ }
  }
}
function moveDrag(clientX, clientY) {
  if (!drag) return;
  const b = blockOf(drag.id);
  if (!b) return;
  const dx = (clientX - drag.startX) / drag.scale;
  const dy = (clientY - drag.startY) / drag.scale;
  if (Math.hypot(dx, dy) >= 1) drag.moved = true;
  const sr = safeRect(state.doc.marginMode);
  const safeH = sr.h;
  const safeW = sr.w;
  const el = drag.el?.isConnected
    ? drag.el
    : pagesEl.querySelector(`.blk[data-id="${drag.id}"]`);
  if (!el) return;
  drag.el = el;
  const h = Math.max(1, el.offsetHeight || drag.h || 40);
  const w = Math.max(1, el.offsetWidth || drag.w || 40);
  drag.h = h;
  drag.w = w;

  const maxY = Math.max(0, safeH - Math.min(40, h));
  const maxX = Math.max(0, safeW - Math.min(40, w));
  const freeY = drag.origY + dy;
  const freeX = drag.origX + dx;
  const clampedY = Math.max(0, Math.min(maxY, freeY));
  const clampedX = Math.max(0, Math.min(maxX, freeX));

  const sy = snapBlockY(clampedY, h, drag.targetsY || [], BLOCK_SNAP_PX);
  const sx = snapBlockX(clampedX, w, drag.targetsX || [], BLOCK_SNAP_PX);
  const yFinal = Math.max(0, Math.min(maxY, sy.y));
  const xFinal = Math.max(0, Math.min(maxX, sx.x));
  b.y = yFinal;
  b.x = xFinal;
  el.style.top = yFinal + 'px';
  el.style.left = xFinal + 'px';

  const snappedY = Math.abs(clampedY - sy.y) <= BLOCK_SNAP_PX && sy.guide != null;
  const snappedX = Math.abs(clampedX - sx.x) <= BLOCK_SNAP_PX && sx.guide != null;
  const isCenterY = snappedY && Math.abs(sy.guide - safeH / 2) <= 0.51;
  const isCenterX = snappedX && Math.abs(sx.guide - safeW / 2) <= 0.51;
  showSnapGuide(snappedY ? sy.guide : null, { center: isCenterY });
  showSnapGuideX(snappedX ? sx.guide : null, { center: isCenterX });

  handles.placeAtElement(el, drag.id);
  placeRotateHandle();
  positionSelPanel({ images: true, stickers: true });
}
function endDrag() {
  if (!drag) return;
  if (drag.moved) suppressEmptyClick = true;
  drag = null;
  showSnapGuide(null);
  showSnapGuideX(null);
  document.body.classList.remove('grabbing');
  if (bhandleEl) bhandleEl.style.pointerEvents = '';
  if (baddEl) baddEl.style.pointerEvents = '';
  save();
  scheduleCommit();
  showHandleAtFocused();
  positionSelPanel({ images: true, stickers: true });
}

// imagem/sticker: arrasta direto (texto só pela alça ⠿, pra não brigar com caret)
pagesEl.addEventListener('pointerdown', (e) => {
  const blk = e.target.closest?.('.blk.image, .blk.sticker');
  if (!blk || !state.editing) return;
  if (e.target.closest?.('input, button, select, [contenteditable]')) return;
  e.preventDefault();
  startDrag(blk.dataset.id, e.clientX, e.clientY, blk, e.pointerId);
});
document.addEventListener('pointermove', (e) => {
  if (rotateDrag) {
    moveRotateDrag(e.clientX, e.clientY, { shiftKey: e.shiftKey });
    return;
  }
  // promove pending da alça (ui-handles) a drag
  if (handles.handlePending && !drag) {
    const p = handles.consumePendingAsDrag(e.clientX, e.clientY);
    if (p) startDrag(p.id, p.x, p.y, bhandleEl, e.pointerId);
  }
  if (drag) moveDrag(e.clientX, e.clientY);
});
document.addEventListener('pointerup', () => {
  if (rotateDrag) {
    endRotateDrag();
    return;
  }
  if (handles.handlePending) {
    const p = handles.consumePendingAsClick();
    if (p) openBlockMenu(p.id, bhandleEl);
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
  .story-page .blocks-layer { position: absolute; }
  .story-page .blk {
    position: absolute; left: 0;
    box-sizing: border-box; padding: 0;
    word-break: break-word; white-space: pre-wrap;
  }
  .story-page .blk.text { padding: 1px 0; }
  .story-page .blk.text .txt-hl {
    --hl: #FFF3A3;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .story-page .blk.text .txt-hl-solid { background-color: var(--hl); }
  ${hiliteBrushCss()}
  .story-page .blk.text .txt-hl-underline {
    background: none; border-bottom: 0.28em solid var(--hl); padding-bottom: 0.04em;
  }
  .story-page .blk.image { padding: 0; overflow: visible; display: flex; flex-direction: column; }
  .story-page .blk.image .img-frame { width: 100%; height: 100%; overflow: hidden; }
  .story-page .blk.image img {
    width: 100%; height: 100%; display: block; object-fit: cover;
  }
  .story-page .blk.image .img-slot { display: none; }
  .story-page .blk.sticker { padding: 0; overflow: visible; }
  .story-page .blk.sticker .sticker-frame,
  .story-page .blk.sticker .sticker-icon { width: 100%; height: 100%; }
  .story-page .blk.sticker .sticker-icon svg { width: 100%; height: 100%; display: block; }
  /* logo: position/flex só existem em stories.html — sem isso some no foreignObject */
  .story-page .story-logo {
    position: absolute; display: flex; align-items: center;
    z-index: 5; pointer-events: none; box-sizing: border-box;
  }
  .story-page .story-logo .story-logo-hit { display: inline-flex; line-height: 0; }
  .story-page .story-logo svg { display: block; }
`;

/** @param {number} [pageIndex] índice da página (default = atual) */
function exportPageNode(pageIndex = state.pageIndex) {
  // re-render sem chrome de edição / safe / UI
  const prevEdit = state.editing;
  const prevUi = state.doc.uiPreview;
  const prevSafe = state.doc.showSafe;
  state.editing = false;
  state.doc.uiPreview = false;
  state.doc.showSafe = false;
  const pages = state.doc.pages;
  const idx = clampPageIndex(pageIndex, pages.length);
  const page = pages[idx];
  const node = renderStoryPage(page, idx, pages.length);
  state.editing = prevEdit;
  state.doc.uiPreview = prevUi;
  state.doc.showSafe = prevSafe;
  node.querySelectorAll('[data-export-hide]').forEach((el) => el.remove());
  return node;
}

/**
 * Serializa o artboard como XHTML (void tags self-close, & escapado).
 * outerHTML é HTML5 e quebra o parse XML do SVG (ex.: <img> sem />).
 */
function serializeExportXhtml(node) {
  return new XMLSerializer().serializeToString(node);
}

/** Rasteriza uma página → canvas 1080×1920. */
async function pageToCanvas(pageIndex = state.pageIndex) {
  const fontCss = await plexFontFace();
  const pages = state.doc.pages;
  const idx = clampPageIndex(pageIndex, pages.length);
  const page = pages[idx];
  // stickers: SVG precisa estar no cache (inline) antes do foreignObject
  await preloadPageStickers(page);
  const node = exportPageNode(idx);
  // rasteriza o artboard de TRABALHO (360×640) e escala p/ Instagram (1080×1920)
  const html = serializeExportXhtml(node);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${PAGE_W}px;height:${PAGE_H}px;margin:0;padding:0">` +
    `<style>${fontCss}${EXPORT_CSS}</style>${html}</div></foreignObject></svg>`;
  // data: URL (não blob:): blob+foreignObject taint o canvas no Chromium
  // ("Tainted canvases may not be exported") e toBlob/toDataURL falham.
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  img.decoding = 'async';
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error(`Falha ao rasterizar a página ${idx + 1}`));
    img.src = url;
  });
  await img.decode().catch(() => {});
  const c = document.createElement('canvas');
  c.width = EXPORT_W;
  c.height = EXPORT_H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = page.bg || DEFAULT_BG;
  ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
  // × EXPORT_SCALE (3): 360→1080, 640→1920
  ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H, 0, 0, EXPORT_W, EXPORT_H);
  return c;
}

async function canvasToBlob(canvas, mime, quality) {
  return new Promise((res) => canvas.toBlob(res, mime, quality));
}

async function exportRaster(mime, quality) {
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
  toast(`Gerando ${ext.toUpperCase()}…`);
  try {
    const canvas = await pageToCanvas(state.pageIndex);
    const blob = await canvasToBlob(canvas, mime, quality);
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

/**
 * Todas as páginas em um .zip de imagens (evita o browser bloquear N downloads).
 * Com 1 página, cai no export de página única.
 */
async function exportAllRaster(mime, quality) {
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
  const pages = state.doc.pages;
  const total = pages.length;
  if (total <= 1) {
    await exportRaster(mime, quality);
    return;
  }
  toast(`Gerando ${total} ${ext.toUpperCase()}…`);
  try {
    const base = slug(state.doc.title);
    const entries = [];
    for (let i = 0; i < total; i++) {
      toast(`Gerando ${ext.toUpperCase()} ${i + 1}/${total}…`);
      const canvas = await pageToCanvas(i);
      const blob = await canvasToBlob(canvas, mime, quality);
      if (!blob) throw new Error(`Canvas vazio (página ${i + 1})`);
      const data = new Uint8Array(await blob.arrayBuffer());
      entries.push({ name: `${base}-p${i + 1}.${ext}`, data });
    }
    const zip = makeZip(entries);
    downloadBlob(zip, `${base}-${ext}.zip`);
    toast(`${total} ${ext.toUpperCase()} baixados.`);
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
  wireChartModal();

  // shell canônico (ícones, sidebar slide, segment, zoom pop, chevrons)
  shell = bindEditorShell({
    onZoomFit() { state.zoom = 'fit'; applyZoom(); },
    onZoomPct(pct) { state.zoom = clampZoom(pct / 100); applyZoom(); },
    onSidebarChange() { if (state.zoom === 'fit') applyZoom(); },
    isZoomFit: () => state.zoom === 'fit',
    initialSegment: 'documento',
  });

  // hist
  shell.btnUndo?.addEventListener('click', undo);
  shell.btnRedo?.addEventListener('click', redo);

  // download menu
  const dlMenu = $('downloadMenu');
  const btnDl = $('btnDownload');
  function syncDlMulti() {
    const multi = (state.doc.pages?.length || 0) > 1;
    dlMenu.querySelectorAll('[data-dl-multi]').forEach((el) => {
      el.hidden = !multi;
    });
    // badge com contagem (ex.: "Todos · 4")
    const n = state.doc.pages?.length || 0;
    dlMenu.querySelectorAll('[data-dl-multi] .dl-badge').forEach((b) => {
      if (b.dataset.dlBadgeBase == null) b.dataset.dlBadgeBase = b.textContent || 'Todos';
      b.textContent = multi ? `${b.dataset.dlBadgeBase} · ${n}` : b.dataset.dlBadgeBase;
    });
  }
  function openDl() {
    syncDlMulti();
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
  dlMenu.querySelector('[data-dl="png-all"]').onclick = () => { closeDl(); exportAllRaster('image/png'); };
  dlMenu.querySelector('[data-dl="jpg-all"]').onclick = () => { closeDl(); exportAllRaster('image/jpeg', 0.92); };
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

  // segment: bindEditorShell

  $('marginMode').addEventListener('change', () => {
    state.doc.marginMode = clampMarginMode($('marginMode').value);
    render();
  });

  // ── Logo Paradigma (sidebar) ─────────────────────────────────────────────
  // preenche ícones do picker (uma vez)
  document.querySelectorAll('[data-logopick] button[data-logokind]').forEach((b) => {
    const k = b.dataset.logokind;
    if (k === 'none') b.innerHTML = LOGO_NONE_ICO;
    else b.innerHTML = logoPickSvg(k, 28, 72);
  });
  document.querySelectorAll('[data-logopick]').forEach((pick) => {
    pick.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-logokind]');
      if (!b) return;
      const lg = (state.doc.logo = normalizeStoriesLogo(state.doc.logo));
      if (b.dataset.logokind === 'none') lg.on = false;
      else {
        lg.on = true;
        lg.kind = b.dataset.logokind;
      }
      applyStoryLogoLive();
      save(); scheduleCommit();
      syncLogoUI();
    });
  });
  document.querySelectorAll('[data-logocolor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lg = (state.doc.logo = normalizeStoriesLogo(state.doc.logo));
      // com opacidade: pick recebe #hex ou rgba; grava o valor completo
      openSwatchPop(btn, (color) => {
        lg.color = color || '#000000';
        paintLogoColorField(btn, lg.color);
        applyStoryLogoLive();
        save(); scheduleCommit();
      }, lg.color); // opacity default = true
    });
  });
  document.querySelectorAll('[data-logosize]').forEach((s) => {
    s.addEventListener('input', () => {
      const lg = (state.doc.logo = normalizeStoriesLogo(state.doc.logo));
      lg.size = +s.value / 100;
      const sp = document.querySelector('[data-logosizev]');
      if (sp) sp.textContent = (+lg.size.toFixed(2)) + '×';
      applyStoryLogoLive();
      save(); scheduleCommit();
    });
  });
  document.querySelectorAll('[data-logosizereset]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const lg = (state.doc.logo = normalizeStoriesLogo(state.doc.logo));
      const defSize = defaultStoriesLogo().size;
      lg.size = defSize;
      const s = document.querySelector('[data-logosize]');
      if (s) s.value = String(Math.round(defSize * 100));
      const sp = document.querySelector('[data-logosizev]');
      if (sp) sp.textContent = (+defSize.toFixed(2)) + '×';
      applyStoryLogoLive();
      save(); scheduleCommit();
    });
  });
  // enhance slider do logo
  enhanceAll(document.querySelector('[data-logoopts]')?.parentElement || document);

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

  // Imagem de Fundo — UI idêntica à capa do Diagramador (Selecionar / Substituir+Remover + X/Y/escala)
  const btnBgReplace = $('btnBgReplace');
  const btnBgClear = $('btnBgClear');
  if (btnBgReplace) btnBgReplace.insertAdjacentHTML('afterbegin', REPLACE_ICO);
  if (btnBgClear) {
    btnBgClear.insertAdjacentHTML('afterbegin', TRASH_ICO);
    btnBgClear.addEventListener('click', () => {
      currentPage().bgImage = null;
      syncBgImageUI();
      render();
    });
  }
  async function onBgFileChange(inp) {
    const f = inp.files?.[0];
    inp.value = '';
    if (!f) return;
    const data = await readFileAsDataUrl(f);
    currentPage().bgImage = data;
    syncBgImageUI();
    render();
  }
  $('bgFile')?.addEventListener('change', (e) => onBgFileChange(e.target));
  $('bgFileReplace')?.addEventListener('change', (e) => onBgFileChange(e.target));

  $('bgX')?.addEventListener('input', (e) => {
    currentPage().bgX = +e.target.value;
    applyPageBgLive();
    save();
    scheduleCommit();
  });
  $('bgY')?.addEventListener('input', (e) => {
    currentPage().bgY = +e.target.value;
    applyPageBgLive();
    save();
    scheduleCommit();
  });
  $('bgScale')?.addEventListener('input', (e) => {
    currentPage().bgScale = +e.target.value;
    if ($('bgScaleVal')) $('bgScaleVal').textContent = (+e.target.value / 100).toFixed(2) + '×';
    applyPageBgLive();
    save();
    scheduleCommit();
  });
  // resets — default 50/50 e 100 (= 1×), iguais ao seed da capa no Diagramador
  const resetBgAxis = (key, val, inputId) => {
    currentPage()[key] = val;
    if ($(inputId)) $(inputId).value = val;
    applyPageBgLive();
    save();
    scheduleCommit();
  };
  $('bgXReset')?.addEventListener('mousedown', (e) => e.preventDefault());
  $('bgXReset')?.addEventListener('click', () => resetBgAxis('bgX', 50, 'bgX'));
  $('bgYReset')?.addEventListener('mousedown', (e) => e.preventDefault());
  $('bgYReset')?.addEventListener('click', () => resetBgAxis('bgY', 50, 'bgY'));
  $('bgScaleReset')?.addEventListener('mousedown', (e) => e.preventDefault());
  $('bgScaleReset')?.addEventListener('click', () => {
    currentPage().bgScale = 100;
    if ($('bgScale')) $('bgScale').value = 100;
    if ($('bgScaleVal')) $('bgScaleVal').textContent = '1.00×';
    applyPageBgLive();
    save();
    scheduleCommit();
  });
  // snaps + valor digitável nos ranges da sidebar (capa no Diagramador faz enhanceAll())
  enhanceAll(document.querySelector('aside#sidebar') || document);

  // ⋮ estilo do tipo Texto (letter-spacing global)
  document.querySelectorAll('.blockmenu[data-styletype]').forEach((btn) => {
    btn.innerHTML = uiIco('ellipsis-vertical', 14, 'solid');
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = btn.dataset.styletype;
      if (blockStyleType === t && blockStylePanel && !blockStylePanel.hidden) {
        closeBlockStylePanel();
        return;
      }
      openBlockStylePanel(t, btn);
    });
  });
  document.addEventListener('mousedown', (e) => {
    if (!blockStylePanel || blockStylePanel.hidden) return;
    if (e.target.closest('#blockStylePanel') || e.target.closest('.blockmenu')) return;
    closeBlockStylePanel();
  }, true);

  $('blocktypes').addEventListener('click', (e) => {
    if (e.target.closest('.blockmenu')) return;
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    addBlock(btn.dataset.type);
  });

  // + / ⠿ / menu — listeners no createBlockHandles (ui-handles.js)
  // menu Texto|Imagem: + do bloco OU clique no vazio (handler em pagesEl)

  $('colAddMenu')?.querySelectorAll('button[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!colAddCtx) return;
      const { afterId } = colAddCtx;
      addBlock(btn.dataset.type, afterId);
    });
  });

  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    if (t.closest?.('#colAddMenu, #badd')) { /* keep */ }
    else closeColAddMenu();
    if (t.closest?.('#bmenu, #bhandle, #brotate')) { /* keep */ }
    else closeBlockMenu();
    // clicar fora do bloco/popover fecha o painel (mantém sel só se for chrome do bloco)
    const inImgChrome = t.closest?.('#imgPanel, #stickerPanel, .blk.image, .blk.sticker, .swatch-pop, #bhandle, #badd, #bmenu, #brotate, #brotate-badge');
    const inTxtChrome = t.closest?.('#textPanel, #blockStylePanel, .blk.text, .swatch-pop, #bhandle, #badd, #bmenu, #brotate, #brotate-badge, #fmtbar');
    if (state.sel && !inImgChrome && !t.closest?.('#sidebar')) {
      // não limpa seleção de imagem/sticker ao clicar na sidebar; fora do artboard fecha
      if (!t.closest?.('#pages, #imgPanel, #stickerPanel')) {
        closeImgPanel();
        closeStickerPanel();
      }
    }
    if (state.activeId && blockOf(state.activeId)?.type === 'text'
      && !inTxtChrome && !t.closest?.('#sidebar')) {
      if (!t.closest?.('#pages, #textPanel')) {
        closeTextPanel();
      }
    }
  }, true);

  // alças só no selecionado: reancora no scroll/zoom/move do mouse (não segue hover)
  document.addEventListener('mousemove', () => {
    if (!state.editing || drag || handles.handlePending) return;
    showHandleAtFocused();
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
    // ← / → navegam slides (atalho). Não rouba setas de caret/input/slider.
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey) {
      const t = e.target;
      const typing = t instanceof Element && t.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
      );
      if (!typing) {
        e.preventDefault();
        goToPage(state.pageIndex + (e.key === 'ArrowRight' ? 1 : -1));
        return;
      }
    }
    if (e.key === 'Escape') {
      closeFmtbar();
      closeDl();
      closeColAddMenu();
      closeBlockMenu();
      closeImgPanel();
      closeTextPanel();
      closeStickerPanel();
      hideHandles();
      state.sel = null;
      pagesEl.querySelectorAll('.blk.image.selected, .blk.image.imgsel, .blk.sticker.selected, .blk.sticker.imgsel').forEach((el) => {
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
