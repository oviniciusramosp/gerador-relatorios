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
 * - focar célula do grid e o keep de seleção não reconhecer `__tg_<id>_i`
 *   (blur na hora → tabela parece não-editável)
 */
import assert from 'node:assert/strict';
import {
  ensureTableGrid, tableGridEqualModeOf, tableGridEqualRowsOf, tableGridGapOf,
  clampTableGridGap, setTableGridCols, layoutTableGridCols, seedTableItem,
  applyTableStylesToGrid, computeEqualRowHeights,
  TABLE_GRID_MAX, TABLE_GRID_GAP,
} from './bloco-table-grid.js';
import {
  ensureTable, resolveGridTableItem, mergeCells, unmergeCells, isCellCovered,
  tableWrapMatchesBlock,
  mergeOriginAt, ensureMerges, addTableRow, addTableCol,
  setTableHeaderRow, setTableHeaderCol, unwrapTableData,
  resolveMergeRange, mergeSelectionOrNeighbor, getMerges,
  borderOuterOf, borderInnerOf, tableBgOf, tableRadiusOf, tableBorderWidthOf,
  tableBorderWidthOuterOf, tableBorderWidthInnerOf, tableAltRowBgOf,
  cellAlignOf, cellValignOf, setCellAlign, setCellValign,
  rowPadYOf, setRowPadY, clampRowPadY,
  DEFAULT_ALT_ROW_BG, DEFAULT_ROW_PAD_Y, ROW_PAD_Y_MIN, ROW_PAD_Y_MAX,
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
  assert.equal(tableBorderWidthOuterOf(t), DEFAULT_BORDER_WIDTH);
  assert.equal(tableBorderWidthInnerOf(t), DEFAULT_BORDER_WIDTH);
  assert.equal(tableRadiusOf(t), DEFAULT_TABLE_RADIUS);
  assert.equal(tableAltRowBgOf(t), DEFAULT_ALT_ROW_BG);
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
  // legado borderWidth alimenta outer/inner quando os novos ausentes
  assert.equal(tableBorderWidthOuterOf(t), 2);
  assert.equal(tableBorderWidthInnerOf(t), 2);
  assert.equal(clampTableRadius(100), 24);
  assert.equal(clampTableRadius(-1), 0);
  assert.equal(clampTableBorderWidth(0.25), 0.5);
  assert.equal(clampTableBorderWidth(9), 4);
}

