/**
 * Regressões do bloco Grid de Tabelas (diagramador).
 *
 * Sem este teste quebraria calado:
 * - ensureTableGrid aceitando >4 itens ou 0 itens
 * - default de equal/gap poluindo o JSON
 * - setTableGridCols fora de 1..4
 * - gap custom não entrando no layout de colunas
 * - layout com colunas de larguras diferentes em equal=width
 * - ensureTable limpando border/radius default
 * - “+”/reordenar no grid mutando clone desligado do item (rows some no rerender)
 */
import assert from 'node:assert/strict';
import {
  ensureTableGrid, tableGridEqualModeOf, tableGridGapOf, clampTableGridGap,
  setTableGridCols, layoutTableGridCols, seedTableItem,
  TABLE_GRID_MAX, TABLE_GRID_GAP,
} from './bloco-table-grid.js';
import {
  ensureTable, resolveGridTableItem, mergeCells, unmergeCells, isCellCovered,
  mergeOriginAt, ensureMerges, addTableRow, addTableCol,
  setTableHeaderRow, setTableHeaderCol, unwrapTableData,
  resolveMergeRange, mergeSelectionOrNeighbor, getMerges,
  borderOuterOf, borderInnerOf, tableBgOf, tableRadiusOf, tableBorderWidthOf,
  tableAlignOf, tableValignOf, tableFontSizeOf, tableLineHeightOf,
  tableHeaderTextOf, tableTextColorOf,
  clampTableFontSize, clampTableLineHeight, clampTableBorderWidth,
  normalizeTableAlign, normalizeTableValign,
  DEFAULT_BORDER_OUTER, DEFAULT_BORDER_INNER, DEFAULT_TABLE_BG, DEFAULT_TABLE_RADIUS,
  DEFAULT_BORDER_WIDTH, DEFAULT_TABLE_FONT_SIZE, DEFAULT_TABLE_LINE_HEIGHT,
  DEFAULT_TABLE_ALIGN, DEFAULT_TABLE_VALIGN, DEFAULT_HEADER_TEXT, DEFAULT_TEXT_COLOR,
  clampTableRadius,
} from './bloco-tabela.js';

// ── ensure: 2 slots default, equal width ────────────────────────────────────
{
  const b = { id: 'tg1', type: 'table-grid' };
  ensureTableGrid(b);
  assert.equal(b.items.length, 2);
  assert.equal(tableGridEqualModeOf(b), 'width');
  assert.equal(b.equal, undefined, 'default width não polui o JSON');
  assert.equal(tableGridGapOf(b), TABLE_GRID_GAP);
  assert.ok(b.items.every((it) => Array.isArray(it.rows) && it.rows.length >= 2));
}

{
  const b = { items: Array.from({ length: 8 }, () => seedTableItem()), equal: 'height' };
  ensureTableGrid(b);
  assert.equal(b.items.length, TABLE_GRID_MAX);
  assert.equal(tableGridEqualModeOf(b), 'height');
}

// ── setTableGridCols 1..4 ───────────────────────────────────────────────────
{
  const b = { type: 'table-grid' };
  ensureTableGrid(b);
  assert.equal(setTableGridCols(b, 4), 4);
  assert.equal(b.items.length, 4);
  assert.equal(setTableGridCols(b, 1), 1);
  assert.equal(b.items.length, 1);
  assert.equal(setTableGridCols(b, 99), TABLE_GRID_MAX);
  assert.equal(setTableGridCols(b, 0), 1);
}

// ── gap clamp + default ─────────────────────────────────────────────────────
{
  assert.equal(clampTableGridGap(-3), 0);
  assert.equal(clampTableGridGap(100), 48);
  assert.equal(clampTableGridGap(12), 12);
  const b = { gap: 8 };
  ensureTableGrid(b);
  assert.equal(b.gap, undefined, 'gap default some do JSON');
  b.gap = 16;
  ensureTableGrid(b);
  assert.equal(tableGridGapOf(b), 16);
}

// ── layout colunas iguais ───────────────────────────────────────────────────
{
  const totalW = 499;
  const gap = TABLE_GRID_GAP;
  const cols = layoutTableGridCols(3, totalW, gap);
  assert.equal(cols.length, 3);
  const expected = (totalW - 2 * gap) / 3;
  for (const w of cols) {
    assert.ok(Math.abs(w - expected) < 1e-6);
  }
  const sum = cols.reduce((a, w) => a + w, 0);
  assert.ok(Math.abs(sum - (totalW - 2 * gap)) < 1e-6);
}

