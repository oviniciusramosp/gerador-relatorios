/* Bloco Tabela — UX inspirada no Notion.
 *
 *   buildTableEl(b, editing, ctx) → DOM
 *     b.rows       — matriz de HTML (1ª linha = cabeçalho)
 *     b.colWidths  — frações 0–1 por coluna (soma ≈ 1); opcional, equal se ausente
 *     ctx          — { commit(), rerender(), removeBlock(id) }
 *   parseMatrix(text) → matriz a partir de TSV/CSV
 *
 * Editor (editing=true), no estilo Notion:
 *   • arrastar a borda entre colunas redimensiona (b.colWidths)
 *   • “+” redondo só aparece perto da borda inferior (linha) / direita (coluna)
 *   • alça ⠿ da row/col: arrastar reordena; click sem arrasto abre menu
 *   • Tab avança célula; Tab na última cria linha; Enter desce uma linha
 *
 * Controles são flutuantes (absolute) — zero impacto no layout / paginação. */

import { splitRow } from './tabela.js';

export function parseMatrix(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return null;
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const rows = lines.map((l) => splitRow(l, delim));
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => { while (r.length < cols) r.push(''); return r; });
}

const COL_FULL = 499;
const MIN_COL_FR = 0.08;   // ~8% da largura — evita coluna colapsar no resize
const seed = () => [['Coluna 1', 'Coluna 2'], ['', '']];

/** Defaults de estilo visual (borda, raio, tipografia, alinhamento). Só persistem se ≠ default. */
export const DEFAULT_HEADER_BG = '#F1F1F4';
export const DEFAULT_HEADER_TEXT = '#000000';
export const DEFAULT_TEXT_COLOR = '#000000';
export const DEFAULT_BORDER_OUTER = '#C9C9C9';
export const DEFAULT_BORDER_INNER = '#C9C9C9';
export const DEFAULT_TABLE_BG = '#FFFFFF';
export const DEFAULT_TABLE_RADIUS = 0;
export const TABLE_RADIUS_MAX = 24;
export const DEFAULT_BORDER_WIDTH = 1;         // px — externa e internas
export const TABLE_BORDER_WIDTH_MIN = 0;
export const TABLE_BORDER_WIDTH_MAX = 4;
export const DEFAULT_TABLE_FONT_SIZE = 10;   // px — bate com o CSS histórico do .tbl
export const TABLE_FONT_SIZE_MIN = 6;
export const TABLE_FONT_SIZE_MAX = 24;
export const DEFAULT_TABLE_LINE_HEIGHT = 1.35; // unitless
export const TABLE_LINE_HEIGHT_MIN = 1;
export const TABLE_LINE_HEIGHT_MAX = 2.5;
export const DEFAULT_TABLE_ALIGN = 'left';     // left | center | right
export const DEFAULT_TABLE_VALIGN = 'top';     // top | middle | bottom

/**
 * Estilos compartilhados no Grid de Tabelas (iguais em todas as colunas).
 * Por tabela no grid só mudam: bg, headerColor, headerTextColor, color.
 */
export const TABLE_GRID_SHARED_KEYS = [
  'fontSize', 'lineHeight', 'borderWidth', 'borderOuter', 'borderInner', 'radius',
];

function nColsOf(b) {
  return Math.max(1, ...(b.rows || []).map((r) => r.length), 1);
}
/**
 * Garante matriz retangular. Só reatribui b.rows quando precisa normalizar —
 * se já estiver ok, muta in-place. Importante pro table-grid: buildTableEl
 * edita um clone com styles shared; se ensureMatrix trocar a ref de rows,
 * addRow/moveRow no “+”/alça não gravam no item real e o rerender desfaz.
 */
function ensureMatrix(b) {
  if (!b.rows || !b.rows.length) {
    b.rows = seed();
    return;
  }
  const cols = nColsOf(b);
  let dirty = false;
  for (const r of b.rows) {
    if (!Array.isArray(r) || r.length !== cols) { dirty = true; break; }
  }
  if (!dirty) return;
  b.rows = b.rows.map((r) => {
    const row = Array.isArray(r) ? r.slice() : [];
    while (row.length < cols) row.push('');
    return row.slice(0, cols);
  });
}

/** Matriz + flags de estilo. Idempotente; defaults não poluem o JSON. */
export function ensureTable(b) {
  if (!b || typeof b !== 'object') return b;
  ensureMatrix(b);
  ensureMerges(b);
  if (b.headerRow === true) delete b.headerRow; // true é o default
  if (b.headerCol === false) delete b.headerCol;
  if (b.hideVLines === false) delete b.hideVLines;
  if (b.altRows === false) delete b.altRows;
  if (b.headerColor === DEFAULT_HEADER_BG) delete b.headerColor;
  if (b.headerTextColor === DEFAULT_HEADER_TEXT || b.headerTextColor === '#000' || b.headerTextColor === '#000000') {
    delete b.headerTextColor;
  }
  if (b.color === DEFAULT_TEXT_COLOR || b.color === '#000' || b.color === '#000000') delete b.color;
  if (b.borderOuter === DEFAULT_BORDER_OUTER) delete b.borderOuter;
  if (b.borderInner === DEFAULT_BORDER_INNER) delete b.borderInner;
  if (b.bg === DEFAULT_TABLE_BG || b.bg === '#FFF' || b.bg === '#fff') delete b.bg;
  // radius 0 = default → some do JSON
  if (b.radius != null) {
    const r = clampTableRadius(b.radius);
    if (r === DEFAULT_TABLE_RADIUS) delete b.radius;
    else b.radius = r;
  }
  if (b.borderWidth != null) {
    const w = clampTableBorderWidth(b.borderWidth);
    if (w === DEFAULT_BORDER_WIDTH) delete b.borderWidth;
    else b.borderWidth = w;
  }
  // alinhamento: só persiste se ≠ default
  if (b.align != null) {
    const a = normalizeTableAlign(b.align);
    if (a === DEFAULT_TABLE_ALIGN) delete b.align;
    else b.align = a;
  }
  if (b.valign != null) {
    const v = normalizeTableValign(b.valign);
    if (v === DEFAULT_TABLE_VALIGN) delete b.valign;
    else b.valign = v;
  }
  if (b.fontSize != null) {
    const fs = clampTableFontSize(b.fontSize);
    if (fs === DEFAULT_TABLE_FONT_SIZE) delete b.fontSize;
    else b.fontSize = fs;
  }
  if (b.lineHeight != null) {
    const lh = clampTableLineHeight(b.lineHeight);
    if (Math.abs(lh - DEFAULT_TABLE_LINE_HEIGHT) < 1e-9) delete b.lineHeight;
    else b.lineHeight = lh;
  }
  return b;
}

/** Limpa defaults dos campos compartilhados do grid (no bloco table-grid). */
export function ensureSharedTableStyle(b) {
  if (!b || typeof b !== 'object') return b;
  if (b.borderOuter === DEFAULT_BORDER_OUTER) delete b.borderOuter;
  if (b.borderInner === DEFAULT_BORDER_INNER) delete b.borderInner;
  if (b.radius != null) {
    const r = clampTableRadius(b.radius);
    if (r === DEFAULT_TABLE_RADIUS) delete b.radius;
    else b.radius = r;
  }
  if (b.borderWidth != null) {
    const w = clampTableBorderWidth(b.borderWidth);
    if (w === DEFAULT_BORDER_WIDTH) delete b.borderWidth;
    else b.borderWidth = w;
  }
  if (b.fontSize != null) {
    const fs = clampTableFontSize(b.fontSize);
    if (fs === DEFAULT_TABLE_FONT_SIZE) delete b.fontSize;
    else b.fontSize = fs;
  }
  if (b.lineHeight != null) {
    const lh = clampTableLineHeight(b.lineHeight);
    if (Math.abs(lh - DEFAULT_TABLE_LINE_HEIGHT) < 1e-9) delete b.lineHeight;
    else b.lineHeight = lh;
  }
  return b;
}

/**
 * Copia estilos compartilhados do grid para um clone de item (render/edição).
 * Estrutura (rows/merges/colWidths) fica compartilhada com o item real — mutações
 * do editor ( + linha, reordenar, etc.) precisam sobreviver ao rerender.
 */
