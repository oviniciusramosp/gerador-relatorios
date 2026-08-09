/* Núcleo puro do Criador de Stories.
 *
 * Canvas de TRABALHO (editor): 360×640 — 9:16 no tamanho próximo de um
 * smartphone na tela. Export Instagram: 1080×1920 (×3, EXPORT_SCALE).
 *
 * Layout de blocos: freestyle na safe area (x, y, scale % da largura útil).
 * Colunas L/R são legado — migrate no normalize para x+scale.
 *
 * Sem DOM. Testado em test-stories.mjs — o que quebraria calado sem ele:
 * dimensões erradas, migração col→x, zonas de margem invertidas,
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

/** @deprecated layout freestyle — mantido p/ testes legados / colRect. */
export const COL_GAP = 0;
/** @deprecated */
export const COL_COUNT = 2;
/** @deprecated metade do artboard; conteúdo usa scale % da safe. */
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

// ── rotação de bloco (graus, aditivo — ausente = 0) ─────────────────────────
/** Passo dos ímãs: 0, ±15, ±30, ±45… ±180. */
export const ROTATE_SNAP_STEP = 15;
/** Distância (°) em que o ímã puxa pro snap. */
export const ROTATE_SNAP_THRESH = 4;
/** Snaps canônicos em (−180, 180]: −165…−15, 0, 15…165, 180. */
export const ROTATE_SNAPS = Object.freeze(
  Array.from({ length: 24 }, (_, i) => -165 + i * ROTATE_SNAP_STEP),
);

/**
 * Normaliza graus para (−180, 180]. Inválido → 0.
 * 180 e −180 colapsam em 180.
 */