// gap custom
{
  const cols = layoutTableGridCols(2, 400, 20);
  assert.ok(Math.abs(cols[0] - 190) < 1e-6);
  assert.ok(Math.abs(cols[1] - 190) < 1e-6);
}

// ── ensureTable: defaults de borda/radius ───────────────────────────────────
{
  const t = {
    rows: [['A'], ['1']],
    borderOuter: DEFAULT_BORDER_OUTER,
    borderInner: DEFAULT_BORDER_INNER,
    bg: DEFAULT_TABLE_BG,
    borderWidth: 1,
    radius: 0,
  };
  ensureTable(t);
  assert.equal(t.borderOuter, undefined);
  assert.equal(t.borderInner, undefined);
  assert.equal(t.bg, undefined);
  assert.equal(t.borderWidth, undefined);
  assert.equal(t.radius, undefined);
  assert.equal(borderOuterOf(t), DEFAULT_BORDER_OUTER);
  assert.equal(borderInnerOf(t), DEFAULT_BORDER_INNER);
  assert.equal(tableBgOf(t), DEFAULT_TABLE_BG);
  assert.equal(tableBorderWidthOf(t), DEFAULT_BORDER_WIDTH);
  assert.equal(tableRadiusOf(t), DEFAULT_TABLE_RADIUS);
}

{
  const t = {
    rows: [['A'], ['1']],
    borderOuter: '#ff0000',
    borderInner: '#00ff00',
    bg: '#EEF2FF',
    borderWidth: 2,
    radius: 8,
  };
  ensureTable(t);
  assert.equal(t.borderOuter, '#ff0000');
  assert.equal(t.borderInner, '#00ff00');
  assert.equal(t.bg, '#EEF2FF');
  assert.equal(t.borderWidth, 2);
  assert.equal(t.radius, 8);
  assert.equal(clampTableRadius(100), 24);
  assert.equal(clampTableRadius(-1), 0);
  assert.equal(clampTableBorderWidth(0.25), 0.5);
  assert.equal(clampTableBorderWidth(9), 4);
}

// item do grid preserva rows; estilo shared sobe pro bloco
{
  const b = {
    type: 'table-grid',
    items: [{ rows: [['X', 'Y'], ['1', '2']], borderOuter: '#111111', bg: '#FAFAFA' }],
  };
  ensureTableGrid(b);
  assert.equal(b.items.length, 1);
  assert.deepEqual(b.items[0].rows[0], ['X', 'Y']);
  assert.equal(b.items[0].borderOuter, undefined, 'shared sai do item');
  assert.equal(b.borderOuter, '#111111', 'shared sobe pro grid');
  assert.equal(b.items[0].bg, '#FAFAFA', 'cor de fundo fica no item');
}

// ── tipografia e alinhamento: defaults não poluem; custom persiste ──────────
{
  const t = {
    rows: [['A'], ['1']],
    align: 'left',
    valign: 'top',
    fontSize: 10,
    lineHeight: 1.35,
  };
  ensureTable(t);
  assert.equal(t.align, undefined);
  assert.equal(t.valign, undefined);
  assert.equal(t.fontSize, undefined);
  assert.equal(t.lineHeight, undefined);
  assert.equal(tableAlignOf(t), DEFAULT_TABLE_ALIGN);
  assert.equal(tableValignOf(t), DEFAULT_TABLE_VALIGN);
  assert.equal(tableFontSizeOf(t), DEFAULT_TABLE_FONT_SIZE);
  assert.equal(tableLineHeightOf(t), DEFAULT_TABLE_LINE_HEIGHT);
}