// espessuras outer/inner separadas; altColor
{
  const t = {
    rows: [['A'], ['1'], ['2']],
    borderWidthOuter: 2,
    borderWidthInner: 0.5,
    altRows: true,
    altColor: '#EEF2FF',
  };
  ensureTable(t);
  assert.equal(tableBorderWidthOuterOf(t), 2);
  assert.equal(tableBorderWidthInnerOf(t), 0.5);
  // legado não sobrescreve
  assert.equal(tableBorderWidthOf(t), DEFAULT_BORDER_WIDTH);
  assert.equal(tableAltRowBgOf(t), '#EEF2FF');
  // default alt limpa
  t.altColor = DEFAULT_ALT_ROW_BG;
  ensureTable(t);
  assert.equal(t.altColor, undefined);
  assert.equal(tableAltRowBgOf(t), DEFAULT_ALT_ROW_BG);
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

// ── alinhamento por célula: override fino; global como fallback ─────────────
{
  const t = { rows: [['A', 'B'], ['1', '2'], ['3', '4']] };
  ensureTable(t);
  assert.equal(cellAlignOf(t, 0, 0), DEFAULT_TABLE_ALIGN);
  setCellAlign(t, 1, 0, 'center');
  assert.equal(cellAlignOf(t, 1, 0), 'center');
  assert.equal(cellAlignOf(t, 0, 0), DEFAULT_TABLE_ALIGN, 'outras células seguem global');
  assert.equal(t.cellAlign['1,0'], 'center');
  // igual ao global → remove override
  setCellAlign(t, 1, 0, DEFAULT_TABLE_ALIGN);
  assert.equal(t.cellAlign, undefined);
  // global muda, célula com override não segue
  t.align = 'right';
  setCellAlign(t, 0, 1, 'center');
  assert.equal(cellAlignOf(t, 0, 1), 'center');
  assert.equal(cellAlignOf(t, 1, 1), 'right');
  // addRow empurra overrides
  setCellValign(t, 1, 0, 'middle');
  addTableRow(t, 1); // insere na linha 1; antiga 1 vira 2
  assert.equal(cellValignOf(t, 2, 0), 'middle');
  assert.equal(t.cellValign['1,0'], undefined);
  // merge descarta override da coberta
  setCellAlign(t, 0, 1, 'center');
  mergeCells(t, 0, 0, 0, 1);
  assert.equal(t.cellAlign && t.cellAlign['0,1'], undefined);
}

// ── padding vertical por linha (menu ⋯ da alça) ─────────────────────────────
// Sem este teste: slider salva default no JSON, insert/delete some o pad, clamp vaza.
{
  const t = { rows: [['A', 'B'], ['1', '2'], ['3', '4']] };
  ensureTable(t);
  assert.equal(rowPadYOf(t, 1), DEFAULT_ROW_PAD_Y);
  setRowPadY(t, 1, 16);
  assert.equal(rowPadYOf(t, 1), 16);
  assert.equal(t.rowPadY['1'], 16);
  assert.equal(rowPadYOf(t, 0), DEFAULT_ROW_PAD_Y, 'outras linhas no default');
  // default remove a chave
  setRowPadY(t, 1, DEFAULT_ROW_PAD_Y);
  assert.equal(t.rowPadY, undefined);
  // clamp
  assert.equal(clampRowPadY(0), ROW_PAD_Y_MIN);
  assert.equal(clampRowPadY(999), ROW_PAD_Y_MAX);
  setRowPadY(t, 1, 12);
  setRowPadY(t, 2, 20);
  // inserir linha empurra índices
  addTableRow(t, 1);
  assert.equal(rowPadYOf(t, 2), 12, 'pad da antiga L1 vira L2');
  assert.equal(rowPadYOf(t, 3), 20);
  assert.equal(t.rowPadY['1'], undefined);
}

// ── equalRows: rows alinhadas; última da menor preenche ─────────────────────
{
  // A: 10+20+30=60; B: 15+10 → target [15,20,30]=65; B last = 65-15 = 50
  const out = computeEqualRowHeights([[10, 20, 30], [15, 10]]);
  assert.deepEqual(out[0], [15, 20, 30]);
  assert.deepEqual(out[1], [15, 50]);
  // mesmas rows: max por índice
  assert.deepEqual(computeEqualRowHeights([[12, 8], [10, 14]]), [[12, 14], [12, 14]]);
  const b = { type: 'table-grid', equalRows: true, items: [seedTableItem(), seedTableItem()] };
  ensureTableGrid(b);
  assert.equal(tableGridEqualRowsOf(b), true);
  delete b.equalRows;
  ensureTableGrid(b);
  assert.equal(tableGridEqualRowsOf(b), false);
}

// ── applyTableStylesToGrid: cores da Tabela N → demais itens ────────────────
{
  const b = {
    type: 'table-grid',
    fontSize: 14,
    borderOuter: '#111111',
    items: [
      { rows: [['A', 'B'], ['1', '2']], bg: '#EEF2FF', headerColor: '#DDDDDD', color: '#112233', altRows: true, altColor: '#F0F0F0' },
      { rows: [['X', 'Y'], ['3', '4']], bg: '#FFFFFF' },
    ],
  };
  ensureTableGrid(b);
  assert.equal(applyTableStylesToGrid(b, 0), 1);
  assert.equal(b.items[1].bg, '#EEF2FF');
  assert.equal(b.items[1].headerColor, '#DDDDDD');
  assert.equal(b.items[1].color, '#112233');
  assert.equal(b.items[1].altRows, true);
  assert.equal(b.items[1].altColor, '#F0F0F0');
  // fonte/borda shared no bloco — inalteradas e já comuns
  assert.equal(b.fontSize, 14);
  assert.equal(b.borderOuter, '#111111');
  // estrutura da destino não é sobrescrita
  assert.deepEqual(b.items[1].rows[0], ['X', 'Y']);
  // 1 coluna no grid: nada a copiar
  const one = { type: 'table-grid', items: [{ rows: [['A'], ['1']], bg: '#abc' }] };
  ensureTableGrid(one);
  assert.equal(applyTableStylesToGrid(one, 0), 0);
}

// ── ensureTableGrid preserva a MESMA ref do item (merge no canvas não some) ─
{
  const b = { type: 'table-grid', items: [{ rows: [['A', 'B'], ['1', '2']] }] };
  ensureTableGrid(b);
  const ref = b.items[0];
  ref.merges = [{ r: 0, c: 0, cs: 2, rs: 1 }];
  ref.rows[0][1] = '';
  // openTableGridPanel / build chama ensure de novo — ref deve ser a mesma
  ensureTableGrid(b);
  assert.equal(b.items[0], ref, 'ensureTableGrid não troca a ref do item');
  assert.deepEqual(b.items[0].merges[0], { r: 0, c: 0, cs: 2, rs: 1 }, 'merges sobrevivem');
  assert.equal(b.items[0].rows[0][1], '', 'rows (shared) intactos');
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

// ── keep de seleção: grid usa id sintético `__tg_<gridId>_<i>` ──────────────
{
  assert.equal(tableWrapMatchesBlock({ dataset: { id: 't1' } }, 't1'), true);
  assert.equal(tableWrapMatchesBlock({ dataset: { id: 't1' } }, 't2'), false);
  assert.equal(tableWrapMatchesBlock(null, 't1'), false);
  // wrap do item no grid — closest('[data-id]') seria o próprio wrap (o bug)
  const gridItem = {
    dataset: { id: '__tg_g1_0' },
    closest: (sel) => (sel === '.tblgrid-wrap' ? { dataset: { id: 'g1' } } : { dataset: { id: '__tg_g1_0' } }),
  };
  assert.equal(tableWrapMatchesBlock(gridItem, 'g1'), true, 'prefixo __tg_<id>_ conta como o grid');
  assert.equal(tableWrapMatchesBlock(gridItem, 'g2'), false);
  // wrap sem id próprio, ancestral é o grid
  const nested = {
    dataset: {},
    closest: (sel) => (sel === '.tblgrid-wrap' ? { dataset: { id: 'g1' } } : null),
  };
  assert.equal(tableWrapMatchesBlock(nested, 'g1'), true);
}

console.log('test-table-grid: ok');