export function resolveGridTableItem(grid, item) {
  const t = item && typeof item === 'object' ? { ...item } : { rows: seed() };
  if (!Array.isArray(t.rows)) t.rows = seed();
  for (const k of TABLE_GRID_SHARED_KEYS) {
    if (grid && grid[k] != null) t[k] = grid[k];
    else delete t[k];
  }
  delete t.id;
  delete t.type;
  ensureTable(t);
  // ensureTable pode ter normalizado rows → devolve a ref ao item e reusa nela
  if (item && typeof item === 'object') {
    item.rows = t.rows;
    t.rows = item.rows;
    if (t.colWidths) {
      item.colWidths = t.colWidths;
      t.colWidths = item.colWidths;
    } else {
      delete item.colWidths;
    }
    if (t.merges?.length) {
      item.merges = t.merges;
      t.merges = item.merges;
    } else {
      delete item.merges;
      delete t.merges;
    }
  }
  return t;
}

// ── merges (agrupar células) ────────────────────────────────────────────────
// b.merges = [{ r, c, cs, rs }] — origem (r,c) com colspan/rowspan; células cobertas
// não são renderizadas. Conteúdo fica só na origem.

export function getMerges(b) {
  return Array.isArray(b?.merges) ? b.merges : [];
}

/** Valida e limpa merges (bounds, overlaps, 1×1). */
export function ensureMerges(b) {
  if (!b || !Array.isArray(b.merges) || !b.merges.length) {
    if (b) delete b.merges;
    return b;
  }
  ensureMatrix(b);
  const nR = b.rows.length;
  const nC = nColsOf(b);
  const cleaned = [];
  for (const raw of b.merges) {
    if (!raw || typeof raw !== 'object') continue;
    const r = Math.max(0, raw.r | 0);
    const c = Math.max(0, raw.c | 0);
    const cs = Math.max(1, (raw.cs | 0) || (raw.colspan | 0) || 1);
    const rs = Math.max(1, (raw.rs | 0) || (raw.rowspan | 0) || 1);
    if (r >= nR || c >= nC) continue;
    if (cs <= 1 && rs <= 1) continue;
    cleaned.push({
      r, c,
      cs: Math.min(cs, nC - c),
      rs: Math.min(rs, nR - r),
    });
  }
  // remove overlaps — mantém o primeiro
  const out = [];
  const taken = new Set();
  for (const m of cleaned) {
    let ok = true;
    for (let dr = 0; dr < m.rs && ok; dr++) {
      for (let dc = 0; dc < m.cs; dc++) {
        if (taken.has(`${m.r + dr},${m.c + dc}`)) { ok = false; break; }
      }
    }
    if (!ok) continue;
    for (let dr = 0; dr < m.rs; dr++) {
      for (let dc = 0; dc < m.cs; dc++) taken.add(`${m.r + dr},${m.c + dc}`);
    }
    out.push(m);
  }
  if (!out.length) delete b.merges;
  else b.merges = out;
  return b;
}

/** Célula coberta por um merge (não é a origem). */
export function isCellCovered(b, r, c) {
  for (const m of getMerges(b)) {
    if (r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs) {
      if (r !== m.r || c !== m.c) return true;
    }
  }
  return false;
}

export function mergeOriginAt(b, r, c) {
  return getMerges(b).find((m) => m.r === r && m.c === c) || null;
}

export function findMergeCovering(b, r, c) {
  return getMerges(b).find((m) =>
    r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs) || null;
}

/** Mescla o retângulo inclusivo. Conteúdo coberto some; origem mantém o seu. */
export function mergeCells(b, r0, c0, r1, c1) {
  ensureMatrix(b);
  const rMin = Math.min(r0 | 0, r1 | 0);
  const rMax = Math.max(r0 | 0, r1 | 0);
  const cMin = Math.min(c0 | 0, c1 | 0);
  const cMax = Math.max(c0 | 0, c1 | 0);
  const cs = cMax - cMin + 1;
  const rs = rMax - rMin + 1;
  if (cs <= 1 && rs <= 1) return false;
  // remove merges que intersectam o retângulo
  const kept = getMerges(b).filter((m) => {
    const overlap = !(m.r + m.rs - 1 < rMin || m.r > rMax || m.c + m.cs - 1 < cMin || m.c > cMax);
    return !overlap;
  });
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      if (r === rMin && c === cMin) continue;
      if (b.rows[r]) b.rows[r][c] = '';
    }
  }
  kept.push({ r: rMin, c: cMin, cs, rs });
  b.merges = kept;
  ensureMerges(b);
  return true;
}

export function unmergeCells(b, r, c) {
  const m = findMergeCovering(b, r, c);
  if (!m) return false;
  b.merges = getMerges(b).filter((x) => !(x.r === m.r && x.c === m.c && x.cs === m.cs && x.rs === m.rs));
  ensureMerges(b);
  return true;
}


export function clampTableRadius(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_TABLE_RADIUS;
  return Math.max(0, Math.min(TABLE_RADIUS_MAX, v));
}

/** Espessura das linhas (0–4 px). Aceita 0.5 (meio-pixel). */
export function clampTableBorderWidth(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_BORDER_WIDTH;
  const clamped = Math.max(TABLE_BORDER_WIDTH_MIN, Math.min(TABLE_BORDER_WIDTH_MAX, v));
  // quantiza em 0.5
  return Math.round(clamped * 2) / 2;
}

export function clampTableFontSize(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_TABLE_FONT_SIZE;
  return Math.max(TABLE_FONT_SIZE_MIN, Math.min(TABLE_FONT_SIZE_MAX, v));
}

export function clampTableLineHeight(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_TABLE_LINE_HEIGHT;
  const clamped = Math.max(TABLE_LINE_HEIGHT_MIN, Math.min(TABLE_LINE_HEIGHT_MAX, v));
  // 2 casas — evita 1.35000001 no JSON
  return Math.round(clamped * 100) / 100;
}

export function normalizeTableAlign(v) {
  return v === 'center' || v === 'right' ? v : 'left';
}

export function normalizeTableValign(v) {
  return v === 'middle' || v === 'bottom' ? v : 'top';
}

export function tableHeaderBg(b) { return (b && b.headerColor) || DEFAULT_HEADER_BG; }
export function tableHeaderTextOf(b) { return (b && b.headerTextColor) || DEFAULT_HEADER_TEXT; }
export function tableTextColorOf(b) { return (b && b.color) || DEFAULT_TEXT_COLOR; }
export function borderOuterOf(b) { return (b && b.borderOuter) || DEFAULT_BORDER_OUTER; }
export function borderInnerOf(b) { return (b && b.borderInner) || DEFAULT_BORDER_INNER; }
export function tableBgOf(b) { return (b && b.bg) || DEFAULT_TABLE_BG; }
export function tableRadiusOf(b) {
  return b && b.radius != null ? clampTableRadius(b.radius) : DEFAULT_TABLE_RADIUS;
}
export function tableBorderWidthOf(b) {
  return b && b.borderWidth != null ? clampTableBorderWidth(b.borderWidth) : DEFAULT_BORDER_WIDTH;
}
export function tableAlignOf(b) {
  return b && b.align != null ? normalizeTableAlign(b.align) : DEFAULT_TABLE_ALIGN;
}
export function tableValignOf(b) {
  return b && b.valign != null ? normalizeTableValign(b.valign) : DEFAULT_TABLE_VALIGN;
}
export function tableFontSizeOf(b) {
  return b && b.fontSize != null ? clampTableFontSize(b.fontSize) : DEFAULT_TABLE_FONT_SIZE;
}
export function tableLineHeightOf(b) {
  return b && b.lineHeight != null ? clampTableLineHeight(b.lineHeight) : DEFAULT_TABLE_LINE_HEIGHT;
}