export function clampRotate(n) {
  const v = +n;
  if (!Number.isFinite(v)) return 0;
  // fmod para (−180, 180]
  let d = ((((v + 180) % 360) + 360) % 360) - 180;
  if (d === -180) d = 180;
  // 1 casa: evita float lixo do atan2; 0.0 → 0
  const r = Math.round(d * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

/** Distância angular mínima entre a e b (0–180). */
export function rotateDist(a, b) {
  const d = Math.abs(clampRotate(a) - clampRotate(b));
  return Math.min(d, 360 - d);
}

/**
 * Ímã nos ângulos comuns (0, 15, 30, 45, 90…).
 * Longe do snap: arredonda pro grau inteiro (controle livre).
 * @param {number} deg
 * @param {{ snaps?: number[], threshold?: number }} [opts]
 */
export function snapRotate(deg, opts = {}) {
  const snaps = Array.isArray(opts.snaps) && opts.snaps.length
    ? opts.snaps
    : ROTATE_SNAPS;
  const thresh = Number.isFinite(+opts.threshold)
    ? Math.max(0, +opts.threshold)
    : ROTATE_SNAP_THRESH;
  const n = clampRotate(deg);
  let best = n;
  let bestD = Infinity;
  for (const s of snaps) {
    const d = rotateDist(n, s);
    if (d < bestD) {
      bestD = d;
      best = clampRotate(s);
    }
  }
  if (bestD <= thresh) return best;
  return Math.round(n);
}

/** Leitura segura: ausente/0 → 0 (sem campo no disco). */
export function rotateOf(b) {
  if (!b || b.rotate == null) return 0;
  return clampRotate(b.rotate);
}

/**
 * Grava rotação no bloco (aditivo): 0 apaga o campo.
 * @param {object} b
 * @param {number} deg — já preferencialmente snappado
 */
export function setBlockRotate(b, deg) {
  if (!b || typeof b !== 'object') return b;
  const r = clampRotate(deg);
  if (!r) delete b.rotate;
  else b.rotate = r;
  return b;
}

// ── perspectiva 3D (tilt no frame da imagem/gráfico) ────────────────────────
// CSS: perspective + rotateY — “card em perspectiva”. Aditivo (0 = omitido).
// Distinto de `rotate` (giro plano no .blk, alça do canto).
/** Amplitude máx. do tilt (|°|). */
export const TILT_MAX = 60;
/** Distância de perspectiva no transform (px CSS). */
export const TILT_PERSPECTIVE_PX = 900;

/** Clamp inteiro em [−TILT_MAX, TILT_MAX]. Inválido → 0. */
export function clampTilt(n) {
  const v = Math.round(+n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(TILT_MAX, Math.max(-TILT_MAX, v));
}

/** Leitura segura: ausente/0 → 0. */
export function tiltOf(b) {
  if (!b || b.tilt == null) return 0;
  return clampTilt(b.tilt);
}

/**
 * Grava tilt no bloco (aditivo): 0 apaga o campo.
 * @param {object} b
 * @param {number} deg
 */
export function setBlockTilt(b, deg) {
  if (!b || typeof b !== 'object') return b;
  const t = clampTilt(deg);
  if (!t) delete b.tilt;
  else b.tilt = t;
  return b;
}

/** CSS do frame: perspective + rotateY (vazio se 0). */
export function imgTiltCss(b) {
  const t = tiltOf(b);
  if (!t) return '';
  return `perspective(${TILT_PERSPECTIVE_PX}px) rotateY(${t}deg)`;
}

/**
 * Canto de um retângulo rotacionado em torno do centro (viewport/local).
 * Local: +x direita, +y baixo; canto TR = (+halfW, −halfH).
 * `pad` empurra o ponto para fora ao longo da diagonal do canto (px no mesmo espaço).
 * @param {number} cx
 * @param {number} cy
 * @param {number} halfW
 * @param {number} halfH
 * @param {number} deg — rotação do bloco (graus)
 * @param {'tr'|'tl'|'br'|'bl'} [corner='tr']
 * @param {number} [pad=0]
 * @returns {{ x: number, y: number }}
 */
export function rotatedBoxCorner(cx, cy, halfW, halfH, deg, corner = 'tr', pad = 0) {
  const hw = Math.max(0, +halfW || 0);
  const hh = Math.max(0, +halfH || 0);
  let lx = hw;
  let ly = -hh;
  if (corner === 'tl') { lx = -hw; ly = -hh; }
  else if (corner === 'br') { lx = hw; ly = hh; }
  else if (corner === 'bl') { lx = -hw; ly = hh; }
  // else 'tr' default
  const plen = Math.hypot(lx, ly);
  if (pad && plen > 0) {
    lx += (lx / plen) * pad;
    ly += (ly / plen) * pad;
  }
  const rad = (clampRotate(deg) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: (+cx || 0) + lx * cos - ly * sin,
    y: (+cy || 0) + lx * sin + ly * cos,
  };
}

/** Escala default do sticker token (~¼ da safe — ícone, não full-bleed). */
export const DEFAULT_STICKER_SCALE = 28;
/** Altura default (px) até medir aspect; token é quadrado. */
export const DEFAULT_STICKER_H = 80;

/**
 * @param {'text'|'image'|'chart'|'sticker'} type
 * chart = bloco imagem com b.chart { kind, spec } (mesmo contrato do Diagramador)
 * sticker = elemento pré-definido (hoje: token/ícone de cripto)
 */
export function mkBlock(type) {
  if (type === 'image' || type === 'chart') {
    const b = {
      id: uid(),
      type: 'image',
      src: null,
      x: 0, // px na safe area (blocks-layer)
      y: 0,
      h: 200, // cache de altura no canvas de trabalho
      radius: 4,
      scale: 100, // % da largura da safe area
      shadow: 0, // 0–100 — intensidade da drop shadow suave
      // border / borderColor / rotate / tilt: opcionais (aditivos no normalize)
    };
    // gráfico nasce como imagem + flag chart (spec chega pelo modal)
    if (type === 'chart') b.chart = { kind: 'chart', spec: null };
    return b;
  }
  if (type === 'sticker') {
    return {
      id: uid(),
      type: 'sticker',
      sticker: 'token', // kinds futuros: badge, seta…
      symbol: 'btc', // token: symbol lowercase (coin-icons/{symbol}.svg)
      x: 0,
      y: 0,
      h: DEFAULT_STICKER_H,
      scale: DEFAULT_STICKER_SCALE,
      // rotate: opcional (aditivo)
    };
  }
  return {
    id: uid(),
    type: 'text',
    html: '',
    size: 24, // ~72 no export ×3
    weight: 400, // negrito via fmtbar (B), não peso do bloco
    align: 'left',
    color: DEFAULT_TEXT,
    x: 0,
    y: 0,
    scale: 100, // % da largura da safe (caixa do texto)
    // rotate: opcional (aditivo)
  };
}

/** Kinds de sticker conhecidos (aditivo — desconhecido → token). */
export const STICKER_KINDS = Object.freeze(['token']);

export function clampStickerKind(k) {
  return k === 'token' ? 'token' : 'token';
}

/** Symbol do token sticker (string limpa; vazio → btc). */
export function clampStickerSymbol(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return t || 'btc';
}

/** Escala de largura do bloco (% da safe). 10–100. */
export function clampBlockScale(n, fallback = 100) {
  const s = +n;
  if (!Number.isFinite(s)) return fallback;
  return Math.min(100, Math.max(10, Math.round(s * 10) / 10));
}

export function blockScaleOf(b) {
  if (!b) return 100;
  if (b.scale == null) return 100;
  return clampBlockScale(b.scale, 100);
}

/** Largura do bloco em px na safe area. */
export function blockWidthPx(b, mode = 'stories') {
  const sw = safeRect(mode).w;
  return sw * (blockScaleOf(b) / 100);
}

/**
 * Converte layout legado (col left|right|full + imgAlign) → { x, scale }.
 * Se `x` já existe no bloco, só clampa scale e devolve x.
 * @param {object} b
 * @param {'stories'|'reels'} [mode]
 */
export function migrateBlockLayout(b, mode = 'stories') {
  const sw = safeRect(mode).w;
  const half = sw / 2;
  const hasX = Number.isFinite(+b?.x);
  let scale = blockScaleOf(b);
  // scale legado era % da coluna; left/right = metade → em full vira scale/2
  const col = b?.col === 'left' || b?.col === 'right' ? b.col : 'full';
  if (!hasX && (col === 'left' || col === 'right')) {
    scale = clampBlockScale(scale * 0.5, 50);
  }
  if (hasX) {
    return { x: Math.max(0, +b.x), scale };
  }
  const w = sw * (scale / 100);
  // imgAlign / align legado de imagem — NÃO usar text.align (é text-align)
  const alignCenter = b?.imgAlign === 'center'
    || (b?.type === 'image' && b?.align === 'center');
  const alignRight = b?.imgAlign === 'right'
    || (b?.type === 'image' && b?.align === 'right');
  let x = 0;
  if (col === 'right') {
    x = half;
    if (alignCenter && scale < 100) x = half + (half - w) / 2;
    else if (alignRight) x = sw - w;
  } else if (col === 'left') {
    x = 0;
    if (alignCenter && w < half) x = (half - w) / 2;
    else if (alignRight) x = half - w;
  } else {
    // full
    if (alignCenter && scale < 100) x = (sw - w) / 2;
    else if (alignRight) x = sw - w;
    else x = 0;
  }
  return { x: Math.max(0, Math.round(x)), scale };
}

export function mkPage() {
  return {
    id: uid(),
    bg: DEFAULT_BG,
    bgImage: null,
    // Fill: posição % + zoom (100 = cover puro) — mesmo contrato da capa no Diagramador
    bgX: 50,
    bgY: 50,
    bgScale: 100,
    blocks: [mkBlock('text', 'full')],
  };
}

/**
 * Logo Paradigma no story (doc-level, todas as páginas).
 * Novo story: Completo, rodapé, centro, 0.7×.
 * on:false = Nenhum; kind: icone | full | nome.
 * pos: header (dentro da safe) | footer (fora, centrado nos 55px = 165 export).
 */
export function defaultStoriesLogo() {
  return {
    on: true,
    kind: 'full',
    pos: 'footer',
    align: 'center',
    color: '#000000',
    size: 0.7,
  };
}

export function normalizeStoriesLogo(raw) {
  const d = defaultStoriesLogo();
  // doc antigo sem logo: não força o logo novo em projetos salvos
  if (!raw || typeof raw !== 'object') {
    return { ...d, on: false };
  }
  const kind = raw.kind === 'icone' || raw.kind === 'full' || raw.kind === 'nome'
    ? raw.kind
    : d.kind;
  const size = Number.isFinite(+raw.size)
    ? Math.min(2.6, Math.max(0.4, +raw.size))
    : d.size;
  return {
    on: raw.on === true,
    kind,
    pos: raw.pos === 'footer' ? 'footer' : (raw.pos === 'header' ? 'header' : d.pos),
    align: raw.align === 'center' || raw.align === 'right' || raw.align === 'left'
      ? raw.align
      : d.align,
    color: typeof raw.color === 'string' && raw.color ? raw.color : d.color,
    size,
  };
}

export function seedDoc() {
  return {
    kind: 'stories',
    title: 'Story',
    marginMode: 'stories',
    uiPreview: true,
    showSafe: true,
    // estilo global do tipo Texto (⋮ na aba Conteúdo) — igual blockStyles do Diagramador
    blockStyles: {},
    // estilo padrão do highlight da fmtbar (seleção)
    hiliteStyle: 'solid',
    // logo Paradigma (header/footer)
    logo: defaultStoriesLogo(),
    pages: [mkPage()],
  };
}

// ── tipografia / efeitos de texto ───────────────────────────────────────────
/**
 * Defaults do tipo Texto (doc.blockStyles.text).
 * letterSpacing em em — default mais apertado que o −0.01 anterior (títulos de story).
 */
export const TEXT_STYLE_DEFAULTS = Object.freeze({
  letterSpacing: -0.03,
});

/** Estilos de highlight da fmtbar. `none` = remover destaque da seleção. */
export const HILITE_STYLES = Object.freeze([
  'solid', 'marker', 'brush', 'underline', 'rounded', 'none',
]);

/** Rótulos PT do menu de estilo (fmtbar). */
export const HILITE_STYLE_LABELS = Object.freeze({
  solid: 'Sólido',
  marker: 'Marcador',
  brush: 'Pincel',
  underline: 'Traço',
  rounded: 'Pill',
  none: 'Nenhum',
});

export function clampHiliteStyle(s) {
  return HILITE_STYLES.includes(s) ? s : 'solid';
}

export function hiliteStyleLabel(s) {
  const k = clampHiliteStyle(s);
  return HILITE_STYLE_LABELS[k] || HILITE_STYLE_LABELS.solid;
}

/**
 * Máscara SVG de pincel — traço de marca-texto suave (borda levemente ondulada,
 * textura sutil). NÃO aplicar mask no elemento de texto (corta a opacidade do
 * glifo): a máscara vai no ::before (só a tinta).
 * Branco = tinta; preto = alívio. preserveAspectRatio=none estica na linha.
 */
const HILITE_BRUSH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 40" preserveAspectRatio="none">'
  // corpo: faixa quase reta, top/bottom com ondulação leve (não cartoon)
  + '<path fill="#fff" d="M1 11C28 7 56 13 84 9C112 6 140 12 168 8C196 5 224 11 252 7C280 4 308 10 336 6C358 4 380 8 399 10L398 30C376 33 352 29 328 32C300 35 272 29 244 33C216 36 188 30 160 34C132 37 104 31 76 35C48 38 24 33 1 29Z"/>'
  // alívio sutil (baixa opacidade — densidade da tinta, não “furos” cartunescos)
  + '<ellipse fill="#000" opacity=".1" cx="70" cy="13" rx="36" ry="3.2"/>'
  + '<ellipse fill="#000" opacity=".08" cx="180" cy="27" rx="48" ry="2.8"/>'
  + '<ellipse fill="#000" opacity=".09" cx="300" cy="14" rx="40" ry="2.6"/>'
  + '<ellipse fill="#000" opacity=".07" cx="240" cy="26" rx="28" ry="2.2"/>'
  + '</svg>';

export const HILITE_BRUSH_MASK = 'data:image/svg+xml,' + encodeURIComponent(HILITE_BRUSH_SVG);

/**
 * CSS de highlight com efeitos (marcador / pincel / pill).
 * Canvas (.txt-hl-*) + prévia do menu (.hl-prev-*).
 * Pincel e marcador pintam no ::before — o texto fica 100% opaco.
 */
export function hiliteBrushCss() {
  const m = HILITE_BRUSH_MASK;
  return `
/* base: stacking p/ ::before atrás do glifo */
.story-page .blk.text .txt-hl-marker,
.story-page .blk.text .txt-hl-brush,
.hilite-style-menu .hl-prev-marker,
.hilite-style-menu .hl-prev-brush {
  position: relative;
  isolation: isolate;
  background: none !important;
  background-image: none !important;
}

/* ── Marcador: faixa com bordas em diagonal + cantos levemente arredondados ── */
.story-page .blk.text .txt-hl-marker,
.hilite-style-menu .hl-prev-marker {
  padding: 0.1em 0.28em;
}
.story-page .blk.text .txt-hl-marker::before,
.hilite-style-menu .hl-prev-marker::before {
  content: "";
  position: absolute;
  left: 0.02em; right: 0.02em;
  top: 0.16em; bottom: 0.1em;
  background: var(--hl, #FFF3A3);
  transform: skewX(-14deg);
  border-radius: 0.28em;
  z-index: -1;
  pointer-events: none;
}

/* ── Pincel: tinta no ::before (mask) — texto não herda a textura ── */
.story-page .blk.text .txt-hl-brush,
.hilite-style-menu .hl-prev-brush {
  padding: 0.12em 0.2em;
}
.story-page .blk.text .txt-hl-brush::before,
.hilite-style-menu .hl-prev-brush::before {
  content: "";
  position: absolute;
  left: -0.06em; right: -0.06em;
  top: 0.1em; bottom: 0.06em;
  background-color: var(--hl, #FFF3A3);
  -webkit-mask-image: url("${m}");
  mask-image: url("${m}");
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-mode: luminance;
  mask-mode: luminance;
  z-index: -1;
  pointer-events: none;
}

/* ── Pill: border-radius lateral se encontra (cápsula) ── */
.story-page .blk.text .txt-hl-rounded,
.hilite-style-menu .hl-prev-rounded {
  background-color: var(--hl, #FFF3A3);
  padding: 0.1em 0.55em;
  border-radius: 999px;
}

.hilite-style-menu .hl-prev-marker,
.hilite-style-menu .hl-prev-brush,
.hilite-style-menu .hl-prev-rounded {
  display: inline-block;
}
`;
}

export function clampLetterSpacing(n) {
  const v = +n;
  if (!Number.isFinite(v)) return TEXT_STYLE_DEFAULTS.letterSpacing;
  return Math.min(0.15, Math.max(-0.08, Math.round(v * 100) / 100));
}

/** letter-spacing efetivo (em) do doc — override em blockStyles.text ou default. */
export function textLetterSpacingOf(doc) {
  const o = doc && doc.blockStyles && doc.blockStyles.text;
  if (o && o.letterSpacing != null && Number.isFinite(+o.letterSpacing)) {
    return clampLetterSpacing(o.letterSpacing);
  }
  return TEXT_STYLE_DEFAULTS.letterSpacing;
}

export function textBorderOf(b) {
  const w = Number.isFinite(+b?.textBorder) ? Math.round(+b.textBorder) : 0;
  return Math.min(8, Math.max(0, w));
}
export function textBorderColorOf(b) {
  return (typeof b?.textBorderColor === 'string' && b.textBorderColor) || '#FFFFFF';
}

/** Borda de imagem (px). 0 = off. Max 24 (slider). */
export function imgBorderOf(b) {
  const w = Number.isFinite(+b?.border) ? Math.round(+b.border) : 0;
  return Math.min(24, Math.max(0, w));
}
/** Cor da borda de imagem (default branco — comum em stories). */
export function imgBorderColorOf(b) {
  return (typeof b?.borderColor === 'string' && b.borderColor) || '#FFFFFF';
}
export function textShadow3dOf(b) {
  const n = Number.isFinite(+b?.textShadow3d) ? Math.round(+b.textShadow3d) : 0;
  return Math.min(100, Math.max(0, n));
}
export function textShadow3dColorOf(b) {
  return (typeof b?.textShadow3dColor === 'string' && b.textShadow3dColor) || '#000000';
}

/**
 * Anéis densos de text-shadow = contorno contínuo com cantos arredondados.
 * (8 direções a 45° deixavam a borda “faceted”/desconectada nas curvas do glifo.)
 * @returns {string[]}
 */
export function textOutlineShadows(width, color) {
  const w = Math.max(0, Math.round(+width) || 0);
  if (w <= 0 || !color) return [];
  const parts = [];
  for (let r = 1; r <= w; r++) {
    // mais amostras no raio externo → borda redonda e fechada
    const steps = Math.max(16, r * 8);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r * 100) / 100;
      const y = Math.round(Math.sin(a) * r * 100) / 100;
      parts.push(`${x}px ${y}px 0 ${color}`);
    }
  }
  return parts;
}

/**
 * CSS de borda + sombra 3D extrudada.
 * Borda: -webkit-text-stroke (path contínuo) + anéis densos de shadow (cantos redondos,
 * export-safe em foreignObject). 3D: camadas diagonais empilhadas.
 * @returns {{ webkitTextStroke: string, textShadow: string, paintOrder: string }}
 */
export function textEffectsCss(b) {
  const border = textBorderOf(b);
  const borderColor = textBorderColorOf(b);
  const depth = textShadow3dOf(b);
  const shadowColor = textShadow3dColorOf(b);
  const shadows = [];
  if (border > 0) {
    shadows.push(...textOutlineShadows(border, borderColor));
  }
  if (depth > 0) {
    // 0–100 → 1–16 camadas (1px a 16px na diagonal)
    const layers = Math.max(1, Math.round((depth / 100) * 16));
    for (let i = 1; i <= layers; i++) {
      shadows.push(`${i}px ${i}px 0 ${shadowColor}`);
    }
  }
  return {
    // stroke desenha o contorno contínuo do glifo; paint-order mantém o fill por cima
    webkitTextStroke: border > 0 ? `${border}px ${borderColor}` : '',
    textShadow: shadows.length ? shadows.join(', ') : 'none',
    paintOrder: border > 0 ? 'stroke fill' : '',
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
  out.hiliteStyle = clampHiliteStyle(out.hiliteStyle);
  // doc.logo (cru): se ausente, normalizeStoriesLogo mantém off (legado)
  out.logo = normalizeStoriesLogo(doc.logo);
  if (!out.blockStyles || typeof out.blockStyles !== 'object') out.blockStyles = {};
  else {
    // só normaliza letterSpacing se presente (aditivo)
    const t = out.blockStyles.text;
    if (t && typeof t === 'object' && t.letterSpacing != null) {
      out.blockStyles = {
        ...out.blockStyles,
        text: { ...t, letterSpacing: clampLetterSpacing(t.letterSpacing) },
      };
    }
  }
  if (!Array.isArray(out.pages) || !out.pages.length) out.pages = [mkPage()];
  out.pages = out.pages.map((p) => normalizePage(p));
  return out;
}

function clampPct(n, fallback = 50) {
  const v = +n;
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, v));
}

