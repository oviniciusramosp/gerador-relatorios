/* Bloco Grid de Tabelas — 1 a 4 colunas.
 *
 *   buildTableGridEl(b, editing, ctx, colW) → DOM
 *     b.items[]  — por tabela: { rows, colWidths?, merges?, bg?, headerColor?,
 *                  headerTextColor?, color? }
 *     Estilo COMPARTILHADO (igual em todas): fontSize, lineHeight, borderWidth,
 *       borderOuter, borderInner, radius  → no bloco grid, não no item.
 *     b.equal / b.gap
 *     ctx        — { commit, rerender, removeBlock, selectGridItem, activeItemIndex }
 *
 * Conteúdo edita-se nas células (editing). Clique numa tabela → selectGridItem
 * (painel flutuante troca o segment Grid / Tabela N).
 */

import {
  ensureTable, ensureSharedTableStyle, buildTableEl, resolveGridTableItem,
  TABLE_GRID_SHARED_KEYS,
} from './bloco-tabela.js';

export const TABLE_GRID_MAX = 4;
export const TABLE_GRID_GAP = 8;
export const TABLE_GRID_GAP_MAX = 48;

/** Dados de uma tabela no grid (sem id/type — o pai é o bloco). */
export function seedTableItem() {
  return {
    rows: [['Coluna 1', 'Coluna 2'], ['', '']],
  };
}

/** Garante 1..MAX items e flags válidas. Mutável; idempotente. */
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
  b.items = b.items.slice(0, TABLE_GRID_MAX).map((raw) => {
    const it = raw && typeof raw === 'object' ? { ...raw } : seedTableItem();
    delete it.id;
    delete it.type;
    for (const k of TABLE_GRID_SHARED_KEYS) delete it[k];
    ensureTable(it);
    return it;
  });
  if (!b.items.length) b.items = [seedTableItem()];
  if (b.equal !== 'height') delete b.equal;
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
  const gap = tableGridGapOf(b);
  const n = b.items.length;
  const colWidths = layoutTableGridCols(n, colW, gap);
  const activeItem = ctx.activeItemIndex != null ? +ctx.activeItemIndex : -1;

  const wrap = document.createElement('div');
  wrap.className = 'tblgrid-wrap b';
  wrap.dataset.id = b.id;
  wrap.dataset.equal = equal;
  wrap.style.width = colW + 'px';

  const grid = document.createElement('div');
  grid.className = 'tblgrid';
  grid.dataset.equal = equal;
  grid.style.display = 'grid';
  grid.style.columnGap = gap + 'px';
  grid.style.rowGap = '0';
  grid.style.alignItems = equal === 'height' ? 'stretch' : 'start';
  grid.style.gridTemplateColumns = colWidths.map((w) => Math.max(1, w) + 'px').join(' ');

  b.items.forEach((it, i) => {
    const cell = document.createElement('div');
    cell.className = 'tblgrid-cell' + (activeItem === i ? ' is-active' : '');
    cell.dataset.item = String(i);
    cell.style.minWidth = '0';
    if (equal === 'height') cell.style.display = 'flex';

    // estilo compartilhado + cores do item; mesma ref de rows/merges do item
    const resolved = resolveGridTableItem(b, it);
    resolved.rows = it.rows;
    if (it.colWidths) resolved.colWidths = it.colWidths;
    if (it.merges) resolved.merges = it.merges;

    const syncStructure = () => {
      if (resolved.merges && resolved.merges.length) it.merges = resolved.merges;
      else delete it.merges;
      if (resolved.colWidths) it.colWidths = resolved.colWidths;
      else delete it.colWidths;
    };

    const itemCtx = {
      commit: () => {
        syncStructure();
        ctx.commit?.();
      },
      rerender: () => {
        syncStructure();
        ctx.rerender?.();
      },
    };

    const tbl = buildTableEl(resolved, editing, itemCtx, colWidths[i]);
    // id sintético p/ focusCell / Tab na tabela do grid
    tbl.dataset.id = `__tg_${b.id}_${i}`;
    tbl.dataset.gridId = b.id;
    tbl.dataset.item = String(i);
    tbl.classList.add('tblgrid-table');
    tbl.style.width = '100%';
    if (equal === 'height') {
      tbl.style.flex = '1 1 auto';
      tbl.style.height = '100%';
      const frame = tbl.querySelector('.tbl-frame');
      if (frame) {
        frame.style.height = '100%';
        frame.style.display = 'flex';
        frame.style.flexDirection = 'column';
      }
      const table = tbl.querySelector('table.tbl');
      if (table) table.style.height = '100%';
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