/** Aplica CSS vars de borda/raio/tipografia/alinhamento (live paint sem rebuild). */
export function applyTableChrome(host, b) {
  if (!host) return;
  const frame = host.classList?.contains('tbl-frame') ? host : host.querySelector?.('.tbl-frame');
  const table = host.matches?.('table.tbl') ? host : host.querySelector?.('table.tbl');
  const outer = borderOuterOf(b);
  const inner = borderInnerOf(b);
  const bg = tableBgOf(b);
  const radius = tableRadiusOf(b);
  const borderW = tableBorderWidthOf(b);
  const headerBg = tableHeaderBg(b);
  const headerText = tableHeaderTextOf(b);
  const textColor = tableTextColorOf(b);
  const align = tableAlignOf(b);
  const valign = tableValignOf(b);
  const fontSize = tableFontSizeOf(b);
  const lineHeight = tableLineHeightOf(b);
  const bw = borderW + 'px';
  const setVars = (el) => {
    if (!el?.style) return;
    el.style.setProperty('--tbl-border-outer', outer);
    el.style.setProperty('--tbl-border-inner', inner);
    el.style.setProperty('--tbl-bg', bg);
    el.style.setProperty('--tbl-radius', radius + 'px');
    el.style.setProperty('--tbl-border-w', bw);
    el.style.setProperty('--tbl-header-bg', headerBg);
    el.style.setProperty('--tbl-header-text', headerText);
    el.style.setProperty('--tbl-text', textColor);
    el.style.setProperty('--tbl-align', align);
    el.style.setProperty('--tbl-valign', valign);
    el.style.setProperty('--tbl-font-size', fontSize + 'px');
    el.style.setProperty('--tbl-line-height', String(lineHeight));
  };
  const target = frame || table || host;
  setVars(target);
  if (frame && frame.style) {
    frame.style.borderRadius = radius + 'px';
    frame.style.borderColor = outer;
    frame.style.borderWidth = bw;
    frame.style.background = bg;
  }
  if (table) {
    setVars(table);
    table.style.fontSize = fontSize + 'px';
    table.style.lineHeight = String(lineHeight);
    table.style.color = textColor;
    table.classList.toggle('no-vlines', b && b.hideVLines === true);
    table.classList.toggle('alt-rows', !!(b && b.altRows));
    table.classList.toggle('no-header-row', b && b.headerRow === false);
    table.classList.toggle('header-col', !!(b && b.headerCol));
    // bordas só nas internas (frame carrega a externa) — evita linha dupla no topo
    const rows = [...table.rows];
    const lastR = rows.length - 1;
    rows.forEach((tr, r) => {
      const cells = [...tr.cells];
      const lastC = cells.length - 1;
      cells.forEach((cell, c) => {
        cell.style.textAlign = align;
        cell.style.verticalAlign = valign;
        cell.style.borderColor = inner;
        cell.style.borderStyle = 'solid';
        // top/left: 0 nas bordas externas; right/bottom: 0 na última linha/col
        cell.style.borderTopWidth = r === 0 ? '0' : bw;
        cell.style.borderLeftWidth = c === 0 ? '0' : bw;
        cell.style.borderRightWidth = c === lastC ? '0' : bw;
        cell.style.borderBottomWidth = r === lastR ? '0' : bw;
        if (cell.classList.contains('tbl-head-cell') || cell.tagName === 'TH') {
          cell.style.background = headerBg;
          cell.style.color = headerText;
        } else {
          cell.style.color = textColor;
          if (!(b && b.altRows)) cell.style.background = '';
        }
      });
    });
    if (b && b.altRows) {
      [...table.rows].forEach((tr, r) => {
        const isHead = b.headerRow !== false && r === 0;
        tr.classList.toggle('alt', !isHead && r % 2 === 0);
      });
    } else {
      table.querySelectorAll('tr.alt').forEach((tr) => tr.classList.remove('alt'));
    }
  }
}
/** frações normalizadas (soma 1), uma por coluna */
export function colWidthsOf(b) {
  ensureMatrix(b);
  const n = nColsOf(b);
  let w = Array.isArray(b.colWidths) ? b.colWidths.map(Number) : [];
  if (w.length !== n || w.some((x) => !(x > 0))) w = Array(n).fill(1 / n);
  const s = w.reduce((a, x) => a + x, 0) || 1;
  return w.map((x) => x / s);
}
function setColWidths(b, fracs) {
  const s = fracs.reduce((a, x) => a + x, 0) || 1;
  b.colWidths = fracs.map((x) => x / s);
}
/** Exportado p/ modal / UI externa adicionar linhas sem reimplementar. */
export function addTableRow(b, at) { addRow(b, at); }
export function addTableCol(b, at) { addCol(b, at); }

function addRow(b, at /* null = fim */) {
  ensureMatrix(b);
  const row = Array(nColsOf(b)).fill('');
  const i = (at == null || at >= b.rows.length) ? b.rows.length : Math.max(1, at);
  if (i >= b.rows.length) b.rows.push(row);
  else b.rows.splice(i, 0, row);
  // merges: origens em/abaixo de i descem; merges que cruzam i são descartados
  if (b.merges?.length) {
    b.merges = getMerges(b).map((m) => {
      if (m.r >= i) return { ...m, r: m.r + 1 };
      if (m.r + m.rs - 1 >= i) return null;
      return m;
    }).filter(Boolean);
    ensureMerges(b);
  }
}
function addCol(b, at /* null = fim */) {
  ensureMatrix(b);
  const n = nColsOf(b);
  const i = at == null ? n : Math.max(0, Math.min(n, at));
  // larguras ANTES de inserir a coluna — senão colWidthsOf já vê n+1 e
  // o splice do slice gera n+2 frações (bug silencioso no “+” coluna).
  const w = colWidthsOf(b);
  b.rows.forEach((r) => r.splice(i, 0, ''));
  // nova coluna nasce com fatia igual à média; re-normaliza
  const slice = 1 / (n + 1);
  const scaled = w.map((x) => x * (1 - slice));
  scaled.splice(i, 0, slice);
  setColWidths(b, scaled);
  if (b.merges?.length) {
    b.merges = getMerges(b).map((m) => {
      if (m.c >= i) return { ...m, c: m.c + 1 };
      if (m.c + m.cs - 1 >= i) return null;
      return m;
    }).filter(Boolean);
    ensureMerges(b);
  }
}
function delRow(b, r) {
  ensureMatrix(b);
  if (b.rows.length <= 2 || r <= 0) return false; // protege header + 1 linha
  b.rows.splice(r, 1);
  if (b.merges?.length) {
    b.merges = getMerges(b).map((m) => {
      if (m.r === r || (m.r < r && m.r + m.rs - 1 >= r)) return null;
      if (m.r > r) return { ...m, r: m.r - 1 };
      return m;
    }).filter(Boolean);
    ensureMerges(b);
  }
  return true;
}
function delCol(b, c) {
  ensureMatrix(b);
  if (nColsOf(b) <= 1) return false;
  b.rows.forEach((r) => r.splice(c, 1));
  const w = colWidthsOf(b);
  w.splice(c, 1);
  setColWidths(b, w);
  if (b.merges?.length) {
    b.merges = getMerges(b).map((m) => {
      if (m.c === c || (m.c < c && m.c + m.cs - 1 >= c)) return null;
      if (m.c > c) return { ...m, c: m.c - 1 };
      return m;
    }).filter(Boolean);
    ensureMerges(b);
  }
  return true;
}
/** reordena linha de dados (header r=0 fica fixo) */
function moveRow(b, from, to) {
  ensureMatrix(b);
  if (from <= 0 || to <= 0 || from === to) return false;
  if (to >= b.rows.length) to = b.rows.length - 1;
  const [row] = b.rows.splice(from, 1);
  b.rows.splice(to, 0, row);
  // reordenar com merges é frágil — descarta merges que tocam as linhas movidas
  if (b.merges?.length) {
    b.merges = getMerges(b).filter((m) =>
      !(m.r === from || m.r === to || (m.r < from && m.r + m.rs - 1 >= from)
        || (m.r < to && m.r + m.rs - 1 >= to)));
    // remapeia origens simples (1 linha) se sobraram
    b.merges = getMerges(b).map((m) => {
      let r = m.r;
      if (from < to) {
        if (r > from && r <= to) r -= 1;
      } else if (r >= to && r < from) r += 1;
      return { ...m, r };
    });
    ensureMerges(b);
  }
  return true;
}
function moveCol(b, from, to) {
  ensureMatrix(b);
  const n = nColsOf(b);
  if (from < 0 || to < 0 || from >= n || to >= n || from === to) return false;
  b.rows.forEach((r) => {
    const [cell] = r.splice(from, 1);
    r.splice(to, 0, cell);
  });
  const w = colWidthsOf(b);
  const [fw] = w.splice(from, 1);
  w.splice(to, 0, fw);
  setColWidths(b, w);
  if (b.merges?.length) {
    b.merges = getMerges(b).filter((m) =>
      !(m.c === from || m.c === to || (m.c < from && m.c + m.cs - 1 >= from)
        || (m.c < to && m.c + m.cs - 1 >= to)));
    b.merges = getMerges(b).map((m) => {
      let c = m.c;
      if (from < to) {
        if (c > from && c <= to) c -= 1;
      } else if (c >= to && c < from) c += 1;
      return { ...m, c };
    });
    ensureMerges(b);
  }
  return true;
}

