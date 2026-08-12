/* Bloco Grid de Tabelas — 1 a 4 colunas.
 *
 *   buildTableGridEl(b, editing, ctx, colW) → DOM
 *     b.items[]  — por tabela: { rows, colWidths?, merges?, bg?, headerColor?,
 *                  headerTextColor?, color? }
 *     Estilo COMPARTILHADO (igual em todas): fontSize, lineHeight,
 *       borderWidth/Outer/Inner, borderOuter, borderInner, radius → no bloco grid.
 *     b.equal / b.gap
 *     ctx        — { commit, rerender, removeBlock, selectGridItem, activeItemIndex }
 *
 * Conteúdo edita-se nas células (editing). Clique numa tabela → selectGridItem
 * (painel flutuante troca o segment Grid / Tabela N).
 */

import {
  ensureTable, ensureSharedTableStyle, buildTableEl, resolveGridTableItem,
  stripSharedFromTableItem, TABLE_GRID_SHARED_KEYS,
} from './bloco-tabela.js';

export const TABLE_GRID_MAX = 4;
export const TABLE_GRID_GAP = 8;
export const TABLE_GRID_GAP_MAX = 48;

/**
 * Estilos por tabela no grid (cores, alt, alinhamento de tabela).
 * Não inclui rows/merges/colWidths (estrutura) nem cellAlign (por célula).
 * Fonte/bordas/raio vivem em TABLE_GRID_SHARED_KEYS no bloco (já comuns a todas).
 */
export const TABLE_ITEM_STYLE_KEYS = [
  'bg', 'headerColor', 'headerTextColor', 'color',
  'altColor', 'altRows',
  'align', 'valign',
  'hideVLines',
];

/**
 * Copia estilos visuais da tabela `fromIndex` para as demais do grid.
 * - Por item: cores, linhas alternadas, alinhamento da tabela
 * - Shared (fonte, bordas, raio): já no bloco grid — reafirma ensureSharedTableStyle
 * @returns {number} quantas tabelas destino receberam estilos (0 = nada a fazer)
 */
export function applyTableStylesToGrid(grid, fromIndex) {
  ensureTableGrid(grid);
  const srcIdx = fromIndex | 0;
  const src = grid.items[srcIdx];
  if (!src || grid.items.length < 2) return 0;
  let n = 0;
  for (let i = 0; i < grid.items.length; i++) {
    if (i === srcIdx) continue;
    const dest = grid.items[i];
    for (const k of TABLE_ITEM_STYLE_KEYS) {
      const v = src[k];
      if (v === undefined || v === null) {
        delete dest[k];
        continue;
      }
      // false = default para flags (não polui o JSON)
      if (v === false && (k === 'altRows' || k === 'hideVLines')) {
        delete dest[k];
        continue;
      }
      dest[k] = v;
    }
    ensureTable(dest);
    n++;
  }
  ensureSharedTableStyle(grid);
  return n;
}

/** Dados de uma tabela no grid (sem id/type — o pai é o bloco). */
export function seedTableItem() {
  return {
    rows: [['Coluna 1', 'Coluna 2'], ['', '']],
  };
}

/**
 * Garante 1..MAX items e flags válidas. Mutável; idempotente.
 *
 * Importante: reutiliza a MESMA referência de cada item (não `{...raw}`).
 * Cópia rasa quebrava merge no grid: handlers do canvas fechavam sobre o item
 * antigo; rows (array) era compartilhado → conteúdo sumia; merges (próprio)
 * ficava no órfão → rebuild sem colspan, duas células ainda editáveis.
 */
