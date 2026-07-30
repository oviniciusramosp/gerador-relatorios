/* Núcleo puro do Criador de Stories.
 *
 * Canvas de TRABALHO (editor): 360×640 — 9:16 no tamanho próximo de um
 * smartphone na tela. Export Instagram: 1080×1920 (×3, EXPORT_SCALE).
 *
 * Sem DOM. Testado em test-stories.mjs — o que quebraria calado sem ele:
 * dimensões erradas, colunas fora de 50/50, zonas de margem invertidas,
 * seed/open sem kind/pages, página ativa fora do range, escala de export.
 */

/** Largura/altura do artboard no editor (px CSS 1:1). */
export const PAGE_W = 360;
export const PAGE_H = 640;

/** Dimensões de export Instagram Stories. */
export const EXPORT_W = 1080;
export const EXPORT_H = 1920;
/** Fator editor → export (360×3 = 1080, 640×3 = 1920). */
export const EXPORT_SCALE = EXPORT_W / PAGE_W; // 3

export const COL_GAP = 0;
export const COL_COUNT = 2;
/** Metade do canvas de trabalho; colunas de conteúdo usam colRect() no safe. */
export const COL_W = PAGE_W / COL_COUNT; // 180

/** Fundo padrão de página nova. */
export const DEFAULT_BG = '#FFFFFF';
/** Cor padrão de texto novo (sobre fundo branco). */
export const DEFAULT_TEXT = '#000000';

/**
 * Margens de segurança no canvas de TRABALHO (360×640).
 * Spec no export 1080×1920: 110px horizontal · 165px vertical
 * → no editor (÷3): 110/3 ≈ 36.67 → 37 · 165/3 = 55.
 */
export const SAFE = Object.freeze({
  stories: Object.freeze({
    top: 55,
    bottom: 55,
    left: 37,
    right: 37,
  }),
  reels: Object.freeze({
    top: 55,
    bottom: 55,
    left: 37,
    right: 37,
  }),
});

/** Spec Instagram (px no arquivo exportado). Útil p/ UI e testes. */
export const SAFE_EXPORT = Object.freeze({
  top: 165,
  bottom: 165,
  left: 110,
  right: 110,
});

export function clampMarginMode(mode) {
  return mode === 'reels' ? 'reels' : 'stories';
}

export function safeOf(mode) {
  return SAFE[clampMarginMode(mode)];
}

/** Área útil dentro das safe margins (conteúdo “seguro”). */
export function safeRect(mode) {
  const s = safeOf(mode);
  return {
    x: s.left,
    y: s.top,
    w: PAGE_W - s.left - s.right,
    h: PAGE_H - s.top - s.bottom,
  };
}