function closeAnyTblMenu() {
  document.querySelectorAll('.tbl-menu').forEach((el) => el.remove());
}

function openTblMenu(anchor, items, onClose) {
  closeAnyTblMenu();
  const menu = document.createElement('div');
  menu.className = 'tbl-menu';
  items.forEach((it) => {
    if (it.switcher) {
      const row = document.createElement('div');
      row.className = 'tbl-menu-sw';
      const lab = document.createElement('span');
      lab.textContent = it.label;
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'sw';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!it.on));
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', String(next));
        it.fn(next);
      });
      row.append(lab, sw);
      menu.appendChild(row);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = it.label;
    if (it.danger) btn.className = 'danger';
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAnyTblMenu();
      onClose && onClose();
      it.fn();
    });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth || 160, mh = menu.offsetHeight || 80;
  let x = r.left, y = r.bottom + 4;
  if (x + mw > innerWidth - 8) x = innerWidth - mw - 8;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  const dismiss = (e) => {
    if (menu.contains(e.target) || anchor.contains(e.target)) return;
    closeAnyTblMenu();
    onClose && onClose();
    document.removeEventListener('mousedown', dismiss, true);
  };
  setTimeout(() => document.addEventListener('mousedown', dismiss, true), 0);
  return menu;
}

function isHeaderRow(b, r) { return b.headerRow !== false && r === 0; }
function isHeaderCol(b, c) { return !!b.headerCol && c === 0; }
function isHeaderCell(b, r, c) { return isHeaderRow(b, r) || isHeaderCol(b, c); }

/**
 * Monta o DOM da tabela.
 * @param {object} b
 * @param {boolean} editing
 * @param {{ commit?:Function, rerender?:Function, removeBlock?:Function }} ctx
 * @param {number} [widthPx] largura do wrap (default COL_FULL = 499)
 */
