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
 */
import assert from 'node:assert/strict';
import {
  ensureTableGrid, tableGridEqualModeOf, tableGridGapOf, clampTableGridGap,
  setTableGridCols, layoutTableGridCols, seedTableItem,
  TABLE_GRID_MAX, TABLE_GRID_GAP,
} from './bloco-table-grid.js';
import {
  ensureTable, borderOuterOf, borderInnerOf, tableRadiusOf,
  tableAlignOf, tableValignOf, tableFontSizeOf, tableLineHeightOf,
  clampTableFontSize, clampTableLineHeight, normalizeTableAlign, normalizeTableValign,
  DEFAULT_BORDER_OUTER, DEFAULT_BORDER_INNER, DEFAULT_TABLE_RADIUS,
  DEFAULT_TABLE_FONT_SIZE, DEFAULT_TABLE_LINE_HEIGHT, DEFAULT_TABLE_ALIGN, DEFAULT_TABLE_VALIGN,
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
  const t = { rows: [['A'], ['1']], borderOuter: DEFAULT_BORDER_OUTER, borderInner: DEFAULT_BORDER_INNER, radius: 0 };
  ensureTable(t);
  assert.equal(t.borderOuter, undefined);
  assert.equal(t.borderInner, undefined);
  assert.equal(t.radius, undefined);
  assert.equal(borderOuterOf(t), DEFAULT_BORDER_OUTER);
  assert.equal(borderInnerOf(t), DEFAULT_BORDER_INNER);
  assert.equal(tableRadiusOf(t), DEFAULT_TABLE_RADIUS);
}

{
  const t = { rows: [['A'], ['1']], borderOuter: '#ff0000', borderInner: '#00ff00', radius: 8 };
  ensureTable(t);
  assert.equal(t.borderOuter, '#ff0000');
  assert.equal(t.borderInner, '#00ff00');
  assert.equal(t.radius, 8);
  assert.equal(clampTableRadius(100), 24);
  assert.equal(clampTableRadius(-1), 0);
}

// item do grid preserva rows custom
{
  const b = {
    type: 'table-grid',
    items: [{ rows: [['X', 'Y'], ['1', '2']], borderOuter: '#111' }],
  };
  ensureTableGrid(b);
  assert.equal(b.items.length, 1);
  assert.deepEqual(b.items[0].rows[0], ['X', 'Y']);
  assert.equal(b.items[0].borderOuter, '#111');
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
  };
  ensureTable(t);
  assert.equal(t.align, 'center');
  assert.equal(t.valign, 'middle');
  assert.equal(t.fontSize, 14);
  assert.equal(t.lineHeight, 1.5);
  assert.equal(normalizeTableAlign('bogus'), 'left');
  assert.equal(normalizeTableValign('bogus'), 'top');
  assert.equal(clampTableFontSize(100), 24);
  assert.equal(clampTableFontSize(2), 6);
  assert.equal(clampTableLineHeight(0.5), 1);
  assert.equal(clampTableLineHeight(9), 2.5);
}

console.log('test-table-grid: ok');
