/* Bloco Grid de Tabelas — 1 a 4 colunas; cada célula é uma tabela editável em modal.
 *
 *   buildTableGridEl(b, editing, ctx, colW) → DOM
 *     b.items[]  — por tabela: { rows, colWidths?, merges?, bg?, headerColor?,
 *                  headerTextColor?, color? }
 *     Estilo COMPARTILHADO (igual em todas): fontSize, lineHeight, borderWidth,
 *       borderOuter, borderInner, radius  → no bloco grid, não no item.
 *     b.equal    — 'width' (default) | 'height'
 *     b.gap      — px entre colunas (default TABLE_GRID_GAP)
 *     ctx        — { commit, rerender, removeBlock, openTableEditor }
 *
 * Fora da modal: gap + equal + estilo compartilhado. Edição de conteúdo → modal.
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
  // promove estilos compartilhados que ainda estejam só no 1º item (docs antigos)
  for (const k of TABLE_GRID_SHARED_KEYS) {
    if (b[k] == null && b.items[0] && b.items[0][k] != null) {
      b[k] = b.items[0][k];
    }
  }
  b.items = b.items.slice(0, TABLE_GRID_MAX).map((raw) => {
    const it = raw && typeof raw === 'object' ? { ...raw } : seedTableItem();
    delete it.id;
    delete it.type;
    // tira do item o que agora é compartilhado
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
 * @param {{ commit?:Function, rerender?:Function, removeBlock?:Function, openTableEditor?:(blockId:string, itemIndex:number)=>void }} ctx
 * @param {number} [colW]
 */
export function buildTableGridEl(b, editing, ctx = {}, colW = 499) {
  ensureTableGrid(b);
  const equal = tableGridEqualModeOf(b);
  const gap = tableGridGapOf(b);
  const n = b.items.length;
  const colWidths = layoutTableGridCols(n, colW, gap);

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
    cell.className = 'tblgrid-cell';
    cell.dataset.item = String(i);
    cell.style.minWidth = '0';
    if (equal === 'height') cell.style.display = 'flex';

    // estilo compartilhado do grid + cores próprias do item
    const resolved = resolveGridTableItem(b, it);
    const tbl = buildTableEl(resolved, false, {}, colWidths[i]);
    tbl.removeAttribute('data-id');
    tbl.classList.add('tblgrid-preview');
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
      cell.classList.add('tblgrid-cell-edit');
      const overlay = document.createElement('button');
      overlay.type = 'button';
      overlay.className = 'tblgrid-edit';
      overlay.title = 'Editar tabela';
      overlay.setAttribute('aria-label', `Editar tabela ${i + 1}`);
      overlay.innerHTML = '<span class="tblgrid-edit-ico" aria-hidden="true">'
        + '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z"/>'
        + '</svg></span><span>Editar</span>';
      overlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.openTableEditor?.(b.id, i);
      });
      cell.appendChild(overlay);
      cell.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('.tblgrid-edit')) return;
        e.preventDefault();
        e.stopPropagation();
        ctx.openTableEditor?.(b.id, i);
      });
    }

    grid.appendChild(cell);
  });

  wrap.appendChild(grid);
  return wrap;
}

// CSS do grid (injetado uma vez)
(function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('tblgrid-css')) return;
  const s = document.createElement('style');
  s.id = 'tblgrid-css';
  s.textContent = `
  .tblgrid-wrap { position: relative; z-index: 2; overflow: visible; display: flow-root; }
  .tblgrid { width: 100%; min-width: 0; }
  .tblgrid-cell { position: relative; min-width: 0; }
  .tblgrid-cell .tbl-wrap { width: 100% !important; }
  .tblgrid-preview { pointer-events: none; }
  .tblgrid-cell-edit { cursor: pointer; }
  .tblgrid-cell-edit:hover .tblgrid-preview .tbl-frame {
    outline: 1.5px solid color-mix(in srgb, #4E39FF 45%, transparent);
    outline-offset: 1px;
  }
  .tblgrid-edit {
    position: absolute; top: 6px; right: 6px; z-index: 3;
    display: inline-flex; align-items: center; gap: .3rem;
    padding: .28rem .5rem; border: 0; border-radius: 6px;
    background: color-mix(in srgb, #4E39FF 92%, #000);
    color: #fff; font-size: 11px; font-weight: 600; font-stretch: 90%;
    cursor: pointer; opacity: 0; pointer-events: none;
    transition: opacity .12s; box-shadow: 0 4px 14px -4px rgba(0,0,0,.35);
  }
  .tblgrid-cell-edit:hover .tblgrid-edit,
  .tblgrid-cell-edit:focus-within .tblgrid-edit { opacity: 1; pointer-events: auto; }
  .tblgrid-edit:hover { background: #4E39FF; }
  .tblgrid-edit-ico { display: grid; place-items: center; }
  .tblgrid-edit-ico svg { display: block; }
  @media print {
    .tblgrid-edit { display: none !important; }
  }
  `;
  document.head.appendChild(s);
})();