export function buildTableEl(b, editing, ctx = {}, widthPx = COL_FULL) {
  ensureTable(b);
  const widths = colWidthsOf(b);
  const cols = widths.length;
  const w = Math.max(1, +widthPx || COL_FULL);

  const wrap = document.createElement('div');
  wrap.className = 'tbl-wrap b' + (editing ? ' tbl-editing' : '');
  if (b.id) wrap.dataset.id = b.id;
  wrap.style.width = w + 'px';

  const frame = document.createElement('div');
  frame.className = 'tbl-frame';

  const table = document.createElement('table');
  table.className = 'tbl'
    + (b.hideVLines === true ? ' no-vlines' : '')
    + (b.altRows ? ' alt-rows' : '')
    + (b.headerRow === false ? ' no-header-row' : '')
    + (b.headerCol ? ' header-col' : '');
  const cg = document.createElement('colgroup');
  widths.forEach((fr) => {
    const col = document.createElement('col');
    col.style.width = (fr * 100).toFixed(3) + '%';
    cg.appendChild(col);
  });
  table.appendChild(cg);

  // seleção de range pra mesclar (anchor + focus); null = nenhuma
  let cellSel = null; // { r0, c0, r1, c1 }
  // paintCellSel é preenchido no bloco editing (handlers de mousedown fecham sobre ele)
  let paintCellSel = () => {};

  b.rows.forEach((row, r) => {
    const tr = document.createElement('tr');
    tr.dataset.row = String(r);
    if (b.altRows && !isHeaderRow(b, r) && r % 2 === 0) tr.classList.add('alt');
    row.forEach((cell, c) => {
      if (isCellCovered(b, r, c)) return; // coberta por merge — não renderiza
      const head = isHeaderCell(b, r, c);
      const td = document.createElement(head && isHeaderRow(b, r) ? 'th' : 'td');
      td.dataset.col = String(c);
      td.dataset.row = String(r);
      const origin = mergeOriginAt(b, r, c);
      if (origin) {
        if (origin.cs > 1) td.colSpan = origin.cs;
        if (origin.rs > 1) td.rowSpan = origin.rs;
        td.classList.add('tbl-merged');
      }
      if (head) {
        td.classList.add('tbl-head-cell');
        td.style.background = tableHeaderBg(b);
        td.style.fontWeight = '700';
      }
      td.innerHTML = cell || '';
      if (editing) {
        td.contentEditable = 'true';
        td.spellcheck = true;
        td.lang = 'pt-BR';
        td.addEventListener('input', () => {
          b.rows[r][c] = td.innerHTML;
          ctx.commit?.();
        });
        td.addEventListener('paste', (e) => {
          const txt = e.clipboardData.getData('text/plain');
          if (!/\t|\r?\n/.test(txt)) return;
          const m = parseMatrix(txt);
          if (!m) return;
          e.preventDefault();
          e.stopPropagation();
          b.rows = m;
          delete b.colWidths;
          delete b.merges;
          ctx.rerender?.();
        });
        td.addEventListener('keydown', (e) => onCellKey(e, b, r, c, ctx, table));
        // Shift+clique = estende seleção de merge; clique simples redefine âncora
        td.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          if (e.shiftKey && cellSel) {
            e.preventDefault(); // não move caret — só range
            cellSel = { ...cellSel, r1: r, c1: c };
          } else {
            cellSel = { r0: r, c0: c, r1: r, c1: c };
          }
          paintCellSel();
        });
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  applyTableChrome(frame, b);
  applyTableChrome(table, b);
  // frame SÓ com a table — overflow:hidden clipa header/cantos; chrome fica no wrap
  frame.appendChild(table);
  wrap.appendChild(frame);

  if (editing) {
    // barra de mesclar / desagrupar (visível com seleção) — fora do frame (não clipa)
    const mergeBar = document.createElement('div');
    mergeBar.className = 'tbl-merge-bar';
    mergeBar.hidden = true;
    const mergeBtn = document.createElement('button');
    mergeBtn.type = 'button';
    mergeBtn.className = 'tbl-merge-btn';
    mergeBtn.textContent = 'Mesclar células';
    mergeBtn.title = 'Agrupa o retângulo selecionado (Shift+clique pra estender)';
    const unmergeBtn = document.createElement('button');
    unmergeBtn.type = 'button';
    unmergeBtn.className = 'tbl-merge-btn';
    unmergeBtn.textContent = 'Desagrupar';
    unmergeBtn.title = 'Remove o agrupamento da célula';
    mergeBar.append(mergeBtn, unmergeBtn);

    paintCellSel = () => {
      table.querySelectorAll('th.tbl-sel, td.tbl-sel').forEach((el) => el.classList.remove('tbl-sel'));
      if (!cellSel) {
        mergeBar.hidden = true;
        return;
      }
      const rMin = Math.min(cellSel.r0, cellSel.r1);
      const rMax = Math.max(cellSel.r0, cellSel.r1);
      const cMin = Math.min(cellSel.c0, cellSel.c1);
      const cMax = Math.max(cellSel.c0, cellSel.c1);
      const multi = rMin !== rMax || cMin !== cMax;
      let hasMerge = false;
      table.querySelectorAll('th, td').forEach((el) => {
        const rr = +el.dataset.row;
        const cc = +el.dataset.col;
        const m = mergeOriginAt(b, rr, cc) || findMergeCovering(b, rr, cc);
        const cs = m && m.r === rr && m.c === cc ? m.cs : 1;
        const rs = m && m.r === rr && m.c === cc ? m.rs : 1;
        // célula na seleção se intersecta o retângulo
        const hit = !(rr + rs - 1 < rMin || rr > rMax || cc + cs - 1 < cMin || cc > cMax);
        if (hit) el.classList.add('tbl-sel');
        if (hit && m && (m.cs > 1 || m.rs > 1)) hasMerge = true;
      });
      mergeBtn.disabled = !multi;
      // se a seleção é 1 célula mesclada, permite desagrupar
      if (!multi) {
        const m = findMergeCovering(b, rMin, cMin);
        unmergeBtn.disabled = !m || (m.cs <= 1 && m.rs <= 1);
      } else {
        unmergeBtn.disabled = !hasMerge;
      }
      mergeBar.hidden = !multi && unmergeBtn.disabled;
    };

    mergeBtn.addEventListener('mousedown', (e) => e.preventDefault());
    unmergeBtn.addEventListener('mousedown', (e) => e.preventDefault());
    mergeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!cellSel) return;
      if (mergeCells(b, cellSel.r0, cellSel.c0, cellSel.r1, cellSel.c1)) {
        ctx.rerender?.();
      }
    });
    unmergeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!cellSel) return;
      const r = Math.min(cellSel.r0, cellSel.r1);
      const c = Math.min(cellSel.c0, cellSel.c1);
      if (unmergeCells(b, r, c)) ctx.rerender?.();
    });

    // hover contextual: alça da row/col sob o cursor; “+” só perto da borda
    const EDGE = 18; // px de proximidade da borda p/ mostrar +
    const updateEdgeProximity = (clientX, clientY) => {
      const r = table.getBoundingClientRect();
      const nearBot = clientY >= r.bottom - EDGE && clientY <= r.bottom + 16;
      const nearRight = clientX >= r.right - EDGE && clientX <= r.right + 16;
      wrap.classList.toggle('tbl-near-bot', nearBot);
      wrap.classList.toggle('tbl-near-right', nearRight);
    };
    wrap.addEventListener('pointerover', (e) => {
      const cell = e.target.closest && e.target.closest('th, td');
      if (cell && table.contains(cell)) {
        wrap.dataset.hoverRow = cell.dataset.row ?? '';
        wrap.dataset.hoverCol = cell.dataset.col ?? '';
      } else {
        const rh = e.target.closest && e.target.closest('.tbl-row-handle');
        if (rh) wrap.dataset.hoverRow = rh.dataset.row ?? '';
        const ch = e.target.closest && e.target.closest('.tbl-col-handle');
        if (ch) wrap.dataset.hoverCol = ch.dataset.col ?? '';
      }
    });
    wrap.addEventListener('pointermove', (e) => updateEdgeProximity(e.clientX, e.clientY));
    wrap.addEventListener('pointerleave', () => {
      if (!wrap.dataset.menuRow && !wrap.dataset.menuCol) {
        delete wrap.dataset.hoverRow;
        delete wrap.dataset.hoverCol;
      }
      wrap.classList.remove('tbl-near-bot', 'tbl-near-right');
    });

    // ── resize handles entre colunas ──────────────────────────────────────
    const resizers = document.createElement('div');
    resizers.className = 'tbl-resizers';
    resizers.setAttribute('aria-hidden', 'true');
    for (let c = 0; c < cols - 1; c++) {
      const h = document.createElement('div');
      h.className = 'tbl-resizer';
      h.dataset.after = String(c);
      h.title = 'Arrastar para redimensionar';
      placeResizer(h, table, c);
      h.addEventListener('pointerdown', (e) => startResize(e, b, c, wrap, table, ctx));
      resizers.appendChild(h);
    }
    wrap.appendChild(resizers);

    // ── alças de linha: drag = reordenar; click = menu ─────────────────────
    const rowHandles = document.createElement('div');
    rowHandles.className = 'tbl-row-handles';
    b.rows.forEach((_, r) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tbl-handle tbl-row-handle';
      btn.dataset.row = String(r);
      btn.title = r === 0
        ? 'Opções da linha (cabeçalho)'
        : 'Arrastar para reordenar · clique p/ opções';
      btn.innerHTML = '<span></span><span></span><span></span>';
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopImmediatePropagation?.();
        if (r === 0) {
          // header row: só menu (não reordena)
          e.preventDefault();
          e.stopPropagation();
          wrap.dataset.menuRow = '0';
          openTblMenu(btn, [
            {
              label: 'Linha de cabeçalho',
              switcher: true,
              on: b.headerRow !== false,
              fn: (on) => { b.headerRow = on; ctx.commit(); ctx.rerender(); },
            },
            { label: 'Inserir abaixo', fn: () => { addRow(b, 1); ctx.rerender(); } },
          ], () => { delete wrap.dataset.menuRow; });
          return;
        }
        startRowDrag(e, b, r, wrap, table, btn, ctx);
      });
      rowHandles.appendChild(btn);
    });
    wrap.appendChild(rowHandles);

    // ── alças de coluna: drag = reordenar; click = menu ────────────────────
    const colHandles = document.createElement('div');
    colHandles.className = 'tbl-col-handles';
    for (let c = 0; c < cols; c++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tbl-handle tbl-col-handle';
      btn.dataset.col = String(c);
      btn.title = 'Arrastar para reordenar · clique p/ opções';
      btn.innerHTML = '<span></span><span></span><span></span>';
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopImmediatePropagation?.();
        startColDrag(e, b, c, wrap, table, btn, ctx, {
          // 1ª coluna: switcher de cabeçalho no menu de click
          headerSwitcher: c === 0,
        });
      });
      colHandles.appendChild(btn);
    }
    wrap.appendChild(colHandles);

    // ── “+” redondos, só perto da borda ────────────────────────────────────
    // pointerdown (não click): no table-grid o mousedown do painel/célula
    // podia destruir o botão antes do click; ação imediata + stopImmediate.
    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'tbl-edge-add tbl-add-row';
    addRowBtn.title = 'Nova linha';
    addRowBtn.textContent = '+';
    addRowBtn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      addRow(b, null);
      ctx.rerender?.();
    });
    wrap.appendChild(addRowBtn);

    const addColBtn = document.createElement('button');
    addColBtn.type = 'button';
    addColBtn.className = 'tbl-edge-add tbl-add-col';
    addColBtn.title = 'Nova coluna';
    addColBtn.textContent = '+';
    addColBtn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      addCol(b, null);
      ctx.rerender?.();
    });
    wrap.appendChild(addColBtn);

    // linha-guia de drop durante drag de reordenação
    const dropLine = document.createElement('div');
    dropLine.className = 'tbl-drop-line';
    dropLine.hidden = true;
    wrap.appendChild(dropLine);

    // merge bar abaixo do frame (fluxo normal)
    wrap.appendChild(mergeBar);

    requestAnimationFrame(() => {
      resizers.querySelectorAll('.tbl-resizer').forEach((h) => placeResizer(h, table, +h.dataset.after));
      layoutRowHandles(rowHandles, table);
      layoutColHandles(colHandles, table);
      placeEdgeAdds(wrap, table);
    });
  }

  return wrap;
}

/** Posição de um ponto (viewport) relativa ao offsetParent do handle. */
function relToParent(el, clientX, clientY) {
  const parent = el.offsetParent || el.parentElement;
  if (!parent) return { x: clientX, y: clientY };
  const pr = parent.getBoundingClientRect();
  return { x: clientX - pr.left, y: clientY - pr.top };
}

function placeResizer(handle, table, afterCol) {
  const rows = table.rows;
  if (!rows.length || !rows[0].cells[afterCol]) return;
  const cell = rows[0].cells[afterCol];
  const tr = table.getBoundingClientRect();
  const cr = cell.getBoundingClientRect();
  const topLeft = relToParent(handle, tr.left, tr.top);
  handle.style.left = (relToParent(handle, cr.right, cr.top).x - 3) + 'px';
  handle.style.top = topLeft.y + 'px';
  handle.style.height = tr.height + 'px';
}

function layoutRowHandles(box, table) {
  const tr = table.getBoundingClientRect();
  const origin = relToParent(box, tr.left, tr.top);
  box.style.top = origin.y + 'px';
  box.style.height = tr.height + 'px';
  [...box.children].forEach((btn) => {
    const r = +btn.dataset.row;
    const row = table.rows[r];
    if (!row) return;
    const rr = row.getBoundingClientRect();
    // centra o botão 12px na altura da linha (relativo ao box)
    btn.style.top = (rr.top - tr.top + rr.height / 2 - 6) + 'px';
  });
}