export function ensureTableGrid(b) {
  if (!b || typeof b !== 'object') return b;
  if (!Array.isArray(b.items) || !b.items.length) {
    b.items = [seedTableItem(), seedTableItem()];
  }
  for (const k of TABLE_GRID_SHARED_KEYS) {
    if (b[k] == null && b.items[0] && b.items[0][k] != null) {
      b[k] = b.items[0][k];
    }
  }
  // trim sem trocar refs dos que ficam
  if (b.items.length > TABLE_GRID_MAX) b.items.length = TABLE_GRID_MAX;
  for (let i = 0; i < b.items.length; i++) {
    let it = b.items[i];
    if (!it || typeof it !== 'object') {
      it = seedTableItem();
      b.items[i] = it;
    }
    delete it.id;
    delete it.type;
    for (const k of TABLE_GRID_SHARED_KEYS) delete it[k];
    ensureTable(it);
  }
  if (!b.items.length) b.items = [seedTableItem()];
  if (b.equal !== 'height') delete b.equal;
  if (b.equalRows !== true) delete b.equalRows;
  if (b.gap != null) {
    const g = clampTableGridGap(b.gap);
    if (g === TABLE_GRID_GAP) delete b.gap;
    else b.gap = g;
  }
  ensureSharedTableStyle(b);
  return b;
}

export function tableGridEqualModeOf(b) {
  return b && b.equal === 'height' ? 'height' : 'width';
}

/** Rows com altura igualada entre tabelas do grid (última row da menor preenche). */
export function tableGridEqualRowsOf(b) {
  return !!(b && b.equalRows === true);
}

/**
 * Calcula alturas finais por tabela a partir das alturas naturais.
 * @param {number[][]} natural — natural[t][r] = px da row r na tabela t
 * @returns {number[][]} mesma forma, com rows alinhadas e última row da menor preenchendo
 */
export function computeEqualRowHeights(natural) {
  if (!Array.isArray(natural) || !natural.length) return [];
  const lists = natural.map((rows) =>
    (Array.isArray(rows) ? rows : []).map((h) => Math.max(0, +h || 0)));
  const maxRows = Math.max(0, ...lists.map((r) => r.length));
  if (maxRows < 1) return lists.map(() => []);

  const target = Array(maxRows).fill(0);
  for (let i = 0; i < maxRows; i++) {
    for (const rows of lists) {
      if (i < rows.length) target[i] = Math.max(target[i], rows[i]);
    }
  }
  const total = target.reduce((a, h) => a + h, 0);

  return lists.map((rows) => {
    const n = rows.length;
    if (!n) return [];
    const out = [];
    let used = 0;
    for (let i = 0; i < n - 1; i++) {
      out.push(target[i]);
      used += target[i];
    }
    // última row: pelo menos o target natural; se a tabela é mais curta, preenche o resto
    out.push(Math.max(target[n - 1] || 0, total - used));
    return out;
  });
}

/**
 * Aplica equalRows no DOM: mede rows, equaliza, última da menor preenche.
 * @param {HTMLElement} gridEl — .tblgrid
 */
export function layoutEqualRowHeights(gridEl) {
  if (!gridEl) return;
  const tables = [...gridEl.querySelectorAll('.tblgrid-cell table.tbl')];
  if (tables.length < 2) return;

  // reset para medir natural
  tables.forEach((t) => {
    [...t.rows].forEach((tr) => {
      tr.style.height = '';
      tr.style.minHeight = '';
    });
    t.style.height = '';
  });

  const natural = tables.map((t) =>
    [...t.rows].map((tr) => tr.getBoundingClientRect().height));
  const assigned = computeEqualRowHeights(natural);

  tables.forEach((t, ti) => {
    const heights = assigned[ti] || [];
    [...t.rows].forEach((tr, ri) => {
      const h = heights[ri];
      if (h != null && h > 0) {
        tr.style.height = h + 'px';
        tr.style.minHeight = h + 'px';
      }
    });
    const sum = heights.reduce((a, h) => a + h, 0);
    if (sum > 0) t.style.height = sum + 'px';
  });
}

export function clampTableGridGap(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return TABLE_GRID_GAP;
  return Math.max(0, Math.min(TABLE_GRID_GAP_MAX, v));
}

export function tableGridGapOf(b) {
  return b && b.gap != null ? clampTableGridGap(b.gap) : TABLE_GRID_GAP;
}