function clampBgScale(n) {
  const v = +n;
  if (!Number.isFinite(v)) return 100;
  return Math.min(250, Math.max(100, v));
}

function normalizePage(p) {
  const blank = mkPage();
  if (!p || typeof p !== 'object') return blank;
  const page = {
    id: p.id || uid(),
    bg: typeof p.bg === 'string' && p.bg ? p.bg : blank.bg,
    bgImage: typeof p.bgImage === 'string' ? p.bgImage : null,
    bgX: clampPct(p.bgX, blank.bgX),
    bgY: clampPct(p.bgY, blank.bgY),
    bgScale: clampBgScale(p.bgScale),
    blocks: Array.isArray(p.blocks) ? p.blocks.map(normalizeBlock).filter(Boolean) : [],
  };
  if (!page.blocks.length) page.blocks = [mkBlock('text', 'full')];
  return page;
}

function normalizeBlock(b) {
  if (!b || typeof b !== 'object') return null;
  if (b.type === 'image') {
    const layout = migrateBlockLayout(b);
    const radius = Number.isFinite(+b.radius) ? Math.max(0, Math.min(540, Math.round(+b.radius))) : 4;
    const shadow = Number.isFinite(+b.shadow) ? Math.min(100, Math.max(0, Math.round(+b.shadow))) : 0;
    const out = {
      id: b.id || uid(),
      type: 'image',
      src: typeof b.src === 'string' ? b.src : null,
      x: layout.x,
      y: Number.isFinite(+b.y) ? Math.max(0, +b.y) : 0,
      h: Number.isFinite(+b.h) ? Math.max(40, +b.h) : 200,
      radius,
      scale: layout.scale,
      shadow,
    };
    if (Number.isFinite(+b.nw)) out.nw = +b.nw;
    if (Number.isFinite(+b.nh)) out.nh = +b.nh;
    // borda opcional (aditiva — ausente = off)
    const border = imgBorderOf(b);
    if (border > 0) {
      out.border = border;
      if (typeof b.borderColor === 'string' && b.borderColor) out.borderColor = b.borderColor;
    }
    // gráfico/timeline editável (mesmo shape do Diagramador)
    if (b.chart && typeof b.chart === 'object') {
      const kind = b.chart.kind === 'timeline' ? 'timeline' : 'chart';
      if (b.chart.spec != null) out.chart = { kind, spec: b.chart.spec };
      else out.chart = { kind, spec: null }; // placeholder até o modal
    }
    // rotação plana opcional (aditiva — 0/ausente = omitido)
    const rot = rotateOf(b);
    if (rot) out.rotate = rot;
    // perspectiva 3D (tilt) — só imagem/gráfico
    const tilt = tiltOf(b);
    if (tilt) out.tilt = tilt;
    // title/caption/col/imgAlign legados: não regravados
    return out;
  }
  if (b.type === 'sticker') {
    // sticker novo: default de scale é 28 (não 100) se ausente — senão o ícone
    // vira full-bleed no open de seed.
    const hasScale = b.scale != null && Number.isFinite(+b.scale);
    const layout = migrateBlockLayout({
      ...b,
      scale: hasScale ? b.scale : DEFAULT_STICKER_SCALE,
    });
    const out = {
      id: b.id || uid(),
      type: 'sticker',
      sticker: clampStickerKind(b.sticker),
      symbol: clampStickerSymbol(b.symbol),
      x: layout.x,
      y: Number.isFinite(+b.y) ? Math.max(0, +b.y) : 0,
      h: Number.isFinite(+b.h) ? Math.max(24, +b.h) : DEFAULT_STICKER_H,
      scale: layout.scale,
    };
    const rot = rotateOf(b);
    if (rot) out.rotate = rot;
    return out;
  }
  // texto: scale = largura da caixa; align = text-align (não posição X)
  const layout = migrateBlockLayout(b);
  const out = {
    id: b.id || uid(),
    type: 'text',
    html: b.html != null ? String(b.html) : '',
    size: Number.isFinite(+b.size) ? Math.min(120, Math.max(10, +b.size)) : 24,
    weight: Number.isFinite(+b.weight) ? Math.min(700, Math.max(100, +b.weight)) : 400,
    align: b.align === 'center' || b.align === 'right' ? b.align : 'left',
    color: typeof b.color === 'string' && b.color ? b.color : DEFAULT_TEXT,
    x: layout.x,
    y: Number.isFinite(+b.y) ? Math.max(0, +b.y) : 0,
    scale: layout.scale,
  };
  // efeitos opcionais (aditivos — ausentes = off)
  const border = textBorderOf(b);
  if (border > 0) {
    out.textBorder = border;
    if (typeof b.textBorderColor === 'string' && b.textBorderColor) {
      out.textBorderColor = b.textBorderColor;
    }
  }
  const shadow3d = textShadow3dOf(b);
  if (shadow3d > 0) {
    out.textShadow3d = shadow3d;
    if (typeof b.textShadow3dColor === 'string' && b.textShadow3dColor) {
      out.textShadow3dColor = b.textShadow3dColor;
    }
  }
  const rot = rotateOf(b);
  if (rot) out.rotate = rot;
  return out;
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
 * @deprecated layout freestyle — só migração/testes. Prefira safeRect + x/scale.
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

// ── layers / z-order ────────────────────────────────────────────────────────
// Contrato: page.blocks[i] com i maior = na frente (pintado por cima).
// Painel de camadas lista o inverso (topo da lista = frente), como Figma.

/** Reordena in-place. from/to são índices do array (não da lista UI). */
export function reorderBlocks(blocks, from, to) {
  if (!Array.isArray(blocks)) return blocks;
  const n = blocks.length;
  const f = Math.floor(+from);
  let t = Math.floor(+to);
  if (!Number.isFinite(f) || f < 0 || f >= n) return blocks;
  if (!Number.isFinite(t)) return blocks;
  t = Math.min(n - 1, Math.max(0, t));
  if (f === t) return blocks;
  const [item] = blocks.splice(f, 1);
  blocks.splice(t, 0, item);
  return blocks;
}

/** delta +1 = frente, −1 = atrás. */
export function nudgeBlockZ(blocks, id, delta) {
  if (!Array.isArray(blocks) || !id) return blocks;
  const i = blocks.findIndex((b) => b && b.id === id);
  if (i < 0) return blocks;
  const d = Math.trunc(+delta) || 0;
  if (!d) return blocks;
  return reorderBlocks(blocks, i, i + d);
}

export function bringBlockToFront(blocks, id) {
  if (!Array.isArray(blocks) || !id) return blocks;
  const i = blocks.findIndex((b) => b && b.id === id);
  if (i < 0 || i === blocks.length - 1) return blocks;
  const [item] = blocks.splice(i, 1);
  blocks.push(item);
  return blocks;
}

export function sendBlockToBack(blocks, id) {
  if (!Array.isArray(blocks) || !id) return blocks;
  const i = blocks.findIndex((b) => b && b.id === id);
  if (i <= 0) return blocks;
  const [item] = blocks.splice(i, 1);
  blocks.unshift(item);
  return blocks;
}

/**
 * Move `id` relativo a `targetId` no stack.
 * place: 'front' = na frente do alvo (maior índice); 'back' = atrás.
 */
export function moveBlockRelative(blocks, id, targetId, place) {
  if (!Array.isArray(blocks) || !id || !targetId || id === targetId) return blocks;
  const from = blocks.findIndex((b) => b && b.id === id);
  if (from < 0) return blocks;
  const [item] = blocks.splice(from, 1);
  const target = blocks.findIndex((b) => b && b.id === targetId);
  if (target < 0) {
    blocks.splice(from, 0, item); // restore
    return blocks;
  }
  const to = place === 'front' ? target + 1 : target;
  blocks.splice(to, 0, item);
  return blocks;
}

/** Rótulo curto pra lista de camadas (sem HTML). */
export function blockLayerLabel(b, maxLen = 28) {
  const lim = Math.max(8, Math.min(80, Math.floor(+maxLen) || 28));
  if (!b || typeof b !== 'object') return 'Bloco';
  if (b.type === 'image') {
    if (b.chart?.kind === 'timeline') return 'Linha do tempo';
    if (b.chart) return 'Gráfico';
    return 'Imagem';
  }
  if (b.type === 'sticker') {
    if (b.sticker === 'token' || !b.sticker) {
      const sym = clampStickerSymbol(b.symbol).toUpperCase();
      return `Token ${sym}`;
    }
    return 'Sticker';
  }
  const plain = String(b.html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 'Texto';
  if (plain.length <= lim) return plain;
  return plain.slice(0, lim - 1) + '…';
}

// ── snap vertical no arraste (centro da tela + bordas/centros de outros blocos) ─
/** Tolerância em px (coords do artboard) pra grudar no alvo. */
export const BLOCK_SNAP_PX = 6;

/**
 * Alvos de snap no eixo Y (topo/mid/base) + centro/bordas da safe.
 * @param {Array<{ id?: string, y?: number, h?: number, type?: string }>} blocks
 * @param {string} dragId
 * @param {number} safeH
 * @param {(b: object) => number} [heightOf]
 * @returns {number[]}
 */
export function collectBlockSnapTargets(blocks, dragId, safeH, heightOf) {
  const hSafe = Math.max(0, +safeH || 0);
  const lines = new Set();
  lines.add(0);
  lines.add(hSafe / 2);
  lines.add(hSafe);
  const fallbackH = (b) => {
    if (typeof heightOf === 'function') {
      const n = +heightOf(b);
      if (Number.isFinite(n) && n > 0) return n;
    }
    if (b?.type === 'image' || b?.type === 'sticker') return Math.max(24, b.h | 0) || 80;
    return 80;
  };
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      if (!b || b.id === dragId) continue;
      const top = Number.isFinite(+b.y) ? +b.y : 0;
      const bh = fallbackH(b);
      lines.add(top);
      lines.add(top + bh / 2);
      lines.add(top + bh);
    }
  }
  return [...lines].filter((n) => Number.isFinite(n));
}