function layoutColHandles(box, table) {
  if (!table.rows[0]) return;
  const tr = table.getBoundingClientRect();
  const origin = relToParent(box, tr.left, tr.top);
  box.style.top = origin.y + 'px';
  box.style.left = origin.x + 'px';
  box.style.width = tr.width + 'px';
  [...box.children].forEach((btn) => {
    const c = +btn.dataset.col;
    // cells[] ignora cobertas — usa query por data-col na 1ª linha
    const cell = table.querySelector(`tr[data-row="0"] [data-col="${c}"]`)
      || table.rows[0].cells[c];
    if (!cell) return;
    const cr = cell.getBoundingClientRect();
    btn.style.left = (cr.left - tr.left + cr.width / 2 - 6) + 'px';
  });
}

/** Posiciona os “+” de borda relativos ao wrap, alinhados à tabela. */
function placeEdgeAdds(wrap, table) {
  const tr = table.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const addRow = wrap.querySelector('.tbl-add-row');
  const addCol = wrap.querySelector('.tbl-add-col');
  if (addRow) {
    addRow.style.left = (tr.left - wr.left + tr.width / 2) + 'px';
    addRow.style.top = (tr.bottom - wr.top) + 'px';
  }
  if (addCol) {
    addCol.style.left = (tr.right - wr.left) + 'px';
    addCol.style.top = (tr.top - wr.top + tr.height / 2) + 'px';
  }
}