{
  const t = {
    rows: [['A'], ['1']],
    align: 'center',
    valign: 'middle',
    fontSize: 14,
    lineHeight: 1.5,
    headerTextColor: '#112233',
    color: '#445566',
  };
  ensureTable(t);
  assert.equal(t.align, 'center');
  assert.equal(t.valign, 'middle');
  assert.equal(t.fontSize, 14);
  assert.equal(t.lineHeight, 1.5);
  assert.equal(t.headerTextColor, '#112233');
  assert.equal(t.color, '#445566');
  assert.equal(tableHeaderTextOf(t), '#112233');
  assert.equal(tableTextColorOf(t), '#445566');
  assert.equal(normalizeTableAlign('bogus'), 'left');
  assert.equal(normalizeTableValign('bogus'), 'top');
  assert.equal(clampTableFontSize(100), 24);
  assert.equal(clampTableFontSize(2), 6);
  assert.equal(clampTableLineHeight(0.5), 1);
  assert.equal(clampTableLineHeight(9), 2.5);
  assert.equal(tableHeaderTextOf({}), DEFAULT_HEADER_TEXT);
  assert.equal(tableTextColorOf({}), DEFAULT_TEXT_COLOR);
}

// ── grid: estilo compartilhado no bloco, não no item ────────────────────────
{
  const b = {
    type: 'table-grid',
    fontSize: 14,
    borderOuter: '#111111',
    items: [
      { rows: [['A', 'B'], ['1', '2']], fontSize: 20, bg: '#EEEEEE', headerColor: '#DDDDDD' },
      { rows: [['X', 'Y'], ['3', '4']], borderOuter: '#999999' },
    ],
  };
  ensureTableGrid(b);
  // shared tirado dos items
  assert.equal(b.items[0].fontSize, undefined);
  assert.equal(b.items[1].borderOuter, undefined);
  assert.equal(b.fontSize, 14);
  assert.equal(b.borderOuter, '#111111');
  // per-item cores permanecem
  assert.equal(b.items[0].bg, '#EEEEEE');
  assert.equal(b.items[0].headerColor, '#DDDDDD');
  const resolved = resolveGridTableItem(b, b.items[0]);
  assert.equal(resolved.fontSize, 14);
  assert.equal(resolved.borderOuter, '#111111');
  assert.equal(resolved.bg, '#EEEEEE');
}

