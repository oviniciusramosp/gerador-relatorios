/* Diagramação — miolo do relatório Paradigma.
 *
 * Um documento é uma lista linear de blocos (h1/h2/p/li/quote/pagebreak/image).
 * A coluna de texto (esquerda, 258px) "flui" página a página; a paginação é um
 * empacotamento guloso por altura MEDIDA de cada bloco, respeitando quebras
 * manuais. Imagens vão na coluna direita (posição livre no eixo Y, arrastável),
 * em largura total (as 2 colunas) ou entre parágrafos (coluna esquerda).
 *
 * Edição é WYSIWYG: cada bloco é um contenteditable dentro da própria página,
 * estilo Notion (atalhos "# ", "- ", "> ", Enter cria bloco, ⌘⏎ quebra página).
 *
 * ponytail: sem framework, sem lib de PDF — DOM + measurement + window.print().
 * A quebra de linha DENTRO de um parágrafo entre páginas não é feita (bloco
 * inteiro sobe pra próxima); a quebra manual dá o controle fino. Upgrade: cortar
 * parágrafos por linha via Range.getClientRects() quando precisar de fluxo denso.
 */

import {
  openSwatchPop as openSwatchPopBase, setDocColorsProvider, parseColor, withAlpha, harvestColorsFromHtml,
} from './swatch.js';   // swatch de cor compartilhado (idêntico ao dos gráficos)
import {
  rotateOf, setBlockRotate, snapRotate, clampRotate, ROTATE_SNAPS,
} from './stories-core.js';   // rotação de imagem (mesmo contrato dos Stories)
import { enhanceAll, wireFieldEditKeys, isFreeSnap } from './range-snap.js';  // snap + digitação (Enter aplica, sem quebrar linha); Shift = sem ímã
import { tocNum } from './toc-num.js';         // trilha C (t4): numeração do índice sem duplicar prefixo
import { LOGOS, logoPickSvg } from './logos.js'; // trilha D (t8): logos tingíveis; logoPickSvg = ícone p/ picker (t3.1)
import { marksFromStyle } from './paste-style.js';   // trilha A (t10): parser puro de estilo inline colado
import {
  buildTableEl, ensureTable, ensureSharedTableStyle, applyTableChrome, resolveGridTableItem,
  addTableRow, addTableCol,
  tableHeaderBg, tableHeaderTextOf, tableTextColorOf,
  borderOuterOf, borderInnerOf, tableBgOf, tableRadiusOf, tableBorderWidthOf,
  tableBorderWidthOuterOf, tableBorderWidthInnerOf, tableAltRowBgOf,
  clampTableRadius, clampTableBorderWidth,
  tableAlignOf, tableValignOf, tableFontSizeOf, tableLineHeightOf,
  cellAlignOf, cellValignOf,
  clampTableFontSize, clampTableLineHeight, normalizeTableAlign, normalizeTableValign,
  setTableHeaderRow, setTableHeaderCol, tableLiveActive, tableLiveFromEl,
  setTableSelectionHook, clearTableCellSelections,
  mergeSelectionOrNeighbor, unmergeCells,
  DEFAULT_HEADER_BG, DEFAULT_HEADER_TEXT, DEFAULT_TEXT_COLOR,
  DEFAULT_BORDER_OUTER, DEFAULT_BORDER_INNER, DEFAULT_TABLE_BG, DEFAULT_ALT_ROW_BG,
  DEFAULT_TABLE_RADIUS, DEFAULT_BORDER_WIDTH,
  DEFAULT_TABLE_FONT_SIZE, DEFAULT_TABLE_LINE_HEIGHT, DEFAULT_TABLE_ALIGN, DEFAULT_TABLE_VALIGN,
  TABLE_RADIUS_MAX, TABLE_BORDER_WIDTH_MIN, TABLE_BORDER_WIDTH_MAX,
  TABLE_FONT_SIZE_MIN, TABLE_FONT_SIZE_MAX,
  TABLE_LINE_HEIGHT_MIN, TABLE_LINE_HEIGHT_MAX,
} from './bloco-tabela.js';    // trilha B (t6): DOM do bloco Tabela
import {
  buildImageGridEl, ensureImageGrid, equalModeOf, setGridCols, setGridItemImage,
  setTitlesOn, setCaptionsOn, titlesOn, captionsOn, captionStyleOf, gapOf, clampGap,
  IMAGE_GRID_MAX, IMAGE_GRID_GAP, IMAGE_GRID_GAP_MAX,
} from './bloco-image-grid.js';import {
  buildTableGridEl, ensureTableGrid, tableGridEqualModeOf, tableGridEqualRowsOf,
  tableGridGapOf, clampTableGridGap, setTableGridCols, applyTableStylesToGrid,
  TABLE_GRID_MAX, TABLE_GRID_GAP, TABLE_GRID_GAP_MAX,
} from './bloco-table-grid.js';
import { initSlashMenu } from './slash.js';          // trilha B (t1): menu "/" de tipos
import { deserializeDoc, serializeDoc, serializeDocZip, loadDocZip } from './doc-format.js';  // trilha C (t3.2): salvar/abrir documento completo (.pdgm.zip; .pdgm.json ainda lido por compat)
import {
  RULE_W_DEFAULT, RULE_W_LEGACY, RULE_W_STEP,
  COL_L_DEFAULT, COL_L_MIN, COL_L_MAX, clampColL,
  hasOwn, clampFootAlign, clampRuleW, defaultLogo, ensureCoverType,
  migrateSpecialPages, normalizeOpenedDoc,
  INDEX_COLOR_DEFAULTS, ensureIndexColors, ensureCoverBgFit, ensureMioloRules,
  PNUM_COLOR_DEFAULT, FOOT_COLOR_DEFAULT,
} from './doc-migrate.js';  // defaults/migração ao abrir .pdgm (puro; compartilhado com test-pdgm-compat)
import { projectFormatFromName, projectBaseName, shouldReloadLinkedProject } from './project-link.js';
import { registerIcons, findIcon, iconSvg, isTextIcon, textIconLabel } from './timeline-icons.js';
import { IONICONS_LIB, IONICONS_LIB_SOLID } from './ionicons-lib.js';  // outline + solid (charts / callout)
import { openIconPop, paintIconBtn } from './icon-pop.js';
import {
  materialIconHtml, iconHtml, paintMaterialIconBtn, openMaterialIconPop,
  normalizeMaterialName, normalizeTablerName, materialOptsFrom, applyMaterialOpts,
  applyMaterialStyleToEl, MS_DEFAULTS, clampMsWeight, clampMsGrade, clampMsOpsz, clampMsSize,
  clampTablerStroke, resolveIconName,
} from './material-symbols.js';
import { initFeedback, openFeedbackReport } from './feedback.js';
import { initAppNav } from './app-nav.js';
import { COL_ICON, ALIGN_ICON, POS_ICON, widthSeg, textSeg } from './ui-segment.js';
import { createBlockHandles, HANDLE_GEOM } from './ui-handles.js';
registerIcons(IONICONS_LIB);                          // outline (default do app)
registerIcons(IONICONS_LIB_SOLID, { style: 'solid' }); // filled (callout default)

// defaults do bloco Ícones / ícone em títulos (Google Material Symbols + eixos)
const DEFAULT_MS_ICON = 'star';
const DEFAULT_MS_COLOR = MS_DEFAULTS.color;
const DEFAULT_MS_SIZE = MS_DEFAULTS.size;
// headers: Material Symbol se icon presente e iconSet !== 'none'
// (iconSet 'ionicon' legado do callout-style ainda pode existir — trata como MS se for nome válido)
function headHasIcon(b) {
  if (!b || b.iconSet === 'none' || b.icon === '' || b.icon == null) return false;
  return !!(normalizeMaterialName(b.icon) || normalizeTablerName(b.icon));
}
function headIconName(b) {
  if (!headHasIcon(b)) return '';
  const fam = materialOptsFrom(b, 'head').family;
  return resolveIconName(b.icon, fam, b.icon);
}
function headIconColorOf(b) {
  return materialOptsFrom(b, 'head').color;
}
/** Tamanho global dos ícones de título (Conteúdo › ⋮ do H1–H4). null = auto por tipo. */
const DEFAULT_HEADING_ICON_SIZE = 24;
function headingIconSizePx(type) {
  const g = state.doc?.headingIconSize;
  if (g != null && Number.isFinite(+g)) return clampMsSize(+g);
  const fs = typeStyleOf(type || 'h1').fontSize || 20;
  return Math.round(fs * 1.05);
}
function clearHeadIconFields(b) {
  if (!b) return;
  b.iconSet = 'none';
  b.icon = '';
  delete b.iconFamily; delete b.iconColor; delete b.iconFill; delete b.iconWeight;
  delete b.iconGrade; delete b.iconOpsz; delete b.iconShape; delete b.iconSize;
  delete b.iconStroke;
}
function ensureHeadIcon(b) {
  if (!b || headHasIcon(b)) return;
  b.icon = DEFAULT_MS_ICON;
  delete b.iconSet;
  delete b.iconFamily; // material default
  if (!b.iconColor) b.iconColor = DEFAULT_MS_COLOR;
}
function iconNameOf(b, mode = 'icon') {
  if (mode === 'head') return headIconName(b);
  const fam = materialOptsFrom(b, 'icon').family;
  return resolveIconName(b.icon, fam, fam === 'tabler' ? 'star' : DEFAULT_MS_ICON)
    || (fam === 'tabler' ? 'star' : DEFAULT_MS_ICON);
}

// ─────────────────────────── geometria (px, 1:1 com a página) ───────────────
const PAGE_W = 595, PAGE_H = 842;
const CONTENT_TOP = 88, CONTENT_H = 666;          // [88 .. 754]
// moldura: linhas de topo/base (CSS .rule). RULE_TOP_Y = topo da linha superior;
// RULE_BOT_BOTTOM = base da linha inferior (com 1px default: top 802 → bottom 803).
// Gap texto↔linha (cabeçalho e rodapé) = 4px: runhead bottom em 36, foot top em 807.
const RULE_TOP_Y = 40, RULE_BOT_BOTTOM = 803, RULE_TEXT_GAP = 4;
// RULE_W_* / clampFootAlign / clampRuleW → doc-migrate.js (open de .pdgm + UI de espessura)
/** espelha left↔right em páginas pares (contrapágina) quando printMirror está ligado */
function resolveFootAlign(align, pageNumber) {
  const a = clampFootAlign(align);
  if (!state.doc.printMirror || a === 'center') return a;
  return (pageNumber % 2 === 0) ? (a === 'left' ? 'right' : 'left') : a;
}
function formatRulePx(n) {
  const v = +n;
  if (!Number.isFinite(v)) return RULE_W_DEFAULT + 'px';
  // evita 0.25000001; inteiros sem casas
  const r = Math.round(v / RULE_W_STEP) * RULE_W_STEP;
  const s = Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : String(r);
  return s + 'px';
}

// COL_ICON / ALIGN_ICON / POS_ICON / widthSeg → ui-segment.js (compartilhado com Stories)
// Geometria das colunas do MIOLO. Faixa total fixa (499 = 595 − 96 de margens laterais).
// Gap fixo 24; o slider mexe só em colLeft — colRight = 499 − 24 − colLeft.
// COL_L / COL_R = defaults históricos (capa e fallback); no miolo usar colL()/colR().
const GAP = 24;
const COL_FULL = 499;                            // largura das 2 colunas + gap
const COL_L = COL_L_DEFAULT;                     // 258 — padrão / capa
const COL_R = COL_FULL - GAP - COL_L;            // 217 — padrão / capa
const TOC_SHORT_W = 345;   // largura do índice no modo "Curto" (o 'full' usa as 2 colunas)

/** Largura atual da coluna esquerda do miolo (px, clamped). */
function colL() { return clampColL(state.doc?.colLeft); }
/** Largura da coluna direita do miolo (complemento do gap + esquerda). */
function colR() { return COL_FULL - GAP - colL(); }
/** offset left da coluna direita (= colLeft + gap). */
function colRightX() { return colL() + GAP; }

// b.placement ('inline' | 'full' | 'right') vale pra QUALQUER bloco, não só imagem:
// inline = coluna esquerda (fluxo) = 1 col · full = as duas colunas = 2 cols ·
// right = coluna direita (fora do fluxo, Y livre/arrastável, ancorado a uma página —
// o mesmo mecanismo que as imagens da direita sempre usaram).
// Sem placement explícito o default vem do TIPO: títulos H1–H4 e tabela ocupam as duas
// colunas; o resto fica na esquerda. Ler sempre por placementOf() — nunca b.placement
// direto — senão documentos antigos (sem o campo) perdem o default do tipo.
const DEFAULT_FULL = new Set(['h1', 'h2', 'h3', 'h4', 'table', 'image-grid', 'table-grid']);
const placementOf = (b) => b.placement || (DEFAULT_FULL.has(b.type) ? 'full' : 'inline');
// tipos com seletor "1 coluna / 2 colunas" (sidebar + painel flutuante à direita)
const COL_FMT_TYPES = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'caption', 'image-grid', 'table-grid']);
// texto puro (p/legenda): painel flutuante só de Largura; H1–H4 usam o #iconPanel
const TEXT_PLACE_TYPES = new Set(['p', 'caption']);

// Espaçamento vertical ANTES de um bloco — depende do tipo do bloco de cima (prev).
// Calculado no JS (não em CSS) porque é contextual; a paginação e o render usam o
// mesmo valor (b._gap), então a quebra de página bate com o que aparece na tela.
const PARA_LH = 14;   // line-height do p.b — a "altura da linha de um parágrafo"
const LIST_GAP = 6;   // distância atual entre itens da MESMA lista (compacta)
function gapBefore(b, prev) {
  // override do usuário (menu ⋮ da paleta) substitui a regra INTEIRA pro tipo — inclusive a
  // nuance contextual (H2 colado no H1 etc.): uma vez customizado, o valor é fixo.
  // Exceção: depois de TABELA o respiro mínimo é o de parágrafo (PARA_LH), mesmo com
  // gap customizado menor — senão o bloco seguinte (quase sempre um p) cola na borda.
  const pt = prev && prev.type;
  const custom = state.doc.blockStyles && state.doc.blockStyles[b.type];
  if (custom) {
    const v = HEAD_TYPES.has(b.type) ? custom.marginTop : custom.gap;
    if (v != null) {
      if ((pt === 'table' || pt === 'table-grid') && !HEAD_TYPES.has(b.type)) return Math.max(PARA_LH, v);
      return v;
    }
  }
  if (b.type === 'h1') return 48;                                      // = padding da página
  if (b.type === 'h2') return pt === 'h1' ? PARA_LH : 32;              // colado no H1, senão 32
  if (b.type === 'h3') return (pt === 'h1' || pt === 'h2') ? PARA_LH : 24;
  // qualquer lista consecutiva (mesmo misturando pontos/número/check) fica compacta —
  // permite "1. pai → subitem • → 2. continua" sem folga de parágrafo no meio
  if (LIST_TYPES.has(b.type) && LIST_TYPES.has(pt)) return LIST_GAP;
  // após tabela / grid de imagens/tabelas: mesmo respiro p↔p (1 linha). Headings já saíram acima.
  if (pt === 'table' || pt === 'image-grid' || pt === 'table-grid') return PARA_LH;
  return PARA_LH;                     // demais blocos (inclui 'callout', trilha G): folga de 1 linha, sem regra especial
}

const HEAD_TYPES = new Set(['h1', 'h2', 'h3', 'h4']);
// 'check' (checklist, trilha B t7) e 'callout' (trilha G) são editáveis e reusam buildText;
// 'table' NÃO é text (célula própria)
// 'caption' = legenda solta (mesma tipografia da figcaption de imagem), em qualquer ponto do fluxo
const TEXT_TYPES = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'caption', 'li', 'ol', 'quote', 'check', 'callout']);  // blocos editáveis
// listas com subitens via Tab / Shift+Tab (b.indent = 0..MAX_LIST_INDENT)
const LIST_TYPES = new Set(['li', 'ol', 'check']);
const MAX_LIST_INDENT = 4;   // 5 níveis (0..4)
const LIST_INDENT_PX = 18;   // recuo visual por nível
// símbolos da lista de pontos (item / subitem) — padrão Word/Docs: cheio → oco
const LI_MARKER_OPTS = ['•', '◦', '▪', '–', '▸', '○'];
// estilo do SUBITEM da lista numérica (nível ≥ 1): number → 1.1. · letter → a. · bullet → •
const OL_SUBSTYLE_OPTS = [
  { val: 'number', label: 'Número', hint: '1.1.' },
  { val: 'letter', label: 'Letra', hint: 'a.' },
  { val: 'bullet', label: 'Pontos', hint: '•' },
];
const listIndentOf = (b) => Math.max(0, Math.min(MAX_LIST_INDENT, (b && b.indent) | 0));
function setListIndent(b, n) {
  const v = Math.max(0, Math.min(MAX_LIST_INDENT, n | 0));
  if (v) b.indent = v; else delete b.indent;
}
// empurra o item inteiro (marcador + texto) — no check o envelope; no li/ol o próprio .b
function applyListIndentStyle(el, b) {
  const ind = listIndentOf(b);
  if (ind > 0) {
    el.style.marginLeft = (ind * LIST_INDENT_PX) + 'px';
    el.dataset.indent = String(ind);
  }
}
// 1 → a, 26 → z, 27 → aa (estilo Word/Docs para subnível em letra)
function toAlphaMarker(n) {
  let s = '', x = Math.max(1, n | 0);
  while (x > 0) { x--; s = String.fromCharCode(97 + (x % 26)) + s; x = Math.floor(x / 26); }
  return s;
}
// texto do marcador da lista numérica (após numberLists preencher _num/_nums)
function olMarkerText(b) {
  const ind = listIndentOf(b);
  const sub = (typeStyleOf('ol').subStyle || 'number');
  if (ind === 0) return (b._num || 1) + '.';
  if (sub === 'letter') return toAlphaMarker(b._num || 1) + '.';
  if (sub === 'bullet') return '•';
  // number (default Docs/Word multilevel): "1.1." / "1.2.3."
  const path = (b._nums && b._nums.length) ? b._nums : [b._num || 1];
  return path.join('.') + '.';
}
function liMarkerText(b) {
  const st = typeStyleOf('li');
  return listIndentOf(b) > 0 ? (st.subMarker || '◦') : (st.marker || '•');
}
function applyListMarkers(el, b) {
  const st = typeStyleOf(b.type);
  const markColor = st.markerColor || '#29E899';
  el.style.setProperty('--list-marker-color', markColor);
  if (b.type === 'ol') {
    const mark = olMarkerText(b);
    el.dataset.num = mark;
    // "1.12." precisa de mais espaço que "1." — reserva ~5.5px/char + folga
    el.style.paddingLeft = Math.max(16, 6 + mark.length * 5.5) + 'px';
    el.classList.toggle('ol-as-bullet', mark === '•');
  } else if (b.type === 'li') {
    el.dataset.marker = liMarkerText(b);
  }
}
// li/ol/check: sem texto de placeholder — o marcador (• / 1. / checkbox) já comunica o tipo
const PH = {
  title: 'Título do relatório', subtitle: 'Subtítulo',
  h1: 'Título', h2: 'Subtítulo', h3: 'Título 3', h4: 'Título 4',
  p: 'Escreva…', caption: 'Legenda…', li: '', ol: '', quote: 'Citação', check: '', callout: 'Escreva…',
};
const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i;

// ── estilo por TIPO de bloco, editável pelo menu ⋮ da paleta (aba Conteúdo) ──────────────────
// state.doc.blockStyles[type] = { color, fontSize, lineHeight, letterSpacing, gap, marginTop,
// checkColor, checkedOpacity, borderColor } — campos ausentes usam TYPE_STYLE_DEFAULTS (valor
// inicial do slider + alvo do ↺). Não existe override por bloco individual: editar o tipo
// edita TODOS os blocos daquele tipo hoje E os que forem criados depois.
//
// li / ol / check NÃO têm tipografia própria: cor + tamanhos de texto vêm sempre do Parágrafo
// (p). Só o espaçamento entre itens (gap) — e no check, cor do ✓ e opacidade do item marcado —
// é configurável no ⋮ do tipo. quote tem tipografia própria (default = p) + cor da borda.
const TYPE_STYLE_DEFAULTS = {
  h1: { fontSize: 24, lineHeight: 31, color: '#000000', letterSpacing: -0.01, marginTop: 48 },
  h2: { fontSize: 20, lineHeight: 26, color: '#000000', letterSpacing: -0.01, marginTop: 32 },
  h3: { fontSize: 16, lineHeight: 21, color: '#000000', letterSpacing: -0.01, marginTop: 24 },
  h4: { fontSize: 13, lineHeight: 17, color: '#000000', letterSpacing: -0.01, marginTop: 14 },
  p: { fontSize: 10, lineHeight: 14, color: '#4E4E4E', letterSpacing: -0.01, gap: 14 },
  // legenda solta = mesma tipografia da figcaption de imagem (itálico 8px #828080)
  caption: { fontSize: 8, lineHeight: 14, color: '#828080', letterSpacing: -0.01, gap: 14 },
  li: { gap: 6, marker: '•', subMarker: '◦', markerColor: '#29E899' },
  ol: { gap: 6, subStyle: 'number', markerColor: '#29E899' },   // subStyle: number | letter | bullet
  check: { gap: 6, checkColor: '#29E899', checkedOpacity: 0.55 },
  quote: { fontSize: 10, lineHeight: 14, color: '#4E4E4E', letterSpacing: -0.01, gap: 14, borderColor: '#29E899' },
  callout: { fontSize: 10, lineHeight: 14, color: '#4E4E4E', letterSpacing: -0.01, gap: 14 },
  // divisor: cor e espessura globais (⋮ no card Divisor da aba Conteúdo)
  divider: { color: '#D9D9D9', thickness: 1 },
};
function applyDividerStyle(el) {
  if (!el) return;
  const o = typeStyleOf('divider');
  const th = o.thickness != null ? Math.max(0.5, Math.min(12, +o.thickness || 1)) : 1;
  el.style.height = th + 'px';
  el.style.minHeight = th + 'px';
  el.style.background = o.color || '#D9D9D9';
}
// tipos cuja tipografia (cor/tamanho/lh/tracking) espelha o parágrafo — não tem controles
// próprios no popover ⋮ e applyTypeStyle lê de typeStyleOf('p').
const TEXT_FROM_P = new Set(['li', 'ol', 'check']);
function typeStyleOf(type) {
  const def = TYPE_STYLE_DEFAULTS[type] || {};
  const cur = (state.doc && state.doc.blockStyles && state.doc.blockStyles[type]) || {};
  // descarta NaN/undefined de overrides corrompidos (slider vazio etc.) pra não vazar pro UI
  const clean = {};
  for (const [k, v] of Object.entries(cur)) {
    if (v == null) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    clean[k] = v;
  }
  return { ...def, ...clean };
}
// aplica tipografia no elemento que RENDERIZA o texto — pro check/callout isso é o
// .ck-txt/.co-txt (não o envelope). li/ol/check leem de p; quote também aplica borderColor.
// Sempre usa typeStyleOf (default + override): figcaption de imagem/grid e o bloco
// 'caption' compartilham o ⋮ Legenda; depender só de blockStyles deixava default/NaN de fora.
function applyTypeStyle(el, type) {
  if (!el) return;
  const textType = TEXT_FROM_P.has(type) ? 'p' : type;
  const o = typeStyleOf(textType);
  if (o.color) el.style.color = o.color;
  if (o.fontSize != null && Number.isFinite(+o.fontSize)) el.style.fontSize = (+o.fontSize) + 'px';
  if (o.lineHeight != null && Number.isFinite(+o.lineHeight)) el.style.lineHeight = (+o.lineHeight) + 'px';
  if (o.letterSpacing != null && Number.isFinite(+o.letterSpacing)) el.style.letterSpacing = (+o.letterSpacing) + 'em';
  // legenda (bloco solto + figcaption): face itálica fixa da spec de imagem
  if (textType === 'caption') {
    el.style.fontStyle = 'italic';
    el.style.fontWeight = '400';
    el.style.textAlign = 'justify';
  }
  if (type === 'quote') {
    const border = typeStyleOf('quote').borderColor;
    if (border) el.style.borderLeftColor = border;
  }
}
/** Face da legenda (figcaption de imagem/grid ou bloco type=caption). */
function applyCaptionFace(el, mode = 'default') {
  if (!el) return;
  if (mode === 'p') {
    el.style.fontStyle = 'normal';
    el.style.fontWeight = '400';
    el.style.textAlign = 'justify';
    const o = typeStyleOf('p');
    if (o.color) el.style.color = o.color;
    if (o.fontSize != null && Number.isFinite(+o.fontSize)) el.style.fontSize = (+o.fontSize) + 'px';
    if (o.lineHeight != null && Number.isFinite(+o.lineHeight)) el.style.lineHeight = (+o.lineHeight) + 'px';
    if (o.letterSpacing != null && Number.isFinite(+o.letterSpacing)) el.style.letterSpacing = (+o.letterSpacing) + 'em';
    return;
  }
  applyTypeStyle(el, 'caption');
}
/** Títulos "Índice" / "Resumo": espelham o H1 global (⋮ da paleta), inclusive cor.
 *  Usa typeStyleOf (default + override) — não só blockStyles, senão cor default some. */
function applyIdxTitleStyle(el) {
  if (!el) return;
  const o = typeStyleOf('h1');
  if (o.fontSize != null) el.style.fontSize = o.fontSize + 'px';
  if (o.lineHeight != null) el.style.lineHeight = o.lineHeight + 'px';
  if (o.color) el.style.color = o.color;
  if (o.letterSpacing != null) el.style.letterSpacing = o.letterSpacing + 'em';
}

// ─────────────────────────── estado ─────────────────────────────────────────
// O conteúdo NÃO persiste: o documento sempre abre em branco. O que persiste é
// a configuração (rodapé, nº inicial) e a ORIGEM vinculada (arquivo/Google Docs),
// que permite Sincronizar e reimportar o conteúdo a qualquer momento.
const LS_KEY = 'pdgm-diagramacao-cfg-v1';
let uidN = 0;
const uid = () => 'b' + (Date.now().toString(36)) + (uidN++).toString(36);

const state = {
  doc: null,          // { blocks:[], footText, firstPage, source }
  sel: null,          // id da imagem selecionada
  zoom: 'fit',
};

/**
 * Cores em uso no .pdgm atual → swatch "Nesse documento".
 * text = tipografia/marcadores/ícones; bg = papel, callout, header de tabela, highlights.
 * Puro sobre o objeto doc (sem DOM), reusa harvestColorsFromHtml do swatch.
 */
function collectDiagramacaoDocColors(doc) {
  const text = new Set();
  const bg = new Set();
  if (!doc || typeof doc !== 'object') return { text: [], bg: [] };
  const addText = (c) => { const p = parseColor(c); if (p?.hex) text.add(p.hex); };
  const addBg = (c) => { const p = parseColor(c); if (p?.hex) bg.add(p.hex); };
  const fromHtml = (html) => harvestColorsFromHtml(html, { text, bg });

  addBg(doc.pageBg);
  addText(doc.pnumColor);
  addText(doc.footColor);

  for (const st of Object.values(doc.blockStyles || {})) {
    if (!st || typeof st !== 'object') continue;
    addText(st.color);
    addText(st.markerColor);
    addText(st.checkColor);
    addText(st.borderColor);
    // divisor: cor da linha (mais “traço” que tipografia, mas é cor de chrome do miolo)
    if (st.thickness != null || st.color) addText(st.color);
  }

  /** Cores de estilo de tabela (avulsa, item de grid ou shared no grid). */
  const fromTableStyle = (t) => {
    if (!t || typeof t !== 'object') return;
    addBg(t.headerColor);
    addBg(t.bg);
    addBg(t.altColor);
    addText(t.headerTextColor);
    // body text — em icon/cover `color` é outra coisa; aqui só se parece tabela
    if (t.rows || t.headerColor != null || t.bg != null || t.headerTextColor != null) {
      addText(t.color);
    }
    addText(t.borderOuter);
    addText(t.borderInner);
  };

  const walkBlock = (b) => {
    if (!b || typeof b !== 'object') return;
    fromHtml(b.html);
    fromHtml(b.title);
    fromHtml(b.caption);
    if (b.type === 'callout' && b.color) addBg(b.color);
    if (b.iconColor) addText(b.iconColor);
    if (b.color && b.type === 'icon') addText(b.color);
    // tabela avulsa / estilo shared de table-grid no bloco
    if (b.type === 'table' || b.type === 'table-grid' || Array.isArray(b.rows)) {
      fromTableStyle(b);
    }
    // tabela: células (string ou { html })
    if (Array.isArray(b.rows)) {
      for (const row of b.rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          if (typeof cell === 'string') fromHtml(cell);
          else if (cell && typeof cell === 'object') fromHtml(cell.html);
        }
      }
    }
    // grid / cover items aninhados
    if (Array.isArray(b.items)) {
      for (const it of b.items) {
        if (!it || typeof it !== 'object') continue;
        fromHtml(it.title);
        fromHtml(it.caption);
        fromHtml(it.html);
        if (it.iconColor) addText(it.iconColor);
        // table-grid item: cores por tabela + HTML das células
        if (b.type === 'table-grid' || Array.isArray(it.rows)) {
          fromTableStyle(it);
          if (Array.isArray(it.rows)) {
            for (const row of it.rows) {
              if (!Array.isArray(row)) continue;
              for (const cell of row) {
                if (typeof cell === 'string') fromHtml(cell);
                else if (cell && typeof cell === 'object') fromHtml(cell.html);
              }
            }
          }
        } else if (it.color) {
          addText(it.color);
        }
      }
    }
  };

  for (const b of doc.blocks || []) walkBlock(b);
  for (const kind of ['cover', 'back']) {
    const cov = doc[kind];
    if (!cov) continue;
    for (const it of cov.items || []) {
      walkBlock(it);
      // item de capa de texto livre: cor do item
      if (it && it.color) addText(it.color);
    }
  }
  if (doc.index) {
    const c = doc.index.colors;
    if (c) { addText(c.num); addText(c.text); addText(c.page); addText(c.line); }
    fromHtml(doc.index.resumo);
  }

  const sortHex = (a, b) => a.localeCompare(b);
  return { text: [...text].sort(sortHex), bg: [...bg].sort(sortHex) };
}

/** Provider global: menu da alça da tabela (bloco-tabela → swatch.js) também vê o doc. */
setDocColorsProvider(() => collectDiagramacaoDocColors(state.doc));

/** Wrapper local: garante docColors mesmo se o provider ainda não rodou. */
function openSwatchPop(anchor, pick, current, opts) {
  return openSwatchPopBase(anchor, pick, current, {
    ...opts,
    docColors: (opts && opts.docColors) || collectDiagramacaoDocColors(state.doc),
  });
}

const mkBlock = (type, html = '') => {
  const b = { id: uid(), type, html };
  if (type === 'callout') {
    b.iconSet = 'ionicon';
    b.icon = DEFAULT_CALLOUT_ICON;
    b.iconStyle = DEFAULT_CALLOUT_ICON_STYLE;
  }
  if (type === 'image-grid') {
    // 2 slots vazios por padrão; equal=width = colunas iguais
    ensureImageGrid(b);
  }
  if (type === 'table-grid') {
    ensureTableGrid(b);
  }
  if (type === 'table') {
    ensureTable(b);
  }
  if (type === 'icon') {
    b.icon = DEFAULT_MS_ICON;
    b.color = DEFAULT_MS_COLOR;
    b.size = DEFAULT_MS_SIZE;
    delete b.html;
  }
  return b;
};
// item de capa/contracapa: bloco livre (type = mesmo da paleta: p/h1/image/table/…)
// com coluna (esq/dir/ambas), alinhamento, cor, size (texto) e Y arrastável.
// Legado sem `type` = texto (p).
const coverItem = (html, size, span, align, color = null, y = 0, type = 'p') => (
  { id: uid(), type, html, size, span, align, color, y }
);
// logo da capa/contracapa: defaultLogo() em doc-migrate.js (seed + migração de
// config antiga). "Nome" (wordmark) vem ligado por padrão; "Nenhum" é escolha manual.

function seedDoc() {
  return {
    blocks: [mkBlock('p', '')],
    footText: 'paradigma.education', headText: '', firstPage: 1, source: null,
    // espessura (px) das linhas de moldura do cabeçalho e do rodapé
    ruleTop: RULE_W_DEFAULT, ruleBot: RULE_W_DEFAULT,
    // alinhamento do texto do cabeçalho, do nº e do texto do rodapé (left|center|right)
    headAlign: 'left', pnumAlign: 'left', footAlign: 'right',
    // cores do rodapé (nº + texto) — defaults = CSS histórico; campos aditivos
    pnumColor: PNUM_COLOR_DEFAULT, footColor: FOOT_COLOR_DEFAULT,
    // Modo Impressão: espelha left↔right nas páginas pares (página / contrapágina)
    printMirror: false,
    // cor de fundo de TODAS as páginas do PDF (miolo, índice, capa, contracapa).
    // default = papel branco; campo aditivo — docs antigos abrem brancos via seed.
    pageBg: '#FFFFFF',
    // largura (px) da coluna esquerda do miolo. Padrão 258; direita = 499−24−colLeft.
    // Capa/contracapa usam sempre o grid fixo histórico (não herdam este valor).
    colLeft: COL_L_DEFAULT,
    // estilo por tipo de bloco (menu ⋮ da paleta) — {} = tudo no padrão do app; ver
    // TYPE_STYLE_DEFAULTS/applyTypeStyle/gapBefore. Vive no state.doc (não no LS_KEY pequeno)
    // porque é adjacente ao miolo — mesmo caminho de idb.set('doc', ...) que já salva os
    // blocks inteiros, sem precisar de migração: Object.assign(seedDoc(), doc) em applyDoc()
    // já cobre documentos antigos sem este campo.
    blockStyles: {},
    // tamanho (px) dos ícones em TODOS os headings (H1–H4). null = 1.05 × fontSize do tipo.
    headingIconSize: null,
    // páginas especiais — ligadas por padrão via switcher no painel Documento.
    // bgX/bgY = posição do fundo em %; bgScale = zoom (100 = sem zoom);
    // bgFit: 'fill' (cover, recorta) | 'fit' (contain, mostra inteira); itens por coluna + y livre.
    cover: { on: true, bg: null, bgX: 50, bgY: 50, bgScale: 100, bgFit: 'fill', logo: defaultLogo(), items: [
      // title/subtitle = tipos da capa (40px/15px) — retrocompat com o visual antigo
      // weight opcional no item (100–900; >700 sintético no Plex); ausente → 700
      // letterSpacing (em) e lineHeight (unitless) opcionais — defaults no CSS / helpers
      coverItem('Título do relatório', 40, 'full', 'left', null, 330, 'title'),
      coverItem('Subtítulo · Paradigma Education', 15, 'full', 'left', null, 392, 'subtitle'),
    ] },
    back: { on: true, bg: null, bgX: 50, bgY: 50, bgScale: 100, bgFit: 'fill', logo: defaultLogo(), items: [
      coverItem('paradigma.education', 18, 'full', 'center', null, 360, 'p'),
    ] },
    // t2.11: índice (lista de títulos) e resumo agora ligam/desligam independente —
    // resumoOn é o switcher novo; ambos vivem na mesma página física (index.on segue
    // sendo o gate de existência da página, ver assemblePages/renderIndexPage).
    // levels: quais níveis de título entram no índice · color: 'padrao' | 'cinza' | 'custom' ·
    // colors: { num, text, page, line } quando color==='custom' · width: 'curto'|'full' ·
    // resumoWidth: 'full' | 'left' · leaders: linha-guia até o nº da página ·
    // espacarSessoes: space-between Índice↔Resumo (só aplica com os dois ligados; default off)
    index: {
      on: true, resumoOn: true, levels: { h1: true, h2: true, h3: false, h4: false },
      color: 'padrao', colors: { ...INDEX_COLOR_DEFAULTS },
      width: 'curto', resumoWidth: 'full',
      espacarSessoes: false,
      resumo: '<p>Escreva aqui o resumo do relatório.</p>',
    },
    // ids de H1/H2 marcados como “revisado” no índice flutuante do preview.
    // Vive no doc (não em chrome de UI) pra ir no .pdgm.zip via serializeDocZip
    // (dump genérico do objeto). applyDoc = Object.assign(seedDoc(), doc) cobre
    // arquivos antigos sem o campo. Não entra no hist/undo (só blocks/foot/page).
    reviewed: [],
    // teaser "PDF Gratuito": mode page|section + seleção + mensagem/CTA
    freePdf: {
      mode: 'page', // 'page' (padrão) | 'section' (por capítulo H1/H2)
      // quebra de linha intencional (white-space: pre-line no overlay)
      message: 'Se torne Paradigma Pro para \nter acesso ao relatório completo.',
      link: 'https://paradigma.education',
      cta: 'Tornar-se Pro',
      locked: null,           // mode=page: índices de página (null = default freemium)
      lockedSections: null,   // mode=section: ids de H1/H2 (null = default freemium)
    },
    // Regras do Miolo (sidebar Documento) — paginação, default off (aditivo).
    // h1NewPage: cada H1 inicia página nova.
    // headKeepWithNext: H1–H4 não ficam órfãos no fim da página (grudam no bloco seguinte).
    mioloRules: { h1NewPage: false, headKeepWithNext: false },
  };
}

// defaults do teaser (docs antigos sem freePdf / campos parciais)
const FREE_PDF_MSG_LEGACY = 'Se torne Paradigma Pro para ter acesso ao relatório completo.';
function freePdfConfig() {
  const d = seedDoc().freePdf;
  const f = (state.doc && state.doc.freePdf) || {};
  let message = (f.message != null && String(f.message)) || d.message;
  if (message.trim() === FREE_PDF_MSG_LEGACY) message = d.message;
  const mode = f.mode === 'section' ? 'section' : 'page';
  return {
    mode,
    message,
    link: (f.link != null && String(f.link)) || d.link,
    cta: (f.cta != null && String(f.cta)) || d.cta,
    locked: Array.isArray(f.locked) ? f.locked.map(n => +n).filter(n => Number.isFinite(n)) : null,
    lockedSections: Array.isArray(f.lockedSections)
      ? f.lockedSections.map(String).filter(Boolean)
      : null,
  };
}
function ensureFreePdf() {
  if (!state.doc.freePdf || typeof state.doc.freePdf !== 'object') {
    state.doc.freePdf = { ...seedDoc().freePdf };
  }
  return state.doc.freePdf;
}

// ── seções <details> da sidebar: default + leitura do estado persistido ─────
// Por padrão só Documento, Cabeçalho e Rodapé abertos; o resto fecha até o user abrir.
// Estado vive em cfg.sidebarSecs (mesmo LS_KEY do save) — sobrevive a reload.
const SIDEBAR_SEC_DEFAULTS = {
  documento: true, capa: false, index: false, back: false, header: true, footer: true,
};
function readSidebarSecs() {
  const out = {};
  document.querySelectorAll('aside details[data-sec]').forEach(d => {
    out[d.dataset.sec] = !!d.open;
  });
  return out;
}
function persistSidebarSecsNow() {
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    cfg.sidebarSecs = readSidebarSecs();
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {}
}

// load() é SÍNCRONO e serve o primeiro paint: lê do localStorage o que é pequeno
// (rodapé, nº da 1ª página, capa/contracapa/índice). O MIOLO não cabe aqui — imagem
// em base64 estoura os ~5 MB de quota do localStorage — então ele mora no IndexedDB
// e volta logo depois, em restoreSession() (ver o bloco de init no fim do arquivo).
function load() {
  state.doc = seedDoc();
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    if (cfg.footText != null) state.doc.footText = cfg.footText;
    if (cfg.headText != null) state.doc.headText = cfg.headText;
    if (cfg.firstPage != null) state.doc.firstPage = +cfg.firstPage || 0;
    // espessura: valor salvo; se a sessão LS é antiga e não tem o campo → 1px legado
    // (não o default novo 0.5). Sessão vazia mantém seed 0.5.
    const hadLsSession = !!(cfg.footText != null || cfg.headText != null || cfg.cover
      || cfg.back || cfg.index || hasOwn(cfg, 'ruleTop') || hasOwn(cfg, 'ruleBot'));
    if (hasOwn(cfg, 'ruleTop') && cfg.ruleTop != null) state.doc.ruleTop = clampRuleW(cfg.ruleTop);
    else if (hadLsSession) state.doc.ruleTop = RULE_W_LEGACY;
    if (hasOwn(cfg, 'ruleBot') && cfg.ruleBot != null) state.doc.ruleBot = clampRuleW(cfg.ruleBot);
    else if (hadLsSession) state.doc.ruleBot = RULE_W_LEGACY;
    // aligns / modo impressão: ausentes = visual antigo (esq / esq / dir / off) = seed
    if (cfg.headAlign != null) state.doc.headAlign = clampFootAlign(cfg.headAlign);
    if (cfg.pnumAlign != null) state.doc.pnumAlign = clampFootAlign(cfg.pnumAlign);
    if (cfg.footAlign != null) state.doc.footAlign = clampFootAlign(cfg.footAlign);
    if (cfg.printMirror != null) state.doc.printMirror = !!cfg.printMirror;
    if (cfg.pageBg != null) {
      const p = parseColor(cfg.pageBg);
      if (p) state.doc.pageBg = withAlpha(p.hex, p.alpha);
    }
    if (cfg.pnumColor) state.doc.pnumColor = cfg.pnumColor;
    if (cfg.footColor) state.doc.footColor = cfg.footColor;
    if (cfg.colLeft != null) state.doc.colLeft = clampColL(cfg.colLeft);
    if (cfg.source) {
      state.doc.source = cfg.source;
      // sessões antigas sem format: infere do nome (.zip → pdgm, senão md)
      if (state.doc.source && !state.doc.source.format) {
        state.doc.source.format = projectFormatFromName(state.doc.source.label) || 'md';
      }
    }
    if (cfg.cover) state.doc.cover = cfg.cover;
    if (cfg.back) state.doc.back = cfg.back;
    if (cfg.index) state.doc.index = cfg.index;
    // migração (t2.11): LS antigo não tinha resumoOn (índice e resumo ligavam juntos,
    // um switcher só) → se o campo não existe, assume true (preserva o comportamento:
    // índice ligado ⇒ resumo também aparecia). Só é no-op quando cfg.index já veio com
    // resumoOn OU quando cfg.index nem existia (seedDoc já seta resumoOn:true).
    if (state.doc.index.resumoOn === undefined) state.doc.index.resumoOn = true;
    // migração: LS/arquivo salvo antes das opções do índice não tem esses campos. O default de
    // width é 'curto', então documentos antigos passam a abrir com o índice estreito — é o
    // padrão pedido, não um acidente.
    const idx = state.doc.index;
    if (!idx.levels) idx.levels = { h1: true, h2: true, h3: false, h4: false };
    idx.color ||= 'padrao'; idx.width ||= 'curto'; idx.resumoWidth ||= 'full';
    // aditivo: docs/LS sem o campo mantêm layout empilhado (comportamento antigo)
    if (idx.espacarSessoes === undefined) idx.espacarSessoes = false;
    else idx.espacarSessoes = !!idx.espacarSessoes;
    ensureIndexColors(idx);
    // migração: capas salvas antes do Y livre / logo / type / bgFit — ver migrateSpecialPages
    migrateSpecialPages(state.doc);
  } catch {}
}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => {
  // sessão COMPLETA (miolo incluso, com imagens) no IndexedDB — é o que faz o documento
  // sobreviver a reload/fechar a aba. Sem isso o miolo só existia em memória, e um Salvar
  // depois de um reload exportava um .pdgm com blocos vazios (capa/resumo vinham do LS,
  // o que fazia o arquivo PARECER cheio — 1 MB de fundo em base64 — e abrir vazio).
  idb.set('doc', state.doc);
  const cfg = {
    footText: state.doc.footText, headText: state.doc.headText, firstPage: state.doc.firstPage,
    ruleTop: ruleWidthOf('top'), ruleBot: ruleWidthOf('bot'),
    headAlign: clampFootAlign(state.doc.headAlign || 'left'),
    pnumAlign: clampFootAlign(state.doc.pnumAlign),
    footAlign: clampFootAlign(state.doc.footAlign || 'right'),
    printMirror: !!state.doc.printMirror,
    pageBg: pageBgOf(),
    pnumColor: pnumColorOf(),
    footColor: footColorOf(),
    colLeft: colL(),
    source: state.doc.source || null, cover: state.doc.cover, back: state.doc.back, index: state.doc.index,
    // seções expandíveis da sidebar (Texto/Capa/…) — UI chrome, não documento
    sidebarSecs: readSidebarSecs(),
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }
  catch {                                    // quota (imagem de fundo grande) → salva sem os bg
    try {
      const light = JSON.parse(JSON.stringify(cfg));
      if (light.cover) light.cover.bg = null;
      if (light.back) light.back.bg = null;
      localStorage.setItem(LS_KEY, JSON.stringify(light));
    } catch {}
  }
  // projeto .pdgm vinculado (File System Access): autosave no mesmo ficheiro do disco
  scheduleProjectAutosave();
}, 250); }

// ─────────────────────────── histórico (undo/redo) ──────────────────────────
// Snapshot do documento inteiro em JSON. Coalesce rajadas de digitação num só
// passo (commit debounced ao fim do render). ponytail: teto de 60 estados —
// imagens são data URLs pesadas; se precisar de mais, guardar delta em vez do doc.
const hist = { past: [], future: [], last: null };
const snap = () => JSON.stringify({ blocks: state.doc.blocks, footText: state.doc.footText, firstPage: state.doc.firstPage });
let commitT;
function scheduleCommit() { clearTimeout(commitT); commitT = setTimeout(commit, 500); }
function commit() {
  const s = snap();
  if (hist.last === null) { hist.last = s; return; }   // 1ª chamada: só marca a base
  if (s === hist.last) return;
  hist.past.push(hist.last);
  if (hist.past.length > 60) hist.past.shift();
  hist.last = s; hist.future.length = 0;
  updateHistBtns();
}
function restoreSnap(s) {
  const o = JSON.parse(s);
  state.doc.blocks = o.blocks; state.doc.footText = o.footText; state.doc.firstPage = o.firstPage;
  document.getElementById('footText').value = o.footText;
  document.getElementById('firstPage').value = o.firstPage;
  state.activeId = state.doc.blocks[0]?.id; state.sel = null; closeImgPanel();
  render();
}
function undo() {
  clearTimeout(commitT); commit();               // fecha a rajada pendente antes de voltar
  if (!hist.past.length) return;
  hist.future.push(hist.last);
  hist.last = hist.past.pop();
  restoreSnap(hist.last); updateHistBtns();
}
function redo() {
  if (!hist.future.length) return;
  hist.past.push(hist.last);
  hist.last = hist.future.pop();
  restoreSnap(hist.last); updateHistBtns();
}
function updateHistBtns() {
  const u = document.getElementById('btnUndo'), r = document.getElementById('btnRedo');
  if (u) u.disabled = !hist.past.length;
  if (r) r.disabled = !hist.future.length;
}

// índice de um bloco por id
const idxOf = (id) => state.doc.blocks.findIndex(b => b.id === id);
const blockOf = (id) => state.doc.blocks.find(b => b.id === id);

// ─────────────────────────── medição ────────────────────────────────────────
const measurer = document.createElement('div');
measurer.className = 'page';
measurer.setAttribute('aria-hidden', 'true');
measurer.style.cssText = 'position:absolute;left:-99999px;top:0;height:auto;overflow:visible;box-shadow:none;';
measurer.innerHTML = `<div class="mcol l" style="width:${COL_L_DEFAULT}px"></div>`
  + `<div class="mcol f" style="width:${COL_FULL}px"></div>`;
document.body.appendChild(measurer);
const mL = measurer.querySelector('.mcol.l');
const mF = measurer.querySelector('.mcol.f');

// Coluna de prova (largura do miolo). A paginação empilha de verdade aqui e lê a altura
// real do stack — somar measure()+gap diverge do layout (subpixel, full-width, etc.) e
// deixava o último item pintado abaixo da guia da coluna.
const trialCol = document.createElement('div');
trialCol.style.width = COL_L_DEFAULT + 'px';
measurer.appendChild(trialCol);

/** Alinha medidores à colLeft atual — chamar antes de paginate/measure. */
function syncMeasurerCols() {
  const L = colL();
  mL.style.width = L + 'px';
  mF.style.width = COL_FULL + 'px';
  trialCol.style.width = L + 'px';
  // Mesma classe .editing das páginas reais: botões do grid (Substituir/Remover) só
  // ficam position:absolute sob .page.editing. Sem isso o medidor conta ~35px a mais
  // por célula e a paginação empurra o bloco seguinte (ex.: última imagem sozinha
  // na página) mesmo com espaço visual sobrando.
  measurer.classList.toggle('editing', !!editing);
}

function measure(b) {
  // mesmo `editing` do render (contenteditable/chrome). A toolbar da tabela é flutuante
  // (popover #tablePanel é flutuante — não afeta altura).
  const el = buildBlock(b, editing);
  // bloco 'full' (imagem, tabela, título…) mede na coluna cheia, senão a altura (e a
  // paginação) sai errada por medir num container estreito demais.
  const col = placementOf(b) === 'full' ? mF : mL;
  col.appendChild(el);
  // ceil: subpixel pra baixo no measure empilhava erro e o último bloco vazava
  // alguns px além de CONTENT_H (a guia tracejada da coluna cortava o texto).
  const h = Math.ceil(el.getBoundingClientRect().height);
  col.removeChild(el);
  return h;
}

function trialClear() { trialCol.replaceChildren(); }
function trialHeight() { return Math.ceil(trialCol.getBoundingClientRect().height); }
function trialAppend(f) {
  if (f.b.type === 'pagebreak') {
    const el = document.createElement('div');
    el.style.cssText = `height:10px;margin-top:${f.gap || 0}px`;
    trialCol.appendChild(el);
    return el;
  }
  const el = buildBlock(f.b, editing);
  if (f.clipH == null) {
    el.style.marginTop = (f.gap || 0) + 'px';
    trialCol.appendChild(el);
    return el;
  }
  const w = document.createElement('div');
  w.style.cssText = `overflow:clip;display:flow-root;height:${f.clipH}px;margin-top:${f.gap || 0}px`;
  el.style.marginTop = -f.clipTop + 'px';
  w.appendChild(el);
  trialCol.appendChild(w);
  return w;
}

// Base de CADA linha visual do bloco, relativa ao topo do box. Um Range sobre o conteúdo
// devolve um rect por linha (e vários na MESMA linha quando há <b>/<a>/<span> inline), então
// agrupamos por 'bottom' com 2px de tolerância — a diferença entre duas linhas de verdade é
// o line-height (14px), longe da tolerância. É o que permite cortar um parágrafo ENTRE páginas
// medindo onde o texto realmente quebrou, em vez de chutar por line-height (justificado, link
// inline e <br> mudam a conta).
function measureLines(b) {
  const el = buildBlock(b, /*editing*/ false);
  const col = placementOf(b) === 'full' ? mF : mL;
  col.appendChild(el);
  const box = el.getBoundingClientRect();
  const r = document.createRange();
  r.selectNodeContents(el);
  const lines = [];
  for (const rc of r.getClientRects()) {
    if (rc.height <= 0) continue;
    const y = rc.bottom - box.top;
    if (lines.length && y - lines[lines.length - 1] < 2) lines[lines.length - 1] = Math.max(lines[lines.length - 1], y);
    else lines.push(y);
  }
  col.removeChild(el);
  return lines;
}

// "Bloco continuado" (o frame encadeado do InDesign): quando o bloco não cabe no resto da
// página, tenta cortá-lo numa quebra de linha em vez de empurrar tudo pra próxima. Devolve a
// ALTURA da parte que fica (bottom da última linha que coube) ou null quando não vale partir.
// Anti-viúva/órfã: no mínimo MIN_LINES de cada lado — parágrafo de 3 linhas nunca parte.
// ponytail: só 'p' e 'caption'. li/ol/quote/check/callout têm marcador ou moldura por bloco
// e cortar no meio exigiria decidir o que acontece com a borda/o bullet; entra quando alguém pedir.
const MIN_LINES = 2;
const splittable = (b) => (b.type === 'p' || b.type === 'caption') && placementOf(b) === 'inline';
// `from` = quanto do bloco já foi colocado em páginas anteriores (0 no 1º pedaço). Devolve o
// bottom ABSOLUTO da última linha que cabe em `room`, ou null quando não vale partir aqui.
function splitFit(b, lines, from, room) {
  if (room <= 0) return null;
  const i0 = lines.findIndex(y => y > from + 0.5);       // 1ª linha ainda não colocada
  if (i0 < 0) return null;
  const restantes = lines.length - i0;
  if (restantes < MIN_LINES * 2) return null;            // não sobra 2+2 → o resto sobe inteiro
  let k = 0;
  for (let i = MIN_LINES; i <= restantes - MIN_LINES; i++) if (lines[i0 + i - 1] - from <= room) k = i;
  return k ? lines[i0 + k - 1] : null;
}
/** Regras de paginação do miolo (sidebar Documento → Regras do Miolo). */
function mioloRulesOf() {
  return ensureMioloRules(state.doc || {});
}
/** Próximo bloco de fluxo após `b` (pula pagebreak). */
function nextFlowBlock(stream, b) {
  const i = stream.indexOf(b);
  if (i < 0) return null;
  for (let j = i + 1; j < stream.length; j++) {
    if (stream[j].type !== 'pagebreak') return stream[j];
  }
  return null;
}
/**
 * Altura mínima do começo de um bloco (keep-with-next).
 * splittable: primeiras MIN_LINES; senão o bloco inteiro.
 */
function minLeadHeight(b) {
  if (!b) return 0;
  if (splittable(b)) {
    const lines = measureLines(b);
    if (!lines.length) return measure(b);
    const n = Math.min(MIN_LINES, lines.length);
    return Math.ceil(lines[n - 1]);
  }
  return measure(b);
}

// defaults do callout: cinza do swatch (#94A3B8) — fundo a 10% de opacidade, ícone a 100%.
// Ícone padrão = information-circle SOLID; o popover tem toggle Solid|Outline.
const SWATCH_GRAY = '#94A3B8';
const DEFAULT_CALLOUT_BG = 'rgba(148,163,184,0.10)';
const DEFAULT_ICON_COLOR = SWATCH_GRAY;
const DEFAULT_CALLOUT_ICON = 'information-circle';
const DEFAULT_CALLOUT_ICON_STYLE = 'solid';   // 'solid' | 'outline'

function calloutIconStyle(b) {
  return b.iconStyle === 'outline' ? 'outline' : DEFAULT_CALLOUT_ICON_STYLE;
}
// SVG do ícone do callout — sempre Ionicons oficial (preferLib), nunca o set 24×24 da casa
function calloutIconHtml(key, size = 14, style = 'solid') {
  if (isTextIcon(key)) return `<span class="co-icon-txt">${textIconLabel(key)}</span>`;
  if (!findIcon(key, style, true) && !findIcon(key, 'outline', true)) return '';
  return iconSvg(key, { x: 0, y: 0, w: size, h: size }, 'currentColor', 1.8, style, true).replace(/ x="0" y="0"/, '');
}
// chave efetiva do ícone: default info; ''/none = sem ícone; sigla txt:…; emoji legado
function calloutIconKey(b) {
  if (b.iconSet === 'none' || b.icon === '') return null; // explicitamente sem ícone
  const st = calloutIconStyle(b);
  if (b.icon && isTextIcon(b.icon)) return b.icon;
  if (b.icon && (findIcon(b.icon, st, true) || findIcon(b.icon, 'outline', true))) return b.icon;
  if (b.iconSet === 'emoji') return null; // emoji livre: calloutIconKey null, render usa b.icon texto
  if (b.iconSet === 'ionicon' || b.icon == null) return DEFAULT_CALLOUT_ICON;
  return null;
}
function calloutHasIcon(b) {
  if (b.iconSet === 'none' || b.icon === '') return false;
  if (calloutIconKey(b)) return true;
  // emoji livre (não é txt:SIGLA nem chave ionicon)
  if (b.iconSet === 'emoji' && b.icon) return true;
  return false;
}
// semeia defaults só em callout NOVO (sem icon/iconSet) — não sobrescreve legado nem "none"
function ensureCalloutDefaults(b) {
  if (!b || b.type !== 'callout') return;
  if (b.iconSet === 'none') return;
  if (b.iconSet == null && (b.icon == null || b.icon === undefined)) {
    b.iconSet = 'ionicon';
    b.icon = DEFAULT_CALLOUT_ICON;
    b.iconStyle = DEFAULT_CALLOUT_ICON_STYLE;
  }
  if (b.iconStyle == null && b.iconSet === 'ionicon') b.iconStyle = DEFAULT_CALLOUT_ICON_STYLE;
}

// ─────────────────────────── construção de elementos ────────────────────────
function buildText(b, editing) {
  const isCheck = b.type === 'check';                                   // trilha B (t7)
  const isCallout = b.type === 'callout';                                // trilha G: envelope [emoji][texto], como o checklist
  const isHead = HEAD_TYPES.has(b.type);
  const showHeadIcon = isHead && headHasIcon(b);
  const tag = isHead ? b.type
    : b.type === 'quote' ? 'blockquote' : (b.type === 'li' || b.type === 'ol' || isCheck || isCallout) ? 'div' : 'p';
  const el = document.createElement(tag);
  // o texto do checklist/callout é interno SEM 'b' (moldura no envelope).
  // head com ícone MANTÉM 'b' + tipo no <hN> — senão perde .page h1.b { font-size:24px… }
  // e o título muda de tamanho ao colocar o ícone (UA stylesheet do h1).
  el.className = isCheck ? 'ck-txt'
    : isCallout ? 'co-txt'
      : showHeadIcon ? ('b head-txt ' + b.type)
        : 'b ' + (b.type === 'li' ? 'li' : b.type === 'ol' ? 'ol' : b.type === 'quote' ? 'quote' : b.type);
  el.dataset.id = b.id;
  el.dataset.ph = PH[b.type] || '';
  el.innerHTML = b.html || '';
  if (editing) {
    el.contentEditable = 'true'; el.spellcheck = true; el.lang = 'pt-BR';  // corretor nativo PT-BR
  }
  applyTypeStyle(el, b.type);
  // indent de lista (Tab): li/ol aplicam no próprio .b; check aplica no envelope abaixo
  if (!isCheck && !isCallout && LIST_TYPES.has(b.type)) applyListIndentStyle(el, b);
  // marcador: ol usa _num/_nums (numberLists); li usa marker/subMarker do ⋮
  if (!isCheck && !isCallout && (b.type === 'ol' || b.type === 'li')) applyListMarkers(el, b);
  // active-block NÃO é aplicado aqui — paintActiveBlock() pinta o envelope
  // (`.col-left > [data-id]`, que no corte entre páginas é o .frag, e no check/callout
  // é o wrap). Assim a borda roxa cobre a altura total e a alça ⠿ ancora no mesmo box.
  // header com ícone: envelope flex [ícone | texto], alinhados ao centro vertical
  if (showHeadIcon) {
    const wrap = document.createElement('div');
    // envelope sem tipo h1/h2 no class (evita herdar tipografia errada); só head-wrap + b p/ foco
    wrap.className = 'b head-wrap';
    wrap.dataset.id = b.id;
    wrap.dataset.head = b.type;
    const ico = document.createElement('span');
    ico.className = 'head-icon';
    ico.setAttribute('aria-hidden', 'true');
    // tamanho global (doc.headingIconSize) ou auto 1.05×fontSize do tipo
    const ms = materialOptsFrom(b, 'head');
    const sz = headingIconSizePx(b.type);
    ico.innerHTML = iconHtml(headIconName(b), { ...ms, size: sz });
    // clique no glifo foca o bloco e abre o painel (sem menu flutuante)
    if (editing) {
      ico.style.cursor = 'pointer';
      ico.title = 'Editar ícone';
      ico.addEventListener('mousedown', (e) => e.preventDefault());
      ico.addEventListener('click', (e) => {
        e.stopPropagation();
        state.activeId = b.id;
        paintActiveBlock(b.id);
        openIconBlockPanel();
      });
    }
    wrap.append(ico, el);
    return wrap;
  }
  if (!isCheck && !isCallout) return el;
  if (isCallout) {
    // callout = [.callout-row: ícone+texto]. Ícone padrão = information-circle (lib completa
    // de Ionicons, mesma de charts/timelines); troca via #calloutBar → openIconPop.
    // Legado: iconSet==='emoji' ou glifo solto ainda renderiza como texto.
    ensureCalloutDefaults(b);
    const wrap = document.createElement('div');
    const noIcon = !calloutHasIcon(b);
    wrap.className = 'b callout' + (noIcon ? ' no-icon' : '');
    wrap.dataset.id = b.id;                      // mesmo esquema do check: alça/drag acham o envelope por [data-id]
    wrap.style.background = b.color || DEFAULT_CALLOUT_BG;

    const row = document.createElement('div');
    row.className = 'callout-row';
    if (!noIcon) {
      const icon = document.createElement('div');
      icon.className = 'co-icon';
      icon.style.color = b.iconColor || DEFAULT_ICON_COLOR;
      const key = calloutIconKey(b);
      if (key) {
        icon.innerHTML = calloutIconHtml(key, 14, calloutIconStyle(b));
      } else {
        // emoji livre legado
        icon.textContent = b.icon || 'ℹ️';
        if (editing) {
          icon.contentEditable = 'true'; icon.spellcheck = false;
          icon.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); icon.blur(); } });
          icon.addEventListener('input', () => {
            const chars = [...icon.textContent];
            if (chars.length > 1) {
              icon.textContent = chars[chars.length - 1];
              const r = document.createRange(); r.selectNodeContents(icon); r.collapse(false);
              const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            }
            if (icon.textContent) { b.icon = icon.textContent; b.iconSet = 'emoji'; save(); scheduleCommit(); }
          });
          icon.addEventListener('blur', () => { if (!icon.textContent) icon.textContent = b.icon || 'ℹ️'; });
        }
      }
      row.append(icon, el);
    } else {
      row.append(el); // texto ocupa o espaço do ícone
    }
    wrap.append(row);
    return wrap;
  }
  // trilha B (t7): checklist = envelope [checkbox][texto]. O checkbox é irmão NÃO-editável
  // (contentEditable=false, FORA do .ck-txt), então b.html continua sendo só o texto — o
  // sync do input, o toMarkdown e o measure ficam limpos, sem o markup do <input> no html.
  const wrap = document.createElement('div');
  wrap.className = 'b check' + (b.checked ? ' checked' : '');
  wrap.dataset.id = b.id;                        // '.col-left > [data-id]' (alça/drag) acha o envelope
  applyListIndentStyle(wrap, b);                 // subitem (Tab) desloca checkbox + texto juntos
  // estilo do tipo (menu ⋮): cor do check + opacidade do item marcado — CSS vars no envelope
  // (tipografia do texto vem de p via applyTypeStyle acima).
  const ckStyle = typeStyleOf('check');
  wrap.style.setProperty('--ck-color', ckStyle.checkColor || '#29E899');
  wrap.style.setProperty('--ck-done-opacity', String(ckStyle.checkedOpacity != null ? ckStyle.checkedOpacity : 0.55));
  // trilha G: <span>+SVG no lugar do <input type=checkbox> nativo — vazio, o nativo renderiza
  // borda/preenchimento PRETO do SO em vários browsers/impressão. SVG com fill/stroke puro
  // imprime igual em tela e PDF sem precisar de print-color-adjust (ver CSS .ck-box).
  const box = document.createElement('span');
  box.className = 'ck-box'; box.tabIndex = -1;
  box.setAttribute('role', 'checkbox'); box.setAttribute('aria-checked', String(!!b.checked));
  box.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true">'
    + '<rect class="ck-empty" x=".75" y=".75" width="10.5" height="10.5" rx="2.4" fill="none" stroke="#B0B0B0" stroke-width="1.3"/>'
    + '<g class="ck-filled"><rect width="12" height="12" rx="2.6" fill="var(--ck-color, #29E899)"/>'
    + '<path d="M3 6.3l2.1 2.1 4-4.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>'
    + '</svg>';
  if (editing) {
    box.addEventListener('mousedown', (e) => e.preventDefault());   // não rouba o caret do texto adjacente
    box.addEventListener('click', () => {   // span não tem 'change' — togla no click (mesmo resultado de antes)
      b.checked = !b.checked; box.setAttribute('aria-checked', String(b.checked));
      wrap.classList.toggle('checked', b.checked); save(); scheduleCommit();
    });
  }
  wrap.append(box, el);
  return wrap;
}

// Marca o envelope de cada ocorrência do bloco ativo com .active-block (borda roxa).
// Cobre texto simples, check/callout, tabela, frag cortado entre páginas e rimg da direita.
// NÃO pinta no contenteditable interno (.ck-txt/.co-txt/célula) — o outline precisa na
// altura do bloco inteiro, que é o que a alça ⠿ também ancora.
function paintActiveBlock(id) {
  pagesEl.querySelectorAll('.active-block').forEach(el => el.classList.remove('active-block'));
  // célula de tabela com .tbl-sel não some só porque o foco mudou — limpa se o
  // bloco ativo não é mais aquela tabela (ou table-grid).
  const keepTbl = id && (() => {
    const b = blockOf(id);
    return b && (b.type === 'table' || b.type === 'table-grid') ? id : null;
  })();
  clearTableCellSelections(keepTbl);
  if (typeof updateTblCellBar === 'function') updateTblCellBar();
  if (!id) return;
  pagesEl.querySelectorAll(
    `.col-left > [data-id="${id}"], .col-right > [data-id="${id}"]`
  ).forEach(el => el.classList.add('active-block'));
}

// picker de ícone do Callout = openIconPop + toggle Solid|Outline.
// "Sem ícone" (pick '') → iconSet 'none', texto full-width.
function openCalloutIconPicker(anchor, b) {
  const cur = b.iconSet === 'none' || b.icon === ''
    ? ''
    : (calloutIconKey(b) || (isTextIcon(b.icon) ? b.icon : DEFAULT_CALLOUT_ICON));
  openIconPop(anchor, (key) => {
    if (!key) {
      b.iconSet = 'none';
      b.icon = '';
    } else if (isTextIcon(key)) {
      b.iconSet = 'emoji';
      b.icon = key;
    } else {
      b.iconSet = 'ionicon';
      b.icon = key;
    }
    save(); scheduleCommit();
    render({ id: b.id, role: 'block', offset: 0 });
  }, cur, {
    styleToggle: true,
    style: calloutIconStyle(b),
    onStyle: (s) => {
      b.iconStyle = s;
      const el = pagesEl.querySelector(`.callout[data-id="${b.id}"] .co-icon`);
      const key = calloutIconKey(b);
      if (el && key) el.innerHTML = calloutIconHtml(key, 14, s);
      if (key && findIcon(key, s, true)) paintIconBtn(calloutBarIconBtn, key, s, true);
      else if (!key) calloutBarIconBtn.innerHTML = '';
      save(); scheduleCommit();
    },
  });
}
// pinta o chip de fundo do callout com base branca (papel) sob a cor com alpha
function paintCalloutBgChip(el, color) {
  const c = color || DEFAULT_CALLOUT_BG;
  const p = parseColor(c);
  if (p && p.alpha < 1) {
    el.style.background = '';
    el.style.setProperty('--sp-ov', c);
    el.classList.add('paper');
  } else {
    el.classList.remove('paper');
    el.style.background = c;
  }
}

// #calloutBar — barra FLUTUANTE de controles do callout ativo (trocar ícone / cor), mesmo
// padrão do #fmtbar: elemento único no HTML, reposicionado via getBoundingClientRect() do alvo
// (aqui o bloco ATIVO — state.activeId — em vez de uma seleção de texto). mousedown→preventDefault
// pra não roubar o foco do texto ao clicar nos botões (igual ao fmtbar/typebtns).
const calloutBar = document.getElementById('calloutBar');
calloutBar.addEventListener('mousedown', (e) => e.preventDefault());
const calloutBarIconBtn = calloutBar.querySelector('.co-iconbtn');
const calloutBarIconColorBtn = calloutBar.querySelector('.co-iconswatch');
const calloutBarBgBtn = calloutBar.querySelector('.co-bgswatch');
calloutBarIconBtn.addEventListener('click', () => {
  const b = state.activeId && blockOf(state.activeId);
  if (b && b.type === 'callout') openCalloutIconPicker(calloutBarIconBtn, b);
});
// cor do ÍCONE (currentColor do SVG/emoji) — botão separado da cor de fundo, mesmo swatch.js
calloutBarIconColorBtn.addEventListener('click', () => {
  const b = state.activeId && blockOf(state.activeId);
  if (!b || b.type !== 'callout') return;
  openSwatchPop(calloutBarIconColorBtn, (color) => {
    b.iconColor = color; save(); scheduleCommit();
    const el = pagesEl.querySelector(`.callout[data-id="${b.id}"] .co-icon`);
    if (el) el.style.color = color;
    calloutBarIconColorBtn.style.background = color;
  }, b.iconColor || DEFAULT_ICON_COLOR);
});
// cor do FUNDO do callout — preview com base branca (papel) sob a tinta com alpha
calloutBarBgBtn.addEventListener('click', () => {
  const b = state.activeId && blockOf(state.activeId);
  if (!b || b.type !== 'callout') return;
  openSwatchPop(calloutBarBgBtn, (color) => {
    b.color = color; save(); scheduleCommit();
    const el = pagesEl.querySelector(`.callout[data-id="${b.id}"]`);
    if (el) el.style.background = color;
    paintCalloutBgChip(calloutBarBgBtn, color);
  }, b.color || DEFAULT_CALLOUT_BG, { paper: true });
});
// ── ícone em H1–H4: só painel contextual à direita (sem barra flutuante) ─────
// updateHeadBar: ao focar/selecionar um título (bloco ou parte do texto), abre
// #iconPanel (mode=head). Não remonta se já está aberto pro mesmo bid (digitação).
function updateHeadBar() {
  const b = state.activeId && blockOf(state.activeId);
  if (!b || !HEAD_TYPES.has(b.type) || !editing) {
    if (iconPanel && iconPanel.dataset.mode === 'head') closeIconBlockPanel();
    return;
  }
  if (!iconPanel || iconPanel.hidden
    || iconPanel.dataset.mode !== 'head'
    || iconPanel.dataset.bid !== b.id) {
    openIconBlockPanel();
  } else {
    positionIconBlockPanel();
  }
}

// mostra/esconde e reposiciona a barra sobre o bloco callout ATIVO — chamada no focusin
// (qualquer bloco ganhando foco, callout ou não) e no scroll do palco (reflow de posição).
function updateCalloutBar() {
  const b = state.activeId && blockOf(state.activeId);
  const host = b && b.type === 'callout' && pagesEl.querySelector(`.callout[data-id="${b.id}"]`);
  if (!host) { calloutBar.hidden = true; return; }
  const key = calloutIconKey(b);
  const st = calloutIconStyle(b);
  if (b.iconSet === 'none' || b.icon === '') {
    calloutBarIconBtn.innerHTML = '';
    calloutBarIconBtn.title = 'Sem ícone (clique para escolher)';
  } else if (key && findIcon(key, st, true)) {
    paintIconBtn(calloutBarIconBtn, key, st, true);
    calloutBarIconBtn.title = 'Trocar ícone';
  } else if (key && isTextIcon(key)) {
    calloutBarIconBtn.textContent = textIconLabel(key);
  } else if (b.iconSet === 'emoji' && b.icon) {
    calloutBarIconBtn.textContent = b.icon;
  } else {
    paintIconBtn(calloutBarIconBtn, DEFAULT_CALLOUT_ICON, st, true);
  }
  calloutBarIconColorBtn.style.background = b.iconColor || DEFAULT_ICON_COLOR;
  paintCalloutBgChip(calloutBarBgBtn, b.color || DEFAULT_CALLOUT_BG);
  calloutBar.hidden = false;
  // acima do callout, centrada; se não couber, abaixo — mesma heurística do updateFmtbar()
  const rect = host.getBoundingClientRect();
  const bw = calloutBar.offsetWidth, bh = calloutBar.offsetHeight;
  const x = Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, innerWidth - bw - 8));
  const y = rect.top - bh - 8 >= 8 ? rect.top - bh - 8 : rect.bottom + 8;
  calloutBar.style.left = x + 'px'; calloutBar.style.top = y + 'px';
}

// Popover da tabela (mesmo padrão do #imgPanel): ao lado do bloco, não por cima.
// Linhas/colunas/resize ficam no chrome Notion do .tbl-wrap (bloco-tabela.js).
let tablePanel;
let tablePanelDismissed = false; // clique fora fecha e não reabre até re-selecionar
function activeTableBlock() {
  const b = state.activeId && blockOf(state.activeId);
  if (b && b.type === 'table') return b;
  // tabela na capa/contracapa (item livre com type=table)
  if (state.sel) {
    const f = findCoverItem(state.sel);
    if (f && f.item.type === 'table') return f.item;
  }
  return null;
}
function closeTablePanel() { if (tablePanel) tablePanel.hidden = true; }

/** Ícones de alinhamento vertical (topo / meio / base) — espelham ALIGN_ICON. */
const VALIGN_ICON = {
  top: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="10" height="2" rx="1"/><rect x="5" y="6" width="6" height="2" rx="1"/><rect x="4" y="10" width="8" height="2" rx="1" opacity=".35"/></svg>',
  middle: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="8" height="2" rx="1" opacity=".35"/><rect x="3" y="7" width="10" height="2" rx="1"/><rect x="4" y="11" width="8" height="2" rx="1" opacity=".35"/></svg>',
  bottom: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="2" rx="1" opacity=".35"/><rect x="5" y="8" width="6" height="2" rx="1"/><rect x="3" y="12" width="10" height="2" rx="1"/></svg>',
};

function fmtTableLineHeight(n) {
  const v = clampTableLineHeight(n);
  return String(v);
}

/**
 * HTML dos controles de estilo da tabela.
 * @param {object} b
 * @param {'full'|'shared'|'item'} mode
 *   full   — tabela avulsa (tudo)
 *   shared — estilos iguais em todas as tabelas do grid
 *   item   — só o que pode diferir por tabela no grid
 */
/**
 * Chip de cor compacto (par fundo/texto no estilo #fmtbar).
 * kind: 'fill' = fundo do chip; 'text' = “A” com underline da cor.
 */
function tblColorBtnHtml(attr, color, kind, title) {
  const c = color || '#000000';
  if (kind === 'text') {
    return `<button type="button" class="tbl-cbtn tbl-cbtn-text" data-a="${attr}" title="${title}"
      style="--c:${c};border-bottom-color:${c}">A</button>`;
  }
  return `<button type="button" class="tbl-cbtn tbl-cbtn-fill" data-a="${attr}" title="${title}"
    style="--c:${c};background:${c}"></button>`;
}

function tableStyleFieldsHtml(b, mode = 'full') {
  const headerColor = tableHeaderBg(b);
  const headerText = tableHeaderTextOf(b);
  const textColor = tableTextColorOf(b);
  const outer = borderOuterOf(b);
  const inner = borderInnerOf(b);
  const bg = tableBgOf(b);
  const altBg = tableAltRowBgOf(b);
  const radius = tableRadiusOf(b);
  const bwOuter = tableBorderWidthOuterOf(b);
  const bwInner = tableBorderWidthInnerOf(b);
  const fontSize = tableFontSizeOf(b);
  const lineHeight = tableLineHeightOf(b);
  const vlinesOn = b.hideVLines !== true;
  const altOn = !!b.altRows;
  const isItem = mode === 'item';
  const isShared = mode === 'shared';
  const showStruct = mode === 'full';
  const showShared = mode === 'full' || isShared;
  const showColors = mode === 'full' || isItem;
  // linhas alternadas: tabela avulsa (full) e por tabela no grid (item)
  const showAlt = showStruct || isItem;

  let html = '';
  if (showStruct) {
    html += `
    <div class="swrow"><span>Linhas Verticais</span>
      <button type="button" class="sw" data-a="vlines" role="switch" aria-checked="${vlinesOn}"></button></div>
    <div class="field">Alinhamento (tabela)<div data-slot="align"></div></div>
    <div class="field">Vertical (tabela)<div data-slot="valign"></div></div>`;
  }
  // grid item: alinhamento default daquela tabela (por célula fica na #tblCellBar)
  if (isItem) {
    html += `
    <div class="field">Alinhamento (tabela)<div data-slot="align"></div></div>
    <div class="field">Vertical (tabela)<div data-slot="valign"></div></div>`;
  }
  if (showAlt) {
    html += `
    <div class="swrow"><span>Linhas alternadas</span>
      <button type="button" class="sw" data-a="alt" role="switch" aria-checked="${altOn}"></button></div>
    <div class="field tbl-alt-color-field" data-role="alt-color" ${altOn ? '' : 'hidden'}>
      <div class="field-row">Cor da 2ª linha
        <span class="tbl-color-pair" role="group" aria-label="Cor da linha alternada">
          ${tblColorBtnHtml('altColor', altBg, 'fill', 'Cor de fundo da linha alternada')}
        </span>
      </div>
    </div>`;
  }
  if (showShared) {
    html += `
    <label class="field"><span class="field-row">Tamanho da fonte <span class="field-val"><span data-role="fsv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric" title="Clique para digitar">${fontSize}</span>px<button type="button" class="resetbtn" data-a="fsreset" title="Redefinir para ${DEFAULT_TABLE_FONT_SIZE}px">↺</button></span></span>
      <input type="range" data-a="fontSize" min="${TABLE_FONT_SIZE_MIN}" max="${TABLE_FONT_SIZE_MAX}" step="1" value="${fontSize}" data-snaps="6,8,10,12,14,16,18,24" data-edit="off">
    </label>
    <label class="field"><span class="field-row">Altura da linha <span class="field-val"><span data-role="lhv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="decimal" title="Clique para digitar">${fmtTableLineHeight(lineHeight)}</span><button type="button" class="resetbtn" data-a="lhreset" title="Redefinir para ${DEFAULT_TABLE_LINE_HEIGHT}">↺</button></span></span>
      <input type="range" data-a="lineHeight" min="${TABLE_LINE_HEIGHT_MIN}" max="${TABLE_LINE_HEIGHT_MAX}" step="0.05" value="${lineHeight}" data-snaps="1,1.15,1.35,1.5,1.75,2,2.5" data-edit="off">
    </label>`;
  }
  if (showColors) {
    // pares inline (fundo + texto) no padrão do fmtbar — cabeçalho e corpo
    html += `
    <div class="field tbl-color-fields">
      <div class="field-row">Cabeçalho
        <span class="tbl-color-pair" role="group" aria-label="Cores do cabeçalho">
          ${tblColorBtnHtml('headerColor', headerColor, 'fill', 'Fundo do cabeçalho')}
          ${tblColorBtnHtml('headerTextColor', headerText, 'text', 'Texto do cabeçalho')}
        </span>
      </div>
      <div class="field-row">Corpo
        <span class="tbl-color-pair" role="group" aria-label="Cores do corpo">
          ${tblColorBtnHtml('bg', bg, 'fill', 'Fundo da tabela')}
          ${tblColorBtnHtml('color', textColor, 'text', 'Texto do corpo')}
        </span>
      </div>
    </div>`;
  }
  if (showShared) {
    html += `
    <div class="field tbl-color-fields">
      <div class="field-row">Linhas
        <span class="tbl-color-pair" role="group" aria-label="Cores das linhas">
          ${tblColorBtnHtml('borderOuter', outer, 'fill', 'Linhas externas')}
          ${tblColorBtnHtml('borderInner', inner, 'fill', 'Linhas internas')}
        </span>
      </div>
    </div>
    <label class="field"><span class="field-row">Espessura externa <span class="field-val"><span data-role="bwov" class="field-edit" contenteditable="true" spellcheck="false" inputmode="decimal" title="Clique para digitar">${bwOuter}</span>px<button type="button" class="resetbtn" data-a="bworeset" title="Redefinir para ${DEFAULT_BORDER_WIDTH}px">↺</button></span></span>
      <input type="range" data-a="borderWidthOuter" min="${TABLE_BORDER_WIDTH_MIN}" max="${TABLE_BORDER_WIDTH_MAX}" step="0.5" value="${bwOuter}" data-snaps="0,0.5,1,1.5,2,3,4" data-edit="off">
    </label>
    <label class="field"><span class="field-row">Espessura interna <span class="field-val"><span data-role="bwiv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="decimal" title="Clique para digitar">${bwInner}</span>px<button type="button" class="resetbtn" data-a="bwireset" title="Redefinir para ${DEFAULT_BORDER_WIDTH}px">↺</button></span></span>
      <input type="range" data-a="borderWidthInner" min="${TABLE_BORDER_WIDTH_MIN}" max="${TABLE_BORDER_WIDTH_MAX}" step="0.5" value="${bwInner}" data-snaps="0,0.5,1,1.5,2,3,4" data-edit="off">
    </label>
    <label class="field"><span class="field-row">Cantos <span class="field-val"><span data-role="radv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric" title="Clique para digitar">${radius}</span>px<button type="button" class="resetbtn" data-a="radiusreset" title="Redefinir para ${DEFAULT_TABLE_RADIUS}px">↺</button></span></span>
      <input type="range" data-a="radius" min="0" max="${TABLE_RADIUS_MAX}" step="1" value="${radius}" data-snaps="0,4,8,12,16,24" data-edit="off">
    </label>`;
  }
  // Mesclar no painel do bloco; Linha/Coluna de cabeçalho só no menu da alça (⋯)
  if (showStruct || isItem) {
    html += `
    <div class="row img-tc-row" style="display:flex;gap:.4rem">
      <button type="button" class="fieldbtn" data-a="merge" style="flex:1;justify-content:center" title="Mescla a seleção; com 1 célula, junta à da direita (ou abaixo)">Mesclar</button>
      <button type="button" class="fieldbtn" data-a="unmerge" style="flex:1;justify-content:center" title="Desfaz o merge da célula ativa">Desagrupar</button>
    </div>`;
  }
  return html;
}

/**
 * Liga switches/swatches/raio/tipografia/alinhamento de estilo de tabela num host.
 * @param {HTMLElement} root
 * @param {object} b dados da tabela (ou bloco grid p/ shared)
 * @param {{ paint?:()=>void, after?:()=>void, sharedOnly?:boolean }} hooks
 */
function wireTableStyleControls(root, b, hooks = {}) {
  const paint = () => {
    if (hooks.sharedOnly) ensureSharedTableStyle(b);
    else ensureTable(b);
    hooks.paint?.();
    hooks.after?.();
  };
  root.querySelectorAll('.sw[data-a]').forEach((sw) => {
    sw.addEventListener('mousedown', (e) => e.preventDefault());
    sw.addEventListener('click', () => {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      if (sw.dataset.a === 'vlines') b.hideVLines = !on;
      else if (sw.dataset.a === 'alt') {
        b.altRows = on;
        if (!on) delete b.altRows;
        // mostra/esconde cor da 2ª linha
        const altField = root.querySelector('[data-role="alt-color"]');
        if (altField) altField.hidden = !on;
      }
      else if (sw.dataset.a === 'headerRow') {
        setTableHeaderRow(b, on);
        // th↔td precisa rebuild, não só paint de CSS vars
        if (hooks.rebuild) { hooks.rebuild(); hooks.after?.(); return; }
        paint();
        return;
      } else if (sw.dataset.a === 'headerCol') {
        setTableHeaderCol(b, on);
        if (hooks.rebuild) { hooks.rebuild(); hooks.after?.(); return; }
        paint();
        return;
      }
      paint();
    });
  });

  // alinhamento horizontal / vertical da TABELA (global)
  const alignSlot = root.querySelector('[data-slot="align"]');
  if (alignSlot) {
    const mountAlign = () => {
      alignSlot.replaceChildren(widthSeg(tableAlignOf(b), [
        { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
        { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
        { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
      ], (v) => {
        const a = normalizeTableAlign(v);
        if (a === DEFAULT_TABLE_ALIGN) delete b.align;
        else b.align = a;
        // células sem override seguem o global no paint
        paint();
        mountAlign();
        updateTblCellBar();
      }));
    };
    mountAlign();
  }
  const valignSlot = root.querySelector('[data-slot="valign"]');
  if (valignSlot) {
    const mountValign = () => {
      valignSlot.replaceChildren(widthSeg(tableValignOf(b), [
        { val: 'top', label: 'Topo', icon: VALIGN_ICON.top },
        { val: 'middle', label: 'Meio', icon: VALIGN_ICON.middle },
        { val: 'bottom', label: 'Base', icon: VALIGN_ICON.bottom },
      ], (v) => {
        const vv = normalizeTableValign(v);
        if (vv === DEFAULT_TABLE_VALIGN) delete b.valign;
        else b.valign = vv;
        paint();
        mountValign();
        updateTblCellBar();
      }));
    };
    mountValign();
  }

  /** Atualiza visual do chip (fill = fundo; text = underline no “A”, estilo fmtbar). */
  const paintColorBtn = (btn, color) => {
    if (!btn) return;
    const c = color || '#000000';
    btn.style.setProperty('--c', c);
    if (btn.classList.contains('tbl-cbtn-text')) {
      btn.style.borderBottomColor = c;
    } else {
      btn.style.background = c;
    }
  };
  const wireSwatch = (attr, apply, currentOf) => {
    const btn = root.querySelector(`[data-a="${attr}"]`);
    if (!btn) return;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const cur = currentOf ? currentOf() : (btn.style.getPropertyValue('--c') || btn.style.background || '#ccc');
      openSwatchPop(btn, (color) => {
        apply(color);
        paintColorBtn(btn, color);
        paint();
      }, cur, { paper: true });
    });
  };
  wireSwatch('headerColor', (c) => {
    if (c === DEFAULT_HEADER_BG) delete b.headerColor;
    else b.headerColor = c;
  }, () => tableHeaderBg(b));
  wireSwatch('headerTextColor', (c) => {
    if (c === DEFAULT_HEADER_TEXT || c === '#000' || c === '#000000') delete b.headerTextColor;
    else b.headerTextColor = c;
  }, () => tableHeaderTextOf(b));
  wireSwatch('color', (c) => {
    if (c === DEFAULT_TEXT_COLOR || c === '#000' || c === '#000000') delete b.color;
    else b.color = c;
  }, () => tableTextColorOf(b));
  wireSwatch('bg', (c) => {
    if (c === DEFAULT_TABLE_BG || c === '#FFF' || c === '#fff') delete b.bg;
    else b.bg = c;
  }, () => tableBgOf(b));
  wireSwatch('borderOuter', (c) => {
    if (c === DEFAULT_BORDER_OUTER) delete b.borderOuter;
    else b.borderOuter = c;
  }, () => borderOuterOf(b));
  wireSwatch('borderInner', (c) => {
    if (c === DEFAULT_BORDER_INNER) delete b.borderInner;
    else b.borderInner = c;
  }, () => borderInnerOf(b));
  wireSwatch('altColor', (c) => {
    if (c === DEFAULT_ALT_ROW_BG) delete b.altColor;
    else b.altColor = c;
  }, () => tableAltRowBgOf(b));

  // ── helpers de slider + campo editável ──────────────────────────────────
  const wireNum = ({ role, attr, resetAttr, clamp, of, def, fmt, parse }) => {
    const edit = root.querySelector(`[data-role="${role}"]`);
    const apply = (raw, { syncText = true } = {}) => {
      const n = clamp(raw);
      // limpa campo se voltou ao default; se legados outer/inner usam borderWidth, grava no campo novo
      if (n === def || (typeof def === 'number' && Math.abs(n - def) < 1e-9)) {
        delete b[attr];
        // se estava só no legado borderWidth e o usuário resetou outer/inner, ok
      } else {
        b[attr] = n;
        // ao setar outer/inner explicitamente, não precisa do legado
        if (attr === 'borderWidthOuter' || attr === 'borderWidthInner') {
          // mantém borderWidth se o outro lado ainda depende dele — só remove se ambos existirem
          if (b.borderWidthOuter != null && b.borderWidthInner != null) delete b.borderWidth;
        }
      }
      if (syncText && edit && document.activeElement !== edit) edit.textContent = fmt(n);
      const range = root.querySelector(`input[data-a="${attr}"]`);
      if (range && document.activeElement !== range) range.value = String(n);
      paint();
    };
    if (edit) {
      wireFieldEditKeys(edit, {
        onInput: (raw) => {
          const n = parse(raw);
          if (n == null) return;
          apply(n, { syncText: false });
        },
        onCommit: (raw) => {
          const n = parse(raw);
          apply(n == null ? of(b) : n, { syncText: true });
          edit.textContent = fmt(of(b));
        },
        onCancel: () => {
          edit.textContent = fmt(of(b));
          apply(of(b), { syncText: true });
        },
      });
    }
    root.querySelectorAll(`[data-a="${attr}"], [data-a="${resetAttr}"]`).forEach((el) => {
      const isRange = el.type === 'range';
      el.addEventListener(isRange ? 'input' : 'click', () => {
        if (el.dataset.a === resetAttr) apply(def);
        else apply(+el.value);
      });
    });
  };

  wireNum({
    role: 'radv', attr: 'radius', resetAttr: 'radiusreset',
    clamp: clampTableRadius, of: tableRadiusOf, def: DEFAULT_TABLE_RADIUS,
    fmt: (n) => String(n),
    parse: (raw) => {
      const n = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
      return Number.isFinite(n) ? n : null;
    },
  });
  wireNum({
    role: 'bwov', attr: 'borderWidthOuter', resetAttr: 'bworeset',
    clamp: clampTableBorderWidth, of: tableBorderWidthOuterOf, def: DEFAULT_BORDER_WIDTH,
    fmt: (n) => String(n),
    parse: (raw) => {
      const n = Number(String(raw ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    },
  });
  wireNum({
    role: 'bwiv', attr: 'borderWidthInner', resetAttr: 'bwireset',
    clamp: clampTableBorderWidth, of: tableBorderWidthInnerOf, def: DEFAULT_BORDER_WIDTH,
    fmt: (n) => String(n),
    parse: (raw) => {
      const n = Number(String(raw ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    },
  });
  wireNum({
    role: 'fsv', attr: 'fontSize', resetAttr: 'fsreset',
    clamp: clampTableFontSize, of: tableFontSizeOf, def: DEFAULT_TABLE_FONT_SIZE,
    fmt: (n) => String(n),
    parse: (raw) => {
      const n = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
      return Number.isFinite(n) ? n : null;
    },
  });
  wireNum({
    role: 'lhv', attr: 'lineHeight', resetAttr: 'lhreset',
    clamp: clampTableLineHeight, of: tableLineHeightOf, def: DEFAULT_TABLE_LINE_HEIGHT,
    fmt: fmtTableLineHeight,
    parse: (raw) => {
      const n = Number(String(raw ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    },
  });

  root.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });

  // Mesclar / Desagrupar — live API (DOM span) com fallback no bloco real + render
  const liveFor = () => {
    if (hooks.tableHost) return tableLiveFromEl(hooks.tableHost()) || tableLiveActive();
    return tableLiveActive();
  };
  const selFromHost = (host) => {
    if (!host) return { r0: 0, c0: 0, r1: 0, c1: 0 };
    const selected = [...host.querySelectorAll('th.tbl-sel, td.tbl-sel')];
    if (selected.length) {
      const rows = selected.map((el) => +el.dataset.row).filter(Number.isFinite);
      const cols = selected.map((el) => +el.dataset.col).filter(Number.isFinite);
      if (rows.length && cols.length) {
        return {
          r0: Math.min(...rows), r1: Math.max(...rows),
          c0: Math.min(...cols), c1: Math.max(...cols),
        };
      }
    }
    const ae = document.activeElement;
    const td = (ae && host.contains(ae) && ae.closest?.('th, td'))
      || host.querySelector('th:focus, td:focus')
      || host.querySelector('th, td');
    if (td) {
      const r = +td.dataset.row;
      const c = +td.dataset.col;
      if (Number.isFinite(r) && Number.isFinite(c)) return { r0: r, c0: c, r1: r, c1: c };
    }
    return { r0: 0, c0: 0, r1: 0, c1: 0 };
  };
  root.querySelector('[data-a="merge"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const live = liveFor();
    if (live?.merge?.()) {
      hooks.after?.();
      return;
    }
    // fallback: muta o bloco e re-render (cria célula com colspan/rowspan)
    if (typeof hooks.onMerge === 'function') hooks.onMerge(selFromHost(hooks.tableHost?.()));
  });
  root.querySelector('[data-a="unmerge"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const live = liveFor();
    if (live?.unmerge?.()) {
      hooks.after?.();
      return;
    }
    if (typeof hooks.onUnmerge === 'function') hooks.onUnmerge(selFromHost(hooks.tableHost?.()));
  });

  enhanceAll(root);
}

function openTablePanel() {
  const b = activeTableBlock();
  if (!b || !editing) { closeTablePanel(); return; }
  ensureTable(b);
  tablePanelDismissed = false;
  closeImgPanel();
  closeImageGridPanel();
  closeTableGridPanel();
  if (!tablePanel) {
    tablePanel = document.createElement('div');
    tablePanel.id = 'tablePanel';
    document.body.appendChild(tablePanel);
  }
  tablePanel.dataset.tid = b.id;
  // TRASH_ICO pode ainda não existir se chamado cedo demais — monta na hora
  const trash = typeof TRASH_ICO !== 'undefined' ? TRASH_ICO : uiIco('trash', 16, 'outline');
  tablePanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Tabela</div>
    ${tableStyleFieldsHtml(b)}
    <button type="button" class="fieldbtn danger" data-a="del">${trash}<span>Remover</span></button>`;
  tablePanel.hidden = false;

  const paintTable = () => {
    const host = pagesEl.querySelector(`.tbl-wrap[data-id="${b.id}"]`);
    if (host) applyTableChrome(host, b);
  };
  wireTableStyleControls(tablePanel, b, {
    paint: paintTable,
    rebuild: () => {
      render();
      if (state.activeId === b.id || state.sel === b.id) openTablePanel();
    },
    tableHost: () => pagesEl.querySelector(`.tbl-wrap[data-id="${b.id}"]`),
    onMerge: (sel) => {
      if (!mergeSelectionOrNeighbor(b, sel)) return;
      save(); scheduleCommit();
      render();
      if (state.activeId === b.id || state.sel === b.id) openTablePanel();
    },
    onUnmerge: (sel) => {
      if (!unmergeCells(b, sel.r0, sel.c0)) return;
      save(); scheduleCommit();
      render();
      if (state.activeId === b.id || state.sel === b.id) openTablePanel();
    },
    after: () => { save(); scheduleCommit(); },
  });
  tablePanel.querySelector('[data-a="del"]').addEventListener('click', () => {
    tableCtx.removeBlock(b.id);
    closeTablePanel();
  });
  positionTablePanel();
}
function positionTablePanel() {
  if (!tablePanel || tablePanel.hidden) return;
  const b = activeTableBlock();
  const el = b && pagesEl.querySelector(`.tbl-wrap[data-id="${b.id}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = tablePanel.offsetWidth || 220;
  const ph = tablePanel.offsetHeight || 200;
  // zona proibida = barra da célula (se aberta) — painel não pode cobrir a barra
  const avoid = tblCellBarRectIfVisible();
  const pos = placeSidePanelBesideHost(r, pw, ph, avoid);
  tablePanel.style.left = pos.x + 'px';
  tablePanel.style.top = pos.y + 'px';
  // re-ancora a barra com o painel já no lugar final
  if (tblCellBar && !tblCellBar.hidden) updateTblCellBar();
}
function updateTableBar() {
  // nome legado: abre/fecha o popover lateral da tabela ativa
  const b = activeTableBlock();
  if (b && editing) {
    // se o usuário fechou clicando fora, não reabre até re-selecionar (openTablePanel)
    if (tablePanelDismissed && tablePanel && tablePanel.dataset.tid === b.id) {
      if (!tablePanel.hidden) positionTablePanel();
      return;
    }
    if (!tablePanel || tablePanel.hidden || tablePanel.dataset.tid !== b.id) openTablePanel();
    else positionTablePanel();
  } else {
    tablePanelDismissed = false;
    closeTablePanel();
  }
}

// ── popover do Grid de Imagens (igualar largura/altura, +/− colunas, remover) ─
let imageGridPanel;
let imageGridPanelDismissed = false;
function activeImageGridBlock() {
  const b = state.activeId && blockOf(state.activeId);
  if (b && b.type === 'image-grid') return b;
  if (state.sel) {
    const f = findCoverItem(state.sel);
    if (f && f.item.type === 'image-grid') return f.item;
  }
  return null;
}
function closeImageGridPanel() { if (imageGridPanel) imageGridPanel.hidden = true; }
function openImageGridPanel() {
  const b = activeImageGridBlock();
  if (!b || !editing) { closeImageGridPanel(); return; }
  ensureImageGrid(b);
  imageGridPanelDismissed = false;
  closeImgPanel();
  closeTablePanel();
  closeTableGridPanel();
  if (!imageGridPanel) {
    imageGridPanel = document.createElement('div');
    imageGridPanel.id = 'imageGridPanel';
    document.body.appendChild(imageGridPanel);
  }
  imageGridPanel.dataset.gid = b.id;
  const trash = typeof TRASH_ICO !== 'undefined' ? TRASH_ICO : uiIco('trash', 16, 'outline');
  const plus = typeof PLUS_SVG !== 'undefined' ? PLUS_SVG : '+';
  const minus = typeof MINUS_SVG !== 'undefined' ? MINUS_SVG : '−';
  const n = b.items.length;
  const equal = equalModeOf(b);
  const gap = gapOf(b);
  const hasTitle = titlesOn(b);
  const hasCap = captionsOn(b);
  const capStyle = captionStyleOf(b);
  // raio: default 4 (igual imagem avulsa); slider fino 0–24, digitável acima disso
  const RADIUS_SLIDER_MAX = 24;
  const RADIUS_DEFAULT = 4;
  const radius = b.radius != null ? b.radius : RADIUS_DEFAULT;
  // largura na página (1/2 colunas do miolo). Na capa o span fica no #coverPanel.
  const mioloGrid = !!(state.activeId && blockOf(state.activeId)?.id === b.id);
  imageGridPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Grid de Imagens</div>
    ${mioloGrid ? `<div class="field">Largura<div data-slot="place"></div></div>` : ''}
    <div class="row img-tc-row">
      <button type="button" class="fieldbtn" data-a="title">${hasTitle ? minus : plus}<span>Título</span></button>
      <button type="button" class="fieldbtn" data-a="caption">${hasCap ? minus : plus}<span>Legenda</span></button>
    </div>
    ${hasCap ? `<div class="field">Estilo da legenda<div data-slot="capstyle"></div></div>` : ''}
    <div class="field">Igualar por<div data-slot="equal"></div></div>
    <div class="field"><span class="field-row">Colunas do grid</span>
      <div class="numstep" data-role="cols">
        <button type="button" data-a="col-" ${n <= 1 ? 'disabled' : ''} title="Menos colunas" aria-label="Menos colunas">−</button>
        <span class="numstep-val" data-role="coln">${n}</span>
        <button type="button" data-a="col+" ${n >= IMAGE_GRID_MAX ? 'disabled' : ''} title="Mais colunas" aria-label="Mais colunas">+</button>
      </div>
    </div>
    <label class="field"><span class="field-row">Espaço entre colunas <span class="field-val"><span data-role="gapv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric" title="Clique para digitar">${gap}</span>px<button type="button" class="resetbtn" data-a="gapreset" title="Redefinir para ${IMAGE_GRID_GAP}px">↺</button></span></span>
      <input type="range" data-a="gap" min="0" max="${IMAGE_GRID_GAP_MAX}" step="1" value="${gap}" data-snaps="0,4,8,12,16,24,32,48" data-edit="off">
    </label>
    <label class="field"><span class="field-row">Cantos (raio) <span class="field-val"><span data-role="radv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric" title="Clique para digitar">${radius}</span>px<button type="button" class="resetbtn" data-a="radiusreset" title="Redefinir para ${RADIUS_DEFAULT}px">↺</button></span></span>
      <input type="range" data-a="radius" min="0" max="${RADIUS_SLIDER_MAX}" step="1" value="${Math.min(radius, RADIUS_SLIDER_MAX)}" data-snaps="0,4,8,12,16,24" data-edit="off">
    </label>
    <button type="button" class="fieldbtn danger" data-a="del">${trash}<span>Remover</span></button>`;
  imageGridPanel.hidden = false;

  const reopen = () => {
    render();
    if (state.activeId === b.id || state.sel === b.id) openImageGridPanel();
  };

  // 1 coluna (esq) | 2 colunas (largura total) — só miolo; capa usa span no coverPanel
  const placeSlot = imageGridPanel.querySelector('[data-slot="place"]');
  if (placeSlot) {
    const pl = placementOf(b) === 'full' ? 'full' : 'inline';
    placeSlot.append(widthSeg(pl, [
      { val: 'inline', label: '1 coluna (esquerda)', icon: COL_ICON.left },
      { val: 'full', label: '2 colunas (largura total)', icon: COL_ICON.full },
    ], (v) => {
      setBlockPlacement(b.id, v);
      if (state.activeId === b.id) openImageGridPanel();
    }));
  }

  // seta de duas pontas: horizontal = igualar por largura; vertical = por altura
  const EQ_W_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h12M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/></svg>';
  const EQ_H_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M4.5 5.5 8 2l3.5 3.5M4.5 10.5 8 14l3.5-3.5"/></svg>';
  imageGridPanel.querySelector('[data-slot="equal"]').append(
    widthSeg(equal, [
      { val: 'width', label: 'Largura (colunas iguais)', icon: EQ_W_ICO },
      { val: 'height', label: 'Altura (mesma altura)', icon: EQ_H_ICO },
    ], (v) => {
      b.equal = v === 'height' ? 'height' : 'width';
      if (b.equal === 'width') delete b.equal;
      reopen();
    }));

  const capSlot = imageGridPanel.querySelector('[data-slot="capstyle"]');
  if (capSlot) {
    // Legenda (⋮ do tipo caption) vs tipografia do parágrafo
    const CAP_DEF_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 5h10M3 8h7M3 11h9"/><path d="M11 4l2 8" opacity=".5"/></svg>';
    const CAP_P_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><text x="3" y="12" font-size="11" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">¶</text></svg>';
    capSlot.append(widthSeg(capStyle, [
      { val: 'default', label: 'Legenda', icon: CAP_DEF_ICO },
      { val: 'p', label: 'Parágrafo', icon: CAP_P_ICO },
    ], (v) => {
      if (v === 'p') b.captionStyle = 'p';
      else delete b.captionStyle;
      reopen();
    }));
  }

  const gapv = imageGridPanel.querySelector('[data-role="gapv"]');
  const paintGap = (raw, { reflow = false, syncText = true } = {}) => {
    const g = clampGap(raw);
    if (g === IMAGE_GRID_GAP) delete b.gap;
    else b.gap = g;
    if (syncText && gapv && document.activeElement !== gapv) gapv.textContent = String(g);
    const range = imageGridPanel.querySelector('input[data-a="gap"]');
    if (range && document.activeElement !== range) range.value = String(g);
    // gap: no arraste só columnGap (equal-width ok); equal-height recalcula no change
    if (reflow) reopen();
    else {
      const grid = pagesEl.querySelector(`.imggrid-wrap[data-id="${b.id}"] .imggrid`);
      if (grid) grid.style.columnGap = g + 'px';
      save(); scheduleCommit();
    }
  };
  if (gapv) {
    wireFieldEditKeys(gapv, {
      onInput: (raw) => {
        const n = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
        if (!Number.isFinite(n)) return;
        paintGap(n, { reflow: false, syncText: false });
      },
      onCommit: (raw) => {
        const n = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
        paintGap(Number.isFinite(n) ? n : gapOf(b), { reflow: true, syncText: true });
        gapv.textContent = String(gapOf(b));
      },
      onCancel: () => {
        gapv.textContent = String(gapOf(b));
        paintGap(gapOf(b), { reflow: false, syncText: true });
      },
    });
  }

  // raio em TODAS as imagens do grid (live no arraste, sem rebuild)
  const radv = imageGridPanel.querySelector('[data-role="radv"]');
  const parseRadius = (raw) => {
    const n = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(Math.floor(PAGE_W / 2), n));
  };
  const paintRadius = (raw, { syncText = true } = {}) => {
    const n = typeof raw === 'number' ? Math.max(0, Math.min(Math.floor(PAGE_W / 2), Math.round(raw))) : parseRadius(raw);
    if (n == null) return;
    if (n === RADIUS_DEFAULT) delete b.radius;
    else b.radius = n;
    const host = pagesEl.querySelector(`.imggrid-wrap[data-id="${b.id}"]`);
    if (host) {
      const px = n + 'px';
      host.querySelectorAll('.imggrid-frame').forEach((fr) => { fr.style.borderRadius = px; });
      host.querySelectorAll('.imggrid-frame img').forEach((img) => { img.style.borderRadius = px; });
    }
    if (syncText && radv && document.activeElement !== radv) radv.textContent = String(n);
    const range = imageGridPanel.querySelector('input[data-a="radius"]');
    if (range) range.value = Math.min(n, RADIUS_SLIDER_MAX);
    save(); scheduleCommit();
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
        paintRadius(n == null ? (b.radius ?? RADIUS_DEFAULT) : n, { syncText: true });
        radv.textContent = String(b.radius ?? RADIUS_DEFAULT);
      },
      onCancel: () => {
        radv.textContent = String(b.radius ?? RADIUS_DEFAULT);
        paintRadius(b.radius ?? RADIUS_DEFAULT, { syncText: true });
      },
    });
  }

  imageGridPanel.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });
  enhanceAll(imageGridPanel);

  imageGridPanel.querySelectorAll('button[data-a], input[data-a]').forEach((el) => {
    const isRange = el.type === 'range';
    el.addEventListener(isRange ? 'input' : 'click', () => {
      const a = el.dataset.a;
      if (a === 'gap') { paintGap(+el.value, { reflow: false }); return; }
      if (a === 'gapreset') { paintGap(IMAGE_GRID_GAP, { reflow: true }); return; }
      if (a === 'radius' || a === 'radiusreset') {
        paintRadius(a === 'radiusreset' ? RADIUS_DEFAULT : +el.value);
        return;
      }
      if (a === 'title') { setTitlesOn(b, !titlesOn(b)); reopen(); return; }
      if (a === 'caption') { setCaptionsOn(b, !captionsOn(b)); reopen(); return; }
      if (a === 'col+') {
        if (b.items.length < IMAGE_GRID_MAX) { setGridCols(b, b.items.length + 1); reopen(); }
        return;
      }
      if (a === 'col-') {
        if (b.items.length > 1) { setGridCols(b, b.items.length - 1); reopen(); }
        return;
      }
      if (a === 'del') {
        imageGridCtx.removeBlock(b.id);
        closeImageGridPanel();
      }
    });
  });
  // soltar o thumb do gap: re-layout (equal height recalcula larguras)
  const gapRange = imageGridPanel.querySelector('input[data-a="gap"]');
  if (gapRange) {
    gapRange.addEventListener('change', () => paintGap(+gapRange.value, { reflow: true }));
  }
  positionImageGridPanel();
}
function positionImageGridPanel() {
  if (!imageGridPanel || imageGridPanel.hidden) return;
  const b = activeImageGridBlock();
  const el = b && pagesEl.querySelector(`.imggrid-wrap[data-id="${b.id}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = imageGridPanel.offsetWidth || 220, ph = imageGridPanel.offsetHeight || 200;
  let x = r.right + 10;
  if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  imageGridPanel.style.left = x + 'px'; imageGridPanel.style.top = y + 'px';
}
function updateImageGridBar() {
  const b = activeImageGridBlock();
  if (b && editing) {
    if (imageGridPanelDismissed && imageGridPanel && imageGridPanel.dataset.gid === b.id) {
      if (!imageGridPanel.hidden) positionImageGridPanel();
      return;
    }
    if (!imageGridPanel || imageGridPanel.hidden || imageGridPanel.dataset.gid !== b.id) openImageGridPanel();
    else positionImageGridPanel();
  } else {
    imageGridPanelDismissed = false;
    closeImageGridPanel();
  }
}

// ── popover do Grid de Tabelas ──────────────────────────────────────────────
// Segment Grid | Tabela 1 | Tabela 2… no painel; clique numa tabela troca o foco.
// Conteúdo edita-se nas células (inline). tableGridFocus: 'grid' | 0 | 1 | …
let tableGridPanel;
let tableGridPanelDismissed = false;
let tableGridFocus = 'grid';

function activeTableGridBlock() {
  const b = state.activeId && blockOf(state.activeId);
  if (b && b.type === 'table-grid') return b;
  if (state.sel) {
    const f = findCoverItem(state.sel);
    if (f && f.item.type === 'table-grid') return f.item;
  }
  return null;
}
function closeTableGridPanel() { if (tableGridPanel) tableGridPanel.hidden = true; }

/** Outline da tabela ativa no grid (is-active no .tblgrid-cell). */
function paintTableGridFocus(blockId, focus) {
  const host = pagesEl.querySelector(`.tblgrid-wrap[data-id="${blockId}"]`);
  if (!host) return;
  const keep = focus === 'grid' ? -1 : +focus;
  host.querySelectorAll('.tblgrid-cell').forEach((cell) => {
    const i = +cell.dataset.item;
    const on = keep >= 0 && i === keep;
    cell.classList.toggle('is-active', on);
    if (!on) {
      // limpa foco/seleção (estado live + .tbl-sel) das outras tabelas do grid
      const live = tableLiveFromEl(cell.querySelector('.tbl-wrap'));
      if (live?.clearSelection) live.clearSelection();
      else cell.querySelectorAll('th.tbl-sel, td.tbl-sel').forEach((el) => el.classList.remove('tbl-sel'));
      const ae = document.activeElement;
      if (ae && cell.contains(ae) && typeof ae.blur === 'function') ae.blur();
    }
  });
}

/** Clique / foco numa tabela do grid → seleciona o bloco e o item no painel. */
function selectTableGridItem(blockId, itemIndex) {
  const cov = findCoverItem(blockId);
  const b = cov ? cov.item : blockOf(blockId);
  if (!b || b.type !== 'table-grid') return;
  ensureTableGrid(b);
  const i = Math.max(0, Math.min(b.items.length - 1, itemIndex | 0));
  const sameFocus = tableGridFocus === i
    && tableGridPanel && !tableGridPanel.hidden
    && tableGridPanel.dataset.gid === blockId;
  tableGridFocus = i;
  tableGridPanelDismissed = false;
  if (cov) {
    if (state.sel !== blockId) {
      state.sel = blockId;
      state.activeId = null;
      selectCoverItem(blockId);
      return; // selectCoverItem já abre o painel
    }
  } else {
    state.activeId = blockId;
    state.sel = null;
    paintActiveBlock(blockId);
    showHandleAtFocused();
    syncTypeUI('table-grid');
  }
  // evita rebuild completo do painel a cada clique na mesma tabela (preserva caret)
  if (sameFocus) {
    paintTableGridFocus(blockId, tableGridFocus);
    positionTableGridPanel();
    return;
  }
  openTableGridPanel();
}

function openTableGridPanel() {
  const b = activeTableGridBlock();
  if (!b || !editing) { closeTableGridPanel(); return; }
  ensureTableGrid(b);
  // clamp do foco se o nº de colunas mudou
  if (tableGridFocus !== 'grid') {
    const i = +tableGridFocus;
    if (!Number.isFinite(i) || i < 0 || i >= b.items.length) tableGridFocus = 'grid';
  }
  tableGridPanelDismissed = false;
  closeImgPanel();
  closeTablePanel();
  closeImageGridPanel();
  if (!tableGridPanel) {
    tableGridPanel = document.createElement('div');
    tableGridPanel.id = 'tableGridPanel';
    document.body.appendChild(tableGridPanel);
  }
  tableGridPanel.dataset.gid = b.id;
  const trash = typeof TRASH_ICO !== 'undefined' ? TRASH_ICO : uiIco('trash', 16, 'outline');
  const n = b.items.length;
  const equal = tableGridEqualModeOf(b);
  const equalRows = tableGridEqualRowsOf(b);
  const gap = tableGridGapOf(b);
  const mioloGrid = !!(state.activeId && blockOf(state.activeId)?.id === b.id);
  const focusVal = tableGridFocus === 'grid' ? 'grid' : String(tableGridFocus);
  const onItem = tableGridFocus !== 'grid';
  const itemIdx = onItem ? +tableGridFocus : -1;
  const it = onItem ? b.items[itemIdx] : null;

  // segment: Grid + Tabela 1…N
  // body: layout/shared OU cores da tabela + estrutura
  tableGridPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Grid de Tabelas</div>
    <div class="field">Editando<div data-slot="focus"></div></div>
    <div data-slot="body"></div>
    <button type="button" class="fieldbtn danger" data-a="del">${trash}<span>Remover</span></button>`;
  tableGridPanel.hidden = false;

  const body = tableGridPanel.querySelector('[data-slot="body"]');
  if (onItem && it) {
    const canApplyStyles = n > 1;
    body.innerHTML = `
      <div class="eyebrow" style="margin:0">Tabela ${itemIdx + 1}</div>
      <div class="row img-tc-row" style="display:flex;gap:.4rem">
        <button type="button" class="fieldbtn" data-a="addrow" style="flex:1;justify-content:center">+ Linha</button>
        <button type="button" class="fieldbtn" data-a="addcol" style="flex:1;justify-content:center">+ Coluna</button>
      </div>
      <button type="button" class="fieldbtn" data-a="apply-styles" ${canApplyStyles ? '' : 'disabled'}
        title="${canApplyStyles
          ? 'Copia cores, linhas alternadas e alinhamento desta tabela para as outras. Fonte, bordas e raio já são comuns (aba Grid).'
          : 'Adicione outra tabela no grid para aplicar estilos'}">Aplicar estilos no grid</button>
      ${tableStyleFieldsHtml(it, 'item')}`;
  } else {
    body.innerHTML = `
      ${mioloGrid ? `<div class="field">Largura<div data-slot="place"></div></div>` : ''}
      <div class="field">Igualar por<div data-slot="equal"></div></div>
      <div class="field"><span class="field-row">Colunas do grid</span>
        <div class="numstep" data-role="cols">
          <button type="button" data-a="col-" ${n <= 1 ? 'disabled' : ''} title="Menos colunas" aria-label="Menos colunas">−</button>
          <span class="numstep-val" data-role="coln">${n}</span>
          <button type="button" data-a="col+" ${n >= TABLE_GRID_MAX ? 'disabled' : ''} title="Mais colunas" aria-label="Mais colunas">+</button>
        </div>
      </div>
      <label class="field"><span class="field-row">Espaço entre colunas <span class="field-val"><span data-role="gapv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric" title="Clique para digitar">${gap}</span>px<button type="button" class="resetbtn" data-a="gapreset" title="Redefinir para ${TABLE_GRID_GAP}px">↺</button></span></span>
        <input type="range" data-a="gap" min="0" max="${TABLE_GRID_GAP_MAX}" step="1" value="${gap}" data-snaps="0,4,8,12,16,24,32,48" data-edit="off">
      </label>
      <div class="row img-tc-row" style="display:flex;gap:.4rem">
        <button type="button" class="fieldbtn${equalRows ? ' on' : ''}" data-a="equal-rows" style="flex:1;justify-content:center"
          ${n < 2 ? 'disabled' : ''}
          title="Mesma altura por linha entre as tabelas; a última linha da menor preenche o restante">Igualar alturas</button>
        <button type="button" class="fieldbtn${!equalRows ? ' on' : ''}" data-a="auto-rows" style="flex:1;justify-content:center"
          title="Cada linha com altura automática (conteúdo)">Alturas Auto</button>
      </div>
      <div class="eyebrow" style="margin:.2rem 0 0">Estilo comum</div>
      ${tableStyleFieldsHtml(b, 'shared')}`;
  }

  const reopen = () => {
    render();
    if (state.activeId === b.id || state.sel === b.id) openTableGridPanel();
  };

  // ── segment Editando (texto — widthSeg é só ícone e mostrava "undefined") ─
  const focusOpts = [{ val: 'grid', label: 'Grid' }];
  for (let i = 0; i < n; i++) focusOpts.push({ val: String(i), label: `Tabela ${i + 1}` });
  const focusSlot = tableGridPanel.querySelector('[data-slot="focus"]');
  if (focusSlot) {
    focusSlot.append(textSeg(focusVal, focusOpts, (v) => {
      tableGridFocus = v === 'grid' ? 'grid' : +v;
      openTableGridPanel();
      paintTableGridFocus(b.id, tableGridFocus);
    }));
  }

  if (onItem && it) {
    wireTableStyleControls(body, it, {
      paint: () => {
        const host = pagesEl.querySelector(`.tblgrid-wrap[data-id="${b.id}"] .tblgrid-cell[data-item="${itemIdx}"] .tbl-wrap`);
        if (host) applyTableChrome(host, resolveGridTableItem(b, it));
      },
      // headerRow/Col mudam th↔td — re-monta o grid
      rebuild: () => reopen(),
      tableHost: () => pagesEl.querySelector(
        `.tblgrid-wrap[data-id="${b.id}"] .tblgrid-cell[data-item="${itemIdx}"] .tbl-wrap`,
      ),
      onMerge: (sel) => {
        // item real do grid — merge grava colspan no modelo e rebuild
        if (!mergeSelectionOrNeighbor(b.items[itemIdx], sel)) return;
        save(); scheduleCommit();
        reopen();
      },
      onUnmerge: (sel) => {
        if (!unmergeCells(b.items[itemIdx], sel.r0, sel.c0)) return;
        save(); scheduleCommit();
        reopen();
      },
      after: () => { save(); scheduleCommit(); },
    });
    body.querySelector('[data-a="addrow"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // muta o item real do bloco (mesma ref de rows)
      addTableRow(b.items[itemIdx], null);
      save(); scheduleCommit();
      reopen();
    });
    body.querySelector('[data-a="addcol"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addTableCol(b.items[itemIdx], null);
      save(); scheduleCommit();
      reopen();
    });
    body.querySelector('[data-a="apply-styles"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (applyTableStylesToGrid(b, itemIdx) <= 0) return;
      save(); scheduleCommit();
      reopen();
    });
  } else {
    wireTableStyleControls(body, b, {
      sharedOnly: true,
      paint: () => {
        ensureTableGrid(b);
        const host = pagesEl.querySelector(`.tblgrid-wrap[data-id="${b.id}"]`);
        if (!host) return;
        host.querySelectorAll('.tblgrid-cell').forEach((cell) => {
          const idx = +cell.dataset.item;
          const item = b.items[idx];
          if (!item) return;
          const tw = cell.querySelector('.tbl-wrap');
          if (tw) applyTableChrome(tw, resolveGridTableItem(b, item));
        });
      },
      after: () => { save(); scheduleCommit(); },
    });

    const placeSlot = body.querySelector('[data-slot="place"]');
    if (placeSlot) {
      const pl = placementOf(b) === 'full' ? 'full' : 'inline';
      placeSlot.append(widthSeg(pl, [
        { val: 'inline', label: '1 coluna (esquerda)', icon: COL_ICON.left },
        { val: 'full', label: '2 colunas (largura total)', icon: COL_ICON.full },
      ], (v) => {
        setBlockPlacement(b.id, v);
        if (state.activeId === b.id) openTableGridPanel();
      }));
    }

    const EQ_W_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h12M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/></svg>';
    const EQ_H_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M4.5 5.5 8 2l3.5 3.5M4.5 10.5 8 14l3.5-3.5"/></svg>';
    const equalSlot = body.querySelector('[data-slot="equal"]');
    if (equalSlot) {
      equalSlot.append(widthSeg(equal, [
        { val: 'width', label: 'Largura (colunas iguais)', icon: EQ_W_ICO },
        { val: 'height', label: 'Altura (mesma altura)', icon: EQ_H_ICO },
      ], (v) => {
        b.equal = v === 'height' ? 'height' : 'width';
        if (b.equal === 'width') delete b.equal;
        reopen();
      }));
    }

    // Igualar alturas das rows entre tabelas (≠ equal=height, que estica o bloco inteiro)
    body.querySelector('[data-a="equal-rows"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (b.items.length < 2) return;
      b.equalRows = true;
      save(); scheduleCommit();
      reopen();
    });
    body.querySelector('[data-a="auto-rows"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      delete b.equalRows;
      save(); scheduleCommit();
      reopen();
    });

    const gapv = body.querySelector('[data-role="gapv"]');
    const paintGap = (raw, { reflow = false, syncText = true } = {}) => {
      const g = clampTableGridGap(raw);
      if (g === TABLE_GRID_GAP) delete b.gap;
      else b.gap = g;
      if (syncText && gapv && document.activeElement !== gapv) gapv.textContent = String(g);
      const range = body.querySelector('input[data-a="gap"]');
      if (range && document.activeElement !== range) range.value = String(g);
      if (reflow) reopen();
      else {
        const grid = pagesEl.querySelector(`.tblgrid-wrap[data-id="${b.id}"] .tblgrid`);
        if (grid) grid.style.columnGap = g + 'px';
        save(); scheduleCommit();
      }
    };
    if (gapv) {
      wireFieldEditKeys(gapv, {
        onInput: (raw) => {
          const n0 = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
          if (!Number.isFinite(n0)) return;
          paintGap(n0, { reflow: false, syncText: false });
        },
        onCommit: (raw) => {
          const n0 = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
          paintGap(Number.isFinite(n0) ? n0 : tableGridGapOf(b), { reflow: true, syncText: true });
          gapv.textContent = String(tableGridGapOf(b));
        },
        onCancel: () => {
          gapv.textContent = String(tableGridGapOf(b));
          paintGap(tableGridGapOf(b), { reflow: false, syncText: true });
        },
      });
    }
    body.querySelectorAll('button[data-a], input[data-a]').forEach((el) => {
      const isRange = el.type === 'range';
      el.addEventListener(isRange ? 'input' : 'click', () => {
        const a = el.dataset.a;
        if (a === 'gap') { paintGap(+el.value, { reflow: false }); return; }
        if (a === 'gapreset') { paintGap(TABLE_GRID_GAP, { reflow: true }); return; }
        if (a === 'col+') {
          if (b.items.length < TABLE_GRID_MAX) {
            setTableGridCols(b, b.items.length + 1);
            reopen();
          }
          return;
        }
        if (a === 'col-') {
          if (b.items.length > 1) {
            setTableGridCols(b, b.items.length - 1);
            if (tableGridFocus !== 'grid' && +tableGridFocus >= b.items.length) tableGridFocus = 'grid';
            reopen();
          }
        }
      });
    });
    const gapRange = body.querySelector('input[data-a="gap"]');
    if (gapRange) {
      gapRange.addEventListener('change', () => paintGap(+gapRange.value, { reflow: true }));
    }
  }

  tableGridPanel.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });
  enhanceAll(tableGridPanel);

  tableGridPanel.querySelector('[data-a="del"]')?.addEventListener('click', () => {
    tableGridCtx.removeBlock(b.id);
    tableGridFocus = 'grid';
    closeTableGridPanel();
  });

  paintTableGridFocus(b.id, tableGridFocus);
  positionTableGridPanel();
}
function positionTableGridPanel() {
  if (!tableGridPanel || tableGridPanel.hidden) return;
  const b = activeTableGridBlock();
  const el = b && pagesEl.querySelector(`.tblgrid-wrap[data-id="${b.id}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = tableGridPanel.offsetWidth || 220;
  const ph = tableGridPanel.offsetHeight || 200;
  const avoid = tblCellBarRectIfVisible();
  const pos = placeSidePanelBesideHost(r, pw, ph, avoid);
  tableGridPanel.style.left = pos.x + 'px';
  tableGridPanel.style.top = pos.y + 'px';
  if (tblCellBar && !tblCellBar.hidden) updateTblCellBar();
}
function updateTableGridBar() {
  const b = activeTableGridBlock();
  if (b && editing) {
    if (tableGridPanelDismissed && tableGridPanel && tableGridPanel.dataset.gid === b.id) {
      if (!tableGridPanel.hidden) positionTableGridPanel();
      return;
    }
    if (!tableGridPanel || tableGridPanel.hidden || tableGridPanel.dataset.gid !== b.id) openTableGridPanel();
    else {
      positionTableGridPanel();
      paintTableGridFocus(b.id, tableGridFocus);
    }
  } else {
    tableGridPanelDismissed = false;
    if (!b) tableGridFocus = 'grid';
    closeTableGridPanel();
  }
}

// escala da imagem no popover: 10–100 (default 100 = ocupa a largura máxima da coluna).
// Nunca > 100 — só permite reduzir, nunca esticar além da coluna.
// Decimais com step 0.1 (digitáveis com "." ou "," via range-snap).
const IMG_SCALE_STEP = 0.1;
function imgScalePct(b) {
  const s = b.scale == null ? 100 : +b.scale;
  if (!Number.isFinite(s)) return 100;
  // quantiza em 0.1 e limpa float dust (50.1000000001 → 50.1)
  const q = Math.round(Math.min(100, Math.max(10, s)) / IMG_SCALE_STEP) * IMG_SCALE_STEP;
  return +q.toFixed(1);
}
/** label do valor: 50 → "50"; 50.5 → "50.5" (sem zeros à toa). */
function fmtImgScalePct(n) {
  const q = imgScalePct({ scale: n });
  return String(q);
}
function imgScaleOf(b) { return imgScalePct(b) / 100; }
// alinhamento horizontal da imagem DENTRO da coluna quando scale < 100% (left|center).
function imgAlignOf(b) { return b.imgAlign === 'center' ? 'center' : 'left'; }

function imgHeight(b, colW) {
  const w = colW * imgScaleOf(b);
  return b.nw ? w * (b.nh / b.nw) : w * 0.6;
}

// aplica width/height/alinhamento no <img> da figura (build + update ao vivo no slider).
function applyImgScaleStyles(img, b, colW) {
  const scale = imgScaleOf(b);
  const w = colW * scale;
  img.style.width = w + 'px';
  img.style.maxWidth = '100%';
  img.style.height = imgHeight(b, colW) + 'px';
  if (scale < 1) {
    const center = imgAlignOf(b) === 'center';
    img.style.marginLeft = center ? 'auto' : '0';
    img.style.marginRight = center ? 'auto' : '0';
  } else {
    img.style.marginLeft = '';
    img.style.marginRight = '';
  }
  applyImgRotate(img, b);
}
/** Giro plano da foto (b.rotate, graus). 0 = sem transform. Só o <img>, não título/legenda. */
function applyImgRotate(img, b) {
  if (!img) return;
  const r = rotateOf(b);
  img.style.transformOrigin = 'center center';
  img.style.transform = r ? `rotate(${r}deg)` : '';
}

// título/legenda: com capFit e scale < 100%, max-width = largura da imagem (+ mesmo alinhamento).
function applyFigTextWidth(fig, b, colW) {
  if (!fig) return;
  const scale = imgScaleOf(b);
  const fit = scale < 1 && !!b.capFit;
  const w = colW * scale;
  const center = imgAlignOf(b) === 'center';
  for (const el of fig.querySelectorAll('.figtitle, figcaption')) {
    if (fit) {
      el.style.maxWidth = w + 'px';
      el.style.marginLeft = center ? 'auto' : '0';
      el.style.marginRight = center ? 'auto' : '0';
    } else {
      el.style.maxWidth = '';
      el.style.marginLeft = '';
      el.style.marginRight = '';
    }
  }
}

function applyFigureLayout(fig, b, colW) {
  if (!fig) return;
  const img = fig.querySelector('img');
  if (img) applyImgScaleStyles(img, b, colW);
  applyFigTextWidth(fig, b, colW);
}

function buildFigure(b, colW, editing) {
  const fig = document.createElement('figure');
  const place = placementOf(b);
  fig.className = 'fig b ' + (place === 'full' ? 'fig-full' : place === 'inline' ? 'fig-inline' : 'fig-right');
  fig.dataset.id = b.id;
  if (place === 'full') fig.style.width = COL_FULL + 'px';
  if (state.sel === b.id) fig.classList.add('imgsel');

  if (b.title != null) {
    const t = document.createElement('div');
    t.className = 'figtitle'; t.dataset.role = 'title'; t.dataset.id = b.id;
    t.dataset.ph = 'Título da imagem'; t.innerHTML = b.title || '';
    if (editing) { t.contentEditable = 'true'; t.spellcheck = true; t.lang = 'pt-BR'; }
    fig.appendChild(t);
  }
  const img = document.createElement('img');
  img.src = b.src; img.draggable = false;
  img.style.borderRadius = (b.radius ?? 4) + 'px';
  fig.appendChild(img);

  if (b.caption != null) {
    const c = document.createElement('figcaption');
    c.dataset.role = 'caption'; c.dataset.id = b.id;
    c.dataset.ph = 'Legenda'; c.innerHTML = b.caption || '';
    if (editing) { c.contentEditable = 'true'; c.spellcheck = true; c.lang = 'pt-BR'; }
    // mesma tipografia do bloco Legenda (⋮ da paleta → blockStyles.caption)
    applyCaptionFace(c, 'default');
    fig.appendChild(c);
  }
  applyFigureLayout(fig, b, colW);
  return fig;
}

// trilha B (t6): callbacks que o bloco Tabela usa — commit (edição de célula, sem rebuild),
// rerender (mudou a estrutura da tabela) e removeBlock (apagar a tabela inteira).
const tableCtx = {
  commit: () => { save(); scheduleCommit(); },
  rerender: () => render(),
  removeBlock: (id) => {
    if (findCoverItem(id)) { deleteCoverItem(id); return; }
    const i = idxOf(id); if (i < 0) return;
    state.doc.blocks.splice(i, 1);
    if (state.activeId === id) state.activeId = state.doc.blocks[Math.min(i, state.doc.blocks.length - 1)]?.id || null;
    state.sel = null;
    render();
  },
};

// Grid de imagens: mesmos hooks de commit/rerender/remove + pickImage (file picker por célula).
// pendingGridPick = { blockId, itemIndex } consumido no change do #imgfile.
let pendingGridPick = null;
const imageGridCtx = {
  commit: () => { save(); scheduleCommit(); },
  rerender: () => render(),
  removeBlock: (id) => tableCtx.removeBlock(id),
  pickImage: (blockId, itemIndex) => {
    pendingGridPick = { blockId, itemIndex };
    replaceImageId = null;
    pendingImgPlacement = null;
    pendingCoverImageId = null;
    document.getElementById('imgfile').click();
  },
  // legenda do grid: 'default' = tipo caption (⋮ Legenda); 'p' = tipografia do parágrafo
  applyCaptionStyle: (el, mode = 'default') => applyCaptionFace(el, mode),
};

// Grid de tabelas: edição inline; selectGridItem troca o segment do painel.
const tableGridCtx = {
  commit: () => { save(); scheduleCommit(); },
  rerender: () => render(),
  removeBlock: (id) => tableCtx.removeBlock(id),
  selectGridItem: (blockId, itemIndex) => selectTableGridItem(blockId, itemIndex),
  get activeItemIndex() {
    if (tableGridFocus === 'grid') return -1;
    return +tableGridFocus;
  },
};

// bloco genérico (usado na medição e no fluxo da coluna esquerda / largura total)
function buildBlock(b, editing) {
  const el = buildBlockEl(b, editing);
  // largura da faixa: 'full' escapa da coluna (499px). image-grid / table-grid precisam
  // do width explícito também em inline (builders calculam com colW). tabela avulsa
  // zera pro container herdar.
  // z-index no full: overflow (499px) fica acima da .col-right pra clique/drag.
  if (placementOf(b) === 'full') {
    el.style.width = COL_FULL + 'px';
    if (!el.style.position || el.style.position === 'static') el.style.position = 'relative';
    el.style.zIndex = '2';
  } else if (b.type === 'image-grid' || b.type === 'table-grid') {
    el.style.width = colL() + 'px';
  } else {
    el.style.width = '';
  }
  return el;
}
function buildBlockEl(b, editing) {
  if (b.type === 'image') {
    const colW = placementOf(b) === 'full' ? COL_FULL : colL();
    return buildFigure(b, colW, editing);
  }
  if (b.type === 'divider') {
    const d = document.createElement('div');
    d.className = 'divider b' + (state.sel === b.id ? ' divsel' : '');   // reaplica seleção pós-render
    d.dataset.id = b.id;
    applyDividerStyle(d);
    return d;
  }
  if (b.type === 'pagebreak') {                    // trilha E: barra da quebra MANUAL
    // data-id → cai no mesmo sistema de arrasto de blocos (bhandle/dropTargetAt/applyDrop):
    // arrastar a barra move o pagebreak no array e reposiciona onde a página corta.
    const d = document.createElement('div');
    d.className = 'e-pbreak b' + (state.sel === b.id ? ' pbsel' : '');   // reaplica seleção pós-render
    d.dataset.id = b.id;
    d.innerHTML = '<span class="e-pbreak-lbl">QUEBRA DE PÁGINA</span>';
    return d;
  }
  if (b.type === 'table') {
    const colW = placementOf(b) === 'full' ? COL_FULL : colL();
    return buildTableEl(b, editing, tableCtx, colW);
  }
  if (b.type === 'image-grid') {
    const colW = placementOf(b) === 'full' ? COL_FULL : colL();
    return buildImageGridEl(b, editing, imageGridCtx, colW);
  }
  if (b.type === 'table-grid') {
    const colW = placementOf(b) === 'full' ? COL_FULL : colL();
    return buildTableGridEl(b, editing, tableGridCtx, colW);
  }
  if (b.type === 'icon') return buildIconBlock(b, editing);
  return buildText(b, editing);
}

/** Alinhamento do glifo no bloco Ícones (left|center|right). Default left. */
function iconAlignOf(b) {
  return b && (b.align === 'center' || b.align === 'right') ? b.align : 'left';
}

/** Bloco Ícones — Material Symbol no fluxo (eixos + alinhamento + colunas no popover). */
function buildIconBlock(b, editing) {
  const name = normalizeMaterialName(b.icon) || DEFAULT_MS_ICON;
  const ms = materialOptsFrom(b, 'icon');
  const align = iconAlignOf(b);
  const wrap = document.createElement('div');
  wrap.className = 'b icon-block';
  wrap.dataset.id = b.id;
  wrap.dataset.align = align;
  wrap.style.justifyContent = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  wrap.innerHTML = iconHtml(name, { ...ms, className: 'icon-block-glyph' });
  if (editing) {
    wrap.title = 'Clique para editar o ícone';
    wrap.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('[contenteditable]')) return;
      state.activeId = b.id;
      state.sel = null;
      paintActiveBlock(b.id);
      syncTypeUI('icon');
      openIconBlockPanel();
    });
  }
  return wrap;
}

// numera as listas numéricas no "list tree" atual.
// - subitens de OUTRO tipo (li/check indentados) NÃO quebram a contagem do pai:
//   1. Item  →  (tab) • ponto  →  2. Item  continua em 2.
// - imagem / grid de imagens não quebra a run (igual antes).
// - bloco não-lista (p, h1, …) reinicia.
// - b._nums = caminho completo [1,2] pra render "1.2."; b._num = contador do nível atual.
function numberLists() {
  let counters = [];
  for (const b of state.doc.blocks) {
    if (b.type === 'image' || b.type === 'image-grid' || b.type === 'table-grid' || b.type === 'icon') continue;
    if (!LIST_TYPES.has(b.type)) {
      counters = [];
      continue;
    }
    const d = listIndentOf(b);
    if (b.type === 'ol') {
      // preenche pais ausentes (item "órfão" indentado sem ol acima) com 1
      while (counters.length < d) counters.push(1);
      counters = counters.slice(0, d + 1);
      if (counters.length === d) counters.push(0);
      counters[d] = (counters[d] || 0) + 1;
      b._num = counters[d];
      b._nums = counters.slice(0, d + 1);
    } else {
      // li/check no meio da árvore: mantém contadores dos PAIS, zera deste nível em diante
      // (próximo ol irmão do li recomeça o subcontador; ol no nível raiz continua)
      counters = counters.slice(0, d);
      delete b._num;
      delete b._nums;
    }
  }
}

// ─────────────────────────── paginação ──────────────────────────────────────
// A coluna esquerda de uma página não é mais uma lista de blocos, e sim de FRAGMENTOS:
// { b, gap, clipTop, clipH }. clipH null = bloco inteiro (o caso comum); com clipH, é uma
// JANELA sobre o bloco — o mesmo b aparece em duas páginas, cortado numa quebra de linha.
const frag = (b, gap, clipTop = 0, clipH = null) => ({ b, gap, clipTop, clipH });

function paginate() {
  syncMeasurerCols();
  numberLists();
  const pages = [{ left: [], right: [] }];
  // qualquer bloco pode morar na coluna direita (antes só imagem); a quebra de página é
  // estrutural do fluxo e nunca sai dele.
  const isRight = (b) => b.type !== 'pagebreak' && placementOf(b) === 'right';
  const stream = state.doc.blocks.filter(b => !isRight(b));
  const rights = state.doc.blocks.filter(isRight);

  // Coluna de prova: a cada bloco, empilha de verdade e mede a altura. Se estoura
  // CONTENT_H, o bloco inteiro (ou o resto do split) vai pra próxima página — nunca
  // fica pintado abaixo da guia da coluna. `used` é sempre a altura real do stack.
  let used = 0;
  trialClear();
  const newPage = () => { pages.push({ left: [], right: [] }); trialClear(); used = 0; };

  const PBREAK_H = 10, PBREAK_GAP = 8;
  const rules = mioloRulesOf();
  for (const b of stream) {
    if (b.type === 'pagebreak') {
      // trilha E: no editor a quebra MANUAL vira uma barra arrastável no fim da página que
      // ela corta — só quando editing. No PDF (exportPagesHtml roda editing=false) a barra
      // some sozinha, mas a QUEBRA continua: empurramos a página nova nos dois modos.
      if (editing) {
        const gap = Math.min(PBREAK_GAP, Math.max(0, CONTENT_H - PBREAK_H - used));
        pages[pages.length - 1].left.push(frag(b, gap));
      }
      newPage(); continue;
    }
    // Regra: Capítulo sempre em Nova Página — H1 é o 1º bloco de fluxo da página
    if (rules.h1NewPage && b.type === 'h1' && pages[pages.length - 1].left.length > 0) {
      newPage();
    }
    const h = measure(b);
    // Um bloco pode render em VÁRIAS páginas: colocamos pedaço a pedaço até acabar. Um parágrafo
    // maior que a página inteira (que antes vazava por cima do rodapé) sai partido em 3, 4, N.
    let lines = null, posto = 0, primeiro = true;
    // keep-with-next: próximo bloco de fluxo (só no 1º pedaço do heading)
    const nextKeep = (rules.headKeepWithNext && HEAD_TYPES.has(b.type))
      ? nextFlowBlock(stream, b)
      : null;
    const nextKeepLead = nextKeep ? minLeadHeight(nextKeep) : 0;
    while (true) {
      const pi = pages.length - 1;
      const cur = pages[pi];
      const prev = cur.left.length ? cur.left[cur.left.length - 1].b : null;
      const gap = primeiro && prev && prev.type !== 'pagebreak' ? gapBefore(b, prev) : 0;
      // Regra: Títulos sempre com o conteúdo — H1–H4 + início do bloco seguinte
      // têm que caber juntos; senão o título sobe pra próxima página (não fica órfão).
      if (primeiro && nextKeep && cur.left.length > 0) {
        const gNext = gapBefore(nextKeep, b);
        const need = gap + h + gNext + nextKeepLead;
        if (used + need > CONTENT_H) {
          newPage();
          continue;
        }
      }
      const room = CONTENT_H - used - gap, resto = h - posto;
      // tenta colocar; se o stack real estourar e a página já tem coisa, desfaz e reabre página.
      const tryPush = (f) => {
        const topBefore = used + (f.gap || 0);   // topo previsto do frag (âncora do cadeado)
        const node = trialAppend(f);
        const total = trialHeight();
        if (total > CONTENT_H && cur.left.length > 0) {
          trialCol.removeChild(node);
          return false;
        }
        cur.left.push(f);
        used = total;
        if (primeiro) { b._page = pi; b._top = topBefore; }
        return true;
      };

      if (resto <= room) {
        if (tryPush(frag(b, gap, posto, posto ? resto : null))) break;
        // measure() achou que cabia, stack real não → próxima página
        newPage();
        continue;
      }
      if (lines === null) lines = splittable(b) ? measureLines(b) : [];
      const at = splitFit(b, lines, posto, room);
      if (at != null) {
        if (tryPush(frag(b, gap, posto, at - posto))) {
          posto = at; primeiro = false;
          newPage();
          continue;
        }
        // split apontou um pedaço que o stack rejeitou → sobe o bloco inteiro
        newPage();
        continue;
      }
      if (cur.left.length) {
        newPage();
        continue;
      }
      // ponytail: página vazia e o bloco não parte (tabela/imagem/lista gigante) → entra inteiro
      // mesmo estourando (único caso em que a coluna pode transbordar de propósito).
      b._page = pi; b._top = 0;
      const f = frag(b, 0, posto, posto ? resto : null);
      cur.left.push(f);
      trialAppend(f);
      used = trialHeight();
      break;
    }
  }
  // imagens da coluna direita: ancoradas a uma página (clamp) + y livre — OU, se travadas
  // (r.anchor), seguem o bloco do fluxo em vez do y/page manuais (trilha do cadeado).
  for (const r of rights) {
    if (r.anchor) {
      const alvo = blockOf(r.anchor.id);
      // âncora só é válida se o bloco existe, continua no fluxo (não virou 'right'/pagebreak)
      // e passou por esta paginação (tem _page/_top frescos); senão destrava sem barulho.
      if (alvo && placementOf(alvo) !== 'right' && alvo.type !== 'pagebreak' && alvo._page != null && alvo._top != null) {
        r.page = alvo._page;              // mantém page em sincronia p/ não teleportar ao destravar
        r.y = alvo._top + r.anchor.dy;
      } else {
        delete r.anchor;
      }
    }
    const pi = Math.min(Math.max(r.page | 0, 0), pages.length - 1);
    pages[pi].right.push(r);
  }
  return pages;
}

// ─────────────────────────── render ─────────────────────────────────────────
const pagesEl = document.getElementById('pages');
let editing = true;

// monta as páginas (capa/índice/miolo/contracapa) num container, numerando em sequência
function assemblePages(container) {
  const content = paginate();          // páginas do miolo (fluxo)
  const toc = buildToc(content);
  const cov = state.doc.cover, bk = state.doc.back, idx = state.doc.index;
  const coverN = cov && cov.on ? 1 : 0;
  // a página existe se Índice OU Resumo estiver ligado (são switchers independentes agora) —
  // desligar só o Índice não pode levar o Resumo junto. idxN entra na conta de qualquer forma:
  // a página ocupa espaço físico mesmo mostrando só o Resumo, então o miolo tem que numerar depois dela.
  const idxPageOn = idx && (idx.on || idx.resumoOn);
  const idxN = idxPageOn ? 1 : 0;                           // v1: índice+resumo ocupam 1 página
  const contentStart = state.doc.firstPage + coverN + idxN; // nº impresso da 1ª pág. do miolo
  let n = state.doc.firstPage;
  if (cov && cov.on) { container.appendChild(renderCoverPage('cover', cov)); n++; }
  if (idxPageOn) { container.appendChild(renderIndexPage(toc, contentStart, n)); n++; }
  content.forEach((pg, ci) => { container.appendChild(renderContentPage(pg, ci, n)); n++; });
  if (bk && bk.on) { container.appendChild(renderCoverPage('back', bk)); n++; }
}

function render(caret /* optional {id,offset,role} */) {
  const keep = caret || captureCaret();
  const scrollTop = stage.scrollTop;   // replaceChildren zera o scroll do palco → salva/restaura
  pagesEl.replaceChildren();
  assemblePages(pagesEl);

  applyZoom();
  stage.scrollTop = scrollTop;         // restaura a posição antes de mexer no caret
  if (keep) restoreCaret(keep);
  // tabela e outros sem contenteditable de role=block não disparam focusin no restoreCaret —
  // re-pinta a borda do ativo e reposiciona alça/menus depois do rebuild.
  // Se o foco é Índice/Resumo, NÃO pinta o miolo (senão ficam duas bordas roxas).
  updateCalloutBar();
  updateHeadBar();
  updateTableBar();
  updateImageGridBar();
  updateTableGridBar();
  updateTextPlaceBar();
  {
    const ab = state.activeId && blockOf(state.activeId);
    if (ab?.type === 'icon') openIconBlockPanel();
  }
  syncColUI();
  if (idxFocus === 'index') {
    pagesEl.querySelectorAll('.active-block').forEach(el => el.classList.remove('active-block'));
    bhandle.hidden = true; badd.hidden = true;
    openIdxPanel();
  } else if (idxFocus === 'resumo') {
    pagesEl.querySelectorAll('.active-block').forEach(el => el.classList.remove('active-block'));
    bhandle.hidden = true; badd.hidden = true;
    openResumoPanel();
  } else {
    paintActiveBlock(state.activeId);
    showHandleAtFocused();
    closeIdxPanel();
    closeResumoPanel();
  }
  updatePreviewToc();
  layoutCoverColAdds();
  save();
  scheduleCommit();
}

// clampRuleW → doc-migrate.js
function ruleWidthOf(which) {
  const raw = which === 'bot' ? state.doc.ruleBot : state.doc.ruleTop;
  // null só em doc a meio caminho; default novo. Zips antigos passam por normalizeOpenedDoc.
  return raw == null ? RULE_W_DEFAULT : clampRuleW(raw);
}
// aplica height (+ top da linha de base, âncora na borda externa) num .rule do DOM
function styleRuleEl(el, which) {
  if (!el) return;
  const h = ruleWidthOf(which);
  el.style.height = h + 'px';
  if (which === 'top') {
    el.style.top = RULE_TOP_Y + 'px';
  } else {
    // base fixa em RULE_BOT_BOTTOM: linha mais grossa cresce pra cima (não come o rodapé)
    el.style.top = (RULE_BOT_BOTTOM - h) + 'px';
  }
}
// ao vivo nos sliders da sidebar (sem re-render)
function paintPageRules() {
  pagesEl.querySelectorAll('.rule.top').forEach(el => styleRuleEl(el, 'top'));
  pagesEl.querySelectorAll('.rule.bot').forEach(el => styleRuleEl(el, 'bot'));
}

// cor de fundo do PDF (todas as páginas). Hex opaco ou rgba com alpha; inválido → branco.
const DEFAULT_PAGE_BG = '#FFFFFF';
function pageBgOf() {
  const p = parseColor(state.doc?.pageBg);
  return p ? withAlpha(p.hex, p.alpha) : DEFAULT_PAGE_BG;
}
/** Aplica o fundo da página: com alpha, papel branco por baixo (editor = PDF).
 *  --page-bg: cor sólida p/ filhos que mascaram sobre o papel (label da quebra de página). */
function applyPageBg(pageEl) {
  if (!pageEl) return;
  const c = pageBgOf();
  const p = parseColor(c);
  // label da quebra precisa da cor “de papel” opaca (não o rgba); com alpha usa o hex
  pageEl.style.setProperty('--page-bg', (p && p.hex) ? p.hex : DEFAULT_PAGE_BG);
  if (p && p.alpha < 1) {
    pageEl.style.backgroundImage = `linear-gradient(${c}, ${c}), linear-gradient(#fff, #fff)`;
    pageEl.style.backgroundColor = '#fff';
  } else {
    pageEl.style.backgroundImage = '';
    pageEl.style.backgroundColor = c;
  }
}
/** Preview do colorfield com base branca sob alpha (mesma lógica do callout). */
function paintPageBgChip(el, color) {
  if (!el) return;
  const c = color || DEFAULT_PAGE_BG;
  const p = parseColor(c);
  if (p && p.alpha < 1) {
    el.style.background = '';
    el.style.setProperty('--sp-ov', c);
    el.classList.add('paper');
  } else {
    el.classList.remove('paper');
    el.style.removeProperty('--sp-ov');
    el.style.background = c;
  }
}

// chrome comum das páginas do miolo/índice: molduras, cabeçalho corrido e rodapé
function pageShell(number) {
  const page = document.createElement('div');
  page.className = 'page' + (editing ? ' editing' : '');
  applyPageBg(page);
  const ruleTop = document.createElement('div'); ruleTop.className = 'rule top';
  const ruleBot = document.createElement('div'); ruleBot.className = 'rule bot';
  styleRuleEl(ruleTop, 'top');
  styleRuleEl(ruleBot, 'bot');
  page.append(ruleTop, ruleBot);
  if (state.doc.headText) {
    const hAlign = resolveFootAlign(state.doc.headAlign || 'left', number);
    const h = document.createElement('div');
    h.className = 'runhead align-' + hAlign;
    h.textContent = state.doc.headText;
    page.appendChild(h);
  }
  const foot = document.createElement('div'); foot.className = 'foot';
  // 3 zonas (left/center/right): nº e texto caem na zona resolvida (espelho se Impressão)
  const zones = { left: [], center: [], right: [] };
  const pnum = document.createElement('span'); pnum.className = 'pnum';
  pnum.textContent = String(number).padStart(2, '0');   // 2 dígitos; 3º a partir de 100
  pnum.style.color = pnumColorOf();
  zones[resolveFootAlign(state.doc.pnumAlign || 'left', number)].push(pnum);
  if (state.doc.footText) {
    const site = document.createElement('span'); site.className = 'site'; site.textContent = state.doc.footText;
    site.style.color = footColorOf();
    zones[resolveFootAlign(state.doc.footAlign || 'right', number)].push(site);
  }
  for (const side of ['left', 'center', 'right']) {
    const z = document.createElement('div');
    z.className = 'foot-zone ' + side;
    for (const el of zones[side]) z.appendChild(el);
    foot.appendChild(z);
  }
  page.appendChild(foot);
  return page;
}

// Fragmento → DOM. Sem corte, é o bloco de sempre. Cortado, o bloco vai INTEIRO dentro de uma
// janela (.frag, overflow:clip) deslocada por margin negativa: os dois pedaços carregam o mesmo
// HTML, então o 'input' de qualquer um deles sincroniza b.html sem costura e o pedaço de baixo
// não vira um bloco novo no modelo (undo, índice e markdown seguem vendo UM parágrafo).
// clip e não hidden: 'hidden' é rolável e o Chrome rola o contenteditable atrás do caret, o que
// desalinharia a janela sozinho.
function buildFrag(f) {
  const el = buildBlock(f.b, editing);
  if (f.clipH == null) { el.style.marginTop = (f.gap || 0) + 'px'; return el; }
  const w = document.createElement('div');
  w.className = 'frag' + (f.clipTop ? ' frag-cont' : '');
  w.dataset.id = f.b.id;              // alça ⠿ e drop line procuram '.col-left > [data-id]'
  w.style.height = f.clipH + 'px';
  w.style.marginTop = (f.gap || 0) + 'px';
  el.style.marginTop = -f.clipTop + 'px';
  w.appendChild(el);
  return w;
}

function renderContentPage(pg, contentIdx, number) {
  const page = pageShell(number);
  page.dataset.page = contentIdx;                 // índice DENTRO do miolo (âncora de imagem da direita)
  const content = document.createElement('div'); content.className = 'content';
  const colLeftEl = document.createElement('div'); colLeftEl.className = 'col-left';
  const colRightEl = document.createElement('div'); colRightEl.className = 'col-right';
  // larguras do miolo vêm do doc (slider); CSS só tem o default 258/217
  const L = colL(), R = colR(), rx = colRightX();
  colLeftEl.style.width = L + 'px';
  colRightEl.style.left = rx + 'px';
  colRightEl.style.width = R + 'px';
  for (const f of pg.left) colLeftEl.appendChild(buildFrag(f));
  // row "+" no fim da coluna esquerda (hover) — Notion: adiciona parágrafo e abre o menu "/"
  if (editing) {
    const add = document.createElement('div');
    add.className = 'col-add';
    add.innerHTML = '<button type="button" class="col-add-btn" title="Adicionar bloco">+</button>';
    colLeftEl.appendChild(add);
  }
  // ordem em pg.right = trás → frente (último no array pinta por cima); z-index reforça
  pg.right.forEach((r, i) => {
    const el = buildRight(r);
    el.style.zIndex = String(i + 1);
    colRightEl.appendChild(el);
  });
  content.append(colLeftEl, colRightEl);
  page.appendChild(content);
  return page;
}

// tipografia do Índice / Resumo: default = Parágrafo (typeStyleOf('p')); override em
// state.doc.index.{fontSize,lineHeight} / {resumoFontSize,resumoLineHeight}.
function indexTextStyle() {
  const p = typeStyleOf('p');
  const idx = state.doc.index || {};
  return {
    fontSize: idx.fontSize != null ? +idx.fontSize : p.fontSize,
    lineHeight: idx.lineHeight != null ? +idx.lineHeight : p.lineHeight,
  };
}
function resumoTextStyle() {
  const p = typeStyleOf('p');
  const idx = state.doc.index || {};
  return {
    fontSize: idx.resumoFontSize != null ? +idx.resumoFontSize : p.fontSize,
    lineHeight: idx.resumoLineHeight != null ? +idx.resumoLineHeight : p.lineHeight,
  };
}
// título sem conteúdo real (bloco H* vazio / só <br> / só espaços) — some do índice
function isBlankHeading(b) {
  return !stripHtml(b && b.html).replace(/\s+/g, ' ').trim();
}

// índice automático: 1 linha por título, numeração hierárquica, nº da página à direita.
// Quais níveis ENTRAM é escolha do usuário (state.doc.index.levels) — mas o tocNum roda pra
// TODOS os títulos e o filtro vem depois: assim desligar o H2 não renumera os H1 (o contador
// hierárquico continua vendo o documento inteiro, que é o que o leitor espera).
// H1–H4 vazios são ignorados (não contam na numeração nem na lista).
function buildToc(content) {
  const rows = []; const c = [0, 0, 0, 0];   // um slot por nível h1..h4 (tocNum lê a profundidade daqui)
  const levels = state.doc.index.levels || { h1: true, h2: true };
  content.forEach((pg, ci) => {
    for (const f of pg.left) {
      if (f.clipTop) continue;          // continuação de bloco cortado: já contada na página de cima
      const b = f.b;
      const lvl = b.type === 'h1' ? 1 : b.type === 'h2' ? 2 : b.type === 'h3' ? 3 : b.type === 'h4' ? 4 : 0;
      if (!lvl) continue;
      if (isBlankHeading(b)) continue; // placeholder vazio: não entra no índice
      // trilha C (t4): se o título já vem numerado ("1.2 - X"), usa o número lido
      // e remove o prefixo do texto; senão, contador hierárquico. tocNum muta c[].
      const { num, text } = tocNum(lvl, stripHtml(b.html), c);
      if (levels['h' + lvl]) rows.push({ num, level: lvl, text, pageIdx: ci });
    }
  });
  return rows;
}

// ── índice flutuante do preview (canto sup. dir. do palco) ───────────────────
// Só H1/H2 do miolo, na ordem do documento. Abre no hover / 1º clique; fecha no
// 2º clique do botão ou depois de um tempo com o mouse fora do botão+lista.
// Clique no título rola o #stage; check à direita marca “revisado”.
// Status em state.doc.reviewed (array de ids) → entra no .pdgm.zip (serializeDocZip
// dumpa o doc inteiro) e no IDB via save(); docs antigos sem o campo → seed [].
const PREVIEW_TOC_CLOSE_MS = 1400;   // “muito tempo” fora → fecha sozinho
let previewTocCloseT = null;
let previewTocForceClosed = false;  // 2º clique fechou com mouse ainda em cima → não reabre no hover
let previewTocCheckIco = '';        // ion-icon name="checkmark-circle" (solid), cacheado no init

function reviewedList() {
  if (!Array.isArray(state.doc.reviewed)) state.doc.reviewed = [];
  return state.doc.reviewed;
}
function isReviewed(id) { return reviewedList().includes(id); }

function collectPreviewToc() {
  const rows = [];
  for (const b of state.doc.blocks) {
    if (b.type !== 'h1' && b.type !== 'h2') continue;
    if (isBlankHeading(b)) continue; // igual ao índice da página: sem título vazio
    const text = stripHtml(b.html).replace(/\s+/g, ' ').trim();
    rows.push({ id: b.id, level: b.type === 'h1' ? 1 : 2, text });
  }
  return rows;
}
function scrollStageToBlock(id) {
  const el = pagesEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const er = el.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  stage.scrollBy({ top: er.top - sr.top - 28, behavior: 'smooth' });
}
function setPreviewTocOpen(open) {
  const nav = document.getElementById('previewToc');
  const btn = document.getElementById('previewTocBtn');
  if (!nav) return;
  nav.classList.toggle('is-open', !!open);
  if (btn) btn.setAttribute('aria-expanded', String(!!open));
  if (!open) clearTimeout(previewTocCloseT);
}
function schedulePreviewTocClose() {
  clearTimeout(previewTocCloseT);
  previewTocCloseT = setTimeout(() => {
    previewTocForceClosed = false;
    setPreviewTocOpen(false);
  }, PREVIEW_TOC_CLOSE_MS);
}
function togglePreviewTocReviewed(id) {
  if (!id) return;
  const list = reviewedList();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  // só repinta a linha (não rebuild inteiro) — o panel pode ter o foco/hover
  const row = document.querySelector(`#previewTocPanel .preview-toc-row[data-id="${CSS.escape(id)}"]`);
  if (!row) { updatePreviewToc(); save(); return; }
  const on = isReviewed(id);
  row.classList.toggle('is-reviewed', on);
  const check = row.querySelector('.preview-toc-check');
  if (check) {
    check.setAttribute('aria-pressed', String(on));
    check.setAttribute('aria-label', on ? `Desmarcar revisado` : `Marcar como revisado`);
    check.title = on ? 'Desmarcar revisado' : 'Marcar como revisado';
  }
  save();   // IDB + próximo .pdgm.zip saem com o status atualizado
}
function updatePreviewToc() {
  const nav = document.getElementById('previewToc');
  const panel = document.getElementById('previewTocPanel');
  if (!nav || !panel) return;
  const rows = collectPreviewToc();
  if (!rows.length) {
    nav.hidden = true;
    panel.replaceChildren();
    setPreviewTocOpen(false);
    previewTocForceClosed = false;
    return;
  }
  // limpa ids de blocos que sumiram (doc continua, mas o array não vaza)
  const live = new Set(rows.map(r => r.id));
  const list = reviewedList();
  for (let i = list.length - 1; i >= 0; i--) if (!live.has(list[i])) list.splice(i, 1);

  nav.hidden = false;
  panel.replaceChildren();
  const head = document.createElement('div');
  head.className = 'preview-toc-head';
  head.innerHTML = '<span class="preview-toc-h-idx">Índice</span><span class="preview-toc-h-rev">Revisado</span>';
  panel.appendChild(head);

  const ico = previewTocCheckIco || uiIco('checkmark-circle', 16, 'solid');
  for (const r of rows) {
    const reviewed = isReviewed(r.id);
    const row = document.createElement('div');
    row.className = 'preview-toc-row' + (reviewed ? ' is-reviewed' : '');
    row.dataset.id = r.id;
    row.setAttribute('role', 'listitem');

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'preview-toc-item lvl' + r.level;
    item.dataset.id = r.id;
    item.textContent = r.text;
    item.title = r.text;

    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'preview-toc-check';
    check.dataset.id = r.id;
    check.setAttribute('aria-pressed', String(reviewed));
    check.setAttribute('aria-label', reviewed ? `Desmarcar revisado: ${r.text}` : `Marcar como revisado: ${r.text}`);
    check.title = reviewed ? 'Desmarcar revisado' : 'Marcar como revisado';
    check.innerHTML = ico;

    row.append(item, check);
    panel.appendChild(row);
  }
}
function initPreviewToc() {
  const nav = document.getElementById('previewToc');
  const btn = document.getElementById('previewTocBtn');
  const panel = document.getElementById('previewTocPanel');
  if (!nav || !btn || !panel) return;
  // ion-icon name="list-outline" / checkmark-circle (solid, sem -outline)
  btn.innerHTML = uiIco('list', 18, 'outline');
  previewTocCheckIco = uiIco('checkmark-circle', 16, 'solid');

  // entra no botão/lista → abre (salvo se o usuário acabou de fechar no 2º clique)
  nav.addEventListener('mouseenter', () => {
    clearTimeout(previewTocCloseT);
    if (!previewTocForceClosed) setPreviewTocOpen(true);
  });
  // sai do botão+lista → fecha sozinho depois de PREVIEW_TOC_CLOSE_MS
  nav.addEventListener('mouseleave', () => {
    previewTocForceClosed = false;
    schedulePreviewTocClose();
  });
  // teclado: foco dentro mantém aberto; sair agenda o close
  nav.addEventListener('focusin', () => {
    clearTimeout(previewTocCloseT);
    previewTocForceClosed = false;
    setPreviewTocOpen(true);
  });
  nav.addEventListener('focusout', () => {
    // espera o próximo foco (pode ser outro item do painel)
    setTimeout(() => {
      if (!nav.contains(document.activeElement)) schedulePreviewTocClose();
    }, 0);
  });
  // 1º clique abre; 2º fecha (e trava reabertura por hover enquanto o mouse continuar em cima)
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const open = nav.classList.contains('is-open');
    if (open) {
      previewTocForceClosed = true;
      setPreviewTocOpen(false);
    } else {
      previewTocForceClosed = false;
      setPreviewTocOpen(true);
    }
  });
  panel.addEventListener('click', (e) => {
    const check = e.target.closest && e.target.closest('.preview-toc-check');
    if (check && check.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      togglePreviewTocReviewed(check.dataset.id);
      return;
    }
    const item = e.target.closest && e.target.closest('.preview-toc-item');
    if (!item || !item.dataset.id) return;
    e.preventDefault();
    scrollStageToBlock(item.dataset.id);
  });
}

// foco de UI na página Índice+Resumo: 'index' | 'resumo' | null (não persiste)
let idxFocus = null;

function renderIndexPage(toc, contentStart, number) {
  const page = pageShell(number);
  const wrap = document.createElement('div'); wrap.className = 'idx-content';
  // t2.11 (bug): a página existe se Índice OU Resumo estiver ligado (ver assemblePages) — os
  // dois blocos agora precisam de gate PRÓPRIO aqui dentro, senão desligar só o Índice também
  // apaga o título+lista mas o Resumo continuava vindo "de graça" sem checar seu próprio .on.
  const idx = state.doc.index;
  // space-between só quando as duas seções existem na página (opção da sidebar)
  if (idx.espacarSessoes && idx.on && idx.resumoOn) wrap.classList.add('idx-space');
  if (idx.on) {
    // seção clicável: título + lista — borda roxa quando idxFocus==='index' + painel de opções.
    // A largura vai na SEÇÃO (não só na .toc): o retângulo de foco acompanha Curto/Largura Total.
    const sec = document.createElement('div');
    sec.className = 'idx-section' + (idxFocus === 'index' ? ' idx-sel' : '');
    sec.dataset.idx = 'index';
    // 'curto': 345px (nº da página sobe junto do texto); 'full': as 2 colunas (499px)
    if ((idx.width || 'curto') === 'curto') sec.style.width = TOC_SHORT_W + 'px';
    else sec.style.width = COL_FULL + 'px';
    const h1 = document.createElement('div'); h1.className = 'idx-title'; h1.textContent = 'Índice';
    applyIdxTitleStyle(h1);
    const list = document.createElement('div');
    const colorScheme = idx.color === 'cinza' ? 'cinza' : idx.color === 'custom' ? 'custom' : 'padrao';
    list.className = 'toc'
      + (colorScheme === 'cinza' ? ' toc-cinza' : '')
      + (colorScheme === 'custom' ? ' toc-custom' : '')
      + (idx.leaders ? ' toc-leaders' : '');
    // tipografia: default = parágrafo; override via painel do Índice
    const tocStyle = indexTextStyle();
    list.style.fontSize = tocStyle.fontSize + 'px';
    list.style.lineHeight = tocStyle.lineHeight + 'px';
    // cores Custom: CSS vars no .toc (ver .toc-custom em diagramacao.html)
    if (colorScheme === 'custom') applyIndexCustomColors(list, idx);
    if (!toc.length) {
      const empty = document.createElement('div'); empty.className = 'toc-empty';
      const ligados = Object.keys(idx.levels || {}).filter(k => idx.levels[k]).map(k => k.toUpperCase());
      empty.textContent = ligados.length
        ? `O índice aparece aqui conforme você adiciona títulos (${ligados.join('/')}) ao miolo.`
        : 'Nenhum nível de título ligado — escolha H1 e/ou H2 no painel Documento.';
      list.appendChild(empty);
    }
    for (const r of toc) {
      const row = document.createElement('div'); row.className = 'toc-row lvl' + r.level;
      // toc-dots: linha-guia entre título e página (visível só com .toc-leaders)
      row.innerHTML = `<span class="toc-label"><span class="toc-num">${r.num}</span><span class="toc-txt">${escapeHtml(r.text)}</span></span>`
        + `<span class="toc-dots" aria-hidden="true"></span>`
        + `<span class="toc-pg">${String(contentStart + r.pageIdx).padStart(2, '0')}</span>`;
      list.appendChild(row);
    }
    sec.append(h1, list);
    wrap.appendChild(sec);
  }
  if (idx.resumoOn) {
    // seção com borda roxa no foco (título + texto). Largura na seção = retângulo de foco
    // acompanha "Largura Total" vs "Coluna Esquerda" das configurações.
    const sec = document.createElement('div');
    sec.className = 'idx-section' + (idxFocus === 'resumo' ? ' idx-sel' : '');
    sec.dataset.idx = 'resumo';
    if (idx.resumoWidth === 'left') sec.style.width = colL() + 'px';
    else sec.style.width = COL_FULL + 'px';
    const h2 = document.createElement('div'); h2.className = 'idx-title'; h2.textContent = 'Resumo';
    applyIdxTitleStyle(h2);
    const res = document.createElement('div'); res.className = 'idx-resumo b'; res.dataset.role = 'resumo';
    res.dataset.ph = 'Escreva o resumo…'; res.innerHTML = state.doc.index.resumo || '';
    // tipografia: default = parágrafo; override via painel do Resumo
    const resStyle = resumoTextStyle();
    res.style.fontSize = resStyle.fontSize + 'px';
    res.style.lineHeight = resStyle.lineHeight + 'px';
    if (editing) { res.contentEditable = 'true'; res.spellcheck = true; res.lang = 'pt-BR'; }
    sec.append(h2, res);
    wrap.appendChild(sec);
  }
  page.appendChild(wrap);
  return page;
}

// seleciona Índice ou Resumo na página especial (borda roxa + painel do índice)
function setIdxFocus(kind) {
  idxFocus = kind || null;
  pagesEl.querySelectorAll('.idx-sel').forEach(el => el.classList.remove('idx-sel'));
  if (!idxFocus) { closeIdxPanel(); closeResumoPanel(); return; }
  // sai da seleção de miolo/capa/imagem — o foco agora é a seção do índice
  pagesEl.querySelectorAll('.active-block').forEach(el => el.classList.remove('active-block'));
  if (state.sel) {
    state.sel = null;
    pagesEl.querySelectorAll('.imgsel, .divsel, .pbsel, .cover-sel').forEach(el => el.classList.remove('imgsel', 'divsel', 'pbsel', 'cover-sel'));
    closeImgPanel(); closeCoverPanel();
  }
  updateCalloutBar();
  updateTableBar();
  bhandle.hidden = true; badd.hidden = true;
  const el = pagesEl.querySelector(`.idx-section[data-idx="${idxFocus}"]`);
  if (el) el.classList.add('idx-sel');
  if (idxFocus === 'index') { closeResumoPanel(); openIdxPanel(); }
  else if (idxFocus === 'resumo') { closeIdxPanel(); openResumoPanel(); }
  else { closeIdxPanel(); closeResumoPanel(); }
}
function clearIdxFocus() {
  if (!idxFocus) return;
  idxFocus = null;
  pagesEl.querySelectorAll('.idx-sel').forEach(el => el.classList.remove('idx-sel'));
  closeIdxPanel();
  closeResumoPanel();
}

// capa / contracapa: fundo full-bleed (Fill, reposicionável) + itens numa grade de 2 colunas
function renderCoverPage(kind, cov) {
  const page = document.createElement('div');
  page.className = 'page cover-page' + (editing ? ' editing' : '');
  page.dataset.cover = kind;
  applyPageBg(page);   // cor de página sob a imagem de fundo (se houver)
  if (cov.bg) {
    const bg = document.createElement('div'); bg.className = 'cover-bg';
    bg.style.backgroundImage = `url("${cov.bg}")`;
    // zoom + pan: scale no DIV (overflow:hidden da .cover-page recorta) e a ORIGEM do
    // transform acompanha bgX/bgY — senão o zoom fica preso no centro e os sliders de
    // posição quase não movem nada (em imagem que já "cover" sem sobra, position sozinho
    // é no-op). background-position ainda vale pro excesso residual do cover.
    applyCoverBgStyles(bg, cov);
    page.appendChild(bg);
  }
  const area = document.createElement('div'); area.className = 'cover-area';
  cov.items.forEach(it => area.appendChild(buildCoverItem(kind, it)));   // absolutos: coluna (x) + y livre
  // zona "+" só na capa/contracapa VAZIA (hover full-area). Com blocos: alça Notion + sidebar.
  if (editing && !cov.items.length) {
    const add = document.createElement('div');
    add.className = 'col-add';
    add.dataset.cover = kind;
    add.innerHTML = '<button type="button" class="col-add-btn" title="Adicionar bloco">+</button>';
    area.appendChild(add);
  }
  page.appendChild(area);
  if (cov.logo && cov.logo.on) page.appendChild(buildCoverLogo(kind, cov.logo));   // faixa fixa topo/base
  return page;
}

// no-op legado: a zona col-add da capa só existe vazia (CSS top/bottom:0); sem layout por altura.
function layoutCoverColAdds() {}

const LOGO_BASE_H = 30;   // altura-base (px) do logo em size=1; o slider (40–260%) escala em cima
// sel do logo na capa/contracapa: state.sel = 'logo:cover' | 'logo:back' (não colide com ids de cover-item)
const logoSelOf = (kind) => 'logo:' + kind;
const logoKindOfSel = (sel) => (typeof sel === 'string' && sel.startsWith('logo:') ? sel.slice(5) : null);
// <svg> do logo tingido — mesma montagem do logoSvg() dos gráficos (currentColor→cor),
// mas aqui vira DOM (innerHTML). preserveAspectRatio mantém a proporção w/h do logo.
function coverLogoSvg(lg) {
  const L = LOGOS[lg.kind]; if (!L) return '';
  const h = LOGO_BASE_H * (lg.size || 1), w = h * (L.w / L.h);
  const inner = L.inner.replace(/currentColor/g, lg.color || '#FFFFFF');
  return `<svg width="${+w.toFixed(1)}" height="${+h.toFixed(1)}" viewBox="0 0 ${L.w} ${L.h}"`
    + ` preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;
}
// faixa fixa (cabeçalho topo / rodapé base) com o logo alinhado esq/centro/dir. Fora
// do cover-area e do arrasto/anti-sobreposição; render sempre (mesmo !editing) → sai
// vetorial no PDF automaticamente via exportPagesHtml.
// hit = só o svg (não a faixa inteira) — clique/foco roxo sem roubar texto da capa.
function buildCoverLogo(kind, lg) {
  const el = document.createElement('div');
  el.className = 'cover-logo ' + (lg.pos === 'footer' ? 'lg-footer' : 'lg-header');
  el.dataset.logo = kind;
  el.style.justifyContent = lg.align === 'center' ? 'center' : lg.align === 'right' ? 'flex-end' : 'flex-start';
  const hit = document.createElement('div');
  hit.className = 'cover-logo-hit' + (state.sel === logoSelOf(kind) ? ' cover-sel' : '');
  hit.dataset.logo = kind;
  hit.innerHTML = coverLogoSvg(lg);
  el.appendChild(hit);
  return el;
}
// larguras das colunas na capa: grid FIXO histórico (não segue o slider do miolo)
// — capa/contracapa têm itens com y/span salvos no layout antigo (258/217).
function coverColBox(span) {
  if (span === 'left') return { left: 0, width: COL_L };
  if (span === 'right') return { left: COL_L + GAP, width: COL_R };
  return { left: 0, width: COL_FULL };   // full = as duas colunas
}
// tipos de texto “simples” na capa (contenteditable no próprio .cover-item)
// title/subtitle = componentes da capa (padrão visual do seed); h1–h4 = mesmos do miolo
const COVER_PLAIN = new Set(['title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'p', 'caption', 'quote']);
// tamanhos default por tipo da paleta → cover-item (capa não herda o motor tipográfico do miolo)
const COVER_TYPE_SIZE = {
  title: 40, subtitle: 15,
  h1: 40, h2: 28, h3: 22, h4: 18, p: 15, caption: 8, quote: 18, callout: 15,
  li: 15, ol: 15, check: 15,
};
// tipos “de título” na capa: Enter cria parágrafo abaixo (igual H1–H4 no miolo)
const COVER_HEAD_TYPES = new Set(['title', 'subtitle', 'h1', 'h2', 'h3', 'h4']);
// ensureCoverType / migrateCoverTitleSubtitle → doc-migrate.js
function coverTypeOf(it) { return ensureCoverType(it); }
// defs extras do menu "/" só na capa (ícone tipográfico leve, sem poluir a paleta do miolo)
const COVER_SLASH_EXTRA = [
  { type: 'title', label: 'Título', icon: '<span style="font-size:14px;font-weight:800;line-height:1">T</span>' },
  { type: 'subtitle', label: 'Subtítulo', icon: '<span style="font-size:12px;font-weight:700;line-height:1">S</span>' },
];

function buildCoverItem(kind, it) {
  // type já deve ter vindo de migrateCoverTitleSubtitle no load; aqui só garante fallback
  const type = ensureCoverType(it);
  const el = document.createElement('div');
  el.className = 'cover-item' + (state.sel === it.id ? ' cover-sel' : '');
  // só data-cid (não data-id): data-id é do miolo — se colidir, o focusin trataria a capa
  // como bloco do fluxo. O slash.place já resolve [data-cid] também.
  el.dataset.cid = it.id; el.dataset.cover = kind; el.dataset.ctype = type;
  const box = coverColBox(it.span || 'full');
  el.style.position = 'absolute';
  el.style.top = (it.y || 0) + 'px';
  el.style.left = box.left + 'px';
  el.style.width = box.width + 'px';
  el.style.textAlign = it.align || 'left';

  // ── imagem ──
  if (type === 'image') {
    if (it.src) {
      const fig = buildFigure(it, box.width, editing);
      // data-id no fig é do miolo; na capa a seleção vai pelo .cover-item (data-cid)
      fig.removeAttribute('data-id');
      el.appendChild(fig);
    } else {
      el.classList.add('cover-img-empty');
      el.dataset.ph = 'Imagem…';
    }
    return el;
  }
  // ── divisor ──
  if (type === 'divider') {
    const d = document.createElement('div');
    d.className = 'divider b';
    applyDividerStyle(d);
    el.appendChild(d);
    return el;
  }
  // ── tabela / grid de imagens|tabelas / lista / check / callout — reusa o builder do miolo ──
  if (type === 'table' || type === 'image-grid' || type === 'table-grid' || type === 'li' || type === 'ol' || type === 'check' || type === 'callout') {
    if (type === 'ol' || type === 'li') {
      // numberLists() só roda no miolo — na capa, um item isolado vira "1." / "•"
      if (it._num == null) it._num = 1;
      if (!it._nums) it._nums = [it._num];
    }
    if (type === 'callout') ensureCalloutDefaults(it);
    // data-id fica no inner (tabela/lista precisam) — focusin da capa roda antes do miolo
    // e blockOf(cover-id) retorna null, então não há colisão com o fluxo do miolo.
    if (type === 'image-grid') {
      const boxW = box.width;
      el.appendChild(buildImageGridEl(it, editing, imageGridCtx, boxW));
    } else if (type === 'table-grid') {
      el.appendChild(buildTableGridEl(it, editing, tableGridCtx, box.width));
    } else if (type === 'table') {
      el.appendChild(buildTableEl(it, editing, tableCtx, box.width));
    } else {
      el.appendChild(buildBlockEl(it, editing));
    }
    return el;
  }
  // ── texto simples (title/subtitle, h1–h4, p, caption, quote) ──
  el.dataset.ph = PH[type] || 'Texto…';
  const cls = type === 'quote' ? 'quote'
    : (COVER_HEAD_TYPES.has(type) || type === 'p' || type === 'caption') ? type : 'p';
  el.classList.add('b', cls);
  el.style.fontSize = (it.size || COVER_TYPE_SIZE[type] || 18) + 'px';
  if (it.color) el.style.color = it.color;
  // title/subtitle: weight/LS/lh no painel; h1–h4 fixo em 700
  if (type === 'title' || type === 'subtitle') applyCoverTitleFace(el, it);
  else if (COVER_HEAD_TYPES.has(type)) el.style.fontWeight = '700';
  el.innerHTML = it.html || '';
  // h1–h4/p/caption/quote: estilo global do miolo; title/subtitle só usam size/cor/face do item
  if (HEAD_TYPES.has(type) || type === 'p' || type === 'caption' || type === 'quote') applyTypeStyle(el, type);
  // size/cor/face do item de capa vencem o estilo global do tipo (slider do painel)
  if (it.size) el.style.fontSize = it.size + 'px';
  if (it.color) el.style.color = it.color;
  if (type === 'title' || type === 'subtitle') applyCoverTitleFace(el, it);
  if (editing) { el.contentEditable = 'true'; el.spellcheck = true; el.lang = 'pt-BR'; }
  return el;
}

// Defaults da face de title/subtitle (espelham o CSS de .cover-item).
// weight > 700 é sintético (Plex var só vai a 700) — font-synthesis: weight no CSS.
const COVER_WEIGHT_DEFAULT = 700;
const COVER_WEIGHT_MAX = 900;
const COVER_LS_DEFAULT = -0.01;   // em
const COVER_LH_DEFAULT = 1.15;    // unitless (escala com o tamanho)

/** Peso (font-weight) de title/subtitle da capa: 100–900, default 700. */
function coverItemWeight(it) {
  const w = it && it.weight != null ? +it.weight : COVER_WEIGHT_DEFAULT;
  if (!Number.isFinite(w)) return COVER_WEIGHT_DEFAULT;
  return Math.min(COVER_WEIGHT_MAX, Math.max(100, Math.round(w / 100) * 100));
}
/** Letter-spacing (em) de title/subtitle. */
function coverItemLetterSpacing(it) {
  const v = it && it.letterSpacing != null ? +it.letterSpacing : COVER_LS_DEFAULT;
  if (!Number.isFinite(v)) return COVER_LS_DEFAULT;
  return Math.max(-0.1, Math.min(0.2, Math.round(v * 100) / 100));
}
/** Line-height unitless de title/subtitle. */
function coverItemLineHeight(it) {
  const v = it && it.lineHeight != null ? +it.lineHeight : COVER_LH_DEFAULT;
  if (!Number.isFinite(v)) return COVER_LH_DEFAULT;
  return Math.max(0.8, Math.min(2.5, Math.round(v * 100) / 100));
}
/** Aplica weight + letter-spacing + line-height no nó do título/subtítulo. */
function applyCoverTitleFace(el, it) {
  if (!el) return;
  el.style.fontWeight = String(coverItemWeight(it));
  el.style.letterSpacing = coverItemLetterSpacing(it) + 'em';
  el.style.lineHeight = String(coverItemLineHeight(it));
}

/** Aplica CSS vars de cores Custom no .toc (live + render). */
function applyIndexCustomColors(listEl, idx) {
  if (!listEl) return;
  ensureIndexColors(idx || state.doc.index);
  const c = (idx || state.doc.index).colors;
  listEl.style.setProperty('--toc-num', c.num);
  listEl.style.setProperty('--toc-text', c.text);
  listEl.style.setProperty('--toc-pg', c.page);
  listEl.style.setProperty('--toc-line', c.line || INDEX_COLOR_DEFAULTS.line);
}

/** Pinta o .colorfield de uma cor do índice (line aceita alpha → paper). */
function paintIdxColorField(el, color) {
  if (!el) return;
  paintPageBgChip(el, color || INDEX_COLOR_DEFAULTS.line);
}

// âncora (cadeado): escolhe, entre candidatos {._top}, o mais próximo do Y informado. Pura —
// usada tanto ao travar (openImgPanel) quanto ao re-ancorar depois de arrastar (pointerup).
function nearestByTop(candidates, y) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c._top - y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
// assert simples (roda 1x, custo zero): sem framework de teste, mas a lógica de escolha não fica sem checagem
console.assert(nearestByTop([{ id: 'a', _top: 0 }, { id: 'b', _top: 100 }], 90)?.id === 'b', 'nearestByTop: escolha errada');
// blocos do FLUXO (candidatos a âncora) que caíram na página `page` na última paginação
const leftBlocksOnPage = (page) => state.doc.blocks.filter(x =>
  x.type !== 'pagebreak' && placementOf(x) !== 'right' && x._page === page && x._top != null);

// bloco da coluna direita (imagem, texto, tabela…): wrapper absoluto arrastável no eixo Y.
// Só a imagem tem altura previsível ANTES de entrar no DOM (proporção nw/nh) → só ela ganha
// o clamp exato; nos demais o clamp fino fica com o pointermove do arraste, que já usa
// wrap.offsetHeight de verdade. Texto aqui continua contenteditable: o pointerdown do arraste
// ignora alvos [contenteditable], então digitar funciona e o arraste vai pelo badge.
function buildRight(b) {
  const wrap = document.createElement('div');
  wrap.className = 'rimg' + (state.sel === b.id ? ' imgsel' : '') + (b.anchor ? ' locked' : '');
  wrap.dataset.id = b.id;
  // ponytail: aproximação — só conta quebras <br> explícitas na legenda/título (não o wrap
  // automático da linha, que depende de largura real); o clamp FINO do arraste já usa
  // wrap.offsetHeight de verdade (pointermove), então o erro aqui só afeta o clamp inicial.
  const capLines = b.caption ? (b.caption.match(/<br\s*\/?>/gi) || []).length : 0;
  const titleLines = b.title ? (b.title.match(/<br\s*\/?>/gi) || []).length : 0;
  const rightW = colR();
  const maxY = b.type === 'image'
    ? CONTENT_H - imgHeight(b, rightW) - (b.title != null ? 18 + titleLines * PARA_LH : 0) - (b.caption != null ? 22 + capLines * PARA_LH : 0)
    : CONTENT_H;
  wrap.style.top = Math.min(Math.max(b.y | 0, 0), Math.max(0, maxY)) + 'px';
  // badge: solta = "↕ arraste" no hover; travada = cadeado + label + trilha só no foco
  // (CSS .imgsel/.active-block). uiIco vive mais abaixo; buildRight só roda pós-init.
  const badge = document.createElement('span');
  badge.className = 'drag-badge';
  if (b.anchor) {
    badge.innerHTML = uiIco('lock-closed', 10, 'outline')
      + '<span class="drag-badge-lbl">Travada a coluna esquerda</span>';
    // trilha pontilhada no ponto de fixação (topo do wrap = y da âncora)
    const trail = document.createElement('span');
    trail.className = 'lock-trail';
    trail.setAttribute('aria-hidden', 'true');
    wrap.appendChild(trail);
  } else {
    badge.textContent = '↕ arraste';
  }
  wrap.appendChild(b.type === 'image' ? buildFigure(b, rightW, editing) : buildBlock(b, editing));
  wrap.appendChild(badge);
  return wrap;
}

// ─────────────────────────── zoom ───────────────────────────────────────────
const stage = document.getElementById('stage');
const zoomFitBtn = document.getElementById('zoomFit');
const zoomPctBtn = document.getElementById('zoomPct');
const zoomPctLabel = document.getElementById('zoomPctLabel');
const zoomPop = document.getElementById('zoomPop');
const zoomRange = document.getElementById('zoomRange');
const zoomPopVal = document.getElementById('zoomPopVal');
const ZOOM_MIN = 0.1, ZOOM_MAX = 2; // 10% … 200%
/** escala "caber na largura do stage" (cap em 100%). */
function fitZoomScale() {
  return Math.min(1, (stage.clientWidth - 64) / PAGE_W);
}
function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}
/** reflete state.zoom no botão fit, label % e slider do popover. */
function syncZoomUI(scale) {
  const isFit = state.zoom === 'fit';
  const z = scale ?? (isFit ? fitZoomScale() : clampZoom(+state.zoom));
  const pct = Math.round(z * 100);
  if (zoomFitBtn) zoomFitBtn.setAttribute('aria-pressed', String(isFit));
  if (zoomPctLabel) zoomPctLabel.textContent = pct + '%';
  if (zoomPopVal) zoomPopVal.textContent = pct + '%';
  if (zoomRange && document.activeElement !== zoomRange) zoomRange.value = String(pct);
}
function applyZoom() {
  let z = state.zoom;
  if (z === 'fit') z = fitZoomScale();
  else z = clampZoom(+z);
  pagesEl.style.transform = `scale(${z})`;
  // compensa a altura “perdida” pelo scale pra o scroll bater certo
  pagesEl.style.marginBottom = `-${(1 - z) * pagesEl.offsetHeight}px`;
  syncZoomUI(z);
}
function openZoomPop() {
  if (!zoomPop || !zoomPctBtn) return;
  zoomPop.hidden = false;
  zoomPctBtn.setAttribute('aria-expanded', 'true');
  const r = zoomPctBtn.getBoundingClientRect();
  const mw = zoomPop.offsetWidth || 200, mh = zoomPop.offsetHeight || 80;
  let x = r.left + (r.width - mw) / 2;
  x = Math.min(Math.max(8, x), innerWidth - mw - 8);
  let y = r.bottom + 6;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  zoomPop.style.left = x + 'px';
  zoomPop.style.top = y + 'px';
  // foca o slider pra setas/teclado funcionarem de imediato
  if (zoomRange) zoomRange.focus({ preventScroll: true });
}
function closeZoomPop() {
  if (!zoomPop || zoomPop.hidden) return;
  zoomPop.hidden = true;
  if (zoomPctBtn) zoomPctBtn.setAttribute('aria-expanded', 'false');
}
function setZoomFromPct(pct) {
  // qualquer ajuste manual sai do modo fit
  state.zoom = clampZoom((+pct || 100) / 100);
  applyZoom();
}

// ─────────────────── caret/seleção (offsets em caracteres) ──────────────────
function captureCaret() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return null;
  let el = sel.anchorNode;
  while (el && el.nodeType === 3) el = el.parentNode;
  const host = el && el.closest && el.closest('[contenteditable]');
  if (!host || !host.dataset.id) return null;
  const r = sel.getRangeAt(0);
  const pre = r.cloneRange();
  pre.selectNodeContents(host); pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  // guarda a SELEÇÃO inteira (start..end) — o re-render devolve o range, não só
  // um caret colapsado; é o que deixa formatar em sequência (B, depois I…)
  return { id: host.dataset.id, role: host.dataset.role || 'block', offset: start, end: start + r.toString().length };
}

function findEditable(keep) {
  const sel = keep.role === 'block' ? `[data-id="${keep.id}"][contenteditable]`
    : `[data-role="${keep.role}"][data-id="${keep.id}"]`;
  const els = pagesEl.querySelectorAll(sel);
  if (els.length < 2) return els[0] || null;
  // bloco cortado entre páginas: os dois fragmentos têm o MESMO conteúdo e o mesmo data-id,
  // só a janela muda. Devolver o primeiro deixaria o cursor na parte clipada (invisível), então
  // escolhemos o fragmento em que a posição do caret cai DENTRO da janela visível.
  for (const el of els) {
    const bnd = boundaryAt(el, keep.offset);
    const r = document.createRange(); r.setStart(bnd.node, bnd.off); r.collapse(true);
    const rc = r.getBoundingClientRect();
    const box = (el.parentElement && el.parentElement.classList.contains('frag') ? el.parentElement : el).getBoundingClientRect();
    if (rc.top >= box.top - 1 && rc.bottom <= box.bottom + 1) return el;
  }
  return els[0];
}

function restoreCaret(keep) {
  const el = findEditable(keep);
  if (!el) return;
  const a = boundaryAt(el, keep.offset);
  const b = keep.end != null && keep.end !== keep.offset ? boundaryAt(el, keep.end) : a;
  const r = document.createRange();
  r.setStart(a.node, a.off); r.setEnd(b.node, b.off);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  el.focus({ preventScroll: true });
}

// divide o HTML de um elemento no offset de caractere → [antes, depois]
function splitHtmlAt(el, offset) {
  const bound = boundaryAt(el, offset);
  const before = document.createRange();
  before.selectNodeContents(el); before.setEnd(bound.node, bound.off);
  const after = document.createRange();
  after.selectNodeContents(el); after.setStart(bound.node, bound.off);
  return [htmlOf(before.cloneContents()), htmlOf(after.cloneContents())];
}
function boundaryAt(el, offset) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, count = 0, last = null;
  while ((n = walker.nextNode())) {
    last = n;
    const len = n.nodeValue.length;
    if (count + len >= offset) return { node: n, off: offset - count };
    count += len;
  }
  return last ? { node: last, off: last.nodeValue.length } : { node: el, off: 0 };
}
function htmlOf(frag) { const d = document.createElement('div'); d.appendChild(frag); return d.innerHTML; }

// offset de caractere do caret dentro de um contenteditable (capa não usa data-id)
function caretOffsetIn(host) {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return (host.textContent || '').length;
  const r = sel.getRangeAt(0);
  if (!host.contains(r.startContainer)) return (host.textContent || '').length;
  const pre = r.cloneRange();
  pre.selectNodeContents(host); pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}

// ─────────────────────────── edição: teclado ────────────────────────────────
pagesEl.addEventListener('keydown', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host) return;

  // ── capa/contracapa: Enter = novo bloco · Shift+Enter = quebra de linha ──
  const coverEl = host.closest && host.closest('.cover-item');
  if (coverEl) {
    const f = findCoverItem(coverEl.dataset.cid);
    if (!f) return;
    const type = coverTypeOf(f.item);
    // tabela tem o próprio Enter (próxima célula); imagem/grid/divisor sem enter→novo bloco
    if (type === 'table' || type === 'image' || type === 'image-grid' || type === 'table-grid' || type === 'divider') return;
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }
    if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      enterAtCoverCaret(host, f);
      return;
    }
    return; // resto das teclas (Backspace etc.) segue o contenteditable nativo na capa
  }

  if (!host.dataset.id) return;
  const role = host.dataset.role || 'block';

  if (role !== 'block') {
    // título/legenda de imagem (e resumo do índice): Enter quebra linha dentro do campo, Escape confirma/sai
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); return; }
    if (e.key === 'Escape') { e.preventDefault(); host.blur(); return; }
    return;
  }

  const id = host.dataset.id, b = blockOf(id);
  if (!b) return;

  // Tab / Shift+Tab em lista → indenta / desindenta (subitem). Impede o foco pular pro browser.
  if (e.key === 'Tab' && LIST_TYPES.has(b.type)) {
    e.preventDefault();
    const keep = captureCaret();
    b.html = host.innerHTML;
    const cur = listIndentOf(b);
    if (e.shiftKey) {
      if (cur > 0) {
        setListIndent(b, cur - 1);
        render(keep && keep.id === b.id ? keep : { id: b.id, role: 'block', offset: 0 });
      }
      return;
    }
    // indent: item anterior pode ser de OUTRO tipo de lista (ol → li subitem → ol continua).
    // Nível máximo = prev.indent + 1 (padrão Docs/Word).
    const i = idxOf(b.id);
    const prev = i > 0 ? state.doc.blocks[i - 1] : null;
    if (!prev || !LIST_TYPES.has(prev.type)) return;
    if (cur >= MAX_LIST_INDENT) return;
    if (cur > listIndentOf(prev)) return;   // já mais fundo que o pai permite
    setListIndent(b, cur + 1);
    render(keep && keep.id === b.id ? keep : { id: b.id, role: 'block', offset: 0 });
    return;
  }

  // ⌘⏎ / Ctrl+⏎ → quebra de página no cursor
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); breakAtCaret(host, b); return; }

  // Shift+Enter → quebra de linha (explícito; evita <div> que alguns browsers metem)
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertLineBreak');
    return;
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); enterAtCaret(host, b); return;
  }

  if (e.key === 'Backspace') {
    const c = captureCaret();
    if (c && c.offset === 0 && getSelection().isCollapsed) {
      // no início de subitem: Backspace desindenta (mesmo papel do Shift+Tab) antes de mesclar
      if (LIST_TYPES.has(b.type) && listIndentOf(b) > 0) {
        e.preventDefault();
        b.html = host.innerHTML;
        setListIndent(b, listIndentOf(b) - 1);
        render({ id: b.id, role: 'block', offset: 0 });
        return;
      }
      e.preventDefault(); mergeBackwards(b);
    }
  }
});

// Enter na capa: divide o item e cria outro abaixo (mesmo contrato do miolo).
// title/subtitle/h*/quote/callout → o novo é parágrafo; lista/check continuam o tipo.
function enterAtCoverCaret(host, f) {
  const it = f.item;
  const type = coverTypeOf(it);
  const s0 = getSelection();
  if (s0 && !s0.isCollapsed) s0.deleteFromDocument();
  const off = caretOffsetIn(host);
  const [before, after] = splitHtmlAt(host, off);

  if ((type === 'li' || type === 'ol' || type === 'quote' || type === 'check' || type === 'callout')
      && !before.trim() && !after.trim()) {
    if (LIST_TYPES.has(type) && listIndentOf(it) > 0) {
      setListIndent(it, listIndentOf(it) - 1);
      it.html = '';
      render(); selectCoverItem(it.id);
      return;
    }
    it.type = 'p'; it.html = ''; it.size = COVER_TYPE_SIZE.p;
    delete it.indent;
    render(); selectCoverItem(it.id);
    requestAnimationFrame(() => {
      const el = pagesEl.querySelector(`.cover-item[data-cid="${it.id}"]`);
      if (el?.isContentEditable) el.focus();
    });
    return;
  }

  it.html = before;
  const newType = (COVER_HEAD_TYPES.has(type) || type === 'callout' || type === 'quote') ? 'p' : type;
  // y provisório; depois do render mede a altura real do de cima e encaixa o novo
  const nb = coverItem(after, COVER_TYPE_SIZE[newType] ?? 18, it.span || 'full', it.align || 'left', it.color || null, (it.y || 0) + 40, newType);
  if (LIST_TYPES.has(newType) && listIndentOf(it) > 0) nb.indent = listIndentOf(it);
  f.list.splice(f.idx + 1, 0, nb);
  state.sel = nb.id;
  render();
  const n0 = pagesEl.querySelector(`.cover-item[data-cid="${it.id}"]`);
  const h0 = n0 ? n0.offsetHeight : 28;
  nb.y = Math.min((it.y || 0) + h0 + GAP_CV, COVER_AREA_H - 30);
  const n1 = pagesEl.querySelector(`.cover-item[data-cid="${nb.id}"]`);
  if (n1) n1.style.top = nb.y + 'px';
  selectCoverItem(nb.id);
  requestAnimationFrame(() => {
    const root = pagesEl.querySelector(`.cover-item[data-cid="${nb.id}"]`);
    if (!root) return;
    const ed = root.matches('[contenteditable=true]') ? root
      : root.querySelector('[contenteditable=true]');
    if (ed) ed.focus();
  });
}

function enterAtCaret(host, b) {
  const s0 = getSelection();
  if (s0 && !s0.isCollapsed) s0.deleteFromDocument();   // Enter sobre seleção apaga (Notion)
  const c = captureCaret();
  const [before, after] = splitHtmlAt(host, c ? c.offset : (host.textContent.length));

  // lista/citação/checklist vazia + Enter → desindenta (se subitem) ou vira parágrafo.
  // 'callout' entrou depois — é uma caixa avulsa, não uma lista, então Enter num callout
  // vazio deve sair dele (virar parágrafo), não deixar uma caixa vazia pra trás.
  if ((b.type === 'li' || b.type === 'ol' || b.type === 'quote' || b.type === 'check' || b.type === 'callout') && !before.trim() && !after.trim()) {
    if (LIST_TYPES.has(b.type) && listIndentOf(b) > 0) {
      setListIndent(b, listIndentOf(b) - 1);
      b.html = '';
      render({ id: b.id, role: 'block', offset: 0 });
      return;
    }
    b.type = 'p'; b.html = '';
    delete b.indent;
    render({ id: b.id, role: 'block', offset: 0 });
    return;
  }
  b.html = before;
  // título, citação e callout não continuam (viram parágrafo); lista/checklist continuam
  // (é o ponto de ter uma lista). Callout é caixa avulsa — Enter não empilha caixas.
  // Citação: Enter sempre abre parágrafo (não encadeia blockquotes).
  const newType = (HEAD_TYPES.has(b.type) || b.type === 'callout' || b.type === 'quote') ? 'p' : b.type;
  const nb = mkBlock(newType, after);
  // subitem: o novo item herda o nível do atual (continua a lista aninhada)
  if (LIST_TYPES.has(newType) && listIndentOf(b) > 0) nb.indent = listIndentOf(b);
  state.doc.blocks.splice(idxOf(b.id) + 1, 0, nb);
  render({ id: nb.id, role: 'block', offset: 0 });
}

function mergeBackwards(b) {
  const i = idxOf(b.id);
  if (i <= 0) return;
  const prev = state.doc.blocks[i - 1];
  if (prev.type === 'pagebreak' || prev.type === 'divider') {   // apaga a quebra/divisor
    state.doc.blocks.splice(i - 1, 1);
    render({ id: b.id, role: 'block', offset: 0 });
    return;
  }
  if (!TEXT_TYPES.has(prev.type)) return;     // imagem antes: não mescla
  const at = (new DOMParser().parseFromString('<x>' + (prev.html || '') + '</x>', 'text/html'))
    .querySelector('x').textContent.length;
  prev.html = (prev.html || '') + (b.html || '');
  state.doc.blocks.splice(i, 1);
  render({ id: prev.id, role: 'block', offset: at });
}

// insere um separador (pagebreak | divider) no cursor, quebrando o bloco atual
function breakAtCaret(host, b, sepType = 'pagebreak') {
  const s0 = getSelection();
  if (s0 && !s0.isCollapsed) s0.collapseToStart();
  const c = captureCaret();
  const [before, after] = splitHtmlAt(host, c ? c.offset : host.textContent.length);
  const i = idxOf(b.id);
  if (!before.trim()) {
    // no início do bloco → separador acima, bloco intacto continua
    state.doc.blocks.splice(i, 0, mkBlock(sepType, ''));
    render({ id: b.id, role: 'block', offset: 0 });
    return;
  }
  b.html = before;
  const sep = mkBlock(sepType, '');
  // fim do bloco: começa parágrafo vazio; meio: mantém o tipo com o resto
  const nb = after.trim() ? mkBlock(b.type, after) : mkBlock('p', '');
  if (after.trim() && LIST_TYPES.has(b.type) && listIndentOf(b) > 0) nb.indent = listIndentOf(b);
  state.doc.blocks.splice(i + 1, 0, sep, nb);
  render({ id: nb.id, role: 'block', offset: 0 });
}

// ─────────────────────────── edição: input (sync + atalhos md) ──────────────
let inputT;
pagesEl.addEventListener('input', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host || !host.dataset.id) return;
  const role = host.dataset.role || 'block';
  const b = blockOf(host.dataset.id);
  if (!b) return;

  if (role === 'title' || role === 'caption') {
    // grid: data-item = índice da célula; imagem avulsa: campos no próprio bloco
    if (host.dataset.item != null && b.type === 'image-grid') {
      ensureImageGrid(b);
      const it = b.items[+host.dataset.item];
      if (it) {
        it[role] = host.innerHTML;
        // garante flag do bloco se o usuário digita (caso edge de DOM residual)
        if (role === 'title' && !titlesOn(b)) b.titles = true;
        if (role === 'caption' && !captionsOn(b)) b.captions = true;
      }
    } else {
      b[role] = host.innerHTML;
    }
    save();
    return;
  }

  // ── atalhos markdown ──────────────────────────────────────────────────────
  const t = host.textContent;
  const mkType = (tk) => tk === '#' ? 'h1' : tk === '##' ? 'h2' : tk === '###' ? 'h3' : tk === '####' ? 'h4'
    : tk === '>' ? 'quote' : /^\d+\.$/.test(tk) ? 'ol' : 'li';
  let m;
  // trilha B (t1): "/" no INÍCIO do bloco → menu popover de tipos (estilo Notion). Só dispara
  // com "/" seguido de não-espaços (o filtro); um espaço fecha, como no Notion. Não colide com
  // os atalhos "#/>/-/1./---" (nenhum começa com "/") nem com "/" no meio de uma frase (t[0]≠'/').
  if (TEXT_TYPES.has(b.type) && t[0] === '/' && /^\/(\S*)$/.test(t)) {
    b.html = host.innerHTML; save();            // mantém o "/filtro" e o caret; o menu só escolhe
    slash.open(b.id, t.slice(1));
    return;
  }
  if (slash.isOpen()) slash.close();            // deixou de ser "/…" → fecha o menu
  // atalhos md valem em QUALQUER bloco de texto (quote, h2, li…), não só parágrafo —
  // o marcador no início + espaço troca o tipo do bloco atual (Notion).
  // \s (não só " ") porque contenteditable costuma inserir NBSP no espaço.
  if (TEXT_TYPES.has(b.type) && (m = t.match(/^\[([ xX]?)\]\s([\s\S]*)$/))) {
    b.type = 'check'; b.checked = /[xX]/.test(m[1]); b.html = escapeHtml(m[2]);
    render({ id: b.id, role: 'block', offset: m[2].length }); syncTypeUI('check');
    return;
  }
  // commit: digita o marcador (#, ##, >, -, 1.) → símbolo fica no texto;
  // espaço seguinte CONSOME marcador+espaço e aplica o tipo. Sem preview ao vivo.
  if (TEXT_TYPES.has(b.type) && (m = t.match(/^(#{1,4}|>|[-*]|\d+\.)\s([\s\S]*)$/))) {
    b.type = mkType(m[1]); b.html = escapeHtml(m[2]);
    if (!LIST_TYPES.has(b.type)) delete b.indent; // indent só faz sentido em lista
    render({ id: b.id, role: 'block', offset: m[2].length }); syncTypeUI(b.type);
    return;
  }
  // divisor (bloco de texto cujo conteúdo é só ---/***/___ → vira divisor + parágrafo novo)
  if (TEXT_TYPES.has(b.type) && (t === '---' || t === '***' || t === '___')) {
    const nb = mkBlock('p', '');
    state.doc.blocks.splice(idxOf(b.id), 1, mkBlock('divider', ''), nb);
    render({ id: nb.id, role: 'block', offset: 0 });
    return;
  }
  b.html = host.innerHTML;
  syncTypeUI(b.type);
  // reflow depois de pausar de digitar (evita rebuild a cada tecla)
  clearTimeout(inputT); inputT = setTimeout(() => render(), 180);
});

// trilha B (t1): menu "/" — a lista de tipos sai da MESMA paleta #blocktypes (rótulo+ícone),
// sem duplicar nada. Aplicar reusa setActiveType()/insertSeparatorButton()/addImageViaPalette().
const slash = initSlashMenu({
  defs: [...document.querySelectorAll('#blocktypes button[data-type]')].map(btn => ({
    type: btn.dataset.type,
    label: (btn.querySelector('.lbl') || {}).textContent || btn.dataset.type,
    icon: (btn.querySelector('.ico') || {}).innerHTML || '',
  })),
  onPick: (def, id) => {
    // capa/contracapa: aplica o tipo no item livre (imagem/tabela/lista/texto…)
    const covHit = id && findCoverItem(id);
    if (covHit) {
      applyCoverItemType(covHit.item, def.type);
      return;
    }
    const b = id && blockOf(id); if (!b) return;
    state.activeId = b.id;
    b.html = '';                                // tira o "/filtro" digitado do bloco
    if (def.type === 'pagebreak' || def.type === 'divider' || def.type === 'image') {
      render({ id: b.id, role: 'block', offset: 0 });   // limpa o DOM e devolve o caret ao bloco vazio
      if (def.type === 'image') addImageViaPalette(); else insertSeparatorButton(def.type);
    } else if (def.type === 'table' || def.type === 'image-grid' || def.type === 'table-grid' || def.type === 'icon') {
      // estrutural: nunca converte o bloco ("/table" já limpo; insertBlockAfter faz o resto)
      insertBlockAfter(def.type);
    } else {
      setActiveType(def.type);                  // reusa a troca de tipo (já renderiza + foca)
    }
  },
});

// Notion: "+" ao lado da alça / no fim da coluna → parágrafo novo + menu de tipos (mesmo do "/")
function insertAfterWithSlash(afterId) {
  clearIdxFocus();
  if (state.sel) {
    state.sel = null;
    pagesEl.querySelectorAll('.imgsel, .divsel, .pbsel, .cover-sel').forEach(el => el.classList.remove('imgsel', 'divsel', 'pbsel', 'cover-sel'));
    closeImgPanel(); closeCoverPanel();
  }
  const nb = mkBlock('p', '');
  const i = afterId ? idxOf(afterId) : -1;
  if (i >= 0) state.doc.blocks.splice(i + 1, 0, nb);
  else state.doc.blocks.push(nb);
  state.activeId = nb.id;
  render({ id: nb.id, role: 'block', offset: 0 });
  // espera o caret/DOM do render; abre o menu de tipos ancorado no bloco novo
  requestAnimationFrame(() => { slash.open(nb.id, ''); });
}

// aplica um tipo da paleta a um item da capa (texto, lista, imagem, tabela, divisor…)
// pagebreak não existe na capa — o slash já exclui; se cair aqui, vira parágrafo.
let pendingCoverImageId = null;   // id do cover-item esperando o arquivo de imagem
function applyCoverItemType(it, type) {
  if (!it) return;
  if (type === 'pagebreak') type = 'p';
  if (type === 'image') {
    // só troca o type depois do arquivo carregar (cancelar o picker não deixa item quebrado)
    pendingCoverImageId = it.id;
    replaceImageId = null;
    pendingImgPlacement = null;
    document.getElementById('imgfile').click();
    return;
  }
  // limpa campos de outros tipos
  delete it.src; delete it.nw; delete it.nh; delete it.radius; delete it.chart;
  delete it.rows; delete it.colWidths; delete it.headerColor; delete it.hideVLines;
  delete it.borderOuter; delete it.borderInner; delete it.bg; delete it.borderWidth;
  delete it.headerTextColor; delete it.color; delete it.merges;
  delete it.fontSize; delete it.lineHeight; delete it.radius; delete it.align; delete it.valign;
  delete it.altRows; delete it.headerRow; delete it.headerCol;
  delete it.items; delete it.equal; delete it.fill; delete it.size; delete it.color; delete it.gap;
  delete it.checked; delete it.icon; delete it.iconSet; delete it.iconStyle; delete it.iconColor; delete it.iconFill;
  it.type = type;
  it.html = '';
  if (type === 'table') {
    ensureTable(it);
  } else if (type === 'image-grid') {
    ensureImageGrid(it);
  } else if (type === 'table-grid') {
    ensureTableGrid(it);
  } else if (type === 'icon') {
    it.icon = DEFAULT_MS_ICON;
    it.color = DEFAULT_MS_COLOR;
    it.size = DEFAULT_MS_SIZE;
  } else if (type === 'callout') {
    ensureCalloutDefaults(it);
  } else if (type === 'check') {
    it.checked = false;
  } else if (type === 'divider') {
    // sem html
  } else {
    it.size = COVER_TYPE_SIZE[type] ?? it.size ?? 18;
  }
  state.sel = it.id;
  state.activeId = null;
  render();
  selectCoverItem(it.id);
  if (COVER_PLAIN.has(type) || type === 'li' || type === 'ol' || type === 'check' || type === 'callout') {
    requestAnimationFrame(() => {
      const root = pagesEl.querySelector(`.cover-item[data-cid="${it.id}"]`);
      if (!root) return;
      const ed = root.matches('[contenteditable=true]') ? root
        : root.querySelector('[contenteditable=true]');
      if (ed) ed.focus();
    });
  }
}

// última capa/contracapa clicada — paleta da aba Conteúdo sabe onde inserir sem seleção
let lastCoverKind = null;
function coverKindOf(cov) {
  return cov === state.doc.back ? 'back' : 'cover';
}
// contexto da paleta: item/logo selecionado, ou última capa focada (sem bloco do miolo ativo)
function activeCoverKind() {
  if (state.sel) {
    const f = findCoverItem(state.sel);
    if (f) return coverKindOf(f.cov);
    const lk = logoKindOfSel(state.sel);
    if (lk) return lk;
  }
  if (!state.activeId && lastCoverKind) {
    const cov = lastCoverKind === 'back' ? state.doc.back : state.doc.cover;
    if (cov && cov.on) return lastCoverKind;
  }
  return null;
}
// Y do próximo item livre (abaixo do afterId ou do mais baixo da capa)
function nextCoverY(cov, afterId) {
  if (afterId) {
    const f = findCoverItem(afterId);
    const node = pagesEl.querySelector(`.cover-item[data-cid="${afterId}"]`);
    const h = node ? node.offsetHeight : 24;
    return Math.min((f?.item.y || 0) + h + GAP_CV, COVER_AREA_H - 30);
  }
  if (cov.items.length) {
    let maxBottom = 0;
    for (const it of cov.items) {
      const n = pagesEl.querySelector(`.cover-item[data-cid="${it.id}"]`);
      maxBottom = Math.max(maxBottom, (it.y || 0) + (n ? n.offsetHeight : 24));
    }
    return Math.min(maxBottom + GAP_CV, COVER_AREA_H - 30);
  }
  return 0;
}
function pushCoverItem(kind, it, afterId) {
  const cov = kind === 'back' ? state.doc.back : state.doc.cover;
  if (!cov) return false;
  if (afterId) {
    const f = findCoverItem(afterId);
    if (f) f.list.splice(f.idx + 1, 0, it);
    else cov.items.push(it);
  } else {
    cov.items.push(it);
  }
  lastCoverKind = kind;
  return true;
}
// capa/contracapa: "+" Notion (alça ou zona vazia) → parágrafo + menu de tipos
function insertCoverWithSlash(kind, afterId) {
  const cov = kind === 'back' ? state.doc.back : state.doc.cover;
  if (!cov) return;
  clearIdxFocus();
  state.activeId = null;
  const it = coverItem('', 18, 'full', 'left', null, nextCoverY(cov, afterId), 'p');
  if (!pushCoverItem(kind, it, afterId)) return;
  state.sel = it.id;
  render();
  selectCoverItem(it.id);
  requestAnimationFrame(() => {
    const el = pagesEl.querySelector(`.cover-item[data-cid="${it.id}"]`);
    if (el) {
      if (el.isContentEditable) el.focus();
      // capa: Título/Subtítulo no topo + paleta do miolo, sem quebra de página
      slash.open(it.id, '', { exclude: ['pagebreak'], extra: COVER_SLASH_EXTRA });
    }
  });
}
// paleta / inserções tipadas na capa (sem abrir o slash)
function insertCoverTyped(kind, type, afterId) {
  if (!kind || type === 'pagebreak') return;
  const cov = kind === 'back' ? state.doc.back : state.doc.cover;
  if (!cov) return;
  clearIdxFocus();
  state.activeId = null;
  const it = coverItem('', COVER_TYPE_SIZE[type] ?? 18, 'full', 'left', null, nextCoverY(cov, afterId), 'p');
  if (!pushCoverItem(kind, it, afterId)) return;
  state.sel = it.id;
  // image: apply abre o picker sem render — precisa pintar o item novo antes
  if (type === 'image') {
    render();
    selectCoverItem(it.id);
  }
  applyCoverItemType(it, type);
}
function duplicateCoverItem(id) {
  const f = findCoverItem(id); if (!f) return;
  const node = pagesEl.querySelector(`.cover-item[data-cid="${id}"]`);
  const h = node ? node.offsetHeight : 24;
  const copy = structuredClone(f.item);
  copy.id = uid();
  copy.y = Math.min((f.item.y || 0) + h + GAP_CV, COVER_AREA_H - 30);
  f.list.splice(f.idx + 1, 0, copy);
  state.sel = copy.id;
  render();
  selectCoverItem(copy.id);
}
function deleteCoverItem(id) {
  const f = findCoverItem(id); if (!f) return;
  f.list.splice(f.idx, 1);
  if (state.sel === id) state.sel = null;
  closeCoverPanel();
  render();
}

pagesEl.addEventListener('focusin', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host) return;
  // capa/contracapa: conteúdo editável dentro do cover-item (texto, lista, célula de tabela)
  const coverEl = host.closest && host.closest('.cover-item');
  if (coverEl) {
    selectCoverItem(coverEl.dataset.cid);
    return;
  }
  const role = host.dataset.role || 'block';
  // resumo do índice: borda roxa na seção + painel de largura (não é bloco do miolo)
  if (role === 'resumo') {
    setIdxFocus('resumo');
    return;
  }
  if (role !== 'block') return;
  // a célula editável da tabela não carrega data-id (quem carrega é o envelope .tbl-wrap) →
  // sobe até o bloco, senão a sidebar (tipo + coluna) continuaria falando do bloco ANTERIOR
  // enquanto se digita dentro da tabela.
  // table-grid: wrap da célula tem id sintético __tg_<blockId>_<i> — resolve pro bloco pai.
  const holder = host.dataset.id ? host : (host.closest && host.closest('[data-id]'));
  let b = holder && blockOf(holder.dataset.id);
  if (!b) {
    const syn = holder?.dataset?.id || '';
    const m = /^__tg_(.+)_(\d+)$/.exec(syn);
    if (m) b = blockOf(m[1]);
  }
  if (!b) {
    const gw = host.closest && host.closest('.tblgrid-wrap[data-id]');
    if (gw) b = blockOf(gw.dataset.id);
  }
  if (!b) return;
  clearIdxFocus();
  state.activeId = b.id; syncTypeUI(b.type);
  lastCoverKind = null;                    // miolo em foco → paleta não manda pra capa
  setSegment('conteudo');                  // clicar num bloco → aba Conteúdo
  // limpa seleção de imagem/divisor/quebra — o foco de texto é o estado ativo agora
  if (state.sel) {
    state.sel = null;
    pagesEl.querySelectorAll('.imgsel, .divsel, .pbsel, .cover-sel').forEach(el => el.classList.remove('imgsel', 'divsel', 'pbsel', 'cover-sel'));
    closeImgPanel(); closeCoverPanel();
  }
  // borda roxa no ENVELOPE do bloco (não no contenteditable interno) + alça + menus
  paintActiveBlock(b.id);
  showHandleAtFocused();                   // alça ⠿ à esquerda, centrada na altura do bloco
  updateCalloutBar();                      // barra flutuante do callout — só aparece se b.type==='callout'
  if (b.type === 'table') tablePanelDismissed = false; // re-focar célula reabre o popover
  if (b.type === 'image-grid') imageGridPanelDismissed = false;
  if (b.type === 'table-grid') tableGridPanelDismissed = false;
  if (TEXT_PLACE_TYPES.has(b.type)) textPlacePanelDismissed = false;
  // painel de ícone: bloco type=icon OU qualquer heading (H1–H4) — não fechar o de título
  if (b.type === 'icon' || HEAD_TYPES.has(b.type)) {
    if (HEAD_TYPES.has(b.type)) updateHeadBar();
    else openIconBlockPanel();
  } else {
    closeIconBlockPanel();
  }
  updateTableBar();
  updateImageGridBar();
  updateTableGridBar();
  updateTextPlaceBar();
  syncColUI();                             // coluna do bloco ativo na aba Conteúdo
});

// seleciona/desseleciona imagem SEM re-render (um rebuild no meio do gesto de
// arraste destruía o elemento com pointer capture — era isso que fazia a imagem
// "pular" em vez de acompanhar o mouse)
function setImgSel(id) {
  state.sel = id;
  pagesEl.querySelectorAll('.imgsel, .divsel, .pbsel, .cover-sel').forEach(el => el.classList.remove('imgsel', 'divsel', 'pbsel', 'cover-sel'));
  closeCoverPanel();
  const b = id && blockOf(id);
  if (!b) {
    closeImgPanel();
    // sem seleção de imagem → se ainda há bloco de texto ativo, re-pinta a borda dele
    paintActiveBlock(state.activeId);
    showHandleAtFocused();
    updateCalloutBar();
    updateHeadBar();
    updateTableBar();
    updateTextPlaceBar();
    return;
  }
  clearIdxFocus();
  // bloco estrutural vira o "foco" do documento (borda roxa + alça + sidebar)
  state.activeId = id;
  lastCoverKind = null;   // miolo ativo → paleta deixa de mirar capa/contracapa
  paintActiveBlock(id);
  showHandleAtFocused();
  syncTypeUI(b.type);
  setSegment('conteudo');
  syncColUI();
  updateCalloutBar();
  updateTableBar();
  updateImageGridBar();
  updateTextPlaceBar();
  if (b.type === 'icon' || HEAD_TYPES.has(b.type)) {
    if (HEAD_TYPES.has(b.type)) updateHeadBar();
    else openIconBlockPanel();
  } else {
    closeIconBlockPanel();
  }
  if (b.type === 'divider') {                    // divisor: borda roxa, sem painel
    const el = pagesEl.querySelector(`.divider[data-id="${id}"]`);
    if (el) el.classList.add('divsel');
    closeImgPanel();
    return;
  }
  if (b.type === 'pagebreak') {                  // quebra de página: mesmo tratamento do divisor
    const el = pagesEl.querySelector(`.e-pbreak[data-id="${id}"]`);
    if (el) el.classList.add('pbsel');
    closeImgPanel();
    return;
  }
  // coluna direita: qualquer tipo ganha outline de seleção no .rimg; painel flutuante
  // só existe pra imagem (texto/tabela/grid usam a sidebar: Posição + Travar no texto).
  const el = pagesEl.querySelector(`.rimg[data-id="${id}"]`) || pagesEl.querySelector(`figure[data-id="${id}"]`);
  if (el) el.classList.add('imgsel');
  if (b.type === 'image') openImgPanel();
  else closeImgPanel();
}

// clicar numa figura/divisor/item de capa / logo / seção Índice|Resumo / callout seleciona
pagesEl.addEventListener('mousedown', (e) => {
  if (e.target.closest && e.target.closest('.rimg')) return;   // o pointerdown do drag cuida
  // rastreia capa/contracapa vs miolo pra paleta da aba Conteúdo
  const coverPage = e.target.closest && e.target.closest('.page[data-cover]');
  if (coverPage) lastCoverKind = coverPage.dataset.cover;
  else if (e.target.closest && e.target.closest('.page')) lastCoverKind = null;
  const idxSec = e.target.closest && e.target.closest('.idx-section');
  const coverLogo = e.target.closest && e.target.closest('.cover-logo-hit');
  const coverIt = e.target.closest && e.target.closest('.cover-item');
  const fig = e.target.closest && e.target.closest('figure.fig');
  const divider = e.target.closest && e.target.closest('.divider.b');
  const pbreak = e.target.closest && e.target.closest('.e-pbreak');   // bug: nunca era selecionável → Backspace não achava o quê remover
  const callout = e.target.closest && e.target.closest('.callout.b');
  const tblgrid = e.target.closest && e.target.closest('.tblgrid-wrap.b');
  // tabela avulsa (não preview dentro do grid de tabelas)
  const tbl = e.target.closest && e.target.closest('.tbl-wrap.b:not(.tblgrid-preview)');
  const imggrid = e.target.closest && e.target.closest('.imggrid-wrap.b');
  const iconBlk = e.target.closest && e.target.closest('.icon-block.b');
  const headWrap = e.target.closest && e.target.closest('.head-wrap.b');
  // H1–H4 sem ícone não têm .head-wrap — ainda assim abrem o menu Ícone do título
  const headPlain = e.target.closest && e.target.closest('h1.b, h2.b, h3.b, h4.b');
  const editable = e.target.closest && e.target.closest('[contenteditable]');
  if (idxSec) {
    // resumo editável: o focusin cuida; mousedown no título/borda da seção também foca
    setIdxFocus(idxSec.dataset.idx);
  } else if (callout) {
    // qualquer parte do callout (ícone, padding, texto) seleciona e mostra a #calloutBar
    selectBlockFromHandle(callout.dataset.id);
  } else if (tblgrid) {
    // chrome da tabela ( +, alças, resize ): o próprio bloco-tabela cuida;
    // não reabrir painel no meio do pointerdown de add/reorder
    if (e.target.closest?.('.tbl-edge-add, .tbl-handle, .tbl-resizer, .tbl-merge-bar, .tbl-merge-btn, .tbl-menu')) {
      /* no-op */
    } else {
      selectBlockFromHandle(tblgrid.dataset.id);
    }
  } else if (tbl) {
    // clique na moldura/célula da tabela → ativo + popover lateral (célula ainda recebe o focusin)
    if (e.target.closest?.('.tbl-edge-add, .tbl-handle, .tbl-resizer, .tbl-merge-bar, .tbl-merge-btn, .tbl-menu')) {
      /* no-op */
    } else {
      selectBlockFromHandle(tbl.dataset.id);
    }
  } else if (imggrid) {
    // igual tabela: clicar na moldura, slot vazio, título ou legenda ativa o grid + painel
    selectBlockFromHandle(imggrid.dataset.id);
  } else if (iconBlk) {
    selectBlockFromHandle(iconBlk.dataset.id);
  } else if (headWrap && !editable) {
    selectBlockFromHandle(headWrap.dataset.id);
  } else if (headPlain && !editable?.closest?.('.head-wrap')) {
    // título sem ícone (ou clique na moldura do hN): ativa + painel Ícone do título
    // se editable está no head-wrap, o focusin do texto já cuida
    const hid = headPlain.dataset.id || headWrap?.dataset?.id;
    if (hid) selectBlockFromHandle(hid);
  } else if (coverLogo) selectCoverLogo(coverLogo.dataset.logo);
  else if (coverIt) selectCoverItem(coverIt.dataset.cid);
  else if (fig && !editable) setImgSel(fig.dataset.id);
  else if (divider) setImgSel(divider.dataset.id);
  else if (pbreak) setImgSel(pbreak.dataset.id);
  else if (state.sel && !e.target.closest('#imgPanel') && !e.target.closest('#coverPanel')
    && !e.target.closest('#logoPanel') && !e.target.closest('#idxPanel') && !e.target.closest('#resumoPanel')) setImgSel(null);
  else if (idxFocus && !e.target.closest('#idxPanel') && !e.target.closest('#resumoPanel')
    && !e.target.closest('.idx-section')) clearIdxFocus();
});

// clicar na área vazia da coluna direita → menu flutuante pra adicionar imagem
pagesEl.addEventListener('click', (e) => {
  const colR = e.target.closest && e.target.closest('.col-right');
  const onImg = e.target.closest('.rimg') || e.target.closest('figure.fig');
  if (colR && !onImg) openAddImgMenu(e, colR);
});

// ─────────────────────────── paste (Google Docs / Word / md) ────────────────
pagesEl.addEventListener('paste', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host || !host.dataset.id || (host.dataset.role || 'block') !== 'block') return;  // só blocos do miolo
  const html = e.clipboardData.getData('text/html');
  const text = e.clipboardData.getData('text/plain');
  // URL colada sobre um texto selecionado → vira link clicável (sublinhado via CSS)
  const url = text.trim();
  if (!getSelection().isCollapsed && URL_RE.test(url)) {
    e.preventDefault();
    document.execCommand('createLink', false, /^www\./i.test(url) ? 'https://' + url : url);
    return;                                    // o evento 'input' do execCommand sincroniza o bloco
  }
  const blocks = html ? blocksFromHtml(html) : parseMarkdown(text);
  if (!blocks.length) return;
  e.preventDefault();
  const b = blockOf(host.dataset.id);
  const c = captureCaret();
  const [before, after] = splitHtmlAt(host, c ? c.offset : host.textContent.length);
  // 1º bloco colado emenda no texto antes do cursor; resto entra como blocos
  b.html = before + (blocks[0].type === 'p' ? blocks[0].html : '');
  const insert = blocks.slice(blocks[0].type === 'p' ? 1 : 0);
  if (after.trim()) insert.push(mkBlock('p', after));
  state.doc.blocks.splice(idxOf(b.id) + 1, 0, ...insert);
  const last = insert[insert.length - 1] || b;
  render({ id: last.id, role: 'block', offset: last === b ? before.length : (last.textLen ?? 99999) });
});

// ─────────────────────────── imagens: arrastar (coluna direita) ─────────────
let drag = null;
const SNAP = 6;                              // px de tolerância pro snap

// alvos de snap de um bloco: topo, cada linha de texto (via line-height) e a base —
// permite alinhar o topo da imagem com a N-ésima linha de um parágrafo (como no InDesign).
function snapTargets(colLeft) {
  if (!colLeft) return [0];
  const out = [0];
  for (const c of colLeft.children) {
    const top = c.offsetTop, h = c.offsetHeight;
    // o line-height mora no elemento de TEXTO: checklist/callout o escondem num envelope, e
    // um bloco continuado (.frag) o embrulha numa janela — sem desembrulhar, cai no fallback
    // "bloco sem linhas" e o snap volta a ser só topo/base.
    const alvo = c.classList.contains('frag') ? c.firstElementChild
      : (c.querySelector('.ck-txt, .co-txt') || c);
    const lh = parseFloat(getComputedStyle(alvo).lineHeight);
    if (Number.isFinite(lh) && lh >= 4) {
      for (let k = 0; k * lh < h; k++) out.push(top + k * lh);
    } else {
      out.push(top);                       // bloco sem linhas próprias (figura/divider/pbreak/tabela)
    }
    out.push(top + h);                     // base do bloco
  }
  return out;
}

// página do miolo sob o cursor. Por GEOMETRIA, não por elementFromPoint: o próprio item
// arrastado mora debaixo do cursor e roubaria o hit-test. Só o eixo Y importa — sair de lado
// não deve trocar de página.
function contentPageAt(clientY) {
  for (const p of pagesEl.querySelectorAll('.page[data-page]')) {
    const r = p.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) return p;
  }
  return null;
}
// leva o item arrastado pra coluna direita de outra página, no meio do arraste. Reparentar o
// nó é o que faz ele SEGUIR o cursor entre páginas em vez de ficar preso na página de origem.
function dragToPage(page) {
  showSnapGuide(drag.content, null);          // a guia é por página; some da que ficou pra trás
  page.querySelector('.col-right').appendChild(drag.wrap);
  drag.page = page;
  drag.pageIdx = +page.dataset.page || 0;
  drag.content = page.querySelector('.content');
  drag.snaps = snapTargets(drag.content.querySelector('.col-left'));   // alvos são os da página nova
}

pagesEl.addEventListener('pointerdown', (e) => {
  const wrap = e.target.closest && e.target.closest('.rimg');
  if (!wrap || e.target.closest('[contenteditable]')) return;
  e.preventDefault();                        // não vira seleção de texto nem mousedown
  const b = blockOf(wrap.dataset.id);
  const content = wrap.closest('.content');
  const page = wrap.closest('.page');
  const z = currentZoom();
  // guardamos ONDE dentro do item o usuário pegou (em px de página), não um delta de tela: com
  // isso o Y sai sempre de "cursor − topo da área de conteúdo DESTA página", e trocar de página
  // no meio do arraste é só trocar qual .content é medido.
  const grabDY = (e.clientY - wrap.getBoundingClientRect().top) / z;
  drag = {
    b, wrap, content, page, grabDY, z, _y: null,
    pageIdx: +page.dataset.page || 0, page0: +page.dataset.page || 0,
    snaps: snapTargets(content && content.querySelector('.col-left')),
  };
  wrap.classList.add('dragging'); wrap.setPointerCapture(e.pointerId);
  setImgSel(b.id);                           // seleção por classe — nada de render() aqui
});
// move/up no DOCUMENT (e não no pagesEl): reparentar o nó derruba o pointer capture, e um
// listener preso ao pagesEl perderia o resto do gesto se o cursor saísse do palco.
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const pg = contentPageAt(e.clientY);
  if (pg && pg !== drag.page) dragToPage(pg);
  const cr = drag.content.getBoundingClientRect();
  let y = (e.clientY - cr.top) / drag.z - drag.grabDY;
  const maxY = CONTENT_H - drag.wrap.offsetHeight;
  y = Math.min(Math.max(y, 0), Math.max(0, maxY));
  // snap: alinha ao topo (ou a qualquer linha) do bloco mais próximo da coluna esquerda
  let hit = null, best = SNAP;
  for (const s of drag.snaps) { const d = Math.abs(s - y); if (d < best) { best = d; hit = s; } }
  if (hit != null) y = hit;
  showSnapGuide(drag.content, hit);
  drag.wrap.style.top = y + 'px';
  drag._y = y;
});
document.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag, wrap = d.wrap, b = d.b;
  wrap.classList.remove('dragging'); showSnapGuide(d.content, null);
  // solto sobre a coluna esquerda? → sai da direita e entra no fluxo como imagem.
  // O próprio item E o painel flutuante saem do hit-test: em janela estreita o painel vira pro
  // lado esquerdo da imagem e cobre a coluna de texto, e o drop falhava em silêncio.
  const chrome = [wrap, imgPanel].filter(Boolean);
  chrome.forEach(el => { el.style.pointerEvents = 'none'; });
  const under = document.elementFromPoint(e.clientX, e.clientY);
  chrome.forEach(el => { el.style.pointerEvents = ''; });
  drag = null;
  if (under && under.closest && under.closest('.col-left')) { applyDrop(b.id, dropTargetAt(e.clientX, e.clientY)); return; }
  b.page = d.pageIdx;                        // pode ter mudado de página no meio do arraste
  if (d._y != null) {
    b.y = Math.round(d._y);
    // travada: o arraste não solta a âncora, RE-ancora no bloco mais próximo do novo Y (o
    // snap pode ter grudado num bloco diferente do original) — mesma regra do botão cadeado.
    if (b.anchor) {
      const alvo = nearestByTop(leftBlocksOnPage(b.page | 0), b.y);
      // página sem bloco no fluxo (só coluna direita): manter a âncora antiga puxaria a imagem
      // de volta pra página do bloco velho no próximo render — destrava em vez de teleportar.
      if (alvo) b.anchor = { id: alvo.id, dy: b.y - alvo._top };
      else delete b.anchor;
    }
  }
  if (d.pageIdx !== d.page0) render();        // mudou de página → repagina (o DOM já está certo, isto normaliza)
  save(); scheduleCommit();
});

// linha-guia do snap (some quando hit é null)
function showSnapGuide(content, y) {
  if (!content) return;
  let g = content.querySelector('.snap-guide');
  if (y == null) { if (g) g.style.display = 'none'; return; }
  if (!g) { g = document.createElement('div'); g.className = 'snap-guide'; content.appendChild(g); }
  g.style.top = y + 'px'; g.style.display = 'block';
}

// ── reordenar blocos (alça estilo Notion) + mover imagem entre as colunas ─────
// geometria da gutter Notion: [+][dragger] | bloco — botões 16×16, alinhados ao meio do bloco
// H_PAD 10 = 6+4 (dragger 4px mais à esquerda, longe das alças da tabela)
// H_GAP 0 = sem vão entre o “+” e o dragger — canônico em ui-handles.HANDLE_GEOM
const H_BTN = HANDLE_GEOM.H_BTN, H_GAP = HANDLE_GEOM.H_GAP, H_PAD = HANDLE_GEOM.H_PAD;
const H_GUTTER = HANDLE_GEOM.H_GUTTER;
// ícone de UI Ionicons (viewBox 512) em currentColor, centrado no botão
const uiIco = (key, size = 12, style = 'outline') =>
  iconSvg(key, { x: 0, y: 0, w: size, h: size }, 'currentColor', 1.8, style, true)
    .replace(/ x="0" y="0"/, '');

// undo/redo: ion-icon name="arrow-undo" / "arrow-redo" (solid) — iguais no criador de gráficos
{
  const u = document.getElementById('btnUndo');
  const r = document.getElementById('btnRedo');
  if (u) u.innerHTML = uiIco('arrow-undo', 16, 'solid');
  if (r) r.innerHTML = uiIco('arrow-redo', 16, 'solid');
}

initPreviewToc();   // botão list-outline do índice flutuante (precisa de uiIco)

// alças Notion — DOM/ícones/menu de ui-handles.js (domain drag/add fica no app)
const menuIco = (key) =>
  iconSvg(key, { x: 0, y: 0, w: 16, h: 16 }, 'currentColor', 1.8, 'outline', true)
    .replace(/ x="0" y="0"/, '');
const blockHandles = createBlockHandles({
  // app liga pointer/add (cover vs miolo); menu canônico
  wireAdd: false,
  wireHandle: false,
  wireMenu: true,
  onMenuAction({ action, id }) {
    if (action === 'dup') duplicateBlock(id);
    else if (action === 'del') deleteBlockById(id);
  },
});
const bhandle = blockHandles.bhandle;
const badd = blockHandles.badd;
const bmenu = blockHandles.bmenu;
let bmenuId = null;
function closeBlockMenu() {
  blockHandles.closeMenu();
  bmenuId = null;
}
function openBlockMenu(id, anchorEl) {
  bmenuId = id;
  blockHandles.openMenu(id, anchorEl);
}
// seleciona o bloco ao interagir com a alça (hover → click no gap não “perde” o alvo)
function selectBlockFromHandle(id) {
  const b = blockOf(id); if (!b) return;
  clearIdxFocus();
  state.activeId = id;
  lastCoverKind = null;
  if (b.type === 'image' || b.type === 'divider' || b.type === 'pagebreak') {
    setImgSel(id);
  } else {
    if (state.sel) {
      state.sel = null;
      pagesEl.querySelectorAll('.imgsel, .divsel, .pbsel, .cover-sel').forEach(el => el.classList.remove('imgsel', 'divsel', 'pbsel', 'cover-sel'));
      closeImgPanel(); closeCoverPanel();
    }
    paintActiveBlock(id);
    syncTypeUI(b.type);
    setSegment('conteudo');
    syncColUI();
    updateCalloutBar();
    if (b.type === 'table') tablePanelDismissed = false;
    if (b.type === 'image-grid') imageGridPanelDismissed = false;
    if (b.type === 'table-grid') tableGridPanelDismissed = false;
    if (TEXT_PLACE_TYPES.has(b.type)) textPlacePanelDismissed = false;
    // não fechar o painel de ícone de título (bug: close antes de updateHeadBar)
    if (b.type === 'icon' || HEAD_TYPES.has(b.type)) {
      if (HEAD_TYPES.has(b.type)) updateHeadBar();
      else openIconBlockPanel();
    } else {
      closeIconBlockPanel();
    }
    updateTableBar();
    updateImageGridBar();
    updateTableGridBar();
    updateTextPlaceBar();
    showHandleAtFocused();
  }
}
function duplicateBlock(id) {
  if (findCoverItem(id)) return duplicateCoverItem(id);
  const i = idxOf(id); if (i < 0) return;
  const src = state.doc.blocks[i];
  // clone profundo (tabela.rows, image.src, callout…) + id novo
  const copy = structuredClone(src);
  copy.id = uid();
  state.doc.blocks.splice(i + 1, 0, copy);
  state.activeId = copy.id;
  state.sel = null;
  render({ id: copy.id, role: 'block', offset: 0 });
}
function deleteBlockById(id) {
  if (findCoverItem(id)) return deleteCoverItem(id);
  const i = idxOf(id); if (i < 0) return;
  state.doc.blocks.splice(i, 1);
  if (!state.doc.blocks.length) state.doc.blocks.push(mkBlock('p', ''));
  if (state.sel === id) state.sel = null;
  state.activeId = state.doc.blocks[Math.min(i, state.doc.blocks.length - 1)].id;
  closeImgPanel(); closeCoverPanel();
  render({ id: state.activeId, role: 'block', offset: 0 });
}
// menu listeners: createBlockHandles({ wireMenu: true })

const dropLine = document.createElement('div');
dropLine.id = 'dropline'; dropLine.hidden = true;
document.body.appendChild(dropLine);
// handlePending: pointerdown na alça sem mover ainda — click = menu, arraste = reordenar
let handleFor = null, handlePending = null, bdrag = null, cdrag = null;

const GAP_CV = 10;   // folga mínima entre blocos da capa (anti-sobreposição)
// blocos da capa colidem se as faixas X (colunas) se cruzam
function coverXOverlap(a, b) {
  const A = coverColBox(a.span || 'full'), B = coverColBox(b.span || 'full');
  return A.left < B.left + B.width && B.left < A.left + A.width;
}
// mudou a ALTURA de um item da capa (ex.: arrastou o Tamanho da fonte) → empurra pra baixo (ou
// puxa pra cima) os vizinhos da MESMA faixa X que vinham depois dele, pelo delta de altura —
// senão o texto cresce por cima do próximo item. Mesmo critério de colisão (coverXOverlap) do
// arraste; aqui não precisa resolver sobreposição, só deslocar quem já estava abaixo.
function coverPushPull(cov, item, deltaH) {
  if (!deltaH) return;
  for (const other of cov.items) {
    if (other === item || !coverXOverlap(other, item)) continue;
    if ((other.y || 0) <= (item.y || 0)) continue;   // só quem vem DEPOIS (abaixo) desce/sobe junto
    other.y = Math.max(0, (other.y || 0) + deltaH);
    const node = pagesEl.querySelector(`.cover-item[data-cid="${other.id}"]`);
    if (node) node.style.top = other.y + 'px';
  }
  layoutCoverColAdds();
}
// bloco que a alça ancora quando nada está sob o mouse: o que está EM FOCO
function focusedHandleTarget() {
  if (state.sel) {
    const c = pagesEl.querySelector(`.cover-item[data-cid="${state.sel}"]`);
    if (c) return { el: c, kind: 'cover', id: state.sel };
  }
  if (state.activeId) {
    // envelope do bloco (frag / check / callout / tabela / figure / rimg) — altura TOTAL
    const b = pagesEl.querySelector(
      `.col-left > [data-id="${state.activeId}"], .col-right > [data-id="${state.activeId}"]`
    );
    if (b) return { el: b, kind: 'miolo', id: state.activeId };
  }
  return null;
}
// hit-test: bloco sob o cursor OU gutter à esquerda (onde ficam +/dragger) —
// sem isso, ao sair do bloco pro botão o mousemove “perde” o hover e os botões somem.
function hitHandleTarget(clientX, clientY) {
  const under = document.elementFromPoint(clientX, clientY);
  if (under) {
    if (under.closest('#bhandle') || under.closest('#badd') || under.closest('#bmenu')) {
      return handleFor ? { el: handleFor._el || null, kind: handleFor.kind, id: handleFor.id, sticky: true } : null;
    }
    const cov = under.closest('.cover-item');
    if (cov) return { el: cov, kind: 'cover', id: cov.dataset.cid };
    const blk = under.closest('.col-left > [data-id], .col-right > [data-id]');
    if (blk) return { el: blk, kind: 'miolo', id: blk.dataset.id };
  }
  // gutter à esquerda de cada bloco do miolo (faixa dos botões + folga)
  for (const el of pagesEl.querySelectorAll('.col-left > [data-id], .col-right > [data-id]')) {
    const r = el.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom
      && clientX >= r.left - H_GUTTER - 4 && clientX < r.left + 2) {
      return { el, kind: 'miolo', id: el.dataset.id };
    }
  }
  for (const el of pagesEl.querySelectorAll('.cover-item')) {
    const r = el.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom
      && clientX >= r.left - H_GUTTER - 4 && clientX < r.left + 2) {
      return { el, kind: 'cover', id: el.dataset.cid };
    }
  }
  return null;
}
// Coluna direita = modelo da imagem: item absoluto com Y livre + cadeado no texto da
// esquerda. Sem alça Notion nem "+" — reordenar o fluxo não se aplica; pra voltar pro
// fluxo, arrasta o item de volta pra coluna esquerda (pointerup do .rimg).
function isRightPlacement(id) {
  const b = id && blockOf(id);
  return !!(b && placementOf(b) === 'right');
}
function placeHandle(t) {
  if (!t || !t.el) {
    // sticky: se veio de cima dos botões sem _el fresco, re-resolve o envelope
    if (t && t.sticky && t.id) {
      const el = t.kind === 'cover'
        ? pagesEl.querySelector(`.cover-item[data-cid="${t.id}"]`)
        : pagesEl.querySelector(`.col-left > [data-id="${t.id}"], .col-right > [data-id="${t.id}"]`);
      if (el) t = { el, kind: t.kind, id: t.id };
      else { bhandle.hidden = true; badd.hidden = true; handleFor = null; return; }
    } else {
      bhandle.hidden = true; badd.hidden = true; handleFor = null; return;
    }
  }
  // miolo na coluna direita: sem ⠿ / + (igual imagem)
  if (t.kind === 'miolo' && isRightPlacement(t.id)) {
    bhandle.hidden = true; badd.hidden = true; handleFor = null; return;
  }
  handleFor = { kind: t.kind, id: t.id, _el: t.el };
  const r = t.el.getBoundingClientRect();
  // eixo vertical = centro do bloco; botões 20px alinhados entre si
  // [+] [gap] [⠿] [pad] | bloco
  const midY = r.top + r.height / 2;
  const dragLeft = r.left - H_PAD - H_BTN;
  const addLeft = dragLeft - H_GAP - H_BTN;
  bhandle.style.left = dragLeft + 'px';
  bhandle.style.top = midY + 'px';
  bhandle.hidden = false;
  // + Notion: miolo E capa/contracapa (mesma alça; o click decide insertCover vs insert miolo)
  badd.style.left = addLeft + 'px';
  badd.style.top = midY + 'px';
  badd.hidden = false;
}
const showHandleAtFocused = () => {
  if (idxFocus) { bhandle.hidden = true; badd.hidden = true; handleFor = null; return; }
  if (!bdrag && !cdrag && !drag && !handlePending) placeHandle(focusedHandleTarget());
};

// document (não só #pages): +/dragger moram no body — saindo do bloco pro botão
// o mouseleave do pages sumia com os controles. Gutter hit-test cobre o caminho.
document.addEventListener('mousemove', (e) => {
  if (bdrag || drag || cdrag || handlePending) return;
  if (idxFocus) return;
  const hov = hitHandleTarget(e.clientX, e.clientY);
  placeHandle(hov || focusedHandleTarget());
});

// alça: click = seleciona + menu Duplicar/Remover; arrastar = reordenar / capa Y
bhandle.addEventListener('pointerdown', (e) => {
  if (!handleFor) return;
  e.preventDefault();
  e.stopPropagation();
  closeBlockMenu();
  if (handleFor.kind === 'miolo') selectBlockFromHandle(handleFor.id);
  handlePending = {
    kind: handleFor.kind, id: handleFor.id,
    x: e.clientX, y: e.clientY, pointerId: e.pointerId,
  };
});
function beginHandleDrag(p) {
  bhandle.style.pointerEvents = 'none'; document.body.classList.add('grabbing');
  if (p.kind === 'cover') {
    const f = findCoverItem(p.id); if (!f) return;
    cdrag = { id: p.id, item: f.item, startY: p.y, startTop: f.item.y || 0, z: currentZoom() };
    selectCoverItem(p.id);
  } else {
    bdrag = { id: p.id, target: null };
  }
}
// "+" Notion: mousedown não rouba seleção; click insere parágrafo depois e abre o slash
badd.addEventListener('mousedown', (e) => e.preventDefault());
badd.addEventListener('click', (e) => {
  e.preventDefault(); e.stopPropagation();
  if (!handleFor) return;
  if (handleFor.kind === 'miolo') insertAfterWithSlash(handleFor.id);
  else if (handleFor.kind === 'cover') {
    const f = findCoverItem(handleFor.id);
    if (f) insertCoverWithSlash(coverKindOf(f.cov), handleFor.id);
  }
});
// row "+" no fim da coluna esquerda (miolo) OU da área da capa/contracapa
pagesEl.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('.col-add-btn');
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  const coverAdd = btn.closest('.col-add[data-cover]');
  if (coverAdd) {
    insertCoverWithSlash(coverAdd.dataset.cover, null);
    return;
  }
  const col = btn.closest('.col-left');
  const blocks = col ? [...col.querySelectorAll(':scope > [data-id]')] : [];
  const last = blocks[blocks.length - 1];
  insertAfterWithSlash(last ? last.dataset.id : null);
});
// trilha E: a própria barra de quebra inicia o MESMO bdrag do #bhandle — mirar a alça ⠿
// fininha numa barra larga é ruim. O pointermove/pointerup globais já cuidam do resto.
pagesEl.addEventListener('pointerdown', (e) => {
  const bar = e.target.closest && e.target.closest('.e-pbreak');
  if (!bar || !bar.dataset.id) return;
  e.preventDefault();
  // bug: o preventDefault acima suprime o 'mousedown' sintético que viria em seguida (é ele
  // quem seleciona bloco/divisor/imagem no listener de mousedown mais abaixo) — sem selecionar,
  // Backspace/Delete não tinha o quê remover. Some junto o blur NATIVO que um clique normal
  // daria no texto em edição, então também tira o foco daqui à mão — sem isso o Backspace batia
  // no guard "está editando" mesmo com o pagebreak já selecionado.
  document.activeElement?.blur();
  setImgSel(bar.dataset.id);
  document.body.classList.add('grabbing');
  bdrag = { id: bar.dataset.id, target: null };
});
const COVER_AREA_H = PAGE_H - 40 - 40;            // capa: área com padding vertical 40px
const HANDLE_DRAG_PX = 5;                         // abaixo disso = click (menu); acima = arraste
document.addEventListener('pointermove', (e) => {
  // alça: se moveu o suficiente, promove o pending a drag real
  if (handlePending && !bdrag && !cdrag) {
    const dx = e.clientX - handlePending.x, dy = e.clientY - handlePending.y;
    if (Math.hypot(dx, dy) >= HANDLE_DRAG_PX) {
      const p = handlePending; handlePending = null;
      beginHandleDrag(p);
    }
  }
  if (cdrag) {
    const node = pagesEl.querySelector(`.cover-item[data-cid="${cdrag.id}"]`);
    const h = node ? node.offsetHeight : 0;
    const dy = (e.clientY - cdrag.startY) / (cdrag.z || 1);
    let y = Math.min(Math.max(0, cdrag.startTop + dy), Math.max(0, COVER_AREA_H - h));
    // snap anti-sobreposição: não cruza blocos da mesma faixa X; encosta com folga
    const cov = findCoverItem(cdrag.id)?.cov;
    if (cov) {
      const others = cov.items.filter(it => it.id !== cdrag.id && coverXOverlap(it, cdrag.item))
        .map(it => { const n = pagesEl.querySelector(`.cover-item[data-cid="${it.id}"]`); return { top: it.y || 0, h: n ? n.offsetHeight : 0 }; });
      for (const o of others) {
        if (y < o.top + o.h + GAP_CV && y + h > o.top - GAP_CV) {   // sobreposição → encosta no vizinho
          const above = o.top - GAP_CV - h, below = o.top + o.h + GAP_CV;
          y = Math.abs(y - above) <= Math.abs(y - below) ? above : below;
        }
      }
      y = Math.min(Math.max(0, y), Math.max(0, COVER_AREA_H - h));
    }
    cdrag.item.y = Math.round(y);
    if (node) node.style.top = cdrag.item.y + 'px';
    layoutCoverColAdds();
    return;
  }
  if (!bdrag) return;
  bdrag.target = dropTargetAt(e.clientX, e.clientY);
  showDrop(bdrag.target);
});
document.addEventListener('pointerup', () => {
  // click na alça (sem arrastar): já selecionou no pointerdown; abre menu no miolo
  if (handlePending) {
    const p = handlePending; handlePending = null;
    // miolo e capa: click na alça = menu Duplicar/Remover (arraste já foi promovido acima)
    if (p.kind === 'miolo' || p.kind === 'cover') openBlockMenu(p.id, bhandle);
    return;
  }
  if (cdrag) { cdrag = null; bhandle.style.pointerEvents = ''; bhandle.hidden = true; badd.hidden = true; document.body.classList.remove('grabbing'); save(); scheduleCommit(); return; }
});
document.addEventListener('pointerup', () => {
  if (!bdrag) return;
  const { id, target } = bdrag; bdrag = null;
  bhandle.style.pointerEvents = ''; bhandle.hidden = true; badd.hidden = true; dropLine.hidden = true;
  document.body.classList.remove('grabbing');
  if (target) applyDrop(id, target);
});

// onde soltar? sobre a coluna direita → imagem à direita; senão, antes/depois do bloco mais próximo
function dropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.closest) return null;
  const colR = el.closest('.col-right');
  if (colR) { const p = colR.closest('.page'); return p && p.dataset.page != null ? { kind: 'right', page: +p.dataset.page } : null; }
  const page = el.closest('.page');
  if (!page || page.dataset.cover || page.querySelector('.idx-content')) return null;   // só miolo
  const blocks = [...pagesEl.querySelectorAll('.col-left > [data-id]')];
  if (!blocks.length) return null;
  let ref = null, before = true, bestD = Infinity;
  for (const bl of blocks) {
    const r = bl.getBoundingClientRect();
    const mid = r.top + r.height / 2, d = Math.abs(y - mid);
    if (d < bestD) { bestD = d; ref = bl; before = y < mid; }
  }
  // el vai junto do refId: um bloco continuado tem DOIS elementos com o mesmo data-id (um por
  // página), e procurar por seletor depois desenharia a linha no pedaço errado.
  return ref ? { kind: 'left', refId: ref.dataset.id, before, el: ref } : null;
}
function showDrop(t) {
  if (!t || t.kind !== 'left') { dropLine.hidden = true; return; }
  const el = t.el || pagesEl.querySelector(`.col-left > [data-id="${t.refId}"]`);
  if (!el) { dropLine.hidden = true; return; }
  const r = el.getBoundingClientRect();
  dropLine.style.left = r.left + 'px'; dropLine.style.width = r.width + 'px';
  dropLine.style.top = (t.before ? r.top : r.bottom) + 'px';
  dropLine.hidden = false;
}
// move o bloco `id` para o alvo (reordena no fluxo ou joga pra coluna direita)
function applyDrop(id, t) {
  const b = blockOf(id); if (!b || !t) return;
  if (t.kind === 'right') {
    if (b.type === 'pagebreak') return;            // quebra de página é do fluxo, não tem coluna
    b.placement = 'right'; if (b.y == null) b.y = 0; b.page = t.page;
    render(); return;
  }
  if (t.refId === id) return;                      // soltou em si mesmo
  const from = idxOf(id);
  // voltando pro fluxo: APAGA o placement em vez de cravar 'inline' — assim o bloco
  // recupera o default do tipo (H1–H4/tabela voltam pra largura total, o resto pra esquerda).
  if (placementOf(b) === 'right') { delete b.placement; delete b.y; delete b.page; delete b.anchor; }
  const [moved] = state.doc.blocks.splice(from, 1);
  const ri = idxOf(t.refId);
  const at = ri < 0 ? state.doc.blocks.length : (t.before ? ri : ri + 1);
  state.doc.blocks.splice(at, 0, moved);
  render();
}

function currentZoom() {
  const m = /scale\(([\d.]+)\)/.exec(pagesEl.style.transform);
  return m ? +m[1] : 1;
}

// ─────────────────────────── painel flutuante da imagem selecionada ─────────
// ícones +/− dos botões Título/Legenda (16×16, currentColor — mesmo padrão fino
// dos SVGs de #blocktypes): "+" quando ainda não existe, "−" quando já existe
// (o botão vira "remover"). Texto do label fica só "Título"/"Legenda" (t1).
const PLUS_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>';
const MINUS_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 8h10"/></svg>';
// cadeado fechado (travada) / aberto (solta) — botão que prende a imagem da direita a um
// bloco da coluna esquerda (ver nearestByTop/leftBlocksOnPage acima de buildRight).
const LOCK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
const UNLOCK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5-1.2"/></svg>';
// ion-icon name="trash-outline" — botões "Remover" (painel imagem/texto, link, rmbg)
const TRASH_ICO = uiIco('trash', 16, 'outline');
// ion-icon name="repeat-outline" — botão "Substituir" (troca a arte, mantém título/legenda)
const REPLACE_ICO = uiIco('repeat', 16, 'outline');
// ion-icon name="create-outline" — editar dados do gráfico/timeline (mesmo do criador)
const CREATE_ICO = uiIco('create', 16, 'outline');
let imgPanel;
function openImgPanel() {
  const b = blockOf(state.sel);
  if (!b || b.type !== 'image') return;
  closeTablePanel();
  closeImageGridPanel();
  closeTableGridPanel();
  if (!imgPanel) {
    imgPanel = document.createElement('div');
    imgPanel.id = 'imgPanel';
    document.body.appendChild(imgPanel);
  }
  const radius = b.radius ?? 4;
  // slider fica no range “fino” (0–24); valor > 24 vem digitar no número ao lado de px
  const RADIUS_SLIDER_MAX = 24;
  const scalePct = imgScalePct(b);
  const scaleLabel = fmtImgScalePct(scalePct);
  const rot = rotateOf(b);
  const rotateSnaps = ROTATE_SNAPS.join(',');
  // largura da coluna onde a imagem está (mesma regra de buildFigure/buildRight)
  const figColW = placementOf(b) === 'full' ? COL_FULL : placementOf(b) === 'right' ? colR() : colL();
  // travar exige um bloco do FLUXO que comece nesta página. Uma página que só mostra a
  // continuação de um parágrafo (bloco cortado) não tem âncora possível: o _top do bloco vive
  // na página onde ele começou, e ancorar ali jogaria a imagem de volta pra lá. Sem candidato,
  // o botão fica desabilitado em vez de virar um clique que não faz nada.
  const travavel = !!b.anchor || leftBlocksOnPage(b.page | 0).length > 0;
  imgPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">${b.chart ? (b.chart.kind === 'timeline' ? 'Linha do tempo' : 'Gráfico') : 'Imagem'}</div>
    <div class="row img-tc-row">
      <button type="button" class="fieldbtn" data-a="title">${b.title != null ? MINUS_SVG : PLUS_SVG}<span>Título</span></button>
      <button type="button" class="fieldbtn" data-a="caption">${b.caption != null ? MINUS_SVG : PLUS_SVG}<span>Legenda</span></button>
    </div>
    <div class="field">Posição<div data-slot="col"></div></div>
    ${placementOf(b) === 'right' ? `<button type="button" class="fieldbtn" data-a="lock"${travavel ? '' : ' disabled title="Esta página não tem bloco de texto próprio para prender a imagem (só a continuação de um parágrafo que começa numa página anterior)."'}>${b.anchor ? UNLOCK_SVG : LOCK_SVG}<span>${b.anchor ? 'Destravar' : 'Travar no texto'}</span></button>` : ''}
    <label class="field"><span class="field-row">Escala <span class="field-val"><span data-role="scalev">${scaleLabel}</span>%<button type="button" class="resetbtn" data-a="scalereset" title="Redefinir para 100% (ocupa a coluna)">↺</button></span></span>
      <input type="range" data-a="scale" min="10" max="100" step="${IMG_SCALE_STEP}" value="${scalePct}" data-snaps="10,25,50,75,100">
    </label>
    <div data-role="scale-opts">
      <div class="field">Alinhamento<div data-slot="imgalign"></div></div>
      <div class="swrow" title="Define a largura máxima do título e da legenda pela largura da imagem">
        <span>Texto na largura da imagem</span>
        <button type="button" class="sw" data-a="capfit" role="switch" aria-checked="${b.capFit ? 'true' : 'false'}"></button>
      </div>
    </div>
    <label class="field" title="Giro plano da foto. Digite o ângulo ou arraste; Shift = sem ímã (ajuste fino)"><span class="field-row">Rotação <span class="field-val"><span data-role="rotatev">${rot}</span>°<button type="button" class="resetbtn" data-a="rotatereset" title="Sem rotação">↺</button></span></span>
      <input type="range" data-a="rotate" min="-180" max="180" step="1" value="${rot}" data-snaps="${rotateSnaps}">
    </label>
    <label class="field"><span class="field-row">Cantos (raio) <span class="field-val"><span data-role="radv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric" title="Clique para digitar">${radius}</span>px<button type="button" class="resetbtn" data-a="radiusreset" title="Redefinir para 4px">↺</button></span></span>
      <input type="range" data-a="radius" min="0" max="${RADIUS_SLIDER_MAX}" step="1" value="${Math.min(radius, RADIUS_SLIDER_MAX)}" data-snaps="0,4,8,12,16,24" data-edit="off">
    </label>
    ${b.chart ? `<button type="button" class="fieldbtn" data-a="chart">${CREATE_ICO}<span>Editar dados</span></button>` : ''}
    <button type="button" class="fieldbtn" data-a="replace">${REPLACE_ICO}<span>Substituir</span></button>
    <button type="button" class="fieldbtn danger" data-a="del">${TRASH_ICO}<span>Remover</span></button>`;
  imgPanel.hidden = false;
  // seletor de coluna (MESMO segment de ícone do popover de Texto da capa): imagem usa 'inline'/'full'/'right'
  imgPanel.querySelector('[data-slot="col"]').append(
    widthSeg(placementOf(b), [
      { val: 'inline', label: 'Coluna Esquerda', icon: COL_ICON.left },
      { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
      { val: 'right', label: 'Coluna Direita', icon: COL_ICON.right },
    ], (v) => {
      // sair da direita larga a âncora: o paginate só limpa anchor de quem AINDA é 'right',
      // então sem isso a âncora velha ficaria dormindo e teleportaria a imagem ao voltar.
      b.placement = v; if (v === 'right') { if (b.y == null) b.y = 0; } else delete b.anchor;
      render(); if (state.sel) openImgPanel();
    }));
  // opções de scale < 100%: alinhamento + texto na largura da imagem (reveal ao soltar o thumb)
  const scaleOpts = imgPanel.querySelector('[data-role="scale-opts"]');
  // estado inicial (instantâneo no 1º paint do nó; anima no `change` do slider)
  setSidebarReveal(scaleOpts, scalePct < 100);
  const alignSlot = imgPanel.querySelector('[data-slot="imgalign"]');
  const liveFig = () => pagesEl.querySelector(`figure[data-id="${b.id}"]`);
  const mountAlignSeg = () => {
    if (!alignSlot) return;
    alignSlot.replaceChildren(widthSeg(imgAlignOf(b), [
      { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
      { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
    ], (v) => {
      b.imgAlign = v === 'center' ? 'center' : 'left';
      if (b.imgAlign === 'left') delete b.imgAlign; // default = esquerda; não polui o JSON
      applyFigureLayout(liveFig(), b, figColW);
      save(); scheduleCommit();
      mountAlignSeg(); // re-marca o segment sem rebuild do painel (preserva a transição do reveal)
    }));
  };
  mountAlignSeg();
  // reset (t4) não pode roubar foco/seleção no mousedown — mesmo padrão do resto do app (ex. fmtbar)
  imgPanel.querySelectorAll('.resetbtn').forEach(btn => btn.addEventListener('mousedown', (e) => e.preventDefault()));
  // raio: digitável com max > max do slider (círculo perfeito até metade da página) —
  // data-edit=off no range; wireFieldEditKeys cobre clique/Enter/Escape (sem quebrar linha).
  const radv = imgPanel.querySelector('[data-role="radv"]');
  const scalev = imgPanel.querySelector('[data-role="scalev"]');
  const parseRadius = (raw) => {
    const n = Math.round(Number(String(raw ?? '').replace(/[^\d.-]/g, '')));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(Math.floor(PAGE_W / 2), n));
  };
  const paintRadius = (n, { syncText = true } = {}) => {
    b.radius = n;
    const img = pagesEl.querySelector(`figure[data-id="${b.id}"] img`);
    if (img) img.style.borderRadius = n + 'px';
    if (syncText && document.activeElement !== radv) radv.textContent = String(n);
    const range = imgPanel.querySelector('input[data-a="radius"]');
    if (range) range.value = Math.min(n, RADIUS_SLIDER_MAX);
    save(); scheduleCommit();
  };
  // escala: no arraste só width/height (fluido); reflow/página no `change`
  // (soltar o thumb OU fim do delay da digitação — ver range-snap data-edit-delay).
  // aceita decimais (step 0.1); digitação com "." ou "," via range-snap.
  const paintScale = (pct) => {
    const n = imgScalePct({ scale: +pct || 100 });
    b.scale = n;
    if (n >= 100) delete b.scale; // default = ocupa a coluna; não polui o JSON
    applyFigureLayout(liveFig(), b, figColW);
    // coluna direita: se a imagem cresceu de volta, re-clampa y pra não vazar da página
    if (placementOf(b) === 'right') {
      const wrap = pagesEl.querySelector(`.rimg[data-id="${b.id}"]`);
      if (wrap) {
        const maxY = Math.max(0, CONTENT_H - wrap.offsetHeight);
        if ((b.y | 0) > maxY) { b.y = maxY; wrap.style.top = maxY + 'px'; }
      }
    }
    if (scalev && document.activeElement !== scalev) scalev.textContent = fmtImgScalePct(n);
    const range = imgPanel.querySelector('input[data-a="scale"]');
    if (range && document.activeElement !== range) range.value = String(n);
    save(); scheduleCommit();
  };
  // rotação: ao vivo no <img>. ímã 0/15/45/… no arraste; digitação e Shift = livre
  // (sem isto, digitar 3 colava em 0 por ROTATE_SNAP_THRESH=4). 0 apaga o campo.
  const paintRotate = (n) => {
    const range = imgPanel.querySelector('input[data-a="rotate"]');
    const free = isFreeSnap(range);
    setBlockRotate(b, free ? clampRotate(n) : snapRotate(n));
    const r = rotateOf(b);
    const img = liveFig()?.querySelector('img');
    applyImgRotate(img, b);
    const v = imgPanel.querySelector('[data-role="rotatev"]');
    // não sobrescreve enquanto digita (caret / rascunho "3" no meio de "30")
    if (v && document.activeElement !== v) v.textContent = String(r);
    if (range && document.activeElement !== range) range.value = String(r);
    save(); scheduleCommit();
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
        paintRadius(n == null ? (b.radius ?? 4) : n, { syncText: true });
        radv.textContent = String(b.radius ?? 4);
      },
      onCancel: () => {
        radv.textContent = String(b.radius ?? 4);
        paintRadius(b.radius ?? 4, { syncText: true });
      },
    });
  }
  enhanceAll(imgPanel);
  positionImgPanel();

  imgPanel.querySelectorAll('button[data-a],select[data-a],input[data-a]').forEach(el => {
    const ev = el.tagName === 'SELECT' ? 'change' : el.type === 'range' ? 'input' : 'click';
    el.addEventListener(ev, () => {
      const a = el.dataset.a;
      if (a === 'radius' || a === 'radiusreset') {   // sem re-render: mantém o arraste do slider fluido
        paintRadius(a === 'radiusreset' ? 4 : +el.value);   // 4 = mesmo default de `b.radius ?? 4` (t4)
        return;
      }
      if (a === 'scale' || a === 'scalereset') {
        paintScale(a === 'scalereset' ? 100 : +el.value);
        // reset não dispara `change` do range — reflow/página na mão
        if (a === 'scalereset') {
          setSidebarReveal(scaleOpts, false);
          render(); // fluxo: pode mudar de página; direita: reconstrói clamp de altura
          if (state.sel) openImgPanel();
        }
        return;
      }
      if (a === 'rotate' || a === 'rotatereset') {
        paintRotate(a === 'rotatereset' ? 0 : +el.value);
        return;
      }
      // switcher: título/legenda com max-width = largura da imagem (só relevante com scale < 100%)
      if (a === 'capfit') {
        const on = el.getAttribute('aria-checked') !== 'true';
        el.setAttribute('aria-checked', String(on));
        if (on) b.capFit = true; else delete b.capFit;
        applyFigureLayout(liveFig(), b, figColW);
        save(); scheduleCommit();
        // reflow do texto pode mudar a altura no fluxo
        if (placementOf(b) !== 'right') render();
        positionImgPanel();
        return;
      }
      // reabre o editor com o spec guardado; o import de volta troca a arte deste mesmo bloco
      if (a === 'chart') { chartEditId = b.id; chartTargetPage = b.page | 0; closeImgPanel(); openChartModal(b.chart.kind, b.chart.spec); return; }
      // troca só o arquivo (src/dimensões); título, legenda, posição, raio e âncora ficam
      if (a === 'replace') { replaceImageId = b.id; document.getElementById('imgfile').click(); return; }
      if (a === 'title') b.title = b.title != null ? null : '';
      else if (a === 'caption') b.caption = b.caption != null ? null : '';
      else if (a === 'lock') { toggleBlockLock(b.id); return; }  // sidebar e painel compartilham a mesma âncora
      else if (a === 'del') { state.doc.blocks.splice(idxOf(b.id), 1); state.sel = null; closeImgPanel(); }
      render(); if (state.sel) openImgPanel();
    });
  });
  // soltar o thumb OU fim do delay da digitação: reveal + re-pagina (pode mudar de página)
  const scaleRange = imgPanel.querySelector('input[data-a="scale"]');
  if (scaleRange) {
    scaleRange.addEventListener('change', () => {
      // mesma transição de altura+opacity da sidebar — só no commit (não no `input` do arraste)
      setSidebarReveal(scaleOpts, imgScalePct(b) < 100);
      // re-pagina sem openImgPanel: rebuild do painel mataria o reveal / o caret da digitação.
      // Fluxo (inline/full): altura nova pode empurrar a imagem pra outra página.
      // Direita: rebuild reclampa y com a altura nova.
      render();
      positionImgPanel();
    });
  }
}
function positionImgPanel() {
  if (!imgPanel || imgPanel.hidden) return;
  const el = pagesEl.querySelector(`.rimg[data-id="${state.sel}"]`) || pagesEl.querySelector(`figure[data-id="${state.sel}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = imgPanel.offsetWidth || 220, ph = imgPanel.offsetHeight || 200;
  let x = r.right + 10; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  imgPanel.style.left = x + 'px'; imgPanel.style.top = y + 'px';
}
function closeImgPanel() { if (imgPanel) imgPanel.hidden = true; }

// ── camadas da coluna direita (botão direito) ───────────────────────────────
// Só quando há >1 elemento `placement=right` na MESMA página. Ordem no array
// entre esses rights = trás → frente (último pinta por cima; z-index no render).
function rightBlocksOnPage(page) {
  const p = page | 0;
  return (state.doc.blocks || []).filter(
    (b) => b && b.type !== 'pagebreak' && placementOf(b) === 'right' && (b.page | 0) === p,
  );
}
/** Rótulo curto pro menu de camadas. */
function rightLayerLabel(b) {
  if (!b) return 'Bloco';
  if (b.type === 'image') {
    const t = stripHtml(b.title || '').replace(/\s+/g, ' ').trim();
    if (t) return t.length > 32 ? t.slice(0, 31) + '…' : t;
    if (b.chart?.kind === 'timeline') return 'Linha do tempo';
    if (b.chart) return 'Gráfico';
    return 'Imagem';
  }
  if (b.type === 'icon') return 'Ícone';
  if (b.type === 'table') return 'Tabela';
  if (b.type === 'image-grid') return 'Grid de imagens';
  if (b.type === 'table-grid') return 'Grid de tabelas';
  if (b.type === 'callout') return 'Callout';
  if (HEAD_TYPES.has(b.type)) return b.type.toUpperCase();
  const raw = stripHtml(b.html || '').replace(/\s+/g, ' ').trim();
  if (raw) return raw.length > 32 ? raw.slice(0, 31) + '…' : raw;
  const map = { p: 'Parágrafo', caption: 'Legenda', quote: 'Citação', li: 'Lista', ol: 'Lista', check: 'Checklist' };
  return map[b.type] || b.type || 'Bloco';
}
/** delta +1 = para a frente (depois no array), −1 = para trás. */
function nudgeRightLayer(id, delta) {
  const b = blockOf(id);
  if (!b || placementOf(b) !== 'right') return false;
  const rights = rightBlocksOnPage(b.page | 0);
  const i = rights.findIndex((r) => r.id === id);
  const j = i + (Math.trunc(+delta) || 0);
  if (i < 0 || j < 0 || j >= rights.length) return false;
  const ia = idxOf(rights[i].id);
  const ib = idxOf(rights[j].id);
  if (ia < 0 || ib < 0) return false;
  const arr = state.doc.blocks;
  const tmp = arr[ia];
  arr[ia] = arr[ib];
  arr[ib] = tmp;
  return true;
}

let rightLayerMenu = null;
function closeRightLayerMenu() {
  if (rightLayerMenu) rightLayerMenu.hidden = true;
}
function openRightLayerMenu(id, clientX, clientY) {
  const b = blockOf(id);
  if (!b || placementOf(b) !== 'right' || !editing) return;
  const page = b.page | 0;
  const rights = rightBlocksOnPage(page);
  if (rights.length < 2) return; // só com sobreposição possível

  if (!rightLayerMenu) {
    rightLayerMenu = document.createElement('div');
    rightLayerMenu.id = 'rightLayerMenu';
    rightLayerMenu.className = 'float-menu';
    document.body.appendChild(rightLayerMenu);
  }
  const i = rights.findIndex((r) => r.id === id);
  // lista UI: topo = frente (inverso do array), como Figma / Stories
  const rows = [...rights].reverse().map((r, revI) => {
    const frontRank = revI + 1; // 1 = mais na frente
    const on = r.id === id;
    return `<button type="button" class="rlm-layer${on ? ' on' : ''}" data-a="sel" data-id="${r.id}" title="${escapeHtml(rightLayerLabel(r))}">
      <span class="rlm-rank">${frontRank}</span>
      <span class="rlm-lab">${escapeHtml(rightLayerLabel(r))}</span>
      ${on ? '<span class="rlm-now">agora</span>' : ''}
    </button>`;
  }).join('');

  rightLayerMenu.innerHTML = `
    <div class="eyebrow" style="margin:0;padding:.2rem .45rem 0">Camadas · coluna direita</div>
    <button type="button" data-a="front" ${i >= rights.length - 1 ? 'disabled' : ''} title="Um nível para a frente">
      <span class="dl-label">Trazer para a frente</span>
    </button>
    <button type="button" data-a="back" ${i <= 0 ? 'disabled' : ''} title="Um nível para trás">
      <span class="dl-label">Enviar para trás</span>
    </button>
    <div class="dl-sep" role="separator"></div>
    <div class="rlm-list">${rows}</div>`;
  rightLayerMenu.hidden = false;

  const mw = rightLayerMenu.offsetWidth || 220;
  const mh = rightLayerMenu.offsetHeight || 160;
  let x = clientX;
  let y = clientY;
  if (x + mw > innerWidth - 8) x = Math.max(8, clientX - mw);
  if (y + mh > innerHeight - 8) y = Math.max(8, clientY - mh);
  rightLayerMenu.style.left = x + 'px';
  rightLayerMenu.style.top = y + 'px';

  rightLayerMenu.querySelectorAll('[data-a]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      const a = btn.dataset.a;
      if (a === 'front') {
        if (nudgeRightLayer(id, +1)) { closeRightLayerMenu(); render(); setImgSel(id); }
        return;
      }
      if (a === 'back') {
        if (nudgeRightLayer(id, -1)) { closeRightLayerMenu(); render(); setImgSel(id); }
        return;
      }
      if (a === 'sel') {
        const sid = btn.dataset.id;
        closeRightLayerMenu();
        setImgSel(sid);
      }
    });
  });
}

// botão direito no elemento da coluna direita → camadas (só se >1 na página)
pagesEl.addEventListener('contextmenu', (e) => {
  if (!editing) return;
  const wrap = e.target.closest && e.target.closest('.rimg');
  if (!wrap || !wrap.dataset.id) return;
  const id = wrap.dataset.id;
  const b = blockOf(id);
  if (!b || placementOf(b) !== 'right') return;
  if (rightBlocksOnPage(b.page | 0).length < 2) return;
  e.preventDefault();
  e.stopPropagation();
  setImgSel(id);
  openRightLayerMenu(id, e.clientX, e.clientY);
});
document.addEventListener('pointerdown', (e) => {
  if (!rightLayerMenu || rightLayerMenu.hidden) return;
  if (e.target.closest && e.target.closest('#rightLayerMenu')) return;
  closeRightLayerMenu();
}, true);
// closeTablePanel já definido junto do popover da tabela

// ─────────────────────────── menu flutuante: Imagem | Gráfico ────────────────
const addImgMenu = document.getElementById('addImgMenu');
const amChoices = addImgMenu.querySelector('.am-choices');
const amImage = addImgMenu.querySelector('.am-image');
function openAddImgMenu(e, colR) {
  state.addPage = +colR.closest('.page').dataset.page || 0;   // imagem/gráfico nasce nessa página
  replaceImageId = null;                                      // menu de inserir ≠ fluxo de substituir do painel
  amChoices.hidden = false; amImage.hidden = true;            // sempre abre na tela de escolha
  addImgMenu.hidden = false;
  const mw = addImgMenu.offsetWidth || 240, mh = addImgMenu.offsetHeight || 160;
  const x = Math.min(e.clientX, innerWidth - mw - 8);
  const y = Math.min(e.clientY, innerHeight - mh - 8);
  addImgMenu.style.left = Math.max(8, x) + 'px';
  addImgMenu.style.top = Math.max(8, y) + 'px';
}
function closeAddImgMenu() { if (addImgMenu) addImgMenu.hidden = true; }
addImgMenu.querySelector('[data-opt="image"]').addEventListener('click', () => {
  replaceImageId = null;                                      // garante insert, não replace residual
  amChoices.hidden = true; amImage.hidden = false;            // experiência atual (arquivo + posição)
});
['chart', 'timeline'].forEach((kind) =>
  addImgMenu.querySelector(`[data-opt="${kind}"]`).addEventListener('click', () => {
    chartTargetPage = state.addPage; chartEditId = null; closeAddImgMenu(); openChartModal(kind);
  }));
document.addEventListener('mousedown', (e) => {                // fecha ao clicar fora
  if (addImgMenu.hidden) return;
  if (e.target.closest('#addImgMenu') || e.target.closest('.col-right')) return;
  closeAddImgMenu();
}, true);

// Fecha TODOS os popovers flutuantes ao clicar fora (img, tabela, capa, logo, índice,
// estilo de bloco, download, menu da alça). Swatch/ico-pop e o próprio painel ficam de fora.
document.addEventListener('mousedown', (e) => {
  const t = e.target;
  if (!(t && t.closest)) return;
  // âncoras e popovers que devem permanecer abertos
  if (t.closest('#imgPanel, #tablePanel, #imageGridPanel, #tableGridPanel, #iconPanel, #textPlacePanel, #coverPanel, #logoPanel, #idxPanel, #resumoPanel, #blockStylePanel, #downloadMenu, #zoomPop, #addImgMenu, #bmenu, #fmtbar, #calloutBar, #tblCellBar, #linkedit, #rightLayerMenu')) return;
  if (t.closest('.swatch-pop, .ico-pop, .tbl-menu, .blockmenu')) return;
  if (t.closest('#btnPrint, #zoomPct, #zoomFit, #bhandle, #badd')) return;
  // imagem: clicar fora limpa a seleção (fecha o painel)
  if (state.sel && !t.closest('.rimg, figure.fig, .divider.b, .e-pbreak, .cover-item, .cover-logo-hit')) {
    setImgSel(null);
  }
  // tabela: fecha o painel sem matar o activeId (continua editável); reabre ao re-focar
  // (não fecha se o clique foi no preview de um grid de tabelas — tem .tbl-wrap interno)
  if (tablePanel && !tablePanel.hidden && !t.closest('.tbl-wrap:not(.tblgrid-preview)') && !t.closest('.tblgrid-wrap')) {
    tablePanelDismissed = true;
    closeTablePanel();
  }
  // grid de imagens: mesmo padrão da tabela
  if (imageGridPanel && !imageGridPanel.hidden && !t.closest('.imggrid-wrap')) {
    imageGridPanelDismissed = true;
    closeImageGridPanel();
  }
  // grid de tabelas
  if (tableGridPanel && !tableGridPanel.hidden && !t.closest('.tblgrid-wrap')) {
    tableGridPanelDismissed = true;
    closeTableGridPanel();
  }
  // parágrafo: painel de Largura (1/2 cols)
  if (textPlacePanel && !textPlacePanel.hidden) {
    const host = t.closest?.('[data-id]');
    const id = host?.dataset?.id;
    if (!id || id !== textPlacePanel.dataset.bid) {
      textPlacePanelDismissed = true;
      closeTextPlacePanel();
    }
  }
  if (iconPanel && !iconPanel.hidden
    && !t.closest('.icon-block')
    && !t.closest('.head-wrap')
    && !t.closest(`h1[data-id], h2[data-id], h3[data-id], h4[data-id]`)) {
    // fecha se clicou fora do painel e fora do título/bloco de ícone
    const host = t.closest?.('[data-id]');
    const id = host?.dataset?.id;
    if (!id || id !== iconPanel.dataset.bid) closeIconBlockPanel();
  }
  if (typeof closeCoverPanel === 'function') closeCoverPanel();
  if (typeof closeLogoPanel === 'function') closeLogoPanel();
  if (typeof closeIdxPanel === 'function') closeIdxPanel();
  if (typeof closeResumoPanel === 'function') closeResumoPanel();
  if (typeof closeBlockStylePanel === 'function') closeBlockStylePanel();
  if (typeof closeDownloadMenu === 'function') closeDownloadMenu();
  if (typeof closeZoomPop === 'function') closeZoomPop();
  if (typeof closeBlockMenu === 'function') closeBlockMenu();
  if (typeof closeAddImgMenu === 'function') closeAddImgMenu();
}, true);

// ─────────────────────────── modal do gráfico (iframe embed) ─────────────────
// Dois editores no mesmo modal (gráfico e linha do tempo), um iframe só: trocar
// o src recarrega o editor — por isso o kind atual fica guardado e o src só muda
// quando o kind muda (abrir/fechar o mesmo tipo não recarrega nada).
// chartEditId != null = estamos EDITANDO um bloco que já está no relatório: o
// spec vai pro iframe pelo postMessage, e o import de volta substitui o bloco em
// vez de criar outro.
const EDITOR_URL = { chart: 'graficos.html?embed=1', timeline: 'timelines.html?embed=1' };
let chartTargetPage = 0, chartEditId = null;
let cmKind = null, cmReady = false, cmPending = null;
const chartModal = document.getElementById('chartModal');
const cmFrame = document.getElementById('cmFrame');
function openChartModal(kind, spec = null) {
  if (cmKind !== kind) { cmKind = kind; cmReady = false; cmFrame.src = EDITOR_URL[kind]; }
  cmPending = spec;
  if (cmReady) sendPendingSpec();     // iframe já de pé: manda agora (senão espera o -ready)
  document.getElementById('cmTitle').textContent =
    kind === 'timeline' ? 'Montar linha do tempo' : 'Extrair / montar gráfico';
  chartModal.hidden = false;
}
function sendPendingSpec() {
  if (!cmPending) return;
  cmFrame.contentWindow.postMessage({ type: 'pdgm-chart-load', spec: cmPending }, location.origin);
  cmPending = null;
}
function closeChartModal() { chartModal.hidden = true; chartEditId = null; }
document.getElementById('cmClose').addEventListener('click', closeChartModal);
chartModal.querySelector('.cm-backdrop').addEventListener('click', closeChartModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !chartModal.hidden) closeChartModal(); });

// trilha D: import de gráfico (IA) depende de /api/convert e /api/refine, que só
// existem com o server.mjs rodando — no GitHub Pages (estático) não há backend.
// GET rápido (timeout curto) em /api/health decide: falhou (rede, 404, timeout,
// ou file://) → sem backend → esconde só a opção "Gráfico" do menu de Adicionar
// Imagem (Imagem continua normal). Sem mensagem de erro — só não oferece o que
// quebraria. AbortSignal.timeout: nativo, sem AbortController/setTimeout manual.
async function gateChartByBackend() {
  let ok = false;
  try { ok = (await fetch('/api/health', { signal: AbortSignal.timeout(1500) })).ok; }
  catch {}                                     // rede/servidor ausente ou timeout
  if (!ok) ['chart', 'timeline'].forEach((k) => { addImgMenu.querySelector(`[data-opt="${k}"]`).hidden = true; });
}
gateChartByBackend();

// recebe o SVG do gráfico/linha do tempo (postMessage do iframe) → vira imagem
// na coluna direita. O SPEC vem junto e fica guardado em b.chart: é ele que
// permite reabrir o editor depois com tudo como estava (e é ele que vai pro
// .pdgm.zip como charts/*.json — ver doc-format.js).
addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const d = e.data;
  if (d?.type === 'pdgm-chart-ready') { cmReady = true; sendPendingSpec(); return; }
  if (!d || d.type !== 'pdgm-chart-svg' || !d.svg) return;
  // O editor só canta "Importado." depois que ESTE handler confirma (pdgm-chart-ok).
  // postMessage não falha quando ninguém escuta nem quando o outro lado quebra —
  // sem o aperto de mão, uma aba velha do relatório engolia o gráfico calada.
  try {
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg);
    const chart = d.spec ? { kind: d.kind || 'chart', spec: d.spec } : null;
    const editing = chartEditId && blockOf(chartEditId);
    if (editing) {                                  // reedição: troca a arte no lugar, preserva posição/título/legenda
      editing.src = src;
      editing.nw = d.w || editing.nw; editing.nh = d.h || editing.nh;
      if (chart) editing.chart = chart;
      state.sel = editing.id;
    } else {
      const b = { id: uid(), type: 'image', src, placement: 'right', radius: 4,
        nw: d.w || 640, nh: d.h || 400, y: 0, page: chartTargetPage };
      if (chart) b.chart = chart;
      const at = state.activeId ? idxOf(state.activeId) + 1 : state.doc.blocks.length;
      state.doc.blocks.splice(at, 0, b);
      state.sel = b.id;
    }
    closeChartModal();
    e.source?.postMessage({ type: 'pdgm-chart-ok' }, e.origin);   // daqui pra frente já está no documento
    render(); openImgPanel();
    const kindLabel = (d.kind === 'timeline') ? 'Linha do tempo' : 'Gráfico';
    const title = (d.spec && d.spec.title) || d.title || '';
    showToast('ok', `${kindLabel} importado para o relatório`,
      title ? `“${title}” entrou no documento.` : 'O bloco entrou no documento.');
  } catch (err) {
    e.source?.postMessage({ type: 'pdgm-chart-fail', error: String(err.message || err) }, e.origin);
    throw err;                                      // segue aparecendo no console pra virar bug rastreável
  }
});

// ─────────────────────────── capa/contracapa + resumo: edição ────────────────
// sync do texto da capa (cover-item root ou filhos contenteditable de lista/check/callout)
pagesEl.addEventListener('input', (e) => {
  const host = e.target.closest && e.target.closest('[contenteditable]');
  if (!host) return;
  const coverEl = host.closest && host.closest('.cover-item');
  if (coverEl) {
    const f = findCoverItem(coverEl.dataset.cid);
    if (f && f.item.type !== 'table' && f.item.type !== 'image' && f.item.type !== 'divider') {
      // tabela sincroniza rows no próprio buildTableEl; imagem/divisor não têm html
      const txt = host.classList?.contains('ck-txt') || host.classList?.contains('co-txt')
        ? host
        : (coverEl.matches('[contenteditable=true]') ? coverEl : host);
      f.item.html = txt.innerHTML;
      layoutCoverColAdds();   // altura do texto pode ter mudado → realinha a zona do "+"
      save(); scheduleCommit();
    }
    return;
  }
  if (host.dataset.role === 'resumo') { state.doc.index.resumo = host.innerHTML; save(); scheduleCommit(); }
});

function selectCoverItem(cid) {
  clearIdxFocus();
  state.sel = cid;
  state.activeId = null;   // não misturar com foco do miolo
  pagesEl.querySelectorAll('.imgsel,.divsel,.cover-sel,.active-block').forEach(el => {
    el.classList.remove('imgsel', 'divsel', 'cover-sel', 'active-block');
  });
  closeImgPanel(); closeLogoPanel(); closeTablePanel(); closeTableGridPanel();
  const el = pagesEl.querySelector(`.cover-item[data-cid="${cid}"]`);
  if (el) el.classList.add('cover-sel');
  openCoverPanel();
  const f = findCoverItem(cid);
  if (f) {
    lastCoverKind = coverKindOf(f.cov);
    syncTypeUI(coverTypeOf(f.item));   // paleta da aba Conteúdo reflete o tipo do item
  }
  // tabela / grid na capa: reusa o painel do miolo
  if (f?.item?.type === 'table') {
    tablePanelDismissed = false;
    updateTableBar();
  }
  if (f?.item?.type === 'image-grid') {
    imageGridPanelDismissed = false;
    updateImageGridBar();
  }
  if (f?.item?.type === 'table-grid') {
    tableGridPanelDismissed = false;
    updateTableGridBar();
  }
  showHandleAtFocused();                   // alça de arraste fica visível no bloco selecionado
}

// logo da Paradigma na capa/contracapa: foco roxo + painel com as mesmas opções da tab Documento
function selectCoverLogo(kind) {
  if (!kind || !(kind === 'cover' || kind === 'back')) return;
  const lg = specialObj(kind).logo;
  if (!lg || !lg.on) return;
  clearIdxFocus();
  state.sel = logoSelOf(kind);
  state.activeId = null;
  lastCoverKind = kind;
  pagesEl.querySelectorAll('.imgsel,.divsel,.pbsel,.cover-sel,.active-block').forEach(el => {
    el.classList.remove('imgsel', 'divsel', 'pbsel', 'cover-sel', 'active-block');
  });
  closeImgPanel();
  if (coverPanel) coverPanel.hidden = true;   // não chama closeCoverPanel (fecha o logo também)
  const el = pagesEl.querySelector(`.page[data-cover="${kind}"] .cover-logo-hit`);
  if (el) el.classList.add('cover-sel');
  openLogoPanel(kind);
  bhandle.hidden = true; badd.hidden = true;   // logo fixo: sem alça Notion
}

let coverPanel;
const COVER_TYPE_LABEL = {
  title: 'Título', subtitle: 'Subtítulo',
  h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4',
  // "Texto" (não "Parágrafo"): na capa o termo do miolo confunde — era o eyebrow do painel
  // antigo e o fallback quando type vinha errado/ausente.
  p: 'Texto', quote: 'Citação',
  li: 'Lista de Pontos', ol: 'Lista Numérica', check: 'Checklist', callout: 'Callout',
  image: 'Imagem', 'image-grid': 'Grid de Imagens', 'table-grid': 'Grid de Tabelas', table: 'Tabela', divider: 'Divisor',
};
function openCoverPanel() {
  const f = findCoverItem(state.sel); if (!f) return;
  const it = f.item;
  const type = coverTypeOf(it);
  if (!coverPanel) { coverPanel = document.createElement('div'); coverPanel.id = 'coverPanel'; document.body.appendChild(coverPanel); }
  const isPlain = COVER_PLAIN.has(type);
  const isTitleSub = type === 'title' || type === 'subtitle';
  const isImage = type === 'image';
  const showAlign = isPlain || type === 'li' || type === 'ol' || type === 'check' || type === 'callout';
  const trash = typeof TRASH_ICO !== 'undefined' ? TRASH_ICO : uiIco('trash', 16, 'outline');
  const replace = typeof REPLACE_ICO !== 'undefined' ? REPLACE_ICO : uiIco('repeat', 16, 'outline');
  const sizeVal = it.size || COVER_TYPE_SIZE[type] || 18;
  const weightVal = coverItemWeight(it);
  const lsVal = coverItemLetterSpacing(it);
  const lhVal = coverItemLineHeight(it);
  const fmtLs = (n) => (Number.isFinite(+n) ? +n : COVER_LS_DEFAULT).toFixed(2) + 'em';
  const fmtLh = (n) => (Number.isFinite(+n) ? +n : COVER_LH_DEFAULT).toFixed(2);
  coverPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">${COVER_TYPE_LABEL[type] || 'Bloco'}</div>
    ${isPlain ? `
    <label class="field"><span class="field-row">Tamanho <span class="field-val"><span data-role="szv">${sizeVal}px</span><button type="button" class="resetbtn" data-a="sizereset" title="Redefinir">↺</button></span></span>
      <input type="range" data-a="size" min="8" max="120" step="1" value="${sizeVal}" data-snaps="8,14,18,32,64,120"></label>
    ${isTitleSub ? `
    <label class="field"><span class="field-row">Espessura <span class="field-val"><span data-role="wtv">${weightVal}</span><button type="button" class="resetbtn" data-a="weightreset" title="Redefinir para ${COVER_WEIGHT_DEFAULT}">↺</button></span></span>
      <input type="range" data-a="weight" min="100" max="${COVER_WEIGHT_MAX}" step="100" value="${weightVal}" data-snaps="100,200,300,400,500,600,700,800,900" data-edit="off"></label>
    <label class="field"><span class="field-row">Espaço entre letras <span class="field-val"><span data-role="lsv">${fmtLs(lsVal)}</span><button type="button" class="resetbtn" data-a="lsreset" title="Redefinir para ${fmtLs(COVER_LS_DEFAULT)}">↺</button></span></span>
      <input type="range" data-a="letterSpacing" min="-0.05" max="0.15" step="0.01" value="${lsVal}" data-snaps="-0.05,-0.01,0,0.05,0.1,0.15"></label>
    <label class="field"><span class="field-row">Altura da linha <span class="field-val"><span data-role="lhv">${fmtLh(lhVal)}</span><button type="button" class="resetbtn" data-a="lhreset" title="Redefinir para ${fmtLh(COVER_LH_DEFAULT)}">↺</button></span></span>
      <input type="range" data-a="lineHeight" min="0.8" max="2.5" step="0.05" value="${lhVal}" data-snaps="0.8,1,1.15,1.2,1.5,2,2.5"></label>` : ''}
    <label class="field">Cor <button type="button" class="colorfield" data-cf style="background:${it.color || '#000000'}"></button></label>` : ''}
    <div class="field">Coluna<div data-slot="col"></div></div>
    ${showAlign ? `<div class="field">Alinhamento<div data-slot="align"></div></div>` : ''}
    ${isImage ? `
    <button type="button" class="fieldbtn" data-a="replace">${replace}<span>Substituir</span></button>` : ''}
    <button type="button" class="fieldbtn danger" data-a="del">${trash}<span>Remover</span></button>`;
  coverPanel.hidden = false;
  coverPanel.querySelector('[data-slot="col"]').append(
    widthSeg(it.span || 'full', [
      { val: 'left', label: 'Coluna Esquerda', icon: COL_ICON.left },
      { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
      { val: 'right', label: 'Coluna Direita', icon: COL_ICON.right },
    ], (v) => {
      const cur = findCoverItem(state.sel); if (!cur) return;
      cur.item.span = v; render(); openCoverPanel();
    }));
  const alignSlot = coverPanel.querySelector('[data-slot="align"]');
  if (alignSlot) {
    alignSlot.append(widthSeg(it.align || 'left', [
      { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
      { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
      { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
    ], (v) => {
      const cur = findCoverItem(state.sel); if (!cur) return;
      cur.item.align = v; render(); openCoverPanel();
    }));
  }
  const cf = coverPanel.querySelector('[data-cf]');
  if (cf) {
    cf.addEventListener('click', () => openSwatchPop(cf, (hex) => {
      const cur = findCoverItem(state.sel); if (!cur) return;
      cur.item.color = hex; cf.style.background = hex;
      const node = pagesEl.querySelector(`.cover-item[data-cid="${cur.item.id}"]`);
      if (node) node.style.color = hex;
      save(); scheduleCommit();
    }, it.color || '#000000'));
  }
  coverPanel.querySelectorAll('.resetbtn').forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));
  enhanceAll(coverPanel);
  positionCoverPanel();
  coverPanel.querySelectorAll('[data-a]').forEach(el => {
    const ev = el.type === 'range' ? 'input' : 'click';
    el.addEventListener(ev, () => {
      const cur = findCoverItem(state.sel); if (!cur) return;
      const a = el.dataset.a, node = pagesEl.querySelector(`.cover-item[data-cid="${cur.item.id}"]`);
      if (a === 'size' || a === 'sizereset') {
        const oldH = node ? node.offsetHeight : 0;
        const defSz = COVER_TYPE_SIZE[coverTypeOf(cur.item)] || 18;
        cur.item.size = a === 'sizereset' ? defSz : +el.value;
        if (a === 'sizereset') {
          const range = coverPanel.querySelector('input[data-a="size"]');
          if (range) range.value = cur.item.size;
        }
        if (node) node.style.fontSize = cur.item.size + 'px';
        coverPushPull(cur.cov, cur.item, (node ? node.offsetHeight : 0) - oldH);
        const szv = coverPanel.querySelector('[data-role="szv"]');
        if (szv) szv.textContent = cur.item.size + 'px';
        save(); scheduleCommit(); return;
      }
      if (a === 'weight' || a === 'weightreset') {
        const oldH = node ? node.offsetHeight : 0;
        cur.item.weight = a === 'weightreset' ? COVER_WEIGHT_DEFAULT : coverItemWeight({ weight: +el.value });
        if (a === 'weightreset') {
          const range = coverPanel.querySelector('input[data-a="weight"]');
          if (range) range.value = cur.item.weight;
        }
        if (node) applyCoverTitleFace(node, cur.item);
        coverPushPull(cur.cov, cur.item, (node ? node.offsetHeight : 0) - oldH);
        const wtv = coverPanel.querySelector('[data-role="wtv"]');
        if (wtv) wtv.textContent = String(cur.item.weight);
        save(); scheduleCommit(); return;
      }
      if (a === 'letterSpacing' || a === 'lsreset') {
        const oldH = node ? node.offsetHeight : 0;
        cur.item.letterSpacing = a === 'lsreset'
          ? COVER_LS_DEFAULT
          : coverItemLetterSpacing({ letterSpacing: +el.value });
        if (a === 'lsreset') {
          const range = coverPanel.querySelector('input[data-a="letterSpacing"]');
          if (range) range.value = cur.item.letterSpacing;
        }
        if (node) applyCoverTitleFace(node, cur.item);
        coverPushPull(cur.cov, cur.item, (node ? node.offsetHeight : 0) - oldH);
        const lsv = coverPanel.querySelector('[data-role="lsv"]');
        if (lsv) lsv.textContent = fmtLs(cur.item.letterSpacing);
        save(); scheduleCommit(); return;
      }
      if (a === 'lineHeight' || a === 'lhreset') {
        const oldH = node ? node.offsetHeight : 0;
        cur.item.lineHeight = a === 'lhreset'
          ? COVER_LH_DEFAULT
          : coverItemLineHeight({ lineHeight: +el.value });
        if (a === 'lhreset') {
          const range = coverPanel.querySelector('input[data-a="lineHeight"]');
          if (range) range.value = cur.item.lineHeight;
        }
        if (node) applyCoverTitleFace(node, cur.item);
        coverPushPull(cur.cov, cur.item, (node ? node.offsetHeight : 0) - oldH);
        const lhv = coverPanel.querySelector('[data-role="lhv"]');
        if (lhv) lhv.textContent = fmtLh(cur.item.lineHeight);
        save(); scheduleCommit(); return;
      }
      if (a === 'replace') {
        pendingCoverImageId = cur.item.id;
        replaceImageId = null;
        document.getElementById('imgfile').click();
        return;
      }
      if (a === 'del') { deleteCoverItem(cur.item.id); return; }
    });
  });
}
function positionCoverPanel() {
  if (!coverPanel || coverPanel.hidden) return;
  const el = pagesEl.querySelector(`.cover-item[data-cid="${state.sel}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = coverPanel.offsetWidth || 220, ph = coverPanel.offsetHeight || 240;
  let x = r.right + 10; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  coverPanel.style.left = x + 'px'; coverPanel.style.top = y + 'px';
}
function closeCoverPanel() {
  if (coverPanel) coverPanel.hidden = true;
  closeLogoPanel();   // logo e texto de capa não coexistem em foco — um fecha o outro
}

// ── painel flutuante do LOGO (espelho da tab Documento: tipo / pos / align / cor / tamanho) ──
let logoPanel;
const LOGO_NONE_ICO = '<svg viewBox="0 0 16 16" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="5.6"/><line x1="4" y1="12" x2="12" y2="4"/></svg>';
function openLogoPanel(kind) {
  const lg = specialObj(kind)?.logo; if (!lg || !lg.on) { closeLogoPanel(); return; }
  if (!logoPanel) {
    logoPanel = document.createElement('div');
    logoPanel.id = 'logoPanel';
    document.body.appendChild(logoPanel);
  }
  const sizePct = Math.round((lg.size || 1) * 100);
  logoPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Logo da Paradigma</div>
    <div class="field"><span class="fieldtitle">Tipo</span>
      <div class="logopick" data-lpick>
        <button type="button" data-logokind="none" title="Nenhum">${LOGO_NONE_ICO}</button>
        <button type="button" data-logokind="icone" title="Ícone"></button>
        <button type="button" data-logokind="full" title="Completo"></button>
        <button type="button" data-logokind="nome" title="Nome"></button>
      </div>
    </div>
    <div class="field">Posição<div data-slot="pos"></div></div>
    <div class="field">Alinhamento<div data-slot="align"></div></div>
    <label class="field">Cor do logo
      <button type="button" class="colorfield" data-a="color" title="Escolher cor do logo" style="background:${lg.color || '#FFFFFF'}"></button>
    </label>
    <label class="field"><span class="field-row">Tamanho <span class="field-val"><span data-role="szv">${+(lg.size || 1).toFixed(2)}×</span><button type="button" class="resetbtn" data-a="sizereset" title="Redefinir para 1×">↺</button></span></span>
      <input type="range" data-a="size" min="40" max="260" value="${sizePct}" data-snaps="40,70,100,150,200,260" data-edit-scale="0.01">
    </label>`;
  // previews SVG do picker (mesmo do sidebar) + estado pressed
  const pick = logoPanel.querySelector('[data-lpick]');
  pick.querySelectorAll('button[data-logokind]').forEach(b => {
    const k = b.dataset.logokind;
    if (k !== 'none') b.innerHTML = logoPickSvg(k, 36, 90);
    b.setAttribute('aria-pressed', String(k === lg.kind));
  });
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-logokind]'); if (!b) return;
    const cur = specialObj(kind).logo;
    if (b.dataset.logokind === 'none') {
      cur.on = false;
      state.sel = null; closeLogoPanel(); syncLogoUI(); render();
      return;
    }
    cur.on = true; cur.kind = b.dataset.logokind;
    syncLogoUI(); render(); openLogoPanel(kind);
  });
  logoPanel.querySelector('[data-slot="pos"]').append(
    widthSeg(lg.pos === 'footer' ? 'footer' : 'header', [
      { val: 'header', label: 'Cabeçalho (topo)', icon: POS_ICON.header },
      { val: 'footer', label: 'Rodapé (base)', icon: POS_ICON.footer },
    ], (v) => {
      specialObj(kind).logo.pos = v;
      syncLogoUI(); render(); openLogoPanel(kind);
    }));
  logoPanel.querySelector('[data-slot="align"]').append(
    widthSeg(lg.align || 'left', [
      { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
      { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
      { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
    ], (v) => {
      specialObj(kind).logo.align = v;
      syncLogoUI(); render(); openLogoPanel(kind);
    }));
  const cf = logoPanel.querySelector('[data-a="color"]');
  cf.addEventListener('click', () => openSwatchPop(cf, (hex) => {
    specialObj(kind).logo.color = hex;
    cf.style.background = hex;
    syncLogoUI(); render(); openLogoPanel(kind);
  }, lg.color || '#FFFFFF'));
  logoPanel.querySelector('[data-a="sizereset"]').addEventListener('mousedown', (e) => e.preventDefault());
  enhanceAll(logoPanel);
  logoPanel.hidden = false;
  positionLogoPanel();
  logoPanel.querySelectorAll('[data-a]').forEach(el => {
    if (el.dataset.a === 'color') return;   // handler próprio acima
    const ev = el.type === 'range' ? 'input' : 'click';
    el.addEventListener(ev, () => {
      const cur = specialObj(kind).logo;
      const a = el.dataset.a;
      if (a === 'size' || a === 'sizereset') {
        cur.size = a === 'sizereset' ? 1 : +el.value / 100;
        if (a === 'sizereset') logoPanel.querySelector('input[data-a="size"]').value = 100;
        const sp = logoPanel.querySelector('[data-role="szv"]');
        if (sp) sp.textContent = (+cur.size.toFixed(2)) + '×';
        applyCoverLogoLive(kind);
        // espelha na tab Documento sem remontar a página
        const s = document.querySelector(`[data-logosize="${kind}"]`); if (s) s.value = Math.round(cur.size * 100);
        const sv = document.querySelector(`[data-logosizev="${kind}"]`); if (sv) sv.textContent = (+cur.size.toFixed(2)) + '×';
        save(); scheduleCommit();
      }
    });
  });
}
function positionLogoPanel() {
  if (!logoPanel || logoPanel.hidden) return;
  const kind = logoKindOfSel(state.sel);
  const el = kind && pagesEl.querySelector(`.page[data-cover="${kind}"] .cover-logo-hit`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = logoPanel.offsetWidth || 232, ph = logoPanel.offsetHeight || 320;
  let x = r.right + 10; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  logoPanel.style.left = x + 'px'; logoPanel.style.top = y + 'px';
}
function closeLogoPanel() { if (logoPanel) logoPanel.hidden = true; }

// ── painel flutuante do ÍNDICE (níveis / cores / largura — espelho da tab Documento) ──
let idxPanel;
function openIdxPanel() {
  if (!idxPanel) {
    idxPanel = document.createElement('div');
    idxPanel.id = 'idxPanel';
    document.body.appendChild(idxPanel);
  }
  const idx = state.doc.index;
  ensureIndexColors(idx);
  const lv = idx.levels || {};
  const pDef = typeStyleOf('p');
  // valores efetivos (override do índice OU default do parágrafo)
  const fs = idx.fontSize != null ? +idx.fontSize : pDef.fontSize;
  const lh = idx.lineHeight != null ? +idx.lineHeight : pDef.lineHeight;
  const scheme = idx.color === 'cinza' ? 'cinza' : idx.color === 'custom' ? 'custom' : 'padrao';
  const cc = idx.colors;
  idxPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Índice</div>
    <div class="titlelvls" style="padding-left:0;margin:0;border:0">
      <div class="swrow"><span>Título H1</span><button type="button" class="sw" data-i="h1" role="switch" aria-checked="${!!lv.h1}"></button></div>
      <div class="swrow"><span>Título H2</span><button type="button" class="sw" data-i="h2" role="switch" aria-checked="${!!lv.h2}"></button></div>
      <div class="swrow"><span>Título H3</span><button type="button" class="sw" data-i="h3" role="switch" aria-checked="${!!lv.h3}"></button></div>
      <div class="swrow"><span>Título H4</span><button type="button" class="sw" data-i="h4" role="switch" aria-checked="${!!lv.h4}"></button></div>
    </div>
    <label class="field">Cores
      <select data-a="color">
        <option value="padrao"${scheme === 'padrao' ? ' selected' : ''}>Padrão</option>
        <option value="cinza"${scheme === 'cinza' ? ' selected' : ''}>Cinza</option>
        <option value="custom"${scheme === 'custom' ? ' selected' : ''}>Custom</option>
      </select>
    </label>
    <div class="idx-custom-colors" data-role="idxcolors"${scheme !== 'custom' ? ' hidden' : ''}>
      <label class="field">Número <button type="button" class="colorfield" data-idxc="num" style="background:${cc.num}"></button></label>
      <label class="field">Texto <button type="button" class="colorfield" data-idxc="text" style="background:${cc.text}"></button></label>
      <label class="field">Página <button type="button" class="colorfield" data-idxc="page" style="background:${cc.page}"></button></label>
      <label class="field">Linha <button type="button" class="colorfield" data-idxc="line" title="Cor da linha até a página"></button></label>
    </div>
    <div class="field">Largura<div data-slot="w"></div></div>
    <div class="swrow"><span>Linha até a página</span><button type="button" class="sw" data-a="leaders" role="switch" aria-checked="${idx.leaders ? 'true' : 'false'}"></button></div>
    <label class="field"><span class="field-row">Tamanho do texto <span class="field-val"><span data-role="fontSizev">${fs}px</span><button type="button" class="resetbtn" data-r="fontSize" title="Redefinir para o Parágrafo (${pDef.fontSize}px)">↺</button></span></span>
      <input type="range" data-a="fontSize" min="8" max="48" step="1" value="${fs}" data-snaps="8,10,12,16,20,24">
    </label>
    <label class="field"><span class="field-row">Altura da linha <span class="field-val"><span data-role="lineHeightv">${lh}px</span><button type="button" class="resetbtn" data-r="lineHeight" title="Redefinir para o Parágrafo (${pDef.lineHeight}px)">↺</button></span></span>
      <input type="range" data-a="lineHeight" min="8" max="56" step="1" value="${lh}" data-snaps="12,14,17,21,26,31">
    </label>`;
  idxPanel.querySelectorAll('.sw[data-i]').forEach(sw => sw.addEventListener('click', () => {
    const levels = (state.doc.index.levels ||= { h1: true, h2: true });
    const k = sw.dataset.i;
    levels[k] = !levels[k];
    syncSpecialUI();   // espelha na tab Documento
    render();
  }));
  idxPanel.querySelector('[data-a="color"]').addEventListener('change', (e) => {
    state.doc.index.color = e.target.value;
    if (e.target.value === 'custom') ensureIndexColors(state.doc.index);
    syncSpecialUI();
    // reabre o painel pra revelar/esconder pickers de cor (sem rebuild só o hidden
    // deixar os handlers de swatch desatualizados no select)
    render();
    if (idxFocus === 'index') openIdxPanel();
  });
  // line: default com alpha — paint com paper; num/text/page costumam ser opacos
  paintIdxColorField(idxPanel.querySelector('.colorfield[data-idxc="line"]'), cc.line);
  idxPanel.querySelectorAll('.colorfield[data-idxc]').forEach(cf => {
    const key = cf.dataset.idxc;
    const cur = state.doc.index.colors[key] || INDEX_COLOR_DEFAULTS[key];
    const swatchOpts = key === 'line' ? { paper: true } : undefined;
    cf.addEventListener('click', () => openSwatchPop(cf, (hex) => {
      ensureIndexColors(state.doc.index);
      state.doc.index.colors[key] = hex;
      if (key === 'line') paintIdxColorField(cf, hex);
      else cf.style.background = hex;
      pagesEl.querySelectorAll('.toc.toc-custom').forEach(list => applyIndexCustomColors(list, state.doc.index));
      syncSpecialUI();
      save(); scheduleCommit();
    }, cur, swatchOpts));
  });
  // linha-guia entre título e nº da página (leaders)
  idxPanel.querySelector('.sw[data-a="leaders"]').addEventListener('click', (e) => {
    const sw = e.currentTarget;
    const on = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(on));
    if (on) state.doc.index.leaders = true; else delete state.doc.index.leaders;
    // ao vivo: só troca a classe no .toc (sem rebuild do painel)
    pagesEl.querySelectorAll('.toc').forEach(list => list.classList.toggle('toc-leaders', on));
    save(); scheduleCommit();
  });
  idxPanel.querySelector('[data-slot="w"]').replaceChildren(widthSeg(idx.width || 'curto', [
    { val: 'curto', label: 'Curto', icon: COL_ICON.left },
    { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
  ], (v) => { state.doc.index.width = v; syncSpecialUI(); render(); }));
  // tipografia ao vivo (sem re-render: rebuild do painel mataria o arraste do slider)
  const paintIdxType = () => {
    const st = indexTextStyle();
    pagesEl.querySelectorAll('.toc').forEach(list => {
      list.style.fontSize = st.fontSize + 'px';
      list.style.lineHeight = st.lineHeight + 'px';
    });
    save(); scheduleCommit();
  };
  const bindIdxType = (field, pKey) => {
    const range = idxPanel.querySelector(`input[data-a="${field}"]`);
    const disp = idxPanel.querySelector(`[data-role="${field}v"]`);
    const reset = idxPanel.querySelector(`.resetbtn[data-r="${field}"]`);
    if (range) range.addEventListener('input', () => {
      state.doc.index[field] = Math.round(+range.value);
      if (disp) disp.textContent = state.doc.index[field] + 'px';
      paintIdxType();
    });
    if (reset) {
      reset.addEventListener('mousedown', (e) => e.preventDefault());
      reset.addEventListener('click', () => {
        delete state.doc.index[field];
        const d = typeStyleOf('p')[pKey];
        if (range) range.value = d;
        if (disp) disp.textContent = d + 'px';
        paintIdxType();
      });
    }
  };
  bindIdxType('fontSize', 'fontSize');
  bindIdxType('lineHeight', 'lineHeight');
  enhanceAll(idxPanel);
  idxPanel.hidden = false;
  positionIdxPanel();
}
function positionIdxPanel() {
  if (!idxPanel || idxPanel.hidden) return;
  const el = pagesEl.querySelector('.idx-section[data-idx="index"]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = idxPanel.offsetWidth || 232, ph = idxPanel.offsetHeight || 200;
  let x = r.right + 10; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  idxPanel.style.left = x + 'px'; idxPanel.style.top = y + 'px';
}
function closeIdxPanel() { if (idxPanel) idxPanel.hidden = true; }

// ── painel flutuante do RESUMO (só largura — mesma opção da tab Documento) ──
let resumoPanel;
function openResumoPanel() {
  if (!resumoPanel) {
    resumoPanel = document.createElement('div');
    resumoPanel.id = 'resumoPanel';
    document.body.appendChild(resumoPanel);
  }
  const idx = state.doc.index;
  const pDef = typeStyleOf('p');
  const fs = idx.resumoFontSize != null ? +idx.resumoFontSize : pDef.fontSize;
  const lh = idx.resumoLineHeight != null ? +idx.resumoLineHeight : pDef.lineHeight;
  resumoPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Resumo</div>
    <div class="field">Largura do resumo<div data-slot="w"></div></div>
    <label class="field"><span class="field-row">Tamanho do texto <span class="field-val"><span data-role="fontSizev">${fs}px</span><button type="button" class="resetbtn" data-r="resumoFontSize" title="Redefinir para o Parágrafo (${pDef.fontSize}px)">↺</button></span></span>
      <input type="range" data-a="resumoFontSize" min="8" max="48" step="1" value="${fs}" data-snaps="8,10,12,16,20,24">
    </label>
    <label class="field"><span class="field-row">Altura da linha <span class="field-val"><span data-role="lineHeightv">${lh}px</span><button type="button" class="resetbtn" data-r="resumoLineHeight" title="Redefinir para o Parágrafo (${pDef.lineHeight}px)">↺</button></span></span>
      <input type="range" data-a="resumoLineHeight" min="8" max="56" step="1" value="${lh}" data-snaps="12,14,17,21,26,31">
    </label>`;
  resumoPanel.querySelector('[data-slot="w"]').replaceChildren(widthSeg(idx.resumoWidth || 'full', [
    { val: 'left', label: 'Coluna Esquerda', icon: COL_ICON.left },
    { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
  ], (v) => { state.doc.index.resumoWidth = v; syncSpecialUI(); render(); }));
  // tipografia ao vivo (sem re-render: rebuild do painel mataria o arraste do slider)
  const paintResumoType = () => {
    const st = resumoTextStyle();
    pagesEl.querySelectorAll('.idx-resumo').forEach(el => {
      el.style.fontSize = st.fontSize + 'px';
      el.style.lineHeight = st.lineHeight + 'px';
    });
    save(); scheduleCommit();
  };
  const bindResumoType = (field) => {
    const range = resumoPanel.querySelector(`input[data-a="${field}"]`);
    const role = field === 'resumoFontSize' ? 'fontSizev' : 'lineHeightv';
    const pKey = field === 'resumoFontSize' ? 'fontSize' : 'lineHeight';
    const disp = resumoPanel.querySelector(`[data-role="${role}"]`);
    const reset = resumoPanel.querySelector(`.resetbtn[data-r="${field}"]`);
    if (range) range.addEventListener('input', () => {
      state.doc.index[field] = Math.round(+range.value);
      if (disp) disp.textContent = state.doc.index[field] + 'px';
      paintResumoType();
    });
    if (reset) {
      reset.addEventListener('mousedown', (e) => e.preventDefault());
      reset.addEventListener('click', () => {
        delete state.doc.index[field];
        const d = typeStyleOf('p')[pKey];
        if (range) range.value = d;
        if (disp) disp.textContent = d + 'px';
        paintResumoType();
      });
    }
  };
  bindResumoType('resumoFontSize');
  bindResumoType('resumoLineHeight');
  enhanceAll(resumoPanel);
  resumoPanel.hidden = false;
  positionResumoPanel();
}
function positionResumoPanel() {
  if (!resumoPanel || resumoPanel.hidden) return;
  const el = pagesEl.querySelector('.idx-section[data-idx="resumo"]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = resumoPanel.offsetWidth || 232, ph = resumoPanel.offsetHeight || 80;
  let x = r.right + 10; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  resumoPanel.style.left = x + 'px'; resumoPanel.style.top = y + 'px';
}
function closeResumoPanel() { if (resumoPanel) resumoPanel.hidden = true; }

// imagem de fundo (data URL) — respeita o padding via CSS
function setCoverBg(kind, file) {
  const r = new FileReader();
  // syncSpecialUI() revela Substituir/Remover (data-bgactions) agora que bg != null
  // (a leitura do arquivo é assíncrona — não dá pra sincronizar isso no handler de 'change').
  r.onload = () => { (kind === 'back' ? state.doc.back : state.doc.cover).bg = r.result; syncSpecialUI(); render(); };
  r.readAsDataURL(file);
}

// ─────────────────────────── import / parsing ───────────────────────────────
const escapeHtml = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const stripHtml = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent; };
// acha um item de capa/contracapa por id → { cov, list, idx, item }
function findCoverItem(id) {
  for (const cov of [state.doc.cover, state.doc.back]) {
    if (!cov) continue;
    const i = cov.items.findIndex(it => it.id === id);
    if (i >= 0) return { cov, list: cov.items, idx: i, item: cov.items[i] };
  }
  return null;
}
const inlineMd = (s) => escapeHtml(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, '$1<i>$2</i>')
  .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>');

function parseMarkdown(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const out = []; let para = [];
  const flush = () => { if (para.length) { out.push(mkBlock('p', inlineMd(para.join(' ')))); para = []; } };
  for (const line of lines) {
    let m;
    if (/^\s*$/.test(line)) flush();
    else if ((m = line.match(/^#\s+(.*)/))) { flush(); out.push(mkBlock('h1', inlineMd(m[1]))); }
    else if ((m = line.match(/^##\s+(.*)/))) { flush(); out.push(mkBlock('h2', inlineMd(m[1]))); }
    else if ((m = line.match(/^###\s+(.*)/))) { flush(); out.push(mkBlock('h3', inlineMd(m[1]))); }
    else if ((m = line.match(/^#{4,6}\s+(.*)/))) { flush(); out.push(mkBlock('h4', inlineMd(m[1]))); }
    else if ((m = line.match(/^(\s*)(\d+(?:\.\d+)*)\.\s+(.*)/))) {
      // aceita "1. foo" e "1.1. foo" (export hierárquico); o número em si é recalculado no render
      flush();
      const blk = mkBlock('ol', inlineMd(m[3]));
      const indFromSpaces = Math.min(MAX_LIST_INDENT, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      const indFromPath = Math.min(MAX_LIST_INDENT, (m[2].match(/\./g) || []).length);
      const ind = Math.max(indFromSpaces, indFromPath);
      if (ind) blk.indent = ind;
      out.push(blk);
    }
    else if ((m = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)/))) {
      flush();
      const blk = mkBlock('check', inlineMd(m[3]));
      blk.checked = /[xX]/.test(m[2]);
      const ind = Math.min(MAX_LIST_INDENT, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      if (ind) blk.indent = ind;
      out.push(blk);
    }
    else if ((m = line.match(/^(\s*)[-*]\s+(.*)/))) {
      flush();
      const blk = mkBlock('li', inlineMd(m[2]));
      const ind = Math.min(MAX_LIST_INDENT, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      if (ind) blk.indent = ind;
      out.push(blk);
    }
    else if ((m = line.match(/^>\s?(.*)/))) { flush(); out.push(mkBlock('quote', inlineMd(m[1]))); }
    else if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push(mkBlock('divider', '')); }
    else para.push(line.trim());
  }
  flush();
  return out.length ? out : [mkBlock('p', '')];
}

// Serializa o conteúdo inline de um nó preservando <b>/<i>/<u>/<s> e <br> —
// inclusive quando as marcas vêm como <span style="font-weight:700"> etc.
// (é assim que o Google Docs e o Word põem negrito/itálico no clipboard).
function inlineHtmlOf(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += escapeHtml(n.nodeValue); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName.toLowerCase();
    if (tag === 'br') { out += '<br>'; continue; }
    let inner = inlineHtmlOf(n);
    if (!inner.trim() && !inner.includes('<br>')) continue;
    // decisão de marcas centralizada no parser puro (paste-style.js) — negrito/itálico/
    // sublinhado/tachado viram tag; cor/fundo (Figma, tarefa 10) viram <span style> enxuto,
    // os mesmos atributos que o foreColor/hiliteColor da tarefa 5 geram.
    const { bold, italic, underline, strike, color, bg } = marksFromStyle(n.style, tag);
    if (bold) inner = '<b>' + inner + '</b>';
    if (italic) inner = '<i>' + inner + '</i>';
    if (underline) inner = '<u>' + inner + '</u>';
    if (strike) inner = '<s>' + inner + '</s>';
    if (color || bg) {
      const s = (color ? 'color:' + color + ';' : '') + (bg ? 'background-color:' + bg + ';' : '');
      inner = '<span style="' + s + '">' + inner + '</span>';
    }
    // trilha G: preserva o link ao colar do Figma/Docs — o texto sobrevivia, o href sumia.
    // Mesma normalização de URL do resto do app (applyLink, trilha A t2): sem esquema (e não
    // âncora/relativo/mailto) → prefixa https:// pra não virar link relativo quebrado no PDF.
    if (tag === 'a') {
      const href = (n.getAttribute('href') || '').trim();
      if (href) {
        const url = /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href) ? href : 'https://' + href;
        inner = '<a href="' + escapeHtml(url).replace(/"/g, '&quot;') + '">' + inner + '</a>';
      }
    }
    out += inner;
  }
  return out;
}

function blocksFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nodes = doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,hr,img');
  const out = [];
  nodes.forEach(n => {
    const tag = n.tagName.toLowerCase();
    if (tag === 'img') { if (n.src) out.push({ id: uid(), type: 'image', src: n.src, placement: 'full', nw: n.naturalWidth || n.width || 600, nh: n.naturalHeight || n.height || 360 }); return; }
    if (tag === 'hr') { out.push(mkBlock('divider', '')); return; }
    if (tag !== 'li' && n.closest('li')) return;                    // p dentro de li: o li resolve
    if (tag === 'p' && n.closest('blockquote')) return;             // p dentro de quote: idem
    const h = inlineHtmlOf(n).trim();
    if (tag === 'h1') { if (h) out.push(mkBlock('h1', h)); }
    else if (tag === 'h2') { if (h) out.push(mkBlock('h2', h)); }
    else if (tag === 'h3') { if (h) out.push(mkBlock('h3', h)); }
    else if (/^h[4-6]$/.test(tag)) { if (h) out.push(mkBlock('h4', h)); }
    else if (tag === 'li') { if (h) out.push(mkBlock(n.closest('ol') ? 'ol' : 'li', h)); }
    else if (tag === 'blockquote') { if (h) out.push(mkBlock('quote', h)); }
    else out.push(mkBlock('p', h));   // p vazio fica: parágrafo em branco é intencional
  });
  // trilha A (t10): Figma copia SEM tags de bloco — só <span>/texto com estilo inline.
  // querySelectorAll acima não achou nada; preserva a formatação inline (inlineHtmlOf já
  // mantém negrito/itálico/cor) e separa parágrafos por <br> ou quebra de linha (o Figma
  // usa \n dentro de spans white-space:pre-wrap).
  // ponytail: variante rara de "uma <div> por linha" junta as linhas num parágrafo só;
  //           só resolvo se aparecer — o formato comum (pre-wrap/<br>) está coberto.
  if (!out.length) {
    inlineHtmlOf(doc.body).split(/<br\s*\/?>|\n/).forEach(p => { const h = p.trim(); if (h) out.push(mkBlock('p', h)); });
  }
  return out.length ? out : parseMarkdown(doc.body.textContent || '');
}

// dispara o seletor de arquivo pra inserir uma imagem na COLUNA ESQUERDA (inline)
let pendingImgPlacement = null;
// id do bloco que o painel pediu pra SUBSTITUIR (null = fluxo normal de inserir)
let replaceImageId = null;
// arquivo → célula do grid de imagens (miolo ou capa)
function setGridItemFromFile(file, blockId, itemIndex) {
  const cov = findCoverItem(blockId);
  const b = cov ? cov.item : blockOf(blockId);
  if (!b || b.type !== 'image-grid') return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      setGridItemImage(b, itemIndex, {
        src: reader.result,
        nw: img.naturalWidth,
        nh: img.naturalHeight,
      });
      if (cov) {
        state.sel = blockId;
        state.activeId = null;
        render();
        selectCoverItem(blockId);
      } else {
        state.activeId = blockId;
        state.sel = null;
        render();
        imageGridPanelDismissed = false;
        updateImageGridBar();
        paintActiveBlock(blockId);
        showHandleAtFocused();
        syncTypeUI('image-grid');
        syncColUI();
      }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function addImageViaPalette() {
  const coverKind = activeCoverKind();
  if (coverKind) {
    const f = state.sel && findCoverItem(state.sel);
    // item de imagem já selecionado → substitui; senão insere novo na capa
    if (f && coverTypeOf(f.item) === 'image') {
      applyCoverItemType(f.item, 'image');
      return;
    }
    insertCoverTyped(coverKind, 'image', f ? f.item.id : null);
    return;
  }
  pendingImgPlacement = 'inline';
  replaceImageId = null;
  pendingCoverImageId = null;   // não roubar o picker da capa
  document.getElementById('imgfile').click();
}

// arquivo -> imagem (captura dimensões naturais). placementOverride vem da paleta de blocos.
function addImageFile(file, placementOverride) {
  // capa/contracapa: o slash pediu imagem num cover-item (pendingCoverImageId)
  if (pendingCoverImageId) {
    const cid = pendingCoverImageId; pendingCoverImageId = null;
    const hit = findCoverItem(cid);
    if (!hit) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const it = hit.item;
        it.type = 'image';
        it.src = reader.result;
        it.nw = img.naturalWidth;
        it.nh = img.naturalHeight;
        it.radius = it.radius ?? 4;
        it.html = '';
        delete it.rows;
        state.sel = it.id;
        state.activeId = null;
        render();
        selectCoverItem(it.id);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const placement = placementOverride || document.getElementById('imgPlacement').value;
      const src = reader.result, nw = img.naturalWidth, nh = img.naturalHeight;
      const b = { id: uid(), type: 'image', src, placement, radius: 4, nw, nh };
      if (placement === 'right') { b.y = 0; b.page = state.addPage ?? lastEditedPage(); }
      state.addPage = null;
      closeAddImgMenu();
      // após o bloco em foco — ou SUBSTITUI se o ativo é o parágrafo vazio do "+" / slash
      // (senão fica p vazio + imagem, o bug reportado do botão +)
      const i = state.activeId ? idxOf(state.activeId) : -1;
      const cur = i >= 0 ? state.doc.blocks[i] : null;
      if (cur && isEmptyTextBlock(cur)) state.doc.blocks.splice(i, 1, b);
      else if (i >= 0) state.doc.blocks.splice(i + 1, 0, b);
      else state.doc.blocks.push(b);
      state.sel = b.id;
      state.activeId = null;
      render(); openImgPanel();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// troca a arte do bloco no lugar: preserva id, título, legenda, posição, raio, âncora…
// se era gráfico/timeline editável, vira imagem estática (some b.chart — o arquivo novo não tem spec).
function replaceImageFile(file, id) {
  // capa: substituir arte de cover-item type=image
  const covHit = findCoverItem(id);
  if (covHit && covHit.item.type === 'image') {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        covHit.item.src = reader.result;
        covHit.item.nw = img.naturalWidth;
        covHit.item.nh = img.naturalHeight;
        state.sel = id;
        render();
        selectCoverItem(id);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    return;
  }
  const b = blockOf(id);
  if (!b || b.type !== 'image') return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      b.src = reader.result;
      b.nw = img.naturalWidth;
      b.nh = img.naturalHeight;
      if (b.chart) delete b.chart;
      state.sel = b.id;
      render(); openImgPanel();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function lastEditedPage() {
  const el = state.activeId && pagesEl.querySelector(`[data-id="${state.activeId}"]`);
  const page = el && el.closest('.page');
  return page ? +page.dataset.page : 0;
}

// ─────────────────────────── export markdown ────────────────────────────────
// trilha B (t6): tabela em markdown pipe (| a | b |\n| --- | --- |\n| 1 | 2 |)
function tableMd(rows, strip) {
  if (!rows || !rows.length) return '';
  const line = (r) => '| ' + r.map(c => strip(c) || '').join(' | ') + ' |';
  const sep = '| ' + rows[0].map(() => '---').join(' | ') + ' |';
  return [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n');
}
function toMarkdown() {
  const strip = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent; };
  return state.doc.blocks.map(b => {
    switch (b.type) {
      case 'h1': return '# ' + strip(b.html);
      case 'h2': return '## ' + strip(b.html);
      case 'h3': return '### ' + strip(b.html);
      case 'h4': return '#### ' + strip(b.html);
      case 'li': return '  '.repeat(listIndentOf(b)) + '- ' + strip(b.html);
      case 'ol': {
        const pad = '  '.repeat(listIndentOf(b));
        const ind = listIndentOf(b);
        const sub = typeStyleOf('ol').subStyle || 'number';
        if (ind > 0 && sub === 'bullet') return pad + '- ' + strip(b.html);
        if (ind > 0 && sub === 'letter') return pad + toAlphaMarker(b._num || 1) + '. ' + strip(b.html);
        const path = (b._nums && b._nums.length) ? b._nums : [b._num || 1];
        return pad + path.join('.') + '. ' + strip(b.html);
      }
      case 'check': return '  '.repeat(listIndentOf(b)) + (b.checked ? '- [x] ' : '- [ ] ') + strip(b.html);
      case 'table': return tableMd(b.rows, strip);                              // trilha B (t6)
      case 'quote': return '> ' + strip(b.html);
      // trilha G: sem sintaxe md própria pra callout — reusa blockquote (">"); ao reimportar
      // via parseMarkdown volta como 'quote' simples (perda aceitável em v1). Ionicon → ℹ️.
      case 'callout': {
        const k = calloutIconKey(b);
        const mark = k && isTextIcon(k) ? textIconLabel(k) : (k ? 'ℹ️' : (b.icon || 'ℹ️'));
        return `> ${mark} ` + strip(b.html);
      }
      case 'divider': return '\n---\n';
      case 'pagebreak': return '\n<!-- quebra de página -->\n';
      case 'image': return `![${strip(b.title) || ''}](imagem)` + (b.caption ? `\n*${strip(b.caption)}*` : '');
      case 'image-grid': {
        ensureImageGrid(b);
        const withT = titlesOn(b);
        const withC = captionsOn(b);
        return b.items.map((it) => {
          if (!it.src) return '';
          const line = `![${withT ? (strip(it.title) || '') : ''}](imagem)`;
          return withC && it.caption ? line + `\n*${strip(it.caption)}*` : line;
        }).filter(Boolean).join('\n\n');
      }
      case 'table-grid': {
        ensureTableGrid(b);
        return b.items.map((it) => tableMd(it.rows, strip)).filter(Boolean).join('\n\n');
      }
      case 'icon': return `:${normalizeMaterialName(b.icon) || 'icon'}:`;
      default: return strip(b.html);
    }
  }).join('\n\n');
}

// ─────────────────────────── origem vinculada + sincronização ───────────────
// kv mínimo em IndexedDB só pro FileSystemFileHandle (não serializa em JSON;
// com ele o "Sincronizar" relê o MESMO arquivo local mesmo depois de recarregar)
const idb = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('pdgm-diag', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { try { const db = await this.open(); return await new Promise(res => {
    const g = db.transaction('kv').objectStore('kv').get(k);
    g.onsuccess = () => res(g.result); g.onerror = () => res(null); }); } catch { return null; } },
  async set(k, v) { try { const db = await this.open(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch {} },
  async del(k) { try { const db = await this.open(); db.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch {} },
};

let fileHandle = null;   // FileSystemFileHandle da origem (md OU .pdgm — um de cada vez)
// Vínculo live com .pdgm.zip/.json: mtime visto, dirty local, gravação em curso, poll.
let linkedMtime = 0;
let projectDirty = false;
let projectWriting = false;
/** Última falha de gravação (string curta) — botão + beforeunload. */
let projectSaveError = null;
/** Detalhe multi-linha da falha — painel do Salvar / toast. */
let projectSaveErrorDetail = null;
/** Promise da gravação em curso (coalesce; evita 2 createWritable). */
let projectWritePromise = null;
let suppressProjectAutosave = false;
let projectSaveT = null;
let projectWatchT = null;
// timestamps da UI (ms desde epoch) — tooltip do botão Salvar/Salvo
let lastProjectWriteAt = 0;   // último autosave / Salvar no handle
let lastProjectPollAt = 0;    // último ciclo de poll (viu o disco)
let lastProjectReadAt = 0;    // última vez que o conteúdo veio do disco (abrir/reload)
let lastUiChangeAt = 0;       // última mudança de conteúdo no Diagramador
let lastSaveFailToastAt = 0;  // throttle do toast de falha
// Handle do zip recém-aberto, à espera do opt-in de sincronia (modal / “Não Salvo”)
let pendingLinkHandle = null;
const PROJECT_AUTOSAVE_MS = 900;
const PROJECT_POLL_MS = 1000;
/** createWritable/write que trava não pode deixar “Salvando…” pra sempre. */
const PROJECT_SAVE_TIMEOUT_MS = 15000;

function isProjectSource(s = state.doc?.source) {
  return s && (s.format === 'pdgm' || s.format === 'pdgm-json');
}
function isMdSource(s = state.doc?.source) {
  return s && s.kind === 'file' && !isProjectSource(s);
}
function formatProjectTs(ms) {
  if (!ms || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return new Date(ms).toISOString();
  }
}
function clearFileLink() {
  // cancela autosave pendente ANTES de soltar o handle — senão um timer velho
  // grava o state novo (ex.: Em Branco) por cima do .zip do projeto anterior
  clearTimeout(projectSaveT);
  projectSaveT = null;
  suppressProjectAutosave = true;
  fileHandle = null;
  pendingLinkHandle = null;
  linkedMtime = 0;
  projectDirty = false;
  projectWriting = false;
  projectSaveError = null;
  projectSaveErrorDetail = null;
  projectWritePromise = null;
  lastProjectWriteAt = 0;
  lastProjectPollAt = 0;
  lastProjectReadAt = 0;
  lastUiChangeAt = 0;
  idb.del('fh');
  stopProjectWatch();
  updateSaveSourceBtn();
  setTimeout(() => { suppressProjectAutosave = false; }, 400);
}

/** true se sair da página pode perder trabalho (autosave falhou / sujo / gravando). */
function hasUnsavedProjectWork() {
  if (projectWriting) return true;
  if (projectSaveError) return true;
  if (isProjectLinked() && projectDirty) return true;
  // projeto aberto só na UI, sem auto-sync
  if (isUnsyncedOpenProject()) return true;
  return false;
}

/**
 * @param {Promise<any>} promise
 * @param {number} ms
 * @param {string|(()=>string)} message — string ou factory (vê a etapa atual no timeout)
 */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const msg = typeof message === 'function'
        ? message()
        : (message || `tempo esgotado (${Math.round(ms / 1000)}s)`);
      const err = new Error(msg);
      err.name = 'TimeoutError';
      err.code = 'TIMEOUT';
      reject(err);
    }, ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Baixa .pdgm.zip sem depender do handle (backup de emergência). */
async function downloadProjectBackup() {
  try {
    await saveDocFile();
  } catch (e) {
    console.error('[backup]', e);
    alert('Não foi possível baixar o backup: ' + ((e && e.message) || e));
  }
}

/** Rótulos curtos das etapas de gravação (debug + UI). */
const PROJECT_SAVE_STEP_LABEL = {
  'permission.query': 'consultar permissão de escrita',
  'permission.request': 'pedir permissão de escrita (diálogo do browser)',
  serialize: 'montar o arquivo (.zip/.json) na memória',
  createWritable: 'abrir o arquivo no disco para escrita (createWritable)',
  write: 'escrever bytes no arquivo',
  close: 'fechar/confirmar a gravação (close)',
  getFile: 'releitura do arquivo após gravar',
};

/**
 * Monta mensagem acionável a partir do erro + contexto da gravação.
 * Inclui etapa, tempo, nome do arquivo, código do browser — o que faltava no toast genérico.
 */
function formatProjectSaveFailure(err, ctx = {}) {
  const step = ctx.step || err?.step || null;
  const stepLabel = step
    ? (PROJECT_SAVE_STEP_LABEL[step] || step)
    : null;
  const stepMs = ctx.stepMs != null ? ctx.stepMs : err?.stepMs;
  const totalMs = ctx.totalMs != null ? ctx.totalMs : err?.totalMs;
  const fileName = ctx.fileName || state.doc?.source?.label || fileHandle?.name || '(sem nome)';
  const fmt = ctx.format || state.doc?.source?.format || '?';
  const blobBytes = ctx.blobBytes != null ? ctx.blobBytes : err?.blobBytes;
  const perm = ctx.permission || err?.permission;

  const name = err?.name || '';
  const raw = (err && err.message) || String(err || 'erro desconhecido');
  const code = err?.code || err?.errno || '';

  // interpretação do erro do browser (File System Access / DOMException)
  let cause = '';
  if (err?.code === 'TIMEOUT' || name === 'TimeoutError') {
    cause = stepLabel
      ? `Travou em: ${stepLabel}.`
      : 'A operação passou do tempo limite.';
    if (step === 'permission.request') {
      cause += ' O browser pode estar esperando você aceitar o diálogo de permissão — ou o diálogo ficou bloqueado.';
    } else if (step === 'createWritable' || step === 'write' || step === 'close') {
      cause += ' Costuma ser arquivo aberto em outro app, pasta sincronizada (iCloud/Drive) travada, ou handle inválido.';
    } else if (step === 'serialize') {
      cause += ' Documento muito grande ou serialização lenta (muitas imagens em base64).';
    }
  } else if (name === 'NotAllowedError' || /permiss/i.test(raw)) {
    cause = 'O browser negou permissão de escrita neste arquivo. Use “Baixar backup” ou reabra o .zip e aceite a permissão.';
  } else if (name === 'NotFoundError') {
    cause = 'O arquivo não existe mais no caminho original (foi movido, renomeado ou apagado). Reabra o projeto do disco.';
  } else if (name === 'NoModificationAllowedError' || name === 'InvalidStateError') {
    cause = 'O sistema bloqueou a modificação (arquivo só-leitura, em uso, ou gravação anterior ainda aberta).';
  } else if (name === 'AbortError') {
    cause = 'A operação foi cancelada (diálogo fechado ou abort).';
  } else if (name === 'QuotaExceededError') {
    cause = 'Sem espaço em disco (ou cota do browser esgotada).';
  } else if (name === 'NotSupportedError') {
    cause = 'Este browser/contexto não suporta gravar neste handle (File System Access).';
  } else if (raw) {
    cause = raw;
  } else {
    cause = 'Erro desconhecido na gravação.';
  }

  const lines = [
    cause,
    '',
    `Arquivo: ${fileName}`,
    `Formato: ${fmt}`,
  ];
  if (stepLabel) lines.push(`Etapa: ${stepLabel}${step ? ` [${step}]` : ''}`);
  if (stepMs != null) lines.push(`Tempo nesta etapa: ${Math.round(stepMs)} ms`);
  if (totalMs != null) lines.push(`Tempo total: ${Math.round(totalMs)} ms`);
  if (perm) lines.push(`Permissão (readwrite): ${perm}`);
  if (blobBytes != null) {
    const kb = (blobBytes / 1024).toFixed(blobBytes >= 1024 * 100 ? 0 : 1);
    lines.push(`Tamanho a gravar: ${kb} KB`);
  }
  if (name && name !== 'Error') lines.push(`Erro do browser: ${name}${code ? ` (${code})` : ''}`);
  if (raw && raw !== cause && !cause.includes(raw)) lines.push(`Detalhe: ${raw}`);
  lines.push('', 'Sugestão: baixe um backup (.pdgm.zip) — não depende do auto-save.');
  return lines.join('\n');
}

/**
 * Avisa falha de gravação e oferece download de backup (não depende do auto-save).
 * Throttle pra não spammar se o poll/timer re-tenta.
 */
function notifyProjectSaveFailed(err, ctx = {}) {
  const detail = formatProjectSaveFailure(err, ctx);
  projectSaveErrorDetail = detail;
  // botão: causa + etapa (uma linha)
  const lines = detail.split('\n').map((l) => l.trim()).filter(Boolean);
  const short = [lines[0], lines.find((l) => l.startsWith('Etapa:'))].filter(Boolean).join(' · ');
  projectSaveError = short.length > 200 ? short.slice(0, 197) + '…' : short;
  projectDirty = true;
  console.error('[projeto] save falhou', {
    err,
    ctx,
    detail,
    file: state.doc?.source?.label,
    handle: fileHandle?.name,
  });

  const now = Date.now();
  if (now - lastSaveFailToastAt < 6000) {
    updateSaveSourceBtn();
    return;
  }
  lastSaveFailToastAt = now;
  showToast(
    'err',
    'Não foi possível gravar no disco',
    detail,
    {
      code: 'project-save-fail',
      fileName: state.doc?.source?.label || fileHandle?.name || undefined,
      action: {
        label: 'Baixar backup',
        onClick: () => { downloadProjectBackup(); },
      },
      steps: [
        '1. Diagramação com projeto vinculado (.pdgm.zip)',
        '2. Editei o conteúdo (autosave ou botão Salvar)',
        `3. Falha: ${ctx.step || err?.step || err?.name || 'ver detalhe do toast'}`,
      ].join('\n'),
    },
  );
  updateSaveSourceBtn();
}
function stopProjectWatch() {
  if (projectWatchT) { clearInterval(projectWatchT); projectWatchT = null; }
  document.removeEventListener('visibilitychange', onProjectVisibility);
}
function startProjectWatch() {
  stopProjectWatch();
  if (!fileHandle || !isProjectSource()) return;
  projectWatchT = setInterval(() => { pollLinkedProject(); }, PROJECT_POLL_MS);
  document.addEventListener('visibilitychange', onProjectVisibility);
}
function onProjectVisibility() {
  if (document.visibilityState === 'visible') pollLinkedProject();
}
function scheduleProjectAutosave() {
  if (suppressProjectAutosave) return;
  if (!fileHandle || !isProjectSource()) return;
  projectDirty = true;
  lastUiChangeAt = Date.now();   // última mudança no Diagramador
  updateSaveSourceBtn();
  clearTimeout(projectSaveT);
  projectSaveT = setTimeout(() => {
    // notifyProjectSaveFailed já cuida do toast/UI; não engolir o erro calado
    saveProjectToHandle({ quiet: true }).catch((e) => {
      console.warn('[projeto] autosave', e);
    });
  }, PROJECT_AUTOSAVE_MS);
}

function setBlocks(blocks) {
  state.doc.blocks = blocks.length ? blocks : [mkBlock('p', '')];
  state.activeId = state.doc.blocks[0].id; state.sel = null;
  closeImgPanel(); renderSourceChip(); render();
}

// nome termina em .json (cobre ".pdgm.json" e um ".json" solto, caso alguém
// renomeie o arquivo) → caminho de documento completo; senão → .md/.txt de sempre.
// .pdgm.zip / "diagramacao.pdgm (9).zip" (download duplicado do Chrome) → .zip.
const isDocJson = (name) => String(name).toLowerCase().endsWith('.json');
const isDocZip = (name) => String(name).toLowerCase().endsWith('.zip');
// PK\x03\x04 (local) | PK\x05\x06 (vazio) | PK\x07\x08 (spanned) — sniff se a
// extensão mentir (arquivo sem .zip, MIME octet-stream, etc.)
function looksLikeZip(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return u.length >= 4 && u[0] === 0x50 && u[1] === 0x4b
    && (u[2] === 0x03 || u[2] === 0x05 || u[2] === 0x07 || u[2] === 0x08);
}

// normalizeOpenedDoc / migrateSpecialPages → doc-migrate.js

// aplica um doc COMPLETO (vindo de deserializeDoc) como o novo state.doc — igual
// ao #btnNew (troca o documento inteiro + resincroniza a UI), mas preservando
// tudo que veio no arquivo em vez de abrir em branco. Object.assign sobre um
// seedDoc() novo cobre campo ausente no TOPO (arquivo de versão futura ou editado
// à mão); nested (index.*) precisa de normalizeOpenedDoc — ver comentário lá.
//
// opts.handle: FileSystemFileHandle do .pdgm.zip/.json — mantém vínculo live
// (autosave + poll). Sem handle (input file Safari/Firefox) só carrega o doc.
function applyDocFile(doc, opts = {}) {
  const keep = opts.handle || null;
  const label = opts.label || (keep && keep.name) || null;
  const format = opts.format || (label && projectFormatFromName(label)) || 'pdgm';
  suppressProjectAutosave = true;
  if (!keep) clearFileLink();
  try {
    applyDoc(doc);
    if (keep) {
      fileHandle = keep;
      idb.set('fh', keep);
      state.doc.source = { kind: 'file', label: label || keep.name, format };
      if (opts.mtime != null) linkedMtime = opts.mtime;
      projectDirty = false;
      lastProjectReadAt = Date.now();
      lastProjectPollAt = lastProjectReadAt;
      // conteúdo = disco → mesmo timestamp exibido
      lastUiChangeAt = linkedMtime || lastProjectReadAt;
      startProjectWatch();
    } else if (label) {
      // aberto sem FSA: nome no chip / download, sem gravação in-place
      state.doc.source = { kind: 'file', label, format };
    }
    renderSourceChip();
  } finally {
    // solta o freio depois do save() debounced (250ms) de applyDoc — senão o
    // autosave regrava o zip no mesmo instante em que acabámos de ler o disco
    setTimeout(() => { suppressProjectAutosave = false; }, 400);
  }
}
// mesma troca de documento SEM mexer na origem vinculada — usada pela restauração de
// sessão no boot, que não pode derrubar o fileHandle de um .md linkado.
function applyDoc(doc) {
  const raw = (doc && typeof doc === 'object') ? doc : {};
  state.doc = Object.assign(seedDoc(), raw);
  // raw (arquivo) antes do seed: migra ruleTop/ruleBot ausentes → 1px legado, não 0.5
  normalizeOpenedDoc(state.doc, raw);
  document.getElementById('footText').value = state.doc.footText;
  document.getElementById('headText').value = state.doc.headText || '';
  document.getElementById('firstPage').value = state.doc.firstPage;
  syncRuleUI();
  syncFootChromeUI();
  syncPageBgUI();
  syncColLeftUI();
  // troca de documento: aplica estado da sidebar sem animar cada switch
  const wasReady = sidebarRevealReady;
  sidebarRevealReady = false;
  syncSpecialUI();
  sidebarRevealReady = wasReady;
  setBlocks(state.doc.blocks);   // → render() → save()+scheduleCommit() (mesmo padrão do #btnNew)
}

// ── toasts ──────────────────────────────────────────────────────────────────
// ok  → auto-dismiss; err → fica até fechar (motivo específico do loadDocZip);
// Reportar abre o modal de bug com detalhe + banner p/ anexar o arquivo no GH.
const TOAST_OK_MS = 3200;
function toastHost() {
  let el = document.getElementById('toastHost');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastHost';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}
function dismissToast(node) {
  if (!node || node._gone) return;
  node._gone = true;
  clearTimeout(node._t);
  node.classList.add('is-out');
  setTimeout(() => node.remove(), 180);
}
/**
 * @param {'ok'|'err'} kind
 * @param {string} title
 * @param {string} [detail]
 * @param {{ fileName?: string, fileSize?: number, steps?: string, code?: string }} [opts]
 */
function showToast(kind, title, detail, opts = {}) {
  const host = toastHost();
  const t = document.createElement('div');
  t.className = 'toast ' + (kind === 'err' ? 'err' : 'ok');
  t.setAttribute('role', kind === 'err' ? 'alert' : 'status');

  const body = document.createElement('div');
  body.className = 'toast-body';
  const h = document.createElement('div');
  h.className = 'toast-title';
  h.textContent = title;
  body.appendChild(h);
  if (detail) {
    const d = document.createElement('div');
    d.className = 'toast-detail';
    d.textContent = detail;
    body.appendChild(d);
  }

  const actions = document.createElement('div');
  actions.className = 'toast-actions';

  // ação custom (ex.: “Baixar backup” na falha de autosave) — antes do Reportar
  if (opts.action && opts.action.label) {
    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'toast-report';
    act.textContent = opts.action.label;
    act.addEventListener('click', () => {
      try { opts.action.onClick?.(); } catch (e) { console.error(e); }
      dismissToast(t);
    });
    actions.appendChild(act);
  }

  if (kind === 'err') {
    const report = document.createElement('button');
    report.type = 'button';
    report.className = 'toast-report';
    report.textContent = 'Reportar';
    report.addEventListener('click', () => {
      const fileLabel = opts.fileName || '';
      const steps = opts.steps || [
        '1. Diagramação → Abrir .zip (ou .json)',
        fileLabel ? `2. Selecionei o arquivo \`${fileLabel}\`` : '2. Selecionei o arquivo do projeto',
        '3. O erro acima apareceu no toast',
      ].join('\n');
      openFeedbackReport({
        type: 'bug',
        title: title.slice(0, 100),
        desc: [
          detail || title,
          '',
          '### Contexto',
          '- Fluxo: abrir projeto (.pdgm.zip / .json)',
          fileLabel ? `- Arquivo: \`${fileLabel}\`` : null,
          opts.fileSize != null ? `- Tamanho: ${(opts.fileSize / 1024).toFixed(1)} KB` : null,
          opts.code ? `- Código: \`${opts.code}\`` : null,
        ].filter(Boolean).join('\n'),
        steps,
        // só metadados — o GitHub não recebe binário pela URL; banner pede anexo manual
        fileName: fileLabel || undefined,
        askAttachFile: true,
      });
      dismissToast(t);
    });
    actions.appendChild(report);
  }

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'toast-x';
  x.setAttribute('aria-label', 'Fechar');
  x.textContent = kind === 'err' ? 'Fechar' : '✕';
  x.addEventListener('click', () => dismissToast(t));
  actions.appendChild(x);

  t.append(body, actions);
  host.appendChild(t);
  if (kind !== 'err') t._t = setTimeout(() => dismissToast(t), TOAST_OK_MS);
  return t;
}

// texto bruto de um .pdgm.json → parse + valida envelope + aplica.
// opts.handle / mtime / silent: mesmo contrato de openDocZipFile (vínculo live).
function openDocFile(text, label, fileMeta, opts = {}) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    showToast('err', 'JSON inválido',
      (e && e.message) || 'O arquivo não é um JSON válido.',
      { fileName: label, fileSize: fileMeta && fileMeta.size });
    return false;
  }
  const doc = deserializeDoc(parsed);
  if (!doc) {
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed).join(', ') : '';
    showToast('err', 'Formato .pdgm.json desconhecido',
      'Esperava o envelope `{ "v": 1, "doc": { … } }`.\n'
      + (keys ? `Chaves no arquivo: ${keys}.\n` : '')
      + 'Use o JSON exportado por este diagramador (ou o .pdgm.zip de Baixar → ZIP).',
      { fileName: label, fileSize: fileMeta && fileMeta.size, code: 'DOC_ENVELOPE' });
    return false;
  }
  applyDocFile(doc, {
    handle: opts.handle || null,
    label,
    format: 'pdgm-json',
    mtime: opts.mtime,
  });
  const n = (doc.blocks && doc.blocks.length) || 0;
  if (!opts.silent) {
    showToast('ok', opts.handle ? 'Projeto vinculado' : 'Projeto aberto',
      (label ? label + ' · ' : '') + n + ' bloco' + (n === 1 ? '' : 's')
      + (opts.handle ? ' · autosave no arquivo' : ''));
  }
  return true;
}

// ArrayBuffer de um .pdgm.zip → loadDocZip com motivo específico se falhar.
// `pending` = toast "Abrindo…" a substituir pelo resultado (sucesso ou erro).
// opts.handle: FileSystemFileHandle para vínculo live (autosave + poll).
async function openDocZipFile(buf, label, fileMeta, pending, opts = {}) {
  const r = await loadDocZip(buf, label);
  if (pending) dismissToast(pending);
  if (!r.ok) {
    showToast('err', r.title, r.detail, {
      fileName: label,
      fileSize: fileMeta && fileMeta.size,
      code: r.code,
    });
    return false;
  }
  // Toast de sucesso ANTES do apply: se o render de um doc enorme travar o main
  // thread, o usuário já viu que o arquivo foi lido (antes o toast vinha depois
  // do apply e o botão parecia morto).
  const n = (r.doc.blocks && r.doc.blocks.length) || 0;
  if (!opts.silent) {
    showToast('ok', opts.handle ? 'Projeto vinculado' : 'Projeto aberto',
      (label ? label + ' · ' : '') + n + ' bloco' + (n === 1 ? '' : 's')
      + (opts.handle ? ' · autosave no arquivo' : ''));
  }
  try {
    applyDocFile(r.doc, {
      handle: opts.handle || null,
      label,
      format: 'pdgm',
      mtime: opts.mtime,
    });
  } catch (e) {
    console.error('[abrir projeto] applyDocFile', e);
    showToast('err', 'Arquivo lido, mas falhou ao aplicar no editor',
      (e && e.message) || String(e),
      { fileName: label, fileSize: fileMeta && fileMeta.size, code: 'APPLY_DOC' });
    return false;
  }
  return true;
}

// Lê File e decide zip vs json por extensão OU magic bytes (PK..).
// opts.linkNow: ativa auto-sync já (ex.: modal “Selecionar .zip” do Salvar).
// opts.offerSync: após abrir, mostra modal de sincronia (fluxo Abrir .zip).
// handle FSA sem linkNow → fica em pendingLinkHandle (Não Salvo até opt-in).
async function openProjectBlob(f, handle = null, opts = {}) {
  if (!f) {
    showToast('err', 'Nenhum arquivo selecionado',
      'O seletor fechou sem um arquivo. Tente de novo em Abrir .zip.');
    return;
  }
  const meta = { size: f.size, name: f.name };
  const linkNow = !!opts.linkNow && !!handle;
  const linkOpts = {
    handle: linkNow ? handle : null,
    mtime: f.lastModified,
    label: f.name,
  };
  const pending = showToast('ok', 'Abrindo projeto…', f.name || '');
  try {
    const buf = await f.arrayBuffer();
    let ok = false;
    if (isDocZip(f.name) || looksLikeZip(buf)) {
      ok = await openDocZipFile(buf, f.name, meta, pending, linkOpts);
    } else {
      dismissToast(pending);
      ok = openDocFile(new TextDecoder().decode(buf), f.name, meta, linkOpts);
    }
    if (!ok) return;
    if (linkNow) {
      pendingLinkHandle = null;
      return;
    }
    // conteúdo na UI sem auto-sync no zip anterior/novo
    if (handle) pendingLinkHandle = handle;
    else pendingLinkHandle = null;
    if (opts.offerSync !== false) openSyncOfferModal();
    updateSaveSourceBtn();
  } catch (e) {
    console.error('[abrir projeto]', e);
    dismissToast(pending);
    showToast('err', 'Não foi possível abrir o arquivo',
      (e && e.message) || String(e),
      { fileName: f && f.name, fileSize: f && f.size });
  }
}

async function pickFile() {
  if (!window.showOpenFilePicker) { document.getElementById('file').click(); return; }
  let h;
  try {
    [h] = await showOpenFilePicker({ types: [
      { description: 'Texto', accept: { 'text/plain': ['.md', '.markdown', '.txt'] } },
    ] });
  } catch { return; }                        // usuário cancelou
  stopProjectWatch();
  const f = await h.getFile();
  fileHandle = h;
  linkedMtime = f.lastModified;
  state.doc.source = { kind: 'file', label: h.name, format: 'md' };
  idb.set('fh', h);
  setBlocks(parseMarkdown(await f.text()));
}

// "Abrir" (peer de "Novo Documento"): carrega um projeto NOVO.
// Só desvincula o anterior DEPOIS de o utilizador escolher o ficheiro (cancelar = mantém o atual).
// Sincronia com o arquivo escolhido é OPT-IN (modal / Não Salvo → Sincronizar).
// opts.linkNow: já pede escrita e ativa auto-sync (fluxo do modal Salvar).
async function pickProjectFile(opts = {}) {
  if (window.showOpenFilePicker) {
    let h;
    try {
      [h] = await showOpenFilePicker({
        types: [{
          description: 'Projeto Paradigma',
          accept: {
            'application/zip': ['.zip'],
            'application/json': ['.json'],
          },
        }],
        multiple: false,
      });
    } catch { return; }   // cancelou — não mexe no projeto atual
    // solta o zip ANTERIOR só agora (não sobrescrever o velho com o doc novo)
    clearFileLink();
    try {
      if (opts.linkNow) {
        // permissão nativa de escrita (alert do browser)
        if (h.queryPermission && await h.queryPermission({ mode: 'readwrite' }) !== 'granted') {
          if (h.requestPermission && await h.requestPermission({ mode: 'readwrite' }) !== 'granted') {
            showToast('err', 'Sem permissão de escrita',
              'O projeto abrirá sem auto-sync. Use o botão Não Salvo → Sincronizar para tentar de novo.');
            const f0 = await h.getFile();
            await openProjectBlob(f0, h, { offerSync: true, linkNow: false });
            return;
          }
        }
      }
      const f = await h.getFile();
      await openProjectBlob(f, h, {
        linkNow: !!opts.linkNow,
        offerSync: !opts.linkNow,
      });
    } catch (e) {
      console.error('[abrir projeto] FSA', e);
      showToast('err', 'Não foi possível abrir o arquivo', (e && e.message) || String(e));
    }
    return;
  }
  const input = document.getElementById('fileProject');
  if (!input) {
    showToast('err', 'Seletor de arquivo indisponível',
      'Recarregue a página e tente Abrir .zip de novo.');
    return;
  }
  input.dataset.linkNow = opts.linkNow ? '1' : '';
  input.value = '';
  input.click();
}

// Ativa auto-sync com o handle pendente (pede permissão nativa de escrita).
async function enableProjectSync(h = pendingLinkHandle) {
  if (!h) {
    // sem handle (abriu via <input>): precisa escolher de novo com FSA
    closeSyncOfferModal();
    await pickProjectFile({ linkNow: true });
    return false;
  }
  try {
    if (h.queryPermission && await h.queryPermission({ mode: 'readwrite' }) !== 'granted') {
      // alert nativo do browser
      const perm = h.requestPermission
        ? await h.requestPermission({ mode: 'readwrite' })
        : 'denied';
      if (perm !== 'granted') {
        showToast('err', 'Permissão recusada',
          'Sem escrita no arquivo não há auto-sync. Pode sincronizar depois pelo botão Não Salvo.');
        return false;
      }
    }
    const f = await h.getFile();
    fileHandle = h;
    pendingLinkHandle = null;
    idb.set('fh', h);
    const label = h.name || state.doc.source?.label || f.name;
    const format = projectFormatFromName(label) || 'pdgm';
    state.doc.source = { kind: 'file', label, format };
    linkedMtime = f.lastModified;
    lastProjectReadAt = Date.now();
    lastProjectPollAt = lastProjectReadAt;
    lastUiChangeAt = linkedMtime;
    projectDirty = false;
    startProjectWatch();
    closeSyncOfferModal();
    renderSourceChip();
    updateSaveSourceBtn();
    showToast('ok', 'Sincronia ativa', label + ' · autosave no disco');
    return true;
  } catch (e) {
    console.error('[sync]', e);
    showToast('err', 'Não foi possível sincronizar', (e && e.message) || String(e));
    return false;
  }
}

function openSyncOfferModal() {
  const m = document.getElementById('syncOfferModal');
  if (!m) return;
  m.hidden = false;
  // ícones nos dois botões (uma vez)
  const yes = document.getElementById('somSync');
  const no = document.getElementById('somSkip');
  if (yes && !yes.querySelector('svg')) {
    yes.insertAdjacentHTML('afterbegin', uiIco('sync', 18, 'outline'));
  }
  if (no && !no.querySelector('svg')) {
    // document / hand-off: utilizador gere o ficheiro sozinho
    no.insertAdjacentHTML('afterbegin', uiIco('document', 18, 'outline'));
  }
}
function closeSyncOfferModal() {
  const m = document.getElementById('syncOfferModal');
  if (m) m.hidden = true;
}

// t2.1: Google Docs saiu (import + sincronização agora só por arquivo local). O ramo
// 'gdoc' que existia aqui (fetch /api/gdoc, setBlocks via blocksFromHtml) foi removido;
// state.doc.source só assume kind:'file' daqui pra frente.
async function syncNow(fresh = false) {
  const s = state.doc.source;
  if (!s) return;
  if (isProjectSource(s)) {
    await pollLinkedProject({ force: true });
    return;
  }
  const dirty = state.doc.blocks.some(b => (b.html && b.html.trim()) || b.type === 'image');
  if (!fresh && dirty && !confirm('Sincronizar substitui o conteúdo atual pelo do documento de origem. Continuar?')) return;
  try {
    if (!fileHandle) { await pickFile(); return; }   // handle perdido → escolher de novo
    if (await fileHandle.queryPermission() !== 'granted'
      && await fileHandle.requestPermission() !== 'granted') throw new Error('permissão de leitura negada');
    const f = await fileHandle.getFile();
    setBlocks(parseMarkdown(await f.text()));
  } catch (e) { alert('Sincronização falhou: ' + (e.message || e)); }
}

// grava o documento atual de volta no arquivo de origem (md OU .pdgm)
async function saveToSource() {
  const s = state.doc.source;
  if (!s || s.kind !== 'file') return;
  if (isProjectSource(s)) {
    try {
      await saveProjectToHandle({ quiet: false });
    } catch (e) {
      alert('Não foi possível salvar no arquivo: ' + (e.message || e));
    }
    return;
  }
  if (!fileHandle) { downloadMd(); return; }        // sem File System Access API: baixa o .md
  try {
    if (await fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted'
      && await fileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted')
      throw new Error('permissão de escrita negada');
    const w = await fileHandle.createWritable();
    await w.write(toMarkdown());
    await w.close();
    const f = await fileHandle.getFile();
    linkedMtime = f.lastModified;
    flashSaved();
  } catch (e) { alert('Não foi possível salvar no arquivo: ' + (e.message || e)); }
}

// Serializa state.doc no handle do .pdgm.zip/.json (autosave ou botão Salvar).
// Etapas instrumentadas: o toast diz ONDE travou (permissão, zip, createWritable…).
// Permissão fica FORA do timeout de escrita — o diálogo do browser pode levar >15s.
async function saveProjectToHandle({ quiet = false } = {}) {
  if (!isProjectSource()) return;
  if (!fileHandle) {
    if (!quiet) await saveDocFile();
    return;
  }
  // coalesce: 2ª chamada enquanto grava espera a mesma promise
  if (projectWritePromise) return projectWritePromise;

  projectWriting = true;
  updateSaveSourceBtn();

  projectWritePromise = (async () => {
    const t0 = performance.now();
    let step = 'permission.query';
    let stepAt = t0;
    let permission = '?';
    let blobBytes = null;
    const fileName = state.doc?.source?.label || fileHandle.name || '';
    const format = state.doc?.source?.format || 'pdgm';

    const mark = (s) => {
      step = s;
      stepAt = performance.now();
    };
    const failCtx = () => ({
      step,
      stepMs: performance.now() - stepAt,
      totalMs: performance.now() - t0,
      fileName,
      format,
      permission,
      blobBytes,
    });

    try {
      // ── 1) permissão (sem timeout global: usuário pode demorar no diálogo) ──
      mark('permission.query');
      try {
        permission = await fileHandle.queryPermission({ mode: 'readwrite' });
      } catch (e) {
        e.step = step;
        throw e;
      }
      if (permission !== 'granted') {
        mark('permission.request');
        try {
          permission = await fileHandle.requestPermission({ mode: 'readwrite' });
        } catch (e) {
          e.step = step;
          throw e;
        }
        if (permission !== 'granted') {
          const e = new Error(
            `Permissão de escrita: “${permission}” (precisa ser “granted”). `
            + 'Clique de novo em Salvar e aceite o diálogo do browser, ou baixe um backup.',
          );
          e.name = 'NotAllowedError';
          e.step = step;
          e.permission = permission;
          throw e;
        }
      }

      // ── 2) serializar + gravar (com timeout; etapa atual no erro) ──
      await withTimeout((async () => {
        mark('serialize');
        let blob;
        if (format === 'pdgm-json') {
          const text = JSON.stringify(serializeDoc(state.doc), null, 2);
          blob = new Blob([text], { type: 'application/json' });
        } else {
          blob = await serializeDocZip(state.doc);
        }
        blobBytes = blob.size;

        mark('createWritable');
        const w = await fileHandle.createWritable();

        mark('write');
        await w.write(blob);

        mark('close');
        await w.close();

        mark('getFile');
        const f = await fileHandle.getFile();
        linkedMtime = f.lastModified;
        lastProjectWriteAt = Date.now();
        // UI e disco iguais → “No Diagramador” = mtime do arquivo
        lastUiChangeAt = linkedMtime;
      })(), PROJECT_SAVE_TIMEOUT_MS, () => {
        const stepLabel = PROJECT_SAVE_STEP_LABEL[step] || step;
        const stepMs = Math.round(performance.now() - stepAt);
        const totalMs = Math.round(performance.now() - t0);
        return (
          `Timeout (${Math.round(PROJECT_SAVE_TIMEOUT_MS / 1000)}s) na etapa “${stepLabel}” `
          + `[${step}] — ${stepMs} ms nesta etapa, ${totalMs} ms no total.`
        );
      });

      projectDirty = false;
      projectSaveError = null;
      projectSaveErrorDetail = null;
      if (!quiet) flashSaved();
      else updateSaveSourceBtn();
    } catch (e) {
      // anexa contexto se o erro ainda não tiver
      if (!e.step) e.step = step;
      if (e.stepMs == null) e.stepMs = performance.now() - stepAt;
      if (e.totalMs == null) e.totalMs = performance.now() - t0;
      if (e.permission == null) e.permission = permission;
      if (e.blobBytes == null && blobBytes != null) e.blobBytes = blobBytes;
      notifyProjectSaveFailed(e, failCtx());
      throw e;
    } finally {
      projectWriting = false;
      projectWritePromise = null;
      updateSaveSourceBtn();
    }
  })();

  return projectWritePromise;
}

// Poll: se o ficheiro no disco mudou por fora (MCP, outro editor) e não há
// edição local pendente, recarrega o doc e re-renderiza.
async function pollLinkedProject({ force = false } = {}) {
  if (!fileHandle || !isProjectSource()) return;
  if (projectWriting) return;
  try {
    if (await fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted'
      && await fileHandle.queryPermission() !== 'granted') {
      // sem re-prompt no poll silencioso (só force / foco com gesture)
      if (!force) return;
      if (await fileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted'
        && await fileHandle.requestPermission() !== 'granted') return;
    }
    const f = await fileHandle.getFile();
    lastProjectPollAt = Date.now();
    // se o painel do Salvar está aberto, refresca timestamps sem exigir reload
    const wrapOpen = document.getElementById('saveSourceWrap');
    if (wrapOpen && !wrapOpen.hidden && wrapOpen.matches(':hover, :focus-within')) updateSaveSourceBtn();
    if (!force && !shouldReloadLinkedProject({
      localDirty: projectDirty,
      writing: projectWriting,
      diskMtime: f.lastModified,
      seenMtime: linkedMtime,
    })) return;
    if (!force && f.lastModified <= linkedMtime) return;
    if (projectDirty && !force) return; // local ainda não flushou — não pisa o caret
    if (force && projectDirty) {
      if (!confirm('Há alterações locais ainda não gravadas no arquivo. Recarregar do disco e descartá-las?')) return;
      projectDirty = false;
      clearTimeout(projectSaveT);
    }
    const buf = await f.arrayBuffer();
    const label = state.doc.source?.label || f.name;
    const meta = { size: f.size, name: label };
    // silent: toast fica a cargo daqui (evita duplicar com openDoc*)
    const linkOpts = { handle: fileHandle, mtime: f.lastModified, silent: true };
    if (isDocZip(label) || looksLikeZip(buf)) {
      await openDocZipFile(buf, label, meta, null, linkOpts);
    } else {
      openDocFile(new TextDecoder().decode(buf), label, meta, linkOpts);
    }
    lastProjectReadAt = Date.now();
    lastProjectPollAt = lastProjectReadAt;
    updateSaveSourceBtn();
    showToast('ok', force ? 'Projeto recarregado' : 'Atualizado do arquivo', label);
  } catch (e) {
    console.warn('[projeto] poll', e);
    if (force) alert('Sincronização falhou: ' + (e.message || e));
  }
}

function flashSaved() {
  const b = document.getElementById('btnSaveSource');
  if (!b) return;
  const lab = b.querySelector('.save-label');
  if (lab) lab.textContent = 'Salvo ✓';
  b.disabled = true;
  setTimeout(() => { b.disabled = false; updateSaveSourceBtn(); }, 1200);
}

// Ícone de status no painel (check verde / alerta)
function saveTipStatusIco(ok) {
  return ok
    ? uiIco('checkmark-circle', 14, 'solid')
    : uiIco('alert-circle', 14, 'solid');
}

// “No Diagramador”: última mudança de conteúdo. Se UI ≡ disco, usa o MESMO mtime do arquivo
// (não Date.now() da gravação — senão os dois timestamps nunca batem).
function diagramadorSyncTs() {
  if (!projectDirty && !projectWriting && linkedMtime) return linkedMtime;
  return lastUiChangeAt || lastProjectWriteAt || lastProjectReadAt || 0;
}

function isProjectLinked() {
  return !!(fileHandle && isProjectSource(state.doc?.source));
}

/** Ícone do botão Salvar: warning | check | spinner (mesmo tamanho 16px). */
function setSaveSourceIcon(kind) {
  const btn = document.getElementById('btnSaveSource');
  if (!btn) return;
  let ico = btn.querySelector('.save-ico');
  if (!ico) {
    ico = document.createElement('span');
    ico.className = 'save-ico';
    ico.setAttribute('aria-hidden', 'true');
    btn.prepend(ico);
  }
  ico.className = 'save-ico' + (kind === 'warn' ? ' warn' : kind === 'ok' ? ' ok' : kind === 'spin' ? ' spin' : '');
  if (kind === 'spin') {
    ico.innerHTML = '<span class="save-spinner"></span>';
  } else if (kind === 'ok') {
    ico.innerHTML = uiIco('checkmark-circle', 16, 'solid');
  } else if (kind === 'warn') {
    ico.innerHTML = uiIco('warning', 16, 'solid');
  } else {
    ico.innerHTML = '';
  }
}

// ── modal vincular projeto ──────────────────────────────────────────────────
function openLinkProjectModal() {
  const m = document.getElementById('linkProjectModal');
  if (!m) return;
  m.hidden = false;
  // ícones nos botões (uma vez)
  const dl = document.getElementById('lpmDownload');
  const pk = document.getElementById('lpmPick');
  if (dl && !dl.querySelector('svg')) {
    dl.insertAdjacentHTML('afterbegin', uiIco('download', 18, 'outline'));
  }
  if (pk && !pk.querySelector('svg')) {
    pk.insertAdjacentHTML('afterbegin', uiIco('folder-open', 18, 'outline'));
  }
}
function closeLinkProjectModal() {
  const m = document.getElementById('linkProjectModal');
  if (m) m.hidden = true;
}

// Cria .pdgm.zip no disco (showSaveFilePicker) e já vincula o handle — um passo.
async function downloadAndLinkProject() {
  closeLinkProjectModal();
  const blob = await serializeDocZip(state.doc);
  const suggested = projectBaseName(state.doc.source?.label) + '.pdgm.zip';
  if (window.showSaveFilePicker) {
    try {
      const h = await showSaveFilePicker({
        suggestedName: suggested,
        types: [{
          description: 'Projeto Paradigma',
          accept: { 'application/zip': ['.zip'] },
        }],
      });
      if (h.queryPermission && await h.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        await h.requestPermission?.({ mode: 'readwrite' });
      }
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      const f = await h.getFile();
      // aplica o doc atual com o handle (sem re-parse do zip — já é o state)
      suppressProjectAutosave = true;
      try {
        fileHandle = h;
        idb.set('fh', h);
        state.doc.source = { kind: 'file', label: h.name || suggested, format: 'pdgm' };
        linkedMtime = f.lastModified;
        lastProjectWriteAt = Date.now();
        lastProjectReadAt = lastProjectWriteAt;
        lastProjectPollAt = lastProjectWriteAt;
        lastUiChangeAt = linkedMtime;
        projectDirty = false;
        startProjectWatch();
        renderSourceChip();
        showToast('ok', 'Projeto vinculado', (h.name || suggested) + ' · autosave ativo');
      } finally {
        setTimeout(() => { suppressProjectAutosave = false; }, 400);
      }
      updateSaveSourceBtn();
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // cancelou
      console.warn('[vincular] save picker', e);
      // fallback: download clássico
    }
  }
  // Safari/Firefox ou falha do picker: baixa o zip; usuário reabre com “Selecionar”
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggested;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('ok', 'ZIP baixado',
    'No Chrome/Edge use “Selecionar .zip local” no mesmo botão Salvar para ativar o auto-sync.');
}

// Projeto aberto na UI mas sem auto-sync (recusou modal ou “Agora não”)
function isUnsyncedOpenProject() {
  return !isProjectLinked() && !!(pendingLinkHandle || isProjectSource(state.doc?.source));
}

// Clique no Salvar do header:
// - vinculado → grava
// - aberto sem sync (“Não Salvo”) → modal de sincronia
// - em branco → modal vincular/criar zip
async function onSaveSourceClick() {
  if (isProjectLinked()) {
    try { await saveProjectToHandle({ quiet: false }); }
    catch (e) {
      // toast + “Baixar backup” já vêm de notifyProjectSaveFailed
      if (!projectSaveError) alert('Não foi possível salvar no arquivo: ' + (e.message || e));
    }
    return;
  }
  if (fileHandle && isMdSource()) {
    try { await saveToSource(); }
    catch (e) { alert('Não foi possível salvar no arquivo: ' + (e.message || e)); }
    return;
  }
  if (isUnsyncedOpenProject()) {
    openSyncOfferModal();
    return;
  }
  openLinkProjectModal();
}

// Salvar no header: sempre visível.
// warning + “Não Salvo” se projeto aberto sem sync; check se sync; spinner ao gravar.
function updateSaveSourceBtn() {
  const wrap = document.getElementById('saveSourceWrap');
  const btn = document.getElementById('btnSaveSource');
  const tip = document.getElementById('btnSaveSourceTip');
  if (!wrap || !btn || !tip) return;

  let lab = btn.querySelector('.save-label');
  if (!lab) {
    lab = document.createElement('span');
    lab.className = 'save-label';
    btn.appendChild(lab);
  }
  btn.removeAttribute('title');

  const linked = isProjectLinked();
  const unsynced = isUnsyncedOpenProject();
  wrap.dataset.linked = linked ? '1' : (unsynced ? 'pending' : '0');

  if (!linked && unsynced) {
    setSaveSourceIcon('warn');
    lab.textContent = 'Não Salvo';
    btn.classList.remove('primary');
    btn.classList.add('save-outline');
    btn.setAttribute('aria-label', 'Projeto sem auto-sync — clique ou use o menu para sincronizar');
    const syncIco = uiIco('sync', 14, 'outline');
    const name = state.doc.source?.label || 'arquivo';
    tip.innerHTML = `
      <div class="save-tip-card">
        <p class="save-tip-lead">O projeto <strong>${escapeHtml(name)}</strong> está só na interface — alterações <strong>não</strong> são gravadas automaticamente no disco.</p>
        <hr class="save-tip-sep">
        <div class="save-tip-actions">
          <button type="button" data-save-act="enable-sync">${syncIco}<span>Sincronizar</span></button>
        </div>
      </div>`;
    tip.querySelector('[data-save-act="enable-sync"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      enableProjectSync().catch((err) => console.error(err));
    });
    return;
  }

  if (!linked) {
    setSaveSourceIcon('warn');
    lab.textContent = 'Salvar';
    btn.classList.add('primary');
    btn.classList.remove('save-outline');
    btn.setAttribute('aria-label', 'Vincular arquivo .pdgm.zip para auto-sync');
    tip.innerHTML = '';
    return;
  }

  btn.classList.remove('save-outline');
  const hasErr = !!projectSaveError;
  const synced = !projectDirty && !projectWriting && !hasErr;
  if (projectWriting) {
    setSaveSourceIcon('spin');
    lab.textContent = 'Salvando…';
    btn.classList.add('primary');
    btn.setAttribute('aria-label', 'Gravando no disco');
  } else if (hasErr) {
    setSaveSourceIcon('warn');
    lab.textContent = 'Erro ao salvar';
    btn.classList.add('primary');
    btn.setAttribute('aria-label', 'Falha ao gravar — baixe um backup');
  } else if (synced) {
    setSaveSourceIcon('ok');
    lab.textContent = 'Salvo';
    btn.classList.remove('primary');
    btn.setAttribute('aria-label', 'Arquivo em sincronia com a UI');
  } else {
    setSaveSourceIcon('warn');
    lab.textContent = 'Salvar';
    btn.classList.add('primary');
    btn.setAttribute('aria-label', 'Salvar no arquivo do disco');
  }

  const statusLine = projectWriting
    ? 'Gravando no disco…'
    : (hasErr
      ? (projectSaveErrorDetail || projectSaveError || 'Falha ao gravar')
      : (synced ? 'UI e arquivo no disco estão iguais.' : 'Há alterações locais ainda não gravadas.'));
  const statusOk = synced && !projectWriting;
  const refreshIco = uiIco('refresh', 14, 'outline');
  const unlinkIco = uiIco('unlink', 14, 'outline');
  const dlIco = uiIco('download', 14, 'outline');
  // detalhe multi-linha da falha: pre-wrap no st-txt
  const statusHtml = hasErr
    ? `<span class="st-txt st-txt-err">${escapeHtml(statusLine)}</span>`
    : `<span class="st-txt">${escapeHtml(statusLine)}</span>`;

  tip.innerHTML = `
    <div class="save-tip-card">
      <p class="save-tip-lead">${hasErr
        ? 'A gravação automática <strong>falhou</strong>. Abaixo está a causa e a etapa exata — baixe um backup se precisar.'
        : 'A interface está vinculada à versão do arquivo zip no seu disco. Mudanças serão salvas automaticamente.'}</p>
      <hr class="save-tip-sep">
      <ul class="save-tip-status">
        <li class="${statusOk ? 'ok' : 'warn'}">${saveTipStatusIco(statusOk)}${statusHtml}</li>
        <li class="ok">${saveTipStatusIco(true)}<span class="st-txt">No disco: ${escapeHtml(formatProjectTs(linkedMtime))}</span></li>
        <li class="ok">${saveTipStatusIco(true)}<span class="st-txt">No Diagramador: ${escapeHtml(formatProjectTs(diagramadorSyncTs()))}</span></li>
      </ul>
      <div class="save-tip-actions">
        ${hasErr || projectDirty ? `<button type="button" data-save-act="backup">${dlIco}<span>Baixar backup</span></button>` : ''}
        <button type="button" data-save-act="reload">${refreshIco}<span>Recarregar</span></button>
        <button type="button" data-save-act="unlink">${unlinkIco}<span>Desvincular</span></button>
      </div>
    </div>`;

  tip.querySelector('[data-save-act="backup"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    downloadProjectBackup();
  });
  tip.querySelector('[data-save-act="reload"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    syncNow(true);
  });
  tip.querySelector('[data-save-act="unlink"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.doc.source = null;
    clearFileLink();
    save();
    renderSourceChip();
  });
}

const srcRow = document.getElementById('srcRow');
function renderSourceChip() {
  const s = state.doc.source;
  if (!s) {
    srcRow.hidden = true;
    updateSaveSourceBtn();
    return;
  }
  srcRow.hidden = false;
  const live = isProjectSource(s) && !!fileHandle;
  const name = s.label || '';
  const refreshIco = uiIco('refresh', 16, 'outline');
  const unlinkIco = uiIco('unlink', 16, 'outline');
  const syncIco = uiIco('sync', 16, 'outline');
  let action = '';
  if (s.kind === 'gdoc') {
    action = `<button type="button" id="btnSync" class="primary" title="Reimportar o conteúdo do Google Docs">Sincronizar</button>`;
  } else if (live) {
    // mesmos controles do painel do Salvar — também na sidebar
    action = `<button type="button" id="btnSync" class="iconbtn" title="Lê de novo o arquivo do disco e atualiza a tela" aria-label="Recarregar do arquivo">${refreshIco}</button>`
      + `<button type="button" id="btnUnlink" class="iconbtn" title="Desvincula o arquivo: para o autosave; o documento continua na tela" aria-label="Desvincular arquivo">${unlinkIco}</button>`;
  } else if (isProjectSource(s) && !fileHandle) {
    // aberto sem auto-sync (“Não Salvo”) — só o nome + botão para ligar a sincronia
    action = `<button type="button" id="btnEnableSync" class="iconbtn" title="Sincronizar com o arquivo no disco (auto-sync)" aria-label="Sincronizar com o arquivo">${syncIco}</button>`;
  } else if (s.kind === 'file') {
    action = `<button type="button" id="btnUnlink" class="iconbtn" title="Desvincula o arquivo: o documento continua na tela" aria-label="Desvincular arquivo">${unlinkIco}</button>`;
  }
  srcRow.innerHTML = `<span class="src-label">${escapeHtml(name)}</span>${action}`;
  const lab = srcRow.querySelector('.src-label');
  if (lab) lab.title = name;
  const sync = srcRow.querySelector('#btnSync'); if (sync) sync.addEventListener('click', () => syncNow(true));
  const enSync = srcRow.querySelector('#btnEnableSync');
  if (enSync) enSync.addEventListener('click', () => {
    enableProjectSync().catch((err) => console.error(err));
  });
  const un = srcRow.querySelector('#btnUnlink');
  if (un) un.addEventListener('click', () => {
    state.doc.source = null;
    clearFileLink();
    save();
    renderSourceChip();
  });
  updateSaveSourceBtn();
}

// ─────────────────────────── UI: segment control (Configurações / Conteúdo) ─
// ion-icon name="options-outline" (Configurações) / "layers-outline" (Conteúdo)
const SEG_ICO = { documento: 'options', conteudo: 'layers' };
const segBtns = [...document.querySelectorAll('#segment button')];
segBtns.forEach(b => {
  const key = SEG_ICO[b.dataset.seg];
  if (!key) return;
  const label = b.textContent.trim();
  b.innerHTML = `${uiIco(key, 14, 'outline')}<span>${label}</span>`;
});
function setSegment(name) {
  segBtns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.seg === name)));
  // troca de aba: só fade (sem slide de altura). Panes empilhados em .pane-stack.
  document.querySelectorAll('.pane').forEach(p => {
    setSidebarFade(p, p.dataset.pane === name);
  });
}
segBtns.forEach(b => b.addEventListener('click', () => setSegment(b.dataset.seg)));

// ─────────────────────────── UI: sidebar / controles ────────────────────────
const btByType = {};
document.querySelectorAll('#blocktypes button[data-type]').forEach(btn => {
  btByType[btn.dataset.type] = btn;
  btn.addEventListener('mousedown', (e) => e.preventDefault());   // não rouba o caret/seleção do bloco
  btn.addEventListener('click', () => {
    const t = btn.dataset.type;
    if (t === 'pagebreak') return insertSeparatorButton('pagebreak');
    if (t === 'divider') return insertSeparatorButton('divider');
    if (t === 'image') return addImageViaPalette();
    // gráfico: abre o modal (graficos.html embed), igual ao menu + da coluna direita
    if (t === 'chart') {
      const page = state.activeId
        ? (blockOf(state.activeId)?.page | 0)
        : (state.doc.blocks[state.doc.blocks.length - 1]?.page | 0);
      chartTargetPage = page;
      chartEditId = null;
      openChartModal('chart');
      return;
    }
    // trilha G (bug): tabela/grid/ícone são ESTRUTURAIS — clicar com um parágrafo/título
    // selecionado NÃO pode converter (destruiria o texto). Sempre insere depois.
    if (t === 'table' || t === 'image-grid' || t === 'table-grid' || t === 'icon') return insertBlockAfter(t);
    setActiveType(t);
  });
});
function syncTypeUI(type) {
  Object.entries(btByType).forEach(([t, b]) => b.setAttribute('aria-pressed', String(t === type)));
  syncColUI();
}

// ── popover "⋮" da paleta: estilo do TIPO (cor/tamanho/altura de linha/espaçamento/margem) ──
// Editar aqui edita TODOS os blocos daquele tipo no documento (e os que forem criados depois)
// de uma vez, porque não existe override por bloco — todo bloco do tipo lê o MESMO
// state.doc.blockStyles[type] (ver applyTypeStyle/gapBefore). Mesmo padrão de popover fixo do
// #imgPanel/#coverPanel: criado uma vez, reaberto com innerHTML novo a cada tipo clicado.
//
// Campos por tipo:
//   h1–h4  → tipografia + margem acima
//   p / callout → tipografia + espaço entre blocos + cor do texto
//   li     → espaço + símbolo do item + símbolo do subitem
//   ol     → espaço + estilo do subitem (número 1.1. / letra a. / pontos •)
//   check  → espaço + cor do check + opacidade do item marcado
//   quote  → tipografia (default = p) + espaço + cor do texto + cor da borda
let blockStylePanel, blockStyleType = null;
function openBlockStylePanel(type, anchorEl) {
  if (!blockStylePanel) { blockStylePanel = document.createElement('div'); blockStylePanel.id = 'blockStylePanel'; document.body.appendChild(blockStylePanel); }
  blockStyleType = type;
  if (!state.doc.blockStyles || typeof state.doc.blockStyles !== 'object') state.doc.blockStyles = {};
  const def = TYPE_STYLE_DEFAULTS[type] || {};
  // typeStyleOf já mescla default + override e descarta NaN — painel e render usam a mesma fonte
  const merged = typeStyleOf(type);
  const v = (k) => {
    const raw = merged[k];
    if (raw == null) return def[k];
    if (typeof raw === 'number' && !Number.isFinite(raw)) return def[k];
    return raw;
  };
  const isHead = HEAD_TYPES.has(type);
  const isDivider = type === 'divider';
  const inheritsText = TEXT_FROM_P.has(type);          // li/ol/check: sem controles de tipografia
  const isListGap = type === 'li' || type === 'ol' || type === 'check';
  const label = (btByType[type]?.querySelector('.lbl') || {}).textContent || type;
  const fmtPct = (n) => Math.round((Number.isFinite(+n) ? +n : 0) * 100) + '%';
  const fmtLS = (n) => (Number.isFinite(+n) ? +n : 0).toFixed(2) + 'em';
  const fmtPx = (n) => (Number.isFinite(+n) ? +n : 0) + 'px';
  const markerPickHtml = (field, active) =>
    `<div class="markerpick" data-a="${field}" role="listbox" aria-label="${field === 'marker' ? 'Símbolo do item' : 'Símbolo do subitem'}">`
    + LI_MARKER_OPTS.map(m =>
      `<button type="button" data-v="${escapeHtml(m)}" aria-selected="${String(m === active)}" title="${escapeHtml(m)}">${escapeHtml(m)}</button>`
    ).join('')
    + `</div>`;

  let fields = '';
  // divisor: só cor + espessura (todos os divisores do relatório)
  if (isDivider) {
    fields = `
    <label class="field">Cor da linha <button type="button" class="colorfield" data-a="color" style="background:${v('color')}"></button></label>
    <label class="field"><span class="field-row">Espessura <span class="field-val"><span data-role="thicknessv">${fmtPx(v('thickness'))}</span><button type="button" class="resetbtn" data-r="thickness" title="Redefinir para ${def.thickness}px">↺</button></span></span>
      <input type="range" data-a="thickness" min="0.5" max="8" step="0.5" value="${v('thickness')}" data-snaps="0.5,1,1.5,2,3,4,6,8">
    </label>`;
  } else if (!inheritsText) {
    fields += `
    <label class="field"><span class="field-row">Tamanho do texto <span class="field-val"><span data-role="fontSizev">${fmtPx(v('fontSize'))}</span><button type="button" class="resetbtn" data-r="fontSize" title="Redefinir para ${def.fontSize}px">↺</button></span></span>
      <input type="range" data-a="fontSize" min="8" max="48" step="1" value="${v('fontSize')}" data-snaps="8,12,16,20,24,48">
    </label>
    <label class="field"><span class="field-row">Altura da linha <span class="field-val"><span data-role="lineHeightv">${fmtPx(v('lineHeight'))}</span><button type="button" class="resetbtn" data-r="lineHeight" title="Redefinir para ${def.lineHeight}px">↺</button></span></span>
      <input type="range" data-a="lineHeight" min="8" max="56" step="1" value="${v('lineHeight')}" data-snaps="12,17,21,26,31,56">
    </label>
    <label class="field"><span class="field-row">Espaço entre letras <span class="field-val"><span data-role="letterSpacingv">${fmtLS(v('letterSpacing'))}</span><button type="button" class="resetbtn" data-r="letterSpacing" title="Redefinir para ${def.letterSpacing}em">↺</button></span></span>
      <input type="range" data-a="letterSpacing" min="-0.05" max="0.15" step="0.01" value="${v('letterSpacing')}" data-snaps="-0.05,-0.01,0,0.05,0.1,0.15">
    </label>`;
  }
  if (!isDivider) {
    if (isHead) {
      const icoSz = state.doc.headingIconSize != null
        ? clampMsSize(state.doc.headingIconSize)
        : DEFAULT_HEADING_ICON_SIZE;
      const icoAuto = state.doc.headingIconSize == null;
      fields += `
    <label class="field"><span class="field-row">Margem acima (título) <span class="field-val"><span data-role="marginTopv">${fmtPx(v('marginTop'))}</span><button type="button" class="resetbtn" data-r="marginTop" title="Redefinir para ${def.marginTop}px">↺</button></span></span>
      <input type="range" data-a="marginTop" min="0" max="80" step="1" value="${v('marginTop')}" data-snaps="0,14,24,32,48,80">
    </label>
    <label class="field"><span class="field-row">Tamanho do ícone (todos os títulos) <span class="field-val"><span data-role="headingIconSizev">${icoAuto ? 'auto' : fmtPx(icoSz)}</span><button type="button" class="resetbtn" data-r="headingIconSize" title="Redefinir (auto por tipo)">↺</button></span></span>
      <input type="range" data-a="headingIconSize" min="12" max="64" step="1" value="${icoSz}" data-snaps="12,16,20,24,28,32,40,48,64" data-edit="off">
    </label>`;
    } else {
      const gapLbl = isListGap ? 'Espaço entre itens' : 'Espaço entre parágrafos';
      fields += `
    <label class="field"><span class="field-row">${gapLbl} <span class="field-val"><span data-role="gapv">${fmtPx(v('gap'))}</span><button type="button" class="resetbtn" data-r="gap" title="Redefinir para ${def.gap}px">↺</button></span></span>
      <input type="range" data-a="gap" min="0" max="48" step="1" value="${v('gap')}" data-snaps="0,6,14,16,24,48">
    </label>`;
    }
    if (!inheritsText) {
      fields += `<label class="field">Cor do texto <button type="button" class="colorfield" data-a="color" style="background:${v('color')}"></button></label>`;
    }
  }
  // lista de pontos: símbolo do item (nível 0), do subitem (Tab) e cor do marcador
  if (type === 'li') {
    fields += `
    <div class="field">Símbolo do item
      ${markerPickHtml('marker', v('marker'))}
    </div>
    <div class="field">Símbolo do subitem
      ${markerPickHtml('subMarker', v('subMarker'))}
    </div>
    <label class="field">Cor do ponto <button type="button" class="colorfield" data-a="markerColor" style="background:${v('markerColor')}"></button></label>`;
  }
  // lista numérica: estilo dos subitens + cor do número/marcador
  if (type === 'ol') {
    const curSub = v('subStyle') || 'number';
    fields += `
    <div class="field">Subitem
      <div class="segment cols-3" data-a="subStyle" role="tablist">
        ${OL_SUBSTYLE_OPTS.map(o =>
          `<button type="button" data-v="${o.val}" aria-selected="${String(o.val === curSub)}" title="${o.hint}">${o.label}</button>`
        ).join('')}
      </div>
    </div>
    <label class="field">Cor do número <button type="button" class="colorfield" data-a="markerColor" style="background:${v('markerColor')}"></button></label>`;
  }
  if (type === 'check') {
    fields += `
    <label class="field">Cor do check <button type="button" class="colorfield" data-a="checkColor" style="background:${v('checkColor')}"></button></label>
    <label class="field"><span class="field-row">Opacidade do item marcado <span class="field-val"><span data-role="checkedOpacityv">${fmtPct(v('checkedOpacity'))}</span><button type="button" class="resetbtn" data-r="checkedOpacity" title="Redefinir para ${fmtPct(def.checkedOpacity)}">↺</button></span></span>
      <input type="range" data-a="checkedOpacity" min="0" max="1" step="0.05" value="${v('checkedOpacity')}" data-snaps="0,0.25,0.5,0.55,0.75,1" data-edit-scale="100">
    </label>`;
  }
  if (type === 'quote') {
    fields += `<label class="field">Cor da borda <button type="button" class="colorfield" data-a="borderColor" style="background:${v('borderColor')}"></button></label>`;
  }
  if (inheritsText) {
    fields += `<p class="hint" style="margin:0;font-size:.7rem;color:var(--muted);line-height:1.35">Cor e tamanho do texto seguem o <strong>Parágrafo</strong>.</p>`;
  }

  blockStylePanel.innerHTML = `
    <div class="eyebrow" style="margin:0">Estilo · ${escapeHtml(label)}</div>
    ${fields}`;
  blockStylePanel.hidden = false;
  enhanceAll(blockStylePanel);
  positionBlockStylePanel(anchorEl);
  blockStylePanel.querySelectorAll('.resetbtn').forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));

  const setField = (field, val) => {
    // tamanho global dos ícones de título (todos H1–H4) — vive no doc, não em blockStyles[type]
    if (field === 'headingIconSize') {
      state.doc.headingIconSize = clampMsSize(val);
      scheduleStyleRender();
      return;
    }
    // não gravar NaN/undefined (range vazio ou parse falho) — isso virava "undefinedpx" no painel
    if (val == null) return;
    if (typeof val === 'number' && !Number.isFinite(val)) return;
    if (!state.doc.blockStyles || typeof state.doc.blockStyles !== 'object') state.doc.blockStyles = {};
    const o = (state.doc.blockStyles[type] ||= {});
    o[field] = val;
    scheduleStyleRender();
  };
  const resetField = (field) => {
    if (field === 'headingIconSize') {
      delete state.doc.headingIconSize; // auto = 1.05 × fontSize do tipo
      scheduleStyleRender();
      return;
    }
    const o = state.doc.blockStyles[type];
    if (o) { delete o[field]; if (!Object.keys(o).length) delete state.doc.blockStyles[type]; }
    scheduleStyleRender();
  };
  const displayFor = (field, val) => {
    if (field === 'letterSpacing') return fmtLS(val);
    if (field === 'checkedOpacity') return fmtPct(val);
    if (field === 'headingIconSize') {
      return state.doc.headingIconSize == null ? 'auto' : fmtPx(val);
    }
    return fmtPx(val);
  };
  const parseRange = (field, raw) => {
    if (field === 'letterSpacing' || field === 'checkedOpacity' || field === 'thickness') return +raw;
    return Math.round(+raw);
  };

  blockStylePanel.querySelectorAll('input[type=range][data-a]').forEach(inp => {
    inp.addEventListener('input', () => {
      const field = inp.dataset.a;
      const val = parseRange(field, inp.value);
      setField(field, val);
      const disp = blockStylePanel.querySelector(`[data-role="${field}v"]`);
      if (disp) disp.textContent = displayFor(field, val);
    });
  });
  blockStylePanel.querySelectorAll('.resetbtn[data-r]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.r;
      resetField(field);
      const d = field === 'headingIconSize' ? DEFAULT_HEADING_ICON_SIZE : def[field];
      const inp = blockStylePanel.querySelector(`input[data-a="${field}"]`);
      if (inp) inp.value = d;
      const disp = blockStylePanel.querySelector(`[data-role="${field}v"]`);
      if (disp) disp.textContent = displayFor(field, d);
    });
  });
  blockStylePanel.querySelectorAll('.colorfield[data-a]').forEach(cf => {
    const field = cf.dataset.a;
    cf.addEventListener('click', () => openSwatchPop(cf, (hex) => {
      setField(field, hex); cf.style.background = hex;
    }, v(field)));
  });
  // picks de símbolo (lista de pontos) e segment de subitem (lista numérica)
  blockStylePanel.querySelectorAll('.markerpick').forEach(pick => {
    const field = pick.dataset.a;
    pick.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        setField(field, btn.dataset.v);
        pick.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      });
    });
  });
  const subSeg = blockStylePanel.querySelector('[data-a="subStyle"]');
  if (subSeg) {
    subSeg.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        setField('subStyle', btn.dataset.v);
        subSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      });
    });
  }
}
function positionBlockStylePanel(anchorEl) {
  if (!blockStylePanel || blockStylePanel.hidden || !anchorEl) return;
  const r = anchorEl.getBoundingClientRect();
  const pw = blockStylePanel.offsetWidth || 232, ph = blockStylePanel.offsetHeight || 260;
  let x = r.right + 10; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  blockStylePanel.style.left = x + 'px'; blockStylePanel.style.top = y + 'px';
}
function closeBlockStylePanel() { if (blockStylePanel) blockStylePanel.hidden = true; blockStyleType = null; }
// mudar tamanho/altura/margem re-paginia (blocos mudam de altura) — debounce curto pro slider
// não travar arrastando (mesmo idioma do debounce de digitação, `inputT` mais abaixo).
let styleRenderT;
// só render() — o painel é uma subárvore própria (appendChild no body, fora de #pages), então
// sobrevive ao rebuild do miolo sozinho; reabri-lo aqui destruiria o <input> no meio do arraste.
function scheduleStyleRender() { clearTimeout(styleRenderT); styleRenderT = setTimeout(() => { render(); }, 150); }
document.querySelectorAll('.blockmenu[data-styletype]').forEach(btn => {
  // ion-icon name="ellipsis-vertical" → filled/solid (sem -outline)
  btn.innerHTML = uiIco('ellipsis-vertical', 14, 'solid');
  btn.addEventListener('mousedown', (e) => e.preventDefault());   // não rouba o caret/seleção do bloco em edição
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = btn.dataset.styletype;
    if (blockStyleType === t && blockStylePanel && !blockStylePanel.hidden) { closeBlockStylePanel(); return; }
    openBlockStylePanel(t, btn);
  });
});
document.addEventListener('mousedown', (e) => {                // fecha ao clicar fora (mesmo padrão do #addImgMenu)
  if (!blockStylePanel || blockStylePanel.hidden) return;
  if (e.target.closest('#blockStylePanel') || e.target.closest('.blockmenu')) return;
  closeBlockStylePanel();
}, true);

// "Posição" do bloco EM FOCO — a sidebar é o único lugar de onde texto/tabela alcançam o
// placement (imagem tem o #imgPanel, item de capa tem o #coverPanel, ambos com o MESMO
// segment widthSeg). Reconstrói a cada troca de bloco porque widthSeg marca o botão ativo no
// build (não tem setter) — 3 botões, rebuild é mais barato que um patch.
// Na coluna direita, o cadeado ("Travar no texto") também mora aqui — o #imgPanel só serve
// imagem; texto/tabela na direita usam a mesma âncora (b.anchor) via este botão.
const blockColEl = document.getElementById('blockcol');
const blockColSlot = blockColEl.querySelector('[data-slot="col"]');
const blockLockEl = document.getElementById('blocklock');
if (blockLockEl) {
  blockLockEl.addEventListener('mousedown', (e) => e.preventDefault()); // não rouba caret
  blockLockEl.addEventListener('click', () => {
    if (state.activeId) toggleBlockLock(state.activeId);
  });
}
function syncColUI() {
  const b = state.activeId && blockOf(state.activeId);
  // quebra de página e divisor não têm coluna (o divisor é selecionado, não focado — nunca
  // chega aqui; a guarda é só pra não depender disso).
  if (!b || b.type === 'pagebreak' || b.type === 'divider') {
    setSidebarReveal(blockColEl, false); blockColSlot.replaceChildren();
    if (blockLockEl) setSidebarReveal(blockLockEl, false);
    return;
  }
  setSidebarReveal(blockColEl, true);
  // headers / parágrafo / grid de imagens: 1 coluna | 2 colunas.
  // Demais (imagem, tabela, lista…) mantêm as 3 posições, inclusive coluna direita.
  const opts = COL_FMT_TYPES.has(b.type)
    ? [
        { val: 'inline', label: '1 coluna (esquerda)', icon: COL_ICON.left },
        { val: 'full', label: '2 colunas (largura total)', icon: COL_ICON.full },
      ]
    : [
        { val: 'inline', label: 'Coluna Esquerda', icon: COL_ICON.left },
        { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
        { val: 'right', label: 'Coluna Direita', icon: COL_ICON.right },
      ];
  // se o bloco está na direita e o tipo agora só mostra 1/2 col, reflete full/inline
  // no segment (valor efetivo pra UI); a troca real limpa right via setBlockPlacement.
  let cur = placementOf(b);
  if (COL_FMT_TYPES.has(b.type) && cur === 'right') cur = 'inline';
  blockColSlot.replaceChildren(widthSeg(cur, opts, (v) => setBlockPlacement(b.id, v)));
  // cadeado: só na coluna direita (modelo da imagem). Mesma regra do #imgPanel.
  // headers/parágrafo não usam right no segment — esconde o cadeado nesses tipos.
  if (blockLockEl) {
    if (placementOf(b) !== 'right' || COL_FMT_TYPES.has(b.type)) {
      setSidebarReveal(blockLockEl, false);
    } else {
      const travavel = !!b.anchor || leftBlocksOnPage(b.page | 0).length > 0;
      setSidebarReveal(blockLockEl, true);
      blockLockEl.disabled = !travavel;
      blockLockEl.title = travavel ? ''
        : 'Esta página não tem bloco de texto próprio para prender o item (só a continuação de um parágrafo que começa numa página anterior).';
      blockLockEl.innerHTML = (b.anchor ? UNLOCK_SVG : LOCK_SVG)
        + `<span>${b.anchor ? 'Destravar' : 'Travar no texto'}</span>`;
    }
  }
}
function toggleBlockLock(id) {
  const b = blockOf(id); if (!b || placementOf(b) !== 'right') return;
  if (b.anchor) delete b.anchor;                    // destrava: mantém o b.y atual
  else {
    const alvo = nearestByTop(leftBlocksOnPage(b.page | 0), b.y || 0);
    if (alvo) b.anchor = { id: alvo.id, dy: (b.y || 0) - alvo._top };
  }
  const keep = captureCaret();
  state.activeId = id;
  if (b.type === 'image') state.sel = id;
  // caret no próprio bloco → preserva; imagem → render seco + reabre painel; resto foca o bloco
  render(keep && keep.id === id ? keep
    : (b.type === 'image' ? undefined : { id, role: 'block', offset: 0 }));
  if (b.type === 'image' && state.sel) openImgPanel();
}
function setBlockPlacement(id, v) {
  const b = blockOf(id); if (!b) return;
  const keep = captureCaret();
  b.placement = v;
  if (v === 'right') { if (b.y == null) b.y = 0; b.page = lastEditedPage(); }
  else { delete b.y; delete b.page; delete b.anchor; }
  render(keep && keep.id === id ? keep : { id, role: 'block', offset: 0 });
  syncColUI();
  updateTextPlaceBar();
}
/** Segment 1 col | 2 cols no painel flutuante (H1–H4 / p / …). */
function mountTextPlaceSeg(slot, b, onAfter) {
  if (!slot || !b) return;
  let cur = placementOf(b);
  if (cur === 'right') cur = 'inline';
  slot.replaceChildren(widthSeg(cur === 'full' ? 'full' : 'inline', [
    { val: 'inline', label: '1 coluna (esquerda)', icon: COL_ICON.left },
    { val: 'full', label: '2 colunas (largura total)', icon: COL_ICON.full },
  ], (v) => {
    setBlockPlacement(b.id, v);
    onAfter?.(v);
  }));
}

// ── painel flutuante de Largura (parágrafo e textos sem painel próprio) ──────
// H1–H4: Largura vive no #iconPanel. image-grid: no #imageGridPanel.
let textPlacePanel;
let textPlacePanelDismissed = false;
function closeTextPlacePanel() { if (textPlacePanel) textPlacePanel.hidden = true; }
function openTextPlacePanel() {
  const b = state.activeId && blockOf(state.activeId);
  if (!b || !editing || !TEXT_PLACE_TYPES.has(b.type)) { closeTextPlacePanel(); return; }
  textPlacePanelDismissed = false;
  closeImgPanel(); closeTablePanel(); closeImageGridPanel(); closeTableGridPanel();
  // não fecha iconPanel (não compete com p)
  if (!textPlacePanel) {
    textPlacePanel = document.createElement('div');
    textPlacePanel.id = 'textPlacePanel';
    document.body.appendChild(textPlacePanel);
  }
  textPlacePanel.dataset.bid = b.id;
  const labels = { p: 'Parágrafo', caption: 'Legenda', quote: 'Citação', callout: 'Callout', li: 'Lista', ol: 'Lista', check: 'Checklist' };
  textPlacePanel.innerHTML = `
    <div class="eyebrow" style="margin:0">${labels[b.type] || 'Texto'}</div>
    <div class="field">Largura<div data-slot="place"></div></div>`;
  textPlacePanel.hidden = false;
  mountTextPlaceSeg(textPlacePanel.querySelector('[data-slot="place"]'), b, () => openTextPlacePanel());
  positionTextPlacePanel();
}
function positionTextPlacePanel() {
  if (!textPlacePanel || textPlacePanel.hidden) return;
  const b = state.activeId && blockOf(state.activeId);
  if (!b || textPlacePanel.dataset.bid !== b.id) return;
  const el = pagesEl.querySelector(`[data-id="${b.id}"]`);
  if (!el) return;
  const r = (el.closest('.frag') || el).getBoundingClientRect();
  const pw = textPlacePanel.offsetWidth || 220, ph = textPlacePanel.offsetHeight || 100;
  let x = r.right + 10;
  if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  textPlacePanel.style.left = x + 'px'; textPlacePanel.style.top = y + 'px';
}
function updateTextPlaceBar() {
  const b = state.activeId && blockOf(state.activeId);
  if (b && editing && TEXT_PLACE_TYPES.has(b.type)) {
    if (textPlacePanelDismissed && textPlacePanel && textPlacePanel.dataset.bid === b.id) {
      if (!textPlacePanel.hidden) positionTextPlacePanel();
      return;
    }
    if (!textPlacePanel || textPlacePanel.hidden || textPlacePanel.dataset.bid !== b.id) openTextPlacePanel();
    else positionTextPlacePanel();
  } else {
    textPlacePanelDismissed = false;
    closeTextPlacePanel();
  }
}
// tipos de capa que a paleta converte in-place (preserva html), espelhando TEXT_TYPES do miolo
const COVER_EDIT_TYPES = new Set(['title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'p', 'caption', 'quote', 'li', 'ol', 'check', 'callout']);
function setActiveType(t) {
  // capa/contracapa: paleta da aba Conteúdo age no item selecionado ou insere na capa focada
  const coverKind = activeCoverKind();
  if (coverKind) {
    if (t === 'pagebreak') return;   // não existe na capa
    const f = state.sel && findCoverItem(state.sel);
    if (f && COVER_EDIT_TYPES.has(coverTypeOf(f.item)) && COVER_EDIT_TYPES.has(t)) {
      const it = f.item;
      it.type = t;
      if (t === 'callout') ensureCalloutDefaults(it);
      if (t === 'check' && it.checked == null) it.checked = false;
      if (COVER_TYPE_SIZE[t] != null) it.size = COVER_TYPE_SIZE[t];
      state.activeId = null;
      render();
      selectCoverItem(it.id);
      syncTypeUI(t);
      return;
    }
    // item estrutural selecionado, logo, ou capa vazia → insere depois (ou no fim)
    insertCoverTyped(coverKind, t, f ? f.item.id : null);
    return;
  }
  const id = state.activeId;
  const b = id && blockOf(id);
  if (b && TEXT_TYPES.has(b.type)) {
    const keep = captureCaret();             // preserva a SELEÇÃO (não só o caret)
    const wasHead = HEAD_TYPES.has(b.type);
    b.type = t;
    if (t === 'callout') ensureCalloutDefaults(b);
    if (!LIST_TYPES.has(t)) delete b.indent; // indent só faz sentido em lista
    // ícone de título (Material Symbols) só vale em H1–H4
    if (wasHead && !HEAD_TYPES.has(t)) clearHeadIconFields(b);
    // tipos 1/2 col não usam coluna direita no UI — se vinha de right, volta ao fluxo
    // (default do tipo: H1–H4/grid = 2 cols, p = 1 col).
    if (COL_FMT_TYPES.has(t) && b.placement === 'right') {
      delete b.placement; delete b.y; delete b.page; delete b.anchor;
    }
    render(keep && keep.id === b.id ? keep : { id: b.id, role: 'block', offset: 0 });
    syncTypeUI(t);
    updateHeadBar();
  }
  else { const nb = mkBlock(t, ''); state.doc.blocks.push(nb); state.activeId = nb.id; render({ id: nb.id, role: 'block', offset: 0 }); syncTypeUI(t); }
}
function insertSeparatorButton(sepType) {
  const coverKind = activeCoverKind();
  if (coverKind) {
    if (sepType === 'pagebreak') return;
    const f = state.sel && findCoverItem(state.sel);
    insertCoverTyped(coverKind, sepType, f ? f.item.id : null);
    return;
  }
  const id = state.activeId, host = id && pagesEl.querySelector(`[data-id="${id}"][contenteditable]`);
  const b = id && blockOf(id);
  if (host && b) breakAtCaret(host, b, sepType);
  else { state.doc.blocks.push(mkBlock(sepType, ''), mkBlock('p', '')); render(); }
}
// Bloco de texto sem conteúdo — placeholder do "+" / resto de "/tipo" no slash.
// Usado pra SUBSTITUIR em vez de inserir-depois (senão sobra parágrafo vazio + imagem).
function isEmptyTextBlock(b) {
  if (!b || !TEXT_TYPES.has(b.type)) return false;
  return !stripHtml(b.html).replace(/\s+/g, ' ').trim();
}

// trilha G: caminho pros tipos ESTRUTURAIS ('table', 'image-grid', 'table-grid', 'icon' —
// image/divider/pagebreak já inserem-depois pelas próprias funções acima).
// Com texto real no ativo: NUNCA converte (inserir depois). Com placeholder vazio: substitui.
function insertBlockAfter(t) {
  const coverKind = activeCoverKind();
  if (coverKind) {
    const f = state.sel && findCoverItem(state.sel);
    insertCoverTyped(coverKind, t, f ? f.item.id : null);
    return;
  }
  const nb = mkBlock(t, '');
  const i = state.activeId ? idxOf(state.activeId) : -1;
  const cur = i >= 0 ? state.doc.blocks[i] : null;
  if (cur && isEmptyTextBlock(cur)) state.doc.blocks.splice(i, 1, nb);
  else if (i >= 0) state.doc.blocks.splice(i + 1, 0, nb);
  else state.doc.blocks.push(nb);
  state.activeId = nb.id;
  render({ id: nb.id, role: 'block', offset: 0 });
  if (t === 'image-grid') {
    imageGridPanelDismissed = false;
    updateImageGridBar();
  }
  if (t === 'table-grid') {
    tableGridPanelDismissed = false;
    updateTableGridBar();
  }
  if (t === 'icon') {
    paintActiveBlock(nb.id);
    openIconBlockPanel();
  }
}

// ── popover Material Symbol (bloco type=icon OU ícone de header) ─────────────
// mode = 'icon' | 'head' — mesmos eixos: Weight, Fill, Shape, Grade, Optical Size
let iconPanel;
function closeIconBlockPanel() {
  if (iconPanel) { iconPanel.hidden = true; delete iconPanel.dataset.mode; }
}
function openIconBlockPanel() {
  const b = state.activeId && blockOf(state.activeId);
  if (!b || !editing) { closeIconBlockPanel(); return; }
  const mode = b.type === 'icon' ? 'icon'
    : (HEAD_TYPES.has(b.type) ? 'head' : null);
  if (!mode) { closeIconBlockPanel(); return; }

  closeImgPanel(); closeTablePanel(); closeImageGridPanel(); closeTableGridPanel(); closeTextPlacePanel();
  if (!iconPanel) {
    iconPanel = document.createElement('div');
    iconPanel.id = 'iconPanel';
    document.body.appendChild(iconPanel);
  }
  iconPanel.dataset.mode = mode;
  iconPanel.dataset.bid = b.id;

  const trash = typeof TRASH_ICO !== 'undefined' ? TRASH_ICO : uiIco('trash', 16, 'outline');
  const plus = typeof PLUS_SVG !== 'undefined' ? PLUS_SVG : '+';
  const hasHeadIcon = mode === 'head' && headHasIcon(b);

  // título sem ícone: Largura (1/2 cols) + "Adicionar ícone"
  if (mode === 'head' && !hasHeadIcon) {
    iconPanel.innerHTML = `
      <div class="eyebrow" style="margin:0">Título</div>
      <div class="field">Largura<div data-slot="place"></div></div>
      <button type="button" class="fieldbtn" data-a="addicon">${plus}<span>Adicionar ícone</span></button>`;
    iconPanel.hidden = false;
    mountTextPlaceSeg(iconPanel.querySelector('[data-slot="place"]'), b, () => openIconBlockPanel());
    iconPanel.querySelector('[data-a="addicon"]').addEventListener('click', () => {
      ensureHeadIcon(b);
      save(); scheduleCommit();
      render({ id: b.id, role: 'block', offset: 0 });
      openIconBlockPanel();
    });
    positionIconBlockPanel();
    return;
  }

  const ms = materialOptsFrom(b, mode);
  const name = iconNameOf(b, mode);
  const title = mode === 'head' ? 'Título' : 'Ícones';
  const icoAlign = iconAlignOf(b);
  const icoPlace = placementOf(b);
  const isTabler = ms.family === 'tabler';
  // Tabler: espessura em px (1–3); Material: weight 100–700
  const strokePx = ms.stroke;

  iconPanel.innerHTML = `
    <div class="eyebrow" style="margin:0">${title}</div>
    ${mode === 'head' ? `<div class="field">Largura<div data-slot="place"></div></div>` : ''}
    <div class="field">Símbolo
      <button type="button" class="icon-pick-btn" data-a="pick" title="Escolher símbolo (Material ou Tabler)">
        ${iconHtml(name, { ...ms, size: 22 })}
        <span data-role="iname">${name}${isTabler ? ' · Tabler' : ' · Material'}</span>
      </button>
    </div>
    <label class="field">Cor <button type="button" class="colorfield" data-a="color" style="background:${ms.color}"></button></label>
    ${mode === 'icon' ? `
    <div class="field">Alinhamento<div data-slot="align"></div></div>
    <div class="field">Colunas<div data-slot="place"></div></div>
    ` : ''}
    ${isTabler ? `
    <label class="field"><span class="field-row">Espessura <span class="field-val"><span data-role="strokev" class="field-edit" contenteditable="true" spellcheck="false" inputmode="decimal">${strokePx}</span>px<button type="button" class="resetbtn" data-a="strokereset" title="Redefinir para 2px">↺</button></span></span>
      <input type="range" data-a="stroke" min="1" max="3" step="0.5" value="${strokePx}" data-snaps="1,1.5,2,2.5,3" data-edit="off">
    </label>
    ` : `
    <div class="field">Estilo<div data-slot="shape"></div></div>
    <div class="swrow"><span>Preenchido</span>
      <button type="button" class="sw" data-a="fill" role="switch" aria-checked="${ms.fill ? 'true' : 'false'}"></button></div>
    <label class="field"><span class="field-row">Espessura (Weight) <span class="field-val"><span data-role="weightv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric">${ms.weight}</span><button type="button" class="resetbtn" data-a="weightreset" title="Redefinir">↺</button></span></span>
      <input type="range" data-a="weight" min="100" max="700" step="100" value="${ms.weight}" data-snaps="100,200,300,400,500,600,700" data-edit="off">
    </label>
    <label class="field"><span class="field-row">Grade <span class="field-val"><span data-role="gradev" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric">${ms.grade}</span><button type="button" class="resetbtn" data-a="gradereset" title="Redefinir">↺</button></span></span>
      <input type="range" data-a="grade" min="-50" max="200" step="25" value="${ms.grade}" data-snaps="-50,0,50,100,150,200" data-edit="off">
    </label>
    <label class="field"><span class="field-row">Optical Size <span class="field-val"><span data-role="opszv" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric">${ms.opsz}</span><button type="button" class="resetbtn" data-a="opszreset" title="Redefinir">↺</button></span></span>
      <input type="range" data-a="opsz" min="20" max="48" step="1" value="${ms.opsz}" data-snaps="20,24,32,40,48" data-edit="off">
    </label>
    `}
    ${mode === 'icon' ? `
    <label class="field"><span class="field-row">Tamanho <span class="field-val"><span data-role="sizev" class="field-edit" contenteditable="true" spellcheck="false" inputmode="numeric">${ms.size}</span>px<button type="button" class="resetbtn" data-a="sizereset" title="Redefinir">↺</button></span></span>
      <input type="range" data-a="size" min="12" max="96" step="1" value="${Math.min(96, ms.size)}" data-snaps="12,16,20,24,28,32,40,48,64,96" data-edit="off">
    </label>` : ''}
    <button type="button" class="fieldbtn danger" data-a="del">${trash}<span>${mode === 'head' ? 'Remover ícone' : 'Remover'}</span></button>`;
  iconPanel.hidden = false;

  const liveHost = () => {
    if (mode === 'icon') return pagesEl.querySelector(`.icon-block[data-id="${b.id}"]`);
    return pagesEl.querySelector(`.head-wrap[data-id="${b.id}"] .head-icon`);
  };
  const paintLive = () => {
    const host = liveHost();
    const o = materialOptsFrom(b, mode);
    const sz = mode === 'head' ? headingIconSizePx(b.type) : o.size;
    const n = iconNameOf(b, mode);
    if (host) {
      // reconstrói o glifo (Material ↔ Tabler trocam a tag)
      if (mode === 'icon') {
        host.innerHTML = iconHtml(n, { ...o, size: sz, className: 'icon-block-glyph' });
      } else {
        host.innerHTML = iconHtml(n, { ...o, size: sz });
      }
    }
    const pickBtn = iconPanel.querySelector('[data-a="pick"]');
    if (pickBtn) {
      const fam = o.family === 'tabler' ? 'Tabler' : 'Material';
      pickBtn.innerHTML = iconHtml(n, { ...o, size: 22 })
        + `<span data-role="iname">${n} · ${fam}</span>`;
    }
    // previews do Estilo (só Material — slot ausente em Tabler)
    iconPanel.querySelectorAll('[data-slot="shape"] button').forEach((btn, i) => {
      const shapes = ['outlined', 'rounded', 'sharp'];
      const sh = shapes[i];
      if (!sh) return;
      btn.innerHTML = iconHtml(n, { ...o, size: 18, family: 'material', shape: sh, color: 'currentColor' });
    });
  };
  const reopen = () => {
    render();
    state.activeId = b.id;
    paintActiveBlock(b.id);
    openIconBlockPanel();
  };

  // Biblioteca: só no grid do picker (abas Material | Tabler) — sem toggle no painel

  // Estilo Material: Outlined | Rounded | Sharp (ausente para Tabler)
  const shapeSlot = iconPanel.querySelector('[data-slot="shape"]');
  if (shapeSlot) {
    const stylePreview = (shape) => iconHtml(name, {
      ...ms, family: 'material', size: 18, shape, color: 'currentColor',
    });
    shapeSlot.append(
      widthSeg(ms.shape, [
        { val: 'outlined', label: 'Outlined', icon: stylePreview('outlined') },
        { val: 'rounded', label: 'Rounded', icon: stylePreview('rounded') },
        { val: 'sharp', label: 'Sharp', icon: stylePreview('sharp') },
      ], (v) => {
        applyMaterialOpts(b, { shape: v }, mode);
        paintLive(); save(); scheduleCommit();
        openIconBlockPanel();
      }));
  }

  // H1–H4: largura 1/2 colunas no painel (mesmo segment do miolo)
  if (mode === 'head') {
    mountTextPlaceSeg(iconPanel.querySelector('[data-slot="place"]'), b, () => openIconBlockPanel());
  }
  // bloco Ícones: alinhamento + colunas (placement 3 opções)
  if (mode === 'icon') {
    const alignSlot = iconPanel.querySelector('[data-slot="align"]');
    if (alignSlot) {
      alignSlot.append(widthSeg(icoAlign, [
        { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
        { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
        { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
      ], (v) => {
        if (v === 'left') delete b.align;
        else b.align = v;
        const host = pagesEl.querySelector(`.icon-block[data-id="${b.id}"]`);
        if (host) {
          host.dataset.align = v;
          host.style.justifyContent = v === 'center' ? 'center' : v === 'right' ? 'flex-end' : 'flex-start';
        }
        save(); scheduleCommit();
        openIconBlockPanel();
      }));
    }
    const placeSlot = iconPanel.querySelector('[data-slot="place"]');
    if (placeSlot) {
      placeSlot.append(widthSeg(icoPlace === 'right' ? 'right' : (icoPlace === 'full' ? 'full' : 'inline'), [
        { val: 'inline', label: 'Coluna Esquerda', icon: COL_ICON.left },
        { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
        { val: 'right', label: 'Coluna Direita', icon: COL_ICON.right },
      ], (v) => {
        setBlockPlacement(b.id, v);
        openIconBlockPanel();
      }));
    }
  }

  iconPanel.querySelector('[data-a="pick"]').addEventListener('click', (e) => {
    e.preventDefault();
    const o = materialOptsFrom(b, mode);
    openMaterialIconPop(e.currentTarget, (key, meta) => {
      if (!key && mode === 'icon') return;
      if (!key) {
        clearHeadIconFields(b);
        save(); scheduleCommit(); reopen();
        return;
      }
      // key já vem no formato da família escolhida no picker;
      // applyMaterialOpts remapeia se só a family mudar sem key novo
      const nextFam = meta?.family || o.family;
      b.icon = key;
      if (mode === 'head') delete b.iconSet;
      applyMaterialOpts(b, { family: nextFam }, mode);
      // se a lib mudou e o pick não trouxe nome mapeado (edge), força resolve
      const resolved = resolveIconName(b.icon, nextFam, b.icon);
      if (resolved) b.icon = resolved;
      save(); scheduleCommit();
      reopen();
    }, name, {
      allowNone: mode === 'head',
      family: o.family,
      fill: o.fill, weight: o.weight, grade: o.grade, opsz: o.opsz, shape: o.shape,
      stroke: o.stroke,
    });
  });

  const cf = iconPanel.querySelector('[data-a="color"]');
  cf.addEventListener('click', () => openSwatchPop(cf, (hex) => {
    applyMaterialOpts(b, { color: hex }, mode);
    cf.style.background = hex;
    paintLive(); save(); scheduleCommit();
  }, ms.color));

  const wireNum = (role, field, clamp) => {
    const span = iconPanel.querySelector(`[data-role="${role}"]`);
    const range = iconPanel.querySelector(`input[data-a="${field}"]`);
    const paint = (raw, { syncText = true } = {}) => {
      const n = clamp(raw);
      applyMaterialOpts(b, { [field]: n }, mode);
      if (syncText && span && document.activeElement !== span) span.textContent = String(n);
      if (range && document.activeElement !== range) range.value = String(n);
      paintLive(); save(); scheduleCommit();
    };
    if (span) {
      wireFieldEditKeys(span, {
        onInput: (raw) => {
          const n = Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
          if (!Number.isFinite(n)) return;
          paint(n, { syncText: false });
        },
        onCommit: (raw) => {
          const n = Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
          paint(Number.isFinite(n) ? n : materialOptsFrom(b, mode)[field], { syncText: true });
          span.textContent = String(materialOptsFrom(b, mode)[field]);
        },
        onCancel: () => {
          const v = materialOptsFrom(b, mode)[field];
          span.textContent = String(v);
          paint(v, { syncText: true });
        },
      });
    }
    return paint;
  };
  const paintWeight = !isTabler ? wireNum('weightv', 'weight', clampMsWeight) : null;
  const paintGrade = !isTabler ? wireNum('gradev', 'grade', clampMsGrade) : null;
  const paintOpsz = !isTabler ? wireNum('opszv', 'opsz', clampMsOpsz) : null;
  const paintStroke = isTabler ? wireNum('strokev', 'stroke', clampTablerStroke) : null;
  const paintSize = mode === 'icon' ? wireNum('sizev', 'size', clampMsSize) : null;

  iconPanel.querySelectorAll('.resetbtn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });
  enhanceAll(iconPanel);

  iconPanel.querySelectorAll('button[data-a], input[data-a]').forEach((el) => {
    if (el.dataset.a === 'pick' || el.dataset.a === 'color') return;
    const isRange = el.type === 'range';
    el.addEventListener(isRange ? 'input' : 'click', () => {
      const a = el.dataset.a;
      if (a === 'weight' && paintWeight) { paintWeight(+el.value); return; }
      if (a === 'weightreset' && paintWeight) { paintWeight(MS_DEFAULTS.weight); return; }
      if (a === 'grade' && paintGrade) { paintGrade(+el.value); return; }
      if (a === 'gradereset' && paintGrade) { paintGrade(MS_DEFAULTS.grade); return; }
      if (a === 'opsz' && paintOpsz) { paintOpsz(+el.value); return; }
      if (a === 'opszreset' && paintOpsz) { paintOpsz(MS_DEFAULTS.opsz); return; }
      if (a === 'stroke' && paintStroke) { paintStroke(+el.value); return; }
      if (a === 'strokereset' && paintStroke) { paintStroke(MS_DEFAULTS.stroke); return; }
      if (a === 'size' && paintSize) { paintSize(+el.value); return; }
      if (a === 'sizereset' && paintSize) { paintSize(MS_DEFAULTS.size); return; }
      if (a === 'fill') {
        // Tabler não tem filled — control só existe no HTML Material
        const on = el.getAttribute('aria-checked') !== 'true';
        el.setAttribute('aria-checked', String(on));
        applyMaterialOpts(b, { fill: on }, mode);
        paintLive(); save(); scheduleCommit();
        return;
      }
      if (a === 'del') {
        if (mode === 'head') {
          clearHeadIconFields(b);
          save(); scheduleCommit();
          render({ id: b.id, role: 'block', offset: 0 });
          openIconBlockPanel(); // volta ao estado "Adicionar ícone"
        } else {
          const i = idxOf(b.id);
          if (i >= 0) state.doc.blocks.splice(i, 1);
          state.activeId = null;
          closeIconBlockPanel();
          render();
        }
      }
    });
  });
  positionIconBlockPanel();
}
function positionIconBlockPanel() {
  if (!iconPanel || iconPanel.hidden) return;
  const b = state.activeId && blockOf(state.activeId);
  if (!b) return;
  const mode = iconPanel.dataset.mode;
  const el = mode === 'head'
    ? pagesEl.querySelector(`.head-wrap[data-id="${b.id}"], [data-id="${b.id}"]`)
    : pagesEl.querySelector(`.icon-block[data-id="${b.id}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pw = iconPanel.offsetWidth || 220, ph = iconPanel.offsetHeight || 280;
  let x = r.right + 10;
  if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 10);
  const y = Math.min(Math.max(8, r.top), innerHeight - ph - 8);
  iconPanel.style.left = x + 'px'; iconPanel.style.top = y + 'px';
}

// #file: fallback sem File System Access API (Safari/Firefox) — pickFile() ainda usa
// quando o handle some (Salvar no arquivo / reimportar). Sem botão "Importar Texto".
document.getElementById('file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    clearFileLink();
    state.doc.source = { kind: 'file', label: f.name, format: 'md' };
    setBlocks(parseMarkdown(r.result));
  };
  r.readAsText(f); e.target.value = '';
});
document.getElementById('btnOpen').addEventListener('click', (e) => {
  e.preventDefault();
  pickProjectFile();
});
// #fileProject: fallback sem FSA (Safari/Firefox) — sem handle → offerSync se não for linkNow
document.getElementById('fileProject').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  const linkNow = e.target.dataset.linkNow === '1';
  e.target.value = '';
  e.target.dataset.linkNow = '';
  if (!f) {
    showToast('err', 'Nenhum arquivo selecionado',
      'O seletor fechou sem um arquivo. Tente de novo em Abrir .zip.');
    return;
  }
  // desvincula anterior só após escolha (input change = já escolheu)
  clearFileLink();
  openProjectBlob(f, null, { offerSync: !linkNow, linkNow: false }).catch((err) => {
    console.error('[abrir projeto] change handler', err);
    showToast('err', 'Não foi possível abrir o arquivo',
      (err && err.message) || String(err),
      { fileName: f.name, fileSize: f.size });
  });
});
document.getElementById('imgfile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) {
    if (pendingGridPick) setGridItemFromFile(f, pendingGridPick.blockId, pendingGridPick.itemIndex);
    else if (replaceImageId) replaceImageFile(f, replaceImageId);
    else addImageFile(f, pendingImgPlacement);
  } else {
    pendingCoverImageId = null;   // cancelou o picker da capa
  }
  pendingImgPlacement = null;
  replaceImageId = null;
  pendingGridPick = null;
  e.target.value = '';
});
document.getElementById('btnNew').addEventListener('click', () => {
  const linked = isProjectLinked();
  const msg = linked
    ? 'Começar um projeto em branco?\n\nO arquivo .zip atual será desvinculado (não será apagado nem sobrescrito). O novo documento fica sem auto-sync até você vincular outro arquivo.'
    : 'Limpar o documento atual e começar em branco?';
  if (!confirm(msg)) return;
  // desvincula PRIMEIRO (cancela autosave pendente) — senão o timer grava o doc vazio no .zip
  state.doc.source = null;
  clearFileLink();
  idb.del('doc');
  state.doc = seedDoc();
  document.getElementById('footText').value = state.doc.footText;
  document.getElementById('headText').value = state.doc.headText || '';
  document.getElementById('firstPage').value = state.doc.firstPage;
  syncRuleUI();
  syncFootChromeUI();
  syncPageBgUI();
  syncColLeftUI();
  syncSpecialUI();
  setBlocks(state.doc.blocks);
  updateSaveSourceBtn();
});
document.getElementById('footText').addEventListener('input', (e) => { state.doc.footText = e.target.value; render(); });
document.getElementById('headText').addEventListener('input', (e) => { state.doc.headText = e.target.value; render(); });
document.getElementById('firstPage').addEventListener('input', (e) => { state.doc.firstPage = +e.target.value || 0; render(); });

// espessura das linhas de moldura (cabeçalho / rodapé) — ao vivo, sem re-render
function syncRuleUI() {
  const t = ruleWidthOf('top'), b = ruleWidthOf('bot');
  const rt = document.getElementById('ruleTop'), rb = document.getElementById('ruleBot');
  const rtv = document.getElementById('ruleTopv'), rbv = document.getElementById('ruleBotv');
  if (rt) rt.value = String(t);
  if (rb) rb.value = String(b);
  if (rtv) rtv.textContent = formatRulePx(t);
  if (rbv) rbv.textContent = formatRulePx(b);
}
function bindRuleSlider(which) {
  const id = which === 'bot' ? 'ruleBot' : 'ruleTop';
  const vid = which === 'bot' ? 'ruleBotv' : 'ruleTopv';
  const rid = which === 'bot' ? 'ruleBotReset' : 'ruleTopReset';
  const field = which === 'bot' ? 'ruleBot' : 'ruleTop';
  const range = document.getElementById(id);
  const disp = document.getElementById(vid);
  const reset = document.getElementById(rid);
  if (range) range.addEventListener('input', () => {
    const n = clampRuleW(range.value);
    // sempre persiste (não apaga no default): ausência no .zip = legado 1px, não 0.5
    state.doc[field] = n;
    if (disp) disp.textContent = formatRulePx(n);
    paintPageRules();
    save(); scheduleCommit();
  });
  if (reset) {
    reset.addEventListener('mousedown', (e) => e.preventDefault());
    reset.addEventListener('click', () => {
      state.doc[field] = RULE_W_DEFAULT;
      if (range) range.value = String(RULE_W_DEFAULT);
      if (disp) disp.textContent = formatRulePx(RULE_W_DEFAULT);
      paintPageRules();
      save(); scheduleCommit();
    });
  }
}
bindRuleSlider('top');
bindRuleSlider('bot');

// cores efetivas do rodapé (defaults do CSS histórico se o campo faltar)
function pnumColorOf() {
  return state.doc?.pnumColor || PNUM_COLOR_DEFAULT;
}
function footColorOf() {
  return state.doc?.footColor || FOOT_COLOR_DEFAULT;
}
/** Pinta .pnum / .site ao vivo (sem re-paginar). */
function paintFootColors() {
  const pc = pnumColorOf(), fc = footColorOf();
  pagesEl.querySelectorAll('.foot .pnum').forEach(el => { el.style.color = pc; });
  pagesEl.querySelectorAll('.foot .site').forEach(el => { el.style.color = fc; });
}

// alinhamento do cabeçalho/nº/texto do rodapé + cores + switcher Modo Impressão
function syncFootChromeUI() {
  const headSlot = document.querySelector('[data-slot="headalign"]');
  if (headSlot) headSlot.replaceChildren(widthSeg(clampFootAlign(state.doc.headAlign || 'left'), [
    { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
    { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
    { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
  ], (v) => { state.doc.headAlign = v; syncFootChromeUI(); render(); }));
  const pnumSlot = document.querySelector('[data-slot="pnumalign"]');
  if (pnumSlot) pnumSlot.replaceChildren(widthSeg(clampFootAlign(state.doc.pnumAlign || 'left'), [
    { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
    { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
    { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
  ], (v) => { state.doc.pnumAlign = v; syncFootChromeUI(); render(); }));
  const footSlot = document.querySelector('[data-slot="footalign"]');
  if (footSlot) footSlot.replaceChildren(widthSeg(clampFootAlign(state.doc.footAlign || 'right'), [
    { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
    { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
    { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
  ], (v) => { state.doc.footAlign = v; syncFootChromeUI(); render(); }));
  const pnumCf = document.getElementById('pnumColor');
  if (pnumCf) pnumCf.style.background = pnumColorOf();
  const footCf = document.getElementById('footColor');
  if (footCf) footCf.style.background = footColorOf();
  const pm = document.getElementById('printMirror');
  if (pm) pm.setAttribute('aria-checked', String(!!state.doc.printMirror));
}
document.getElementById('pnumColor')?.addEventListener('click', () => {
  const btn = document.getElementById('pnumColor');
  if (!btn) return;
  openSwatchPop(btn, (hex) => {
    state.doc.pnumColor = hex;
    btn.style.background = hex;
    paintFootColors();
    save(); scheduleCommit();
  }, pnumColorOf());
});
document.getElementById('footColor')?.addEventListener('click', () => {
  const btn = document.getElementById('footColor');
  if (!btn) return;
  openSwatchPop(btn, (hex) => {
    state.doc.footColor = hex;
    btn.style.background = hex;
    paintFootColors();
    save(); scheduleCommit();
  }, footColorOf());
});
document.getElementById('printMirror')?.addEventListener('click', () => {
  state.doc.printMirror = !state.doc.printMirror;
  const pm = document.getElementById('printMirror');
  if (pm) pm.setAttribute('aria-checked', String(!!state.doc.printMirror));
  render();
});

// cor de fundo global do PDF — swatch com opacidade, preview sobre papel
function syncPageBgUI() {
  paintPageBgChip(document.getElementById('pageBg'), pageBgOf());
}
document.getElementById('pageBg')?.addEventListener('click', () => {
  const btn = document.getElementById('pageBg');
  if (!btn) return;
  openSwatchPop(btn, (color) => {
    const p = parseColor(color);
    state.doc.pageBg = p ? withAlpha(p.hex, p.alpha) : DEFAULT_PAGE_BG;
    syncPageBgUI();
    // pinta ao vivo sem re-paginar (miolo/capa intactos)
    pagesEl.querySelectorAll('.page').forEach(applyPageBg);
    save(); scheduleCommit();
  }, pageBgOf(), { paper: true });   // opacity default on; paper = preview no branco
});

// largura da coluna esquerda do miolo (slider).
// Track = COL_L_MIN…COL_L_MAX (160…360): min na extrema esquerda, max na direita.
// Valor = px da coluna esquerda; a direita é o complemento (499 − 24 − colLeft).
function formatColLeftLabel(n) {
  return clampColL(n) + 'px';
}
function syncColLeftUI() {
  const v = colL();
  const range = document.getElementById('colLeft');
  const disp = document.getElementById('colLeftv');
  if (range) {
    range.min = String(COL_L_MIN);
    range.max = String(COL_L_MAX);
    range.value = String(v);
  }
  if (disp) disp.textContent = formatColLeftLabel(v);
}
function setColLeft(n) {
  state.doc.colLeft = clampColL(n);
  syncColLeftUI();
  render();   // re-mede e re-pagina (texto reflow muda altura)
}
document.getElementById('colLeft')?.addEventListener('input', (e) => {
  setColLeft(e.target.value);
});
document.getElementById('colLeftReset')?.addEventListener('mousedown', (e) => e.preventDefault());
document.getElementById('colLeftReset')?.addEventListener('click', () => {
  setColLeft(COL_L_DEFAULT);
});

// ── páginas especiais: switches + controles de capa/contracapa ──
const specialObj = (key) => key === 'cover' ? state.doc.cover : key === 'back' ? state.doc.back : state.doc.index;

// Reveal animado na sidebar (switchers, logo, fundo).
// height + opacity: `hidden`/display:none não anima; medimos scrollHeight e deslizamos.
// Antes de sidebarRevealReady (1º paint), aplica estado sem transição pra não “piscar” a UI.
// Abas Documento/Conteúdo usam setSidebarFade (só opacity) — ver setSegment.
let sidebarRevealReady = false;
const SB_REVEAL_MS = 260;
const SB_REVEAL_EASE = 'cubic-bezier(.4, 0, .2, 1)';
const SB_FADE_MS = 200;

/** Fade in/out sem mexer na altura (troca Documento ↔ Conteúdo). */
function setSidebarFade(el, open) {
  if (!el) return;
  const want = !!open;
  const key = want ? '1' : '0';
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const instant = !sidebarRevealReady || reduced;

  if (el.dataset.sbOpen === undefined) {
    el.dataset.sbOpen = key;
    el.hidden = !want;
    return;
  }
  if (el.dataset.sbOpen === key && !el.classList.contains('sb-fading')) {
    el.hidden = !want;
    return;
  }
  if (typeof el._sbFadeCleanup === 'function') el._sbFadeCleanup();

  el.dataset.sbOpen = key;

  if (instant) {
    el.hidden = !want;
    el.style.opacity = el.style.transition = el.style.zIndex = '';
    el.classList.remove('sb-fading');
    return;
  }

  const clearInline = () => {
    el.style.opacity = '';
    el.style.transition = '';
    el.style.zIndex = '';
    el.classList.remove('sb-fading');
    el._sbFadeCleanup = null;
  };

  if (want) {
    el.hidden = false;
    el.classList.add('sb-fading');
    el.style.zIndex = '1'; // entra por cima do que está saindo
    el.style.opacity = '0';
    void el.offsetHeight;
    el.style.transition = `opacity ${SB_FADE_MS}ms ease`;
    el.style.opacity = '1';
    let tid = 0;
    const finish = () => {
      if (el.dataset.sbOpen !== '1') return;
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      clearInline();
    };
    const onEnd = (e) => {
      if (e.target !== el || e.propertyName !== 'opacity') return;
      finish();
    };
    el.addEventListener('transitionend', onEnd);
    tid = setTimeout(finish, SB_FADE_MS + 40);
    el._sbFadeCleanup = () => {
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      clearInline();
    };
  } else {
    el.hidden = false;
    el.classList.add('sb-fading');
    el.style.zIndex = '0';
    el.style.opacity = '1';
    void el.offsetHeight;
    el.style.transition = `opacity ${SB_FADE_MS}ms ease`;
    el.style.opacity = '0';
    let tid = 0;
    const finish = () => {
      if (el.dataset.sbOpen !== '0') return;
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      el.hidden = true;
      clearInline();
    };
    const onEnd = (e) => {
      if (e.target !== el || e.propertyName !== 'opacity') return;
      finish();
    };
    el.addEventListener('transitionend', onEnd);
    tid = setTimeout(finish, SB_FADE_MS + 40);
    el._sbFadeCleanup = () => {
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      clearInline();
    };
  }
}

function setSidebarReveal(el, open) {
  if (!el) return;
  const want = !!open;
  const key = want ? '1' : '0';
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const instant = !sidebarRevealReady || reduced;

  // 1ª atribuição: só grava o estado (sem animar — cobre o 1º paint e nós novos)
  if (el.dataset.sbOpen === undefined) {
    el.dataset.sbOpen = key;
    el.hidden = !want;
    return;
  }
  // já no estado desejado e parado → só garante hidden
  if (el.dataset.sbOpen === key && !el.classList.contains('sb-revealing')) {
    el.hidden = !want;
    return;
  }

  // cancela animação em voo (toggle rápido / reverse)
  if (typeof el._sbRevealCleanup === 'function') el._sbRevealCleanup();

  el.dataset.sbOpen = key;

  if (instant) {
    el.hidden = !want;
    el.style.height = el.style.opacity = el.style.overflow = el.style.transition = '';
    el.classList.remove('sb-revealing');
    return;
  }

  const clearInline = () => {
    el.style.height = '';
    el.style.opacity = '';
    el.style.overflow = '';
    el.style.transition = '';
    el.classList.remove('sb-revealing');
    el._sbRevealCleanup = null;
  };

  if (want) {
    el.hidden = false;
    el.classList.add('sb-revealing');
    el.style.overflow = 'hidden';
    el.style.opacity = '0';
    el.style.height = 'auto';
    const h = el.scrollHeight;
    el.style.height = '0px';
    void el.offsetHeight;
    el.style.transition = `height ${SB_REVEAL_MS}ms ${SB_REVEAL_EASE}, opacity ${Math.round(SB_REVEAL_MS * 0.85)}ms ease`;
    el.style.height = h + 'px';
    el.style.opacity = '1';
    let tid = 0;
    const finish = () => {
      if (el.dataset.sbOpen !== '1') return;
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      clearInline();
    };
    const onEnd = (e) => {
      if (e.target !== el) return;
      if (e.propertyName !== 'height' && e.propertyName !== 'opacity') return;
      finish();
    };
    el.addEventListener('transitionend', onEnd);
    tid = setTimeout(finish, SB_REVEAL_MS + 40);
    el._sbRevealCleanup = () => {
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      clearInline();
    };
  } else {
    el.hidden = false;
    el.classList.add('sb-revealing');
    el.style.overflow = 'hidden';
    el.style.opacity = '1';
    el.style.height = el.scrollHeight + 'px';
    void el.offsetHeight;
    el.style.transition = `height ${SB_REVEAL_MS}ms ${SB_REVEAL_EASE}, opacity ${Math.round(SB_REVEAL_MS * 0.85)}ms ease`;
    el.style.height = '0px';
    el.style.opacity = '0';
    let tid = 0;
    const finish = () => {
      if (el.dataset.sbOpen !== '0') return;
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      el.hidden = true;
      clearInline();
    };
    const onEnd = (e) => {
      if (e.target !== el) return;
      if (e.propertyName !== 'height' && e.propertyName !== 'opacity') return;
      finish();
    };
    el.addEventListener('transitionend', onEnd);
    tid = setTimeout(finish, SB_REVEAL_MS + 40);
    el._sbRevealCleanup = () => {
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      clearInline();
    };
  }
}

function syncSubCtrl() {
  // 'resumo' não tem specialObj/.on próprio — mora em index.resumoOn (mesmo caso especial de syncSpecialUI)
  document.querySelectorAll('.subctrl[data-sub]').forEach(el => {
    const k = el.dataset.sub;
    setSidebarReveal(el, k === 'resumo' ? state.doc.index.resumoOn : specialObj(k).on);
  });
  // Espaçar sessões: só com Índice E Resumo ligados (senão não há "entre" o que espaçar)
  const espRow = document.querySelector('[data-espacar-row]');
  if (espRow) {
    const idx = state.doc.index;
    setSidebarReveal(espRow, !!(idx && idx.on && idx.resumoOn));
  }
}
function syncSpecialUI() {
  // t2.11: 'resumo' não é mais um specialObj com .on próprio — é state.doc.index.resumoOn.
  document.querySelectorAll('.sw[data-sw]').forEach(sw => {
    const key = sw.dataset.sw;
    const checked = key === 'resumo' ? state.doc.index.resumoOn : specialObj(key).on;
    sw.setAttribute('aria-checked', String(checked));
  });
  // opções do índice (níveis / cores / larguras): abrir um .pdgm tem que trazer a UI junto
  document.querySelectorAll('.sw[data-idxlvl]').forEach(sw => {
    sw.setAttribute('aria-checked', String(!!(state.doc.index.levels || {})[sw.dataset.idxlvl]));
  });
  document.querySelectorAll('.sw[data-idxespacar]').forEach(sw => {
    sw.setAttribute('aria-checked', String(!!state.doc.index.espacarSessoes));
  });
  // Regras do Miolo (paginação)
  {
    const rules = mioloRulesOf();
    document.querySelectorAll('.sw[data-miolorule]').forEach(sw => {
      const k = sw.dataset.miolorule;
      sw.setAttribute('aria-checked', String(!!rules[k]));
    });
  }
  ensureIndexColors(state.doc.index);
  document.querySelectorAll('select[data-idxopt]').forEach(s => { s.value = state.doc.index[s.dataset.idxopt]; });
  // pickers Custom do índice: só visíveis com color==='custom'
  const idxCustomOn = state.doc.index.color === 'custom';
  document.querySelectorAll('[data-idxcolors]').forEach(el => {
    setSidebarReveal(el, idxCustomOn);
  });
  document.querySelectorAll('[data-idxcolor]').forEach(cf => {
    const key = cf.dataset.idxcolor;
    const hex = state.doc.index.colors[key] || INDEX_COLOR_DEFAULTS[key];
    if (key === 'line') paintIdxColorField(cf, hex);
    else {
      cf.classList.remove('paper');
      cf.style.removeProperty('--sp-ov');
      cf.style.background = hex;
    }
  });
  // largura do índice e do resumo: segment de ícone, não <select> — rebuild é mais barato que
  // um setter (mesmo idioma do #blockcol/widthSeg: o componente não guarda estado próprio).
  const iwSlot = document.querySelector('[data-slot="idxwidth"]');
  if (iwSlot) iwSlot.replaceChildren(widthSeg(state.doc.index.width, [
    { val: 'curto', label: 'Curto', icon: COL_ICON.left },
    { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
  ], (v) => { state.doc.index.width = v; syncSpecialUI(); render(); }));
  const rwSlot = document.querySelector('[data-slot="resumowidth"]');
  if (rwSlot) rwSlot.replaceChildren(widthSeg(state.doc.index.resumoWidth, [
    { val: 'left', label: 'Coluna Esquerda', icon: COL_ICON.left },
    { val: 'full', label: 'Largura Total', icon: COL_ICON.full },
  ], (v) => { state.doc.index.resumoWidth = v; syncSpecialUI(); render(); }));
  document.querySelectorAll('[data-bgx]').forEach(s => { s.value = specialObj(s.dataset.bgx).bgX ?? 50; });
  document.querySelectorAll('[data-bgy]').forEach(s => { s.value = specialObj(s.dataset.bgy).bgY ?? 50; });
  document.querySelectorAll('[data-bgscale]').forEach(s => { s.value = specialObj(s.dataset.bgscale).bgScale ?? 100; });
  document.querySelectorAll('[data-bgscalev]').forEach(sp => { sp.textContent = ((specialObj(sp.dataset.bgscalev).bgScale ?? 100) / 100).toFixed(2) + '×'; });
  // Fill/Fit do fundo da capa/contracapa
  document.querySelectorAll('[data-slot="bgfit"]').forEach(slot => {
    const kind = slot.dataset.kind;
    const cov = specialObj(kind);
    ensureCoverBgFit(cov);
    slot.replaceChildren(widthSeg(cov.bgFit || 'fill', [
      { val: 'fill', label: 'Fill (preenche e recorta)', icon: BG_FIT_ICON.fill },
      { val: 'fit', label: 'Fit (imagem inteira)', icon: BG_FIT_ICON.fit },
    ], (v) => {
      specialObj(kind).bgFit = v;
      applyCoverBgStylesLive(kind);
      syncSpecialUI();
      save(); scheduleCommit();
    }));
  });
  // "Selecionar" vs "Substituir + Remover" são mutuamente exclusivos — com imagem, os
  // fieldbtns (mesmo do popover de imagem) tomam o lugar do botão de arquivo.
  document.querySelectorAll('[data-bgbtn]').forEach(b => {
    setSidebarReveal(b, specialObj(b.dataset.bgbtn).bg == null);
  });
  document.querySelectorAll('[data-bgactions]').forEach(el => {
    setSidebarReveal(el, specialObj(el.dataset.bgactions).bg != null);
  });
  // fundo Fill/Fit + ↔/↕/escala só fazem sentido com uma imagem selecionada
  document.querySelectorAll('[data-bgxform]').forEach(el => {
    setSidebarReveal(el, specialObj(el.dataset.bgxform).bg != null);
  });
  syncSubCtrl();
  syncLogoUI();
}

// ícones Fill (cover) / Fit (contain) pro segment da imagem de fundo
const BG_FIT_ICON = {
  // quadro preenchido = Fill (cobre a página, pode recortar)
  fill: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="currentColor"/></svg>',
  // quadro vazio + retângulo menor = Fit (imagem inteira, com sobra)
  fit: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="4.5" y="5" width="7" height="6" rx="0.6" fill="currentColor"/></svg>',
};
/** Aplica bgFit/pos/scale ao vivo no .cover-bg (sem re-render). */
function applyCoverBgStylesLive(kind) {
  const cov = specialObj(kind);
  const bg = pagesEl.querySelector(`.page[data-cover="${kind}"] .cover-bg`);
  if (bg) applyCoverBgStyles(bg, cov);
}
// espelha o campo logo (de cada capa) na sidebar. "none" = logo desligado; os opts
// (posição/alinhamento/cor/tamanho) só aparecem com o logo ligado.
function syncLogoUI() {
  document.querySelectorAll('[data-logopick]').forEach(pick => {
    const lg = specialObj(pick.dataset.logopick).logo;
    const active = lg.on ? lg.kind : 'none';
    pick.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.logokind === active)));
  });
  document.querySelectorAll('[data-logoopts]').forEach(o => {
    setSidebarReveal(o, !!specialObj(o.dataset.logoopts).logo.on);
  });
  // posição vertical + alinhamento: segments de ícone (widthSeg) — rebuild a cada sync,
  // como idxwidth/resumowidth. Posição: header (topo) / footer (base).
  document.querySelectorAll('[data-slot="logopos"]').forEach(slot => {
    const kind = slot.dataset.kind;
    const lg = specialObj(kind).logo;
    slot.replaceChildren(widthSeg(lg.pos === 'footer' ? 'footer' : 'header', [
      { val: 'header', label: 'Cabeçalho (topo)', icon: POS_ICON.header },
      { val: 'footer', label: 'Rodapé (base)', icon: POS_ICON.footer },
    ], (v) => {
      lg.pos = v; syncLogoUI(); render();
      if (state.sel === logoSelOf(kind)) openLogoPanel(kind);
    }));
  });
  document.querySelectorAll('[data-slot="logoalign"]').forEach(slot => {
    const kind = slot.dataset.kind;
    const lg = specialObj(kind).logo;
    slot.replaceChildren(widthSeg(lg.align || 'left', [
      { val: 'left', label: 'Esquerda', icon: ALIGN_ICON.left },
      { val: 'center', label: 'Centro', icon: ALIGN_ICON.center },
      { val: 'right', label: 'Direita', icon: ALIGN_ICON.right },
    ], (v) => {
      lg.align = v; syncLogoUI(); render();
      if (state.sel === logoSelOf(kind)) openLogoPanel(kind);
    }));
  });
  document.querySelectorAll('[data-logocolor]').forEach(b => { b.style.background = specialObj(b.dataset.logocolor).logo.color; });
  document.querySelectorAll('[data-logosize]').forEach(s => { s.value = Math.round((specialObj(s.dataset.logosize).logo.size || 1) * 100); });
  document.querySelectorAll('[data-logosizev]').forEach(sp => { sp.textContent = (+(specialObj(sp.dataset.logosizev).logo.size || 1).toFixed(2)) + '×'; });
}
// escala ao vivo (sem re-render, como os sliders de fundo) — só redimensiona o <svg> já montado
function applyCoverLogoLive(kind) {
  const lg = specialObj(kind).logo;
  const svg = pagesEl.querySelector(`.page[data-cover="${kind}"] .cover-logo svg`);
  if (!svg) { if (lg.on) render(); return; }        // logo ainda não existe no DOM → render normal
  const L = LOGOS[lg.kind]; if (!L) return;
  const h = LOGO_BASE_H * (lg.size || 1);
  svg.setAttribute('height', +h.toFixed(1)); svg.setAttribute('width', +(h * (L.w / L.h)).toFixed(1));
}
// aplica posição + escala + fill/fit no .cover-bg (render e sliders ao vivo). Ver renderCoverPage.
// Scale = valor do usuário. Sangria de 1px fica no CSS (.cover-bg), não no scale.
// bgFit:
//   'fill' → cover + position % (crop nativo)
//   'fit'  → contain centrado + translate em % do elemento (0/100 = ±100% da página)
//           → permite pan além do limite e crop pelo overflow:hidden da .cover-page
function applyCoverBgStyles(bg, cov) {
  const x = cov.bgX ?? 50, y = cov.bgY ?? 50;
  const s = (cov.bgScale ?? 100) / 100;
  const fit = cov.bgFit === 'fit';
  bg.classList.toggle('bg-fit', fit);
  if (fit) {
    bg.style.backgroundSize = 'contain';
    bg.style.backgroundPosition = 'center center';
    bg.style.transformOrigin = 'center center';
    // 50,50 = sem pan; 0 ou 100 = desloca 100% da própria caixa (sai da página e cropa)
    const tx = ((x - 50) / 50) * 100;
    const ty = ((y - 50) / 50) * 100;
    bg.style.transform = `translate(${tx}%, ${ty}%) scale(${s})`;
  } else {
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = `${x}% ${y}%`;
    bg.style.transformOrigin = `${x}% ${y}%`;
    bg.style.transform = `scale(${s})`;
  }
}
// reposiciona o fundo ao vivo (sem re-render) — Fill com controle X/Y (+ origem do zoom)
function applyCoverBgPos(kind) {
  const cov = specialObj(kind);
  const bg = pagesEl.querySelector(`.page[data-cover="${kind}"] .cover-bg`);
  if (bg) applyCoverBgStyles(bg, cov);
}
// idem, pro zoom (mesmo padrão do applyCoverBgPos — arrastar o slider não deve remontar a página)
function applyCoverBgScale(kind) {
  const cov = specialObj(kind);
  const bg = pagesEl.querySelector(`.page[data-cover="${kind}"] .cover-bg`);
  if (bg) applyCoverBgStyles(bg, cov);
}
document.querySelectorAll('.sw[data-sw]').forEach(sw => sw.addEventListener('click', () => {
  // t2.11: 'resumo' mora em state.doc.index.resumoOn (não tem specialObj/.on próprio) —
  // menor mudança correta é um caso especial aqui em vez de generalizar specialObj().
  if (sw.dataset.sw === 'resumo') {
    state.doc.index.resumoOn = !state.doc.index.resumoOn;
    sw.setAttribute('aria-checked', String(state.doc.index.resumoOn));
  } else {
    const obj = specialObj(sw.dataset.sw);
    obj.on = !obj.on; sw.setAttribute('aria-checked', String(obj.on));
  }
  syncSubCtrl(); render();
}));
// níveis de título que entram no índice (H1/H2) — switch próprio, fora do specialObj
document.querySelectorAll('.sw[data-idxlvl]').forEach(sw => sw.addEventListener('click', () => {
  const lv = (state.doc.index.levels ||= { h1: true, h2: true }), k = sw.dataset.idxlvl;
  lv[k] = !lv[k]; sw.setAttribute('aria-checked', String(lv[k]));
  render();
}));
// Espaçar sessões: space-between Índice ↔ Resumo (só aplica com os dois ligados no render)
document.querySelectorAll('.sw[data-idxespacar]').forEach(sw => sw.addEventListener('click', () => {
  state.doc.index.espacarSessoes = !state.doc.index.espacarSessoes;
  sw.setAttribute('aria-checked', String(!!state.doc.index.espacarSessoes));
  render();
}));
// Regras do Miolo — paginação (H1 em página nova / títulos com conteúdo)
document.querySelectorAll('.sw[data-miolorule]').forEach(sw => sw.addEventListener('click', () => {
  const rules = ensureMioloRules(state.doc);
  const k = sw.dataset.miolorule;
  if (k !== 'h1NewPage' && k !== 'headKeepWithNext') return;
  rules[k] = !rules[k];
  sw.setAttribute('aria-checked', String(!!rules[k]));
  render(); // re-pagina
}));
// cores / largura do índice / largura do resumo: o value do <select> É o valor guardado
document.querySelectorAll('select[data-idxopt]').forEach(s => s.addEventListener('change', () => {
  state.doc.index[s.dataset.idxopt] = s.value;
  if (s.dataset.idxopt === 'color' && s.value === 'custom') ensureIndexColors(state.doc.index);
  syncSpecialUI();
  render();
  // se o painel flutuante do índice está aberto, reconstrói pra mostrar pickers
  if (s.dataset.idxopt === 'color' && idxFocus === 'index') openIdxPanel();
}));
// pickers de cor Custom do índice (sidebar Documento)
document.querySelectorAll('[data-idxcolor]').forEach(cf => {
  cf.addEventListener('click', () => {
    ensureIndexColors(state.doc.index);
    const key = cf.dataset.idxcolor;
    const cur = state.doc.index.colors[key] || INDEX_COLOR_DEFAULTS[key];
    const swatchOpts = key === 'line' ? { paper: true } : undefined;
    openSwatchPop(cf, (hex) => {
      state.doc.index.colors[key] = hex;
      if (key === 'line') paintIdxColorField(cf, hex);
      else cf.style.background = hex;
      pagesEl.querySelectorAll('.toc.toc-custom').forEach(list => applyIndexCustomColors(list, state.doc.index));
      // espelha no painel flutuante se aberto
      if (idxPanel && !idxPanel.hidden) {
        const p = idxPanel.querySelector(`.colorfield[data-idxc="${key}"]`);
        if (p) {
          if (key === 'line') paintIdxColorField(p, hex);
          else p.style.background = hex;
        }
      }
      save(); scheduleCommit();
    }, cur, swatchOpts);
  });
});
// t2.10: tooltip nativo (title=) no ícone "ⓘ" ao lado de "Índice + Resumo" — preventDefault
// no click evita que a ativação do botão borbulhe pro <summary> e togglar o <details> junto.
// ⓘ em summary ou ao lado de switchers: não toggle details; tooltip fixed no body
// (sidebar overflow:hidden/auto corta ::after absoluto — ver .info-tip-float).
document.querySelectorAll('.infoicon').forEach(el => el.addEventListener('click', (e) => e.preventDefault()));
(function bindInfoTips() {
  let tip = null, active = null, hideT = 0;
  const ensure = () => {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'info-tip-float';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  };
  const place = (btn) => {
    const el = ensure();
    const text = btn.getAttribute('data-tip') || '';
    if (!text) { hide(); return; }
    el.textContent = text;
    el.hidden = false;
    el.style.left = '0';
    el.style.top = '0';
    // medir depois de no DOM (width fixa via CSS max)
    const br = btn.getBoundingClientRect();
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // prefere abaixo do ⓘ; se não cabe, acima
    let top = br.bottom + gap;
    if (top + th > vh - 8 && br.top - gap - th >= 8) top = br.top - gap - th;
    // alinha à esquerda do botão; gruda na viewport se estourar
    let left = br.left;
    if (left + tw > vw - 8) left = Math.max(8, vw - 8 - tw);
    if (left < 8) left = 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.classList.add('is-on');
    active = btn;
  };
  const hide = () => {
    if (!tip) return;
    tip.classList.remove('is-on');
    tip.hidden = true;
    active = null;
  };
  const scheduleHide = () => {
    clearTimeout(hideT);
    hideT = setTimeout(hide, 80);
  };
  document.querySelectorAll('.infoicon[data-tip]').forEach((btn) => {
    btn.addEventListener('mouseenter', () => { clearTimeout(hideT); place(btn); });
    btn.addEventListener('mouseleave', scheduleHide);
    btn.addEventListener('focus', () => { clearTimeout(hideT); place(btn); });
    btn.addEventListener('blur', scheduleHide);
  });
  window.addEventListener('scroll', () => { if (active) hide(); }, true);
  window.addEventListener('resize', () => { if (active) hide(); });
})();

// ── expand/collapse animado dos <details> da sidebar + restore do estado ──
// Intercepta o click no <summary> (preventDefault do toggle nativo) e anima a
// altura do .body — mesmo idioma do setSidebarReveal (height + opacity).
const DET_MS = 260;
const DET_EASE = 'cubic-bezier(.4, 0, .2, 1)';
function setDetailsOpen(det, open) {
  const body = det.querySelector(':scope > .body');
  const want = !!open;
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // chevron segue .is-open desde o INÍCIO (não espera [open] mudar no fim do close)
  const setOpenClass = (on) => det.classList.toggle('is-open', on);

  if (!body || reduced) {
    det.open = want;
    setOpenClass(want);
    delete det.dataset.detDir;
    persistSidebarSecsNow();
    return;
  }
  // cancela animação em voo; commita o estado visual do meio do caminho
  if (typeof det._detCleanup === 'function') det._detCleanup();

  if (!!det.open === want) {
    setOpenClass(want);
    persistSidebarSecsNow();
    return;
  }

  const clearInline = () => {
    body.style.height = '';
    body.style.opacity = '';
    body.style.overflow = '';
    body.style.transition = '';
    det.classList.remove('sb-det-animating');
    det._detCleanup = null;
  };

  // gira o chevron no mesmo instante em que o body começa a animar
  setOpenClass(want);

  if (want) {
    det.dataset.detDir = 'open';
    det.open = true;
    det.classList.add('sb-det-animating');
    body.style.overflow = 'hidden';
    body.style.opacity = '0';
    body.style.height = '0px';
    const h = body.scrollHeight;
    void body.offsetHeight;
    body.style.transition = `height ${DET_MS}ms ${DET_EASE}, opacity ${Math.round(DET_MS * 0.85)}ms ease`;
    body.style.height = h + 'px';
    body.style.opacity = '1';
    let tid = 0;
    const finish = () => {
      body.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      delete det.dataset.detDir;
      clearInline();
      persistSidebarSecsNow();
    };
    const onEnd = (e) => {
      if (e.target !== body) return;
      if (e.propertyName !== 'height' && e.propertyName !== 'opacity') return;
      finish();
    };
    body.addEventListener('transitionend', onEnd);
    tid = setTimeout(finish, DET_MS + 40);
    det._detCleanup = () => {
      body.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      // mid-open cancelado → mantém aberto (estado já é open=true)
      delete det.dataset.detDir;
      clearInline();
    };
  } else {
    det.dataset.detDir = 'close';
    det.classList.add('sb-det-animating');
    body.style.overflow = 'hidden';
    body.style.opacity = '1';
    body.style.height = body.scrollHeight + 'px';
    void body.offsetHeight;
    body.style.transition = `height ${DET_MS}ms ${DET_EASE}, opacity ${Math.round(DET_MS * 0.85)}ms ease`;
    body.style.height = '0px';
    body.style.opacity = '0';
    let tid = 0;
    const finish = () => {
      body.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      det.open = false;
      delete det.dataset.detDir;
      clearInline();
      persistSidebarSecsNow();
    };
    const onEnd = (e) => {
      if (e.target !== body) return;
      if (e.propertyName !== 'height' && e.propertyName !== 'opacity') return;
      finish();
    };
    body.addEventListener('transitionend', onEnd);
    tid = setTimeout(finish, DET_MS + 40);
    det._detCleanup = () => {
      body.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      // mid-close cancelado → trata como fechado pro reverse poder reabrir
      det.open = false;
      delete det.dataset.detDir;
      clearInline();
    };
  }
}
function initSidebarDetails() {
  let saved = null;
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    if (cfg.sidebarSecs && typeof cfg.sidebarSecs === 'object') saved = cfg.sidebarSecs;
  } catch {}

  document.querySelectorAll('aside details[data-sec]').forEach(det => {
    const id = det.dataset.sec;
    // migração: chave antiga "texto" → "documento";
    // "header" antigo era "Cabeçalho & rodapé" — se só ela existia, abre as duas novas
    let open;
    if (saved && Object.prototype.hasOwnProperty.call(saved, id)) open = !!saved[id];
    else if (id === 'documento' && saved && Object.prototype.hasOwnProperty.call(saved, 'texto')) open = !!saved.texto;
    else if ((id === 'header' || id === 'footer') && saved && Object.prototype.hasOwnProperty.call(saved, 'header')
      && !Object.prototype.hasOwnProperty.call(saved, 'footer')) open = !!saved.header;
    else open = !!SIDEBAR_SEC_DEFAULTS[id];
    det.open = open;
    det.classList.toggle('is-open', open);

    const sum = det.querySelector(':scope > summary');
    if (!sum) return;
    // ion-icon name="chevron-forward-outline" — gira 90° com .is-open
    if (!sum.querySelector('.det-chev')) {
      const chev = document.createElement('span');
      chev.className = 'det-chev';
      chev.setAttribute('aria-hidden', 'true');
      chev.innerHTML = uiIco('chevron-forward', 12, 'outline');
      sum.prepend(chev);
    }
    sum.addEventListener('click', (e) => {
      // ⓘ do Índice: não toggle (já tem preventDefault próprio; reforço aqui)
      if (e.target.closest('.infoicon')) return;
      e.preventDefault();
      // durante animação, inverte a direção (open ainda reflete o estado "antes" no close)
      const dir = det.dataset.detDir;
      const next = dir === 'open' ? false : dir === 'close' ? true : !det.open;
      setDetailsOpen(det, next);
    });
  });
}
document.querySelectorAll('[data-bg]').forEach(inp => inp.addEventListener('change', (e) => {
  const f = e.target.files[0]; if (f) setCoverBg(inp.dataset.bg, f); e.target.value = '';
}));
// Substituir / Remover do fundo — mesmos ícones do popover de imagem (repeat / trash outline)
document.querySelectorAll('[data-bgreplace]').forEach(el => { el.insertAdjacentHTML('afterbegin', REPLACE_ICO); });
document.querySelectorAll('[data-rmbg]').forEach(btn => {
  btn.insertAdjacentHTML('afterbegin', TRASH_ICO);
  btn.addEventListener('click', () => { specialObj(btn.dataset.rmbg).bg = null; syncSpecialUI(); render(); });
});
document.querySelectorAll('[data-bgx]').forEach(s => s.addEventListener('input', (e) => { specialObj(s.dataset.bgx).bgX = +e.target.value; applyCoverBgPos(s.dataset.bgx); save(); scheduleCommit(); }));
document.querySelectorAll('[data-bgy]').forEach(s => s.addEventListener('input', (e) => { specialObj(s.dataset.bgy).bgY = +e.target.value; applyCoverBgPos(s.dataset.bgy); save(); scheduleCommit(); }));
document.querySelectorAll('[data-bgscale]').forEach(s => s.addEventListener('input', (e) => {
  specialObj(s.dataset.bgscale).bgScale = +e.target.value; applyCoverBgScale(s.dataset.bgscale);
  const sp = document.querySelector(`[data-bgscalev="${s.dataset.bgscale}"]`);
  if (sp) sp.textContent = (+e.target.value / 100).toFixed(2) + '×';
  save(); scheduleCommit();
}));
// reset de posição do fundo — default 50 (centro), igual seed de cover/back
document.querySelectorAll('[data-bgxreset]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const kind = btn.dataset.bgxreset;
    specialObj(kind).bgX = 50;
    const s = document.querySelector(`[data-bgx="${kind}"]`); if (s) s.value = 50;
    applyCoverBgPos(kind); save(); scheduleCommit();
  });
});
document.querySelectorAll('[data-bgyreset]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const kind = btn.dataset.bgyreset;
    specialObj(kind).bgY = 50;
    const s = document.querySelector(`[data-bgy="${kind}"]`); if (s) s.value = 50;
    applyCoverBgPos(kind); save(); scheduleCommit();
  });
});
// t3.1: ícone real do logo (Ícone/Completo/Nome) no picker, no lugar do rótulo de texto —
// estático (não depende de estado), então injeta uma vez só; "Nenhum" já nasce com o próprio
// ícone (traço cruzado) direto no HTML, sem entrada em LOGOS — não tem o que buscar aqui.
// o <span> de texto é substituído pelo <svg aria-hidden> (via logoPickSvg); o title=
// no HTML preserva o nome acessível do botão (senão ficaria mudo pra leitor de tela).
// tamanho maior que o default (15×26): a grade agora é 2 colunas com botões de 76px de altura
// (dobro do que eram) — "deixar o preview dos logos melhor" é aproveitar esse espaço.
document.querySelectorAll('[data-logopick] button[data-logokind]').forEach(b => {
  const kind = b.dataset.logokind;
  if (kind !== 'none') b.innerHTML = logoPickSvg(kind, 36, 90);
});
// ── logo da Paradigma na capa/contracapa (trilha D) — picker + posição/alinhamento/cor/tamanho ──
document.querySelectorAll('[data-logopick]').forEach(pick => pick.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-logokind]'); if (!b) return;
  const kind = pick.dataset.logopick;
  const lg = specialObj(kind).logo;
  if (b.dataset.logokind === 'none') lg.on = false;          // "none" desliga; demais ligam e trocam o kind
  else { lg.on = true; lg.kind = b.dataset.logokind; }
  // se o logo desta capa estava em foco e desligou, limpa sel/painel; se ainda está ligado e em foco, reabre
  if (state.sel === logoSelOf(kind)) {
    if (!lg.on) { state.sel = null; closeLogoPanel(); }
    else { syncLogoUI(); render(); openLogoPanel(kind); return; }
  }
  syncLogoUI(); render();
}));
// posição + alinhamento do logo: segments montados em syncLogoUI() (onclick no widthSeg) — sem <select>
document.querySelectorAll('[data-logocolor]').forEach(b => b.addEventListener('click', () => {
  const kind = b.dataset.logocolor, lg = specialObj(kind).logo;
  openSwatchPop(b, (hex) => {
    lg.color = hex; b.style.background = hex; render();
    if (state.sel === logoSelOf(kind)) openLogoPanel(kind);
  }, lg.color);
}));
document.querySelectorAll('[data-logosize]').forEach(s => s.addEventListener('input', (e) => {
  const kind = s.dataset.logosize, lg = specialObj(kind).logo;
  lg.size = +e.target.value / 100;
  const sp = document.querySelector(`[data-logosizev="${kind}"]`); if (sp) sp.textContent = (+lg.size.toFixed(2)) + '×';
  applyCoverLogoLive(kind);
  // espelha no painel flutuante se aberto
  if (logoPanel && !logoPanel.hidden && logoKindOfSel(state.sel) === kind) {
    const ps = logoPanel.querySelector('input[data-a="size"]'); if (ps) ps.value = Math.round(lg.size * 100);
    const pv = logoPanel.querySelector('[data-role="szv"]'); if (pv) pv.textContent = (+lg.size.toFixed(2)) + '×';
  }
  save(); scheduleCommit();
}));
// reset do tamanho do logo (t4) — mesmo padrão de radius/size nos painéis flutuantes:
// mousedown preventDefault pra não roubar foco; default 1 (= 100 no slider), igual defaultLogo()
document.querySelectorAll('[data-logosizereset]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const kind = btn.dataset.logosizereset, lg = specialObj(kind).logo;
    lg.size = 1;
    const s = document.querySelector(`[data-logosize="${kind}"]`); if (s) s.value = 100;
    const sp = document.querySelector(`[data-logosizev="${kind}"]`); if (sp) sp.textContent = '1×';
    applyCoverLogoLive(kind);
    if (logoPanel && !logoPanel.hidden && logoKindOfSel(state.sel) === kind) {
      const ps = logoPanel.querySelector('input[data-a="size"]'); if (ps) ps.value = 100;
      const pv = logoPanel.querySelector('[data-role="szv"]'); if (pv) pv.textContent = '1×';
    }
    save(); scheduleCommit();
  });
});
// reset da escala do fundo — default 100 (= 1×), igual seed de cover/back em state
document.querySelectorAll('[data-bgscalereset]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const kind = btn.dataset.bgscalereset;
    specialObj(kind).bgScale = 100;
    const s = document.querySelector(`[data-bgscale="${kind}"]`); if (s) s.value = 100;
    const sp = document.querySelector(`[data-bgscalev="${kind}"]`); if (sp) sp.textContent = '1.00×';
    applyCoverBgScale(kind); save(); scheduleCommit();
  });
});
// sidebar: ion-icon name="menu-outline" — slide in/out do menu lateral esquerdo
const btnSidebar = document.getElementById('btnSidebar');
const mainEl = document.querySelector('main');
const sidebarEl = document.getElementById('sidebar');
if (btnSidebar && mainEl && sidebarEl) {
  btnSidebar.innerHTML = uiIco('menu', 18, 'outline');
  let sidebarFitRaf = 0, sidebarFitTimer = 0, sidebarFitOnEnd = null;
  const stopSidebarFit = () => {
    if (sidebarFitRaf) { cancelAnimationFrame(sidebarFitRaf); sidebarFitRaf = 0; }
    if (sidebarFitTimer) { clearTimeout(sidebarFitTimer); sidebarFitTimer = 0; }
    if (sidebarFitOnEnd) {
      sidebarEl.removeEventListener('transitionend', sidebarFitOnEnd);
      sidebarFitOnEnd = null;
    }
  };
  const refitDuringSlide = () => {
    stopSidebarFit();
    if (state.zoom !== 'fit') return;
    const tick = () => {
      applyZoom();
      sidebarFitRaf = requestAnimationFrame(tick);
    };
    sidebarFitRaf = requestAnimationFrame(tick);
    sidebarFitOnEnd = (e) => {
      if (e.target !== sidebarEl || e.propertyName !== 'width') return;
      stopSidebarFit();
      applyZoom();
    };
    sidebarEl.addEventListener('transitionend', sidebarFitOnEnd);
    // fallback se transitionend não vier (reduced-motion / sem mudança real)
    sidebarFitTimer = setTimeout(() => {
      stopSidebarFit();
      if (state.zoom === 'fit') applyZoom();
    }, 320);
  };
  btnSidebar.addEventListener('click', () => {
    const open = btnSidebar.getAttribute('aria-pressed') !== 'true';
    btnSidebar.setAttribute('aria-pressed', String(open));
    mainEl.classList.toggle('sidebar-collapsed', !open);
    btnSidebar.title = open ? 'Esconder o menu' : 'Mostrar o menu';
    // inert quando fechado: não entra no tab order nem recebe clique sob o clip
    if (open) sidebarEl.removeAttribute('inert');
    else sidebarEl.setAttribute('inert', '');
    refitDuringSlide();
  });
}
// zoom header: expand (fit) + popover com slider 10–200%. ion-icon name="expand"
zoomFitBtn.innerHTML = uiIco('expand', 16, 'outline');
zoomFitBtn.addEventListener('click', () => {
  state.zoom = 'fit';
  applyZoom();
});
zoomPctBtn.addEventListener('click', () => {
  if (zoomPop.hidden) openZoomPop(); else closeZoomPop();
});
zoomRange.addEventListener('input', () => {
  setZoomFromPct(zoomRange.value);
  // enquanto arrasta, o syncZoomUI pula o range se ele tem foco — atualiza o label do pop
  if (zoomPopVal) zoomPopVal.textContent = Math.round(+zoomRange.value) + '%';
  if (zoomPctLabel) zoomPctLabel.textContent = Math.round(+zoomRange.value) + '%';
});
// ticks + ímã nos snaps do zoom (mesma infra dos sliders da sidebar)
if (zoomPop) enhanceAll(zoomPop);

// ── exportar PDF (WYSIWYG, vetorial, com links) — via window.print() nativo ──
let _fontUri;
async function plexFontFace() {
  if (!_fontUri) {
    const b = await (await fetch('fonts/IBMPlexSans-Var.ttf')).blob();
    _fontUri = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  }
  return `@font-face{font-family:"Plex";src:url("${_fontUri}") format("truetype-variations");font-weight:100 700;font-stretch:62% 100%;font-display:block;}`;
}
// monta o HTML auto-contido das páginas (edição desligada → sem alças/contornos)
function exportPagesHtml() {
  const prev = editing; editing = false;
  const tmp = document.createElement('div'); tmp.id = 'pages';
  assemblePages(tmp);
  editing = prev;
  return tmp.outerHTML;
}
// trilha D: iframe oculto reusado a cada exportação — NÃO display:none (alguns
// motores de print pulam layout de frame display:none); fica fora da viewport
// com um tamanho real (~A4 a 96dpi) em vez de 0×0, pelo mesmo motivo.
let _printFrame;
function printFrame() {
  if (_printFrame) return _printFrame;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;   // fora da ordem de tab (o relatório pode ter <a>, que é focável)
  f.style.cssText = 'position:fixed; left:-10000px; top:0; width:794px; height:1123px; border:0;';
  document.body.appendChild(f);
  return (_printFrame = f);
}
// PDF nativo: monta o MESMO HTML auto-contido que ia pro POST /api/pdf (server
// headless) e manda pro iframe oculto — o print-to-pdf do PRÓPRIO navegador do
// usuário é vetorial, respeita @page/color-adjust, e funciona em qualquer host
// estático (GitHub Pages não tem server). Popup foi descartado: bloqueador de
// pop-up é permissão extra; iframe não depende de nada além do DOM local.
// bodyHtml = markup das #pages (exportPagesHtml ou versão free-locked).
//
// Caminho preferido: POST /api/pdf (Chrome headless → Skia/PDF com /Link annotations).
// window.print() no WebKit/Code Helper usa Quartz PDFContext e DESCARTA todos os
// <a href> (PDF sem /Annots — o botão “Tornar-se Pro” vira texto morto). Relatórios
// gerados no Chrome (Producer Skia) mantêm dezenas de URIs; os do Code Helper, zero.
// Largura travada + spinner no lugar do texto (sem “Gerando PDF…” que estica o botão).
function setBtnLoading(btn, on) {
  if (!btn) return;
  if (on) {
    if (btn.dataset.loading === '1') return;
    btn.dataset.loading = '1';
    btn.dataset.prevHtml = btn.innerHTML;
    // trava a largura atual antes de trocar o conteúdo (spinner é mais estreito)
    btn.style.minWidth = Math.ceil(btn.getBoundingClientRect().width) + 'px';
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('is-loading');
    btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
  } else {
    if (btn.dataset.loading !== '1') return;
    btn.innerHTML = btn.dataset.prevHtml || 'Baixar';
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('is-loading');
    btn.style.minWidth = '';
    delete btn.dataset.loading;
    delete btn.dataset.prevHtml;
  }
}
async function printHtml(bodyHtml, { titleSuffix = '', busyBtn = null } = {}) {
  // busyBtn explícito (modal PDF Gratuito) ou o Baixar do header
  const busy = busyBtn || document.getElementById('btnPrint');
  setBtnLoading(busy, true);
  try {
    const [css, fontFace] = await Promise.all([fetch('paradigma.css').then(r => r.text()), plexFontFace()]);
    const diagStyle = [...document.querySelectorAll('head style')].map(s => s.textContent).join('\n');
    const base = projectBaseName(state.doc.source?.label, 'relatorio');
    const fname = base + (titleSuffix || '');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escapeHtml(fname)}</title>
<style>${fontFace}</style><style>${css}</style><style>${diagStyle}</style>
<style>
  /* A4 real: as páginas são desenhadas em 595×842 "px" que representam pt (A4) →
     zoom 96/72 escala o design pra preencher a folha A4 exata, vetorial. */
  /* size em pt = design 595×842 (1 design-px = 1pt). Evita o mismatch A4 real
     (595.28×841.89pt) × zoom 1.333… que deixava ~0.4px de body branco na direita. */
  @page { size: 595pt 842pt; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  header, aside, .stage { display: none !important; }
  #pages { display: block; transform: none !important; margin: 0 !important; }
  /* 96/72 = 4/3: design-pt → CSS px do print (página = 595pt×842pt). */
  .page { box-shadow: none !important; margin: 0 !important; zoom: 1.3333333333333333; break-after: page; }
  .page:last-child { break-after: auto; }
  /* capa: sangria fixa de 1px em cada margem (só isso). */
  .page.cover-page { overflow: hidden !important; }
  .page.cover-page .cover-bg {
    position: absolute !important;
    top: -1px !important;
    left: -1px !important;
    right: auto !important;
    bottom: auto !important;
    width: calc(100% + 2px) !important;
    height: calc(100% + 2px) !important;
    /* size vem do inline (applyCoverBgStyles) — não forçar cover, senão Fit some no PDF */
    background-repeat: no-repeat !important;
  }
  .page.cover-page .cover-bg.bg-fit { background-size: contain !important; }
  .page.cover-page .cover-bg:not(.bg-fit) { background-size: cover !important; }
  /* o print do navegador some com fundo/cor por padrão (só sai marcando "gráficos
     de fundo" na caixa do usuário) — força sempre, cobre capa/contracapa (imagem
     de fundo), checklist/callout (preenchimento) e cor de texto/highlight */
  html, body, .page, .page * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
</style></head><body>${bodyHtml}</body></html>`;

    // 1) Chrome headless via server (links reais no PDF)
    if (await tryDownloadPdfViaApi(html, fname + '.pdf')) return;

    // 2) fallback: print nativo (Quartz/WebKit = sem annotations de link)
    const frame = printFrame();
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = html; });
    const w = frame.contentWindow, d = frame.contentDocument;
    // a @font-face injetada (Plex embutida) carrega em paralelo ao parse — o load
    // do iframe não garante que ela já foi aplicada (fonte não atrasa o load como
    // <img> atrasa); document.fonts.ready fecha essa brecha antes do print
    if (d.fonts) await d.fonts.ready;
    // dupla rAF: settle do layout/repaint (zoom:1.333, quebras de página, e o
    // possível re-layout pós-fonte acima) antes de disparar o diálogo de impressão
    await new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));
    w.focus();   // sem foco, o Chrome às vezes abre o diálogo pra página PAI, não pro iframe
    w.print();
  } catch (e) { alert('Falha ao gerar PDF: ' + (e.message || e)); }
  // sem callback confiável de "print terminou" (o diálogo do SO não devolve promise) →
  // reabilita o botão logo após chamar print(), não espera o usuário fechar o diálogo
  finally {
    setBtnLoading(busy, false);
  }
}
// POST /api/pdf → blob .pdf (Chrome --print-to-pdf). false se server/Chrome offline.
async function tryDownloadPdfViaApi(html, downloadName) {
  try {
    const r = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    if (!r.ok) return false;
    const blob = await r.blob();
    if (!blob || blob.size < 64) return false;
    const head = await blob.slice(0, 5).text();
    if (head !== '%PDF-') return false;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = downloadName || 'relatorio.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    return true;
  } catch {
    return false;
  }
}
async function printPdf() {
  return printHtml(exportPagesHtml());
}

// ── PDF Gratuito (teaser Pro): skeleton 1:1 (texto + mídia) + overlay ──
// Texto/título/legenda → barras cinza. Imagem/gráfico → bloco cinza do mesmo tamanho.
// filter:blur só no skeleton sólido (CSS) — barato no print, sem raster de foto.
// Hosts de texto. NÃO usar só querySelectorAll no root: no modo título o
// free-lock-body É o h1/p/fig e querySelectorAll não casa o próprio elemento.
const FREE_SKEL_SEL = [
  'h1.b', 'h2.b', 'h3.b', 'h4.b',
  '.b.h1', '.b.h2', '.b.h3', '.b.h4',
  '.b.p', 'p.b',
  '.b.li', '.b.ol', '.b.quote', 'blockquote.b',
  '.ck-txt', '.co-txt',
  '.figtitle', 'figcaption',
  '.idx-resumo', '.idx-title',
  '.toc-txt', '.toc-num', '.toc-pg', '.toc-empty',
  '.cover-item',
  'td', 'th',
].join(',');
function freeSkelIsTextHost(el) {
  if (!el || el.nodeType !== 1 || el.classList.contains('free-skel')) return false;
  if (el.matches?.('img, svg, canvas, video, .free-skel-line, .free-skel-media, .rimg, .divider, .e-pbreak')) return false;
  // envelopes: texto nos filhos (.figtitle / figcaption / .ck-txt …)
  if (el.classList.contains('check') || el.classList.contains('callout')) return false;
  if (el.classList.contains('fig') || el.classList.contains('tbl-wrap') || el.classList.contains('frag')) return false;
  // título/legenda de figura (não têm .b)
  if (el.classList.contains('figtitle') || el.tagName === 'FIGCAPTION') return true;
  // qualquer .b de texto (h1–h4, p, li, ol, quote) — NÃO .fig.b (já filtrado acima)
  if (el.classList.contains('b')) return true;
  if (el.matches?.(FREE_SKEL_SEL)) return true;
  if (/^H[1-4]$/.test(el.tagName)) return true;
  return false;
}
// agrupa rects da mesma linha (getClientRects parte por span inline)
function freeSkelMergeLineRects(rects) {
  const rows = new Map();
  for (const r of rects) {
    const key = Math.round(r.top);
    const cur = rows.get(key);
    if (!cur) {
      rows.set(key, { left: r.left, top: r.top, right: r.left + r.width, height: r.height });
    } else {
      cur.left = Math.min(cur.left, r.left);
      cur.right = Math.max(cur.right, r.left + r.width);
      cur.height = Math.max(cur.height, r.height);
      cur.top = Math.min(cur.top, r.top);
    }
  }
  return [...rows.values()]
    .map(r => ({ left: r.left, top: r.top, width: r.right - r.left, height: r.height }))
    .sort((a, b) => a.top - b.top || a.left - b.left);
}
// Substitui o texto do host por skeleton 1:1 (N barras = N linhas, larguras reais).
function freeSkelHost(el) {
  if (!el || el.classList.contains('free-skel')) return;
  if (el.matches?.('img, svg, canvas, video')) return;
  // envelope com mídia embutida: skeleton só nos filhos de texto (não no box inteiro)
  if (el.querySelector?.('img, svg, canvas, .fig, video')) {
    for (const k of el.querySelectorAll('*')) {
      if (freeSkelIsTextHost(k) && !k.querySelector('img, svg, canvas')) freeSkelHost(k);
    }
    return;
  }
  const hostRect = el.getBoundingClientRect();
  // offscreen ainda tem layout; se altura 0, tenta fallback por line-height do tipo
  const cs = getComputedStyle(el);
  const fs = parseFloat(cs.fontSize) || 10;
  const lh = parseFloat(cs.lineHeight) || (fs * 1.3);

  let rects = [];
  try {
    const doc = el.ownerDocument || document;
    const range = doc.createRange();
    range.selectNodeContents(el);
    rects = [...range.getClientRects()].filter(r => r.width >= 1 && r.height >= 1);
  } catch { /* fallback */ }
  rects = freeSkelMergeLineRects(rects);

  // fallback: N linhas pelo box do bloco (títulos altos usam lh do h1/h2)
  if (!rects.length) {
    const boxH = Math.max(hostRect.height, el.offsetHeight, lh);
    const boxW = Math.max(hostRect.width, el.offsetWidth, el.clientWidth, 40);
    const lines = Math.max(1, Math.round(boxH / lh) || 1);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const baseLeft = (hostRect.width >= 1 ? hostRect.left : 0) + padL;
    const baseTop = (hostRect.height >= 1 ? hostRect.top : 0) + padT;
    const innerW = Math.max(12, (el.clientWidth || boxW) - padL);
    for (let i = 0; i < lines; i++) {
      const last = i === lines - 1 && lines > 1;
      rects.push({
        left: baseLeft,
        top: baseTop + i * lh,
        width: Math.max(16, innerW * (last ? 0.55 : 0.96)),
        height: lh,
      });
    }
  }

  const fixedH = Math.max(el.offsetHeight, hostRect.height, lh);
  const fixedW = Math.max(el.offsetWidth, hostRect.width, 0);
  const originLeft = hostRect.width >= 1 ? hostRect.left : 0;
  const originTop = hostRect.height >= 1 ? hostRect.top : 0;

  el.classList.add('free-skel');
  el.removeAttribute('contenteditable');
  el.innerHTML = '';
  el.style.position = 'relative';
  el.style.height = fixedH + 'px';
  el.style.minHeight = fixedH + 'px';
  if (fixedW) el.style.width = fixedW + 'px';
  el.style.overflow = 'hidden';
  el.style.color = 'transparent';

  for (const r of rects) {
    const bar = document.createElement('span');
    bar.className = 'free-skel-line';
    bar.setAttribute('aria-hidden', 'true');
    // títulos: barra um pouco mais grossa; corpo: ~58% da linha
    const isHead = /^H[1-4]$/.test(el.tagName) || /\bh[1-4]\b/.test(el.className);
    const ratio = isHead ? 0.72 : 0.58;
    const barH = Math.max(isHead ? 6 : 3, Math.min(r.height * ratio, r.height - 1));
    const yOff = (r.height - barH) / 2;
    bar.style.left = Math.max(0, r.left - originLeft) + 'px';
    bar.style.top = Math.max(0, r.top - originTop + yOff) + 'px';
    bar.style.width = Math.max(isHead ? 24 : 8, r.width) + 'px';
    bar.style.height = barH + 'px';
    el.appendChild(bar);
  }
}
// Troca todo texto bloqueado por skeleton — inclui root (h1/p) e figtitle/figcaption.
function skeletonizeTextIn(root) {
  if (!root) return;
  const all = [];
  if (freeSkelIsTextHost(root)) all.push(root);
  try {
    for (const el of root.querySelectorAll(FREE_SKEL_SEL)) {
      if (freeSkelIsTextHost(el)) all.push(el);
    }
  } catch { /* ignore */ }
  // varredura extra: título/legenda de figura e qualquer .b de texto
  for (const el of root.querySelectorAll('.b, .ck-txt, .co-txt, .figtitle, figcaption, .cover-item, td, th, h1, h2, h3, h4')) {
    if (freeSkelIsTextHost(el) && !all.includes(el)) all.push(el);
  }
  // se o root é .fig / .rimg, garante figtitle + figcaption (às vezes sem .b)
  if (root.matches?.('figure.fig, .fig, .rimg') || root.classList?.contains('fig') || root.classList?.contains('rimg')) {
    for (const el of root.querySelectorAll('.figtitle, figcaption')) {
      if (!all.includes(el)) all.push(el);
    }
  }
  const hosts = all.filter(el => !all.some(o => o !== el && el.contains(o)));
  for (const el of hosts) freeSkelHost(el);
}
// Substitui img/svg por bloco cinza 1:1 (skeleton de mídia — sem JPEG, PDF leve).
function freeSkelMediaEl(el) {
  if (!el || el.classList?.contains('free-skel-media')) return;
  const r = el.getBoundingClientRect();
  const w = Math.max(8, el.offsetWidth || r.width || +el.getAttribute('width') || 120);
  const h = Math.max(8, el.offsetHeight || r.height || +el.getAttribute('height') || 80);
  const sk = document.createElement('div');
  sk.className = 'free-skel-media';
  sk.setAttribute('aria-hidden', 'true');
  sk.style.width = w + 'px';
  sk.style.height = h + 'px';
  sk.style.maxWidth = '100%';
  const br = (el.style && el.style.borderRadius) || getComputedStyle(el).borderRadius || '4px';
  if (br && br !== '0px') sk.style.borderRadius = br;
  el.replaceWith(sk);
}
function skeletonizeMediaIn(root) {
  if (!root) return;
  // imgs (foto, gráfico/timeline exportado como data:svg+xml em <img>)
  for (const img of [...root.querySelectorAll('img')]) freeSkelMediaEl(img);
  // SVG inline residual
  for (const svg of [...root.querySelectorAll('svg')]) {
    const r = svg.getBoundingClientRect();
    const w = r.width || +svg.getAttribute('width') || 0;
    const h = r.height || +svg.getAttribute('height') || 0;
    if (w > 0 && h > 0 && w < 28 && h < 28) {
      svg.style.opacity = '0.2';
      continue; // ícone miúdo
    }
    freeSkelMediaEl(svg);
  }
  // fundo de capa SÓ se a capa estiver bloqueada.
  // Nunca esqueleta capa livre — apagava a arte e a página saía branca no PDF.
  for (const bg of root.querySelectorAll('.cover-bg')) {
    if (!bg.closest('.free-lock-body, .free-locked')) continue;
    bg.style.backgroundImage = 'none';
    bg.style.backgroundColor = '#E8E8EC';
    bg.style.opacity = '0.42';
    bg.classList.add('free-skel-media');
  }
}
// Pipeline completo de teaser num envelope bloqueado
function freeLockSkeletonize(root) {
  skeletonizeTextIn(root);
  skeletonizeMediaIn(root);
}
function freePdfNormalizeUrl(raw) {
  const s = (raw || '').trim();
  if (!s) return 'https://paradigma.education';
  return /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(s) ? s : 'https://' + s;
}
// chrome da página (não embaralhar / não borrar): moldura, cabeçalho corrido, rodapé
function isFreePdfChrome(el) {
  if (!el || el.nodeType !== 1) return false;
  return el.classList.contains('rule')
    || el.classList.contains('runhead')
    || el.classList.contains('foot');
}
// card do teaser (cadeado + msg + CTA) — reusado em modo página e modo título
function buildFreeLockCard({ message, link, cta }) {
  const href = freePdfNormalizeUrl(link);
  const label = (cta && cta.trim()) || freePdfConfig().cta;
  const card = document.createElement('div');
  card.className = 'free-lock-card';
  const ico = document.createElement('div');
  ico.className = 'free-lock-ico';
  ico.setAttribute('aria-hidden', 'true');
  ico.innerHTML = uiIco('lock-closed', 36, 'solid');
  const msg = document.createElement('p');
  msg.className = 'free-lock-msg';
  msg.textContent = (message != null && String(message)) || freePdfConfig().message;
  const a = document.createElement('a');
  a.className = 'free-lock-cta';
  a.href = href;
  a.setAttribute('href', href);
  a.setAttribute('target', '_blank');
  a.setAttribute('rel', 'noopener noreferrer');
  a.title = href;
  const lab = document.createElement('span');
  lab.className = 'free-lock-cta-label';
  lab.textContent = label;
  a.appendChild(lab);
  card.append(ico, msg, a);
  return card;
}
// altura mínima do card (cadeado 36 + gaps + msg ~2 linhas + pill) — se o trecho
// bloqueado for mais baixo, o overlay “só aparece na página seguinte” / fica cortado.
const FREE_LOCK_CARD_MIN_H = 168;
function appendFreeLockOverlay(pageEl, opts, { section = false, top, height } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'free-lock-overlay' + (section ? ' free-lock-overlay-section' : '');
  if (section) {
    if (top != null) overlay.style.top = Math.max(0, top) + 'px';
    if (height != null) overlay.style.height = Math.max(FREE_LOCK_CARD_MIN_H, height) + 'px';
  }
  overlay.appendChild(buildFreeLockCard(opts));
  pageEl.appendChild(overlay);
  return overlay;
}
async function lockPageEl(pageEl, opts) {
  pageEl.classList.add('free-locked');

  // marca só o miolo (filhos diretos exceto chrome) — header/rodapé/moldura ficam nítidos
  const targets = [...pageEl.children].filter(el => !isFreePdfChrome(el));
  for (const el of targets) {
    el.classList.add('free-lock-body');
    freeLockSkeletonize(el); // texto + mídia em skeleton (layout já estável)
  }
  // capa bloqueada: skeletoniza o .cover-bg se ainda não entrou via targets
  if (pageEl.classList.contains('cover-page') || pageEl.dataset.cover) {
    const bg = pageEl.querySelector('.cover-bg');
    if (bg && !bg.classList.contains('free-skel-media')) {
      bg.classList.add('free-lock-body');
      freeLockSkeletonize(bg);
    }
  }
  appendFreeLockOverlay(pageEl, opts, { section: false });
}

// ── modo "Por Capítulo": seções H1/H2 (igual preview TOC) ─────────────────────
// Lista H1/H2 do miolo na ordem do doc (reusa collectPreviewToc).
function listFreePdfSections() {
  return collectPreviewToc(); // [{ id, level, text }]
}
// Último H1/H2 em [0..idx] (inclusive) — “seção dona” do bloco no fluxo do doc.
function freePdfHeadIdAtIndex(idx) {
  const blocks = state.doc.blocks || [];
  let head = null;
  for (let j = 0; j <= idx && j < blocks.length; j++) {
    const b = blocks[j];
    if ((b.type === 'h1' || b.type === 'h2') && !isBlankHeading(b)) head = b.id;
  }
  return head;
}
// Gráficos right usam page/y livres — a posição no array NÃO é a seção visual.
// Dono visual: bloco de fluxo (não-right) na mesma página com maior _top ≤ y da imagem;
// se não houver, o último bloco de fluxo nas páginas anteriores.
function freePdfOwningHeadForRightBlock(b) {
  if (!b) return null;
  if (b.anchor?.id) {
    const ai = idxOf(b.anchor.id);
    if (ai >= 0) return freePdfHeadIdAtIndex(ai);
  }
  const pageIdx = b.page | 0;
  const y = b.y | 0;
  let best = null;
  let bestTop = -Infinity;
  for (const s of state.doc.blocks || []) {
    if (s.type === 'pagebreak' || placementOf(s) === 'right') continue;
    if (s._page == null || s._top == null) continue;
    if (s._page === pageIdx && s._top <= y + 12 && s._top >= bestTop) {
      bestTop = s._top;
      best = s;
    }
  }
  if (!best) {
    for (const s of state.doc.blocks || []) {
      if (s.type === 'pagebreak' || placementOf(s) === 'right') continue;
      if (s._page != null && s._page < pageIdx) best = s;
      else if (s._page != null && s._page > pageIdx) break;
    }
  }
  if (!best) {
    // fallback: ordem do array (pior, mas evita null)
    const i = idxOf(b.id);
    return i >= 0 ? freePdfHeadIdAtIndex(i) : null;
  }
  const bi = idxOf(best.id);
  return bi >= 0 ? freePdfHeadIdAtIndex(bi) : null;
}
// Expand: H1/H2 marcado → blocos de FLUXO (não-right) do título até o próximo H1/H2.
// Imagens/gráficos right entram depois via freePdfOwningHeadForRightBlock (page+y).
function expandLockedSectionIds(sectionIds) {
  const lockedHeads = new Set((sectionIds || []).map(String));
  const out = new Set();
  if (!lockedHeads.size) return out;
  const blocks = state.doc.blocks || [];
  const heads = [];
  blocks.forEach((b, i) => {
    if (b.type !== 'h1' && b.type !== 'h2') return;
    if (isBlankHeading(b)) return;
    heads.push({ id: b.id, i });
  });
  for (let h = 0; h < heads.length; h++) {
    if (!lockedHeads.has(heads[h].id)) continue;
    const start = heads[h].i;
    const end = h + 1 < heads.length ? heads[h + 1].i : blocks.length;
    for (let i = start; i < end; i++) {
      // right: ownership visual, não o índice no array (timeline sob 3.3 mas id “em” 1.x)
      if (placementOf(blocks[i]) === 'right') continue;
      out.add(blocks[i].id);
    }
  }
  // Right: dono = seção visual (page+y / âncora), não a posição no array
  for (const b of blocks) {
    if (placementOf(b) !== 'right') continue;
    const head = freePdfOwningHeadForRightBlock(b);
    if (head && lockedHeads.has(head)) out.add(b.id);
  }
  return out;
}
// freemium seções: 1º título livre; demais bloqueados
function defaultLockedSections(sections) {
  if (!sections.length) return [];
  return sections.slice(1).map(s => s.id);
}
// bbox dos els relativos à .page + altura mínima pro card do teaser caber na página
function freeLockElsBBox(pageEl, els) {
  const pr = pageEl.getBoundingClientRect();
  let top = Infinity, bottom = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    top = Math.min(top, r.top - pr.top);
    bottom = Math.max(bottom, r.bottom - pr.top);
  }
  if (!Number.isFinite(top)) return null;
  // miolo da página (CONTENT_TOP / CONTENT_H)
  const minTop = CONTENT_TOP, maxBot = CONTENT_TOP + CONTENT_H;
  top = Math.max(minTop, Math.min(top, maxBot - FREE_LOCK_CARD_MIN_H));
  bottom = Math.min(maxBot, Math.max(bottom, top + FREE_LOCK_CARD_MIN_H));
  let height = bottom - top;
  // trecho curto (só o H2 no fim da página): expande o bloco do overlay p/ o card caber
  if (height < FREE_LOCK_CARD_MIN_H) {
    height = FREE_LOCK_CARD_MIN_H;
    if (top + height > maxBot) top = Math.max(minTop, maxBot - height);
  }
  return { top, height };
}
// Coleta blocos da seção na página (id no range título→próximo título).
// Gráfico/imagem right ENTRA se o id está no range OU âncora em bloco do range.
// (Sem heurística de Y; sem exigir esquerda na mesma página — senão timeline
// sozinha na direita sob um H1 bloqueado escapava do teaser.)
function collectSectionLockedEls(pageEl, blockIds) {
  const out = [];
  const seen = new Set();
  const add = (el) => {
    if (!el || seen.has(el)) return;
    // preferir envelope .rimg (figura + título + legenda)
    const wrap = el.classList?.contains('rimg') ? el : (el.closest?.('.rimg') || el);
    if (seen.has(wrap)) return;
    seen.add(wrap);
    if (wrap !== el) seen.add(el);
    out.push(wrap);
  };

  pageEl.querySelectorAll('[data-id]').forEach((el) => {
    const id = el.dataset.id;
    if (id && blockIds.has(id)) add(el);
  });

  // âncora “travada no texto”: se o alvo está no range bloqueado
  pageEl.querySelectorAll('.col-right > .rimg[data-id], .rimg[data-id]').forEach((el) => {
    const id = el.dataset.id;
    if (!id || seen.has(el)) return;
    const b = blockOf(id);
    if (b?.anchor?.id && blockIds.has(b.anchor.id)) add(el);
  });

  return out;
}
async function lockSectionBlocksOnPage(pageEl, lockedEls, opts) {
  if (!lockedEls.length) return;
  pageEl.classList.add('free-locked');
  for (const el of lockedEls) {
    el.classList.add('free-lock-body');
    freeLockSkeletonize(el); // figtitle + figcaption + img/svg → skeleton
  }
  // se (quase) todo o miolo da página está bloqueado → overlay full; senão, recorte
  const content = pageEl.querySelector('.content');
  const allIds = content
    ? [...content.querySelectorAll('[data-id]')].map(e => e.dataset.id).filter(Boolean)
    : [];
  const lockedIdSet = new Set(lockedEls.map(e => e.dataset.id).filter(Boolean));
  const allLocked = allIds.length > 0 && allIds.every(id => lockedIdSet.has(id));
  if (allLocked) {
    appendFreeLockOverlay(pageEl, opts, { section: false });
    return;
  }
  const box = freeLockElsBBox(pageEl, lockedEls);
  if (!box) {
    appendFreeLockOverlay(pageEl, opts, { section: false });
    return;
  }
  appendFreeLockOverlay(pageEl, opts, { section: true, top: box.top, height: box.height });
}
async function applyFreePdfSectionLocks(pagesRoot, cfg) {
  // paginate() já rodou em assemblePages → _page/_top e page/y dos rights estão frescos
  const blockIds = expandLockedSectionIds(cfg.lockedSections || []);
  if (!blockIds.size) return;
  const opts = { message: cfg.message, link: cfg.link, cta: cfg.cta };
  // só miolo (.content); capa/índice/contracapa não entram no modo título
  for (const page of pagesRoot.querySelectorAll(':scope > .page')) {
    if (page.classList.contains('cover-page') || page.dataset.cover) continue;
    if (page.querySelector('.idx-content')) continue;
    const lockedEls = collectSectionLockedEls(page, blockIds);
    if (!lockedEls.length) continue;
    await lockSectionBlocksOnPage(page, lockedEls, opts);
  }
}

// lista de páginas na mesma ordem de assemblePages (só metadados)
function listExportPages() {
  const content = paginate();
  const cov = state.doc.cover, bk = state.doc.back, idx = state.doc.index;
  const idxPageOn = !!(idx && (idx.on || idx.resumoOn));
  let n = state.doc.firstPage;
  const out = [];
  if (cov && cov.on) {
    out.push({ index: out.length, kind: 'cover', label: 'Capa', number: n });
    n++;
  }
  if (idxPageOn) {
    out.push({ index: out.length, kind: 'index', label: 'Índice / Resumo', number: n });
    n++;
  }
  content.forEach((_pg, ci) => {
    out.push({
      index: out.length,
      kind: 'content',
      label: `Página · ${String(n).padStart(2, '0')}`,
      number: n,
      contentIdx: ci,
    });
    n++;
  });
  if (bk && bk.on) {
    out.push({ index: out.length, kind: 'back', label: 'Contracapa', number: n });
  }
  return out;
}
// freemium: capa + índice + 1ª do miolo livres; resto bloqueado
function defaultLockedIndices(pages) {
  const locked = [];
  let freedFirstContent = false;
  for (const p of pages) {
    if (p.kind === 'cover' || p.kind === 'index') continue;
    if (p.kind === 'content' && !freedFirstContent) {
      freedFirstContent = true;
      continue;
    }
    locked.push(p.index);
  }
  return locked;
}
async function applyFreePdfLocks(pagesRoot, cfg) {
  const opts = { message: cfg.message, link: cfg.link, cta: cfg.cta };
  if (cfg.mode === 'section') {
    await applyFreePdfSectionLocks(pagesRoot, cfg);
    return;
  }
  const pages = [...pagesRoot.querySelectorAll(':scope > .page')];
  const lockedSet = new Set(cfg.locked || []);
  for (let i = 0; i < pages.length; i++) {
    if (!lockedSet.has(i)) continue;
    await lockPageEl(pages[i], opts);
  }
}
async function buildFreePdfHtml(cfg) {
  const prev = editing; editing = false;
  // id temporário: o editor já tem #pages no stage — não colidir durante o offscreen
  const tmp = document.createElement('div'); tmp.id = 'pages-free-export';
  assemblePages(tmp);
  editing = prev;
  // monta offscreen no documento atual pra getBoundingClientRect/SVG funcionar melhor
  tmp.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(tmp);
  try {
    // 1 frame de layout antes de medir bboxes (modo título)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await applyFreePdfLocks(tmp, cfg);
    tmp.id = 'pages';
    tmp.removeAttribute('style');
    return tmp.outerHTML;
  } finally {
    tmp.remove();
  }
}
async function printFreePdf() {
  const cfg = readFreePdfForm();
  persistFreePdfForm(cfg);
  const bodyHtml = await buildFreePdfHtml(cfg);
  return printHtml(bodyHtml, {
    titleSuffix: '-gratuito',
    busyBtn: document.getElementById('fpmGenerate'),
  });
}

// ── modal PDF Gratuito ───────────────────────────────────────────────────────
function freePdfUiMode() {
  const on = document.querySelector('#fpmMode button[aria-selected="true"]');
  return on?.dataset.fpmMode === 'section' ? 'section' : 'page';
}
function setFreePdfUiMode(mode) {
  const m = mode === 'section' ? 'section' : 'page';
  document.querySelectorAll('#fpmMode button[data-fpm-mode]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.fpmMode === m));
  });
  const label = document.getElementById('fpmListLabel');
  const hint = document.getElementById('fpmHint');
  if (label) label.textContent = m === 'section' ? 'Capítulos (H1 / H2)' : 'Páginas';
  if (hint) {
    hint.textContent = m === 'section'
      ? 'Marque os capítulos a bloquear: esconde o capítulo e todo o conteúdo até o próximo H1/H2.'
      : 'Escolha quais páginas ficam legíveis e quais saem bloqueadas com o teaser Paradigma Pro.';
  }
  const cfg = freePdfConfig();
  if (m === 'section') fillFreePdfSectionList(cfg.lockedSections);
  else fillFreePdfPageList(cfg.locked);
}
function readFreePdfForm() {
  const mode = freePdfUiMode();
  const base = {
    mode,
    message: (document.getElementById('fpmMessage')?.value ?? freePdfConfig().message).trim()
      || freePdfConfig().message,
    link: freePdfNormalizeUrl(document.getElementById('fpmLink')?.value ?? freePdfConfig().link),
    cta: (document.getElementById('fpmCta')?.value ?? freePdfConfig().cta).trim() || freePdfConfig().cta,
    locked: freePdfConfig().locked,
    lockedSections: freePdfConfig().lockedSections,
  };
  const host = document.getElementById('fpmPages');
  if (mode === 'section') {
    const locked = [];
    host?.querySelectorAll('input[data-section]').forEach((inp) => {
      if (inp.checked) locked.push(inp.dataset.section);
    });
    base.lockedSections = host?.children.length
      ? locked
      : (freePdfConfig().lockedSections ?? defaultLockedSections(listFreePdfSections()));
  } else {
    const locked = [];
    host?.querySelectorAll('input[data-page]').forEach((inp) => {
      if (inp.checked) locked.push(+inp.dataset.page);
    });
    const pages = listExportPages();
    base.locked = host?.children.length
      ? locked
      : (freePdfConfig().locked ?? defaultLockedIndices(pages));
  }
  return base;
}
function persistFreePdfForm(cfg) {
  const f = ensureFreePdf();
  f.mode = cfg.mode === 'section' ? 'section' : 'page';
  f.message = cfg.message;
  f.link = cfg.link;
  f.cta = cfg.cta;
  if (cfg.mode === 'section') f.lockedSections = cfg.lockedSections;
  else f.locked = cfg.locked;
  save();
}
function appendFreePdfListRow(host, { key, kind, label, level, isLocked }) {
  const row = document.createElement('label');
  row.className = 'fpm-page';
  row.dataset.locked = isLocked ? '1' : '0';
  row.setAttribute('role', 'listitem');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  if (kind === 'page') cb.dataset.page = String(key);
  else cb.dataset.section = String(key);
  cb.checked = isLocked;
  cb.addEventListener('change', () => {
    row.dataset.locked = cb.checked ? '1' : '0';
    const badge = row.querySelector('.fpm-pg-badge');
    if (badge) badge.textContent = cb.checked ? 'Bloqueada' : 'Visível';
    syncFreePdfToggleBtn();
  });
  const lab = document.createElement('span');
  lab.className = 'fpm-pg-label' + (level === 2 ? ' lvl2' : '');
  lab.textContent = label;
  const badge = document.createElement('span');
  badge.className = 'fpm-pg-badge';
  badge.textContent = isLocked ? 'Bloqueada' : 'Visível';
  row.append(cb, lab, badge);
  host.appendChild(row);
}
function fillFreePdfPageList(lockedIndices) {
  const host = document.getElementById('fpmPages');
  if (!host) return;
  const pages = listExportPages();
  const locked = new Set(
    lockedIndices != null ? lockedIndices : (freePdfConfig().locked ?? defaultLockedIndices(pages)),
  );
  host.replaceChildren();
  if (!pages.length) {
    const empty = document.createElement('div');
    empty.className = 'fpm-page';
    empty.style.cursor = 'default';
    empty.textContent = 'Nenhuma página no documento.';
    host.appendChild(empty);
    syncFreePdfToggleBtn();
    return;
  }
  for (const p of pages) {
    appendFreePdfListRow(host, {
      key: p.index,
      kind: 'page',
      label: p.label,
      isLocked: locked.has(p.index),
    });
  }
  syncFreePdfToggleBtn();
}
function fillFreePdfSectionList(lockedSectionIds) {
  const host = document.getElementById('fpmPages');
  if (!host) return;
  const sections = listFreePdfSections();
  const locked = new Set(
    lockedSectionIds != null
      ? lockedSectionIds.map(String)
      : (freePdfConfig().lockedSections ?? defaultLockedSections(sections)).map(String),
  );
  host.replaceChildren();
  if (!sections.length) {
    const empty = document.createElement('div');
    empty.className = 'fpm-page';
    empty.style.cursor = 'default';
    empty.textContent = 'Nenhum H1/H2 no miolo. Adicione capítulos para usar este modo.';
    host.appendChild(empty);
    syncFreePdfToggleBtn();
    return;
  }
  for (const s of sections) {
    appendFreePdfListRow(host, {
      key: s.id,
      kind: 'section',
      label: s.text || '(sem título)',
      level: s.level,
      isLocked: locked.has(String(s.id)),
    });
  }
  syncFreePdfToggleBtn();
}
// botão único: "Bloquear todas" ↔ "Liberar todas"
function syncFreePdfToggleBtn() {
  const btn = document.getElementById('fpmToggleAll');
  if (!btn) return;
  const boxes = [...document.querySelectorAll('#fpmPages input[data-page], #fpmPages input[data-section]')];
  const allLocked = boxes.length > 0 && boxes.every(b => b.checked);
  if (allLocked) {
    btn.dataset.mode = 'unlock';
    btn.textContent = 'Liberar todas';
  } else {
    btn.dataset.mode = 'lock';
    btn.textContent = 'Bloquear todas';
  }
}
function toggleFreePdfAll() {
  const btn = document.getElementById('fpmToggleAll');
  const lockAll = (btn?.dataset.mode || 'lock') === 'lock';
  if (freePdfUiMode() === 'section') {
    const sections = listFreePdfSections();
    fillFreePdfSectionList(lockAll ? sections.map(s => s.id) : []);
  } else {
    const pages = listExportPages();
    fillFreePdfPageList(lockAll ? pages.map(p => p.index) : []);
  }
  syncFreePdfToggleBtn();
}
function openFreePdfModal() {
  const m = document.getElementById('freePdfModal');
  if (!m) return;
  const cfg = freePdfConfig();
  const msg = document.getElementById('fpmMessage');
  const link = document.getElementById('fpmLink');
  const cta = document.getElementById('fpmCta');
  if (msg) msg.value = cfg.message;
  if (link) link.value = cfg.link;
  if (cta) cta.value = cfg.cta;
  setFreePdfUiMode(cfg.mode);
  m.hidden = false;
}
function closeFreePdfModal() {
  const m = document.getElementById('freePdfModal');
  if (m) m.hidden = true;
}
function initFreePdfModal() {
  const m = document.getElementById('freePdfModal');
  if (!m || m.dataset.ready) return;
  m.dataset.ready = '1';
  m.addEventListener('click', (e) => {
    if (e.target.closest('[data-fpm-close]')) closeFreePdfModal();
  });
  document.querySelectorAll('#fpmMode button[data-fpm-mode]').forEach((b) => {
    b.addEventListener('click', () => setFreePdfUiMode(b.dataset.fpmMode));
  });
  document.getElementById('fpmToggleAll')?.addEventListener('click', () => toggleFreePdfAll());
  document.getElementById('fpmGenerate')?.addEventListener('click', () => {
    printFreePdf().then(() => closeFreePdfModal()).catch((e) => {
      console.error('[pdf-gratuito]', e);
      alert('Falha ao gerar PDF Gratuito: ' + (e.message || e));
    });
  });
}
initFreePdfModal();
function downloadMd() {
  const blob = new Blob([toMarkdown()], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = projectBaseName(state.doc.source?.label) + '.md';
  a.click();
  URL.revokeObjectURL(a.href);
}
// "Salvar" (trilha C t3.2): baixa o DOCUMENTO INTEIRO (blocos + capa/contracapa +
// logo + índice/resumo + reviewed[] do preview + cabeçalho/rodapé + nº 1ª página
// + origem) como .pdgm.zip (doc.json + imagens em media/, ver doc-format.js) —
// sem perda, ao contrário do .md acima (só o texto). Reabre pelo botão "Abrir".
async function saveDocFile() {
  // cinto de segurança: salvar com o miolo em branco gera um arquivo que PARECE cheio
  // (megabytes de capa em base64) e abre vazio. Bloco conta como conteúdo se tem texto
  // ou se não é de texto (imagem, tabela, divisor, quebra).
  const vazio = !state.doc.blocks.some(b => (b.html || '').trim() || !TEXT_TYPES.has(b.type));
  if (vazio && !confirm('O miolo está em branco — o arquivo vai levar só capa, índice/resumo e contracapa. Salvar assim mesmo?')) return;
  const blob = await serializeDocZip(state.doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = projectBaseName(state.doc.source?.label) + '.pdgm.zip';
  a.click();
  URL.revokeObjectURL(a.href);
}
// "Baixar" (era 2 botões — "Salvar"/.pdgm.zip e "Baixar PDF" — virou 1 com menu de 2 opções,
// mesmo padrão de popover fixo do #addImgMenu: posiciona colado ao botão, fecha ao clicar fora).
const downloadMenu = document.getElementById('downloadMenu');
function openDownloadMenu() {
  const r = document.getElementById('btnPrint').getBoundingClientRect();
  downloadMenu.hidden = false;
  const mw = downloadMenu.offsetWidth || 232;
  downloadMenu.style.left = Math.max(8, r.right - mw) + 'px';
  downloadMenu.style.top = (r.bottom + 6) + 'px';
}
function closeDownloadMenu() { downloadMenu.hidden = true; }
document.getElementById('btnPrint').addEventListener('click', () => {
  if (downloadMenu.hidden) openDownloadMenu(); else closeDownloadMenu();
});
document.getElementById('btnSaveSource')?.addEventListener('click', () => { onSaveSourceClick(); });
// ao abrir o painel, atualiza checks/timestamps (poll grava lastProjectPollAt em background)
document.getElementById('saveSourceWrap')?.addEventListener('mouseenter', () => {
  if (isProjectLinked() || isUnsyncedOpenProject()) updateSaveSourceBtn();
});

// Sair / recarregar / outro link: avisa se há trabalho não gravado no disco
// (dirty, falha de autosave, ou gravação ainda em curso).
addEventListener('beforeunload', (e) => {
  if (!hasUnsavedProjectWork()) return;
  // Chrome/Firefox exigem preventDefault + returnValue para mostrar o diálogo nativo
  e.preventDefault();
  e.returnValue = '';
});
// modal vincular projeto
document.getElementById('linkProjectModal')?.addEventListener('click', (e) => {
  if (e.target.closest('[data-lpm-close]')) closeLinkProjectModal();
});
document.getElementById('lpmDownload')?.addEventListener('click', () => {
  downloadAndLinkProject().catch((e) => {
    console.error('[vincular]', e);
    showToast('err', 'Não foi possível criar o projeto', (e && e.message) || String(e));
  });
});
document.getElementById('lpmPick')?.addEventListener('click', () => {
  closeLinkProjectModal();
  pickProjectFile({ linkNow: true });
});
document.getElementById('syncOfferModal')?.addEventListener('click', (e) => {
  if (e.target.closest('[data-som-close]')) closeSyncOfferModal();
});
document.getElementById('somSync')?.addEventListener('click', () => {
  enableProjectSync().catch((err) => console.error(err));
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('linkProjectModal');
  if (m && !m.hidden) { e.preventDefault(); closeLinkProjectModal(); return; }
  const s = document.getElementById('syncOfferModal');
  if (s && !s.hidden) { e.preventDefault(); closeSyncOfferModal(); return; }
  const f = document.getElementById('freePdfModal');
  if (f && !f.hidden) { e.preventDefault(); closeFreePdfModal(); }
});
document.addEventListener('mousedown', (e) => {                // fecha ao clicar fora (mesmo padrão do #addImgMenu)
  if (downloadMenu.hidden) return;
  if (e.target.closest('#downloadMenu') || e.target.closest('#btnPrint')) return;
  closeDownloadMenu();
}, true);
downloadMenu.querySelector('[data-dl="pdf"]').addEventListener('click', () => { closeDownloadMenu(); printPdf(); });
downloadMenu.querySelector('[data-dl="pdf-free"]')?.addEventListener('click', () => {
  closeDownloadMenu();
  openFreePdfModal();
});
downloadMenu.querySelector('[data-dl="zip"]').addEventListener('click', () => { closeDownloadMenu(); saveDocFile(); });
addEventListener('resize', () => { if (state.zoom === 'fit') applyZoom(); });

// ──────────────── barra flutuante da CÉLULA de tabela ───────────────────────
// Espelha o #fmtbar de texto: painel direito = tabela inteira; esta barra = célula
// ativa (marcas, cor, alinhamento H/V). Aparece ao focar/selecionar a célula,
// mesmo sem seleção de texto.
const tblCellBar = document.getElementById('tblCellBar');
if (tblCellBar) {
  // ícones de alinhamento (mesmo SVG do painel)
  tblCellBar.querySelectorAll('.alignbtn[data-align]').forEach((btn) => {
    btn.innerHTML = ALIGN_ICON[btn.dataset.align] || '';
  });
  tblCellBar.querySelectorAll('.alignbtn[data-valign]').forEach((btn) => {
    btn.innerHTML = VALIGN_ICON[btn.dataset.valign] || '';
  });
  tblCellBar.addEventListener('mousedown', (e) => e.preventDefault());

  /** Célula DOM ativa (contenteditable th/td). */
  function activeTableCellEl() {
    const live = tableLiveActive();
    const cell = live?.activeCell?.();
    if (!live || !cell) return null;
    return live.cellEl?.(cell.r, cell.c)
      || live.wrap?.querySelector?.(`[data-row="${cell.r}"][data-col="${cell.c}"]`)
      || null;
  }

  /** Garante range na célula: seleção do usuário, senão conteúdo inteiro da célula. */
  function ensureTblCellRange() {
    const host = activeTableCellEl();
    if (!host) return null;
    const sel = getSelection();
    if (sel?.rangeCount) {
      const r = sel.getRangeAt(0);
      const n = r.commonAncestorContainer;
      const el = n.nodeType === 3 ? n.parentElement : n;
      if (el && host.contains(el) && !sel.isCollapsed) return r.cloneRange();
    }
    host.focus();
    const range = document.createRange();
    range.selectNodeContents(host);
    sel.removeAllRanges();
    sel.addRange(range);
    return range.cloneRange();
  }

  function paintTblCellColorButtons({ fore, back } = {}) {
    const foreBtn = tblCellBar.querySelector('.cb-fore');
    const backBtn = tblCellBar.querySelector('.cb-back');
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

  tblCellBar.querySelectorAll('.markbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!ensureTblCellRange()) return;
      document.execCommand(btn.dataset.cmd);
      updateTblCellBar();
    });
  });

  tblCellBar.querySelectorAll('.colorbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const saved = ensureTblCellRange();
      if (!saved) return;
      const host = activeTableCellEl();
      const isHilite = btn.dataset.cmd === 'hiliteColor';
      const fromSel = colorsFromFmtSelection();
      const current = btn.dataset.color
        || (isHilite ? fromSel.back : fromSel.fore)
        || undefined;
      openSwatchPop(btn, (hex) => {
        if (host) host.focus();
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(saved);
        // se a seleção colapsou, reaplica no conteúdo da célula
        if (s.isCollapsed) ensureTblCellRange();
        if (isHilite && (hex === false || hex == null || hex === 'false' || hex === 'transparent' || hex === 'none')) {
          clearHiliteInSelection();
          paintTblCellColorButtons({ back: false });
          updateTblCellBar();
          return;
        }
        const p = parseColor(hex);
        const applyHex = p?.hex || hex;
        const ok = document.execCommand(btn.dataset.cmd, false, applyHex);
        if (isHilite && !ok) document.execCommand('backColor', false, applyHex);
        if (isHilite) paintTblCellColorButtons({ back: hex });
        else paintTblCellColorButtons({ fore: hex });
        updateTblCellBar();
      }, current, isHilite ? { allowNone: true, noneLabel: 'Nenhum' } : undefined);
    });
  });

  tblCellBar.querySelectorAll('.alignbtn[data-align]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const live = tableLiveActive();
      if (!live?.setAlign?.(btn.dataset.align)) return;
      updateTblCellBar();
    });
  });
  tblCellBar.querySelectorAll('.alignbtn[data-valign]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const live = tableLiveActive();
      if (!live?.setValign?.(btn.dataset.valign)) return;
      updateTblCellBar();
    });
  });
}

function updateTblCellBar() {
  if (!tblCellBar) return;
  if (!editing) { tblCellBar.hidden = true; return; }
  const live = tableLiveActive();
  const cell = live?.activeCell?.();
  if (!live || !cell) { tblCellBar.hidden = true; return; }
  const el = live.cellEl?.(cell.r, cell.c)
    || live.wrap?.querySelector?.(`[data-row="${cell.r}"][data-col="${cell.c}"]`);
  if (!el) { tblCellBar.hidden = true; return; }
  // fora da viewport? esconde
  const rect = el.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
    tblCellBar.hidden = true;
    return;
  }

  const data = live.data?.() || {};
  const h = cellAlignOf(data, cell.r, cell.c);
  const v = cellValignOf(data, cell.r, cell.c);
  tblCellBar.querySelectorAll('.alignbtn[data-align]').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.align === h);
  });
  tblCellBar.querySelectorAll('.alignbtn[data-valign]').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.valign === v);
  });

  // marcas: queryCommandState só vale se o caret está na célula
  const ae = document.activeElement;
  const inCell = !!(ae && (el.contains(ae) || ae === el));
  tblCellBar.querySelectorAll('.markbtn').forEach((b) => {
    let on = false;
    if (inCell) {
      try { on = document.queryCommandState(b.dataset.cmd); } catch { /* */ }
    }
    b.classList.toggle('on', !!on);
  });
  if (inCell) paintTblCellColorButtonsSafe(colorsFromFmtSelection());

  tblCellBar.hidden = false;
  const bw = tblCellBar.offsetWidth || 320;
  const bh = tblCellBar.offsetHeight || 36;
  // 1) barra perto da célula, fora do retângulo do painel
  const pos = placeTblCellBarNearCell(rect, bw, bh, tblSidePanelRects());
  tblCellBar.style.left = pos.x + 'px';
  tblCellBar.style.top = pos.y + 'px';
  // 2) se ainda houver interseção (painel alto / faixa estreita), empurra o painel
  nudgeSidePanelsAwayFromCellBar();
  // 3) re-ancora a barra com o painel já deslocado (sem re-chamar nudge)
  const pos2 = placeTblCellBarNearCell(rect, bw, bh, tblSidePanelRects());
  tblCellBar.style.left = pos2.x + 'px';
  tblCellBar.style.top = pos2.y + 'px';
}

const TBL_UI_GAP = 10;

/** Retângulo atual da #tblCellBar se visível (p/ o painel lateral evitar). */
function tblCellBarRectIfVisible() {
  if (!tblCellBar || tblCellBar.hidden) return null;
  const r = tblCellBar.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return r;
}

/** Painéis laterais da tabela (globais) — a barra da célula não entra neles. */
function tblSidePanelRects() {
  const out = [];
  for (const id of ['tablePanel', 'tableGridPanel']) {
    const el = document.getElementById(id);
    if (el && !el.hidden) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) out.push(r);
    }
  }
  return out;
}

function rectsOverlapPad(a, b, pad = TBL_UI_GAP) {
  return !(
    a.right + pad <= b.left
    || a.left - pad >= b.right
    || a.bottom + pad <= b.top
    || a.top - pad >= b.bottom
  );
}

function boxOf(x, y, w, h) {
  return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
}

function freeOfForbidden(box, forbidden) {
  for (const f of forbidden) {
    if (f && rectsOverlapPad(box, f)) return false;
  }
  return true;
}

/**
 * Se painel e barra da célula ainda se cruzam, move o painel (não a barra).
 * A barra fica ancorada na célula; o painel cede o espaço.
 */
function nudgeSidePanelsAwayFromCellBar() {
  const bar = tblCellBarRectIfVisible();
  if (!bar) return;
  for (const id of ['tablePanel', 'tableGridPanel']) {
    const el = document.getElementById(id);
    if (!el || el.hidden) continue;
    const pr = el.getBoundingClientRect();
    if (!rectsOverlapPad(bar, pr, TBL_UI_GAP)) continue;
    const pw = pr.width;
    const ph = pr.height;
    let x = pr.left;
    let y = pr.top;
    // prefere à direita da barra; senão à esquerda; senão abaixo
    if (bar.right + TBL_UI_GAP + pw <= innerWidth - 8) {
      x = bar.right + TBL_UI_GAP;
    } else if (bar.left - pw - TBL_UI_GAP >= 8) {
      x = bar.left - pw - TBL_UI_GAP;
    } else {
      y = Math.min(Math.max(8, bar.bottom + TBL_UI_GAP), Math.max(8, innerHeight - ph - 8));
    }
    y = Math.min(Math.max(8, y), Math.max(8, innerHeight - ph - 8));
    x = Math.min(Math.max(8, x), Math.max(8, innerWidth - pw - 8));
    // confirma; se ainda colide, força abaixo da barra
    let box = boxOf(x, y, pw, ph);
    if (rectsOverlapPad(bar, box, TBL_UI_GAP)) {
      x = Math.min(Math.max(8, bar.left), Math.max(8, innerWidth - pw - 8));
      y = Math.min(Math.max(8, bar.bottom + TBL_UI_GAP), Math.max(8, innerHeight - ph - 8));
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }
}

/**
 * Painel contextual ao lado do host (tabela / grid).
 * Preferência: direita do host; se não cabe, esquerda — mas NUNCA em cima do
 * host se houver espaço na borda da viewport. Se `avoid` (barra da célula)
 * colidir, desce ou empurra para o lado livre.
 */
function placeSidePanelBesideHost(hostR, pw, ph, avoid) {
  const clampY = (y) => Math.min(Math.max(8, y), Math.max(8, innerHeight - ph - 8));
  const forbidden = avoid ? [avoid] : [];

  const rightX = hostR.right + TBL_UI_GAP;
  const leftX = hostR.left - pw - TBL_UI_GAP;
  const pinRight = Math.max(8, innerWidth - pw - 8);

  const xOpts = [];
  if (rightX + pw <= innerWidth - 8) xOpts.push(rightX);
  if (leftX >= 8) xOpts.push(leftX);
  // última opção: colado na borda da janela (não flipar em cima da tabela)
  if (!xOpts.includes(pinRight)) xOpts.push(pinRight);
  if (leftX < 8 && rightX + pw > innerWidth - 8) xOpts.push(Math.max(8, leftX));

  const y0 = clampY(hostR.top);
  for (const x of xOpts) {
    // tenta y alinhado ao topo do host, depois desce em passos se colidir com avoid
    for (let dy = 0; dy <= Math.max(0, innerHeight - ph - 16); dy += 48) {
      const y = clampY(y0 + dy);
      const box = boxOf(x, y, pw, ph);
      if (freeOfForbidden(box, forbidden)) return { x, y };
    }
    // tenta acima do avoid
    if (avoid) {
      const yAbove = clampY(avoid.top - ph - TBL_UI_GAP);
      const boxA = boxOf(x, yAbove, pw, ph);
      if (freeOfForbidden(boxA, forbidden)) return { x, y: yAbove };
      const yBelow = clampY(avoid.bottom + TBL_UI_GAP);
      const boxB = boxOf(x, yBelow, pw, ph);
      if (freeOfForbidden(boxB, forbidden)) return { x, y: yBelow };
    }
  }
  // fallback: direita do host (ou pin), topo
  const x = xOpts[0] ?? pinRight;
  return { x, y: y0 };
}

/**
 * Barra da célula perto da célula, com proibição dura de interseção com o
 * painel lateral. Não resolve por z-index: escolhe (x,y) livre.
 */
function placeTblCellBarNearCell(cellRect, bw, bh, panels) {
  const clampX = (x) => Math.max(8, Math.min(x, innerWidth - bw - 8));
  const clampY = (y) => Math.max(8, Math.min(y, innerHeight - bh - 8));
  const forbidden = panels || [];

  // limite horizontal: se o painel está à direita da célula, a barra não pode
  // invadir a faixa do painel (max right edge = panel.left - gap)
  let maxRight = innerWidth - 8;
  let minLeft = 8;
  for (const pr of forbidden) {
    const cellCx = cellRect.left + cellRect.width / 2;
    const panelCx = pr.left + pr.width / 2;
    if (panelCx >= cellCx) {
      // painel à direita → barra só à esquerda da borda do painel
      maxRight = Math.min(maxRight, pr.left - TBL_UI_GAP);
    } else {
      // painel à esquerda → barra só à direita da borda do painel
      minLeft = Math.max(minLeft, pr.right + TBL_UI_GAP);
    }
  }
  const clampXInLane = (x) => {
    let v = clampX(x);
    // se a faixa útil for menor que a barra, mantém clamp de viewport
    if (maxRight - minLeft >= bw) {
      v = Math.max(minLeft, Math.min(v, maxRight - bw));
    }
    return v;
  };

  const anchors = [
    // acima, centrado
    () => ({
      x: clampXInLane(cellRect.left + cellRect.width / 2 - bw / 2),
      y: clampY(cellRect.top - bh - TBL_UI_GAP),
    }),
    // acima, alinhado à esquerda da célula
    () => ({
      x: clampXInLane(cellRect.left),
      y: clampY(cellRect.top - bh - TBL_UI_GAP),
    }),
    // acima, alinhado à direita da célula (ainda na faixa)
    () => ({
      x: clampXInLane(cellRect.right - bw),
      y: clampY(cellRect.top - bh - TBL_UI_GAP),
    }),
    // abaixo, centrado
    () => ({
      x: clampXInLane(cellRect.left + cellRect.width / 2 - bw / 2),
      y: clampY(cellRect.bottom + TBL_UI_GAP),
    }),
    // abaixo, esquerda
    () => ({
      x: clampXInLane(cellRect.left),
      y: clampY(cellRect.bottom + TBL_UI_GAP),
    }),
    // ao lado esquerdo da célula
    () => ({
      x: clampXInLane(cellRect.left - bw - TBL_UI_GAP),
      y: clampY(cellRect.top + (cellRect.height - bh) / 2),
    }),
  ];

  // candidatos forçados colados à borda livre do painel (último recurso útil)
  for (const pr of forbidden) {
    anchors.push(() => ({
      x: clampXInLane(pr.left - bw - TBL_UI_GAP),
      y: clampY(cellRect.top - bh - TBL_UI_GAP),
    }));
    anchors.push(() => ({
      x: clampXInLane(pr.left - bw - TBL_UI_GAP),
      y: clampY(cellRect.top),
    }));
    anchors.push(() => ({
      x: clampXInLane(pr.right + TBL_UI_GAP),
      y: clampY(cellRect.top - bh - TBL_UI_GAP),
    }));
  }

  const dist = (p) => {
    const cx = cellRect.left + cellRect.width / 2;
    const cy = cellRect.top;
    return Math.hypot(p.x + bw / 2 - cx, p.y + bh / 2 - cy);
  };

  let bestFree = null;
  let bestFreeD = Infinity;
  let bestAny = null;
  let bestAnyD = Infinity;

  for (const make of anchors) {
    const p = make();
    const box = boxOf(p.x, p.y, bw, bh);
    const d = dist(p);
    if (d < bestAnyD) { bestAnyD = d; bestAny = p; }
    if (freeOfForbidden(box, forbidden) && d < bestFreeD) {
      bestFreeD = d;
      bestFree = p;
    }
  }
  if (bestFree) return bestFree;

  // força: cola à esquerda do primeiro painel (ou viewport), no Y da célula
  if (forbidden.length) {
    const pr = forbidden[0];
    return {
      x: clampX(pr.left - bw - TBL_UI_GAP),
      y: clampY(cellRect.top - bh - TBL_UI_GAP),
    };
  }
  return bestAny || {
    x: clampX(cellRect.left + cellRect.width / 2 - bw / 2),
    y: clampY(cellRect.top - bh - TBL_UI_GAP),
  };
}

function paintTblCellColorButtonsSafe(colors) {
  if (!tblCellBar) return;
  const foreBtn = tblCellBar.querySelector('.cb-fore');
  const backBtn = tblCellBar.querySelector('.cb-back');
  const { fore, back } = colors || {};
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

setTableSelectionHook(() => {
  clearTimeout(updateTblCellBar._t);
  updateTblCellBar._t = setTimeout(updateTblCellBar, 40);
});

// ──────────────── barra flutuante de formatação (estilo Notion) ─────────────
const fmtbar = document.getElementById('fmtbar');
const typeSelect = fmtbar.querySelector('.typeselect');
// mousedown na barra NÃO pode roubar o foco/seleção do texto — EXCETO no <select> de
// tipo: select nativo abre a lista no mousedown; preventDefault trava o dropdown.
// setActiveType usa state.activeId, não a Selection ao vivo.
fmtbar.addEventListener('mousedown', (e) => {
  if (e.target !== typeSelect) e.preventDefault();
});

fmtbar.querySelectorAll('.markbtn').forEach(btn => btn.addEventListener('click', () => {
  document.execCommand(btn.dataset.cmd);   // dispara 'input' → sincroniza o bloco
  updateFmtbar();
}));
typeSelect.addEventListener('change', () => {
  setActiveType(typeSelect.value);
  updateFmtbar();
});

// trilha A (t5): cor do texto / destaque. ARMADILHA — o swatch (openSwatchPop) vive no
// <body>, FORA do fmtbar, então NÃO herda o preventDefault do mousedown da barra. Clicar
// num chip tira o foco do contenteditable e colapsa a seleção. Por isso guardamos o Range
// AQUI (a barra ainda segura a seleção) e o restauramos antes do execCommand.
fmtbar.querySelectorAll('.colorbtn').forEach(btn => btn.addEventListener('click', () => {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  const saved = sel.getRangeAt(0).cloneRange();
  const host = editableHostOfRange(saved);
  const fromSel = colorsFromFmtSelection();
  const isHilite = btn.dataset.cmd === 'hiliteColor';
  const current = btn.dataset.color
    || (isHilite ? fromSel.back : fromSel.fore)
    || undefined;
  openSwatchPop(btn, (hex) => {
    if (host) host.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(saved);
    // foreColor sai como <font color>; hiliteColor como <span style="background-color">
    // — ambos disparam 'input' e sincronizam o bloco (mesmo caminho dos .markbtn).
    // highlight: pick(false) do swatch (allowNone) → remove o fundo.
    if (isHilite && (hex === false || hex == null || hex === 'false' || hex === 'transparent' || hex === 'none')) {
      clearHiliteInSelection();
      paintFmtColorButtons({ back: false });
      updateFmtbar();
      return;
    }
    const p = parseColor(hex);
    const applyHex = p?.hex || hex;
    const ok = document.execCommand(btn.dataset.cmd, false, applyHex);
    if (isHilite && !ok) document.execCommand('backColor', false, applyHex);
    if (isHilite) paintFmtColorButtons({ back: hex });
    else paintFmtColorButtons({ fore: hex });
    updateFmtbar();
  }, current, isHilite ? { allowNone: true, noneLabel: 'Nenhum' } : undefined);
}));

/** Remove background-color / hilite da seleção (swatch "Nenhum"). */
function clearHiliteInSelection() {
  // browsers: hiliteColor/backColor com transparent costuma limpar o fundo
  try { document.execCommand('hiliteColor', false, 'transparent'); } catch { /* */ }
  try { document.execCommand('backColor', false, 'transparent'); } catch { /* */ }
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  // limpa spans/marks com background inline que o execCommand deixou pra trás
  const root = range.commonAncestorContainer;
  const rootEl = root.nodeType === 1 ? root : root.parentElement;
  if (!rootEl?.querySelectorAll) return;
  const candidates = rootEl.querySelectorAll('span[style*="background"], mark, font[style*="background"]');
  candidates.forEach((el) => {
    try {
      if (!range.intersectsNode(el) && !el.contains(range.commonAncestorContainer)) return;
    } catch { return; }
    el.style.backgroundColor = '';
    el.style.background = '';
    el.style.backgroundImage = '';
    // se o span só tinha background, desembrulha (não mexe em spans com outras marcas)
    const style = (el.getAttribute('style') || '').replace(/\s+/g, ' ').trim();
    if (!style || /^;*$/.test(style)) {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize?.();
    }
  });
}

// trilha A (t2): abre o mini-editor de URL (aplica createLink / edita / remove <a>)
fmtbar.querySelector('.linkbtn').addEventListener('click', openLinkEdit);

/** contenteditable editável no miolo (#pages) OU na modal de tabela do grid. */
const EDITABLE_HOST_SEL = '#pages [contenteditable]';

// sobe de um nó até o contenteditable do miolo / modal de tabela (ou null)
function editableHostOfRange(range) {
  let n = range && range.commonAncestorContainer;
  while (n && n.nodeType === 3) n = n.parentNode;
  return (n && n.closest && n.closest(EDITABLE_HOST_SEL)) || null;
}
// <a> sob a seleção/cursor (ou null)
function anchorInSelection(sel) {
  let n = sel && sel.anchorNode;
  while (n && n.nodeType === 3) n = n.parentNode;
  if (!n || !n.closest) return null;
  // link só se o contenteditable host for do miolo ou da modal
  const host = n.closest(EDITABLE_HOST_SEL);
  if (!host) return null;
  return n.closest('a') || null;
}

/** Pinta os botões A (texto / highlight) com a cor atual. */
function paintFmtColorButtons({ fore, back } = {}) {
  const foreBtn = fmtbar.querySelector('.cb-fore');
  const backBtn = fmtbar.querySelector('.cb-back');
  if (foreBtn && fore) {
    const p = parseColor(fore);
    const hex = p?.hex || (typeof fore === 'string' ? fore : null);
    if (hex) {
      foreBtn.style.borderBottomColor = hex;
      foreBtn.dataset.color = p ? withAlpha(p.hex, p.alpha) : hex;
    }
  }
  if (backBtn && back !== undefined) {
    // false / transparent / none = sem highlight
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

/** Cores sob a seleção/caret. */
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
    let n = sel.anchorNode;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== pagesEl && n !== document.body) {
      if (n.nodeType === 1) {
        const bg = n.style?.backgroundColor || n.style?.background;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') back = bg;
        if (n.style?.color) { fore = n.style.color; break; }
        if (n.tagName === 'FONT' && n.getAttribute('color')) {
          fore = n.getAttribute('color');
          break;
        }
      }
      // para no envelope de bloco; NÃO para em .tbl-wrap.b (célula da modal/miolo)
      if (n.classList?.contains('page')) break;
      if (n.classList?.contains('b') && !n.classList?.contains('tbl-wrap') && !n.classList?.contains('tbl-editing')) break;
      n = n.parentNode;
    }
  }
  return { fore, back };
}

function updateFmtbar() {
  const sel = getSelection();
  const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  let host = null;
  if (r && !sel.isCollapsed) {
    let n = sel.anchorNode;
    while (n && n.nodeType === 3) n = n.parentNode;
    host = n && n.closest && n.closest(EDITABLE_HOST_SEL);
  }
  if (!host) { fmtbar.hidden = true; return; }
  // célula de tabela: formatação vai na #tblCellBar (não no fmtbar de texto)
  if (host.closest && (host.closest('.tbl-wrap') || host.closest('th, td')?.closest?.('.tbl-wrap'))) {
    fmtbar.hidden = true;
    updateTblCellBar();
    return;
  }
  const role = host.dataset.role || 'block';
  // célula de table-grid: data-id sintético __tg_… — trata como “não miolo de tipo”
  const isGridCell = !!(host.closest && host.closest('.tblgrid-wrap'));
  const isMiolo = !isGridCell && !!host.dataset.id && role === 'block'
    && !!blockOf(host.dataset.id);
  fmtbar.classList.toggle('caption-mode', !isMiolo || isGridCell);
  fmtbar.querySelectorAll('.markbtn').forEach(b =>
    b.classList.toggle('on', document.queryCommandState(b.dataset.cmd)));
  // trilha A (t2): reflete se a seleção está sobre um link existente
  fmtbar.querySelector('.linkbtn').classList.toggle('on', !!anchorInSelection(sel));
  paintFmtColorButtons(colorsFromFmtSelection());
  const blk = isMiolo ? blockOf(host.dataset.id) : null;
  // só troca o valor do <select> se o tipo do bloco estiver entre as opções (ex.: callout
  // não está na lista — mantém o dropdown como estava em vez de ficar num estado inválido)
  if (blk && [...typeSelect.options].some(o => o.value === blk.type)) typeSelect.value = blk.type;
  // acima da seleção, centrada; se não couber, abaixo
  fmtbar.hidden = false;
  const rect = r.getBoundingClientRect();
  const bw = fmtbar.offsetWidth, bh = fmtbar.offsetHeight;
  const x = Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, innerWidth - bw - 8));
  const y = rect.top - bh - 8 >= 8 ? rect.top - bh - 8 : rect.bottom + 8;
  fmtbar.style.left = x + 'px'; fmtbar.style.top = y + 'px';
}

// ── trilha A (t2): mini-editor de URL ────────────────────────────────────────
// createLink exige seleção não-colapsada; o fmtbar só aparece com seleção, então
// "criar link" sempre tem texto. "Editar/remover" seleciona o <a> inteiro. Mesma
// armadilha da cor: digitar no input tira o foco do texto e colapsa a seleção →
// guardamos o Range ao abrir e o restauramos antes do execCommand.
const linkedit = document.getElementById('linkedit');
const linkUrl = document.getElementById('linkUrl');
let linkSavedRange = null, linkHost = null, linkEl = null;
function openLinkEdit() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  linkSavedRange = sel.getRangeAt(0).cloneRange();
  linkHost = editableHostOfRange(linkSavedRange);
  if (!linkHost) return;
  linkEl = anchorInSelection(sel);
  linkUrl.value = linkEl ? (linkEl.getAttribute('href') || '') : '';
  document.getElementById('linkRemove').hidden = !linkEl;
  fmtbar.hidden = true;
  linkedit.hidden = false;
  // posiciona sobre a seleção (ou o link), como o fmtbar
  const rect = (linkEl || linkSavedRange).getBoundingClientRect();
  const bw = linkedit.offsetWidth, bh = linkedit.offsetHeight;
  linkedit.style.left = Math.max(8, Math.min(rect.left, innerWidth - bw - 8)) + 'px';
  linkedit.style.top = (rect.top - bh - 8 >= 8 ? rect.top - bh - 8 : rect.bottom + 8) + 'px';
  linkUrl.focus(); linkUrl.select();
  setTimeout(() => addEventListener('pointerdown', outsideLinkEdit), 0);
}
function closeLinkEdit() {
  removeEventListener('pointerdown', outsideLinkEdit);
  linkedit.hidden = true; linkSavedRange = linkHost = linkEl = null;
}
function outsideLinkEdit(e) { if (!linkedit.contains(e.target)) closeLinkEdit(); }
function applyLink() {
  if (!linkHost) return closeLinkEdit();
  const raw = linkUrl.value.trim();
  linkHost.focus();
  const s = getSelection(); s.removeAllRanges();
  if (linkEl) { const r = document.createRange(); r.selectNode(linkEl); s.addRange(r); }
  else s.addRange(linkSavedRange);
  if (!raw) { if (linkEl) document.execCommand('unlink'); }          // apagou a URL editando → remove
  // sem esquema (e não âncora/relativo/mailto) → prefixa https:// pra não virar link relativo quebrado no PDF
  else document.execCommand('createLink', false, /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(raw) ? raw : 'https://' + raw);
  closeLinkEdit(); updateFmtbar();
}
function removeLink() {
  if (linkEl && linkHost) {
    linkHost.focus();
    const s = getSelection(); s.removeAllRanges();
    const r = document.createRange(); r.selectNode(linkEl); s.addRange(r);
    document.execCommand('unlink');
  }
  closeLinkEdit(); updateFmtbar();
}
linkedit.addEventListener('mousedown', (e) => { if (e.target === linkedit) e.preventDefault(); });
document.getElementById('linkApply').addEventListener('click', applyLink);
// ion-icon name="trash-outline" + rótulo "Remover" (vermelho)
const linkRemoveBtn = document.getElementById('linkRemove');
linkRemoveBtn.innerHTML = `${uiIco('trash', 14, 'outline')}<span>Remover</span>`;
linkRemoveBtn.addEventListener('click', removeLink);
linkUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeLinkEdit(); }
});

document.addEventListener('selectionchange', () => {
  clearTimeout(updateFmtbar._t);
  updateFmtbar._t = setTimeout(updateFmtbar, 80);
  clearTimeout(updateTblCellBar._t);
  updateTblCellBar._t = setTimeout(updateTblCellBar, 80);
});
stage.addEventListener('scroll', () => {
  if (!fmtbar.hidden) updateFmtbar();
  if (!calloutBar.hidden) updateCalloutBar();   // reposiciona (não esconde) — mesmo tratamento do fmtbar
  if (tblCellBar && !tblCellBar.hidden) updateTblCellBar();
  if (tablePanel && !tablePanel.hidden) positionTablePanel();
  if (imageGridPanel && !imageGridPanel.hidden) positionImageGridPanel();
  if (tableGridPanel && !tableGridPanel.hidden) positionTableGridPanel();
  if (textPlacePanel && !textPlacePanel.hidden) positionTextPlacePanel();
  if (iconPanel && !iconPanel.hidden) positionIconBlockPanel();
  if (imgPanel && !imgPanel.hidden) positionImgPanel();
  if (coverPanel && !coverPanel.hidden) positionCoverPanel();
  if (logoPanel && !logoPanel.hidden) positionLogoPanel();
  if (idxPanel && !idxPanel.hidden) positionIdxPanel();
  if (resumoPanel && !resumoPanel.hidden) positionResumoPanel();
  bhandle.hidden = true; badd.hidden = true;    // alças fixed → escondem ao rolar
  closeBlockMenu();
  closeAddImgMenu();
}, { passive: true });
addEventListener('resize', () => {
  if (tblCellBar && !tblCellBar.hidden) updateTblCellBar();
  if (tablePanel && !tablePanel.hidden) positionTablePanel();
  if (imageGridPanel && !imageGridPanel.hidden) positionImageGridPanel();
  if (tableGridPanel && !tableGridPanel.hidden) positionTableGridPanel();
  if (textPlacePanel && !textPlacePanel.hidden) positionTextPlacePanel();
  if (iconPanel && !iconPanel.hidden) positionIconBlockPanel();
  if (imgPanel && !imgPanel.hidden) positionImgPanel();
  if (coverPanel && !coverPanel.hidden) positionCoverPanel();
  if (logoPanel && !logoPanel.hidden) positionLogoPanel();
  if (idxPanel && !idxPanel.hidden) positionIdxPanel();
  if (resumoPanel && !resumoPanel.hidden) positionResumoPanel();
});

// ─────────────────────────── undo / redo ────────────────────────────────────
// captura no document (fase de captura) pra vencer o undo nativo do contenteditable.
// Em campos do sidebar (INPUT/TEXTAREA) deixa o undo nativo do campo agir.
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
}, true);
// Backspace/Delete com um divisor (ou imagem) selecionado e sem foco em texto → remove
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return;
  if (!state.sel) return;
  const ae = document.activeElement;
  if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
  const b = blockOf(state.sel); if (!b) return;
  e.preventDefault();
  state.doc.blocks.splice(idxOf(b.id), 1);
  state.sel = null; closeImgPanel(); render();
});
// trilha E: ⌘↑/⌘↓ (Ctrl no Win/Linux) move o bloco em foco uma posição no fluxo.
// No macOS esse atalho em contenteditable é "ir pro início/fim do documento" → preventDefault.
// Só age com um bloco de MIOLO em foco (contenteditable, role=block); não colide com o
// undo/redo (Cmd+Z/Y) nem com o Backspace/Delete de imagem — cada um filtra outras teclas.
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const host = document.activeElement;
  if (!host || !host.isContentEditable || !host.dataset.id) return;
  if ((host.dataset.role || 'block') !== 'block') return;   // não move título/legenda de imagem
  const i = idxOf(host.dataset.id);
  const j = i + (e.key === 'ArrowUp' ? -1 : 1);
  if (i < 0 || j < 0 || j >= state.doc.blocks.length) return;   // nas pontas: não faz nada
  e.preventDefault();
  const keep = captureCaret();                                  // guarda offset/seleção no bloco movido
  const [moved] = state.doc.blocks.splice(i, 1);
  state.doc.blocks.splice(j, 0, moved);
  render(keep && keep.id === moved.id ? keep : { id: moved.id, role: 'block', offset: 0 });
}, true);
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnUndo').addEventListener('mousedown', (e) => e.preventDefault()); // não rouba o foco do texto
document.getElementById('btnRedo').addEventListener('mousedown', (e) => e.preventDefault());

// ─────────────────────────── init ───────────────────────────────────────────
initAppNav(); // título do header → menu entre ferramentas
initFeedback(); // botão Reportar → issue no GitHub (prefill)
enhanceAll();   // ticks + ímã nos range da sidebar (capa/contracapa)
load();
initSidebarDetails(); // restore open/closed das seções (antes do 1º paint útil)
state.zoom = 'fit';
state.activeId = state.doc.blocks[0]?.id;
document.getElementById('footText').value = state.doc.footText;
document.getElementById('headText').value = state.doc.headText || '';
document.getElementById('firstPage').value = state.doc.firstPage;
syncRuleUI();
syncFootChromeUI();
syncPageBgUI();
syncColLeftUI();
// handle restaurado do IDB + source do LS: reativa poll se for .pdgm vinculado
idb.get('fh').then(async (h) => {
  if (!h) return;
  fileHandle = h;
  const s = state.doc.source;
  if (s && s.kind === 'file' && !s.format) {
    s.format = projectFormatFromName(s.label) || 'md';
  }
  if (!isProjectSource(s)) return;
  try {
    if (await h.queryPermission({ mode: 'readwrite' }) !== 'granted'
      && await h.queryPermission() !== 'granted') {
      // permissão caiu no reload — chip mostra vinculado mas poll só após gesture
      renderSourceChip();
      return;
    }
    const f = await h.getFile();
    linkedMtime = f.lastModified;
    startProjectWatch();
    renderSourceChip();
  } catch (e) {
    console.warn('[projeto] restaurar handle', e);
  }
});
renderSourceChip();
syncSpecialUI();
setSegment('documento');
render();
updateHistBtns();
// libera animações da sidebar só depois do 1º paint (evita “abrir tudo” no load)
requestAnimationFrame(() => { sidebarRevealReady = true; });

// restauração de sessão: o miolo volta do IndexedDB (ver save()). É async, então cai
// DEPOIS do primeiro paint — e por isso só aplica se o documento ainda estiver intocado
// (seed de 1 parágrafo vazio, sem histórico). Se o usuário já começou a digitar nesses
// milissegundos, o que ele escreveu ganha: restaurar por cima seria perder digitação.
const pristine = () => state.doc.blocks.length === 1
  && !(state.doc.blocks[0].html || '').trim() && !hist.past.length;
idb.get('doc').then(doc => {
  if (!doc || !Array.isArray(doc.blocks) || !doc.blocks.length || !pristine()) return;
  // não usa applyDocFile: preserva fileHandle restaurado do IDB (origem vinculada)
  suppressProjectAutosave = true;
  try { applyDoc(doc); }
  finally { setTimeout(() => { suppressProjectAutosave = false; }, 400); }
  if (state.doc.source && !state.doc.source.format) {
    state.doc.source.format = projectFormatFromName(state.doc.source.label) || 'md';
  }
  if (fileHandle && isProjectSource(state.doc.source)) startProjectWatch();
  renderSourceChip();
});