/** Retângulos das zonas “perigosas” (UI / fora da safe area). */
export function dangerZones(mode) {
  const s = safeOf(mode);
  const zones = [
    { id: 'top', x: 0, y: 0, w: PAGE_W, h: s.top },
    { id: 'bottom', x: 0, y: PAGE_H - s.bottom, w: PAGE_W, h: s.bottom },
  ];
  if (s.left > 0) {
    zones.push({
      id: 'left',
      x: 0,
      y: s.top,
      w: s.left,
      h: PAGE_H - s.top - s.bottom,
    });
  }
  if (s.right > 0) {
    zones.push({
      id: 'right',
      x: PAGE_W - s.right,
      y: s.top,
      w: s.right,
      h: PAGE_H - s.top - s.bottom,
    });
  }
  return zones;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * @param {'text'|'image'} type
 * @param {'left'|'right'|'full'} [col] default full (largura total)
 */
export function mkBlock(type, col = 'full') {
  const c = col === 'right' || col === 'left' ? col : 'full';
  if (type === 'image') {
    return {
      id: uid(),
      type: 'image',
      col: c,
      src: null,
      y: 0,
      h: 200, // cache de altura no canvas de trabalho
      radius: 4,
      scale: 100,
    };
  }
  return {
    id: uid(),
    type: 'text',
    col: c,
    html: '',
    size: 24, // ~48 no export ×3
    weight: 600,
    align: 'left',
    color: DEFAULT_TEXT,
    y: 0,
  };
}

export function mkPage() {
  return {
    id: uid(),
    bg: DEFAULT_BG,
    bgImage: null,
    blocks: [mkBlock('text', 'full')],
  };
}

export function seedDoc() {
  return {
    kind: 'stories',
    title: 'Story',
    marginMode: 'stories',
    uiPreview: true,
    showSafe: true,
    pages: [mkPage()],
  };
}

/** Defaults ao abrir .pdgm (aditivo — nunca apaga pages/blocks). */
export function normalizeStoriesDoc(raw) {
  const base = seedDoc();
  const doc = raw && typeof raw === 'object' ? raw : {};
  const out = { ...base, ...doc, kind: 'stories' };
  out.marginMode = clampMarginMode(out.marginMode);
  out.uiPreview = out.uiPreview !== false;
  out.showSafe = out.showSafe !== false;
  out.title = (out.title != null && String(out.title)) || base.title;
  if (!Array.isArray(out.pages) || !out.pages.length) out.pages = [mkPage()];
  out.pages = out.pages.map((p) => normalizePage(p));
  return out;
}

function normalizePage(p) {
  const blank = mkPage();
  if (!p || typeof p !== 'object') return blank;
  const page = {
    id: p.id || uid(),
    bg: typeof p.bg === 'string' && p.bg ? p.bg : blank.bg,
    bgImage: typeof p.bgImage === 'string' ? p.bgImage : null,
    blocks: Array.isArray(p.blocks) ? p.blocks.map(normalizeBlock).filter(Boolean) : [],
  };
  if (!page.blocks.length) page.blocks = [mkBlock('text', 'full')];
  return page;
}

function normalizeBlock(b) {
  if (!b || typeof b !== 'object') return null;
  if (b.type === 'image') {
    const col = b.col === 'right' || b.col === 'left' ? b.col : 'full';
    const scale = Number.isFinite(+b.scale) ? Math.min(100, Math.max(10, +b.scale)) : 100;
    const radius = Number.isFinite(+b.radius) ? Math.max(0, Math.min(540, Math.round(+b.radius))) : 4;
    const out = {
      id: b.id || uid(),
      type: 'image',
      col,
      src: typeof b.src === 'string' ? b.src : null,
      y: Number.isFinite(+b.y) ? Math.max(0, +b.y) : 0,
      h: Number.isFinite(+b.h) ? Math.max(40, +b.h) : 200,
      radius,
      scale,
    };
    if (b.imgAlign === 'center' || b.align === 'center') out.imgAlign = 'center';
    if (Number.isFinite(+b.nw)) out.nw = +b.nw;
    if (Number.isFinite(+b.nh)) out.nh = +b.nh;
    if (b.title != null) out.title = b.title;
    if (b.caption != null) out.caption = b.caption;
    return out;
  }
  const col = b.col === 'right' || b.col === 'left' ? b.col : 'full';
  return {
    id: b.id || uid(),
    type: 'text',
    col,
    html: b.html != null ? String(b.html) : '',
    size: Number.isFinite(+b.size) ? Math.min(120, Math.max(10, +b.size)) : 24,
    weight: Number.isFinite(+b.weight) ? Math.min(700, Math.max(100, +b.weight)) : 600,
    align: b.align === 'center' || b.align === 'right' ? b.align : 'left',
    color: typeof b.color === 'string' && b.color ? b.color : DEFAULT_TEXT,
    y: Number.isFinite(+b.y) ? Math.max(0, +b.y) : 0,
  };
}

export function clampPageIndex(i, nPages) {
  const n = Math.max(1, nPages | 0);
  const x = Number.isFinite(+i) ? Math.floor(+i) : 0;
  return Math.min(n - 1, Math.max(0, x));
}

export function isStoriesDoc(doc) {
  return !!(doc && typeof doc === 'object' && doc.kind === 'stories');
}

/**
 * Geometria da coluna DENTRO das safe margins (gap 0 · 50% da área útil).
 * @param {'left'|'right'|'full'} col
 * @param {'stories'|'reels'} [mode]
 */
export function colRect(col, mode = 'stories') {
  const r = safeRect(mode);
  if (col === 'full') return { x: r.x, y: r.y, w: r.w, h: r.h };
  const half = r.w / COL_COUNT;
  if (col === 'right') return { x: r.x + half, y: r.y, w: half, h: r.h };
  return { x: r.x, y: r.y, w: half, h: r.h };
}