function startResize(e, b, afterCol, wrap, table, ctx) {
  e.preventDefault();
  e.stopPropagation();
  closeAnyTblMenu();
  const startX = e.clientX;
  const start = colWidthsOf(b);
  const wrapW = wrap.getBoundingClientRect().width || COL_FULL;
  const left = afterCol;
  const right = afterCol + 1;
  const pair = start[left] + start[right];
  wrap.classList.add('tbl-resizing');
  const onMove = (ev) => {
    const dx = (ev.clientX - startX) / wrapW;
    let l = start[left] + dx;
    let r = pair - l;
    if (l < MIN_COL_FR) { l = MIN_COL_FR; r = pair - l; }
    if (r < MIN_COL_FR) { r = MIN_COL_FR; l = pair - r; }
    const next = start.slice();
    next[left] = l;
    next[right] = r;
    setColWidths(b, next);
    const cols = table.querySelectorAll('col');
    const fr = colWidthsOf(b);
    cols.forEach((col, i) => { col.style.width = (fr[i] * 100).toFixed(3) + '%'; });
    wrap.querySelectorAll('.tbl-resizer').forEach((h) => placeResizer(h, table, +h.dataset.after));
    const ch = wrap.querySelector('.tbl-col-handles');
    if (ch) layoutColHandles(ch, table);
  };
  const onUp = () => {
    wrap.classList.remove('tbl-resizing');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    ctx.commit();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

const DRAG_THRESH = 4; // px — abaixo disso conta como click (menu)

function rowIndexAtY(table, clientY) {
  // só linhas de dados (pula header)
  for (let r = 1; r < table.rows.length; r++) {
    const rr = table.rows[r].getBoundingClientRect();
    if (clientY < rr.top + rr.height / 2) return r;
  }
  return Math.max(1, table.rows.length - 1);
}
function colIndexAtX(table, clientX) {
  if (!table.rows[0]) return 0;
  const cells = table.rows[0].cells;
  for (let c = 0; c < cells.length; c++) {
    const cr = cells[c].getBoundingClientRect();
    if (clientX < cr.left + cr.width / 2) return c;
  }
  return cells.length - 1;
}
// `from` = índice de origem do item arrastado. A linha marca a borda de INSERÇÃO:
// arrastando pra direita/baixo → borda direita/inferior do alvo (a coluna/linha sob o
// cursor fica “antes” do item solto); pra esquerda/cima → borda esquerda/superior.
function showDropLine(wrap, table, kind, index, from) {
  const line = wrap.querySelector('.tbl-drop-line');
  if (!line) return;
  const wr = wrap.getBoundingClientRect();
  const tr = table.getBoundingClientRect();
  line.hidden = false;
  line.className = 'tbl-drop-line tbl-drop-' + kind;
  if (kind === 'row') {
    const row = table.rows[index];
    if (!row) { line.hidden = true; return; }
    const rr = row.getBoundingClientRect();
    const atEnd = from != null && from < index; // descendo → linha embaixo do alvo
    line.style.left = (tr.left - wr.left) + 'px';
    line.style.width = tr.width + 'px';
    line.style.right = 'auto';
    line.style.top = ((atEnd ? rr.bottom : rr.top) - wr.top - 1) + 'px';
    line.style.height = '2px';
  } else {
    const cell = table.querySelector(`tr[data-row="0"] [data-col="${index}"]`)
      || table.rows[0]?.cells[index];
    if (!cell) { line.hidden = true; return; }
    const cr = cell.getBoundingClientRect();
    const atEnd = from != null && from < index;
    line.style.top = (tr.top - wr.top) + 'px';
    line.style.height = tr.height + 'px';
    line.style.bottom = 'auto';
    line.style.left = ((atEnd ? cr.right : cr.left) - wr.left - 1) + 'px';
    line.style.width = '2px';
  }
}
function hideDropLine(wrap) {
  const line = wrap.querySelector('.tbl-drop-line');
  if (line) line.hidden = true;
}

function startRowDrag(e, b, from, wrap, table, btn, ctx) {
  e.preventDefault();
  e.stopPropagation();
  closeAnyTblMenu();
  const startY = e.clientY;
  let dragging = false;
  let target = from;
  wrap.dataset.hoverRow = String(from);

  const onMove = (ev) => {
    if (!dragging && Math.abs(ev.clientY - startY) < DRAG_THRESH) return;
    if (!dragging) {
      dragging = true;
      wrap.classList.add('tbl-dragging-row');
      btn.classList.add('tbl-dragging');
      btn.setPointerCapture?.(ev.pointerId);
    }
    target = rowIndexAtY(table, ev.clientY);
    showDropLine(wrap, table, 'row', target, from);
    wrap.dataset.hoverRow = String(target);
  };
  const onUp = (ev) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    hideDropLine(wrap);
    wrap.classList.remove('tbl-dragging-row');
    btn.classList.remove('tbl-dragging');
    if (!dragging) {
      // click → menu
      wrap.dataset.menuRow = String(from);
      openTblMenu(btn, [
        { label: 'Inserir acima', fn: () => { addRow(b, from); ctx.rerender(); } },
        { label: 'Inserir abaixo', fn: () => { addRow(b, from + 1); ctx.rerender(); } },
        { label: 'Apagar linha', danger: true, fn: () => { if (delRow(b, from)) ctx.rerender(); } },
      ], () => { delete wrap.dataset.menuRow; });
      return;
    }
    if (target !== from && moveRow(b, from, target)) ctx.rerender();
    else ctx.commit();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function startColDrag(e, b, from, wrap, table, btn, ctx, opts = {}) {
  e.preventDefault();
  e.stopPropagation();
  closeAnyTblMenu();
  const startX = e.clientX;
  let dragging = false;
  let target = from;
  wrap.dataset.hoverCol = String(from);

  const onMove = (ev) => {
    if (!dragging && Math.abs(ev.clientX - startX) < DRAG_THRESH) return;
    if (!dragging) {
      dragging = true;
      wrap.classList.add('tbl-dragging-col');
      btn.classList.add('tbl-dragging');
    }
    target = colIndexAtX(table, ev.clientX);
    showDropLine(wrap, table, 'col', target, from);
    wrap.dataset.hoverCol = String(target);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    hideDropLine(wrap);
    wrap.classList.remove('tbl-dragging-col');
    btn.classList.remove('tbl-dragging');
    if (!dragging) {
      wrap.dataset.menuCol = String(from);
      const items = [];
      if (opts.headerSwitcher || from === 0) {
        items.push({
          label: 'Coluna de cabeçalho',
          switcher: true,
          on: !!b.headerCol,
          fn: (on) => { b.headerCol = on; ctx.commit(); ctx.rerender(); },
        });
      }
      items.push(
        { label: 'Inserir à esquerda', fn: () => { addCol(b, from); ctx.rerender(); } },
        { label: 'Inserir à direita', fn: () => { addCol(b, from + 1); ctx.rerender(); } },
        { label: 'Apagar coluna', danger: true, fn: () => { if (delCol(b, from)) ctx.rerender(); } },
      );
      openTblMenu(btn, items, () => { delete wrap.dataset.menuCol; });
      return;
    }
    if (target !== from && moveCol(b, from, target)) ctx.rerender();
    else ctx.commit();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function nextVisibleCell(b, r, c, dRow, dCol) {
  ensureMatrix(b);
  const nR = b.rows.length;
  const nC = nColsOf(b);
  let nr = r + dRow;
  let nc = c + dCol;
  // Tab: avança col; Enter: avança row
  if (dCol !== 0) {
    while (nr >= 0 && nr < nR) {
      while (nc >= 0 && nc < nC) {
        if (!isCellCovered(b, nr, nc)) return { r: nr, c: nc };
        nc += dCol;
      }
      nr += dCol > 0 ? 1 : -1;
      nc = dCol > 0 ? 0 : nC - 1;
    }
    return null;
  }
  while (nr >= 0 && nr < nR) {
    if (!isCellCovered(b, nr, c)) return { r: nr, c };
    nr += dRow;
  }
  return null;
}

function onCellKey(e, b, r, c, ctx, table) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const dir = e.shiftKey ? -1 : 1;
    let next = nextVisibleCell(b, r, c, 0, dir);
    if (!next && dir > 0) {
      addRow(b, null);
      ctx.rerender?.();
      requestAnimationFrame(() => focusCell(b.id, b.rows.length - 1, 0));
      return;
    }
    if (!next) return;
    focusCell(b.id, next.r, next.c);
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    let next = nextVisibleCell(b, r, c, 1, 0);
    if (!next) {
      addRow(b, null);
      ctx.rerender?.();
      requestAnimationFrame(() => focusCell(b.id, b.rows.length - 1, c));
      return;
    }
    focusCell(b.id, next.r, next.c);
  }
}

function focusCell(tableId, r, c) {
  // id do bloco (miolo) ou fallback: tabela aberta na modal do grid
  let wrap = tableId
    ? document.querySelector(`.tbl-wrap[data-id="${CSS.escape(String(tableId))}"]`)
    : null;
  if (!wrap) wrap = document.querySelector('.tblgrid-wrap .tbl-wrap.tbl-editing, .tblgrid-wrap .tbl-wrap');
  if (!wrap) return;
  const cell = wrap.querySelector(`tr[data-row="${r}"] [data-col="${c}"]`)
    || wrap.querySelectorAll('tr')[r]?.cells?.[c];
  if (!cell) return;
  cell.focus();
  const sel = getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// CSS — material impresso (preto/branco) + chrome flutuante de edição.
// Controles são position:absolute FORA do fluxo: zero margem no frame → a tabela
// não é empurrada pra direita nem o miolo pra baixo.
(function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('tbl-css')) return;
  const s = document.createElement('style');
  s.id = 'tbl-css';
  s.textContent = `
  /* flow-root: BFC próprio — a margem do bloco seguinte (p com margin-top) não colapsa
     com nada dentro da tabela e o vão padrão da página (PARA_LH) aparece de verdade. */
  .tbl-wrap { position: relative; z-index: 2; overflow: visible; display: flow-root; }
  /* frame: borda EXTERNA + radius; overflow:hidden clipa cabeçalho e corpo nos cantos.
     Chrome de edição (alças, +) fica no .tbl-wrap — não dentro do frame. */
  .tbl-frame {
    position: relative; overflow: hidden;
    border: var(--tbl-border-w, 1px) solid var(--tbl-border-outer, #C9C9C9);
    border-radius: var(--tbl-radius, 0px);
    box-sizing: border-box;
    background: var(--tbl-bg, #fff);
  }
  .tbl { width: 100%; table-layout: fixed; border-collapse: collapse;
    font-size: var(--tbl-font-size, 10px); line-height: var(--tbl-line-height, 1.35);
    color: var(--tbl-text, #000);
    background: transparent;
    --tbl-border-outer: #C9C9C9;
    --tbl-border-inner: #C9C9C9;
    --tbl-bg: #FFFFFF;
    --tbl-radius: 0px;
    --tbl-border-w: 1px;
    --tbl-header-bg: #F1F1F4;
    --tbl-header-text: #000000;
    --tbl-text: #000000;
    --tbl-align: left;
    --tbl-valign: top;
    --tbl-font-size: 10px;
    --tbl-line-height: 1.35;
  }
  .tbl th, .tbl td {
    /* só bordas internas por default; applyTableChrome zera as externas com inline */
    border-color: var(--tbl-border-inner, #C9C9C9);
    border-style: solid;
    border-width: 0;
    border-right-width: var(--tbl-border-w, 1px);
    border-bottom-width: var(--tbl-border-w, 1px);
    padding: 4px 6px;
    text-align: var(--tbl-align, left);
    vertical-align: var(--tbl-valign, top);
    word-wrap: break-word; overflow-wrap: break-word;
    background: transparent;
    color: inherit;
  }
  /* borda externa vive no .tbl-frame — última col/linha sem interna à direita/baixo */
  .tbl tr > :last-child { border-right-width: 0; }
  .tbl tr:last-child > * { border-bottom-width: 0; }
  /* reforço de radius nos cantos (alguns engines clipam mal <table> no pai) */
  .tbl tr:first-child > :first-child { border-top-left-radius: var(--tbl-radius, 0); }
  .tbl tr:first-child > :last-child { border-top-right-radius: var(--tbl-radius, 0); }
  .tbl tr:last-child > :first-child { border-bottom-left-radius: var(--tbl-radius, 0); }
  .tbl tr:last-child > :last-child { border-bottom-right-radius: var(--tbl-radius, 0); }
  .tbl th, .tbl .tbl-head-cell {
    background: var(--tbl-header-bg, #F1F1F4);
    color: var(--tbl-header-text, #000);
    font-weight: 700;
  }
  .tbl td:empty::after, .tbl th:empty::after { content: "\\200b"; }
  .tbl.no-vlines th, .tbl.no-vlines td {
    border-left-color: transparent; border-right-color: transparent; }
  .tbl.alt-rows tr.alt > td:not(.tbl-head-cell) {
    background: color-mix(in srgb, var(--tbl-header-bg, #F1F1F4) 35%, var(--tbl-bg, #fff)); }
  .page.editing .tbl th:focus, .page.editing .tbl td:focus,
  .tm-table-host .tbl th:focus, .tm-table-host .tbl td:focus {
    outline: 2px solid var(--violet, #4E39FF); outline-offset: -2px; }
  /* seleção de range pra mesclar (Shift+clique) */
  .tbl-editing th.tbl-sel, .tbl-editing td.tbl-sel {
    outline: 2px solid color-mix(in srgb, #4E39FF 70%, transparent);
    outline-offset: -2px;
    background: color-mix(in srgb, #4E39FF 10%, var(--tbl-bg, #fff)) !important;
  }
  .tbl-editing th.tbl-sel.tbl-head-cell {
    background: color-mix(in srgb, #4E39FF 14%, var(--tbl-header-bg, #F1F1F4)) !important;
  }
  .tbl-merge-bar {
    display: flex; gap: .35rem; flex-wrap: wrap;
    margin-top: 6px; padding: 0; position: relative; z-index: 2;
  }
  .tbl-merge-bar[hidden] { display: none !important; }
  .tbl-merge-btn {
    border: 1px solid color-mix(in srgb, #4E39FF 35%, transparent);
    border-radius: 6px; padding: .28rem .55rem;
    background: #fff; color: #4E39FF;
    font-size: 11px; font-weight: 600; font-stretch: 90%;
    cursor: pointer;
  }
  .tbl-merge-btn:hover:not(:disabled) {
    background: color-mix(in srgb, #4E39FF 10%, #fff);
  }
  .tbl-merge-btn:disabled { opacity: .4; cursor: default; }

  /* chrome no wrap (não no frame) — top/left ajustados em JS pra alinhar à table */
  .tbl-row-handles, .tbl-col-handles, .tbl-resizers {
    position: absolute; pointer-events: none; z-index: 4; }
  .tbl-row-handles { left: -10px; width: 12px; }
  .tbl-col-handles { height: 12px; margin-top: -10px; }
  .tbl-resizers { z-index: 3; left: 0; top: 0; width: 0; height: 0; overflow: visible; }

  /* botões 12×12 redondos; dots 2px */
  .tbl-handle {
    position: absolute; width: 12px; height: 12px; padding: 0; border: 0;
    border-radius: 50%; background: #fff; cursor: grab;
    display: flex; align-items: center; justify-content: center; gap: 1.5px;
    pointer-events: auto; opacity: 0; transition: opacity .1s, background .1s, box-shadow .1s;
    box-shadow: 0 0 0 1px color-mix(in srgb, #000 10%, transparent);
  }
  .tbl-handle span {
    display: block; width: 2px; height: 2px; border-radius: 50%;
    background: #8a8a8a; flex: none; }
  .tbl-row-handle { left: 0; flex-direction: column; }
  .tbl-col-handle { top: 0; flex-direction: row; }
  .tbl-handle:hover, .tbl-handle:focus-visible, .tbl-handle.tbl-dragging {
    opacity: 1;
    background: #fff; box-shadow: 0 0 0 1px color-mix(in srgb, #4E39FF 45%, transparent); }
  .tbl-handle:hover span, .tbl-handle:focus-visible span,
  .tbl-handle.tbl-dragging span { background: #4E39FF; }
  .tbl-handle.tbl-dragging { cursor: grabbing; z-index: 6; }
  `;
  let hoverRules = '';
  for (let i = 0; i <= 64; i++) {
    hoverRules += `.tbl-editing[data-hover-row="${i}"] .tbl-row-handle[data-row="${i}"],`
      + `.tbl-editing[data-menu-row="${i}"] .tbl-row-handle[data-row="${i}"]{opacity:1}`;
    hoverRules += `.tbl-editing[data-hover-col="${i}"] .tbl-col-handle[data-col="${i}"],`
      + `.tbl-editing[data-menu-col="${i}"] .tbl-col-handle[data-col="${i}"]{opacity:1}`;
  }
  s.textContent += hoverRules + `
  .tbl-resizer {
    position: absolute; top: 0; width: 5px; cursor: col-resize;
    pointer-events: auto; z-index: 3; }
  .tbl-resizer::after {
    content: ''; position: absolute; inset: 0 1.5px; border-radius: 1px;
    background: transparent; transition: background .1s; }
  .tbl-resizer:hover::after,
  .tbl-resizing .tbl-resizer::after { background: #4E39FF; }
  .tbl-resizing, .tbl-resizing * { cursor: col-resize !important; user-select: none !important; }
  .tbl-dragging-row, .tbl-dragging-row * { cursor: grabbing !important; user-select: none !important; }
  .tbl-dragging-col, .tbl-dragging-col * { cursor: grabbing !important; user-select: none !important; }

  /* “+” redondo 12×12 — no miolo só perto da borda; na modal sempre visível */
  .tbl-edge-add {
    position: absolute; width: 14px; height: 14px; padding: 0; border: 0;
    border-radius: 50%; background: #fff; color: #4E39FF;
    font-size: 12px; font-weight: 600; line-height: 1;
    display: grid; place-items: center;
    cursor: pointer; opacity: 0; transition: opacity .1s, background .1s, box-shadow .1s;
    box-shadow: 0 0 0 1px color-mix(in srgb, #4E39FF 35%, transparent);
    pointer-events: auto; z-index: 4;
  }
  .tbl-editing.tbl-near-bot .tbl-add-row,
  .tbl-editing.tbl-near-right .tbl-add-col,
  .tbl-edge-add:hover { opacity: 1; }
  .tbl-edge-add:hover { background: color-mix(in srgb, #4E39FF 10%, #fff); }
  /* grid de tabelas: “+” de borda um pouco mais visíveis (hover ainda reforça) */
  .tblgrid-wrap .tbl-editing .tbl-edge-add { opacity: .55; }
  .tblgrid-wrap .tbl-editing.tbl-near-bot .tbl-add-row,
  .tblgrid-wrap .tbl-editing.tbl-near-right .tbl-add-col,
  .tblgrid-wrap .tbl-editing .tbl-edge-add:hover { opacity: 1; }
  /* “+” posicionados em JS sobre a borda da table (parent = wrap) */
  .tbl-add-row { transform: translate(-50%, -50%); }
  .tbl-add-col { transform: translate(-50%, -50%); }

  /* guia de drop no reordenamento */
  .tbl-drop-line {
    position: absolute; background: #4E39FF; pointer-events: none; z-index: 5;
    border-radius: 1px; }
  .tbl-drop-line[hidden] { display: none !important; }

  .tbl-menu {
    position: fixed; z-index: 72; min-width: 10rem; display: grid; gap: 1px;
    padding: .3rem; border: 1px solid var(--hair-strong, #3a3a42); border-radius: 8px;
    background: color-mix(in srgb, var(--lilac, #a8a0ff) 10%, var(--ground, #1c1c22));
    box-shadow: 0 12px 40px -12px #000;
  }
  .tbl-menu button {
    display: block; width: 100%; text-align: left; border: 0; border-radius: 5px;
    padding: .42rem .55rem; background: transparent; color: var(--ink, #eee);
    cursor: pointer; font-size: .8rem; font-stretch: 85%;
  }
  .tbl-menu button:hover { background: color-mix(in srgb, var(--violet, #4E39FF) 16%, transparent); }
  .tbl-menu button.danger { color: #CE5249; }
  .tbl-menu button.danger:hover { background: color-mix(in srgb, #CE5249 16%, transparent); }
  .tbl-menu-sw {
    display: flex; align-items: center; justify-content: space-between; gap: .5rem;
    padding: .35rem .55rem; font-size: .8rem; font-stretch: 85%; color: var(--ink, #eee);
  }
  /* switch compacto (mesmo visual da sidebar) */
  .tbl-menu .sw {
    position: relative; width: 34px; height: 20px; border-radius: 999px; border: 0;
    cursor: pointer; background: var(--hair-strong, #555); padding: 0; flex: none;
  }
  .tbl-menu .sw::after {
    content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
    border-radius: 50%; background: #fff; transition: transform .12s;
  }
  .tbl-menu .sw[aria-checked="true"] { background: var(--mint, #3DE8A0); }
  .tbl-menu .sw[aria-checked="true"]::after { transform: translateX(14px); }

  @media print {
    .tbl-handle, .tbl-resizer, .tbl-edge-add, .tbl-menu, .tbl-drop-line,
    .tbl-row-handles, .tbl-col-handles, .tbl-resizers { display: none !important; }
  }`;
  document.head.appendChild(s);
})();

function demo() {
  const eq = (a, b, msg) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('FALHOU ' + msg + ': ' + JSON.stringify(a));
  };
  eq(parseMatrix('a\tb\tc\n1\t2\t3'), [['a', 'b', 'c'], ['1', '2', '3']], 'TSV 2x3');
  eq(parseMatrix('a,b\n1,2\n3,4'), [['a', 'b'], ['1', '2'], ['3', '4']], 'CSV 3x2');
  eq(parseMatrix('"a,b",c\n1,2'), [['a,b', 'c'], ['1', '2']], 'CSV com vírgula entre aspas');
  eq(parseMatrix('x;y\n1;2'), [['x', 'y'], ['1', '2']], 'ponto-e-vírgula');
  eq(parseMatrix('a\tb\tc\n1\t2'), [['a', 'b', 'c'], ['1', '2', '']], 'retangulariza linha curta');
  const b = { rows: [['A', 'B'], ['1', '2']] };
  eq(colWidthsOf(b).map((x) => +x.toFixed(2)), [0.5, 0.5], 'widths default');
  addCol(b, 1);
  eq(b.rows[0].length, 3, 'addCol');
  eq(colWidthsOf(b).length, 3, 'widths after addCol');
  delCol(b, 1);
  eq(b.rows[0].length, 2, 'delCol');
  const br = { rows: [['H1', 'H2'], ['a', 'b'], ['c', 'd'], ['e', 'f']] };
  moveRow(br, 1, 3);
  eq(br.rows.map((r) => r[0]), ['H1', 'c', 'e', 'a'], 'moveRow');
  const bc = { rows: [['A', 'B', 'C'], ['1', '2', '3']], colWidths: [0.2, 0.3, 0.5] };
  moveCol(bc, 0, 2);
  eq(bc.rows[0], ['B', 'C', 'A'], 'moveCol header');
  eq(bc.rows[1], ['2', '3', '1'], 'moveCol body');
  console.log('bloco-tabela: todos os asserts passaram');
}
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('bloco-tabela.js')) demo();