/**
 * Alvos de snap no eixo X (esq/mid/dir) + centro/bordas da safe.
 * @param {Array<{ id?: string, x?: number, scale?: number, type?: string }>} blocks
 * @param {string} dragId
 * @param {number} safeW
 * @param {(b: object) => number} [widthOf]
 * @returns {number[]}
 */
export function collectBlockSnapTargetsX(blocks, dragId, safeW, widthOf) {
  const wSafe = Math.max(0, +safeW || 0);
  const lines = new Set();
  lines.add(0);
  lines.add(wSafe / 2);
  lines.add(wSafe);
  const fallbackW = (b) => {
    if (typeof widthOf === 'function') {
      const n = +widthOf(b);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return blockWidthPx(b);
  };
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      if (!b || b.id === dragId) continue;
      const left = Number.isFinite(+b.x) ? +b.x : 0;
      const bw = fallbackW(b);
      lines.add(left);
      lines.add(left + bw / 2);
      lines.add(left + bw);
    }
  }
  return [...lines].filter((n) => Number.isFinite(n));
}

/**
 * Snap genérico de posição (topo ou left) + tamanho do bloco vs linhas-alvo.
 * @returns {{ pos: number, guide: number|null, kind: 'start'|'mid'|'end'|null }}
 */
export function snapBlockPos(freePos, size, targets, thresh = BLOCK_SNAP_PX) {
  const S = Math.max(1, +size || 1);
  const free = Number.isFinite(+freePos) ? +freePos : 0;
  const thr = Number.isFinite(+thresh) && +thresh > 0 ? +thresh : BLOCK_SNAP_PX;
  let bestPos = free;
  let bestGuide = null;
  let bestKind = null;
  let bestDist = thr;

  if (!Array.isArray(targets) || !targets.length) {
    return { pos: Math.round(free), guide: null, kind: null };
  }

  for (const t of targets) {
    if (!Number.isFinite(+t)) continue;
    const T = +t;
    const cands = [
      { pos: T, kind: 'start' },
      { pos: T - S / 2, kind: 'mid' },
      { pos: T - S, kind: 'end' },
    ];
    for (const c of cands) {
      const d = Math.abs(free - c.pos);
      if (d <= bestDist) {
        bestDist = d;
        bestPos = c.pos;
        bestGuide = T;
        bestKind = c.kind;
      }
    }
  }
  return {
    pos: Math.round(bestPos),
    guide: bestGuide == null ? null : Math.round(bestGuide * 100) / 100,
    kind: bestKind,
  };
}

/**
 * Snap vertical (compat): mesmo algoritmo de snapBlockPos.
 * @returns {{ y: number, guide: number|null, kind: string|null }}
 */
export function snapBlockY(freeY, h, targets, thresh = BLOCK_SNAP_PX) {
  const r = snapBlockPos(freeY, h, targets, thresh);
  return { y: r.pos, guide: r.guide, kind: r.kind };
}

/** Snap horizontal (left do bloco). */
export function snapBlockX(freeX, w, targets, thresh = BLOCK_SNAP_PX) {
  const r = snapBlockPos(freeX, w, targets, thresh);
  return { x: r.pos, guide: r.guide, kind: r.kind };
}