/** Define o número de colunas (1..MAX). */
export function setTableGridCols(b, n) {
  ensureTableGrid(b);
  const target = Math.max(1, Math.min(TABLE_GRID_MAX, n | 0));
  while (b.items.length < target) b.items.push(seedTableItem());
  while (b.items.length > target) b.items.pop();
  return b.items.length;
}

/**
 * Larguras das colunas do grid.
 * @returns {number[]} largura px por coluna
 */
export function layoutTableGridCols(n, totalW, gap = TABLE_GRID_GAP) {
  const count = Math.max(1, Math.min(TABLE_GRID_MAX, n | 0));
  const g = clampTableGridGap(gap);
  const gaps = Math.max(0, count - 1) * g;
  const avail = Math.max(1, totalW - gaps);
  const colW = avail / count;
  return Array.from({ length: count }, () => colW);
}

/**
 * Monta o DOM do grid de tabelas.
 * @param {object} b
 * @param {boolean} editing
 * @param {{ commit?:Function, rerender?:Function, removeBlock?:Function, selectGridItem?:(blockId:string, itemIndex:number)=>void, activeItemIndex?:number }} ctx
 * @param {number} [colW]
 */
export function buildTableGridEl(b, editing, ctx = {}, colW = 499) {
  ensureTableGrid(b);
  const equal = tableGridEqualModeOf(b);
  const equalRows = tableGridEqualRowsOf(b);
  const gap = tableGridGapOf(b);
  const n = b.items.length;
  const colWidths = layoutTableGridCols(n, colW, gap);
  const activeItem = ctx.activeItemIndex != null ? +ctx.activeItemIndex : -1;

  const wrap = document.createElement('div');
  wrap.className = 'tblgrid-wrap b';
  wrap.dataset.id = b.id;
  wrap.dataset.equal = equal;
  wrap.dataset.equalRows = equalRows ? '1' : '0';
  wrap.style.width = colW + 'px';

  const grid = document.createElement('div');
  grid.className = 'tblgrid';
  grid.dataset.equal = equal;
  grid.dataset.equalRows = equalRows ? '1' : '0';
  grid.style.display = 'grid';
  grid.style.columnGap = gap + 'px';
  grid.style.rowGap = '0';
  // equalRows força stretch para as tabelas alinharem no topo com mesma altura total
  grid.style.alignItems = (equal === 'height' || equalRows) ? 'stretch' : 'start';
  grid.style.gridTemplateColumns = colWidths.map((w) => Math.max(1, w) + 'px').join(' ');

  b.items.forEach((it, i) => {
    const cell = document.createElement('div');
    cell.className = 'tblgrid-cell' + (activeItem === i ? ' is-active' : '');
    cell.dataset.item = String(i);
    cell.style.minWidth = '0';
    if (equal === 'height' || equalRows) cell.style.display = 'flex';

    // item REAL com estilos shared copiados (temporário). merges/rows gravam no item.
    const resolved = resolveGridTableItem(b, it);

    const itemCtx = {
      commit: () => {
        stripSharedFromTableItem(it);
        ensureTable(it);
        ctx.commit?.();
      },
      rerender: () => {
        stripSharedFromTableItem(it);
        ensureTable(it);
        ctx.rerender?.();
      },
    };

    const tbl = buildTableEl(resolved, editing, itemCtx, colWidths[i]);
    // tira shared do item em memória (já aplicados no DOM via build); merges ficam
    stripSharedFromTableItem(it);
    // id sintético p/ focusCell / Tab na tabela do grid
    tbl.dataset.id = `__tg_${b.id}_${i}`;
    tbl.dataset.gridId = b.id;
    tbl.dataset.item = String(i);
    tbl.classList.add('tblgrid-table');
    tbl.style.width = '100%';
    if (equal === 'height' || equalRows) {
      // height 100% sem display:flex no frame — flex no pai de <table>
      // quebra colSpan/rowSpan em alguns engines (células “não mesclam” visualmente).
      tbl.style.flex = '1 1 auto';
      tbl.style.height = '100%';
      tbl.style.minHeight = '0';
      const frame = tbl.querySelector('.tbl-frame');
      if (frame) {
        frame.style.height = '100%';
        frame.style.boxSizing = 'border-box';
      }
      const table = tbl.querySelector('table.tbl');
      if (table) {
        if (equal === 'height' && !equalRows) {
          table.style.height = '100%';
        }
        table.style.boxSizing = 'border-box';
      }
    }
    cell.appendChild(tbl);

    if (editing) {
      // clique / foco numa célula → painel seleciona "Tabela N"
      // NÃO interceptar chrome (+ linha/coluna, alças, merge) — senão o click some no rebuild
      const pick = () => {
        clearSiblingTableCellFocus(wrap, i);
        ctx.selectGridItem?.(b.id, i);
      };
      cell.addEventListener('mousedown', (e) => {
        if (e.target.closest?.('.tbl-edge-add, .tbl-handle, .tbl-resizer, .tbl-merge-bar, .tbl-merge-btn, .tbl-menu')) {
          return;
        }
        pick();
      }, true);
      cell.addEventListener('focusin', (e) => {
        if (e.target.closest?.('.tbl-edge-add, .tbl-handle')) return;
        pick();
      });
    }

    grid.appendChild(cell);
  });

  wrap.appendChild(grid);

  // equaliza altura das rows entre tabelas (após layout)
  if (equalRows && n > 1) {
    const run = () => layoutEqualRowHeights(grid);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(run));
    } else {
      run();
    }
  }

  return wrap;
}