// ── merge / unmerge ─────────────────────────────────────────────────────────
{
  const t = {
    rows: [
      ['A', 'B', 'C'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ],
  };
  assert.equal(mergeCells(t, 0, 0, 0, 1), true);
  assert.ok(t.merges?.length === 1);
  assert.deepEqual(t.merges[0], { r: 0, c: 0, cs: 2, rs: 1 });
  assert.equal(isCellCovered(t, 0, 1), true);
  assert.equal(isCellCovered(t, 0, 0), false);
  assert.equal(mergeOriginAt(t, 0, 0)?.cs, 2);
  assert.equal(t.rows[0][1], '', 'célula coberta limpa');
  assert.equal(unmergeCells(t, 0, 0), true);
  assert.equal(t.merges, undefined);
}

{
  const t = {
    rows: [['A', 'B'], ['1', '2']],
    merges: [{ r: 0, c: 0, cs: 2, rs: 2 }],
  };
  ensureMerges(t);
  assert.equal(t.merges.length, 1);
  assert.equal(isCellCovered(t, 1, 1), true);
  // merge 1×1 some
  t.merges = [{ r: 0, c: 0, cs: 1, rs: 1 }];
  ensureMerges(t);
  assert.equal(t.merges, undefined);
}

// ── resolveGridTableItem = MESMO objeto item (não clone/Proxy) ───────────────
// Clone: rows compartilhados + merges no fantasma → 2ª célula vazia mas editável.
{
  const b = {
    type: 'table-grid',
    fontSize: 12,
    items: [{ rows: [['H1', 'H2'], ['a', 'b'], ['c', 'd']], bg: '#FAFAFA' }],
  };
  ensureTableGrid(b);
  const it = b.items[0];
  const resolved = resolveGridTableItem(b, it);
  assert.equal(resolved, it, 'resolve devolve o item real');
  assert.equal(resolved.fontSize, 12, 'estilo shared copiado p/ build');
  assert.equal(resolved.bg, '#FAFAFA', 'cor por item');

  const n0 = it.rows.length;
  addTableRow(resolved, null);
  assert.equal(it.rows.length, n0 + 1, 'addRow grava no item');

  const cols0 = it.rows[0].length;
  addTableCol(resolved, null);
  assert.equal(it.rows[0].length, cols0 + 1, 'addCol grava no item');
  assert.ok(it.colWidths && it.colWidths.length === cols0 + 1, 'colWidths no item');

  const [row] = resolved.rows.splice(2, 1);
  resolved.rows.splice(1, 0, row);
  assert.equal(it.rows[1][0], 'c');
  assert.equal(it.rows[2][0], 'a');
}

// ── headerRow=false e merge no item → persistem após ensureTableGrid ──────────
{
  const b = {
    type: 'table-grid',
    items: [{ rows: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']] }],
  };
  ensureTableGrid(b);
  const it = b.items[0];
  const resolved = resolveGridTableItem(b, it);
  assert.equal(resolved, it);
  assert.equal(unwrapTableData(resolved), it);

  // API usada pelo painel / menu da alça
  setTableHeaderRow(resolved, false);
  assert.equal(it.headerRow, false, 'setTableHeaderRow grava no item');

  assert.equal(mergeCells(resolved, 0, 0, 0, 1), true);
  assert.ok(it.merges?.length === 1, 'merges no item');
  assert.deepEqual(it.merges[0], { r: 0, c: 0, cs: 2, rs: 1 });
  assert.equal(isCellCovered(it, 0, 1), true);
  assert.equal(it.rows[0][1], '', 'célula coberta limpa');

  // ciclo de render do diagramador
  ensureTableGrid(b);
  const again = resolveGridTableItem(b, b.items[0]);
  assert.equal(again.headerRow, false, 'header off sobrevive ensure+resolve');
  assert.equal(b.items[0].headerRow, false);
  assert.deepEqual(b.items[0].merges[0], { r: 0, c: 0, cs: 2, rs: 1 });
  assert.equal(isCellCovered(again, 0, 1), true);
  assert.equal(mergeOriginAt(again, 0, 0)?.cs, 2);

  // religar cabeçalho
  setTableHeaderRow(again, true);
  assert.equal(b.items[0].headerRow, undefined);
  setTableHeaderCol(again, true);
  assert.equal(b.items[0].headerCol, true);
  setTableHeaderCol(again, false);
  assert.equal(b.items[0].headerCol, undefined);
}

// ── merge “inteligente”: 1 célula → direita; range multi → como está ────────
{
  const t = { rows: [['A', 'B', 'C'], ['1', '2', '3']] };
  // 1 célula (0,0) → (0,0)-(0,1)
  assert.deepEqual(resolveMergeRange(t, { r0: 0, c0: 0, r1: 0, c1: 0 }), {
    r0: 0, c0: 0, r1: 0, c1: 1,
  });
  assert.equal(mergeSelectionOrNeighbor(t, { r0: 0, c0: 0, r1: 0, c1: 0 }), true);
  assert.deepEqual(t.merges[0], { r: 0, c: 0, cs: 2, rs: 1 });
  assert.equal(isCellCovered(t, 0, 1), true);
  // contrato Google Sheets: origem + cobertas; 1ª linha renderiza 2 células (span 2 + C)
  let visible = 0;
  for (let c = 0; c < 3; c++) if (!isCellCovered(t, 0, c)) visible++;
  assert.equal(visible, 2, 'linha com merge 2-col = 2 células visíveis');
  assert.equal(mergeOriginAt(t, 0, 0)?.cs, 2);

  // última col da linha: estende p/ baixo
  const t2 = { rows: [['A', 'B'], ['1', '2']] };
  assert.deepEqual(resolveMergeRange(t2, { r0: 0, c0: 1, r1: 0, c1: 1 }), {
    r0: 0, c0: 1, r1: 1, c1: 1,
  });

  // multi 2×2
  const t3 = { rows: [['A', 'B', 'C'], ['1', '2', '3']] };
  assert.deepEqual(resolveMergeRange(t3, { r0: 0, c0: 0, r1: 1, c1: 1 }), {
    r0: 0, c0: 0, r1: 1, c1: 1,
  });
  assert.equal(mergeSelectionOrNeighbor(t3, { r0: 0, c0: 0, r1: 1, c1: 1 }), true);
  assert.deepEqual(t3.merges[0], { r: 0, c: 0, cs: 2, rs: 2 });
  assert.equal(isCellCovered(t3, 1, 1), true);
  assert.equal(getMerges(t3).length, 1);
}

console.log('test-table-grid: ok');