/**
 * Tira o foco visual de células nas OUTRAS tabelas do mesmo grid.
 * Sem isso, contenteditable em T1 mantém outline roxo ao clicar em T2.
 */
function clearSiblingTableCellFocus(gridWrap, keepItemIndex) {
  if (!gridWrap) return;
  gridWrap.querySelectorAll('.tblgrid-cell').forEach((cell) => {
    if (+cell.dataset.item === keepItemIndex) return;
    // limpa seleção de merge
    cell.querySelectorAll('th.tbl-sel, td.tbl-sel').forEach((el) => el.classList.remove('tbl-sel'));
    // blur se o activeElement está nesta tabela
    const ae = document.activeElement;
    if (ae && cell.contains(ae) && typeof ae.blur === 'function') {
      ae.blur();
    }
    // reforço: remove :focus residual se o browser mantiver
    cell.querySelectorAll('th:focus, td:focus').forEach((el) => {
      if (typeof el.blur === 'function') el.blur();
    });
  });
}

// CSS do grid (injetado uma vez)
(function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('tblgrid-css')) return;
  const s = document.createElement('style');
  s.id = 'tblgrid-css';
  s.textContent = `
  .tblgrid-wrap { position: relative; z-index: 2; overflow: visible; display: flow-root; }
  .tblgrid { width: 100%; min-width: 0; }
  .tblgrid-cell { position: relative; min-width: 0; overflow: visible; }
  /* ativa por cima das vizinhas: “+”/alças na borda não ficam sob a célula ao lado */
  .tblgrid-cell.is-active { z-index: 4; }
  .tblgrid-cell .tbl-wrap { width: 100% !important; overflow: visible; }
  .page.editing .tblgrid-cell.is-active .tbl-frame {
    outline: 1.5px solid color-mix(in srgb, #4E39FF 55%, transparent);
    outline-offset: 2px;
  }
  /* só a tabela ativa mostra outline de foco em células (evita T1+T2 “ligadas”) */
  .page.editing .tblgrid-cell:not(.is-active) .tbl th:focus,
  .page.editing .tblgrid-cell:not(.is-active) .tbl td:focus {
    outline: none;
  }
  /* tabela selecionada no grid: “+” de linha/coluna sempre visíveis */
  .tblgrid-cell.is-active .tbl-editing .tbl-edge-add { opacity: 1; }
  `;
  document.head.appendChild(s);
})();
